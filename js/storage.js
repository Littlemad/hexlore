/* --------------------------------------------------------------------------
   storage.js

   Session persistence through window.storage, the random plate name, and boot().

   Uses:
     exporting.js          hydrate, serialise, syncRail
     render.js             refresh
     state.js              S, ppmView
     zoom.js               fitPpm, showZoom
   -------------------------------------------------------------------------- */
"use strict";

const KEY="hexlore:plate", OLD_KEY="hexsurvey:plate";
let saveTmr=null;
/* Save the plate, debounced by 700ms. No-op outside the artifact runtime, where window.storage does not exist. */
function store(){
  if(!window.storage) return;
  clearTimeout(saveTmr);
  saveTmr=setTimeout(()=>{ try{ window.storage.set(KEY,serialise()); }catch(e){} },700);
}
/* Invent a plate title, so a new sheet is never called nothing. */
function randName(){
  const adj=["Ashen","Crimson","Iron","Silent","Hollow","Sunken","Broken","Grey",
              "Ancient","Blighted","Faded","Bitter","Wandering","Forsaken","Dark",
              "Scarred","Lost","Pale","Storm","Ember"];
  const noun=["Reach","Vale","Moor","Crossing","Expanse","Waste","Fen","Marches",
               "Shore","Downs","Pass","Hold","Hollow","Basin","Heath","Strand",
               "Peaks","Crown","Gate","Brink"];
  const prefix=["The ","The ","","","The ",""];
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  return pick(prefix)+pick(adj)+" "+pick(noun);
}
/* Entry point: restore the last plate if there is one, wait for fonts, then fit and draw. */
async function boot(){
  if(!S.title){ S.title=randName(); }
  syncRail();
  if(window.storage){
    try{
      let r=null;
      try{ r=await window.storage.get(KEY); }
      catch(e){ /* nothing under the current key */ }
      if(!r||!r.value){
        // carry over anything saved before the rename
        try{ r=await window.storage.get(OLD_KEY); }catch(e){}
      }
      if(r&&r.value){ hydrate(JSON.parse(r.value)); syncRail(); }
    }catch(e){ /* nothing stored yet */ }
  }
  try{ await document.fonts.ready; }catch(e){}
  ppmView=fitPpm(); showZoom();
  refresh();
}
