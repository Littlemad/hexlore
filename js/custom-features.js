/* --------------------------------------------------------------------------
   custom-features.js

   The custom point-of-interest editor modal, the same idea for POI glyphs.

   Uses:
     features.js           FEATURES, F_BY_ID, GLYPH, GLYPH_BG, rebuildFeatures
     palette.js            INK, PAPER
     rail.js               buildFeatureSwatches, selectFeature
     render.js             refresh
     state.js              S, curF
     storage.js            store
     symbols.js            SVG_CACHE, drawSvgSymbol, loadTileSvg
   -------------------------------------------------------------------------- */
"use strict";

const featModal=document.getElementById("featModal");
let fmSvg=null, fmSvgName="";
const FM_PREVIEW_ID="__fmPreview";
/* Redraw the custom point-of-interest preview. */
function fmRefresh(){
  const cv2=document.getElementById("fmPreview");
  const c=cv2.getContext("2d"), w=cv2.width, h=cv2.height;
  c.clearRect(0,0,w,h);
  c.fillStyle=PAPER; c.fillRect(0,0,w,h);
  if(fmSvg){ GLYPH=INK; GLYPH_BG=PAPER; drawSvgSymbol(c,w/2,h/2,36,FM_PREVIEW_ID,INK,false); }
  document.getElementById("fmFileName").textContent = fmSvgName || "Choose an SVG";
}
document.getElementById("fmPick").onclick=()=>document.getElementById("fmFile").click();
document.getElementById("fmDrop").onclick=()=>{
  fmSvg=null; fmSvgName="";
  document.getElementById("fmFile").value="";
  delete SVG_CACHE[FM_PREVIEW_ID];
  fmRefresh();
};
document.getElementById("fmFile").onchange=e=>{
  const f=e.target.files && e.target.files[0]; if(!f) return;
  const warn=document.getElementById("fmWarn");
  if(f.size>96*1024){ warn.textContent="That SVG is over 96 KB — try a simpler one."; return; }
  const rd=new FileReader();
  rd.onload=()=>{
    let txt=String(rd.result);
    if(txt.indexOf("<svg")<0){ warn.textContent="That file isn't an SVG."; return; }
    txt=txt.replace(/<script[\s\S]*?<\/script>/gi,"");
    warn.textContent="";
    fmSvg=txt; fmSvgName=f.name;
    loadTileSvg(FM_PREVIEW_ID, txt, fmRefresh);
  };
  rd.readAsText(f);
};
document.getElementById("fmClose").onclick=()=>featModal.classList.remove("on");
featModal.addEventListener("pointerdown",e=>{ if(e.target===featModal) featModal.classList.remove("on"); });
document.getElementById("newFeat").onclick=()=>{
  document.getElementById("fmName").value="";
  document.getElementById("fmWarn").textContent="";
  document.getElementById("fmFile").value="";
  fmSvg=null; fmSvgName="";
  delete SVG_CACHE[FM_PREVIEW_ID];
  featModal.classList.add("on");
  fmRefresh();
  document.getElementById("fmName").focus();
};
document.getElementById("fmSave").onclick=()=>{
  const nm=document.getElementById("fmName").value.trim();
  const warn=document.getElementById("fmWarn");
  if(!nm){ warn.textContent="Give the point of interest a name."; return; }
  if(!fmSvg){ warn.textContent="Choose an SVG file."; return; }
  if(FEATURES.length>=40){ warn.textContent="That is as many points of interest as a sheet can hold."; return; }
  const id="cf_"+Date.now().toString(36);
  S.customFeats.push({id, name:nm, svg:fmSvg, svgName:fmSvgName});
  loadTileSvg(id, fmSvg, ()=>{ buildFeatureSwatches(); refresh(); });
  rebuildFeatures(); buildFeatureSwatches();
  featModal.classList.remove("on");
  selectFeature(id); refresh(); store();
};
/* Remove a custom point of interest and clear it from any hex that used it. */
function deleteCustomFeat(id){
  const v=F_BY_ID[id];
  if(v) for(let i=0;i<S.feat.length;i++) if(S.feat[i]===v) S.feat[i]=0;
  S.customFeats=S.customFeats.filter(t=>t.id!==id);
  rebuildFeatures(); buildFeatureSwatches(); refresh(); store();
}
