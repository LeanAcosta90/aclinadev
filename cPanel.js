// ================= Firebase Init ==================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-Mx5Qqwg6KFMJSA-yUb-DFo7UjfqCpKY",
  authDomain: "aclinadev.firebaseapp.com",
  projectId: "aclinadev",
  storageBucket: "aclinadev.firebasestorage.app",
  messagingSenderId: "401991392253",
  appId: "1:401991392253:web:92400bc5d2503ed6879794",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ================== Estado Local ==================
let data = {
  recepcion: [],
  diagnostico: [],
  reparacion: [],
  listo: [],
  entregado: []
};

// ================== Utilidades ==================
function $(sel, ctx=document){ return ctx.querySelector(sel); }
function $$(sel, ctx=document){ return [...ctx.querySelectorAll(sel)]; }

function findCard(id){
  for (const col of Object.keys(data)){
    const idx = data[col].findIndex(c=>c.id===id);
    if(idx>=0) return {col, idx};
  }
  return null;
}

// ================== Render ==================
function cardNode(card){
  const node = document.createElement("div");
  node.className = "card";
  node.dataset.id = card.id;

  node.innerHTML = `
    <div class="estado">${card.estado||"Presupuesto"}</div>
    <div class="titulo"><b>${card.id} — ${card.titulo||""}</b></div>
    <div class="detalle">${card.cliente||""} — ${card.turno||""}</div>
    <div class="detalle">${card.detalle||""}</div>
    <div class="fechaIng">${card.ingreso||""}</div>
    <div class="fechaProm">${card.promesa||""}</div>
    ${card.img ? `<img src="${card.img}" class="thumb">` : ""}
  `;

  // Drag
  node.draggable = true;
  node.addEventListener("dragstart", e=>{
    e.dataTransfer.setData("text/plain", card.id);
    setTimeout(()=> node.classList.add("dragging"), 0);
  });
  node.addEventListener("dragend", ()=>{
    node.classList.remove("dragging");
  });

  // Edit
  node.addEventListener("dblclick", ev=>{
    ev.stopPropagation(); // <- evita que la columna lo capture
    openEditor(card.id);
  });

  return node;
}

function renderBoard(){
  for (const col of Object.keys(data)){
    const list = document.getElementById(col);
    if(!list) continue;
    list.innerHTML = "";
    data[col].forEach(c=>{
      list.appendChild(cardNode(c));
    });
  }
  requestAnimationFrame(applyCompactScale);
}

// ================== Drag & Drop ==================
$$(".col").forEach(col=>{
  const list = col.querySelector(".list");
  list.addEventListener("dragover", e=>{
    e.preventDefault();
    const dragging = $(".dragging");
    if(!dragging) return;
    const after = getDragAfter(list, e.clientY);
    if(after==null) list.appendChild(dragging);
    else list.insertBefore(dragging, after);
  });

  list.addEventListener("drop", e=>{
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    moveCardToColAndReindex(id, col.dataset.col, list);
  });
});

function getDragAfter(container, y){
  const els = [...container.querySelectorAll(".card:not(.dragging)")];
  return els.find(el=>{
    const box = el.getBoundingClientRect();
    return y < box.top + box.height/2;
  });
}

function moveCardToColAndReindex(id, targetCol, listNode){
  const from = findCard(id);
  if(!from) return;
  const moved = data[from.col].splice(from.idx,1)[0];
  if(!data[targetCol]) data[targetCol]=[];

  const pool = new Map(data[targetCol].map(c=>[c.id,c]));
  pool.set(moved.id, moved);

  const orderedIds = [...listNode.querySelectorAll(".card")].map(n=>n.dataset.id);
  const newArr = [];
  for(const cid of orderedIds){
    const c = pool.get(cid);
    if(c) newArr.push(c);
  }
  if(!newArr.some(c=>c.id===moved.id)) newArr.push(moved);

  data[targetCol] = newArr;
  data[targetCol].forEach((c,i)=>c.pos=i+1);

  renderBoard();
  scheduleSave();
}

// ================== Nuevo / Editar ==================
$$(".col").forEach(col=>{
  col.addEventListener("dblclick", e=>{
    if(e.target.closest(".card")) return; // <- solo fondo
    const list = col.querySelector(".list");
    if(!list.contains(e.target)) return;
    openNew(col.dataset.col);
  });
});

function openNew(col){
  const id = Date.now().toString();
  data[col].push({
    id,
    titulo:"Nuevo",
    detalle:"",
    cliente:"",
    turno:"",
    estado:"Presupuesto",
    ingreso:new Date().toLocaleDateString(),
    promesa:"",
    img:""
  });
  renderBoard();
  scheduleSave();
}

function openEditor(id){
  alert("Abrir editor para tarjeta "+id);
}

// ================== Auto-Compact ==================
function applyCompactScale(){
  const MIN_SCALE = 0.65;
  const GAP = 10;
  ["recepcion","diagnostico","reparacion","listo","entregado"].forEach(col=>{
    const list = document.getElementById(col);
    if(!list) return;
    const cards = list.querySelectorAll(".card");
    if(!cards.length){
      list.style.setProperty("--scale","1");
      return;
    }
    let total=0;
    cards.forEach(c=> total+=c.getBoundingClientRect().height);
    total+= GAP*(cards.length-1);
    const avail = list.clientHeight;
    let scale = Math.min(1, Math.max(MIN_SCALE, avail/total));
    list.style.setProperty("--scale", scale.toFixed(3));
  });
}
window.addEventListener("resize", ()=> requestAnimationFrame(applyCompactScale));

// ================== Guardar ==================
let saveTimer=null;
function scheduleSave(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer=setTimeout(()=> saveData(),500);
}

async function saveData(){
  await setDoc(doc(db,"kanban","board"), data);
}

// ================== Cargar ==================
async function loadData(){
  const snap = await getDoc(doc(db,"kanban","board"));
  if(snap.exists()) data = snap.data();
  renderBoard();
}
loadData();
