# Mark Six Lab /六合彩號碼篩選器

Static HTML/CSS/JavaScript filter for six-number selections from 1–49. Filters select combinations; historical frequencies and automatic banker suggestions do **not** establish a predictive advantage or improved winning odds.

## Run and test

No package installation is required. Serve this directory over HTTP using an installed static server, for example `python3 -m http.server 8000 --bind 127.0.0.1`, then open the local page. Opening the page requests public HKJC draw information and reads historical analysis; it does not write to a local CSV or schedule synchronization. The optional local service is not supplied by GitHub Pages and is normally unavailable on a phone.

Run the offline regression suites:

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The JavaScript suite loads the actual functions/event handlers in a synthetic DOM with startup/network calls disabled. It covers ordering, independent small-pool enumeration, generation, selected history, request races, actual sync click payloads, Hong Kong formatting across viewer timezones, hero states, count cancellation, validation and data-source failures. Python tests use temporary CSVs, process/thread barriers, simulated replacement failures and ephemeral loopback HTTP servers; they never use the default real CSV. The suites are not a browser or accessibility conformance test.

`.github/workflows/offline-tests.yml` runs both deterministic suites for pushes to `main` and pull requests. The existing Pages publication source is `main` at `/`; its automatic legacy Pages build runs independently. This workflow does not configure required checks, branch protection or Pages settings. Enforcing a CI dependency before merge/deployment requires a separately authorized repository-setting change. Live source checks remain separate from the offline gate.

## Data sources and freshness

- Current/history selection requests use the public endpoint configured in `app.js`.
- Cold/hot and repeat statistics first try `http://127.0.0.1:5177/api/marksix`. Empty or invalid local data falls back to `data/marksix.json`.
- The bundled snapshot remains unchanged: 4,289 completed draws, **1993-01-05 through 2026-01-03**. Original acquisition time/provenance has not been independently verified. No newly fetched results are included in this patch.
- The page shows which source was used and the latest draw date. Request time, file modification time and export time are not treated as acquisition time or proof of current results.
- A permanent notice labels the bundled records as archival, not current rankings. Automatic suggestions and frequency tables show the actual sample size, source and start/end dates. They stop when analysis is unavailable or candidate counts are equal; their numeric tie-breaker is not statistical evidence.
- “載入最近 100 期（本頁）” requests the public endpoint explicitly and replaces only the in-memory analysis sample. It validates the complete returned sample, retains prior data on failure, and does not update the CSV or published snapshot. “重讀歷史資料” restores the local/snapshot source. Endpoint responses are not independent official-result reconciliation.
- The repeat table includes main and special numbers on both sides and compares each draw to the union of the preceding N draws. It pools historical formats/eras. Cold/hot counts use main numbers only. These are descriptive statistics, not forecasts.
- Draw dates retain their calendar date. Closing times explicitly use `Asia/Hong_Kong`, regardless of the viewer's device timezone. Investment, jackpot and estimated prize are separate values; a zero investment is preserved, and ordinary/snowball plus completed/upcoming states are labelled separately.

## Optional CSV update and snapshot publication

The following are manual operational instructions, not a claim these network operations have been run or verified for the current endpoint:

1. Keep the current JSON and CSV backed up. Inspect `tools/marksix_data.py` and confirm the public endpoint is still the intended official source.
2. To initialize a CSV from the source, run `python3 tools/marksix_data.py init --output /path/to/marksix.csv`. For an existing CSV, run `python3 tools/marksix_data.py update --output /path/to/marksix.csv`. These commands make public data requests; failures, truncation and completeness must be checked. Both preserve existing records and append validated new IDs. Conflicting existing IDs/dates abort the batch for manual reconciliation rather than silently overwriting corrections. The full merge uses a per-path thread lock and POSIX file lock, same-directory atomic replacement and a previous `.csv.bak` recovery copy. Keep the `.csv.lock` file in place while writers may run; only writers using this tool participate in its lock protocol. Use a local filesystem on macOS/Linux; network filesystem locking and Windows are not supported/tested.
3. Verify the maximum draw date and draw IDs against official published results. Reconcile gaps, duplicates, corrected records, historical number ranges and sample counts; retain evidence of acquisition time/source. Do not publish fabricated or merely inferred results.
4. Export the verified CSV to a **candidate** snapshot offline:

   ```sh
   python3 tools/marksix_data.py snapshot --input /path/to/marksix.csv --output /path/to/candidate.json
   ```

   This validates completed draws, seven distinct integers in 1–49, positive decimal draw IDs, strict dates, matching year/date and no future completed dates (Hong Kong today), plus duplicate IDs/dates before atomically replacing the output. Python and browser share date fixtures: `YYYY-MM-DD`, legacy `YYYY-MM-DD+08:00`, or an ISO timestamp with seconds and an explicit timezone (optional 1–6 fractional digits). Persisted/exported draw dates are canonical `YYYY-MM-DD`. It does not call the network or establish provenance. `source` explicitly says unverified CSV; `configuredSourceEndpoint` only records tool configuration. `exportedAt` is export time; `fetchedAt` remains unknown.
5. Inspect the candidate diff, verify the final draw and counts, run tests, then copy the approved candidate to `data/marksix.json` in a separate reviewed change. The bundled-blob integrity fixture in the test suite deliberately pins the current snapshot; update its expected SHA/count/cutoff only after independently validating a replacement.
6. Review/approve the repository change and production release separately. CSV synchronization does not publish a website snapshot.

For the optional local API: `python3 tools/marksix_data.py serve --output /path/to/marksix.csv --port 5177`. It binds only to `127.0.0.1`, serves exactly `GET /api/marksix`, and allows browser reads only from `https://dllmdllm.github.io`, `http://127.0.0.1:8000` and `http://localhost:8000`. It validates Host/Origin, and rejects every POST before reading the body, regardless of authorization, content type, size or import-path suffix. There is no HTTP write endpoint and no credential setup. Existing `--auto-update` remains opt-in and uses the same safe CLI merge. No new schedule or persistent service is installed by this patch.

## Filtering behavior

- The selected history period controls visible historical draws; changing it clears bankers/suggestions so prior selections cannot silently survive a different window. Failed or out-of-order responses cannot restore stale history.
- Automatic bankers come only from those visible completed draws, including special numbers. Select at least one loaded period and load a valid analysis window with differing candidate counts. Their hot/cold ranking uses the separately disclosed historical-analysis source and is a convenience rule with no predictive advantage.
- In banker/drag mode, all bankers are required. If any drag numbers are chosen, remaining numbers come from that drag pool. Drag quantity means the size of the chosen drag pool, not how many drag numbers each six-number combination uses.
- `最多連續幾個號碼` means maximum permitted consecutive run. Exact counting and generation use sorted pools.
- Explicit Generate always rerolls; changing output quantity regenerates. Results are unique. For at most 50,000 raw candidates, generation checks every candidate and randomly selects different valid sets; if fewer than requested exist, it reports and lists all of them. Larger candidate spaces use up to 20,000 sampling attempts with deduplication.
- Large-space generation can stop early on rare valid combinations; the message distinguishes sampling exhaustion from mathematical impossibility. Broad filter edits generate small samples without exhaustive counting. “精確計算” explicitly starts a cancellable count, displays visited-branch progress and reuses the last matching result. Small spaces already enumerated during generation report their exact total directly. The result summary distinguishes requested, produced unique, and exactly counted available combinations.
- Big/small and odd/even are complementary exact targets. Editing either side updates the opposite side; clearing either clears the pair. Contradictory category totals, banker conflicts and safe category-based sum bounds are checked before generation. Only full enumeration/counting or a proven constraint conflict is described as no solution.
- The active-condition summary includes history exclusion, all bankers, drag-pool selection/target, exact category counts (including inferred values), sum, consecutive, tail and number-range restrictions. “手選膽拖” preserves the former include-mode behavior; it does not automatically require historical overlap. With no selected drags, remaining numbers use all eligible non-banker numbers.

## Workspace navigation

Choose numbers, filters and results are separate retained views; history has its own view. Switching tabs preserves selections and expanded controls. Advanced filters and reference lists are disclosed on demand. The mobile action mirrors the current count and delegates to the existing generator; measured bottom spacing reserves its height. Keyboard navigation and state transitions have synthetic DOM coverage. Physical-device visual QA remains pending.
