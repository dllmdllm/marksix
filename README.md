# Mark Six Lab /六合彩號碼篩選器

Static HTML/CSS/JavaScript filter for six-number selections from 1–49. Filters select combinations; historical frequencies and automatic banker suggestions do **not** establish a predictive advantage or improved winning odds.

## Run and test

No package installation is required. Serve this directory over HTTP using an installed static server, for example `python3 -m http.server 8000 --bind 127.0.0.1`, then open the local page. Opening the normal page retains its existing behavior: it requests public HKJC information and attempts to synchronize to the optional local CSV service. The local service is not supplied by GitHub Pages and is normally unavailable on a phone.

Run the offline regression suites:

```sh
node --test tests/app.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The JavaScript suite loads the actual functions/event handlers in a synthetic DOM with startup/network calls disabled. It covers ordering, independent small-pool enumeration, generation, selected history, request races, validation and data-source failures. It is not a browser or accessibility conformance test.

## Data sources and freshness

- Current/history selection requests use the public endpoint configured in `app.js`.
- Cold/hot and repeat statistics first try `http://127.0.0.1:5177/api/marksix`. Empty or invalid local data falls back to `data/marksix.json`.
- The bundled snapshot remains unchanged: 4,289 completed draws, **1993-01-05 through 2026-01-03**. Original acquisition time/provenance has not been independently verified. No newly fetched results are included in this patch.
- The page shows which source was used and the latest draw date. Request time, file modification time and export time are not treated as acquisition time or proof of current results.
- The repeat table includes main and special numbers on both sides and compares each draw to the union of the preceding N draws. It pools historical formats/eras. Cold/hot counts use main numbers only. These are descriptive statistics, not forecasts.

## Optional CSV update and snapshot publication

The following are manual operational instructions, not a claim these network operations have been run or verified for the current endpoint:

1. Keep the current JSON and CSV backed up. Inspect `tools/marksix_data.py` and confirm the public endpoint is still the intended official source.
2. To initialize a CSV from the source, run `python3 tools/marksix_data.py init --output /path/to/marksix.csv`. For an existing CSV, run `python3 tools/marksix_data.py update --output /path/to/marksix.csv`. These commands make public data requests; failures, truncation and completeness must be checked. They append new IDs and do not repair existing draw corrections.
3. Verify the maximum draw date and draw IDs against official published results. Reconcile gaps, duplicates, corrected records, historical number ranges and sample counts; retain evidence of acquisition time/source. Do not publish fabricated or merely inferred results.
4. Export the verified CSV to a **candidate** snapshot offline:

   ```sh
   python3 tools/marksix_data.py snapshot --input /path/to/marksix.csv --output /path/to/candidate.json
   ```

   This validates completed draws, seven distinct integers in 1–49, positive draw IDs, valid dates and duplicate IDs/dates before atomically replacing the output. It does not call the network or establish provenance. `source` explicitly says unverified CSV; `configuredSourceEndpoint` only records tool configuration. `exportedAt` is export time; `fetchedAt` remains unknown.
5. Inspect the candidate diff, verify the final draw and counts, run tests, then copy the approved candidate to `data/marksix.json` in a separate reviewed change. The bundled-blob integrity fixture in the test suite deliberately pins the current snapshot; update its expected SHA/count/cutoff only after independently validating a replacement.
6. Review/approve the repository change and production release separately. CSV synchronization does not publish a website snapshot.

For the optional local API: `python3 tools/marksix_data.py serve --output /path/to/marksix.csv --port 5177`. Existing `--auto-update` is opt-in. This loopback service currently has broad CORS and unauthenticated import; do not treat it as a hardened server or expose it externally. The page's existing sync controls require this local service. No new schedule or persistent service is installed by this patch.

## Filtering behavior

- The selected history period controls visible historical draws; changing it clears bankers/suggestions so prior selections cannot silently survive a different window. Failed or out-of-order responses cannot restore stale history.
- Automatic bankers come only from those visible completed draws, including special numbers. Select at least one loaded period. Their hot/cold ranking uses the separately disclosed historical-analysis source and is a convenience rule.
- In banker/drag mode, all bankers are required. If any drag numbers are chosen, remaining numbers come from that drag pool. Drag quantity means the size of the chosen drag pool, not how many drag numbers each six-number combination uses.
- `最多連續幾個號碼` means maximum permitted consecutive run. Exact counting and generation use sorted pools.
- Explicit Generate always rerolls; changing output quantity regenerates. Results are unique. For at most 50,000 raw candidates, generation checks every candidate and randomly selects different valid sets; if fewer than requested exist, it reports and lists all of them. Larger candidate spaces use up to 20,000 sampling attempts with deduplication.
- Large-space generation can stop early on rare valid combinations; the message distinguishes sampling exhaustion from mathematical impossibility. Exact counting may be slow for broad filters on mobile. The result summary distinguishes requested, produced unique, and exactly counted available combinations.
- Big/small and odd/even are complementary exact targets. Editing either side updates the opposite side; clearing either clears the pair. Contradictory category totals, banker conflicts and safe category-based sum bounds are checked before generation. Only full enumeration/counting or a proven constraint conflict is described as no solution.
- The active-condition summary includes history exclusion, all bankers, drag-pool selection/target, exact category counts (including inferred values), sum, consecutive, tail and number-range restrictions. “手選膽拖” preserves the former include-mode behavior; it does not automatically require historical overlap. With no selected drags, remaining numbers use all eligible non-banker numbers.
