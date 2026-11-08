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

1. **Purchases** (this repo): DONE, in use.
2. **Clothes**: NOT STARTED. Build only after the user says Purchases is finished.
3. **Migration** of old Obsidian data: LATER, after both apps are ready.

## Purchases app

- Live: https://bibek-maharjan.github.io/purchases-app/
- Repo: https://github.com/bibek-maharjan/purchases-app (GitHub Pages from `main`, root)
- GitHub account: **bibek-maharjan**. Never use `encore-media` (wrong account; an
  earlier copy there was deleted).

### Decisions (from the user)

- PWA, offline, **phone only**. No server, no sync. Data lives in IndexedDB.
- Backup = manual **Export/Import .zip** (in the ⋮ menu).
- Fields: photo, item name, rate, quantity (defaults to `1`), seller, date.
  Just a log, no price-history comparison.
- **Search**: split input on spaces; every word must appear (case-insensitive,
  part-of-word) somewhere across the item's fields, including the BS date text.
  `bla bhat` → "Black jacket" from bhatbhateni.
- **Photos**: full = 1280px JPEG q0.75 (user confirmed this is right — do not
  change); thumbnail = 240px q0.7 for the list and the form preview. Tapping the
  list thumbnail opens the full photo.
- **Dates**: BS (Bikram Sambat) first. The form shows Today / Yesterday / Custom
  buttons; Custom reveals BS Year/Month/Day dropdowns. The hint line shows
  `22 Kartik 2083 · AD 2026-11-08`. List shows BS with AD in brackets.
  Each item stores both `date` (AD, used for sorting) and `dateBS`.

### Files

No build step, plain HTML/CSS/JS.

- `index.html`: layout, editor dialog, menu dialog, photo viewer.
- `app.js`: list (renders 30 at a time on scroll), search, editor, BS date
  picker, image resizing, export/import.
- `db.js`: IndexedDB `purchases` DB. Store `items` (text fields + `thumb` Blob),
  store `photos` (full Blob keyed by item id).
- `zip.js`: hand-written store-only ZIP writer/reader for backups.
  Backup layout: `items.json` + `photos/<id>.jpg`.
- `nepali.js`: `nepali-datetime` v2.0.0 bundled as a global `NepaliDate`.
  Same library as `~/Projects/elec-tracker` (the user's reference for BS dates).
  Rebuilt from there with:
  `echo 'import N from "nepali-datetime"; window.NepaliDate = N;' | ./node_modules/.bin/esbuild --bundle --minify --format=iife --outfile=<this>/nepali.js`
- `sw.js`: cache-first service worker. **Bump `VERSION` on every change**
  (now `v5`), or phones keep the old version. The user must close and reopen
  the app twice to get updates.
- `manifest.json`, `icon-192.png`, `icon-512.png`.

Item shape: `{ id, created, name, rate, quantity, seller, date, dateBS, thumb }`.

### Deploy

```
git commit -am "..." && git push
```

Pages rebuilds in about a minute. Check with
`gh api repos/bibek-maharjan/purchases-app/pages/builds/latest`.

### Testing notes

- Local server: `python3 -m http.server 8931` in this folder.
  Port 8765 is taken by another app of the user.
- The Playwright browser blocks file uploads and stops at dialogs. Feed photos
  by fetching an image inside the page and setting `input.files` with a
  `DataTransfer`, and stub `HTMLInputElement.prototype.click` so the camera
  doesn't auto-open. Unregister the service worker and clear caches before
  testing, or you'll test stale files.
- Camera and compression on a real phone can only be tested by the user.

## Clothes app (next)

Agreed so far: a separate PWA with the same approach (offline, export/import,
same search and photo handling). Fields come from the vault's
`notion/clothes.base`: photo, name, type, color, shade, position, context,
season, newness, where, price, size, brand, other, set. Fields use
**pick-lists with "add new value"**. Confirm details with the user before building.

## Migration (later)

Old data: about 1,490 notes in `Daybook/` (frontmatter `rate`, `seller`,
`quantity`, `aliases` = item name; `photo:: ![[image]]` in the body; date from
the filename, e.g. `2026-11-08 08.14.32.md`) and 63 notes in `notion/`.
Plan: a script that turns them into an import .zip
(`items.json` + `photos/<id>.jpg`, compressed to 1280px).

## User preferences

- Explain simply, one solution, small digestible chunks.
- Ask before big decisions; build one thing at a time.
