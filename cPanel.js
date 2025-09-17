/********************
 * Firebase + Firestore (Compat)
 ********************/
const USE_FIREBASE = true; // poné false si querés 100% local
const firebaseConfig = {
  apiKey: "AIzaSyB-Mx5Qqwg6KFMJSA-yUb-DFo7UjfqCpKY",
  authDomain: "aclinadev.firebaseapp.com",
  projectId: "aclinadev",
  storageBucket: "aclinadev.firebasestorage.app",
  messagingSenderId: "401991392253",
  appId: "1:401991392253:web:92400bc5d2503ed6879794",
};

let db = null;
if (USE_FIREBASE && window.firebase) {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log('Firestore listo');
  } catch (e){ console.warn('Error init Firebase, usando localStorage', e); }
}
if (USE_FIREBASE) {
  if (!window.firebase) {
    alert('⚠️ Firebase compat no cargó en cPanel.html. Agrega los <script> compat en el <head>.');
  } else if (!db) {
    alert('⚠️ Firebase cargó pero Firestore no inicializó. Revisa consola o reglas de seguridad.');
  }
}

/********************
 * Estado + persistencia (localStorage)
 ********************/
const LS_KEYS = {
  tasks:'kanban.tasks.v1', tipos:'kanban.tipos.v1', techs:'kanban.techs.v1',
  products:'kanban.products.v1', settings:'kanban.settings.v1', log:'kanban.log.v1'
};
const defaultTipos = [
  { name:'Presupuesto', color:'#8e9bff' },
  { name:'Aceptado', color:'#2ecc71' },
  { name:'No Aceptado', color:'#ff6b6b' },
  { name:'Garantia F', color:'#f6ad55' },
  { name:'Garantia T', color:'#56ccf2' },
  { name:'Tarea Común', color:'#b48ef5' }
];
const defaultSettings = { budgetMaxH:48, deliveryMinH:24, deliveryMaxH:120, glowBudgetH:24, glowDeliveryH:48 };

function now(){ return new Date().toISOString(); }
function loadLS(k,f){ try{ return JSON.parse(localStorage.getItem(k)) ?? f; }catch{ return f; } }
function saveLS(k,v){ localStorage.setItem(k, JSON.stringify(v)); }

let state = {
  tasks: loadLS(LS_KEYS.tasks, []),
  tipos: loadLS(LS_KEYS.tipos, defaultTipos),
  techs: loadLS(LS_KEYS.techs, [{name:'Técnico 1', color:'#ffb703'},{name:'Técnico 2', color:'#3a86ff'}]),
  products: loadLS(LS_KEYS.products, ['Notebook','PC','Celular','Impresora']),
  settings: loadLS(LS_KEYS.settings, defaultSettings),
  log: loadLS(LS_KEYS.log, []),
};

function log(action, payload){
  state.log.push({ ts: now(), action, payload });
  saveLS(LS_KEYS.log, state.log);
  scheduleCloudSave();
}

/********************
 * Firestore sync (doc único) + tiempo real
 ********************/
const CLOUD = { col: 'kanban', doc: 'state' };
let cloudSaveTimer = null;
let unsubSnapshot = null;

function scheduleCloudSave(){
  if (!db) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(async ()=>{
    try { await db.collection(CLOUD.col).doc(CLOUD.doc).set(state); }
    catch(err){ console.warn('cloudSave error', err); }
  }, 400);
}

async function cloudLoad(){ // (queda por compatibilidad pero no se llama en el boot)
  if (!db) return;
  try{
    const snap = await db.collection(CLOUD.col).doc(CLOUD.doc).get();
    if (snap.exists){
      const cloud = snap.data() || {};
      state = {
        ...state,
        ...cloud,
        tasks: cloud.tasks || state.tasks || [],
        tipos: cloud.tipos || state.tipos || [],
        techs: cloud.techs || state.techs || [],
        products: cloud.products || state.products || [],
        settings: cloud.settings || state.settings || {},
        log: cloud.log || state.log || [],
      };
      // persistimos local
      saveLS(LS_KEYS.tasks, state.tasks);
      saveLS(LS_KEYS.tipos, state.tipos);
      saveLS(LS_KEYS.techs, state.techs);
      saveLS(LS_KEYS.products, state.products);
      saveLS(LS_KEYS.settings, state.settings);
      saveLS(LS_KEYS.log, state.log);
      renderBoard();
    }
  }catch(err){ console.warn('cloudLoad error', err); }
}

// NUEVO: asegura doc en nube (si no existe, sube tu local) y suscribe onSnapshot
async function ensureCloudAndSubscribe(){
  if (!db) return;

  const ref = db.collection(CLOUD.col).doc(CLOUD.doc);

  try {
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set(state); // primer push con tu estado local
      console.log('Cloud inicializado con estado local.');
    } else {
      const cloud = snap.data() || {};
      state = {
        ...state,
        tasks: Array.isArray(cloud.tasks) ? cloud.tasks : state.tasks,
        tipos: Array.isArray(cloud.tipos) ? cloud.tipos : state.tipos,
        techs: Array.isArray(cloud.techs) ? cloud.techs : state.techs,
        products: Array.isArray(cloud.products) ? cloud.products : state.products,
        settings: cloud.settings ?? state.settings,
        log: Array.isArray(cloud.log) ? cloud.log : state.log,
      };
      saveLS(LS_KEYS.tasks, state.tasks);
      saveLS(LS_KEYS.tipos, state.tipos);
      saveLS(LS_KEYS.techs, state.techs);
      saveLS(LS_KEYS.products, state.products);
      saveLS(LS_KEYS.settings, state.settings);
      saveLS(LS_KEYS.log, state.log);
      console.log('Estado sincronizado desde la nube.');
    }

    if (unsubSnapshot) unsubSnapshot();
    unsubSnapshot = ref.onSnapshot(docSnap=>{
      if (!docSnap.exists) return;
      const cloud = docSnap.data() || {};
      state = {
        ...state,
        tasks: Array.isArray(cloud.tasks) ? cloud.tasks : state.tasks,
        tipos: Array.isArray(cloud.tipos) ? cloud.tipos : state.tipos,
        techs: Array.isArray(cloud.techs) ? cloud.techs : state.techs,
        products: Array.isArray(cloud.products) ? cloud.products : state.products,
        settings: cloud.settings ?? state.settings,
        log: Array.isArray(cloud.log) ? cloud.log : state.log,
      };
      saveLS(LS_KEYS.tasks, state.tasks);
      saveLS(LS_KEYS.tipos, state.tipos);
      saveLS(LS_KEYS.techs, state.techs);
      saveLS(LS_KEYS.products, state.products);
      saveLS(LS_KEYS.settings, state.settings);
      saveLS(LS_KEYS.log, state.log);
      renderBoard();
    });

  } catch (err) {
    console.warn('ensureCloudAndSubscribe error', err);
  }
}

/********************
 * Utilidades
 ********************/
function qs(s,el=document){ return el.querySelector(s); }
function qsa(s,el=document){ return [...el.querySelectorAll(s)]; }
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shade(hex,amt){
  const c=hex?.replace('#','')||'8892b0';
  let r,g,b;
  if(c.length===3){ r=parseInt(c[0]+c[0],16); g=parseInt(c[1]+c[1],16); b=parseInt(c[2]+c[2],16); }
  else { r=parseInt(c.slice(0,2),16); g=parseInt(c.slice(2,4),16); b=parseInt(c.slice(4,6),16); }
  r=Math.max(0,Math.min(255,r+Math.round(255*amt/100)));
  g=Math.max(0,Math.min(255,g+Math.round(255*amt/100)));
  b=Math.max(0,Math.min(255,b+Math.round(255*amt/100)));
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function contrastColor(hex){
  if(!hex) return '#111';
  const c=hex.replace('#',''), r=parseInt(c.substring(0,2),16)/255, g=parseInt(c.substring(2,4),16)/255, b=parseInt(c.substring(4,6),16)/255;
  const L=.299*r+.587*g+.114*b;
  return L>0.6 ? '#0d1117' : '#f5faff';
}
function fmtDate(d){ if(!d) return '—'; try{ return new Date(d).toLocaleString(); }catch{ return '—'; } }
function toMs(h){ return Number(h||0)*3600*1000; }
function cardColorForTipo(tipo){ const t=state.tipos.find(x=>x.name===tipo); return t? t.color : '#8892b0'; }
function techRingsStyles(techIds){
  const styles={}; (techIds||[]).slice(0,4).forEach((i,idx)=>{ const t=state.techs[i]; if(t) styles[`--ring${idx}`]=t.color; });
  return styles;
}
function nearDeadline(card){
  const nowT=Date.now(); let glow=false;
  if(card.budgetDue){ if(new Date(card.budgetDue).getTime()-nowT<=toMs(state.settings.glowBudgetH)) glow=true; }
  if(card.deliveryDue){ if(new Date(card.deliveryDue).getTime()-nowT<=toMs(state.settings.glowDeliveryH)) glow=true; }
  return glow;
}

/********************
 * Filtros y listas auxiliares
 ********************/
function fillTipoFilters(){ qs('#filterTipo').innerHTML = '<option value="">Tipo: Todos</option>'+state.tipos.map(t=>`<option>${t.name}</option>`).join(''); }
function fillTipoSelect(){ qs('#f-tipo').innerHTML = state.tipos.map(t=>`<option>${t.name}</option>`).join(''); }
function fillProductDatalist(){ qs('#datalistProductos').innerHTML = state.products.map(p=>`<option value="${p}"></option>`).join(''); }
function passFilters(card){
  const t = qs('#filterTipo').value, u = qs('#filterTurno').value;
  if (t && card.tipo!==t) return false;
  if (u && String(card.turno)!==String(u)) return false;
  return true;
}

/********************
 * Render tablero
 ********************/
function renderBoard(){
  ['diagnostico','reparacion','listo'].forEach(c=> qs('#col-'+c).innerHTML='');

  state.tasks.filter(t=>!t.archived).forEach(card=>{
    if(!passFilters(card)) return;
    const el=document.createElement('div');
    el.className='card draggable'; el.draggable=true; el.dataset.id=card.id;
    if(!!Number(card.compact)) el.classList.add('compact');

    // anillos técnico
    if((card.techIds||[]).length) el.dataset.techRings='1';
    Object.entries(techRingsStyles(card.techIds)).forEach(([k,v])=> el.style.setProperty(k,v));
    ['ring0','ring1','ring2','ring3'].forEach((cls,idx)=>{ if(el.style.getPropertyValue(`--ring${idx}`)) el.classList.add(cls); });

    if(nearDeadline(card)) el.classList.add('glow');

    const bg = card.color || cardColorForTipo(card.tipo);
    const fg = contrastColor(bg);
    el.style.background = `linear-gradient(180deg, ${bg} 0%, ${shade(bg,-14)} 100%)`;
    el.style.color = fg;

    el.innerHTML = `
      <div class="card-inner">
        <div class="line main"><strong>${esc(card.ot||'—')}</strong> / ${esc(card.producto||'—')}</div>
        <div class="line extra">${esc(card.cliente||'—')} / Turno ${esc(card.turno||'—')}</div>
        <div class="desc">${esc(card.desc||'')}</div>
        <div class="tags"><span>${fmtDate(card.ingreso)}</span><span>${fmtDate(card.limite)}</span></div>
      </div>
    `;
    el.addEventListener('click', (e)=>{ if(window.innerWidth<=640){ openMobileView(card); } else { openEditor(card.id); } });
    qs('#col-'+card.col).appendChild(el);
  });

  hookDnD();
}

/********************
 * Drag & drop (reordenación libre) + archivo
 ********************/
let dragId = null;

function hookDnD(){
  // listeners por tarjeta (se regeneran en cada render)
  qsa('.draggable').forEach(el=>{
    el.addEventListener('dragstart', (e)=>{
      dragId = el.dataset.id;
      showArchive(true);
      el.classList.add('dragging');
      if (e.dataTransfer){
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain', dragId);
      }
    });
    el.addEventListener('dragend', ()=>{
      dragId=null; showArchive(false);
      el.classList.remove('dragging','drag-hover','drag-target-before','drag-target-after');
    });

    // marcador antes/después según mitad vertical
    el.addEventListener('dragover', (e)=>{
      if(!dragId || el.dataset.id===dragId) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const before = e.clientY < (rect.top + rect.height/2);
      el.classList.add('drag-hover');
      el.classList.toggle('drag-target-before', before);
      el.classList.toggle('drag-target-after', !before);
    });
    el.addEventListener('dragleave', ()=>{
      el.classList.remove('drag-hover','drag-target-before','drag-target-after');
    });

    el.addEventListener('drop', (e)=>{
      if(!dragId) return;
      e.preventDefault();
      const targetId = el.dataset.id;
      if (targetId === dragId) return;

      const dragged = state.tasks.find(t=>t.id===dragId);
      const target  = state.tasks.find(t=>t.id===targetId);
      if(!dragged || !target) return;

      const rect = el.getBoundingClientRect();
      const before = e.clientY < (rect.top + rect.height/2);

      // mover en array
      const from = state.tasks.findIndex(t=>t.id===dragged.id);
      state.tasks.splice(from,1);
      const to = state.tasks.findIndex(t=>t.id===target.id);
      state.tasks.splice(before ? to : to+1, 0, dragged);

      // sincronizar columna si cambió
      const oldCol = dragged.col;
      dragged.col = target.col;
      if (oldCol !== dragged.col) log('move',{id:dragged.id, col:dragged.col});
      dragged.updatedAt = now();

      log('reorder',{id:dragged.id, ref:target.id, pos:before?'before':'after', col:target.col});
      persistTasks(); renderBoard();
    });
  });
}

// drop en vacío de columna = enviar al final de esa columna
(function bindStaticDnD(){
  qsa('.column').forEach(col=>{
    col.addEventListener('dragover',(e)=>{ e.preventDefault(); });
    col.addEventListener('drop',(e)=>{
      e.preventDefault(); if(!dragId) return;
      const card = state.tasks.find(t=>t.id===dragId); if(!card) return;
      const from = state.tasks.findIndex(t=>t.id===card.id);
      state.tasks.splice(from,1);
      card.col = col.dataset.col;
      card.updatedAt = now();
      state.tasks.push(card); // al final
      log('move',{id:card.id, col:card.col});
      persistTasks(); renderBoard();
    });
  });
  const bar = qs('#archiveBar');
  bar.addEventListener('dragover',(e)=>{ e.preventDefault(); bar.classList.add('active'); });
  bar.addEventListener('dragleave',()=>{ bar.classList.remove('active'); });
  bar.addEventListener('drop',(e)=>{ e.preventDefault(); bar.classList.remove('active'); if(!dragId) return; archiveTask(dragId); dragId=null; showArchive(false); });
})();

function showArchive(show){ qs('#archiveBar').classList.toggle('show', !!show); }
function archiveTask(id){
  const t = state.tasks.find(x=>x.id===id); if(!t) return;
  t.archived = true; t.archivedAt = now();
  log('archive',{id}); persistTasks(); renderBoard();
}

/********************
 * Editor de tarjeta
 ********************/
let editingId = null;

function toLocalInput(iso){ if(!iso) return ''; const d=new Date(iso); const tz=d.getTimezoneOffset()*60000; return new Date(d - tz).toISOString().slice(0,16); }
function fromLocalInput(val){ if(!val) return null; const d=new Date(val); const tz=d.getTimezoneOffset()*60000; return new Date(d.getTime()+tz).toISOString(); }

function addTechChip(idx){
  const wrap = qs('#techList');
  const row = document.createElement('div'); row.className='row';
  row.innerHTML = `
    <select class="techSel">${state.techs.map((t,i)=>`<option value="${i}" ${i==idx?'selected':''}>${t.name}</option>`).join('')}</select>
    <input type="color" class="techColor" value="${state.techs[idx]?.color||'#cccccc'}" />
    <button class="ghost delTech" type="button">Quitar</button>
  `;
  wrap.appendChild(row);
  const sel=row.querySelector('.techSel'); const col=row.querySelector('.techColor');
  sel.addEventListener('change', ()=>{ col.value = state.techs[+sel.value]?.color||'#cccccc'; });
  col.addEventListener('input', ()=>{ const t=state.techs[+sel.value]; if(t){ t.color=col.value; saveLS(LS_KEYS.techs,state.techs); scheduleCloudSave(); } });
  row.querySelector('.delTech').onclick = ()=> row.remove();
}

function openEditor(id){
  editingId = id || null;
  const dr = qs('#drawer'); dr.classList.add('open');
  qs('#techList').innerHTML = '';

  let data = { col:'diagnostico', turno:1, compact:1, tipo:state.tipos[0]?.name, techIds:[], ingreso: new Date().toISOString().slice(0,16) };
  if (id){ const t = state.tasks.find(x=>x.id===id); if(t) data = {...data, ...t}; }

  qs('#f-ot').value = data.ot||'';
  qs('#f-producto').value = data.producto||'';
  qs('#f-marca').value = data.marca||'';
  qs('#f-modelo').value = data.modelo||'';
  qs('#f-cliente').value = data.cliente||'';
  qs('#f-turno').value = data.turno||1;
  qs('#f-desc').value = data.desc||'';
  qs('#f-ingreso').value = toLocalInput(data.ingreso);
  qs('#f-limite').value = toLocalInput(data.limite);
  qs('#f-tipo').value = data.tipo||state.tipos[0]?.name;
  qs('#f-color').value = data.color || '';
  qs('#f-col').value = data.col||'diagnostico';
  qs('#f-compact').value = Number(data.compact||1);
  (data.techIds||[]).forEach(addTechChip);
}

qs('#btnAddTech').onclick = ()=> addTechChip(0);
qs('#btnCancel').onclick = ()=> qs('#drawer').classList.remove('open');
qs('#btnDelete').onclick = ()=>{
  if(!editingId){ qs('#drawer').classList.remove('open'); return; }
  state.tasks = state.tasks.filter(t=>t.id!==editingId);
  log('delete',{id:editingId}); persistTasks(); renderBoard(); qs('#drawer').classList.remove('open');
};
qs('#btnSave').onclick = ()=>{
  const n = {
    id: editingId || 't_'+Math.random().toString(36).slice(2,9),
    ot: qs('#f-ot').value.trim(),
    producto: qs('#f-producto').value.trim(),
    marca: qs('#f-marca').value.trim(),
    modelo: qs('#f-modelo').value.trim(),
    cliente: qs('#f-cliente').value.trim(),
    turno: Number(qs('#f-turno').value),
    desc: qs('#f-desc').value.trim(),
    ingreso: fromLocalInput(qs('#f-ingreso').value),
    limite: fromLocalInput(qs('#f-limite').value),
    tipo: qs('#f-tipo').value,
    color: (/^#[0-9A-Fa-f]{6}$/.test(qs('#f-color').value) && qs('#f-color').value!=='#000000') ? qs('#f-color').value : null,
    col: qs('#f-col').value,
    compact: Number(qs('#f-compact').value),
    techIds: [...qs('#techList').querySelectorAll('.techSel')].map(s=>Number(s.value)).slice(0,4),
    updatedAt: now(),
  };

  if(n.producto && !state.products.includes(n.producto)){
    state.products.push(n.producto); saveLS(LS_KEYS.products,state.products); fillProductDatalist(); scheduleCloudSave();
  }

  const ing = n.ingreso ? new Date(n.ingreso).getTime() : Date.now();
  n.budgetDue = new Date(ing + toMs(state.settings.budgetMaxH)).toISOString();
  n.deliveryDue = new Date(ing + toMs(state.settings.deliveryMaxH)).toISOString();

  const i = state.tasks.findIndex(t=>t.id===n.id);
  if(i>=0){ state.tasks[i]=n; log('update',{id:n.id}); }
  else { state.tasks.push(n); log('create',{id:n.id}); }

  persistTasks(); renderBoard(); qs('#drawer').classList.remove('open');
};

function persistTasks(){ saveLS(LS_KEYS.tasks, state.tasks); scheduleCloudSave(); }

/********************
 * Ajustes
 ********************/
function renderSettings(){
  const wrap=qs('#tipoColors'); wrap.innerHTML='';
  state.tipos.forEach((t,i)=>{
    const row=document.createElement('div'); row.className='row';
    row.innerHTML = `
      <input value="${t.name}" data-idx="${i}" class="tipoName" />
      <input type="color" value="${t.color}" data-idx="${i}" class="tipoColor" />
      <button class="ghost delTipo" data-idx="${i}" type="button">Eliminar</button>
    `;
    wrap.appendChild(row);
  });
  qs('#st-budgetMaxH').value=state.settings.budgetMaxH;
  qs('#st-deliveryMinH').value=state.settings.deliveryMinH;
  qs('#st-deliveryMaxH').value=state.settings.deliveryMaxH;
  qs('#st-glowBudgetH').value=state.settings.glowBudgetH;
  qs('#st-glowDeliveryH').value=state.settings.glowDeliveryH;

  const tw=qs('#settingsTech'); tw.innerHTML='';
  state.techs.forEach((t,i)=>{
    const row=document.createElement('div'); row.className='row';
    row.innerHTML = `
      <input value="${t.name}" data-idx="${i}" class="st-techName" />
      <input type="color" value="${t.color}" data-idx="${i}" class="st-techColor" />
      <button class="ghost delSettingsTech" data-idx="${i}" type="button">Eliminar</button>
    `;
    tw.appendChild(row);
  });
}
function openSettings(){ qs('#settings').classList.add('open'); renderSettings(); }
function closeSettings(){
  qs('#settings').classList.remove('open');
  saveLS(LS_KEYS.tipos,state.tipos);
  saveLS(LS_KEYS.settings,state.settings);
  saveLS(LS_KEYS.techs,state.techs);
  fillTipoFilters(); fillTipoSelect(); renderBoard();
  scheduleCloudSave();
}

qs('#btnSettings').onclick=openSettings;
qs('#btnCloseSettings').onclick=closeSettings;
qs('#btnAddTipo').onclick=()=>{ state.tipos.push({name:'Nuevo Tipo', color:'#8888ff'}); saveLS(LS_KEYS.tipos,state.tipos); renderSettings(); fillTipoFilters(); fillTipoSelect(); renderBoard(); scheduleCloudSave(); };
qs('#tipoColors').addEventListener('input',(e)=>{
  if(e.target.classList.contains('tipoName')){ const i=+e.target.dataset.idx; state.tipos[i].name=e.target.value; saveLS(LS_KEYS.tipos,state.tipos); fillTipoFilters(); fillTipoSelect(); renderBoard(); scheduleCloudSave(); }
  if(e.target.classList.contains('tipoColor')){ const i=+e.target.dataset.idx; state.tipos[i].color=e.target.value; saveLS(LS_KEYS.tipos,state.tipos); renderBoard(); scheduleCloudSave(); }
});
qs('#tipoColors').addEventListener('click',(e)=>{
  if(e.target.classList.contains('delTipo')){ const i=+e.target.dataset.idx; state.tipos.splice(i,1); saveLS(LS_KEYS.tipos,state.tipos); renderSettings(); fillTipoFilters(); fillTipoSelect(); renderBoard(); scheduleCloudSave(); }
});
qs('#btnAddSettingsTech').onclick=()=>{ state.techs.push({name:'Nuevo técnico', color:'#cccc55'}); saveLS(LS_KEYS.techs,state.techs); renderSettings(); scheduleCloudSave(); };
qs('#settingsTech').addEventListener('input',(e)=>{
  if(e.target.classList.contains('st-techName')){ const i=+e.target.dataset.idx; state.techs[i].name=e.target.value; saveLS(LS_KEYS.techs,state.techs); scheduleCloudSave(); }
  if(e.target.classList.contains('st-techColor')){ const i=+e.target.dataset.idx; state.techs[i].color=e.target.value; saveLS(LS_KEYS.techs,state.techs); renderBoard(); scheduleCloudSave(); }
});
qs('#settingsTech').addEventListener('click',(e)=>{
  if(e.target.classList.contains('delSettingsTech')){ const i=+e.target.dataset.idx; state.techs.splice(i,1); saveLS(LS_KEYS.techs,state.techs); renderSettings(); renderBoard(); scheduleCloudSave(); }
});

/********************
 * Export CSV + filtros
 ********************/
qs('#filterTipo').addEventListener('change',renderBoard);
qs('#filterTurno').addEventListener('change',renderBoard);

function toCSV(rows){
  return rows.map(r=>r.map(cell=>{
    const s = (cell==null? '': String(cell));
    if (/[",\n]/.test(s)) return '"'+s.replace(/"/g,'""')+'"';
    return s;
  }).join(',')).join('\n');
}
function downloadFile(txt, filename, mime){
  const blob=new Blob([txt],{type:mime});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
qs('#btnExport').onclick = ()=>{
  const rows = [
    ['id','OT','Producto','Marca','Modelo','Cliente','Turno','Descripción','Ingreso','Límite','Tipo','Color','Columna','Técnicos','BudgetDue','DeliveryDue','UpdatedAt','Archived'],
    ...state.tasks.map(t=>[
      t.id,t.ot,t.producto,t.marca,t.modelo,t.cliente,t.turno,(t.desc||'').replace(/\n/g,' '),t.ingreso,t.limite,t.tipo,t.color,t.col,(t.techIds||[]).map(i=>state.techs[i]?.name).join('|'),t.budgetDue,t.deliveryDue,t.updatedAt,!!t.archived
    ])
  ];
  const logRows = [['ts','action','payload'], ...state.log.map(l=>[l.ts,l.action, JSON.stringify(l.payload)])];
  const csv1 = toCSV(rows), csv2 = toCSV(logRows);
  const base = 'export_kanban_'+new Date().toISOString().replace(/[:.]/g,'-');
  downloadFile(csv1, base+'_data.csv', 'text/csv');
  downloadFile(csv2, base+'_log.csv', 'text/csv');
};

/********************
 * Visor móvil
 ********************/
function openMobileView(card){
  const mv=qs('#mv'), sheet=qs('#mvSheet');
  const bg=card.color||cardColorForTipo(card.tipo), fg=contrastColor(bg);
  sheet.style.background=`linear-gradient(180deg, ${bg} 0%, ${shade(bg,-14)} 100%)`;
  sheet.style.color=fg;
  sheet.innerHTML = `
    <div class="title"><strong>${esc(card.ot||'—')}</strong> / ${esc(card.producto||'—')}</div>
    <div class="line extra">${esc(card.cliente||'—')} / Turno ${esc(card.turno||'—')}</div>
    <div style="font-size:12px; opacity:.85;">${esc(card.marca||'')} ${esc(card.modelo||'')}</div>
    <div class="desc" style="margin:8px 0;">${esc(card.desc||'')}</div>
    <div class="tags"><span>${fmtDate(card.ingreso)}</span><span>${fmtDate(card.limite)}</span></div>
  `;
  mv.classList.add('open');
  mv.onclick = ()=> closeMobileView();
  sheet.onclick = (ev)=> ev.stopPropagation();

  // Cerrar deslizando hacia arriba
  let startY=null, allow=false;
  sheet.addEventListener('touchstart',(e)=>{ startY=e.touches[0].clientY; const r=sheet.getBoundingClientRect(); allow=(startY-r.top)<=60; },{passive:true});
  sheet.addEventListener('touchmove',(e)=>{ if(!allow||startY===null) return; const dy=e.touches[0].clientY-startY; if(dy<-80){ closeMobileView(); startY=null; allow=false; } },{passive:true});
  sheet.addEventListener('touchend',()=>{ startY=null; allow=false; });
}
function closeMobileView(){ qs('#mv').classList.remove('open'); }

/********************
 * FAB + Init
 ********************/
qs('#fab').onclick = ()=> openEditor(null);

function init(){
  fillTipoFilters(); fillTipoSelect(); fillProductDatalist(); renderBoard();

  // Solo DEMO si NO hay Firebase (modo 100% local)
  if(!state.tasks.length && !db){
    const demo=[
      {ot:'0001', producto:'Notebook', marca:'HP', modelo:'15-dw', cliente:'María P.', turno:1, desc:'Pantalla no enciende', ingreso: now(), limite: new Date(Date.now()+toMs(96)).toISOString(), tipo:'Presupuesto', col:'diagnostico', compact:1, techIds:[0]},
      {ot:'0002', producto:'Celular',  marca:'Samsung', modelo:'A52', cliente:'J. López', turno:2, desc:'Cambio de batería', ingreso: now(), limite: new Date(Date.now()+toMs(72)).toISOString(), tipo:'Aceptado',   col:'reparacion', compact:1, techIds:[1]},
    ];
    demo.forEach(d=>{ d.id='t_'+Math.random().toString(36).slice(2,9); d.color=null; d.budgetDue=new Date(Date.now()+toMs(state.settings.budgetMaxH)).toISOString(); d.deliveryDue=new Date(Date.now()+toMs(state.settings.deliveryMaxH)).toISOString(); d.updatedAt=now(); });
    state.tasks = demo; persistTasks(); log('seed',{count:demo.length});
  }

  // (OJO) Ya no llamamos cloudLoad() acá. El boot maneja la nube primero.
}

// Boot: si hay Firestore, asegura doc + escucha, luego init
(async function boot(){
  if (db) { await ensureCloudAndSubscribe(); }
  init();
})();




