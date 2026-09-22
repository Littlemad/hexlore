/* --------------------------------------------------------------------------
   state.js

   The single mutable state object S and the loose editor variables beside it.
   Everything else in the app reads and writes through here, so this is the first
   file to read when you want to know what a plate actually is.

   Uses: nothing — this file is a leaf and can be read on its own.
   -------------------------------------------------------------------------- */
"use strict";

const A4_SHORT=210, A4_LONG=297;   // millimetres
const M=11, HEAD=20;               // page margin, masthead band
const DPMM_PRINT=300/25.4;         // 300 dpi
const DPMM_CSS=96/25.4;            // 1 CSS pixel per mm at 100% zoom

/* Random-map settings: percentages 0..100 plus two choices. Saved with the plate; mapgen.js reads them. */
const GEN_DEFAULTS={ sea:30, mountains:50, forest:50, lakes:40, rivers:50, desert:20, poi:50, roads:50,
                     climate:"Standard", coast:"Standard" };
const S = {
  cols:20, rows:14, orient:"pointy",
  title:"", scale:"",
  hexOpacity:72, coord:true, notes:true, mono:false, custom:[], customFeats:[], paths:[],
  gen:Object.assign({},GEN_DEFAULTS),
  terr:null, feat:null, labels:{}, memo:{}
};
let tool="paint", brush=0, curT="plain", curF="town";
let sel=null, hover=null, ppmView=DPMM_CSS, autoFit=true, printing=false;

/* Reset the plate to an empty grid of the current size. */
function blank(){
  S.terr=new Uint8Array(S.cols*S.rows);
  S.feat=new Uint8Array(S.cols*S.rows);
  S.labels={}; S.memo={}; S.paths=[]; sel=null;
}
blank();
