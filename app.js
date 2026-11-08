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

function renderMore() {
  const frag = document.createDocumentFragment();
  for (const item of results.slice(shown, shown + PAGE)) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <img src="${thumbUrl(item)}" alt="" loading="lazy">
      <div class="info">
        <div class="name">${esc(item.name)}</div>
        <div class="meta">
          ${item.rate !== '' && item.rate != null ? `<span class="rate">Rs ${esc(item.rate)}</span> · ` : ''}
          ${esc(item.quantity)}${item.quantity ? ' · ' : ''}${esc(item.seller)}
        </div>
        <div class="meta">${esc(formatBS(item.dateBS))} <small>(${esc(item.date)})</small></div>
      </div>`;
    el.querySelector('img').onclick = e => { e.stopPropagation(); viewPhoto(item); };
    el.onclick = () => openEditor(item);
    frag.append(el);
  }
  shown += PAGE;
  $('#list').append(frag);
}

new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && shown < results.length) renderMore();
}, { rootMargin: '600px' }).observe($('#sentinel'));

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
  $('#adDate').textContent = 'AD: ' + pickerAD();
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

// ---------- Editor ----------

function setPreview(url) {
  if ($('#preview').src.startsWith('blob:')) URL.revokeObjectURL($('#preview').src);
  $('#preview').src = url || '';
  $('.photo-pick').classList.toggle('has', !!url);
}

function openEditor(item) {
  editing = item;
  newPhoto = null;
  const f = $('#form');
  f.reset();
  f.title.value = item?.name ?? '';
  f.rate.value = item?.rate ?? '';
  f.quantity.value = item?.quantity ?? '';
  f.seller.value = item?.seller ?? '';
  setBSPicker(item?.dateBS ?? adToBS(today()));
  setPreview('');
  if (item) DB.getPhoto(item.id).then(b => b && editing === item && setPreview(URL.createObjectURL(b)));
  $('#deleteBtn').hidden = !item;
  const sellers = [...new Set(items.map(i => i.seller).filter(Boolean))].sort();
  $('#sellers').replaceChildren(...sellers.map(s => new Option(s)));
  $('#editor').showModal();
  if (!item) $('#photoInput').click();
}

$('#photoInput').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  $('#photoHint').textContent = 'Compressing…';
  const [full, thumb] = await Promise.all([resize(file, 1600, 0.85), resize(file, 300, 0.75)]);
  newPhoto = { full, thumb };
  setPreview(URL.createObjectURL(full));
  $('#photoHint').textContent = 'Tap to take photo';
  e.target.value = '';
};

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
        item.thumb = await resize(full, 300, 0.75);
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
load();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
navigator.storage?.persist?.();
