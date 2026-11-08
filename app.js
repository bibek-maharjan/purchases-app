const $ = s => document.querySelector(s);
const PAGE = 30;

let items = [];      // all items, newest first
let results = [];    // items matching the search
let shown = 0;       // how many results are rendered
let editing = null;  // item being edited, or null for new
let newPhoto = null; // { full, thumb } picked in the editor
const thumbUrls = new Map();

// ---------- Images ----------
async function resize(file, maxSide, quality) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
}

function thumbUrl(item) {
  if (!item.thumb) return '';
  if (!thumbUrls.has(item.id)) thumbUrls.set(item.id, URL.createObjectURL(item.thumb));
  return thumbUrls.get(item.id);
}

// ---------- Search ----------
// Every word typed must appear (as part of a word) in some field.
function matches(item, words) {
  const text = [item.name, item.seller, item.quantity, item.rate, item.date, formatBS(item.dateBS)]
    .join(' ').toLowerCase();
  return words.every(w => text.includes(w));
}

function search() {
  const words = $('#search').value.toLowerCase().split(/\s+/).filter(Boolean);
  results = words.length ? items.filter(i => matches(i, words)) : items;
  $('#count').textContent = `${results.length} of ${items.length}`;
  $('#list').replaceChildren();
  shown = 0;
  renderMore();
}

// ---------- List ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
}

// ---------- View settings (list / gallery) ----------
const PROPS = [
  ['photo', 'Photo'], ['name', 'Item name'], ['rate', 'Rate'], ['quantity', 'Quantity'],
  ['seller', 'Seller'], ['dateBS', 'Date (BS)'], ['date', 'Date (AD)'],
];
const allOn = () => Object.fromEntries(PROPS.map(([k]) => [k, true]));
let view = { mode: 'list', cols: 2, list: allOn(), gallery: allOn() };
try { Object.assign(view, JSON.parse(localStorage.getItem('view'))); } catch {}

function saveView() {
  localStorage.setItem('view', JSON.stringify(view));
  applyView();
  search();
}

function applyView() {
  const gallery = view.mode === 'gallery';
  $('#list').className = gallery ? 'gallery' : '';
  $('#list').style.setProperty('--cols', view.cols);
  for (const b of document.querySelectorAll('.seg button')) {
    b.classList.toggle('active', b.dataset.mode === view.mode);
  }
  $('#colsRow').hidden = !gallery;
  $('#colsLabel').textContent = `${view.cols} column${view.cols > 1 ? 's' : ''}`;
  const on = view[view.mode];
  $('#propList').replaceChildren(...PROPS.map(([key, label]) => {
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" ${on[key] !== false ? 'checked' : ''}> ${label}`;
    l.querySelector('input').onchange = e => { on[key] = e.target.checked; saveView(); };
    return l;
  }));
}

for (const b of document.querySelectorAll('.seg button')) {
  b.onclick = () => { view.mode = b.dataset.mode; saveView(); };
}
$('#colsMinus').onclick = () => { view.cols = Math.max(1, view.cols - 1); saveView(); };
$('#colsPlus').onclick = () => { view.cols = Math.min(5, view.cols + 1); saveView(); };
$('#viewBtn').onclick = () => $('#viewMenu').showModal();
$('#closeView').onclick = () => $('#viewMenu').close();

// Big gallery cards use the full photo so they stay sharp.
const fullUrls = new Map();
async function setFullPhoto(img, item) {
  if (!fullUrls.has(item.id)) {
    const blob = await DB.getPhoto(item.id);
    if (!blob) return;
    fullUrls.set(item.id, URL.createObjectURL(blob));
  }
  img.src = fullUrls.get(item.id);
}

function itemHtml(item, on) {
  const show = k => on[k] !== false;
  const hasRate = show('rate') && item.rate !== '' && item.rate != null;
  const parts = [
    hasRate && `<span class="rate">Rs ${esc(item.rate)}</span>`,
    show('quantity') && item.quantity && esc(item.quantity),
    show('seller') && item.seller && esc(item.seller),
  ].filter(Boolean);
  const dates = [
    show('dateBS') && esc(formatBS(item.dateBS)),
    show('date') && item.date && (show('dateBS') ? `<small>(${esc(item.date)})</small>` : esc(item.date)),
  ].filter(Boolean);
  return (show('name') ? `<div class="name">${esc(item.name)}</div>` : '')
    + (parts.length ? `<div class="meta">${parts.join(' · ')}</div>` : '')
    + (dates.length ? `<div class="meta">${dates.join(' ')}</div>` : '');
}

function renderMore() {
  const gallery = view.mode === 'gallery';
  const on = view[view.mode];
  const frag = document.createDocumentFragment();
  for (const item of results.slice(shown, shown + PAGE)) {
    const el = document.createElement('div');
    el.className = gallery ? 'card' : 'item';
    el.innerHTML = `
      ${on.photo !== false ? `<img src="${thumbUrl(item)}" alt="" loading="lazy">` : ''}
      <div class="info">${itemHtml(item, on)}</div>
      <button class="edit-btn" aria-label="Edit">✎</button>`;
    const img = el.querySelector('img');
    if (img) {
      img.onclick = e => { e.stopPropagation(); viewPhoto(item); };
      if (gallery && view.cols <= 2 && item.thumb) setFullPhoto(img, item);
    }
    el.querySelector('.edit-btn').onclick = e => { e.stopPropagation(); openEditor(item); };
    el.onclick = () => showDetails(item);
    frag.append(el);
  }
  shown += PAGE;
  $('#list').append(frag);
}

new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && shown < results.length) renderMore();
}, { rootMargin: '600px' }).observe($('#sentinel'));

// Read-only card: full photo and every field.
let detailsItem = null;
async function showDetails(item) {
  detailsItem = item;
  const img = $('#detailsImg');
  img.hidden = !item.thumb;
  img.src = thumbUrl(item);
  if (item.thumb) setFullPhoto(img, item);
  $('#detailsInfo').innerHTML = itemHtml(item, allOn());
  $('#details').showModal();
}
$('#detailsImg').onclick = () => viewPhoto(detailsItem);
$('#detailsClose').onclick = () => $('#details').close();
$('#detailsEdit').onclick = () => { $('#details').close(); openEditor(detailsItem); };

// New item copied from an old one (photo too), dated today.
$('#detailsAgain').onclick = async () => {
  const old = detailsItem;
  $('#details').close();
  openEditor(null);
  const f = $('#form');
  f.title.value = old.name;
  f.rate.value = old.rate ?? '';
  f.quantity.value = old.quantity ?? '';
  f.seller.value = old.seller ?? '';
  if (old.thumb) {
    setPreview(thumbUrl(old));
    newPhoto = { full: await DB.getPhoto(old.id), thumb: old.thumb };
  }
};

async function viewPhoto(item) {
  const blob = await DB.getPhoto(item.id);
  if (!blob) return;
  $('#viewerImg').src = URL.createObjectURL(blob);
  $('#viewer').showModal();
}
$('#viewer').onclick = () => {
  $('#viewer').close();
  URL.revokeObjectURL($('#viewerImg').src);
};

// ---------- Dates (BS) ----------
const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Asoj',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
];

function today() {
  return new NepaliDate().formatEnglishDate('YYYY-MM-DD');
}

// 'YYYY-MM-DD' AD -> 'YYYY-MM-DD' BS
function adToBS(ad) {
  const [y, m, d] = ad.split('-').map(Number);
  return NepaliDate.fromEnglishDate(y, m - 1, d).format('YYYY-MM-DD');
}

// 'YYYY-MM-DD' BS -> '22 Kartik 2083'
function formatBS(bs) {
  if (!bs) return '';
  const [y, m, d] = bs.split('-').map(Number);
  return `${d} ${BS_MONTHS[m - 1]} ${y}`;
}

function fillOptions(select, values, labels = values) {
  select.replaceChildren(...values.map((v, i) => new Option(labels[i], v)));
}

// Sets the three BS dropdowns to a BS 'YYYY-MM-DD' and refreshes the AD hint.
function setBSPicker(bs) {
  const [y, m, d] = bs.split('-').map(Number);
  const thisYear = new NepaliDate().getYear();
  const years = [];
  for (let i = Math.min(y, thisYear - 10); i <= thisYear + 1; i++) years.push(i);
  fillOptions($('#bsYear'), years);
  fillOptions($('#bsMonth'), BS_MONTHS.map((_, i) => i + 1), BS_MONTHS);
  const days = NepaliDate.getDaysOfMonth(y, m - 1);
  fillOptions($('#bsDay'), Array.from({ length: days }, (_, i) => i + 1));
  $('#bsYear').value = y;
  $('#bsMonth').value = m;
  $('#bsDay').value = Math.min(d, days);
  $('#adDate').textContent = `${formatBS(pickerBS())} · AD ${pickerAD()}`;
}

function pickerBS() {
  const pad = n => String(n).padStart(2, '0');
  return `${$('#bsYear').value}-${pad($('#bsMonth').value)}-${pad($('#bsDay').value)}`;
}

function pickerAD() {
  return new NepaliDate(+$('#bsYear').value, $('#bsMonth').value - 1, +$('#bsDay').value)
    .formatEnglishDate('YYYY-MM-DD');
}

for (const id of ['#bsYear', '#bsMonth', '#bsDay']) {
  $(id).onchange = () => {
    // Keep the day valid when switching to a shorter month.
    const [y, m, d] = pickerBS().split('-').map(Number);
    const max = NepaliDate.getDaysOfMonth(y, m - 1);
    setBSPicker(`${y}-${m}-${Math.min(d, max)}`);
  };
}

// 📅 button: pick an AD date, the BS dropdowns follow.
$('#adPicker').onclick = e => {
  e.target.value = pickerAD();
  try { e.target.showPicker(); } catch {}
};
$('#adPicker').onchange = e => {
  if (!e.target.value) return;
  try { setBSPicker(adToBS(e.target.value)); } catch { alert('That date is out of range'); }
};

function yesterday() {
  const [y, m, d] = today().split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
}

// Today / Yesterday set the date directly; Custom shows the BS dropdowns.
function pickDay(choice) {
  if (choice === 'today') setBSPicker(adToBS(today()));
  if (choice === 'yesterday') setBSPicker(adToBS(yesterday()));
  $('#customDate').hidden = choice !== 'custom';
  for (const b of document.querySelectorAll('.date-quick button')) {
    b.classList.toggle('active', b.dataset.day === choice);
  }
}

for (const b of document.querySelectorAll('.date-quick button')) {
  b.onclick = () => pickDay(b.dataset.day);
}

// ---------- Editor ----------

function setPreview(url) {
  $('#preview').src = url || '';
  $('.photo-pick').classList.toggle('has', !!url);
}

// Unique values, most used first (case-insensitive, keeps the latest spelling).
function mostUsed(values) {
  const counts = new Map();
  for (const v of values) {
    const key = v?.trim().toLowerCase();
    if (!key) continue;
    const c = counts.get(key) ?? { text: v.trim(), n: 0 };
    c.n++;
    counts.set(key, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).map(c => c.text);
}

function openEditor(item) {
  editing = item;
  newPhoto = null;
  const f = $('#form');
  f.reset();
  f.title.value = item?.name ?? '';
  f.rate.value = item?.rate ?? '';
  f.quantity.value = item ? item.quantity : '1';
  f.seller.value = item?.seller ?? '';
  const bs = item?.dateBS ?? adToBS(today());
  setBSPicker(bs);
  pickDay(bs === adToBS(today()) ? 'today' : bs === adToBS(yesterday()) ? 'yesterday' : 'custom');
  setPreview(item ? thumbUrl(item) : '');
  $('#deleteBtn').hidden = !item;
  const sellers = [...new Set(items.map(i => i.seller).filter(Boolean))].sort();
  $('#sellers').replaceChildren(...sellers.map(s => new Option(s)));
  $('#names').replaceChildren(...mostUsed(items.map(i => i.name)).map(n => new Option(n)));
  $('#editor').showModal();
}

// Auto-fill: picking a known name on a new item fills empty fields from the last purchase.
$('#form').title.onchange = () => {
  if (editing) return;
  const f = $('#form');
  const name = f.title.value.trim().toLowerCase();
  const last = items.find(i => i.name?.trim().toLowerCase() === name);
  if (!last) return;
  if (f.rate.value === '') f.rate.value = last.rate ?? '';
  if (f.quantity.value === '' || f.quantity.value === '1') f.quantity.value = last.quantity ?? '';
  if (f.seller.value === '') f.seller.value = last.seller ?? '';
};

async function usePhoto(file) {
  setPreview('');
  $('#photoHint').textContent = 'Compressing…';
  try {
    const [full, thumb] = await Promise.all([resize(file, 1280, 0.75), resize(file, 240, 0.7)]);
    newPhoto = { full, thumb };
    setPreview(URL.createObjectURL(thumb));
  } catch {
    alert('Could not read that image');
  }
  $('#photoHint').textContent = 'No photo';
}

for (const id of ['#cameraInput', '#uploadInput']) {
  $(id).onchange = e => {
    if (e.target.files[0]) usePhoto(e.target.files[0]);
    e.target.value = '';
  };
}

// Paste button (if the browser can read images from the clipboard).
if (navigator.clipboard?.read) {
  $('#pasteBtn').onclick = async () => {
    try {
      for (const entry of await navigator.clipboard.read()) {
        const type = entry.types.find(t => t.startsWith('image/'));
        if (type) return usePhoto(await entry.getType(type));
      }
      alert('No image in clipboard');
    } catch {
      alert('Could not paste. Allow clipboard access and try again.');
    }
  };
} else {
  $('#pasteBtn').hidden = true;
}

// Ctrl+V / long-press paste while the editor is open.
document.addEventListener('paste', e => {
  if (!$('#editor').open) return;
  const file = [...e.clipboardData.files].find(f => f.type.startsWith('image/'));
  if (file) { e.preventDefault(); usePhoto(file); }
});

$('#form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  const item = {
    id: editing?.id ?? crypto.randomUUID(),
    created: editing?.created ?? Date.now(),
    name: f.title.value.trim(),
    rate: f.rate.value === '' ? '' : Number(f.rate.value),
    quantity: f.quantity.value.trim(),
    seller: f.seller.value.trim(),
    date: pickerAD(),
    dateBS: pickerBS(),
    thumb: newPhoto?.thumb ?? editing?.thumb ?? null,
  };
  await DB.save(item, newPhoto?.full);
  thumbUrls.delete(item.id);
  fullUrls.delete(item.id);
  $('#editor').close();
  await load();
};

$('#cancelBtn').onclick = () => $('#editor').close();

$('#deleteBtn').onclick = async () => {
  if (!confirm(`Delete "${editing.name}"?`)) return;
  await DB.remove(editing.id);
  $('#editor').close();
  await load();
};

// ---------- Backup ----------
$('#menuBtn').onclick = () => $('#menu').showModal();
$('#closeMenu').onclick = () => $('#menu').close();

$('#exportBtn').onclick = async () => {
  $('#exportBtn').textContent = 'Exporting…';
  const files = [];
  const data = [];
  for (const { thumb, ...rest } of items) {
    data.push(rest);
    const photo = await DB.getPhoto(rest.id);
    if (photo) files.push({ name: `photos/${rest.id}.jpg`, data: photo });
  }
  files.unshift({ name: 'items.json', data: new Blob([JSON.stringify(data, null, 1)]) });
  const zip = await Zip.create(files);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zip);
  a.download = `purchases-backup-${today()}.zip`;
  a.click();
  $('#exportBtn').textContent = 'Export backup (.zip)';
};

$('#importFile').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const entries = await Zip.read(file);
    const data = JSON.parse(await entries.get('items.json').text());
    if (!confirm(`Import ${data.length} items? Items with the same ID will be replaced.`)) return;
    for (const item of data) {
      const photo = entries.get(`photos/${item.id}.jpg`);
      let full = null;
      item.thumb = null;
      if (photo) {
        full = new Blob([photo], { type: 'image/jpeg' });
        item.thumb = await resize(full, 240, 0.7);
      }
      await DB.save(item, full);
    }
    alert('Import done');
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
  e.target.value = '';
  $('#menu').close();
  await load();
};

// ---------- Start ----------
async function load() {
  items = await DB.allItems();
  for (const i of items) if (!i.dateBS && i.date) i.dateBS = adToBS(i.date);
  items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.created - a.created);
  search();
}

$('#search').oninput = search;
$('#addBtn').onclick = () => openEditor(null);
applyView();
load();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
navigator.storage?.persist?.();
