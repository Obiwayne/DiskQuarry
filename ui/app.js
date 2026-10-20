'use strict';

// Outside the Tauri shell (a plain browser) the app runs on demo data, which is
// also what the screenshots in the README use.
const TAURI = window.__TAURI__;
const invoke = TAURI ? TAURI.core.invoke : (cmd, args) => Demo.invoke(cmd, args);
const listen = TAURI ? TAURI.event.listen : (name, fn) => Demo.listen(name, fn);

const ICONS = {
  overview: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  apps: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  downloads: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  large: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  caches: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/><path d="M4 11.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>',
  system: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  other: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M9 7V4h6v3"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const CATS = {
  apps: { label: 'Applications', color: 'var(--apps)', icon: 'apps' },
  downloads: { label: 'Downloads', color: 'var(--downloads)', icon: 'downloads' },
  large: { label: 'Large Files', color: 'var(--large)', icon: 'large' },
  caches: { label: 'Caches', color: 'var(--caches)', icon: 'caches' },
  system: { label: 'System Data', color: 'var(--system)', icon: 'system' },
  other: { label: 'Other', color: 'var(--other)', icon: 'other' },
};
const CARD_ORDER = ['apps', 'downloads', 'large', 'caches', 'system', 'other'];
const NAV_ORDER = ['large', 'downloads', 'apps', 'caches', 'system', 'other'];

const KINDS = {
  video: ['mp4', 'mkv', 'mov', 'avi', 'wmv', 'webm', 'm4v', 'braw', 'r3d'],
  images: ['iso', 'img', 'vhd', 'vhdx', 'vmdk', 'wim', 'esd', 'qcow2', 'dmg'],
  archives: ['zip', '7z', 'rar', 'tar', 'gz', 'xz', 'zst', 'bz2', 'cab'],
  installers: ['exe', 'msi', 'msix', 'appx', 'msixbundle'],
};
const KIND_LABELS = { all: 'All', video: 'Videos', images: 'Disk images', archives: 'Archives', installers: 'Installers', old: 'Older than 90 days' };

const state = {
  drives: [],
  mount: null,
  result: null,
  progress: null,
  scanning: false,
  view: 'overview',
  kind: 'all',
  selected: new Set(),
  open: new Set(),
  catalog: { products: [] },
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Binary units, matching File Explorer.
function fmt(b) {
  if (!b) return '0 KB';
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
  return `${b >= 100 ? b.toFixed(0) : b.toFixed(1)} ${u[i]}`;
}
const num = (n) => Number(n || 0).toLocaleString();
const ago = (secs) => {
  if (!secs) return '';
  const days = Math.floor((Date.now() / 1000 - secs) / 86400);
  if (days < 1) return 'today';
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${(days / 365).toFixed(1)} yr ago`;
};
const ext = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
const dirOf = (p) => p.slice(0, p.lastIndexOf('\\')) || p;
const catOf = (key) => state.result?.categories.find((c) => c.cat === key) ?? { bytes: 0, files: 0 };
const driveName = (d) => `${d.label && d.label !== d.mount ? d.label : 'Local Disk'} (${d.mount.replace(/\\$/, '')})`;

// ---------- RepoQuarry matching ----------

function matches() {
  const apps = state.result?.apps ?? [];
  return state.catalog.products
    .map((p) => {
      const res = p.patterns.map((s) => new RegExp(s, 'i'));
      const found = apps.filter((a) => res.some((r) => r.test(a.name)));
      return { product: p, found };
    })
    .filter((m) => m.found.length);
}
function swapFor(appName) {
  return state.catalog.products.find((p) => p.patterns.some((s) => new RegExp(s, 'i').test(appName)));
}

// ---------- Cache labels ----------

function cacheLabel(path) {
  const p = path.toLowerCase();
  const root = (state.mount || 'C:\\').toLowerCase();
  const sys = {
    '$recycle.bin': 'Recycle Bin',
    'windows\\temp': 'Windows temporary files',
    'windows\\softwaredistribution\\download': 'Windows Update downloads',
    'programdata\\microsoft\\windows\\wer': 'Windows error reports',
    'windows\\prefetch': 'Windows Prefetch',
    'windows\\livekernelreports': 'Crash dumps',
    'windows\\minidump': 'Crash dumps',
  };
  for (const [rel, label] of Object.entries(sys)) if (p === root + rel) return label;
  const m = path.match(/\\AppData\\(?:Local|Roaming|LocalLow)\\(.+)$/i);
  if (m) {
    const parts = m[1].split('\\');
    if (/^(temp|tmp)$/i.test(parts[0])) return 'Your temporary files';
    if (/^packages$/i.test(parts[0]) && parts[1]) return parts[1].split('_')[0].replace(/^Microsoft\./, '') + ' (Store app)';
    const vendor = parts[0];
    if (/^(google|microsoft|mozilla|bravesoftware|jetbrains|nvidia|nvidia corporation|adobe)$/i.test(vendor) && parts[1] && !/cache/i.test(parts[1]))
      return `${vendor.replace(/software$/i, '')} ${parts[1]}`;
    return vendor;
  }
  const u = path.match(/\\Users\\[^\\]+\\(.+)$/i);
  if (u) {
    const parts = u[1].split('\\');
    if (parts[0] === '.cache' && parts[1]) return `.cache · ${parts[1]}`;
    // Name the cache after the nearest folder that says what it belongs to.
    const owner = parts.slice(0, -1).reverse().find((p) => !/^(bin|lib|default|data|local|tmp|cache|\.cache)$/i.test(p));
    return owner ?? parts[0];
  }
  return dirOf(path).split('\\').pop() || path;
}
const isSystemPath = (path) => /^[a-z]:\\(windows|programdata|program files)/i.test(path);
const isRecycleBin = (path) => /^[a-z]:\\\$recycle\.bin$/i.test(path);

function cacheGroups() {
  const groups = new Map();
  for (const f of state.result?.caches ?? []) {
    const label = cacheLabel(f.path);
    const g = groups.get(label) ?? { label, bytes: 0, files: 0, folders: [] };
    g.bytes += f.bytes;
    g.files += f.files;
    g.folders.push(f);
    groups.set(label, g);
  }
  return [...groups.values()].filter((g) => g.bytes > 0).sort((a, b) => b.bytes - a.bytes);
}

// ---------- Rendering ----------

function renderSidebar() {
  const sel = $('#drive-select');
  sel.innerHTML = state.drives.map((d) => `<option value="${esc(d.mount)}" ${d.mount === state.mount ? 'selected' : ''}>${esc(driveName(d))}</option>`).join('');
  const d = state.drives.find((x) => x.mount === state.mount);
  $('#drive-usage').textContent = d ? `${fmt(d.total - d.free)} / ${fmt(d.total)}` : '';

  const item = (key, label, iconName, color, size) => `
    <button class="nav-item ${state.view === key ? 'active' : ''}" data-view="${key}">
      <span class="nav-icon" style="--c:${color}">${icon(iconName)}</span>
      <span class="nav-label">${label}</span>
      <span class="nav-size">${size}</span>
      <span class="chev">${key === 'overview' ? '' : icon('chevron')}</span>
    </button>`;
  $('#nav').innerHTML =
    item('overview', 'Overview', 'overview', '#cfd5e2', '') +
    NAV_ORDER.map((k) => item(k, CATS[k].label, CATS[k].icon, CATS[k].color, state.result ? fmt(catOf(k).bytes) : '')).join('');

  const m = state.result ? matches().length : 0;
  const badge = $('#swaps-count');
  badge.hidden = !m;
  badge.textContent = m;
  $('#swaps-link').classList.toggle('active', state.view === 'swaps');
  $('#catalog-note').textContent = state.catalog.generated_at
    ? `Swaps from the RepoQuarry catalogue, ${state.catalog.products.length} paid apps checked (${state.catalog.generated_at}).`
    : '';
}

function usageBar() {
  const r = state.result;
  if (!r) return `<div class="usage-bar ${state.scanning ? 'scanning' : ''}"><span class="free" style="flex-grow:1"></span></div>`;
  const segs = CARD_ORDER.map((k) => `<span style="flex-grow:${catOf(k).bytes};background:${CATS[k].color}" title="${CATS[k].label} ${fmt(catOf(k).bytes)}"></span>`).join('');
  return `<div class="usage-bar ${state.scanning ? 'scanning' : ''}">${segs}<span class="free" style="flex-grow:${r.free}"></span></div>`;
}

function analyzeButton() {
  return state.scanning
    ? `<button class="btn" data-action="cancel">${icon('stop')} Stop</button>`
    : `<button class="btn primary" data-action="analyze">${icon('pulse')} Analyze</button>`;
}

function cardMeta(k) {
  const r = state.result;
  const c = catOf(k);
  switch (k) {
    case 'apps': return `${num(r.apps.length)} apps`;
    case 'system': return 'Windows and system files';
    case 'other': return 'Documents, media and everything else';
    default: return `${num(c.files)} files`;
  }
}

function viewOverview() {
  const r = state.result;
  const p = state.progress;
  let sub;
  if (r) sub = `<strong>${fmt(r.used)}</strong> of ${fmt(r.total)} used · ${fmt(r.free)} free`;
  else if (p) sub = `Scanning… ${num(p.files)} files · ${fmt(p.bytes)}`;
  else sub = 'Pick a drive and press Analyze.';

  const legend = r
    ? `<div class="legend">${CARD_ORDER.map((k) => `<div style="--c:${CATS[k].color}"><span class="k">${CATS[k].label}</span><span class="v">${fmt(catOf(k).bytes)}</span></div>`).join('')}</div>`
    : '<div class="legend"></div>';

  const cards = CARD_ORDER.map((k) => `
    <button class="card ${r ? '' : 'loading'}" data-view="${k}" style="--c:${CATS[k].color}">
      <div class="top">
        <span class="tile">${icon(CATS[k].icon)}</span>
        <span class="title">${CATS[k].label}</span>
        <span class="chev">${icon('chevron')}</span>
      </div>
      <div>
        <div class="size">${r ? fmt(catOf(k).bytes) : '—'}</div>
        <div class="meta">${r ? cardMeta(k) : 'Waiting for scan'}</div>
      </div>
    </button>`).join('');

  const m = r ? matches() : [];
  const banner = m.length
    ? `<div class="banner"><span class="nav-icon rq"></span>
        <p><strong>${m.length} paid app${m.length === 1 ? '' : 's'} on this PC ${m.length === 1 ? 'has' : 'have'} open-source alternatives</strong> in the RepoQuarry catalogue: ${esc(m.slice(0, 4).map((x) => x.product.name).join(', '))}${m.length > 4 ? ' and more' : ''}.</p>
        <button class="btn brand small" data-view="swaps">See swaps</button></div>`
    : '';

  const footer = state.scanning && p
    ? `<div class="scan-line">${esc(p.current)}</div>`
    : r
      ? `<div class="scan-line">Scanned ${num(r.scanned_files)} files in ${(r.duration_ms / 1000).toFixed(1)} s${r.denied_dirs ? ` · ${num(r.denied_dirs)} folders need administrator rights` : ''}${r.cancelled ? ' · stopped early, totals are partial' : ''}</div>`
      : '';

  return `
    <div class="head">
      <div><h1>Storage Overview</h1><div class="sub">${sub}</div></div>
      <div class="head-actions">${analyzeButton()}</div>
    </div>
    ${usageBar()}${legend}
    <div class="cards">${cards}</div>
    ${banner}${footer}`;
}

function detailHead(key, extra = '', actions = '') {
  const c = CATS[key];
  return `
    <button class="crumb" data-view="overview">${icon('back')} Overview</button>
    <div class="head">
      <div class="title-row">
        <span class="nav-icon" style="--c:${c.color}">${icon(c.icon)}</span>
        <div><h1>${c.label}</h1><div class="sub"><strong>${fmt(catOf(key).bytes)}</strong>${extra}</div></div>
      </div>
      <div class="head-actions">${actions}${analyzeButton()}</div>
    </div>`;
}

function fileRows(key, files) {
  const max = files[0]?.bytes || 1;
  if (!files.length) return '<div class="empty">Nothing here.</div>';
  return files.map((f) => `
    <div class="row" style="--c:${CATS[key].color}">
      <input type="checkbox" data-action="select" data-path="${esc(f.path)}" ${state.selected.has(f.path) ? 'checked' : ''} aria-label="Select ${esc(f.name)}">
      <span class="ico">${icon('large')}</span>
      <div style="min-width:0"><div class="name">${esc(f.name)}</div><div class="path">${esc(dirOf(f.path))}</div></div>
      <div class="bar"><i style="width:${Math.max(2, (f.bytes / max) * 100)}%"></i></div>
      <div class="num">${fmt(f.bytes)}<small>${ago(f.modified)}</small></div>
      <div class="acts">
        <button class="icon-btn" title="Show in File Explorer" data-action="reveal" data-path="${esc(f.path)}">${icon('folder')}</button>
        <button class="icon-btn warn" title="Move to Recycle Bin" data-action="recycle-one" data-path="${esc(f.path)}">${icon('trash')}</button>
      </div>
    </div>`).join('');
}

function filtered(files) {
  if (state.kind === 'all') return files;
  if (state.kind === 'old') return files.filter((f) => f.modified && Date.now() / 1000 - f.modified > 90 * 86400);
  return files.filter((f) => KINDS[state.kind].includes(ext(f.name)));
}

function bulkBar(files) {
  const sel = files.filter((f) => state.selected.has(f.path));
  if (!sel.length) return '';
  const bytes = sel.reduce((n, f) => n + f.bytes, 0);
  return `<div class="bulk"><span><strong>${sel.length}</strong> selected · ${fmt(bytes)}</span>
    <button class="btn small" data-action="clear-selection">Clear</button>
    <button class="btn danger small" data-action="recycle-selected">${icon('trash')} Move to Recycle Bin</button></div>`;
}

function viewFiles(key) {
  const r = state.result;
  const all = key === 'large' ? r.large_files : r.downloads;
  const files = filtered(all);
  const kinds = ['all', 'video', 'images', 'archives', 'installers', 'old'];
  const note = key === 'large'
    ? `Files of 100 MB or more outside Windows, program folders, caches and Downloads. Showing the largest ${num(all.length)}.`
    : `Everything in your Downloads folder. Old installers and disk images are usually safe to remove once used.`;
  const actions = key === 'downloads' && r.downloads_path
    ? `<button class="btn" data-action="open" data-path="${esc(r.downloads_path)}">${icon('folder')} Open folder</button>` : '';
  return `
    ${detailHead(key, ` · ${num(catOf(key).files)} files`, actions)}
    <p class="note">${note} Removed files go to the Recycle Bin, so nothing is gone until you empty it.</p>
    <div class="toolbar">
      ${kinds.map((k) => `<button class="chip ${state.kind === k ? 'on' : ''}" data-action="kind" data-kind="${k}">${KIND_LABELS[k]}</button>`).join('')}
      <span class="spacer"></span>
      <button class="chip" data-action="select-all">Select shown</button>
      <span class="count">${num(files.length)} shown · ${fmt(files.reduce((n, f) => n + f.bytes, 0))}</span>
    </div>
    <div class="list">${fileRows(key, files)}</div>
    ${bulkBar(files)}`;
}

function viewApps() {
  const r = state.result;
  const max = r.apps[0]?.bytes || 1;
  const chips = r.app_folders.filter((f) => f.bytes > 0).slice(0, 8)
    .map((f) => `<button data-action="open" data-path="${esc(f.path)}" title="${esc(f.path)}"><span>${esc(f.name)}</span><b>${fmt(f.bytes)}</b></button>`).join('');
  const rows = r.apps.map((a) => {
    const swap = swapFor(a.name);
    return `
    <div class="row no-check" style="--c:var(--apps)">
      <span class="ico">${icon('apps')}</span>
      <div style="min-width:0"><div class="name">${esc(a.name)}${swap ? `<button class="tag" data-view="swaps" title="Open-source alternatives to ${esc(swap.name)}">Swap</button>` : ''}</div>
        <div class="path">${esc([a.publisher, a.version].filter(Boolean).join(' · ') || a.location)}</div></div>
      <div class="bar"><i style="width:${Math.max(2, (a.bytes / max) * 100)}%"></i></div>
      <div class="num">${a.bytes ? fmt(a.bytes) : '—'}<small>${a.measured ? 'measured' : a.bytes ? 'estimate' : 'size unknown'}</small></div>
      <div class="acts">${a.location ? `<button class="icon-btn" title="Open install folder" data-action="open" data-path="${esc(a.location)}">${icon('folder')}</button>` : ''}</div>
    </div>`;
  }).join('');
  return `
    ${detailHead('apps', ` · ${num(r.apps.length)} installed apps`, `<button class="btn" data-action="settings" data-page="appsfeatures">${icon('settings')} Uninstall in Settings</button>`)}
    <p class="note">The category total counts everything in Program Files, game libraries and each app's install folder. Sizes marked <b>measured</b> come from this scan; <b>estimate</b> is the figure the installer registered. Uninstall through Windows Settings so apps can clean up after themselves.</p>
    <div class="folder-chips">${chips}</div>
    <div class="toolbar"><span class="count">Largest first</span></div>
    <div class="list">${rows || '<div class="empty">No installed apps found.</div>'}</div>`;
}

function viewCaches() {
  const groups = cacheGroups();
  const max = groups[0]?.bytes || 1;
  const rows = groups.map((g) => {
    const open = state.open.has(g.label);
    const bin = g.folders.some((f) => isRecycleBin(f.path));
    const sys = g.folders.every((f) => isSystemPath(f.path));
    let act;
    if (bin) act = `<button class="btn small" data-action="empty-bin">Empty</button>`;
    else if (sys) act = `<button class="btn small" data-action="settings" data-page="storagesense">Storage Sense</button>`;
    else act = `<button class="btn small" data-action="clear-cache" data-label="${esc(g.label)}">Clear</button>`;
    const sub = open ? `<div class="sub-rows">${g.folders.sort((a, b) => b.bytes - a.bytes).map((f) => `<div><span>${esc(f.path)}</span><span>${fmt(f.bytes)}</span></div>`).join('')}</div>` : '';
    return `
    <div>
      <div class="row no-check" style="--c:var(--caches)">
        <span class="ico">${icon('caches')}</span>
        <div style="min-width:0;cursor:pointer" data-action="toggle" data-label="${esc(g.label)}"><div class="name">${esc(g.label)}</div>
          <div class="path">${g.folders.length} folder${g.folders.length === 1 ? '' : 's'} · ${num(g.files)} files · ${open ? 'hide' : 'show'} folders</div></div>
        <div class="bar"><i style="width:${Math.max(2, (g.bytes / max) * 100)}%"></i></div>
        <div class="num">${fmt(g.bytes)}</div>
        <div class="acts"><button class="icon-btn" title="Show in File Explorer" data-action="open" data-path="${esc(g.folders[0].path)}">${icon('folder')}</button>${act}</div>
      </div>${sub}
    </div>`;
  }).join('');
  return `
    ${detailHead('caches', ` · ${num(catOf('caches').files)} files in ${num(groups.length)} places`)}
    <p class="note">Caches are copies apps and Windows keep to load things faster. They grow back as you use your PC, so clearing them is a short-term win. <b>Clear</b> moves what is inside each folder to the Recycle Bin and skips files that are in use; close the app first for the best result. Windows' own caches are left to Storage Sense.</p>
    <div class="toolbar"><span class="count">Largest first</span></div>
    <div class="list" style="--acts:150px">${rows || '<div class="empty">No caches found.</div>'}</div>`;
}

function folderList(key, folders, withChildren) {
  const max = folders[0]?.bytes || 1;
  return folders.filter((f) => f.bytes > 0).map((f) => {
    const kids = withChildren && f.children.length
      ? `<div class="sub-rows">${f.children.slice(0, 8).map((c) => `<div><span>${esc(c.name)}</span><span>${fmt(c.bytes)}</span></div>`).join('')}</div>` : '';
    return `<div>
      <div class="row no-check" style="--c:${CATS[key].color}">
        <span class="ico">${icon(key === 'system' ? 'system' : 'folder')}</span>
        <div style="min-width:0"><div class="name">${esc(f.name)}</div><div class="path">${esc(f.path)}</div></div>
        <div class="bar"><i style="width:${Math.max(2, (f.bytes / max) * 100)}%"></i></div>
        <div class="num">${fmt(f.bytes)}<small>${num(f.files)} files</small></div>
        <div class="acts"><button class="icon-btn" title="Show in File Explorer" data-action="open" data-path="${esc(f.path)}">${icon('folder')}</button></div>
      </div>${kids}</div>`;
  }).join('');
}

const SYSTEM_FILES = {
  'pagefile.sys': 'Virtual memory. Windows sizes it automatically.',
  'hiberfil.sys': 'Hibernation and Fast Startup. Turning hibernation off removes it.',
  'swapfile.sys': 'Used by Store apps when memory is short.',
};

function viewSystem() {
  const r = state.result;
  const files = r.system_files.map((f) => `
    <div class="row no-check" style="--c:var(--system)">
      <span class="ico">${icon('large')}</span>
      <div style="min-width:0"><div class="name">${esc(f.name)}</div><div class="path">${esc(SYSTEM_FILES[f.name.toLowerCase()] ?? f.path)}</div></div>
      <div></div><div class="num">${fmt(f.bytes)}</div><div></div>
    </div>`).join('');
  const overlap = r.hardlink_overlap
    ? ` Windows stores many system files once and links them from several folders, so ${fmt(r.hardlink_overlap)} counted twice by the folder sizes below has been taken off the total.` : '';
  return `
    ${detailHead('system', '', `<button class="btn" data-action="settings" data-page="storagesense">${icon('settings')} Storage Sense</button>`)}
    <p class="note">Windows itself, its component store (WinSxS), drivers, restore data and shared program data. DiskQuarry never deletes anything here; use Storage Sense or Disk Cleanup, which know what Windows still needs.${overlap}</p>
    <div class="toolbar"><span class="count">Folders</span></div>
    <div class="list">${folderList('system', r.system, true) || '<div class="empty">Nothing found.</div>'}</div>
    ${files ? `<div class="toolbar"><span class="count">Files at the root of the drive</span></div><div class="list">${files}</div>` : ''}`;
}

function viewOther() {
  const r = state.result;
  const note = r.unaccounted
    ? ` <b>${fmt(r.unaccounted)}</b> is in use but could not be read without administrator rights (System Restore points, other users' files and file system records); it is included in this total.` : '';
  return `
    ${detailHead('other')}
    <p class="note">Documents, photos, projects and anything else that is not an app, cache, download, system file or single file over 100 MB.${note}</p>
    <div class="toolbar"><span class="count">Largest folders</span></div>
    <div class="list">${folderList('other', r.other_folders.slice(0, 60), false) || '<div class="empty">Nothing found.</div>'}</div>`;
}

function viewSwaps() {
  const m = state.result ? matches() : [];
  const cards = m.map(({ product: p, found }) => `
    <section class="swap">
      <div class="swap-head">
        <span class="nav-icon rq" style="width:42px;height:42px;border-radius:12px"></span>
        <div><h3>${esc(p.name)}</h3><p>${esc(p.pricing)} · ${p.alternatives.length} open-source alternative${p.alternatives.length === 1 ? '' : 's'} in RepoQuarry</p></div>
        <button class="btn small" data-action="url" data-url="https://repoquarry.dev/alternatives/${esc(p.id)}">${icon('external')} Compare on RepoQuarry</button>
      </div>
      <div class="found">${found.map((a) => `<span>Installed: <b>${esc(a.name)}</b>${a.bytes ? ` · ${fmt(a.bytes)}` : ''}</span>`).join('')}</div>
      <div class="alts">${p.alternatives.slice(0, 6).map((a) => `
        <button class="alt" data-action="url" data-url="https://repoquarry.dev/projects/${esc(a.id)}" title="Open ${esc(a.name)} on RepoQuarry">
          <span class="an"><span>${esc(a.name)}</span><small>${a.stars ? `★ ${a.stars >= 1000 ? (a.stars / 1000).toFixed(1) + 'k' : a.stars}` : ''}</small></span>
          <span class="ad">${esc(a.note || a.description)}</span>
          <span class="am"><span class="pill ${a.coverage === 'full' ? 'full' : ''}">${a.coverage === 'full' ? 'Covers it' : 'Covers part'}</span><span class="pill">${esc(a.license)}</span></span>
        </button>`).join('')}</div>
    </section>`).join('');
  const none = `<div class="swap"><p class="note" style="margin:0">None of the ${state.catalog.products.length} paid desktop apps in the catalogue are installed on this drive. Checked for: ${esc(state.catalog.products.map((p) => p.name).join(', '))}.</p></div>`;
  return `
    <button class="crumb" data-view="overview">${icon('back')} Overview</button>
    <div class="head">
      <div class="title-row"><span class="nav-icon rq" style="width:46px;height:46px;border-radius:13px"></span>
        <div><h1>Open-source swaps</h1><div class="sub">Paid apps on this PC, matched against the RepoQuarry catalogue</div></div></div>
      <div class="head-actions"><button class="btn" data-action="url" data-url="https://repoquarry.dev/">${icon('external')} repoquarry.dev</button></div>
    </div>
    <p class="note">Every alternative here has a sourced, dated listing on RepoQuarry with licence, hosting and coverage notes. <b>Covers part</b> means it handles the main jobs but not every feature. Nothing is installed or removed from this screen.</p>
    <div class="swap-grid">${state.result ? (cards || none) : '<div class="empty">Analyze a drive first.</div>'}</div>`;
}

function render() {
  renderSidebar();
  const main = $('#main');
  const v = state.view;
  let html;
  if (v === 'swaps') html = viewSwaps();
  else if (v === 'overview' || !state.result) html = viewOverview();
  else if (v === 'large' || v === 'downloads') html = viewFiles(v);
  else if (v === 'apps') html = viewApps();
  else if (v === 'caches') html = viewCaches();
  else if (v === 'system') html = viewSystem();
  else html = viewOther();
  const keep = main.scrollTop;
  main.innerHTML = html;
  main.scrollTop = keep;
}

// ---------- Actions ----------

let toastTimer;
function toast(html, ms = 6000) {
  const t = $('#toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

function confirmModal(title, body, okLabel) {
  return new Promise((resolve) => {
    const m = $('#modal');
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2>${title}</h2>${body}
      <div class="acts"><button class="btn" data-k="no">Cancel</button><button class="btn danger" data-k="yes">${okLabel}</button></div></div>`;
    m.hidden = false;
    m.querySelector('[data-k="yes"]').focus();
    m.onclick = (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (!k && e.target !== m) return;
      m.hidden = true;
      resolve(k === 'yes');
    };
  });
}

async function startScan() {
  if (!state.mount) return;
  state.scanning = true;
  state.progress = { files: 0, bytes: 0, current: '' };
  state.result = null;
  state.selected.clear();
  state.view = 'overview';
  render();
  try {
    await invoke('start_scan', { mount: state.mount });
  } catch (e) {
    state.scanning = false;
    toast(esc(e));
    render();
  }
}

async function recycleFiles(paths) {
  const r = state.result;
  const lists = [['large', r.large_files], ['downloads', r.downloads]];
  const items = lists.flatMap(([, l]) => l.filter((f) => paths.includes(f.path)));
  const bytes = items.reduce((n, f) => n + f.bytes, 0);
  const ok = await confirmModal(
    `Move ${items.length} item${items.length === 1 ? '' : 's'} to the Recycle Bin?`,
    `<p>${fmt(bytes)} will move to the Recycle Bin. The space is freed when you empty it, and you can restore anything until then.</p>
     <ul>${items.slice(0, 12).map((f) => `<li>${esc(f.name)} · ${fmt(f.bytes)}</li>`).join('')}${items.length > 12 ? `<li>and ${items.length - 12} more</li>` : ''}</ul>`,
    'Move to Recycle Bin',
  );
  if (!ok) return;
  try {
    await invoke('recycle', { paths: items.map((f) => f.path) });
  } catch (e) {
    toast(esc(e));
    return;
  }
  // The bytes now sit in $Recycle.Bin, which DiskQuarry counts as a cache.
  for (const [key, list] of lists) {
    const gone = list.filter((f) => paths.includes(f.path));
    const c = r.categories.find((x) => x.cat === key);
    for (const f of gone) { c.bytes -= f.bytes; c.files -= 1; }
    const cc = r.categories.find((x) => x.cat === 'caches');
    cc.bytes += gone.reduce((n, f) => n + f.bytes, 0);
    cc.files += gone.length;
    const keep = list.filter((f) => !paths.includes(f.path));
    if (key === 'large') r.large_files = keep; else r.downloads = keep;
  }
  paths.forEach((p) => state.selected.delete(p));
  render();
  toast(`Moved ${items.length} item${items.length === 1 ? '' : 's'} (${fmt(bytes)}) to the Recycle Bin. <button class="btn small" data-action="empty-bin">Empty Recycle Bin</button>`, 9000);
}

async function clearCache(label) {
  const g = cacheGroups().find((x) => x.label === label);
  if (!g) return;
  const dirs = g.folders.filter((f) => !isSystemPath(f.path)).map((f) => f.path);
  const ok = await confirmModal(
    `Clear ${esc(label)}?`,
    `<p>The contents of ${dirs.length} folder${dirs.length === 1 ? '' : 's'} (${fmt(g.bytes)}) move to the Recycle Bin. Files that are in use are skipped. ${esc(label)} will rebuild what it needs.</p>
     <ul>${dirs.slice(0, 8).map((d) => `<li>${esc(d)}</li>`).join('')}${dirs.length > 8 ? `<li>and ${dirs.length - 8} more</li>` : ''}</ul>`,
    'Clear',
  );
  if (!ok) return;
  try {
    const res = await invoke('recycle_contents', { dirs });
    toast(`Moved ${num(res.moved)} item${res.moved === 1 ? '' : 's'} to the Recycle Bin${res.skipped ? `, skipped ${num(res.skipped)} in use` : ''}. <button class="btn small" data-action="analyze">Analyze again</button>`, 9000);
  } catch (e) {
    toast(esc(e));
  }
}

async function onClick(e) {
  const v = e.target.closest('[data-view]');
  if (v && !e.target.closest('[data-action]')) {
    state.view = v.dataset.view;
    state.kind = 'all';
    $('#main').scrollTop = 0;
    render();
    return;
  }
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const { action, path } = a.dataset;
  try {
    switch (action) {
      case 'analyze': return startScan();
      case 'cancel': return invoke('cancel_scan');
      case 'reveal': return invoke('reveal', { path });
      case 'open': return invoke('open_path', { path });
      case 'settings': return invoke('open_settings', { page: a.dataset.page });
      case 'url': return invoke('open_url', { url: a.dataset.url });
      case 'empty-bin': return invoke('empty_recycle_bin');
      case 'recycle-one': return recycleFiles([path]);
      case 'recycle-selected': return recycleFiles([...state.selected]);
      case 'clear-cache': return clearCache(a.dataset.label);
      case 'clear-selection': state.selected.clear(); return render();
      case 'select':
        if (a.checked) state.selected.add(path); else state.selected.delete(path);
        return render();
      case 'select-all': {
        const list = state.view === 'large' ? state.result.large_files : state.result.downloads;
        filtered(list).forEach((f) => state.selected.add(f.path));
        return render();
      }
      case 'kind': state.kind = a.dataset.kind; return render();
      case 'toggle': {
        const l = a.dataset.label;
        if (state.open.has(l)) state.open.delete(l); else state.open.add(l);
        return render();
      }
    }
  } catch (err) {
    toast(esc(err));
  }
}

async function init() {
  document.addEventListener('click', onClick);
  $('#drive-select').addEventListener('change', (e) => {
    state.mount = e.target.value;
    startScan();
  });
  try {
    state.catalog = await (await fetch('catalog.json')).json();
  } catch { /* swaps stay empty */ }

  let lastPaint = 0;
  await listen('scan-progress', (ev) => {
    if (!state.scanning) return;
    state.progress = ev.payload;
    const now = performance.now();
    if (now - lastPaint > 250 && state.view === 'overview') { lastPaint = now; render(); }
  });
  await listen('scan-done', (ev) => {
    state.scanning = false;
    state.progress = null;
    state.result = ev.payload;
    render();
  });

  state.drives = await invoke('list_drives');
  const sys = state.drives.find((d) => /^c:\\?$/i.test(d.mount)) ?? state.drives[0];
  state.mount = sys?.mount ?? null;
  render();
  startScan();
}

// ---------- Demo backend (browser preview and screenshots) ----------

const Demo = {
  handlers: {},
  listen(name, fn) { (this.handlers[name] ??= []).push(fn); return Promise.resolve(() => {}); },
  emit(name, payload) { (this.handlers[name] ?? []).forEach((fn) => fn({ payload })); },
  async invoke(cmd, args) {
    const GB = 1024 ** 3, MB = 1024 ** 2;
    switch (cmd) {
      case 'list_drives':
        return [
          { mount: 'C:\\', label: 'Windows', total: 953 * GB, free: 541.4 * GB, removable: false },
          { mount: 'D:\\', label: 'Games', total: 1863 * GB, free: 702 * GB, removable: false },
        ];
      case 'start_scan': {
        let files = 0;
        const t = setInterval(() => {
          files += 61234;
          this.emit('scan-progress', { files, bytes: files * 0.36 * MB, current: 'C:\\Users\\sam\\AppData\\Local\\Packages' });
        }, 120);
        setTimeout(() => { clearInterval(t); this.emit('scan-done', this.result()); }, Number(new URLSearchParams(location.search).get('scanms') ?? 1800));
        return null;
      }
      case 'recycle': return args.paths.length;
      case 'recycle_contents': return { moved: 412, skipped: 9 };
      default: return null;
    }
  },
  result() {
    const r = this.raw();
    for (const k of ['large_files', 'downloads', 'caches', 'system', 'system_files', 'app_folders', 'other_folders', 'apps']) r[k].sort((a, b) => b.bytes - a.bytes);
    return r;
  },
  raw() {
    const GB = 1024 ** 3, MB = 1024 ** 2;
    const now = Date.now() / 1000, d = 86400;
    const f = (path, gb, days) => ({ path, name: path.split('\\').pop(), bytes: Math.round(gb * GB), modified: now - days * d });
    const folder = (path, cat, gb, files, children = []) => ({ path, name: path.split('\\').pop(), cat, bytes: Math.round(gb * GB), files, children: children.map(([name, g]) => ({ name, bytes: Math.round(g * GB), is_dir: true })) });
    const app = (name, publisher, version, gb, location = '') => ({ name, publisher, version, location, bytes: Math.round(gb * GB), measured: !!location });
    return {
      mount: 'C:\\', total: 953 * GB, free: 541.4 * GB, used: 411.6 * GB,
      categories: [
        { cat: 'apps', bytes: 96.4 * GB, files: 412870 },
        { cat: 'downloads', bytes: 38.2 * GB, files: 1306 },
        { cat: 'large', bytes: 61.7 * GB, files: 214 },
        { cat: 'caches', bytes: 24.9 * GB, files: 188431 },
        { cat: 'system', bytes: 112.3 * GB, files: 391550 },
        { cat: 'other', bytes: 78.1 * GB, files: 902114 },
      ],
      large_files: [
        f('C:\\Users\\sam\\Videos\\Captures\\Project walkthrough 4K.mp4', 14.2, 21),
        f('C:\\Users\\sam\\VMs\\ubuntu-dev\\ubuntu-dev.vhdx', 12.8, 64),
        f('C:\\Users\\sam\\Videos\\Wedding edit FINAL.mov', 9.6, 190),
        f('C:\\Users\\sam\\Documents\\Backups\\phone-backup-2025.zip', 7.4, 400),
        f('C:\\Users\\sam\\models\\llama-3.1-8b-instruct-q8.gguf', 7.9, 33),
        f('C:\\Users\\sam\\Pictures\\Lightroom\\Catalog Previews.lrdata.zip', 3.1, 120),
        f('C:\\Users\\sam\\Videos\\OBS\\2026-09-28 19-04-11.mkv', 2.7, 22),
        f('C:\\Users\\sam\\Documents\\Archive\\tax-scans-2019-2024.7z', 1.6, 610),
      ],
      downloads: [
        f('C:\\Users\\sam\\Downloads\\Win11_25H2_English_x64.iso', 7.1, 140),
        f('C:\\Users\\sam\\Downloads\\ubuntu-24.04.3-desktop-amd64.iso', 6.0, 96),
        f('C:\\Users\\sam\\Downloads\\DaVinci_Resolve_20.2_Windows.zip', 3.9, 58),
        f('C:\\Users\\sam\\Downloads\\sample-footage-pack.zip', 4.4, 300),
        f('C:\\Users\\sam\\Downloads\\Blender-4.5-windows-x64.msi', 0.38, 75),
        f('C:\\Users\\sam\\Downloads\\VSCodeUserSetup-x64.exe', 0.11, 12),
        f('C:\\Users\\sam\\Downloads\\podcast-raw-ep41.wav', 1.9, 8),
        f('C:\\Users\\sam\\Downloads\\Photoshop_Set-Up.exe', 0.004, 200),
      ],
      downloads_path: 'C:\\Users\\sam\\Downloads',
      caches: [
        folder('C:\\$Recycle.Bin', 'caches', 6.2, 2310),
        folder('C:\\Users\\sam\\AppData\\Local\\Temp', 'caches', 5.4, 41200),
        folder('C:\\Users\\sam\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache', 'caches', 2.9, 30110),
        folder('C:\\Users\\sam\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Code Cache', 'caches', 0.6, 5400),
        folder('C:\\Windows\\SoftwareDistribution\\Download', 'caches', 3.3, 1900),
        folder('C:\\Users\\sam\\AppData\\Local\\npm-cache', 'caches', 2.1, 61000),
        folder('C:\\Users\\sam\\.cache\\huggingface', 'caches', 1.8, 120),
        folder('C:\\Users\\sam\\AppData\\Roaming\\Slack\\Cache', 'caches', 0.9, 4100),
        folder('C:\\Users\\sam\\AppData\\Local\\NVIDIA\\DXCache', 'caches', 0.7, 2200),
        folder('C:\\Windows\\Temp', 'caches', 1.0, 3100),
      ],
      system: [
        folder('C:\\Windows', 'system', 38.4, 301200, [['WinSxS', 14.1], ['System32', 9.8], ['Installer', 6.3], ['SysWOW64', 2.4], ['assembly', 1.7]]),
        folder('C:\\System Volume Information', 'system', 24.0, 40),
        folder('C:\\ProgramData', 'system', 18.9, 90210, [['Package Cache', 6.6], ['NVIDIA Corporation', 3.1], ['Microsoft', 2.9]]),
        folder('C:\\Recovery', 'system', 0.9, 12),
      ],
      system_files: [f('C:\\hiberfil.sys', 12.7, 1), f('C:\\pagefile.sys', 16.0, 1), f('C:\\swapfile.sys', 0.25, 1)],
      app_folders: [
        folder('C:\\Program Files', 'apps', 41.2, 190000),
        folder('C:\\Program Files (x86)', 'apps', 13.6, 60000),
        folder('C:\\SteamLibrary', 'apps', 34.1, 140000),
        folder('C:\\Users\\sam\\AppData\\Local\\Programs', 'apps', 7.5, 22870),
      ],
      other_folders: [
        folder('C:\\Users\\sam\\Pictures', 'other', 22.4, 41000),
        folder('C:\\Users\\sam\\Documents', 'other', 14.8, 120333),
        folder('C:\\Users\\sam\\AppData', 'other', 12.3, 520000),
        folder('C:\\Users\\sam\\source', 'other', 9.6, 201000),
        folder('C:\\Users\\sam\\Music', 'other', 4.2, 3100),
        folder('C:\\Users\\sam\\OneDrive', 'other', 2.1, 7400),
      ],
      apps: [
        app('Counter-Strike 2', 'Valve', '', 34.1, 'C:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive'),
        app('Adobe Photoshop 2026', 'Adobe Inc.', '27.1.0', 6.8, 'C:\\Program Files\\Adobe\\Adobe Photoshop 2026'),
        app('Adobe Premiere Pro 2026', 'Adobe Inc.', '26.0', 5.9, 'C:\\Program Files\\Adobe\\Adobe Premiere Pro 2026'),
        app('Microsoft 365 Apps for enterprise - en-us', 'Microsoft Corporation', '16.0.19127', 4.1, 'C:\\Program Files\\Microsoft Office'),
        app('DaVinci Resolve', 'Blackmagic Design', '20.2', 3.6, 'C:\\Program Files\\Blackmagic Design\\DaVinci Resolve'),
        app('Visual Studio Code', 'Microsoft Corporation', '1.105', 0.62, 'C:\\Users\\sam\\AppData\\Local\\Programs\\Microsoft VS Code'),
        app('Slack', 'Slack Technologies Inc.', '4.46', 0.51, 'C:\\Users\\sam\\AppData\\Local\\slack'),
        app('Notion', 'Notion Labs, Inc', '4.20', 0.43, 'C:\\Users\\sam\\AppData\\Local\\Programs\\Notion'),
        app('Zoom Workplace (64-bit)', 'Zoom Communications, Inc.', '6.6', 0.36, 'C:\\Users\\sam\\AppData\\Roaming\\Zoom'),
        app('Dropbox', 'Dropbox, Inc.', '233.4', 0.31, 'C:\\Program Files (x86)\\Dropbox'),
        app('Google Chrome', 'Google LLC', '141.0', 0.0, ''),
        app('Discord', 'Discord Inc.', '1.0.9208', 0.29, 'C:\\Users\\sam\\AppData\\Local\\Discord'),
        app('Blender', 'Blender Foundation', '4.5', 0.0, ''),
      ].map((a) => (a.bytes ? a : { ...a, bytes: Math.round(380 * MB), measured: false })),
      unaccounted: Math.round(3.4 * GB),
      hardlink_overlap: Math.round(9.6 * GB),
      denied_dirs: 37,
      scanned_files: 1906485,
      duration_ms: 23840,
      cancelled: false,
    };
  },
};

init();
