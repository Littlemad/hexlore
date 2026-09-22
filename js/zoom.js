/* --------------------------------------------------------------------------
   zoom.js

   Stage zoom: the fit-to-window calculation, the clamped setter and the readout.

   Uses:
     geometry.js           layout
     render.js             refresh
     state.js              DPMM_CSS, autoFit, ppmView
   -------------------------------------------------------------------------- */
"use strict";

const ZMIN=DPMM_CSS*.35, ZMAX=DPMM_CSS*3;
/* Pixels per mm at which the sheet just fits the stage. */
function fitPpm(){
  const st=document.getElementById("stage"), L=layout();
  const w=(st&&st.clientWidth)||960, h=(st&&st.clientHeight)||700;
  return Math.max(ZMIN, Math.min(ZMAX, Math.min((w-44)/L.pw, (h-44)/L.ph)));
}
/* Write the current zoom percentage into the header readout. */
function showZoom(){
  document.getElementById("zoomOut").value=Math.round(ppmView/DPMM_CSS*100)+"%";
}
/* Clamp and apply a zoom level; `manual` switches off fit-to-window. */
function setZoom(v,manual){
  ppmView=Math.max(ZMIN,Math.min(ZMAX,v));
  if(manual) autoFit=false;
  showZoom(); refresh();
}
/* Re-enable fit-to-window and zoom to it. */
function doFit(){ autoFit=true; ppmView=fitPpm(); showZoom(); refresh(); }
window.addEventListener("resize",()=>{ if(autoFit) ppmView=fitPpm(); showZoom(); refresh(); });
