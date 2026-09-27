# دفتر — Daftar (Pharmacy Reports)

A browser-only (offline-capable) Arabic RTL app that turns pharmacy dispensing sheets (Excel/CSV) into ledger reports: movement, yearly inventory, balance, printed pages, drug groups, average prices, source rows and moving-average cost. It prints onto A4 ledger forms and exports to XLSX, ZIP or CSV. All data stays in the browser's IndexedDB.

## Build
`sh build.sh` builds a single file, `dist/daftar.html`, from `src/daftar.html`, `src/css/daftar.css` and `src/js/*.js` (joined in filename order). It then copies `xlsx.full.min.js`, `jszip.min.js` and the fonts into `dist/`.

`dev.html` is a **development harness only**. It loads the unbundled sources and has a `DEV_PRESET` demo hook. It is not part of the build.

## Structure
- `src/daftar.html`: the app shell, with the top bar, report rail and main view
- `src/css/daftar.css`: design tokens ("Lapis & Parchment" palette), components, print CSS
- `src/js/00–26`: modules on the `PH.*` namespace (config, normalize, store, reports, matrix, query, importer, viewTable, viewEntry, print, exportPlan, exporter, selftest, app)

## Entry points / shortcuts
- `?selftest=1`: runs the self-test on load
- Ctrl K opens the command palette. Ctrl F opens search. Alt 1–8 switches reports.
- Ctrl P prints, Ctrl E exports, Ctrl , opens settings, Ctrl Z/Y undo/redo, Ctrl D fills down in the grid.
- In the grid: arrow keys, Home/End, PgUp/PgDn, Enter to open or drill down, Esc.

## Storage
IndexedDB `daftar`, with stores: meta, sourceRows, settings, calibration, rawImport. localStorage holds `daftar-theme` and `daftar-last-report`.

## Not yet implemented / next steps
- Self-hosted woff2 fonts (smaller than ttf)
- Inline cell editing in the grid
- PWA manifest and service worker for installable offline use
