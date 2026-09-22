/* --------------------------------------------------------------------------
   keys.js

   Keyboard shortcuts. One listener, ignored while a field has focus.

   Uses:
     history.js            redo, undo
     inspector.js          closeInspector, insp
     notes-page.js         openPage
     rail.js               brushI, setTool
     render.js             refresh
     state.js              S, brush, ppmView
     storage.js            store
     zoom.js               doFit, setZoom
   -------------------------------------------------------------------------- */
"use strict";

addEventListener("keydown",e=>{
  const t=e.target.tagName;
  if(t==="INPUT"||t==="TEXTAREA"||t==="SELECT"){
    if(e.key==="Escape"){
      e.target.blur();
      if(insp.classList.contains("on")) closeInspector();
    }
    return;
  }
  const k=e.key.toLowerCase();
  if((e.metaKey||e.ctrlKey)&&k==="z"){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if((e.metaKey||e.ctrlKey)&&k==="y"){ e.preventDefault(); redo(); return; }
  if(e.metaKey||e.ctrlKey) return;
  const map={b:"paint",g:"fill",f:"feature",e:"erase",i:"inspect"};
  if(map[k]) setTool(map[k]);
  if(k==="c"){ S.coord=!S.coord; document.getElementById("cCoord").checked=S.coord; refresh(); store(); }
  if(k==="n"&&!insp.classList.contains("on")) openPage();
  if(k==="escape") closeInspector();
  if(k==="+"||k==="="){ setZoom(ppmView*1.25,true); }
  if(k==="-"||k==="_"){ setZoom(ppmView/1.25,true); }
  if(k==="0"){ doFit(); }
  if(k==="["&&brush>0){ brushI.value=--brush; brushI.oninput(); }
  if(k==="]"&&brush<2){ brushI.value=++brush; brushI.oninput(); }
});
