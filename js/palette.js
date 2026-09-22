/* --------------------------------------------------------------------------
   palette.js

   Colour helpers. Parsing, shading, luminance and contrast, plus the two paper
   palettes: one for the screen, one for print.

   Uses: nothing — this file is a leaf and can be read on its own.
   -------------------------------------------------------------------------- */
"use strict";

const PAPER_SCREEN="#EDE5D5", PAPERLINE_SCREEN="#B4A78E";
const PAPER_PRINT="#FFFFFF",  PAPERLINE_PRINT="#BBBBBB";
let PAPER=PAPER_SCREEN, PAPERLINE=PAPERLINE_SCREEN;
const INK="#22323C", META="#7A6E58";
const LIGHT_TEXT="#F6F2E9", DARK_TEXT="#1A2530";

/* Parse a #rrggbb string into an [r,g,b] array. */
function hxc(c){
  if(c[0]!=="#"){ const n=c.match(/-?\d+(\.\d+)?/g)||[0,0,0]; return [+n[0],+n[1],+n[2]]; }
  c=c.slice(1);
  if(c.length===3) c=c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  return [parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)];
}
/* Format an [r,g,b] array back into a CSS rgb() string. */
function rgbs(a){ return "rgb("+(a[0]|0)+","+(a[1]|0)+","+(a[2]|0)+")"; }
/* Lighten (amt > 0) or darken (amt < 0) a hex colour. amt runs -1..1. */
function shade(col,amt){ const c=hxc(col), t=amt<0?0:255, p=Math.abs(amt);
  return rgbs([c[0]+(t-c[0])*p, c[1]+(t-c[1])*p, c[2]+(t-c[2])*p]); }

/* WCAG relative luminance, used to decide light-on-dark vs dark-on-light */
function lum(col){
  const c=hxc(col), f=v=>{ v/=255; return v<=.03928 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); };
  return .2126*f(c[0]) + .7152*f(c[1]) + .0722*f(c[2]);
}
/* Pick dark or light lettering for a background of the given luminance. */
function contrastInk(bgLum){
  const L=lum(LIGHT_TEXT), D=lum(DARK_TEXT);
  const cl=(L+.05)/(bgLum+.05), cd=(bgLum+.05)/(D+.05);
  return cd>=cl ? DARK_TEXT : LIGHT_TEXT;
}
