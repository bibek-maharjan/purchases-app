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
  const text = [item.name, item.seller, item.quantity, item.rate, item.date]
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
        <div class="meta">${esc(item.date)}</div>
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

// ---------- Editor ----------
function today() {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function setPreview(url) {
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
  f.date.value = item?.date ?? today();
  setPreview(item ? thumbUrl(item) : '');
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
  const [full, thumb] = await Promise.all([resize(file, 1280, 0.75), resize(file, 240, 0.7)]);
  newPhoto = { full, thumb };
  setPreview(URL.createObjectURL(thumb));
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
    date: f.date.value,
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
  items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.created - a.created);
  search();
}

$('#search').oninput = search;
$('#addBtn').onclick = () => openEditor(null);
load();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
navigator.storage?.persist?.();
