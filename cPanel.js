/* ========================= Firebase ========================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-Mx5Qqwg6KFMJSA-yUb-DFo7UjfqCpKY",
  authDomain: "aclinadev.firebaseapp.com",
  projectId: "aclinadev",
  storageBucket: "aclinadev.firebasestorage.app",
  messagingSenderId: "401991392253",
  appId: "1:401991392253:web:92400bc5d2503ed6879794",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ========================= Estado ========================= */
const BOARD_DOC = doc(db, "kanban", "ac-lina");
const DISPLAY_DOC = doc(db, "kanban", "display");

let data = {
  presets: [
    { key:'p1', name:'Presupuestos', color:'#2D9CDB' },
    { key:'p2', name:'Aceptado',     color:'#27AE60' },
    { key:'p3', name:'No Aceptado',  color:'#EB5757' },
    { key:'p4', name:'Garantía T',   color:'#9B51E0' },
    { key:'p5', name:'Garantía F',   color:'#F2994A' },
    { key:'p6', name:'Tareas Extra', color:'#E2B93B' },
  ],
  settings: { dueSoonHours: 42, workdays: [1,1,1,1,1,0,0] },
  recepcion: [], diagnostico: [], reparacion: [], listo: [], entregado: [],
  archivo: []
};

let activeFilters = new Set(); // presets
let textQuery = "";
let activeTurn = "both";       // both | T1 | T2
let dragId = null;
let dragFromCol = null;
let saveTimer = null;

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

/* ========================= Utilidades ========================= */
function uid(){ return 'id'+Math.random().toString(36).slice(2,9); }
function getPreset(key){ return data.presets.find(p=>p.key===key) || data.presets[0]; }
function fmtDate(dstr){ if(!dstr) return ''; const [y,m,d] = dstr.split('-'); return `${d}/${m}`; }
function parseISO(dstr){ if(!dstr) return null; const d = new Date(dstr+'T00:00:00'); d.setHours(0,0,0,0); return d; }

function luminance(hex){
  const c = hex.replace('#','');
  const r = parseInt(c.substring(0,2),16)/255;
  const g = parseInt(c.substring(2,4),16)/255;
  const b = parseInt(c.substring(4,6),16)/255;
  const lin = x => (x<=0.03928)? x/12.92 : Math.pow((x+0.055)/1.055, 2.4);
  return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
}
function idealTextColor(bg){ return (luminance(bg) < 0.5) ? '#ffffff' : '#111111'; }

function businessHoursUntil(from, to, workdays){
  if (!from || !to) return 0;
  const start = new Date(from); start.setHours(0,0,0,0);
  const end   = new Date(to);   end.setHours(0,0,0,0);
  if (start.getTime() === end.getTime()) return workdays[start.getDay()] ? 24 : 0;
  const dir = end > start ? 1 : -1;
  let cursor = new Date(start), hours = 0;
  while ((dir>0 && cursor < end) || (dir<0 && cursor > end)){
    if (workdays[cursor.getDay()]) hours += 24 * dir;
    cursor.setDate(cursor.getDate() + dir);
    if (Math.abs((cursor - start) / (1000*3600*24)) > 10000) break;
  }
  return hours;
}
function hoursToDue(promISO){
  if (!promISO) return Infinity;
  const today = new Date(); today.setHours(0,0,0,0);
  const prom = parseISO(promISO);
  return businessHoursUntil(today, prom, data.settings.workdays || [1,1,1,1,1,0,0]);
}

function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToFirestore, 400);
}

/* ========================= Firestore ========================= */
async function saveToFirestore(){
  const payload = {
    presets: data.presets,
    settings: data.settings,
    recepcion: data.recepcion,
    diagnostico: data.diagnostico,
    reparacion: data.reparacion,
    listo: data.listo,
    entregado: data.entregado,
    archivo: data.archivo
  };
  await setDoc(BOARD_DOC, payload, { merge: true });
}

function bootstrapArrays(){
  ["recepcion","diagnostico","reparacion","listo","entregado"].forEach(k=>{
    data[k] = (data[k]||[]).map((c,i)=> ({ pos: i+1, ...c }));
    data[k].sort((a,b)=> (a.pos||0) - (b.pos||0));
  });
}

onSnapshot(BOARD_DOC, snap=>{
  if (!snap.exists()) { scheduleSave(); return; }
  const incoming = snap.data();
  if (incoming?.presets) data.presets = incoming.presets;
  if (incoming?.settings) data.settings = { ...data.settings, ...incoming.settings };

  ["recepcion","diagnostico","reparacion","listo","entregado","archivo"].forEach(k=>{
    data[k] = Array.isArray(incoming?.[k]) ? incoming[k] : [];
  });

  bootstrapArrays();
  renderLegend();
  renderBoard();
});

onSnapshot(doc(db,"kanban","display"), snap=>{
  if (snap.exists()){
    const at = snap.data().activeTurn;
    if (at && at !== activeTurn){
      activeTurn = at;
      updateTurnButtons();
      renderBoard();
    }
  }
});

/* ========================= Leyenda / filtros ========================= */
function renderLegend(){
  const box = $("#legend"); if (!box) return;
  box.innerHTML = "";
  for (const p of data.presets){
    const chip = document.createElement("div");
    chip.className = "chip";
    if (!activeFilters.size || activeFilters.has(p.key)) chip.classList.add("active");
    chip.dataset.key = p.key;

    const dot = document.createElement("span");
    dot.className = "dot"; dot.style.background = p.color;

    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(p.name));
    chip.addEventListener("click", ()=>{
      if (!activeFilters.size) activeFilters.add(p.key);
      else if (activeFilters.has(p.key)) activeFilters.delete(p.key);
      else activeFilters.add(p.key);
      renderBoard();
    });
    box.appendChild(chip);
  }
}

/* ========================= Render de tarjetas ========================= */
function cardNode(card){
  const t = document.getElementById("cardTemplate");
  const node = t.content.firstElementChild.cloneNode(true);

  node.dataset.id = card.id;
  const preset = getPreset(card.category);
  node.querySelector(".estado").textContent = preset?.name || "";
  node.querySelector(".estado").style.background = preset?.color || "#2D9CDB";

  const fg = idealTextColor(preset?.color || "#2D9CDB");
  node.style.color = fg;

  const titulo = `${card.ot || ""} — ${card.producto || ""}`.replace(/\s—\s$/, "");
  node.querySelector(".titulo").textContent = titulo;
  node.querySelector(".titulo").title = titulo;

  const sec = `${card.cliente || ""} — ${card.turno || ""}`;
  node.querySelector(".sec").textContent = sec;
  node.querySelector(".sec").title = sec;

  const det = (card.notes || "").trim();
  node.querySelector(".det").textContent = det;
  node.querySelector(".det").title = det;

  node.querySelector(".badge-ingreso").textContent = card.ingreso ? fmtDate(card.ingreso) : "";
  node.querySelector(".badge-promesa").textContent = card.prometida ? fmtDate(card.prometida) : "";

  const img = node.querySelector(".thumb-bottom");
  if (card.image){ img.src = card.image; img.style.display = "block"; }
  else { img.removeAttribute("src"); img.style.display = "none"; }

  node.classList.remove("ring-soon","ring-late");
  const hrs = hoursToDue(card.prometida);
  if (hrs <= 0) node.classList.add("ring-late");
  else if (hrs <= (data.settings.dueSoonHours ?? 42)) node.classList.add("ring-soon");

  node.setAttribute("draggable","true");
  node.addEventListener("dragstart", e=>{
    dragId = card.id;
    dragFromCol = findCard(card.id)?.col || null;
    node.style.opacity = ".6";
    showArchiveGutter(true);
  });
  node.addEventListener("dragend", e=>{
    node.style.opacity = "";
    showArchiveGutter(false);
  });
  node.addEventListener("dblclick", ()=> openEditor(card.id));

  const q = textQuery.toLowerCase();
  const hitText = [card.ot, card.producto, card.cliente, card.notes].some(v=> (v||"").toLowerCase().includes(q));
  const hitPreset = (!activeFilters.size) || activeFilters.has(card.category);
  const hitTurn = (activeTurn === "both") || (card.turno === activeTurn);
  if (!(hitText && hitPreset && hitTurn)) node.style.display = "none";

  return node;
}

function renderBoard(){
  ["recepcion","diagnostico","reparacion","listo","entregado"].forEach(col=>{
    const list = document.getElementById(col);
    if (!list) return;
    list.innerHTML = "";
    const arr = [...(data[col]||[])].sort((a,b)=> (a.pos||0)-(b.pos||0));
    for (const c of arr) list.appendChild(cardNode(c));
  });
}

/* ========================= Buscar / Turnos ========================= */
$("#search")?.addEventListener("input", e=>{
  textQuery = e.target.value || "";
  renderBoard();
});

const btnBoth = $("#btnBoth"), btnT1 = $("#btnT1"), btnT2 = $("#btnT2");
function updateTurnButtons(){
  btnBoth?.classList.toggle("active", activeTurn==="both");
  btnT1?.classList.toggle("active",   activeTurn==="T1");
  btnT2?.classList.toggle("active",   activeTurn==="T2");
}
btnBoth?.addEventListener("click", ()=> setActiveTurn("both"));
btnT1?.addEventListener("click", ()=> setActiveTurn("T1"));
btnT2?.addEventListener("click", ()=> setActiveTurn("T2"));

async function setActiveTurn(val){
  activeTurn = val;
  updateTurnButtons();
  renderBoard();
  await setDoc(DISPLAY_DOC, { activeTurn: val }, { merge: true });
}

/* ========================= DnD columnas y reorden ========================= */
$$(".list").forEach(list=>{
  list.addEventListener("dragover", e=>{
    e.preventDefault();
    const afterEl = getDragAfterElement(list, e.clientX, e.clientY);
    const dragging = document.querySelector(`.card[draggable="true"][data-id="${dragId}"]`);
    if (!dragging) return;
    if (afterEl == null) list.appendChild(dragging);
    else list.insertBefore(dragging, afterEl);
  });

  list.addEventListener("drop", e=>{
    e.preventDefault();
    if (!dragId) return;
    const targetCol = list.id;
    moveCardToColAndReindex(dragId, targetCol, list);
    dragId = null; dragFromCol = null; showArchiveGutter(false);
  });
});

function getDragAfterElement(container, x, y){
  const els = [...container.querySelectorAll(".card:not([data-id='"+dragId+"'])")];
  let closest = null, closestDist = Number.POSITIVE_INFINITY;
  for (const el of els){
    const box = el.getBoundingClientRect();
    const cx = Math.max(box.left, Math.min(x, box.right));
    const cy = Math.max(box.top,  Math.min(y, box.bottom));
    const dx = x - cx, dy = y - cy;
    const dist = dx*dx + dy*dy;
    if (dist < closestDist){ closestDist = dist; closest = el; }
  }
  return closest;
}

function findCard(id){
  for (const col of ["recepcion","diagnostico","reparacion","listo","entregado"]){
    const idx = data[col].findIndex(c=>c.id===id);
    if (idx>=0) return { col, idx, card: data[col][idx] };
  }
  return null;
}

function moveCardToColAndReindex(id, targetCol, listNode){
  const f = findCard(id); if (!f) return;
  const card = data[f.col].splice(f.idx, 1)[0];
  if (!data[targetCol]) data[targetCol] = [];
  const orderedIds = [...listNode.querySelectorAll(".card")].map(n=>n.dataset.id);
  if (!orderedIds.includes(id)){
    data[targetCol].push(card);
  } else {
    const all = data[targetCol].filter(c=>orderedIds.includes(c.id));
    const moved = f.col===targetCol ? [] : [card];
    const mapById = new Map([...all, ...moved].map(c=>[c.id,c]));
    const newArr = [];
    for (const cid of orderedIds){
      const c = mapById.get(cid);
      if (c) newArr.push(c);
    }
    data[targetCol] = newArr;
  }
  data[targetCol].forEach((c,i)=> c.pos = i+1);
  renderBoard();
  scheduleSave();
}

/* ========================= Gutter de Archivo ========================= */
const gutter = $("#archiveGutter");
let isOverArchive = false;

function showArchiveGutter(show){
  gutter?.classList.toggle("show", !!show);
}
window.addEventListener("dragover", e=>{
  if (!dragId) return;
  const thresh = 120;
  isOverArchive = (window.innerWidth - e.clientX) < thresh;
  showArchiveGutter(isOverArchive);
  e.preventDefault();
});
window.addEventListener("drop", e=>{
  if (!dragId) return;
  if (isOverArchive){
    const f = findCard(dragId);
    if (f){
      const moved = data[f.col].splice(f.idx,1)[0];
      moved.lastColumn = f.col;
      data.archivo.unshift(moved);
      renderBoard();
      scheduleSave();
    }
  }
  dragId = null; dragFromCol = null; isOverArchive=false; showArchiveGutter(false);
});

/* ========================= Editor de tarjetas ========================= */
const dlg = $("#cardDialog");
const fOT = $("#fOT"), fProd = $("#fProducto"), fCli = $("#fCliente");
const fTurno = $("#fTurno"), fNotes = $("#fNotes"), fCat = $("#fCategory");
const fIng = $("#fIngreso"), fPro = $("#fPrometida");
const fImgUrl = $("#fImageUrl"), fImgFile = $("#fImageFile");
const pImg = $("#previewImg"), pInfo = $("#imgInfo");
let currentEdit = { id:null, col:"recepcion" };

function fillCategories(){
  fCat.innerHTML="";
  for (const p of data.presets){
    const opt = document.createElement("option");
    opt.value = p.key; opt.textContent = p.name;
    fCat.appendChild(opt);
  }
}
function openNew(col="recepcion"){
  currentEdit = { id:null, col };
  $("#dlgTitle").textContent = "Nueva tarjeta";
  $("#btnDelete").style.display = "none";
  fillCategories();
  const today = new Date().toISOString().slice(0,10);
  fOT.value=""; fProd.value=""; fCli.value="";
  fTurno.value="T1"; fNotes.value="";
  fIng.value=today; fPro.value=today;
  fCat.value=data.presets[0]?.key || "p1";
  fImgUrl.value=""; fImgFile.value=null;
  pImg.src=""; pImg.style.display="none"; pInfo.textContent="";
  dlg.showModal(); fOT.focus();
}
function openEditor(id){
  const f = findCard(id); if (!f) return;
  currentEdit = { id, col:f.col };
  $("#dlgTitle").textContent = "Editar tarjeta";
  $("#btnDelete").style.display = "inline-block";
  fillCategories();
  fOT.value = f.card.ot || ""; fProd.value = f.card.producto || ""; fCli.value = f.card.cliente || "";
  fTurno.value = f.card.turno || "T1"; fNotes.value = f.card.notes || "";
  fIng.value = f.card.ingreso || ""; fPro.value = f.card.prometida || "";
  fCat.value = f.card.category || data.presets[0]?.key || "p1";
  if (f.card.image){
    pImg.src = f.card.image; pImg.style.display="block";
    pInfo.textContent = f.card.image.startsWith("data:") ? "Imagen cargada (DataURL)" : "Imagen por URL";
  } else { pImg.src=""; pImg.style.display="none"; pInfo.textContent=""; }
  fImgUrl.value = (f.card.image && !f.card.image.startsWith("data:")) ? f.card.image : "";
  fImgFile.value = null;
  dlg.showModal();
}
$("#dlgClose")?.addEventListener("click", ()=> dlg.close());
$("#btnCancel")?.addEventListener("click", ()=> dlg.close());
$("#btnDelete")?.addEventListener("click", ()=>{
  if (!currentEdit.id) return;
  const f = findCard(currentEdit.id); if (!f) return;
  data[f.col].splice(f.idx,1);
  renderBoard(); scheduleSave(); dlg.close();
});

fImgFile?.addEventListener("change", async ()=>{
  const file = fImgFile.files?.[0]; if (!file) return;
  const dataUrl = await imageFileToDataURL(file, 512, 0.8);
  pImg.src = dataUrl; pImg.style.display="block";
  pInfo.textContent = `Imagen comprimida (${(dataUrl.length/1024).toFixed(0)} KB aprox)`;
});
fImgUrl?.addEventListener("input", ()=>{
  const u = fImgUrl.value.trim();
  if (u){ pImg.src = u; pImg.style.display="block"; pInfo.textContent = "Imagen por URL"; }
  else if (!fImgFile.files?.length){ pImg.src=""; pImg.style.display="none"; pInfo.textContent=""; }
});

async function imageFileToDataURL(file, maxSide=512, quality=0.8){
  const img = await new Promise(res=>{
    const r = new FileReader();
    r.onload = ()=>{ const im = new Image(); im.onload=()=>res(im); im.src = r.result; };
    r.readAsDataURL(file);
  });
  const scale = Math.min(1, maxSide/Math.max(img.width, img.height));
  const w = Math.round(img.width*scale), h = Math.round(img.height*scale);
  const canvas = document.createElement("canvas");
  canvas.width=w; canvas.height=h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img,0,0,w,h);
  return canvas.toDataURL("image/jpeg", quality);
}

$("#cardForm")?.addEventListener("submit", e=>{
  e.preventDefault();
  const obj = {
    ot: fOT.value.trim(),
    producto: fProd.value.trim(),
    cliente: fCli.value.trim(),
    turno: fTurno.value,
    notes: fNotes.value,
    ingreso: fIng.value || null,
    prometida: fPro.value || null,
    category: fCat.value
  };
  if (pImg.style.display==="block" && pImg.src) obj.image = pImg.src;
  else if (fImgUrl.value.trim()) obj.image = fImgUrl.value.trim();

  if (!currentEdit.id){
    obj.id = uid();
    obj.pos = (data[currentEdit.col]?.length || 0) + 1;
    data[currentEdit.col].push(obj);
  } else {
    const f = findCard(currentEdit.id); if (!f) return;
    data[f.col][f.idx] = { id: f.card.id, pos: f.card.pos, ...obj };
  }
  renderBoard(); scheduleSave(); dlg.close();
});

$$(".col").forEach(col=>{
  col.addEventListener("dblclick", (e)=>{
    const list = col.querySelector(".list");
    if (!list.contains(e.target)) return;
    openNew(col.getAttribute("data-col"));
  });
});

/* ========================= Presets ========================= */
const pDlg = $("#presetsDialog");
$("#btnPresets")?.addEventListener("click", ()=>{ buildPresetsForm(); pDlg.showModal(); });
$("#pDlgClose")?.addEventListener("click", ()=> pDlg.close());
$("#btnPresetsCancel")?.addEventListener("click", ()=> pDlg.close());

function buildPresetsForm(){
  const box = $("#presetsList"); box.innerHTML="";
  for (const p of data.presets){
    const row = document.createElement("div"); row.className="form-row";
    const name = document.createElement("input"); name.type="text"; name.value=p.name; name.disabled=true; name.style.minWidth="220px";
    const col = document.createElement("input"); col.type="color"; col.value=p.color;
    row.appendChild(name); row.appendChild(col); row.dataset.key=p.key;
    box.appendChild(row);
  }
}
$("#presetsForm")?.addEventListener("submit", e=>{
  e.preventDefault();
  const rows = Array.from($("#presetsList").children);
  for (const r of rows){
    const key = r.dataset.key;
    const color = r.querySelector('input[type="color"]').value;
    const p = getPreset(key); if (p) p.color = color;
  }
  pDlg.close(); renderLegend(); renderBoard(); scheduleSave();
});

/* ========================= Ajustes ========================= */
const sDlg = $("#settingsDialog");
$("#btnSettings")?.addEventListener("click", ()=>{ buildSettings(); sDlg.showModal(); });
$("#sDlgClose")?.addEventListener("click", ()=> sDlg.close());
$("#btnSettingsCancel")?.addEventListener("click", ()=> sDlg.close());
$("#openPresetsFromSettings")?.addEventListener("click", ()=>{ sDlg.close(); buildPresetsForm(); pDlg.showModal(); });

function buildSettings(){
  $("#sDueSoon").value = data.settings.dueSoonHours ?? 42;
  const box = $("#sWorkdays"); box.innerHTML="";
  const labels = ["L","M","X","J","V","S","D"];
  data.settings.workdays = data.settings.workdays || [1,1,1,1,1,0,0];
  data.settings.workdays.forEach((v,i)=>{
    const label = document.createElement("label"); label.style.marginRight="8px";
    const cb = document.createElement("input"); cb.type="checkbox"; cb.checked=!!v;
    cb.addEventListener("change", ()=> data.settings.workdays[i] = cb.checked?1:0);
    label.appendChild(cb); label.appendChild(document.createTextNode(" "+labels[i]));
    box.appendChild(label);
  });
}
$("#settingsForm")?.addEventListener("submit", e=>{
  e.preventDefault();
  const v = parseInt($("#sDueSoon").value,10);
  if (!isNaN(v)) data.settings.dueSoonHours = Math.max(12, Math.min(168, v));
  sDlg.close(); renderBoard(); scheduleSave();
});

/* ========================= Archivo (modal) ========================= */
const aDlg = $("#archiveDialog");
$("#btnArchive")?.addEventListener("click", ()=>{ buildArchiveList(); aDlg.showModal(); });
$("#aDlgClose")?.addEventListener("click", ()=> aDlg.close());
$("#btnArchiveClose")?.addEventListener("click", ()=> aDlg.close());
$("#archiveSearch")?.addEventListener("input", buildArchiveList);

function buildArchiveList(){
  const q = ($("#archiveSearch").value||"").toLowerCase();
  const box = $("#archiveList"); box.innerHTML = "";
  for (const c of data.archivo){
    const hay = t=> (t||"").toLowerCase().includes(q);
    if (!(hay(c.ot)||hay(c.producto)||hay(c.cliente)||hay(c.notes))) continue;
    const row = document.createElement("div");
    row.style.display="grid"; row.style.gridTemplateColumns="1fr auto"; row.style.gap="6px";
    row.style.padding="8px 10px"; row.style.border="1px solid #2a2f3a"; row.style.borderRadius="10px"; row.style.marginBottom="8px";
    row.innerHTML = `<div><strong>${c.ot||""}</strong> · ${c.producto||""} · ${c.cliente||""}<div class="helper">${c.notes||""}</div></div>`;
    const btn = document.createElement("button"); btn.textContent="Restaurar"; btn.className="btn-primary";
    btn.addEventListener("click", ()=>{
      const i = data.archivo.findIndex(x=>x.id===c.id);
      if (i>=0){
        const last = c.lastColumn || "recepcion";
        data.archivo.splice(i,1);
        delete c.lastColumn;
        c.pos = (data[last]?.length||0)+1;
        (data[last]||data.recepcion).push(c);
        buildArchiveList(); renderBoard(); scheduleSave();
      }
    });
    row.appendChild(btn); box.appendChild(row);
  }
}

/* ========================= Export CSV ========================= */
$("#btnExport")?.addEventListener("click", ()=>{
  const rows = [];
  const cols = ["recepcion","diagnostico","reparacion","listo","entregado"];
  for (const col of cols){
    for (const c of data[col]){
      rows.push({
        columna: col,
        id: c.id, pos: c.pos || "",
        ot: c.ot || "", producto: c.producto || "", cliente: c.cliente || "",
        turno: c.turno || "", ingreso: c.ingreso || "", prometida: c.prometida || "",
        category: getPreset(c.category)?.name || "", notes: (c.notes||"").replace(/\n/g," "),
        image: c.image ? (c.image.startsWith("data:") ? "(dataURL)" : c.image) : ""
      });
    }
  }
  const headers = Object.keys(rows[0] || {columna:"",id:"",pos:"",ot:"",producto:"",cliente:"",turno:"",ingreso:"",prometida:"",category:"",notes:"",image:""});
  const csv = [headers.join(",")].concat(rows.map(r=> headers.map(h=> `"${String(r[h]??"").replace(/"/g,'""')}"`).join(","))).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kanban_backup.csv";
  a.click();
});

/* ========================= Logout ========================= */
$("#btnLogout")?.addEventListener("click", ()=> signOut(auth).then(()=>location.href="index.html"));

/* ========================= Auth guard ========================= */
onAuthStateChanged(auth, (user)=>{
  if (!user){ location.href = "index.html"; }
});

/* ========================= Init ========================= */
renderLegend();
renderBoard();
