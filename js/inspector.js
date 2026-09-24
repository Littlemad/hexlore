/* --------------------------------------------------------------------------
   inspector.js

   The per-hex inspector overlay: place name and notes for the selected hex.

   Uses:
     features.js           FEATURES
     geometry.js           gridCoord, inside
     history.js            push
     loregen.js            chronicleEntry, renameChroniclePlace (guarded with typeof: loads after this file)
     render.js             draw, refresh
     state.js              S, sel
     storage.js            store
     terrains.js           TERRAINS
   -------------------------------------------------------------------------- */
"use strict";

const insp=document.getElementById("insp");
const iName=document.getElementById("iName"), iNote=document.getElementById("iNote");

/* Show the inspector for the selected hex. */
function openInspector(){ insp.classList.add("on"); syncInspector(); }
/* Hide the inspector and clear the selection. */
function closeInspector(){
  if(!insp.classList.contains("on")) return;
  insp.classList.remove("on"); sel=null; draw();
}
/* Refresh the inspector fields from S, leaving whichever field has focus alone. */
function syncInspector(){
  if(sel===null||!insp.classList.contains("on")) return;
  const col=sel%S.cols, r=(sel-col)/S.cols;
  if(!inside(col,r)){ closeInspector(); return; }
  document.getElementById("iCoord").textContent=gridCoord(col,r);
  const t=S.terr[sel], f=S.feat[sel];
  const tName=t?TERRAINS[t-1].name:"—", fName=f?FEATURES[f-1].name:"—";
  document.getElementById("iOff").textContent=tName+"  ·  "+fName;
  if(document.activeElement!==iName) iName.value=S.labels[sel]||"";
  if(document.activeElement!==iNote){
    // no manual note yet: show the generated chronicle entry (if any) so it can be read and edited here
    const gen=typeof chronicleEntry==="function"?chronicleEntry(sel):null;
    iNote.value=S.memo[sel]||(gen?gen.text:"");
  }
  const btn=document.getElementById("iSave");
  if(btn){ btn.textContent="Save"; btn.style.background=""; btn.style.borderColor=""; }
}
document.getElementById("iClose").onclick=closeInspector;
insp.addEventListener("pointerdown",e=>{ if(e.target===insp) closeInspector(); });

// Save button: commit fields, show confirmation
document.getElementById("iSave").onclick=()=>{
  if(sel===null) return;
  push();
  const nm=iName.value.trim(), oldNm=S.labels[sel];
  if(nm) S.labels[sel]=nm; else delete S.labels[sel];
  if(oldNm&&nm&&typeof renameChroniclePlace==="function") renameChroniclePlace(sel,oldNm,nm);
  const nt=iNote.value;
  if(nt.trim()) S.memo[sel]=nt; else delete S.memo[sel];
  store();
  refresh();          // note marks may have appeared or gone
  closeInspector();
};

/* Roll a name that suits the hex's point of interest (a ruin gets "Ruins of…",
   a mine "… Delve"), falling back to the generic plate namer when the hex has
   none or the kind is a custom one the generator doesn't know. */
document.getElementById("iRandName").onclick=()=>{
  if(sel===null) return;
  const f=S.feat[sel], kind=f?FEATURES[f-1].id:null;
  let name= kind&&window.namePlace ? namePlace(kind) : null;
  if(!name){
    const existing=new Set(Object.values(S.labels));
    for(let tries=0;tries<50;tries++){ name=randName(); if(!existing.has(name)) break; }
  }
  iName.value=name;
  iName.focus();
};
