/* --------------------------------------------------------------------------
   exporting.js

   Save, import, PNG export and print, plus the save-file format itself
   (serialise / hydrate) and the toast used to confirm all of it.

   Uses:
     features.js           FEATURES, F_BY_ID, GLYPH_BG, rebuildFeatures
     geometry.js           layout
     history.js            push
     inspector.js          closeInspector
     palette.js            PAPER, PAPERLINE, PAPERLINE_PRINT, PAPERLINE_SCREEN,
                           PAPER_PRINT, PAPER_SCREEN
     rail.js               SHOW, brushO, buildFeatureSwatches, buildTileSwatches, colsI,
                           rowsI
     render.js             paint, refresh
     state.js              DPMM_PRINT, S, autoFit, brush, ppmView, printing, sel
     storage.js            store
     terrains.js           TERRAINS, T_BY_ID, rebuildTiles
     zoom.js               fitPpm, showZoom
     lore.js               view (loads later; the print handlers guard it with typeof)
   -------------------------------------------------------------------------- */
"use strict";

/* Filename-safe version of the plate title. */
function slug(){
  return (S.title||"hex-plate").toLowerCase().replace(/[^a-z0-9]+/g,"-")
         .replace(/^-|-$/g,"")||"hex-plate";
}
/* Trigger a browser download of a URL under the given filename. */
function dl(href,name){ const a=document.createElement("a"); a.href=href; a.download=name; a.click(); }
document.getElementById("png").onclick=()=>{
  const L=layout();
  const off=document.createElement("canvas");
  off.width=Math.round(L.pw*DPMM_PRINT); off.height=Math.round(L.ph*DPMM_PRINT);
  PAPER=PAPER_PRINT; PAPERLINE=PAPERLINE_PRINT; GLYPH_BG=PAPER;
  paint(off.getContext("2d"),DPMM_PRINT,L);
  PAPER=PAPER_SCREEN; PAPERLINE=PAPERLINE_SCREEN; GLYPH_BG=PAPER;
  dl(off.toDataURL("image/png"), slug()+"-a4-300dpi.png");
};
document.getElementById("print").onclick=()=>window.print();
/* True while the Lore tab is showing: printing then lays out the page, not the plate, so the 300 dpi repaint is skipped. */
function loreShowing(){ return typeof view!=="undefined" && view==="lore"; }
window.addEventListener("beforeprint",()=>{ if(loreShowing()) return; printing=true; PAPER=PAPER_PRINT; PAPERLINE=PAPERLINE_PRINT; GLYPH_BG=PAPER; refresh(); });
window.addEventListener("afterprint",()=>{ if(loreShowing()) return; printing=false; PAPER=PAPER_SCREEN; PAPERLINE=PAPERLINE_SCREEN; GLYPH_BG=PAPER; refresh(); });

/* Serialise the plate to the .hexplate.json save format (version 8). */
function serialise(){
  return JSON.stringify({
    v:8, cols:S.cols, rows:S.rows,
    title:S.title,
    show:{hexOpacity:S.hexOpacity,coord:S.coord,notes:S.notes,mono:S.mono},
    custom:S.custom, customFeats:S.customFeats||[], paths:(S.paths||[]),
    gen:S.gen||GEN_DEFAULTS,
    tiles:TERRAINS.map(t=>t.id), feats:FEATURES.map(f=>f.id),
    terr:Array.from(S.terr), feat:Array.from(S.feat), labels:S.labels, memo:S.memo
  });
}
/* Load a parsed save file into S, clamping sizes and remapping tile and feature ids so older files still open. */
function hydrate(d){
  if(!d||!d.cols) throw new Error("not a hex plate");
  S.cols=Math.max(4,Math.min(40,d.cols|0));
  S.rows=Math.max(4,Math.min(40,d.rows|0));
  S.title=d.title||"";
  S.custom=Array.isArray(d.custom) ? d.custom.filter(t=>t&&t.id&&t.base).slice(0,30) : [];
  S.customFeats=Array.isArray(d.customFeats) ? d.customFeats.filter(t=>t&&t.id&&t.svg).slice(0,30) : [];
  S.paths=Array.isArray(d.paths) ? d.paths.filter(p=>p&&p.hexes&&p.hexes.length>=2) : [];
  rebuildTiles();
  rebuildFeatures();
  const n=S.cols*S.rows;
  S.terr=new Uint8Array(n); S.feat=new Uint8Array(n); S.labels={}; S.memo={};
  // remap through the saved id lists, so older plates survive list changes
  const tmap=(d.tiles||[]).map(id=>T_BY_ID[id]||0);
  const fmap=(d.feats||[]).map(id=>F_BY_ID[id]||0);
  (d.terr||[]).slice(0,n).forEach((v,i)=>{
    S.terr[i]= v ? (tmap.length ? (tmap[v-1]||0) : (v<=TERRAINS.length?v:0)) : 0; });
  (d.feat||[]).slice(0,n).forEach((v,i)=>{
    S.feat[i]= v ? (fmap.length ? (fmap[v-1]||0) : (v<=FEATURES.length?v:0)) : 0; });
  for(const k in (d.labels||{})) if(+k<n) S.labels[k]=String(d.labels[k]).slice(0,28);
  for(const k in (d.memo||{}))   if(+k<n) S.memo[k]=String(d.memo[k]).slice(0,1200);
  if(d.show){ S.hexOpacity=d.show.hexOpacity!==undefined?+d.show.hexOpacity:72;
              S.coord=!!d.show.coord; S.notes=d.show.notes!==false; S.mono=!!d.show.mono; }
  // random-map settings: unknown keys are dropped, numbers clamped, older files get the defaults
  S.gen=Object.assign({},GEN_DEFAULTS);
  const gsrc=Object.assign({},d.gen);
  // earlier plates stored land instead of sea, and one water slider for both lakes and rivers
  if(gsrc.sea===undefined&&gsrc.land!==undefined) gsrc.sea=100-(+gsrc.land||0);
  if(gsrc.water!==undefined){ if(gsrc.lakes===undefined) gsrc.lakes=gsrc.water;
                              if(gsrc.rivers===undefined) gsrc.rivers=gsrc.water; }
  // older plates: "random"/"Standard" climate is now Temperate; "random" coast is Standard
  if(gsrc.climate==="random"||gsrc.climate==="Standard") gsrc.climate="temperate";
  if(gsrc.coast==="random") gsrc.coast="Standard";
  if(d.gen&&typeof d.gen==="object") for(const k in GEN_DEFAULTS){
    const v=gsrc[k]; if(v===undefined) continue;
    if(typeof GEN_DEFAULTS[k]==="number"){ if(isFinite(+v)) S.gen[k]=Math.max(0,Math.min(100,Math.round(+v))); }
    else if(typeof v==="string"&&v.length<20) S.gen[k]=v;
  }
  sel=null;
}
let toastTmr=null;
/* Flash a short confirmation message at the bottom of the window. */
function showToast(msg){
  const t=document.getElementById("toast");
  t.textContent=msg; t.classList.add("show");
  clearTimeout(toastTmr);
  toastTmr=setTimeout(()=>t.classList.remove("show"),2200);
}

let importedFileHandle=null;
let importedFileName=null;

document.getElementById("save").onclick=async()=>{
  const json=serialise();
  if(importedFileHandle){
    try{
      const writable=await importedFileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      showToast("✓ Saved to "+importedFileHandle.name);
      return;
    }catch(e){ importedFileHandle=null; }
  }
  dl(URL.createObjectURL(new Blob([json],{type:"application/json"})),
     importedFileName||slug()+".hexplate.json");
};

/* --- Map library (localStorage cache of imported files) --- */
function _libraryLoad(){
  try{ return JSON.parse(localStorage.getItem("hexlore:library")||"[]"); }catch(e){ return []; }
}
function _librarySave(name, text){
  try{
    let lib=_libraryLoad().filter(e=>e.name!==name);
    lib.unshift({name, text, saved:Date.now()});
    if(lib.length>10) lib=lib.slice(0,10);
    localStorage.setItem("hexlore:library", JSON.stringify(lib));
  }catch(e){}
}

/* Parse, hydrate and sync — the shared path for all import flows. */
function doImport(text, filename, handle){
  try{
    push(); hydrate(JSON.parse(text)); syncRail(); closeInspector();
    if(autoFit){ ppmView=fitPpm(); showZoom(); }
    refresh(); store();
    importedFileHandle=handle;
    importedFileName=filename;
    document.getElementById("hint").textContent="Opened "+filename;
    _librarySave(filename, text);
    closeImportDialog();
  }catch(err){
    document.getElementById("hint").textContent="That file isn’t a hex plate — expected .hexplate.json";
  }
}

/* --- Import dialog --- */
function _refreshMapLibrary(){
  const list=document.getElementById("imFileList");
  list.innerHTML="";

  const lib=_libraryLoad();
  const libNames=new Set(lib.map(e=>e.name));
  if(lib.length){
    lib.forEach(entry=>{
      const d=document.createElement("div");
      d.className="im-file-item"; d.title=entry.name;
      d.innerHTML='<span class="im-icon">⬡</span>'+entry.name;
      d.onclick=()=>doImport(entry.text, entry.name, null);
      list.appendChild(d);
    });
  }

  const examples=typeof EXAMPLE_MAPS!=="undefined"
    ? EXAMPLE_MAPS.filter(ex=>!libNames.has(ex.name)) : [];
  if(examples.length){
    const hd=document.createElement("div");
    hd.className="im-section-hd im-section-gap"; hd.textContent="Examples"; list.appendChild(hd);
    examples.forEach(ex=>{
      const d=document.createElement("div");
      d.className="im-file-item"; d.title=ex.name;
      d.innerHTML='<span class="im-icon">⬡</span>'+ex.name;
      d.onclick=()=>doImport(ex.text, ex.name, null);
      list.appendChild(d);
    });
  }

  if(!list.children.length){
    const s=document.createElement("span");
    s.className="im-empty";
    s.textContent="No maps yet — use Browse to import one";
    list.appendChild(s);
  }
}
function openImportDialog(){
  document.getElementById("importModal").classList.add("on");
  _refreshMapLibrary();
}
function closeImportDialog(){
  document.getElementById("importModal").classList.remove("on");
}

document.getElementById("open").onclick=()=>openImportDialog();
document.getElementById("imClose").onclick=()=>closeImportDialog();
document.getElementById("importModal").onclick=(e)=>{
  if(e.target===document.getElementById("importModal")) closeImportDialog();
};
document.getElementById("imBrowse").onclick=async()=>{
  if(window.showOpenFilePicker){
    try{
      const [handle]=await window.showOpenFilePicker({
        types:[{description:"Hex plate",accept:{"application/json":[".json"]}}],
        multiple:false
      });
      const f=await handle.getFile();
      doImport(await f.text(), f.name, handle); return;
    }catch(e){}
  }
  const inp=document.createElement("input"); inp.type="file"; inp.accept=".json,application/json";
  inp.onchange=()=>{
    const f=inp.files&&inp.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>doImport(rd.result, f.name, null);
    rd.readAsText(f);
  };
  inp.click();
};
/* Push every value in S back out to the rail controls. Call after loading a plate. */
function syncRail(){
  buildTileSwatches();
  buildFeatureSwatches();
  colsI.value=colsO.value=S.cols; rowsI.value=rowsO.value=S.rows;
  document.getElementById("title").value=S.title;

  SHOW.forEach(([id,k])=>{ document.getElementById(id).checked=S[k]; });
  const hexOpSlider=document.getElementById("hexOpacity");
  const hexOpOut=document.getElementById("hexOpacityOut");
  hexOpSlider.value=S.hexOpacity!==undefined?S.hexOpacity:72;
  hexOpOut.textContent=hexOpSlider.value+"%";
  brushO.value=[1,7,19][brush]+" hex"+(brush?"es":"");
  if(typeof syncGenPanel==="function") syncGenPanel();
  showZoom();
}
