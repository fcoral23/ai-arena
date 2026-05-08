'use strict';

/* ══════════════════════════════════════════════════════════════
   CONFIGURACIÓN DE CATEGORÍAS / SLOTS
   label  — nombre visible en el arena
   side   — 'left' | 'right'
   slots  — números de slot en orden visual (izq → der)
══════════════════════════════════════════════════════════════ */
const CATEGORIAS = [
  { label: 'ROBOT',   side: 'left',  slots: [1, 2, 3, 4]    },
  { label: 'ANDROID', side: 'left',  slots: [9, 10, 11, 12]  },
  { label: 'NATURE',  side: 'right', slots: [5, 6, 7, 8]    },
  { label: 'UNKNOWN', side: 'right', slots: [13, 14, 15, 16] },
];

/* ── IA palette ── */
const IA = {
  O: { nombre:'ChatGPT', color:'#10a37f', glow2:'rgba(16,163,127,.15)' },
  A: { nombre:'Claude',  color:'#f97316', glow2:'rgba(249,115,22,.15)'  },
  G: { nombre:'Gemini',  color:'#a855f7', glow2:'rgba(168,85,247,.15)'  },
};
const DEF = { color:'#D42020', glow2:'rgba(212,32,32,.15)' };

/* ══════════════════════════════════════════════════════════════
   CSV PARSER — UTF-8 explícito, maneja comillas
══════════════════════════════════════════════════════════════ */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').trim(); });
    return obj;
  });
}
function splitLine(line) {
  const out = []; let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else { cur += c; }
  }
  out.push(cur);
  return out;
}

/* ══════════════════════════════════════════════════════════════
   DATA
══════════════════════════════════════════════════════════════ */
let DATA = {};

async function loadData() {
  const dec = buf => new TextDecoder('utf-8').decode(buf);
  const [cfgTxt, eqTxt] = await Promise.all([
    fetch('data/config.csv').then(r => r.arrayBuffer()).then(dec),
    fetch('data/equipos.csv').then(r => r.arrayBuffer()).then(dec),
  ]);

  const info = {};
  parseCSV(cfgTxt).forEach(r => { info[r.campo] = r.valor; });

  const eqRows = parseCSV(eqTxt);
  const allH   = Object.keys(eqRows[0]);
  const iDis   = allH.indexOf('disenador');
  const iTotal = allH.indexOf('total');
  const scoreCols = allH.slice(iDis + 1, iTotal);

  const equipos = eqRows.map(r => ({
    slot:      parseInt(r.slot),
    nombre:    r.nombre,
    ia:        r.ia,
    op1:       r.op1, op2: r.op2, op3: r.op3,
    disenador: r.disenador,
    scores:    scoreCols.map(c => r[c] !== '' ? parseFloat(r[c]) : null),
    total:     parseFloat(r.total) || 0,
  }));

  DATA = { info, equipos, scoreCols };
}

/* ══════════════════════════════════════════════════════════════
   SOUND
══════════════════════════════════════════════════════════════ */
let _ac = null;
function playSound() {
  try {
    if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = _ac.createOscillator(), g = _ac.createGain();
    o.connect(g); g.connect(_ac.destination);
    o.type = 'triangle';
    o.frequency.setValueAtTime(660, _ac.currentTime);
    o.frequency.setValueAtTime(990, _ac.currentTime + .06);
    g.gain.setValueAtTime(0, _ac.currentTime);
    g.gain.linearRampToValueAtTime(.1, _ac.currentTime + .02);
    g.gain.exponentialRampToValueAtTime(.0001, _ac.currentTime + .22);
    o.start(); o.stop(_ac.currentTime + .22);
  } catch(e) {}
}

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */
let activeSlot = null;
const slotMap  = {};
let nameTimer  = null;

/* ══════════════════════════════════════════════════════════════
   CENTER IMAGE — prueba extensiones en orden
══════════════════════════════════════════════════════════════ */
function loadCenterImg(el, slot) {
  const exts = ['png','jpg','jpeg','webp','gif','bmp'];
  let i = 0;
  el.classList.remove('visible');
  function next() {
    if (i >= exts.length) return;
    el.onload  = () => el.classList.add('visible');
    el.onerror = next;
    el.src = 'assets/equipos/Equipo-' + slot + '.' + exts[i++];
  }
  next();
}

/* ══════════════════════════════════════════════════════════════
   SHOW SLOT
══════════════════════════════════════════════════════════════ */
function showSlot(slot) {
  if (activeSlot === slot) return;
  activeSlot = slot;
  const eq = slotMap[slot];
  const ia = IA[eq.ia] || DEF;

  playSound();

  /* imagen */
  loadCenterImg(document.getElementById('center-img'), slot);

  /* nombre del equipo — aparece 2 s luego desaparece */
  const nameEl = document.getElementById('team-name');
  nameEl.textContent = eq.nombre;
  nameEl.style.color = ia.color;
  nameEl.style.textShadow = '-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 0 20px ' + ia.color;
  nameEl.classList.add('visible');
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => nameEl.classList.remove('visible'), 2000);

  document.getElementById('choose-text').style.opacity = '0';

  /* operadores */
  const ops = document.getElementById('ops-bar');
  ops.innerHTML =
    '<span class="ops-label">Operadores</span>' +
    '<span class="ops-names">' + eq.op1 + ' · ' + eq.op2 + ' · ' + eq.op3 + '</span>';
  ops.style.opacity = '1';

  /* diseñador */
  const dc = document.getElementById('design-credit');
  dc.innerHTML = 'Diseño: <em>' + eq.disenador + '</em>';
  dc.style.opacity = '1';

  /* slots highlight */
  document.querySelectorAll('.slot-wrap').forEach(w =>
    w.classList.toggle('active', parseInt(w.dataset.slot) === slot));

  /* leaderboard highlight */
  document.querySelectorAll('.lb-entry').forEach(row => {
    const isThis = parseInt(row.dataset.slot) === slot;
    row.classList.toggle('selected', isThis);
    styleLbRow(row, slotMap[parseInt(row.dataset.slot)]);
  });

  /* tabla highlight */
  document.querySelectorAll('#detail-table tr.data-row').forEach(r =>
    r.classList.toggle('row-selected', parseInt(r.dataset.slot) === slot));
}

/* ══════════════════════════════════════════════════════════════
   DESELECT
══════════════════════════════════════════════════════════════ */
function deselect() {
  activeSlot = null;

  document.getElementById('center-img').classList.remove('visible');
  const nameEl = document.getElementById('team-name');
  clearTimeout(nameTimer);
  nameEl.classList.remove('visible');
  document.getElementById('choose-text').style.opacity = '1';
  document.getElementById('ops-bar').style.opacity     = '0';
  document.getElementById('design-credit').style.opacity = '0';

  document.querySelectorAll('.slot-wrap').forEach(w => w.classList.remove('active'));
  document.querySelectorAll('.lb-entry').forEach(row => {
    row.classList.remove('selected');
    styleLbRow(row, slotMap[parseInt(row.dataset.slot)]);
  });
  document.querySelectorAll('#detail-table tr.data-row').forEach(r =>
    r.classList.remove('row-selected'));
}

/* ══════════════════════════════════════════════════════════════
   LEADERBOARD ROW STYLE — limpio, sin duplicados
══════════════════════════════════════════════════════════════ */
function styleLbRow(row, eq) {
  if (!eq) return;
  const rank    = parseInt(row.dataset.rank);
  const ia      = IA[eq.ia] || DEF;
  const selected = row.classList.contains('selected');

  if (rank <= 4) {
    row.style.background  = selected ? ia.color + '33' : ia.color + '18';
    row.style.borderColor = ia.color + '88';
    row.style.boxShadow   = '0 0 10px ' + ia.glow2;
  } else if (rank <= 8) {
    row.style.background  = selected ? ia.color + '22' : 'transparent';
    row.style.borderColor = selected ? ia.color + '88' : ia.color + '44';
    row.style.boxShadow   = selected ? '0 0 8px ' + ia.glow2 : 'none';
  } else {
    row.style.background  = selected ? 'rgba(255,255,255,.05)' : 'transparent';
    row.style.borderColor = selected ? 'rgba(255,255,255,.2)' : 'transparent';
    row.style.boxShadow   = 'none';
  }
}

/* ══════════════════════════════════════════════════════════════
   BUILD SLOT CARD
══════════════════════════════════════════════════════════════ */
function buildCard(eq) {
  const wrap = document.createElement('div');
  wrap.className    = 'slot-wrap';
  wrap.dataset.slot = eq.slot;

  const img = document.createElement('img');
  img.src = 'assets/slots/slot-' + eq.slot + '.png';
  img.alt = eq.nombre;
  img.onerror = () => {
    img.style.display = 'none';
    const fb = document.createElement('div');
    fb.className   = 'slot-initials';
    fb.textContent = eq.nombre.split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();
    wrap.appendChild(fb);
  };

  wrap.appendChild(img);
  wrap.addEventListener('mouseenter', () => showSlot(eq.slot));
  wrap.addEventListener('mouseleave', deselect);
  wrap.addEventListener('click',      () => showSlot(eq.slot));
  return wrap;
}

/* ══════════════════════════════════════════════════════════════
   RENDER: ARENA
══════════════════════════════════════════════════════════════ */
function renderArena() {
  DATA.equipos.forEach(e => { slotMap[e.slot] = e; });

  CATEGORIAS.forEach(cat => {
    const col = document.getElementById(cat.side === 'left' ? 'arena-left' : 'arena-right');
    const group = document.createElement('div');
    group.className = 'cat-group';

    const row = document.createElement('div');
    row.className = 'slots-row';
    cat.slots.forEach(s => { if (slotMap[s]) row.appendChild(buildCard(slotMap[s])); });
    group.appendChild(row);

    const lbl = document.createElement('div');
    lbl.className   = 'cat-label';
    lbl.textContent = cat.label;
    group.appendChild(lbl);

    col.appendChild(group);
  });
}

/* ══════════════════════════════════════════════════════════════
   RENDER: LEADERBOARD — 4 grupos en 4 columnas
══════════════════════════════════════════════════════════════ */
const LB_GROUPS = [
  { label: 'Finalistas',  from: 1,  to: 4  },
  { label: 'Perseguidores', from: 5,  to: 8  },
  { label: 'Zona Media',  from: 9,  to: 12 },
  { label: 'Remontando',  from: 13, to: 16 },
];

function renderLeaderboard() {
  const sorted = [...DATA.equipos].sort((a, b) => b.total - a.total);
  const wrap   = document.getElementById('lb-column');
  wrap.innerHTML = '';

  LB_GROUPS.forEach(group => {
    const col = document.createElement('div');
    col.className = 'lb-group';

    const hdr = document.createElement('div');
    hdr.className   = 'lb-group-header';
    hdr.textContent = group.label;
    col.appendChild(hdr);

    for (let rank = group.from; rank <= group.to; rank++) {
      const eq = sorted[rank - 1];
      if (!eq) continue;
      const ia       = IA[eq.ia] || DEF;
      const initials = eq.nombre.split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();

      const row = document.createElement('div');
      row.className = 'lb-entry' + (rank <= 4 ? ' top4' : '');
      row.dataset.slot = eq.slot;
      row.dataset.rank = rank;
      row.style.animationDelay = ((rank - 1) * 35) + 'ms';

      row.innerHTML =
        '<div class="lb-rank">' + rank + '</div>' +
        '<div class="lb-avatar">' +
          '<img src="assets/equipos/Equipo-' + eq.slot + '.png" alt="' + eq.nombre + '" ' +
            'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' +
          '<span style="display:none;width:100%;height:100%;align-items:center;justify-content:center">' + initials + '</span>' +
        '</div>' +
        '<div class="lb-info">' +
          '<div class="lb-name">' + eq.nombre + '</div>' +
        '</div>' +
        '<div class="lb-pts">' + eq.total.toLocaleString() + '</div>';

      styleLbRow(row, eq);
      row.addEventListener('mouseenter', () => showSlot(eq.slot));
      row.addEventListener('mouseleave', deselect);
      row.addEventListener('click',      () => showSlot(eq.slot));
      col.appendChild(row);
    }

    wrap.appendChild(col);
  });
}

/* ══════════════════════════════════════════════════════════════
   RENDER: DETAIL TABLE
══════════════════════════════════════════════════════════════ */
function renderTable() {
  const sorted = [...DATA.equipos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const tbl    = document.getElementById('detail-table');

  let h = '<thead><tr><th>Equipo</th>';
  DATA.scoreCols.forEach(c => { h += '<th>' + c + '</th>'; });
  h += '<th>Total</th></tr></thead><tbody>';

  sorted.forEach(eq => {
    const ia = IA[eq.ia] || DEF;
    h += '<tr class="data-row" data-slot="' + eq.slot + '">';
    h += '<td>' + eq.nombre + '</td>';
    eq.scores.forEach(v => {
      h += '<td class="pts-cell" style="color:' + ia.color + '">' + (v !== null ? v : '—') + '</td>';
    });
    h += '<td class="total-cell" style="color:' + ia.color + '">' + eq.total.toLocaleString() + '</td>';
    h += '</tr>';
  });
  h += '</tbody>';
  tbl.innerHTML = h;

  tbl.querySelectorAll('tr.data-row').forEach(r => {
    const s = parseInt(r.dataset.slot);
    r.addEventListener('mouseenter', () => showSlot(s));
    r.addEventListener('mouseleave', deselect);
    r.addEventListener('click',      () => showSlot(s));
  });
}

/* ══════════════════════════════════════════════════════════════
   RENDER: PAGE
══════════════════════════════════════════════════════════════ */
function renderPage() {
  const { info, equipos } = DATA;
  document.title = 'AI Arena – ' + (info.edition || '');
  document.getElementById('hd-edition').textContent = info.edition || '';
  document.getElementById('ft-org').textContent     = info.organizer || 'AI Arena';

  document.getElementById('info-strip').innerHTML = [
    { label:'Sede',    value: info.location },
    { label:'Horario', value: info.time },
    { label:'Equipos', value: equipos.length + ' participantes' },
  ].filter(c => c.value)
   .map(c => '<div class="info-chip"><div class="label">' + c.label + '</div><div class="value">' + c.value + '</div></div>')
   .join('');

  const vs = document.getElementById('video-section');
  const yt = (info.youtube || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  vs.innerHTML = yt
    ? '<iframe class="yt-iframe" src="https://www.youtube.com/embed/' + yt[1] +
      '" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen loading="lazy"></iframe>'
    : '<div class="video-placeholder" onclick="window.open(\'' + (info.youtube||'') + '\',\'_blank\')">' +
      '<div class="play-btn"><svg width="20" height="20" viewBox="0 0 20 20" fill="#fff"><polygon points="6,3 17,10 6,17"/></svg></div>' +
      '<p class="video-title-text">' + (info.videoTitle || 'Ver Video') + '</p></div>';

  document.getElementById('event-desc').innerHTML  = '<p>' + (info.descripcion   || '') + '</p>';
  document.getElementById('event-extra').innerHTML = '<p>' + (info.infoAdicional || '') + '</p>';
}

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
window.showSlot = showSlot;
window.deselect = deselect;

loadData().then(() => {
  renderPage();
  renderArena();
  renderLeaderboard();
  renderTable();
}).catch(err => {
  console.error(err);
  document.body.innerHTML = '<p style="color:#FF4444;padding:2rem;font-family:monospace">Error cargando CSVs. Verifica data/config.csv y data/equipos.csv.</p>';
});
