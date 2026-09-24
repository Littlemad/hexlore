/* --------------------------------------------------------------------------
   history.js

   Undo and redo, as a stack of state snapshots capped at 50 entries.

   Uses:
     inspector.js          syncInspector
     rail.js               colsI, rowsI
     render.js             refresh
     state.js              S, sel
     storage.js            store
   -------------------------------------------------------------------------- */
"use strict";

const past=[], future=[];
/* Capture the undoable part of the state: tiles, features, labels, notes, paths, chronicle, grid size. */
function snap(){ return { t:S.terr.slice(), f:S.feat.slice(),
  l:JSON.stringify(S.labels), m:JSON.stringify(S.memo), c:S.cols, r:S.rows,
  p:JSON.stringify(S.paths||[]), h:JSON.stringify(S.chronicle) }; }
/* Record a snapshot before an edit and drop the redo stack. Call this *before* mutating S. */
function push(){ past.push(snap()); if(past.length>50) past.shift(); future.length=0; buttons(); }
/* Load a snapshot back into S and resync the controls that mirror it. */
function restore(x){
  S.cols=x.c; S.rows=x.r;
  S.terr=x.t.slice(); S.feat=x.f.slice();
  S.labels=JSON.parse(x.l); S.memo=JSON.parse(x.m);
  S.paths=x.p ? JSON.parse(x.p) : [];
  S.chronicle=x.h ? JSON.parse(x.h) : null;
  colsI.value=colsO.value=S.cols; rowsI.value=rowsO.value=S.rows;
  if(sel!==null && sel>=S.cols*S.rows) sel=null;
  syncInspector();
}
/* Step one snapshot back. */
function undo(){ if(!past.length) return; future.push(snap()); restore(past.pop()); buttons(); refresh(); store(); }
/* Step one snapshot forward. */
function redo(){ if(!future.length) return; past.push(snap()); restore(future.pop()); buttons(); refresh(); store(); }
/* Enable or disable the undo and redo buttons to match the stacks. */
function buttons(){
  document.getElementById("undo").disabled=!past.length;
  document.getElementById("redo").disabled=!future.length;
}
