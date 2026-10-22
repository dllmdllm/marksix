#!/usr/bin/env python3
import argparse
import csv
import json
import gzip
import os
import re
import shutil
import fcntl
import sys
import threading
import time
import tempfile
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from http.server import BaseHTTPRequestHandler, HTTPServer

API_URL = "https://info.cld.hkjc.com/graphql/base/"
HK = timezone(timedelta(hours=8))
DATE_PATTERN = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}(?:\+08:00|T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2}))?$")
ALLOWED_ORIGINS = {"https://dllmdllm.github.io", "http://127.0.0.1:8000", "http://localhost:8000"}
_locks = {}
_locks_guard = threading.Lock()

DRAW_FRAGMENT = """fragment lotteryDrawsFragment on LotteryDraw {
    id
    year
    no
    openDate
    closeDate
    drawDate
    status
    snowballCode
    snowballName_en
    snowballName_ch
    lotteryPool {
      sell
      status
      totalInvestment
      jackpot
      unitBet
      estimatedPrize
      derivedFirstPrizeDiv
      lotteryPrizes {
        type
        winningUnit
        dividend
      }
    }
    drawResult {
      drawnNo
      xDrawnNo
    }
  }"""

QUERY = f"""{DRAW_FRAGMENT}

        query marksixResult($lastNDraw: Int, $startDate: String, $endDate: String, $drawType: LotteryDrawType) {{
            lotteryDraws(lastNDraw: $lastNDraw, startDate: $startDate, endDate: $endDate, drawType: $drawType) {{
              ...lotteryDrawsFragment
            }}
        }}
    """

FIELDNAMES = [
    "year",
    "no",
    "drawDate",
    "closeDate",
    "openDate",
    "status",
    "snowballCode",
    "snowballName_ch",
    "poolSell",
    "poolTotalInvestment",
    "poolJackpot",
    "poolEstimatedPrize",
    "poolDerivedFirstPrizeDiv",
    "drawn1",
    "drawn2",
    "drawn3",
    "drawn4",
    "drawn5",
    "drawn6",
    "special"
]


def api_post(variables):
    payload = json.dumps(
        {
            "query": QUERY,
            "variables": variables,
            "operationName": "marksixResult"
        }
    ).encode("utf-8")
    req = Request(
        API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-apollo-operation-name": "marksixResult",
            "apollo-require-preflight": "true",
            "Accept": "application/json",
            "Origin": "https://bet.hkjc.com",
            "Referer": "https://bet.hkjc.com/",
            "User-Agent": "Mozilla/5.0"
        }
    )
    with urlopen(req, timeout=30) as resp:
        raw = resp.read()
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        data = json.loads(raw.decode("utf-8"))
        if data.get("errors"):
            raise RuntimeError(data["errors"])
        return data


def parse_date(value):
    """Draw dates are calendar dates, with a strict shared browser grammar."""
    if not isinstance(value, str) or not DATE_PATTERN.fullmatch(value):
        return None
    try:
        day = date.fromisoformat(value[:10])
        if "T" in value:
            clock = [int(part) for part in value[11:19].split(":")]
            offset = re.search(r"[+-]([0-9]{2}):([0-9]{2})$", value)
            if clock[0] > 23 or clock[1] > 59 or clock[2] > 59 or (offset and (int(offset[1]) > 23 or int(offset[2]) > 59)):
                return None
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        return day
    except ValueError:
        return None


def positive_integer(value, maximum=9007199254740991):
    if type(value) is int:
        number = value
    elif isinstance(value, str) and re.fullmatch(r"[0-9]+", value):
        number = int(value)
    else:
        raise ValueError("Expected a positive decimal integer")
    if not 1 <= number <= maximum:
        raise ValueError("Integer out of range")
    return number


def validate_draw(draw):
    if not isinstance(draw, dict) or draw.get("status") != "Result":
        raise ValueError("Expected a completed Result draw")
    year = positive_integer(draw.get("year"), 9999)
    no = positive_integer(draw.get("no"))
    day = parse_date(draw.get("drawDate"))
    if day is None or day.year != year or day > datetime.now(HK).date():
        raise ValueError("Invalid, mismatched or future completed draw date")
    numbers = draw.get("numbers")
    if not isinstance(numbers, list) or len(numbers) != 6:
        raise ValueError("Expected exactly six main balls")
    balls = [positive_integer(n, 49) for n in [*numbers, draw.get("special")]]
    if len(set(balls)) != 7:
        raise ValueError("Expected seven distinct balls")
    return {**draw, "year": year, "no": no, "drawDate": day.isoformat(),
            "numbers": balls[:6], "special": balls[6]}


def validate_raw_draw(draw):
    if not isinstance(draw, dict) or not isinstance(draw.get("drawResult"), dict):
        raise ValueError("Missing draw result")
    result = draw["drawResult"]
    normalized = validate_draw({**draw, "numbers": result.get("drawnNo"),
                                "special": result.get("xDrawnNo")})
    return {**normalized, "drawResult": {"drawnNo": normalized["numbers"],
                                           "xDrawnNo": normalized["special"]}}


def to_num(value):
    if value is None:
        return ""
    try:
        return str(int(value)).zfill(2)
    except (TypeError, ValueError):
        return ""


def draw_key(draw):
    return (str(draw.get("year", "")), str(draw.get("no", "")))


def row_from_draw(draw):
    result = draw.get("drawResult") or {}
    numbers = result.get("drawnNo") or []
    numbers = [to_num(n) for n in numbers]
    while len(numbers) < 6:
        numbers.append("")
    pool = draw.get("lotteryPool") or {}
    row = {
        "year": draw.get("year", ""),
        "no": draw.get("no", ""),
        "drawDate": draw.get("drawDate", "") or "",
        "closeDate": draw.get("closeDate", "") or "",
        "openDate": draw.get("openDate", "") or "",
        "status": draw.get("status", "") or "",
        "snowballCode": draw.get("snowballCode", "") or "",
        "snowballName_ch": draw.get("snowballName_ch", "") or "",
        "poolSell": pool.get("sell", "") or "",
        "poolTotalInvestment": pool.get("totalInvestment", ""),
        "poolJackpot": pool.get("jackpot", ""),
        "poolEstimatedPrize": pool.get("estimatedPrize", ""),
        "poolDerivedFirstPrizeDiv": pool.get("derivedFirstPrizeDiv", ""),
        "drawn1": numbers[0],
        "drawn2": numbers[1],
        "drawn3": numbers[2],
        "drawn4": numbers[3],
        "drawn5": numbers[4],
        "drawn6": numbers[5],
        "special": to_num(result.get("xDrawnNo"))
    }
    return row


def fetch_draws(start_date=None, end_date=None):
    variables = {"drawType": "All"}
    if start_date:
        variables["startDate"] = start_date
    if end_date:
        variables["endDate"] = end_date
    data = api_post(variables)
    draws = data.get("data", {}).get("lotteryDraws", []) or []
    result = []
    for draw in draws:
        if draw.get("status") != "Result":
            continue
        if not (draw.get("drawResult") or {}).get("drawnNo"):
            continue
        result.append(draw)
    return result


def load_existing(path):
    rows = []
    keys = set()
    if not path.exists():
        return rows, keys
    with path.open("r", newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        for row in reader:
            rows.append(row)
            keys.add((row.get("year", ""), row.get("no", "")))
    return rows, keys


def sort_rows(rows):
    def key(row):
        dt = parse_date(row.get("drawDate", "")) or date.min
        return (dt, str(row.get("year", "")), str(row.get("no", "")))

    rows.sort(key=key)
    return rows


@contextmanager
def csv_transaction(path):
    """One lock across the entire merge; flock also serializes CLI processes."""
    path = Path(path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    with _locks_guard:
        lock = _locks.setdefault(str(path), threading.RLock())
    with lock, path.with_suffix(path.suffix + ".lock").open("a") as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            yield path
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)


def _write_csv_atomic(path, rows):
    temporary = None
    backup = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", newline="", encoding="utf-8",
                                         dir=path.parent, delete=False) as file:
            temporary = Path(file.name)
            writer = csv.DictWriter(file, fieldnames=FIELDNAMES)
            writer.writeheader()
            writer.writerows(rows)
            file.flush()
            os.fsync(file.fileno())
        if path.exists():
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as file:
                backup = Path(file.name)
            shutil.copyfile(path, backup)
            backup.replace(path.with_suffix(path.suffix + ".bak"))
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        if backup is not None:
            backup.unlink(missing_ok=True)


def write_csv(path, rows):
    with csv_transaction(path) as locked_path:
        _write_csv_atomic(locked_path, rows)


def import_draws(path, draws):
    if not isinstance(draws, list):
        raise ValueError("draws must be a list")
    # Validate the whole batch before lossy conversion or any persistence.
    incoming = [validate_raw_draw(draw) for draw in draws]
    with csv_transaction(path) as locked_path:
        existing = csv_to_json_rows(locked_path)
        rows, _ = load_existing(locked_path)
        keys = {draw_key(draw): draw for draw in existing}
        dates = {draw["drawDate"] for draw in existing}
        appended = 0
        for draw in incoming:
            key = draw_key(draw)
            if key in keys:
                old = keys[key]
                if any(old[field] != draw[field] for field in ("drawDate", "numbers", "special")):
                    raise ValueError(f"Conflicting existing draw: {key}; reconcile manually")
                continue
            if draw["drawDate"] in dates:
                raise ValueError("Duplicate completed draw date")
            keys[key] = draw
            dates.add(draw["drawDate"])
            rows.append(row_from_draw(draw))
            appended += 1
        if appended:
            _write_csv_atomic(locked_path, sort_rows(rows))
        return appended, len(rows)

def format_api_date(value):
    if isinstance(value, datetime):
        return value.strftime("%Y%m%d")
    if isinstance(value, date):
        return value.strftime("%Y%m%d")
    return str(value)


def download_all(path, start_year, end_year):
    all_draws = []
    window_days = 90
    for year in range(start_year, end_year + 1):
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)
        current = start_date
        while current <= end_date:
            window_end = min(current + timedelta(days=window_days - 1), end_date)
            draws = fetch_draws(
                format_api_date(current),
                format_api_date(window_end)
            )
            all_draws.extend(draws)
            current = window_end + timedelta(days=1)
    import_draws(path, all_draws)


def update_csv(path):
    rows, keys = load_existing(path)
    last_date = None
    for row in rows:
        dt = parse_date(row.get("drawDate", ""))
        if dt and (last_date is None or dt > last_date):
            last_date = dt
    if last_date is None:
        last_date = date(1993, 1, 1)
    start_date = format_api_date(last_date - timedelta(days=14))
    end_date = format_api_date(datetime.now(HK).date() + timedelta(days=7))
    draws = fetch_draws(start_date, end_date)
    # Reload under the transaction after the network request, preserving other writers.
    appended, _ = import_draws(path, draws)
    return appended


def csv_to_json_rows(path):
    rows, _ = load_existing(path)
    output = []
    for row in rows:
        numbers = []
        for i in range(1, 7):
            value = row.get(f"drawn{i}", "")
            if value:
                numbers.append(positive_integer(value, 49))
        special = row.get("special", "")
        output.append(
            {
                "year": positive_integer(row.get("year"), 9999),
                "no": positive_integer(row.get("no")),
                "drawDate": row.get("drawDate", ""),
                "closeDate": row.get("closeDate", ""),
                "openDate": row.get("openDate", ""),
                "status": row.get("status", ""),
                "snowballCode": row.get("snowballCode", ""),
                "snowballName_ch": row.get("snowballName_ch", ""),
                "poolSell": row.get("poolSell", ""),
                "poolTotalInvestment": row.get("poolTotalInvestment", ""),
                "poolJackpot": row.get("poolJackpot", ""),
                "poolEstimatedPrize": row.get("poolEstimatedPrize", ""),
                "poolDerivedFirstPrizeDiv": row.get("poolDerivedFirstPrizeDiv", ""),
                "numbers": numbers,
                "special": positive_integer(special, 49) if special else None
            }
        )
    validated = [validate_draw(draw) for draw in output]
    if len({draw_key(draw) for draw in validated}) != len(validated) or len({draw["drawDate"] for draw in validated}) != len(validated):
        raise ValueError("Duplicate draw ID or date")
    return validated


def export_snapshot(csv_path, output_path):
    """Validate and export existing CSV records; never fetch or invent results."""
    draws = csv_to_json_rows(csv_path)
    if not draws:
        raise ValueError("CSV has no draws; run init/update with a verified source first")
    keys = set()
    dates = set()
    for draw in draws:
        numbers = [*draw["numbers"], draw["special"]]
        key = draw_key(draw)
        draw_date = parse_date(draw["drawDate"])
        if (draw["status"] != "Result" or len(numbers) != 7
                or any(type(n) is not int or not 1 <= n <= 49 for n in numbers)
                or len(set(numbers)) != 7 or draw_date is None
                or draw["year"] <= 0 or draw["no"] <= 0):
            raise ValueError(f"Invalid completed draw: {key}")
        if key in keys or draw_date in dates:
            raise ValueError(f"Duplicate draw: {key}")
        keys.add(key)
        dates.add(draw_date)
    draws.sort(key=lambda draw: parse_date(draw["drawDate"]))
    payload = {
        "schemaVersion": 1,
        "source": {"name": "Unverified CSV input", "acquisitionVerified": False},
        "configuredSourceEndpoint": API_URL,
        "fetchedAt": None,
        "updatedAt": None,
        "exportedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "lastDrawDate": draws[-1]["drawDate"][:10],
        "total": len(draws),
        "draws": draws
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8",
                                         dir=output_path.parent, delete=False) as file:
            temporary_path = Path(file.name)
            json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))
            file.write("\n")
        temporary_path.replace(output_path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return len(draws)


def create_server(path, port):
    """Read-only loopback API. Mutations are available only through the CLI."""
    csv_path = path

    class Handler(BaseHTTPRequestHandler):
        def _send(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            origin = self.headers.get("Origin")
            if origin in ALLOWED_ORIGINS:
                self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _allowed(self):
            origin = self.headers.get("Origin")
            host = self.headers.get("Host")
            allowed_hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
            if host not in allowed_hosts or (origin is not None and origin not in ALLOWED_ORIGINS):
                self._send(403, {"error": "Origin or Host not allowed"})
                return False
            return True

        def do_OPTIONS(self):
            if not self._allowed():
                return
            if self.path != "/api/marksix":
                self._send(404, {"error": "Not Found"})
                return
            self._send(204, {})

        def do_GET(self):
            if not self._allowed():
                return
            if self.path == "/api/marksix":
                try:
                    rows = csv_to_json_rows(csv_path)
                except (ValueError, OSError) as exc:
                    self._send(422, {"error": str(exc)})
                    return
                payload = {
                    "updatedAt": None,
                    "fetchedAt": None,
                    "servedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "fileModifiedAt": datetime.fromtimestamp(csv_path.stat().st_mtime, timezone.utc).isoformat(timespec="seconds") if csv_path.exists() else None,
                    "total": len(rows),
                    "draws": rows
                }
                self._send(200, payload)
                return
            self._send(404, {"error": "Not Found"})

        def do_POST(self):
            if not self._allowed():
                return
            # Never read a mutation body, regardless of type, size, auth or path.
            self._send(405, {"error": "Read-only API; update CSV with the CLI"})

        def log_message(self, *_):
            return

    return HTTPServer(("127.0.0.1", port), Handler)


def serve_api(path, port, auto_update=False, interval_hours=24):
    csv_path = path
    server = create_server(csv_path, port)

    if auto_update:
        def loop():
            while True:
                try:
                    appended = update_csv(csv_path)
                    print(f"[{datetime.now().isoformat(timespec='seconds')}] Auto update: +{appended}")
                except Exception as exc:
                    print(f"[{datetime.now().isoformat(timespec='seconds')}] Auto update failed: {exc}")
                time.sleep(max(1, int(interval_hours * 3600)))

        thread = threading.Thread(target=loop, daemon=True)
        thread.start()

    print(f"Serving http://127.0.0.1:{port}/api/marksix (CSV: {csv_path})")
    server.serve_forever()


def main():
    base_dir = Path(__file__).resolve().parents[1]
    default_csv = base_dir / "data" / "marksix.csv"

    parser = argparse.ArgumentParser(description="Mark Six data sync")
    sub = parser.add_subparsers(dest="command")

    init_cmd = sub.add_parser("init", help="download all draws into CSV")
    init_cmd.add_argument("--output", default=str(default_csv))
    init_cmd.add_argument("--start-year", type=int, default=1993)
    init_cmd.add_argument("--end-year", type=int, default=date.today().year)

    snapshot_cmd = sub.add_parser("snapshot", help="validate CSV and export the static JSON snapshot (no network)")
    snapshot_cmd.add_argument("--input", default=str(default_csv))
    snapshot_cmd.add_argument("--output", default=str(base_dir / "data" / "marksix.json"))

    update_cmd = sub.add_parser("update", help="append new draws into CSV")
    update_cmd.add_argument("--output", default=str(default_csv))

    serve_cmd = sub.add_parser("serve", help="serve local API from CSV")
    serve_cmd.add_argument("--output", default=str(default_csv))
    serve_cmd.add_argument("--port", type=int, default=5177)
    serve_cmd.add_argument("--auto-update", action="store_true")
    serve_cmd.add_argument("--interval-hours", type=int, default=24)

    args = parser.parse_args()
    if args.command == "init":
        path = Path(args.output)
        download_all(path, args.start_year, args.end_year)
        return 0
    if args.command == "update":
        path = Path(args.output)
        appended = update_csv(path)
        print(f"Appended {appended} rows.")
        return 0
    if args.command == "snapshot":
        try:
            total = export_snapshot(Path(args.input), Path(args.output))
        except (ValueError, OSError) as exc:
            print(f"Snapshot not written: {exc}", file=sys.stderr)
            return 1
        print(f"Exported {total} validated draws to {args.output} (no live fetch).")
        return 0
    if args.command == "serve":
        path = Path(args.output)
        serve_api(path, args.port, args.auto_update, args.interval_hours)
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
