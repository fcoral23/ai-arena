'use strict';

/* ══════════════════════════════════════════════════════════════
   CONFIGURACIÓN DE CATEGORÍAS / SLOTS

   Cada categoría tiene:
     label  — nombre que aparece en el arena
     side   — 'left' | 'right'
     slots  — lista de números de slot que pertenecen a esta categoría

   Cambia esto para reorganizar el arena visual.
══════════════════════════════════════════════════════════════ */
const CATEGORIAS = [
  { label: 'ROBOT',   side: 'left',  slots: [1, 2, 3, 4]    },
  { label: 'ANDROID', side: 'left',  slots: [9, 10, 11, 12]  },
  { label: 'NATURE',  side: 'right', slots: [5, 6, 7, 8]    },
  { label: 'UNKNOWN', side: 'right', slots: [13, 14, 15, 16] },
];

/* ── IA palette ── */
const IA = {
  O: { nombre:'ChatGPT', color:'#10a37f', dim:'#0a5c47', glow:'rgba(16,163,127,.45)',  glow2:'rgba(16,163,127,.15)' },
  A: { nombre:'Claude',  color:'#f97316', dim:'#9a4a0a', glow:'rgba(249,115,22,.45)',   glow2:'rgba(249,115,22,.15)' },
  G: { nombre:'Gemini',  color:'#a855f7', dim:'#6b21a8', glow:'rgba(168,85,247,.45)',   glow2:'rgba(168,85,247,.15)' }
};
const DEF = { color:'#D42020', dim:'#8B1010', glow:'rgba(212,32,32,.45)', glow2:'rgba(212,32,32,.15)' };

/* ══════════════════════════════════════════════════════════════
   CSV PARSER — maneja comas dentro de comillas
══════════════════════════════════════════════════════════════ */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').trim(); });
    return obj;
  });
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

/* ══════════════════════════════════════════════════════════════
   DATA LOADING
══════════════════════════════════════════════════════════════ */
let DATA = {};

async function loadData() {
  const [cfgText, eqText] = await Promise.all([
    fetch('data/config.csv').then(r => r.text()),
    fetch('data/equipos.csv').then(r => r.text()),
  ]);

  /* ── Config: campo → valor ── */
  const cfgRows = parseCSV(cfgText);
  const info = {};
  cfgRows.forEach(r => { info[r.campo] = r.valor; });

  /* ── Equipos: parse headers to discover dynamic score columns ── */
  const eqRows = parseCSV(eqText);

  // Fixed known columns (everything except the dynamic ones)
  const FIXED_LEFT  = ['slot','nombre','ia','op1','op2','op3','disenador'];
  const FIXED_RIGHT = ['total'];

  // Grab all header keys from the first row
  const allHeaders = Object.keys(eqRows[0]);

  // Dynamic score columns = everything between 'disenador' and 'total'
  const idxDis   = allHeaders.indexOf('disenador');
  const idxTotal = allHeaders.indexOf('total');
  const scoreColumns = allHeaders.slice(idxDis + 1, idxTotal);

  const equipos = eqRows.map(r => ({
    slot:      parseInt(r.slot),
    nombre:    r.nombre,
    ia:        r.ia,
    op1:       r.op1,
    op2:       r.op2,
    op3:       r.op3,
    disenador: r.disenador,
    scores:    scoreColumns.map(col => r[col] !== '' && r[col] !== undefined ? parseFloat(r[col]) : null),
    total:     parseFloat(r.total) || 0,
  }));

  DATA = { info, equipos, scoreColumns, categorias: CATEGORIAS };
}

/* ══════════════════════════════════════════════════════════════
   SOUND
══════════════════════════════════════════════════════════════ */
let _ac = null;
function playHoverSound() {
  try {
    if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = _ac.createOscillator(), g = _ac.createGain();
    o.connect(g); g.connect(_ac.destination);
    o.type = 'triangle';
    o.frequency.setValueAtTime(660, _ac.currentTime);
    o.frequency.setValueAtTime(990, _ac.currentTime + .06);
    g.gain.setValueAtTime(0, _ac.currentTime);
    g.gain.linearRampToValueAtTime(.12, _ac.currentTime + .02);
    g.gain.exponentialRampToValueAtTime(.0001, _ac.currentTime + .22);
    o.start(_ac.currentTime); o.stop(_ac.currentTime + .22);
  } catch(e) {}
}

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */
let selectedSlot = null;
const slotMap = {};

/* ══════════════════════════════════════════════════════════════
   CENTER IMAGE LOADER — tries multiple extensions
══════════════════════════════════════════════════════════════ */
function loadCenterImg(imgEl, slot, onLoad, onFail) {
  const exts = ['png','jpg','jpeg','bmp','gif','webp'];
  let i = 0;
  function next() {
    if (i >= exts.length) { onFail && onFail(); return; }
    imgEl.onload  = () => { onLoad && onLoad(imgEl); };
    imgEl.onerror = next;
    imgEl.src = 'assets/equipos/Equipo-' + slot + '.' + exts[i++];
  }
  next();
}

/* ══════════════════════════════════════════════════════════════
   SELECT / DESELECT SLOT
══════════════════════════════════════════════════════════════ */
function selectSlot(slot) {
  if (selectedSlot === slot) return;
  selectedSlot = slot;
  const eq = slotMap[slot];
  const ia = IA[eq.ia] || DEF;

  playHoverSound();

  /* center image */
  const cImg = document.getElementById('center-img');
  cImg.classList.remove('visible');
  loadCenterImg(cImg, slot, el => el.classList.add('visible'), () => cImg.classList.remove('visible'));

  /* AI name */
  const nameEl = document.getElementById('ai-name');
  nameEl.textContent = ia.nombre;
  nameEl.style.color = ia.color;
  nameEl.style.textShadow = '0 0 20px ' + ia.color + ',0 0 6px ' + ia.color;
  nameEl.classList.add('visible');
  document.getElementById('choose-text').style.opacity = '0';

  /* ops bar — operators above, designer below */
  const opsBar = document.getElementById('ops-bar');
  opsBar.innerHTML =
    '<span class="ops-label">Operadores</span>' +
    '<span class="ops-names">' + eq.op1 + ' · ' + eq.op2 + ' · ' + eq.op3 + '</span>';
  opsBar.style.opacity = '1';

  /* designer credit below character */
  const dc = document.getElementById('design-credit');
  dc.innerHTML = 'Diseño de personaje: <em>' + eq.disenador + '</em>';
  dc.style.opacity = '1';

  /* highlight slot cards */
  document.querySelectorAll('.slot-wrap').forEach(w => {
    w.classList.toggle('active', parseInt(w.dataset.slot) === slot);
  });

  /* highlight leaderboard row */
  document.querySelectorAll('.lb-entry').forEach(row => {
    const s = parseInt(row.dataset.slot);
    const req = slotMap[s];
    if (s === slot) {
      const ria = IA[req.ia] || DEF;
      row.style.borderColor = ria.color + '99';
      row.style.boxShadow   = '0 0 12px ' + ria.glow2;
      row.style.background  = ria.color + '14';
      row.classList.add('selected');
    } else {
      applyLbRowStyle(row, req, false);
    }
  });

  /* highlight detail table row */
  document.querySelectorAll('#detail-table tr.data-row').forEach(r => {
    r.classList.toggle('row-selected', parseInt(r.dataset.slot) === slot);
  });
}

function deselect() {
  selectedSlot = null;
  document.getElementById('center-img').classList.remove('visible');
  const nameEl = document.getElementById('ai-name');
  nameEl.classList.remove('visible');
  nameEl.textContent = '';
  document.getElementById('choose-text').style.opacity = '1';
  document.getElementById('ops-bar').style.opacity = '0';
  document.getElementById('design-credit').style.opacity = '0';

  document.querySelectorAll('.slot-wrap').forEach(w => w.classList.remove('active'));

  document.querySelectorAll('.lb-entry').forEach(row => {
    const s = parseInt(row.dataset.slot);
    applyLbRowStyle(row, slotMap[s], false);
  });

  document.querySelectorAll('#detail-table tr.data-row').forEach(r => r.classList.remove('row-selected'));
}

/* ══════════════════════════════════════════════════════════════
   LEADERBOARD ROW STYLE
══════════════════════════════════════════════════════════════ */
function applyLbRowStyle(row, eq, force) {
  const rank = parseInt(row.dataset.rank);
  const isFinal = rank <= 4;
  const ia = IA[eq.ia] || DEF;
  row.classList.remove('selected');
  if (isFinal) {
    row.style.borderColor = ia.color + '55';
    row.style.boxShadow   = '0 0 8px ' + ia.glow2;
    row.style.background  = ia.color + '0a';
  } else {
    row.style.borderColor = 'transparent';
    row.style.boxShadow   = '';
    row.style.background  = '';
  }
  const rankEl = row.querySelector('.lb-rank');
  if (rankEl) rankEl.style.color = isFinal ? ia.color : '';
  const ptsEl  = row.querySelector('.lb-pts');
  if (ptsEl)  ptsEl.style.color  = isFinal ? ia.color : '';
  const avEl   = row.querySelector('.lb-avatar');
  if (avEl)   avEl.style.borderColor = isFinal ? ia.color + '66' : 'rgba(255,255,255,.08)';
}

/* ══════════════════════════════════════════════════════════════
   BUILD SLOT CARD
   Image from assets/slots/slot-N.png
══════════════════════════════════════════════════════════════ */
function buildCard(eq) {
  const wrap = document.createElement('div');
  wrap.className  = 'slot-wrap';
  wrap.dataset.slot = eq.slot;

  const img = document.createElement('img');
  img.src = 'assets/slots/slot-' + eq.slot + '.png';
  img.alt = eq.nombre;
  img.onerror = () => {
    img.style.display = 'none';
    const init = document.createElement('div');
    init.className   = 'slot-initials';
    init.textContent = eq.nombre.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
    wrap.appendChild(init);
  };

  wrap.appendChild(img);
  wrap.addEventListener('mouseenter', () => selectSlot(eq.slot));
  wrap.addEventListener('mouseleave', deselect);
  return wrap;
}

/* ══════════════════════════════════════════════════════════════
   RENDER: COMPETITORS (arena)
══════════════════════════════════════════════════════════════ */
function renderCompetitors() {
  DATA.equipos.forEach(e => { slotMap[e.slot] = e; });

  DATA.categorias.forEach(cat => {
    const col = document.getElementById(cat.side === 'left' ? 'arena-left' : 'arena-right');
    const group = document.createElement('div');
    group.className = 'cat-group';

    const lbl = document.createElement('div');
    lbl.className   = 'cat-label';
    lbl.textContent = cat.label;
    group.appendChild(lbl);

    const row = document.createElement('div');
    row.className = 'slots-row';
    cat.slots.forEach(s => {
      const e = slotMap[s];
      if (e) row.appendChild(buildCard(e));
    });
    group.appendChild(row);
    col.appendChild(group);
  });
}

/* ══════════════════════════════════════════════════════════════
   RENDER: LEADERBOARD
   Sorted by total desc. Avatar from assets/equipos/Equipo-N.png
══════════════════════════════════════════════════════════════ */
function renderLeaderboard() {
  const sorted = [...DATA.equipos].sort((a, b) => b.total - a.total);
  const col = document.getElementById('lb-column');
  col.innerHTML = '';

  sorted.forEach((eq, i) => {
    const rank    = i + 1;
    const isFinal = rank <= 4;
    const initials = eq.nombre.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const row = document.createElement('div');
    row.className = 'lb-entry' + (isFinal ? ' top4' : '');
    row.dataset.slot = eq.slot;
    row.dataset.rank = rank;
    row.style.animationDelay = (i * 40) + 'ms';

    row.innerHTML =
      '<div class="lb-rank">' + rank + '</div>' +
      '<div class="lb-avatar">' +
        '<img src="assets/equipos/Equipo-' + eq.slot + '.png" alt="' + eq.nombre + '" ' +
          'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' +
        '<span style="display:none;width:100%;height:100%;align-items:center;justify-content:center">' + initials + '</span>' +
      '</div>' +
      '<div class="lb-info">' +
        '<div class="lb-name">' + eq.nombre + '</div>' +
        '<div class="lb-pts-label">pts</div>' +
      '</div>' +
      '<div><div class="lb-pts">' + eq.total.toLocaleString() + '</div></div>';

    applyLbRowStyle(row, eq, false);

    row.addEventListener('mouseenter', () => selectSlot(eq.slot));
    row.addEventListener('mouseleave', deselect);

    col.appendChild(row);
  });
}

/* ══════════════════════════════════════════════════════════════
   RENDER: DETAIL TABLE
   Sorted alphabetically. Score columns come from CSV headers
   (everything between 'disenador' and 'total').
══════════════════════════════════════════════════════════════ */
function renderDetailTable() {
  const sorted = [...DATA.equipos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const cols   = DATA.scoreColumns;
  const tbl    = document.getElementById('detail-table');

  /* Header */
  let head = '<thead><tr><th>Equipo</th>';
  cols.forEach(c => { head += '<th>' + c + '</th>'; });
  head += '<th>Total</th></tr></thead>';

  /* Body */
  let body = '<tbody>';
  sorted.forEach(eq => {
    const ia = IA[eq.ia] || DEF;
    body += '<tr class="data-row" data-slot="' + eq.slot + '" style="cursor:pointer" ' +
            'onmouseenter="selectSlot(' + eq.slot + ')" onmouseleave="deselect()">';
    body += '<td>' + eq.nombre + '</td>';
    eq.scores.forEach(pts => {
      const val = pts !== null ? pts : '—';
      body += '<td class="pts-cell" style="color:' + ia.color + '">' + val + '</td>';
    });
    body += '<td class="total-cell" style="color:' + ia.color + '">' + eq.total.toLocaleString() + '</td>';
    body += '</tr>';
  });
  body += '</tbody>';

  tbl.innerHTML = head + body;
}

/* ══════════════════════════════════════════════════════════════
   RENDER: PAGE (header, info strip, video, descriptions)
══════════════════════════════════════════════════════════════ */
function renderPage() {
  const { info, equipos } = DATA;

  document.title = 'AI Arena – ' + (info.edition || '');
  document.getElementById('hd-edition').textContent = info.edition || '';
  document.getElementById('ft-org').textContent     = info.organizer || 'AI Arena';

  /* Info chips */
  document.getElementById('info-strip').innerHTML = [
    { label: 'Sede',     value: info.location },
    { label: 'Horario',  value: info.time },
    { label: 'Equipos',  value: equipos.length + ' participantes' },
  ].filter(c => c.value)
   .map(c => '<div class="info-chip"><div class="label">' + c.label + '</div><div class="value">' + c.value + '</div></div>')
   .join('');

  /* Video */
  const vs = document.getElementById('video-section');
  const yt  = (info.youtube || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  vs.innerHTML = yt
    ? '<iframe class="yt-iframe" src="https://www.youtube.com/embed/' + yt[1] + '" title="' +
      (info.videoTitle || 'Video') + '" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen loading="lazy"></iframe>'
    : '<div class="video-placeholder" onclick="window.open(\'' + info.youtube + '\',\'_blank\')">' +
      '<div class="play-btn"><svg width="20" height="20" viewBox="0 0 20 20" fill="#fff"><polygon points="6,3 17,10 6,17"/></svg></div>' +
      '<p class="video-title-text">' + (info.videoTitle || 'Ver Video') + '</p></div>';

  /* Descriptions */
  document.getElementById('event-desc').innerHTML  = '<p>' + (info.descripcion    || '') + '</p>';
  document.getElementById('event-extra').innerHTML = '<p>' + (info.infoAdicional  || '') + '</p>';
}

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
window.selectSlot = selectSlot;
window.deselect   = deselect;

loadData().then(() => {
  renderPage();
  renderCompetitors();
  renderLeaderboard();
  renderDetailTable();
}).catch(err => {
  console.error('Error cargando datos:', err);
  document.body.innerHTML = '<p style="color:#FF4444;padding:2rem;font-family:monospace">Error cargando datos CSV. Verifica que data/config.csv y data/equipos.csv existen y el servidor está activo.</p>';
});
