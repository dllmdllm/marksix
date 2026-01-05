#!/usr/bin/env python3
import argparse
import csv
import json
import sys
import threading
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from http.server import BaseHTTPRequestHandler, HTTPServer

API_URL = "https://info.cld.hkjc.com/graphql/base/"

DRAW_FRAGMENT = """fragment lotteryDrawsFragment on LotteryDraw {
  id
  year
  no
  openDate
  closeDate
  drawDate
  status
  snowballCode
  snowballName_ch
  lotteryPool {
    sell
    totalInvestment
    jackpot
    estimatedPrize
    derivedFirstPrizeDiv
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
    req = Request(API_URL, data=payload, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d").date()
        except ValueError:
            return None


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
        "poolTotalInvestment": pool.get("totalInvestment", "") or "",
        "poolJackpot": pool.get("jackpot", "") or "",
        "poolEstimatedPrize": pool.get("estimatedPrize", "") or "",
        "poolDerivedFirstPrizeDiv": pool.get("derivedFirstPrizeDiv", "") or "",
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


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def download_all(path, start_year, end_year):
    rows = []
    keys = set()
    for year in range(start_year, end_year + 1):
        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"
        draws = fetch_draws(start_date, end_date)
        for draw in draws:
            key = draw_key(draw)
            if key in keys:
                continue
            keys.add(key)
            rows.append(row_from_draw(draw))
    sort_rows(rows)
    write_csv(path, rows)


def update_csv(path):
    rows, keys = load_existing(path)
    last_date = None
    for row in rows:
        dt = parse_date(row.get("drawDate", ""))
        if dt and (last_date is None or dt > last_date):
            last_date = dt
    if last_date is None:
        last_date = date(1993, 1, 1)
    start_date = (last_date - timedelta(days=14)).strftime("%Y-%m-%d")
    end_date = (date.today() + timedelta(days=7)).strftime("%Y-%m-%d")
    draws = fetch_draws(start_date, end_date)
    appended = 0
    for draw in draws:
        key = draw_key(draw)
        if key in keys:
            continue
        keys.add(key)
        rows.append(row_from_draw(draw))
        appended += 1
    sort_rows(rows)
    write_csv(path, rows)
    return appended


def csv_to_json_rows(path):
    rows, _ = load_existing(path)
    output = []
    for row in rows:
        numbers = []
        for i in range(1, 7):
            value = row.get(f"drawn{i}", "")
            if value:
                numbers.append(int(value))
        special = row.get("special", "")
        output.append(
            {
                "year": int(row.get("year") or 0),
                "no": int(row.get("no") or 0),
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
                "special": int(special) if special else None
            }
        )
    return output


def serve_api(path, port, auto_update=False, interval_hours=24):
    csv_path = path

    class Handler(BaseHTTPRequestHandler):
        def _send(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self):
            if self.path.startswith("/api/marksix"):
                rows = csv_to_json_rows(csv_path)
                payload = {
                    "updatedAt": datetime.now().isoformat(timespec="seconds"),
                    "total": len(rows),
                    "draws": rows
                }
                self._send(200, payload)
                return
            self._send(404, {"error": "Not Found"})

        def log_message(self, *_):
            return

    server = HTTPServer(("127.0.0.1", port), Handler)

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
    if args.command == "serve":
        path = Path(args.output)
        serve_api(path, args.port, args.auto_update, args.interval_hours)
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
