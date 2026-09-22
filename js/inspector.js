/* --------------------------------------------------------------------------
   inspector.js

   The per-hex inspector overlay: place name and notes for the selected hex.

   Uses:
     features.js           FEATURES
     geometry.js           gridCoord, inside
     history.js            push
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
  if(document.activeElement!==iNote) iNote.value=S.memo[sel]||"";
  const btn=document.getElementById("iSave");
  if(btn){ btn.textContent="Save"; btn.style.background=""; btn.style.borderColor=""; }
}
document.getElementById("iClose").onclick=closeInspector;
insp.addEventListener("pointerdown",e=>{ if(e.target===insp) closeInspector(); });

// Save button: commit fields, show confirmation
document.getElementById("iSave").onclick=()=>{
  if(sel===null) return;
  push();
  const nm=iName.value.trim();
  if(nm) S.labels[sel]=nm; else delete S.labels[sel];
  const nt=iNote.value;
  if(nt.trim()) S.memo[sel]=nt; else delete S.memo[sel];
  store();
  refresh();          // note marks may have appeared or gone
  closeInspector();
};

document.getElementById("iWipe").onclick=()=>{
  if(sel===null) return;
  push(); delete S.labels[sel]; delete S.memo[sel];
  syncInspector(); store(); refresh();
};
