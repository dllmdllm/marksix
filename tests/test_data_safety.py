import copy
import http.client
import json
import multiprocessing
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

import test_snapshot as fixtures

data, draw = fixtures.data, fixtures.draw


def process_import(path, ready, item):
    if not ready.wait(5):
        raise RuntimeError('start barrier timed out')
    data.import_draws(Path(path), [item])


class CsvFixture:
    setUp = fixtures.SnapshotTests.setUp
    write = fixtures.SnapshotTests.write


class DataSafetyTests(CsvFixture, unittest.TestCase):
    def test_shared_date_grammar_and_canonical_export(self):
        cases = json.loads((MODULE_ROOT / 'tests/date-cases.json').read_text())
        for item in cases:
            actual = data.parse_date(item['value'])
            self.assertEqual(actual.isoformat() if actual else None, item['date'], item)
        self.write([draw()])
        data.export_snapshot(self.csv, self.output)
        self.assertEqual(json.loads(self.output.read_text())['draws'][0]['drawDate'], '2026-01-03')

    def test_invalid_batches_never_change_csv(self):
        self.write([draw()])
        before = self.csv.read_bytes()
        cases = [None, [], {**draw(), 'status': 'Selling'},
                 {**draw(), 'year': False}, {**draw(), 'no': 1.5},
                 {**draw(), 'no': '1.0'}, {**draw(), 'year': 2099},
                 draw(date='2099-01-03'), draw(date='2026-01-03garbage'),
                 draw(numbers=[1, 2, 3, 4, 5, 6, 8]),
                 draw(numbers=[True, 2, 3, 4, 5, 6]),
                 draw(numbers=[1.9, 2, 3, 4, 5, 6]),
                 draw(numbers=[1, 1, 3, 4, 5, 6]),
                 draw(numbers=[1, 2, 3, 4, 5, 50])]
        for item in cases:
            with self.subTest(item=item), self.assertRaises(ValueError):
                data.import_draws(self.csv, [draw(2, '2026-01-06'), item])
            self.assertEqual(self.csv.read_bytes(), before)

    def test_decimal_aliases_merge_and_conflicting_ids_dates_are_rejected(self):
        alias = copy.deepcopy(draw())
        alias.update(year='02026', no='01')
        alias['drawResult'] = {'drawnNo': ['01', '02', '03', '04', '05', '06'], 'xDrawnNo': '07'}
        self.assertEqual(data.import_draws(self.csv, [alias, draw()]), (1, 1))
        before = self.csv.read_bytes()
        self.assertEqual(data.import_draws(self.csv, [draw()]), (0, 1))
        for bad in [draw(1, '2026-01-06'), draw(2), draw(numbers=[8, 9, 10, 11, 12, 13])]:
            with self.assertRaises(ValueError):
                data.import_draws(self.csv, [bad])
            self.assertEqual(self.csv.read_bytes(), before)

    def test_invalid_existing_csv_is_not_laundered_by_import(self):
        for row in [{**data.row_from_draw(draw()), 'drawn1': '1.0'},
                    {**data.row_from_draw(draw()), 'drawDate': '2026-01-03+08:00+garbage'},
                    {**data.row_from_draw(draw()), 'year': '2099'}]:
            data.write_csv(self.csv, [row])
            before = self.csv.read_bytes()
            with self.assertRaises(ValueError):
                data.import_draws(self.csv, [draw(2, '2026-01-06')])
            self.assertEqual(self.csv.read_bytes(), before)

    def test_update_reloads_after_fetch_and_preserves_an_overlapping_import(self):
        self.write([draw()])
        fetched, resume = threading.Event(), threading.Event()
        errors = []
        def fetch(*_):
            fetched.set()
            if not resume.wait(5):
                raise RuntimeError('fetch barrier timed out')
            return [draw(3, '2026-01-09')]
        def update():
            try:
                data.update_csv(self.csv)
            except Exception as exc:
                errors.append(exc)
        with patch.object(data, 'fetch_draws', side_effect=fetch):
            worker = threading.Thread(target=update)
            worker.start()
            self.assertTrue(fetched.wait(5))
            try:
                data.import_draws(self.csv, [draw(2, '2026-01-06')])
            finally:
                resume.set()
                worker.join(5)
        self.assertFalse(worker.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual([d['no'] for d in data.csv_to_json_rows(self.csv)], [1, 2, 3])

    def test_separate_process_writers_keep_the_union(self):
        self.write([draw()])
        context = multiprocessing.get_context('spawn')
        ready = context.Event()
        workers = [context.Process(target=process_import, args=(str(self.csv), ready, item))
                   for item in [draw(2, '2026-01-06'), draw(3, '2026-01-09')]]
        for worker in workers:
            worker.start()
        ready.set()
        for worker in workers:
            worker.join(10)
            if worker.is_alive():
                worker.terminate()
                worker.join()
                self.fail('writer timed out')
            self.assertEqual(worker.exitcode, 0)
        self.assertEqual([d['no'] for d in data.csv_to_json_rows(self.csv)], [1, 2, 3])

    def test_atomic_reads_failure_and_recovery_copy(self):
        self.write([draw()])
        original = self.csv.read_bytes()
        real_replace = Path.replace
        def interrupted(source, destination):
            if destination == self.csv.resolve():
                raise OSError('simulated interruption before replacement')
            return real_replace(source, destination)
        with patch.object(Path, 'replace', interrupted), self.assertRaises(OSError):
            data.import_draws(self.csv, [draw(2, '2026-01-06')])
        self.assertEqual(self.csv.read_bytes(), original)
        self.assertEqual(self.csv.with_suffix('.csv.bak').read_bytes(), original)
        observed = []
        def observe_then_replace(source, destination):
            if destination == self.csv.resolve():
                observed.append(len(data.csv_to_json_rows(self.csv)))
            return real_replace(source, destination)
        with patch.object(Path, 'replace', observe_then_replace):
            data.import_draws(self.csv, [draw(2, '2026-01-06')])
        self.assertEqual(observed, [1])
        self.assertEqual(len(data.csv_to_json_rows(self.csv)), 2)
        self.assertEqual(self.csv.with_suffix('.csv.bak').read_bytes(), original)


MODULE_ROOT = Path(__file__).resolve().parents[1]


class ReadOnlyApiTests(CsvFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.write([draw()])
        self.before = self.csv.read_bytes()
        self.server = data.create_server(self.csv, 0)
        self.worker = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': 0.02}, daemon=True)
        self.worker.start()
        self.addCleanup(self.close_server)

    def close_server(self):
        self.server.shutdown()
        self.worker.join(5)
        self.server.server_close()

    def request(self, method='GET', path='/api/marksix', headers=None, body=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_allowlisted_reads_and_exact_paths(self):
        status, headers, body = self.request(headers={'Origin': 'https://dllmdllm.github.io'})
        self.assertEqual(status, 200)
        self.assertEqual(headers['Access-Control-Allow-Origin'], 'https://dllmdllm.github.io')
        self.assertEqual(json.loads(body)['total'], 1)
        self.assertEqual(self.request(path='/api/marksix/import')[0], 404)
        self.assertEqual(self.request(path='/api/marksix-extra')[0], 404)
        self.assertEqual(self.request(headers={'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.request(headers={'Origin': 'https://evil.example'})[0], 403)

    def test_all_http_imports_fail_without_reading_or_mutating_csv(self):
        for headers in [{}, {'Authorization': 'Bearer invalid'}, {'Content-Type': 'text/plain'},
                        {'Origin': 'null'}, {'Origin': 'https://evil.example'},
                        {'Origin': 'https://dllmdllm.github.io', 'Content-Type': 'application/json'},
                        {'Content-Length': '1000000000'}]:
            for path in ['/api/marksix/import', '/api/marksix/import/alias']:
                status, response_headers, _ = self.request('POST', path, headers)
                self.assertIn(status, (403, 405))
                self.assertNotEqual(response_headers.get('Access-Control-Allow-Origin'), '*')
                self.assertEqual(self.csv.read_bytes(), self.before)
        self.assertEqual(self.request('OPTIONS', '/api/marksix/import')[0], 404)
        self.assertEqual(self.request('OPTIONS', headers={'Origin': 'https://evil.example'})[0], 403)

    def test_get_during_replacement_sees_complete_old_then_new_csv(self):
        real_replace = Path.replace
        observed = []
        def get_before_replace(source, destination):
            if destination == self.csv.resolve():
                status, _, body = self.request()
                observed.append((status, json.loads(body)['total']))
            return real_replace(source, destination)
        with patch.object(Path, 'replace', get_before_replace):
            data.import_draws(self.csv, [draw(2, '2026-01-06')])
        self.assertEqual(observed, [(200, 1)])
        self.assertEqual(json.loads(self.request()[2])['total'], 2)


if __name__ == '__main__':
    unittest.main()
