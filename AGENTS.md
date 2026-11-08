# Purchases app — project notes

Read this first when starting a new session.

## Why this exists

The user tracked purchases and clothes in an Obsidian vault
(`/run/media/bibek/New Volume/Price`) synced with the Remotely Save plugin.
Problems: sync conflicts (the DB Folder plugin rewrites `Daybook/Time.md`),
the whole vault (~427 MB) loads to use one table, mobile entry is awkward,
no photo compression, and search didn't work the way they wanted.
They use both trackers ~99% of the time on their phone.

Plan agreed with the user — build **two separate phone apps**, one at a time:

1. **Purchases** (this repo): DONE, in use on the phone (v17).
2. **Clothes**: v1 built and deployed (Nov 2026) in
   `/run/media/bibek/New Volume/clothes-app` — it has its own `AGENTS.md`.
3. **Migration** of old Obsidian data: purchases DONE; clothes LATER, after the
   clothes app is ready.

## Purchases app

- Live: https://bibek-maharjan.github.io/purchases-app/
- Repo: https://github.com/bibek-maharjan/purchases-app (GitHub Pages from `main`, root)
- GitHub account: **bibek-maharjan**. Never use `encore-media` (wrong account; an
  earlier copy there was deleted).

### Status at handoff (Nov 2026)

- Live version is **v17**: fixes Export (and the details view) for items with
  no photo. v16 (`da78a05`) was the bottom search bar, v15 (`6b0ca6d`) the fast
  batched import.
- Everything in this repo is committed; a new session should start clean.
- The user's phone had 1,295 items (1,031 thumbnails, 126 with 2+ photos) after
  the first migration import.
- **Pending on the phone:** import `purchases-photo-only.zip` (14 MB, in the
  migration folder) to add the 165 bills that were skipped for having no
  rate/Total. It brings the app to 1,460 items and touches nothing else. Tested
  in a browser: 1,295 → 1,460 in ~2 s, zero overlapping ids.

### Decisions (from the user)

- PWA, offline, **phone only**. No server, no sync. Data lives in IndexedDB.
- Backup = manual **Export/Import .zip** (in the ⋮ menu).
- Fields: photo, item name, rate, quantity (defaults to `1`), total, seller,
  notes (free text), date. Total and notes added in v12.
  Just a log, no price-history comparison.
- **Search**: split input on spaces; every word must appear (case-insensitive,
  part-of-word) somewhere across the item's fields, including the BS date text.
  `bla bhat` → "Black jacket" from bhatbhateni.
- **Photos**: full = 1280px JPEG q0.75 (user confirmed this is right — do not
  change); thumbnail = 240px q0.7 for the list, small gallery cards, and the form
  preview. Tapping a photo opens the full photo.
- **Dates**: BS (Bikram Sambat) first. The form shows Today / Yesterday / Custom
  buttons; Custom reveals BS Year/Month/Day dropdowns. The hint line shows
  `22 Kartik 2083 · AD 2026-11-08`. List shows BS with AD in brackets.
  Each item stores both `date` (AD, used for sorting) and `dateBS`.
  A 📅 button at the end of the BS row (`#adPicker`, native date input) picks
  an AD date and converts it into the BS dropdowns.
- **Views** (▦ button): List or Gallery. Gallery has one +/− control for 1–5
  columns (this also sets card size). Each view has its own show/hide checkboxes
  for photo, name, rate, quantity, total, seller, notes, BS date, and AD date. Saved in
  `localStorage` under the key `view`. Gallery at 1–2 columns loads the full photo
  so it stays sharp; at 3 or more columns it uses the thumbnail.
- **Taps on an item** (list and gallery): photo → full photo only; ✎ icon
  (top right) → editor; anywhere else on the card → read-only details dialog
  (`#details`: full photo + all fields, with Edit, Buy again, and Close buttons).
- **Adding a photo**: + opens the form directly (no auto camera). Photo buttons:
  Camera (`#cameraInput`, capture), Upload (`#uploadInput`), Paste (clipboard
  API, hidden if unsupported). Pasting with Ctrl+V / long-press also works while
  the form is open. All go through `usePhoto(file)`, which **adds** a photo.
- **Multiple photos** (v13): the editor shows a photo row (`#photoStrip`); ★
  makes a photo the cover (first), × removes it. The cover's thumbnail is
  `item.thumb`; `item.photoCount` drives the `📷 N` badge on list/gallery items.
  Tapping a photo, and the read-only view, show all photos stacked vertically.
- **Item name suggestions**: `#names` datalist, most-used names first
  (case-insensitive, `mostUsed()`). Seller uses a datalist too (alphabetical).
- **Auto-fill**: on a new item, picking a known name fills empty rate, seller,
  and quantity (quantity also when it's still the default `1`) from the latest
  purchase with that name. Never overwrites typed values; off when editing.
- **Buy again** (button in the read-only view): opens a new item with name,
  rate, quantity, total, seller, notes, and photo copied, date = today.
- **Layout (v16)**: no top header. A fixed bottom bar holds the search field
  (thumb reach) plus ▦ and ⋮; the + button floats just above it. `#count` sits
  at the very top. Body padding uses `env(safe-area-inset-*)`.

### Storage: why IndexedDB and not file paths

The user asked (Nov 2026) about storing photos as files on the phone and keeping
only a path in the database. **Not possible for a PWA**: a web app can't write to
a folder like `/DCIM/` and read it back by path. Desktop Chrome's folder-picker
API isn't on Android Chrome, where the user works ~99% of the time. Storing a
path would need a native Android app.

IndexedDB is the right home, and it is fine at this size:

- Android Chrome allows a large share of free disk (often GBs). Their whole
  migration is ~87 MB.
- Photos are stored as **Blobs** (raw binary), so they cost about what the JPEG
  pixels cost, not more.
- `navigator.storage.persist()` is called at startup (`app.js`, end of file), so
  Chrome marks the data **persistent** and won't evict it under storage pressure.
- The list/gallery only reads the small thumbnails; a full photo is read when
  opened.

The real risk is the user clearing site data or uninstalling the app — that is
what the Export .zip backup is for. Do not add a "storage used" line unless the
user asks.

### Backup / import behaviour

- Export writes `items.json` + `photos/<id>.jpg`, `<id>-2.jpg`, ... (store-only
  zip, no compression: `zip.js`).
- Import **replaces by id**, never duplicates, because ids are uuid5 of the
  vault note filename. It is not a merge: re-importing resets an item to what is
  in the zip, and items created in the app (random ids) are untouched.
- Import cost: read zip (~0.3 s), then 1,209 thumbnails + 1,295 saves. Batched
  since v15 (50 items per transaction, 8 thumbnails at a time) — 1,295 items went
  from ~40 s to ~7 s on desktop. A phone is several times slower.
- The button shows `Reading backup…` then `Importing 500 / 1295…`. If the user
  says it looks stuck, the cause is usually the read step on a slow phone, not a
  hang.

### Update history

- v1–v5: first version: list, search, editor, BS dates, photos, export/import.
- v6: List / Gallery views, 1–5 columns, show/hide fields per view.
- v7: ✎ edit icon; tapping the card opens the read-only details view.
- v8: + no longer opens the camera; photo via Camera / Upload / Paste.
- v9: item name suggestions (most used first).
- v10: auto-fill from the last purchase; Buy again button.
- v11: 📅 AD calendar picker that converts to BS.
- v12: Total and Notes fields (searchable, show/hide in views).
- v13: multiple photos per item (cover ★, remove ×, 📷 N badge).
- v14: import shows progress on the button ("Importing 350 / 1295…"); the file
  picker accepts `application/zip` too (some Android pickers grey out `.zip`).
- v15: import is much faster: `DB.saveMany()` writes 50 items in one IndexedDB
  transaction (was one transaction per item, ~8 s for 1,295 on desktop) and
  thumbnails are made 8 at a time with `mapLimit()` (the browser decodes on
  background threads). Full import of 1,295 items: ~40 s → ~7 s desktop.
- v16: the search field moved to a fixed bar at the bottom (thumb reach), with
  ▦ and ⋮ beside it, and the + button floating just above it. The top header is
  gone; `#count` sits at the very top and body padding uses safe-area insets.
  `sw.js` now deletes only its own old caches (`v<number>`), because the Clothes
  app shares the same website (`bibek-maharjan.github.io`) and its caches.
- v17: bug fix in `db.js` `run()`: for an item with no photo, `getPhotos()`
  returned the IndexedDB request object instead of `[]`, so Export hung at
  "Exporting…" and the details view of photo-less items didn't open.

### Files

No build step, plain HTML/CSS/JS.

- `index.html`: layout, view-settings dialog, editor dialog, read-only details
  dialog, menu dialog, photo viewer.
- `app.js`: list/gallery (renders 30 at a time on scroll), view settings,
  search, details + Buy again, editor (name suggestions, auto-fill, photo
  Camera/Upload/Paste), BS date picker + AD calendar, image resizing
  (`resize()`, `mapLimit()`), export/import (batched via `DB.saveMany`).
- `db.js`: IndexedDB `purchases` DB. Store `items` (text fields + `thumb` Blob),
  store `photos` (array of full Blobs keyed by item id, first = cover; old items
  hold a single Blob, `getPhotos()` always returns an array). `saveMany(list)`
  writes many items in one transaction (added v15 for import).
- `zip.js`: hand-written store-only ZIP writer/reader for backups.
  Backup layout: `items.json` + `photos/<id>.jpg` (cover), `photos/<id>-2.jpg`,
  `photos/<id>-3.jpg`, ... for extra photos.
- `nepali.js`: `nepali-datetime` v2.0.0 bundled as a global `NepaliDate`.
  Same library as `~/Projects/elec-tracker` (the user's reference for BS dates).
  Rebuilt from there with:
  `echo 'import N from "nepali-datetime"; window.NepaliDate = N;' | ./node_modules/.bin/esbuild --bundle --minify --format=iife --outfile=<this>/nepali.js`
- `sw.js`: cache-first service worker. **Bump `VERSION` on every change**
  (now `v16`), or phones keep the old version. The user must close and reopen
  the app twice to get updates.
- `style.css`: all styling. The search bar is `#searchBar`, fixed to the bottom.
- `manifest.json`, `icon-192.png`, `icon-512.png`.
- `purchases-flow.mmd`: Mermaid diagram of the app flow. View it with
  `mmaid purchases-flow.mmd`. Keep it updated when the flow changes.

Item shape: `{ id, created, name, rate, quantity, total, seller, notes, date, dateBS, thumb, photoCount }`.

### Deploy

**Only when the user asks.** Never commit, push, or deploy on your own, even
after finishing and testing a change. Also don't start building new
features or apps unless the user asks. Finish the change, test it locally,
then tell the user it's ready and wait.

```
git commit -am "..." && git push
```

Pages rebuilds in about a minute. Check with
`gh api repos/bibek-maharjan/purchases-app/pages/builds/latest`.

### Testing notes

- Local server: `python3 -m http.server 8931` in this folder.
  Port 8765 is taken by another app of the user.
- The Playwright browser blocks file uploads (`setInputFiles` times out, even on
  a hidden input) and stops at dialogs. Two workarounds that worked (v15/v16):
  - **Files**: copy the zip into this folder, then inside the page
    `fetch('test-import.zip')`, wrap it in a `File`, set `#importFile.files`
    with a `DataTransfer`, and dispatch `change`. Delete the copy afterwards.
  - **Dialogs**: override `window.confirm`/`window.alert` inside the page before
    dispatching the event. Stale `page.on('dialog')` handlers from earlier runs
    keep auto-dismissing, and `browser_handle_dialog` then reports "no modal
    state" / "already handled". Closing the browser and starting fresh helps.
- Use one script per run: a second `evaluate` on the same page after a
  navigation hits "Execution context was destroyed".
- Unregister the service worker and clear caches before testing, or you test
  stale files.
- Sparse test data is not enough for UI checks: importing their real migration
  zip gives 1,295 items, 1,031 thumbnails, 126 multi-photo items.
- Camera and compression on a real phone can only be tested by the user.

## Clothes app (next)

Agreed so far: a separate PWA with the same approach (offline, export/import,
same search and photo handling). Fields come from the vault's
`notion/clothes.base`: photo, name, type, color, shade, position, context,
season, newness, where, price, size, brand, other, set. Fields use
**pick-lists with "add new value"**. Confirm details with the user before building.

Notes for that session (from the Purchases build — reuse, don't reinvent):

- New repo, separate Pages site. GitHub account `bibek-maharjan` only.
- Copy as-is or nearly: `zip.js`, `db.js` (rename the DB to `clothes`), `sw.js`,
  `manifest.json`, icons, and the `nepali.js` rebuild command. No build step.
- Reuse from `app.js` (this repo): `resize()`, `mapLimit()`, thumbnails
  (240px q0.7) and full photos (1280px q0.75), the BS date logic + 📅 AD picker,
  the bottom search bar layout (v16), the batched import (`DB.saveMany`), and the
  read-only details dialog.
- Keep the same rules: search splits on spaces and needs every word; export is a
  manual .zip; bump `sw.js` `VERSION` on every change; don't deploy until asked.
- The clothes tracker in the vault (`notion/clothes.base`, 63 notes) is the only
  clothes data; migration of it is a separate later step.

## Migration (later)

Old data: about 1,490 notes in `Daybook/` (frontmatter `rate`, `seller`,
`quantity`, `aliases` = item name; `photo:: ![[image]]` in the body; date from
the filename, e.g. `2026-11-08 08.14.32.md`) and 63 notes in `notion/`.
Plan: a script that turns them into an import .zip
(`items.json` + `photos/<id>.jpg` / `<id>-2.jpg` ..., compressed to 1280px).

**Purchases migration script (done, Nov 2026):**
`/run/media/bibek/New Volume/purchases-migration/migrate_daybook.py` (outside
this repo). Run `python3 migrate_daybook.py` there (~13 s); it writes two zips
and `migration-report.txt`:

- `purchases-migration.zip` (~101 MB) — everything, 1,460 items.
- `purchases-photo-only.zip` (~14 MB) — **only** the 165 items kept just because
  they have a photo (bills with no rate/Total). Nothing in it is also in the
  first zip, so importing it adds those items and leaves the rest untouched.
  This is the one the user imported on 2026-11-08 (1,295 → 1,460, ~2 s).

Item IDs are uuid5 of the note filename, so re-importing replaces instead of
duplicating. BS dates come from the elec-tracker `nepali-datetime` via node.
Current numbers: 1,493 notes read, 1,460 items (174 named "bill", 22 Unnamed,
165 kept only for a photo, 138 with 2+ photos), 1,389 photos, 33 notes skipped.

**Purchases migration rules (agreed with the user).** The vault is never
changed; the script just skips junk. Only `Daybook/` is migrated.

- Skip: notes with no rate, no `Total` **and no photo**; completely empty
  notes; `Time.md` and its conflict copy; images not linked from any note;
  duplicate image copies; broken links (missing files, PDFs, videos).
- Bills (alias `bill`): always keep, even without a price (items are written
  on the bill photo). Notes with seller + `Total` but no name also count as bills.
- **Rule change (Nov 2026):** a note with no rate and no `Total` but *with a
  photo* is kept too, under the name the user wrote (rate and total stay empty);
  with no name it becomes "bill". The user spotted a skipped bill ("Upvc
  aluminum", sitapaila, 2025-10-29) and asked for these. This brought back 165
  items (157 named + 8 unnamed), which is what `purchases-photo-only.zip` holds.
- No name but has a rate → name "Unnamed".
- Several aliases → join with commas (`refrigerator, fridge`).
- Several photos → keep all, in note order (first = cover). Zip names
  `<id>.jpg`, `<id>-2.jpg`, ... (app supports this since v13).
- `quantity` → app Quantity; `Total` → app **Total** field (v12).
  `description` and `department` → app **Notes** field, e.g.
  `khaksi 40 golo · plumbing`. `during` is almost always empty → dropped.
- Read typo keys too: `rate:`, `description:` (extra colon), and `name:` when
  `aliases` is missing.
- Survey numbers (Nov 2026): 1,493 notes, 314 with no rate/Total, 145 bills,
  58 no name, 138 several names, 141 several photos, 237 unlinked images
  (53 MB), 370 duplicate image copies, 15 broken links.

## User preferences

- Explain simply, one solution, small digestible chunks.
- Ask before big decisions; build one thing at a time.
