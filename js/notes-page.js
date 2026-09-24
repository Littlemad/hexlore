/* --------------------------------------------------------------------------
   notes-page.js

   The full-page view listing every annotated hex as a card.

   Uses:
     features.js           FEATURES
     geometry.js           gridCoord, inside
     inspector.js          openInspector
     state.js              S, sel
     terrains.js           TERRAINS
   -------------------------------------------------------------------------- */
"use strict";

/* Build one card per annotated hex, sorted by grid position. */
function buildNotesPage(){
  const body=document.getElementById("notesBody");
  if(!body) return;
  body.innerHTML="";
  const keys=Object.keys(S.memo).filter(k=>S.memo[k]);
  if(!keys.length){
    const p=document.createElement("p");
    p.style.cssText="color:var(--dimmer);font:400 15px/1.6 'IBM Plex Mono',monospace;grid-column:1/-1";
    p.textContent="No notes yet. Use the Lore tool to annotate hexes.";
    body.appendChild(p); return;
  }
  keys.sort((a,b)=>+a-+b).forEach(k=>{
    const i=+k, col=i%S.cols, r=(i-col)/S.cols;
    if(!inside(col,r)) return;
    const gc=gridCoord(col,r);
    const t=S.terr[i], f=S.feat[i];
    const tName=t?TERRAINS[t-1].name:"—", fName=f?FEATURES[f-1].name:"";
    const nm=S.labels[i]||"";
    const card=document.createElement("div");
    card.style.cssText="background:var(--panel);border:1px solid var(--edge);border-radius:6px;"
      +"padding:18px;display:flex;flex-direction:column;gap:10px;cursor:pointer;transition:border-color .15s";
    const title=document.createElement("div");
    title.style.cssText="display:flex;align-items:baseline;gap:12px";
    const gcSpan=document.createElement("span"); gcSpan.style.cssText="font:600 18px/1 'IBM Plex Mono',monospace;color:var(--text)"; gcSpan.textContent=gc; title.appendChild(gcSpan);
    if(nm){ const nmSpan=document.createElement("span"); nmSpan.style.cssText="font:500 13px/1 'Archivo',sans-serif;color:var(--dim)"; nmSpan.textContent=nm; title.appendChild(nmSpan); }
    const sub=document.createElement("div");
    sub.style.cssText="font:400 11px/1 'IBM Plex Mono',monospace;letter-spacing:.12em;color:var(--dimmer);text-transform:uppercase";
    sub.textContent=tName+(fName?" · "+fName:"");
    const txt=document.createElement("div");
    txt.style.cssText="font:400 14px/1.7 'Archivo',sans-serif;color:var(--text);white-space:pre-wrap";
    txt.textContent=S.memo[i];
    card.appendChild(title); card.appendChild(sub); card.appendChild(txt);
    card.addEventListener("click",()=>{ sel=i; closePage(); openInspector(); });
    card.addEventListener("mouseenter",()=>{ card.style.borderColor="var(--accent)"; });
    card.addEventListener("mouseleave",()=>{ card.style.borderColor="var(--edge)"; });
    body.appendChild(card);
  });
}
const notesPage=document.getElementById("notesPage");
/* Show the notes page. */
function openPage(){ buildNotesPage(); notesPage.style.display="flex"; }
/* Hide the notes page. */
function closePage(){ notesPage.style.display="none"; }
document.getElementById("notesClose").onclick=closePage;
document.getElementById("notesBtn").onclick=openPage;
