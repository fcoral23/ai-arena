'use strict';

/* ══════════════════════════════════════════════════════════════
   CONFIGURACIÓN DE CATEGORÍAS / SLOTS

   Cada categoría tiene:
     label  — nombre que aparece en el arena
     side   — 'left' | 'right'
     slots  — lista de números de slot (en orden de izquierda a derecha)

   El último slot de 'left' y el primero de 'right' quedan más cerca
   del centro. Cambia el orden dentro de slots[] para reordenar.
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
   CSV PARSER — UTF-8 explícito + maneja comas dentro de comillas
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
   DATA LOADING — fuerza UTF-8 para acentos
══════════════════════════════════════════════════════════════ */
let DATA = {};

async function loadData() {
  const decode = buf => new TextDecoder('utf-8').decode(buf);
  const [cfgText, eqText] = await Promise.all([
    fetch('data/config.csv').then(r => r.arrayBuffer()).then(decode),
    fetch('data/equipos.csv').then(r => r.arrayBuffer()).then(decode),
  ]);

  const cfgRows = parseCSV(cfgText);
  const info = {};
  cfgRows.forEach(r => { info[r.campo] = r.valor; });

  const eqRows = parseCSV(eqText);
  const allHeaders = Object.keys(eqRows[0]);
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
let expandedGroup = null;  // slots-row actualmente expandido
const slotMap = {};

/* ══════════════════════════════════════════════════════════════
   CENTER IMAGE LOADER
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
   SHOW SLOT — actualiza el centro con el equipo del slot dado
══════════════════════════════════════════════════════════════ */
function showSlot(slot) {
  if (selectedSlot === slot) return;
  selectedSlot = slot;
  const eq = slotMap[slot];
  const ia = IA[eq.ia] || DEF;

  playHoverSound();

  /* Imagen central */
  const cImg = document.getElementById('center-img');
  cImg.classList.remove('visible');
  loadCenterImg(cImg, slot, el => el.classList.add('visible'), () => {});

/* Nombre del equipo */
  const nameEl = document.getElementById('team-name');
  if (nameEl) {
    nameEl.textContent = eq.nombre;
    
    // Quitamos las líneas que ponían color y shadow en ''
    nameEl.classList.add('visible');

    clearTimeout(nameEl.hideTimer);
    nameEl.hideTimer = setTimeout(() => {
        nameEl.classList.remove('visible');
    }, 1000);
  }

document.getElementById('choose-text').style.opacity='0';

  /* Operadores arriba */
  const opsBar = document.getElementById('ops-bar');
  opsBar.innerHTML =
    '<span class="ops-label">Operadores</span>' +
    '<span class="ops-names">' + eq.op1 + ' · ' + eq.op2 + ' · ' + eq.op3 + '</span>';
  opsBar.style.opacity = '1';

  /* Diseñador abajo */
  const dc = document.getElementById('design-credit');
  dc.innerHTML = 'Diseño: <em>' + eq.disenador + '</em>';
  dc.style.opacity = '1';

  /* Highlight slots */
  document.querySelectorAll('.slot-wrap').forEach(w => {
    w.classList.toggle('active', parseInt(w.dataset.slot) === slot);
  });

  /* Highlight leaderboard */
  document.querySelectorAll('.lb-entry').forEach(row => {
    const s = parseInt(row.dataset.slot);
    const req = slotMap[s];
    
    if (s === slot) {
      row.classList.add('selected'); // Activa crecimiento + imagen circular
    } else {
      row.classList.remove('selected'); // Oculta imagen + tamaño normal
    }
    
    applyLbRowStyle(row, req, s === slot);
});

  /* Highlight tabla */
  document.querySelectorAll('#detail-table tr.data-row').forEach(r => {
    r.classList.toggle('row-selected', parseInt(r.dataset.slot) === slot);
  });
}

/* ══════════════════════════════════════════════════════════════
   SELECT — llamado desde hover
══════════════════════════════════════════════════════════════ */
function selectSlot(slot) {
  showSlot(slot);
}


/* ══════════════════════════════════════════════════════════════
   DESELECT — llamado desde mouseleave
══════════════════════════════════════════════════════════════ */
function deselect() {
  if (pinnedSlot !== null) return; // hay pin, no deseleccionar

  selectedSlot = null;
  document.getElementById('center-img').classList.remove('visible');
  const nameEl = document.getElementById('team-name');
  nameEl.classList.remove('visible');
  nameEl.textContent = '';
  document.getElementById('choose-text').style.opacity = '1';
  document.getElementById('ops-bar').style.opacity = '0';
  document.getElementById('design-credit').style.opacity = '0';

  document.querySelectorAll('.slot-wrap').forEach(w => w.classList.remove('active'));

  document.querySelectorAll('.lb-entry').forEach(row => {
    applyLbRowStyle(row, slotMap[parseInt(row.dataset.slot)], false);
  });

  document.querySelectorAll('#detail-table tr.data-row').forEach(r => r.classList.remove('row-selected'));
}

/* ══════════════════════════════════════════════════════════════
   LEADERBOARD ROW STYLE
══════════════════════════════════════════════════════════════ */
function applyLbRowStyle(row, eq, force) {
  if (!eq) return;
  const rank = parseInt(row.dataset.rank);
  const ia = IA[eq.ia] || DEF;
  
  // Puntos desde la columna 'total'
  const puntosValor = eq.total !== undefined ? eq.total : 0; 
  const ptsEl = row.querySelector('.lb-pts');
  if (ptsEl) ptsEl.textContent = puntosValor + " PTS";

  row.style.border = 'none';

  if (rank <= 4) {
    // TOP 4
    row.style.setProperty('background', ia.color, 'important');
    row.querySelectorAll('.lb-name, .lb-rank, .lb-pts').forEach(el => {
      el.style.color = '#000';
      el.style.fontSize = "1rem";
    });
  } else if (rank <= 8) {
    // MID 4
    row.style.setProperty('background', 'rgba(0,0,0,0.5)', 'important');
    row.style.setProperty('border', `1.5px solid ${ia.color}`, 'important');
    row.querySelectorAll('.lb-name, .lb-pts').forEach(el => {
      el.style.color = '#fff';
      el.style.fontSize = "0.9rem";
    });
    row.querySelector('.lb-rank').style.color = ia.color;
  } else {
    // BOTTOM 8
    row.style.setProperty('background', 'rgba(255,255,255,0.04)', 'important');
    row.querySelectorAll('.lb-name, .lb-pts, .lb-rank').forEach(el => {
      el.style.color = 'var(--text-muted)';
      el.style.fontSize = "0.85rem";
    });
  }
}

// BUSCA EN TU JS LA PARTE DE "Highlight leaderboard" DENTRO DE showSlot
// Y REEMPLÁZALA CON ESTA:

/* Highlight leaderboard */
document.querySelectorAll('.lb-entry').forEach(row => {
    const s = parseInt(row.dataset.slot);
    const req = slotMap[s]; // slotMap debe contener los datos del equipo incluyendo .total
    
    if (s === slot) {
      row.classList.add('selected');
    } else {
      row.classList.remove('selected');
    }
    applyLbRowStyle(row, req, s === slot);
});

/* ══════════════════════════════════════════════════════════════
   COLLAPSE ALL — contrae todos los grupos expandidos
══════════════════════════════════════════════════════════════ */
function collapseAll() {
  document.querySelectorAll('.slots-row.expanded').forEach(r => r.classList.remove('expanded'));
  document.querySelectorAll('.cat-group.expanded').forEach(g => g.classList.remove('expanded'));
  expandedGroup = null;
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
    const init = document.createElement('div');
    init.className   = 'slot-initials';
    init.textContent = eq.nombre.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
    wrap.appendChild(init);
  };

  wrap.appendChild(img);
  wrap.addEventListener('mouseenter', () => {
    // hover solo funciona si el grupo ya está expandido O si es desktop (sin touch)
    if (!window.matchMedia('(hover:none)').matches) {
      selectSlot(eq.slot);
    } else if (expandedGroup && wrap.closest('.slots-row') === expandedGroup) {
      selectSlot(eq.slot);
    }
  });
  wrap.addEventListener('mouseleave', () => {
    if (!window.matchMedia('(hover:none)').matches) deselect();
  });
  wrap.addEventListener('click', (e) => {
    e.stopPropagation();
    const row = wrap.closest('.slots-row');
    const group = wrap.closest('.cat-group');
    if (!row.classList.contains('expanded')) {
      // primer tap: expandir el grupo
      collapseAll();
      row.classList.add('expanded');
      group.classList.add('expanded');
      expandedGroup = row;
    } else {
      // segundo tap: seleccionar personaje y contraer
      selectSlot(eq.slot);
      collapseAll();
    }
  });
  return wrap;
}

/* ══════════════════════════════════════════════════════════════
   RENDER: ARENA
══════════════════════════════════════════════════════════════ */
function renderCompetitors() {
  DATA.equipos.forEach(e => { slotMap[e.slot] = e; });

  DATA.categorias.forEach(cat => {
    const col = document.getElementById(cat.side === 'left' ? 'arena-left' : 'arena-right');
    const group = document.createElement('div');
    group.className = 'cat-group';

    const row = document.createElement('div');
    row.className = 'slots-row';
    cat.slots.forEach(s => {
      const e = slotMap[s];
      if (e) row.appendChild(buildCard(e));
    });
    group.appendChild(row);

    const lbl = document.createElement('div');
    lbl.className   = 'cat-label';
    lbl.textContent = cat.label;
    group.appendChild(lbl);
    col.appendChild(group);
  });
}

/* ══════════════════════════════════════════════════════════════
   RENDER: LEADERBOARD
══════════════════════════════════════════════════════════════ */
function renderLeaderboard() {
  const sorted = [...DATA.equipos].sort((a, b) => b.total - a.total);
  const col = document.getElementById('lb-column');
  col.innerHTML = '';

  sorted.forEach((eq, i) => {
    const rank     = i + 1;
    const isFinal  = rank <= 4;
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
    row.addEventListener('click',      () => selectSlot(eq.slot));
    col.appendChild(row);
  });
}

/* ══════════════════════════════════════════════════════════════
   RENDER: DETAIL TABLE
   Columnas de puntos vienen del CSV (entre disenador y total).
══════════════════════════════════════════════════════════════ */
function renderDetailTable() {
  const sorted = [...DATA.equipos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const cols   = DATA.scoreColumns;
  const tbl    = document.getElementById('detail-table');

  let head = '<thead><tr><th>Equipo</th>';
  cols.forEach(c => { head += '<th>' + c + '</th>'; });
  head += '<th>Total</th></tr></thead>';

  let body = '<tbody>';
  sorted.forEach(eq => {
    const ia = IA[eq.ia] || DEF;
    body += '<tr class="data-row" data-slot="' + eq.slot + '">';
    body += '<td>' + eq.nombre + '</td>';
    eq.scores.forEach(pts => {
      body += '<td class="pts-cell" style="color:' + ia.color + '">' + (pts !== null ? pts : '—') + '</td>';
    });
    body += '<td class="total-cell" style="color:' + ia.color + '">' + eq.total.toLocaleString() + '</td>';
    body += '</tr>';
  });
  body += '</tbody>';

  tbl.innerHTML = head + body;

  /* eventos en filas */
  tbl.querySelectorAll('tr.data-row').forEach(r => {
    const s = parseInt(r.dataset.slot);
    r.addEventListener('mouseenter', () => selectSlot(s));
    r.addEventListener('mouseleave', deselect);
    r.addEventListener('click',      () => selectSlot(s));
  });
}

/* ══════════════════════════════════════════════════════════════
   RENDER: PAGE INFO
══════════════════════════════════════════════════════════════ */
function renderPage() {
  const { info, equipos } = DATA;

  document.title = 'AI Arena – ' + (info.edition || '');
  document.getElementById('hd-edition').textContent = info.edition || '';
  document.getElementById('ft-org').textContent     = info.organizer || 'AI Arena';

  document.getElementById('info-strip').innerHTML = [
    { label: 'Sede',     value: info.location },
    { label: 'Horario',  value: info.time },
    { label: 'Equipos',  value: equipos.length + ' participantes' },
  ].filter(c => c.value)
   .map(c => '<div class="info-chip"><div class="label">' + c.label + '</div><div class="value">' + c.value + '</div></div>')
   .join('');

  const vs = document.getElementById('video-section');
  const yt  = (info.youtube || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
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
window.selectSlot = selectSlot;
window.deselect   = deselect;
window.collapseAll = collapseAll;

// Tap fuera del arena colapsa grupos
document.addEventListener('click', (e) => {
  if (!e.target.closest('.arena-section')) collapseAll();
});

loadData().then(() => {
  renderPage();
  renderCompetitors();
  renderLeaderboard();
  renderDetailTable();
}).catch(err => {
  console.error('Error cargando datos:', err);
  document.body.innerHTML = '<p style="color:#FF4444;padding:2rem;font-family:monospace">Error cargando datos CSV. Verifica que data/config.csv y data/equipos.csv existen y el servidor está activo.</p>';
});
