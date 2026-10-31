# Robowski Studio – source parts

The app is published as ONE html file (so it opens anywhere, no server). The source is split here by job and glued by `build.py`.

    python3 build.py              # writes robowski-studio.html next to this file
    python3 build.py out.html

| Folder | What it holds |
|---|---|
| `index.template.html` | the page shell: title, fonts, `<div id="app">`, and where the parts go |
| `style/` | 01 colours and light/dark themes · 02 base elements and components · 03 screens and layout |
| `engine/` | the calculations, no screen code: 10 constants and combinations · 20 deck, tips, timing model · 30 flasks and `buildRun` · 40 Excel/CSV/zip export · 50 old-generator import · 60 auto-fix · 70 robot-file import · 80 export of `RobowskiCore` |
| `app/` | the screen: 10 state, storage, data · 20 triplet mode · 30 validation and `compute` · 40 views · 50 events · 60 file import/export, library, saving · 70 tooltips and start-up |

Parts are joined in file-name order, so keep the number prefixes. Each part starts and ends at a whole function, so a part can be edited on its own.

## Tests

`python3 tests/run.py` (from this folder) builds the page and runs `tests/suite.js` in headless Chromium
(needs Python Playwright). It covers volumes, dilution routing and thresholds, plate boundaries, seeded shuffle,
flask rounding, surface-height calibration, deck rules, CSV formula guard, manifest, workbook round trip and the
archive size limit. Run it after every change; it exits non-zero on any failure.


## Where to change what

| I want to... | Edit this |
|---|---|
| Change colours or dark mode | `style/01-tokens-and-themes.css` (change the variable in all three places) |
| Change a button, card, table or dialog look | `style/02-base-and-components.css` |
| Change layout, spacing, phone layout | `style/03-views-and-layout.css` |
| Change wording or arrangement of a screen | `app/40-views.js` (one `*View` function per screen) |
| Make a button do something new | add `data-act="name"` in `app/40-views.js`, handle it in `app/50-events.js` |
| Add a setting the user can type | `app/10-state-storage-data.js` (`exampleState`, `normalize`, `data()`), then the input in `app/40-views.js` |
| Change a calculation (dilution, flasks, thresholds) | `engine/30-flasks-and-build-run.js` (`buildRun`) |
| Change the robot Excel file | `engine/40-xlsx-csv-export.js` (`workbookSheets`). The lab checks this format, so test it |
| Change the notebook card picture | `engine/40-xlsx-csv-export.js` (`notebookCardSvg`) |
| Change bench sheet / stock CSV / deck CSV wording | `engine/45-bench-sheets.js` |
| Change deck defaults, tips, liquid heights, time model | `engine/20-deck-tips-and-timing.js` |
| Change the export file list and previews | `app/40-views.js` (`exportView`) and `app/60-import-export-files.js` (`openPreview`, `doDownload`) |
| Change triplet plate behaviour | `app/20-triplet-mode.js` |

Every source file starts with a comment saying what it contains, and the main functions have a one-line comment above them.
After any change: `python3 build.py robowski-studio.html`, then `python3 tests/run.py`.

Conventions: screens are built as HTML strings (template literals). Always wrap user text in `esc(...)` (page) or `xmlEsc(...)` (engine).
State lives in the global `S`; after changing it call `compute()` then `render()`. The engine never touches the page, so it can be tested alone.
Note: `.thumb` in `style/02` is no longer used (the run cards show condition lines now); it can be deleted.
