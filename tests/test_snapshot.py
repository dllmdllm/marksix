import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / 'tools' / 'marksix_data.py'
spec = importlib.util.spec_from_file_location('marksix_data', MODULE)
data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(data)


def draw(no=1, date='2026-01-03+08:00', numbers=None):
    return {'year': 2026, 'no': no, 'drawDate': date, 'status': 'Result',
            'drawResult': {'drawnNo': numbers or [1, 2, 3, 4, 5, 6], 'xDrawnNo': 7}}


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.csv = Path(self.temp.name) / 'input.csv'
        self.output = Path(self.temp.name) / 'snapshot.json'

    def write(self, draws):
        data.write_csv(self.csv, [data.row_from_draw(d) for d in draws])

    def test_export_preserves_records_and_does_not_fetch(self):
        self.write([draw(2, '2026-01-06+08:00'), draw()])
        with patch.object(data, 'api_post', side_effect=AssertionError('network forbidden')):
            self.assertEqual(data.export_snapshot(self.csv, self.output), 2)
        payload = json.loads(self.output.read_text())
        self.assertEqual([d['no'] for d in payload['draws']], [1, 2])
        self.assertEqual(payload['lastDrawDate'], '2026-01-06')
        self.assertIsNone(payload['fetchedAt'])
        self.assertIsNone(payload['updatedAt'])
        self.assertFalse(payload['source']['acquisitionVerified'])
        self.assertEqual(payload['source']['name'], 'Unverified CSV input')
        self.assertEqual(payload['configuredSourceEndpoint'], data.API_URL)
        self.assertIsNotNone(payload['exportedAt'])

    def test_missing_input_does_not_replace_existing_snapshot(self):
        self.output.write_text('original')
        with self.assertRaises(ValueError):
            data.export_snapshot(self.csv, self.output)
        self.assertEqual(self.output.read_text(), 'original')

    def test_invalid_records_leave_output_untouched(self):
        bad_cases = [
            [draw(numbers=[1, 1, 2, 3, 4, 5])],
            [draw(numbers=[1, 2, 3, 4, 5, 50])],
            [draw(date='invalid')],
            [draw(), draw()],
            [draw(), draw(1, '2026-01-06+08:00')],
            [draw(), draw(2)],
            [{**draw(), 'status': 'Selling'}],
        ]
        for draws in bad_cases:
            with self.subTest(draws=draws):
                self.write(draws)
                self.output.write_text('original')
                with self.assertRaises(ValueError):
                    data.export_snapshot(self.csv, self.output)
                self.assertEqual(self.output.read_text(), 'original')


if __name__ == '__main__':
    unittest.main()
