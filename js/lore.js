/* --------------------------------------------------------------------------
   lore.js

   The Lore tab: a full-page gazetteer listing every annotated hex (a note, a
   place name or a point of interest) in coordinate order, the Hexmap / Lore
   view switch in the header, the Lore sidebar controls (columns, easy
   readability) and the portrait @page rule that makes the tab print on A4.

   The view and the two reading preferences are editor state, not plate state:
   they live here rather than in S, are never saved into a plate, and the two
   preferences persist in localStorage only.

   Uses:
     features.js           FEATURES
     geometry.js           gridCoord
     inspector.js          openInspector
     rail.js               hintFor
     render.js             refresh
     state.js              S, sel, autoFit, ppmView, tool
     terrains.js           TERRAINS
     zoom.js               fitPpm, showZoom

   render.js (refresh → syncLore) and exporting.js (the print handlers → view)
   call back into this file from inside callbacks, guarded with typeof because
   they load first.
   -------------------------------------------------------------------------- */
"use strict";

let view="map", loreCols=2;
const loreEl=document.getElementById("lore"), loreBody=document.getElementById("loreBody");
const LORE_KEY="hexlore:lore";

/* True when hex i carries anything worth listing: a note, a place name or a point of interest. */
function annotated(i){ return !!(S.memo[i]||S.labels[i]||S.feat[i]); }
/* Four-digit grid coordinate of flat index i. */
function coordOf(i){ const c=i%S.cols; return gridCoord(c,(i-c)/S.cols); }
/* Flat indices of every annotated hex, in coordinate order (0101, 0102, … then 0201). */
function loreEntries(){
  const out=[];
  for(let i=0;i<S.cols*S.rows;i++) if(annotated(i)) out.push(i);
  // the coordinate strings are fixed width, so plain string order is coordinate order
  return out.sort((a,b)=>coordOf(a)<coordOf(b)?-1:1);
}
/* Make an element with a class and optional text. */
function el(tag,cls,text){ const e=document.createElement(tag); e.className=cls; if(text!==undefined) e.textContent=text; return e; }
/* Rebuild the Lore page from S: masthead, then one entry per annotated hex. */
function buildLore(){
  const list=loreEntries();
  document.getElementById("loreTitle").textContent=S.title||"Untitled plate";
  document.getElementById("loreCount").textContent=
    list.length+" annotated hex"+(list.length===1?"":"es")+" · "+S.cols+"×"+S.rows;
  loreBody.innerHTML="";
  if(!list.length){
    loreBody.appendChild(el("p","lore-empty","No lore yet. Use the Lore tool to annotate hexes, or place a point of interest."));
    return;
  }
  list.forEach(i=>{
    const t=S.terr[i], f=S.feat[i], nm=S.labels[i]||"", note=S.memo[i]||"";
    const card=el("article","lore-entry"); card.tabIndex=0; card.dataset.idx=i;
    const hd=el("div","lore-hd");   // not <header>: the app-wide header rules would restyle it
    hd.appendChild(el("span","lore-gc",coordOf(i)));
    if(nm) hd.appendChild(el("span","lore-name",nm));
    const editBtn=el("button","lore-edit"); editBtn.textContent="✎"; editBtn.title="Edit this entry";
    editBtn.style.cssText="flex:0 0 auto;cursor:pointer;padding:2px 6px;background:var(--raise);border:1px solid var(--edge);border-radius:3px;color:var(--text);font-size:14px;margin-left:auto";
    hd.appendChild(editBtn);
    card.appendChild(hd);
    card.appendChild(el("div","lore-meta",(t?TERRAINS[t-1].name:"—")+(f?" · "+FEATURES[f-1].name:"")));
    if(note) card.appendChild(el("p","lore-txt",note));
    const open=()=>{ sel=i; openInspector(); };
    editBtn.addEventListener("click",e=>{ e.stopPropagation(); open(); });
    card.addEventListener("click",open);
    card.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); } });
    loreBody.appendChild(card);
  });
}
/* Rebuild the list if the Lore tab is showing. refresh() calls this after every change to S. */
function syncLore(){ if(view==="lore") buildLore(); }

/* The @page rule for the current view: portrait with margins and running header for Lore, nothing for the map so the stylesheet's landscape rule applies. */
function pageCss(){
  if(view!=="lore") return "";
  const t=(S.title||"Untitled plate").replace(/[\\"]/g,"\\$&");
  return "@page{size:A4 portrait;margin:16mm 16mm 18mm;"
    +"@top-center{content:\""+t+"\";font:600 9pt 'Bodoni Moda',Didot,serif;color:#000}"
    +"@bottom-center{content:counter(page);font:400 8pt 'IBM Plex Mono',monospace;color:#444}}";
}
/* Switch between the map editor and the Lore page. */
function setView(v){
  view=v; document.body.dataset.view=v;
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.view===v));
  document.getElementById("pageRule").textContent=pageCss();
  if(v==="lore"){
    buildLore();
    document.getElementById("hint").textContent="Click an entry to edit its record · N returns to the map";
    return;
  }
  // the stage has layout again now, so a fit-to-window zoom can be recomputed
  if(autoFit){ ppmView=fitPpm(); showZoom(); }
  refresh();
  document.getElementById("hint").textContent=hintFor();
}
/* Flip between the two views; bound to the N key. */
function toggleView(){ setView(view==="lore"?"map":"lore"); }

/* Set the Lore page to one or two columns. */
function setLoreCols(n){
  loreCols=n===2?2:1; loreEl.dataset.cols=loreCols;
  document.querySelectorAll("#loreCols button").forEach(b=>b.setAttribute("aria-pressed",+b.dataset.cols===loreCols));
  saveLorePrefs();
}
/* Remember the column preference. The active view is deliberately not kept. */
function saveLorePrefs(){
  try{ localStorage.setItem(LORE_KEY,JSON.stringify({cols:loreCols})); }catch(e){}
}
/* Restore the column preference, tolerating a missing or damaged entry. */
function loadLorePrefs(){
  let p=null;
  try{ p=JSON.parse(localStorage.getItem(LORE_KEY)||"null"); }catch(e){}
  setLoreCols(p&&p.cols===1?1:2);
}

document.querySelectorAll("#tabs button").forEach(b=>{ b.onclick=()=>{ setView(b.dataset.view); window.location.hash=b.dataset.view==="lore"?"lore":""; }; });
document.querySelectorAll("#loreCols button").forEach(b=>{ b.onclick=()=>setLoreCols(+b.dataset.cols); });
window.addEventListener("hashchange",()=>{ if(window.location.hash==="#lore") setView("lore"); else if(view==="lore") setView("map"); });
loadLorePrefs();
if(window.location.hash==="#lore") setView("lore");
