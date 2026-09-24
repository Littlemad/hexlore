/* --------------------------------------------------------------------------
   paths.js

   The kinds of line a plate can carry: roads, trails, rivers and ship routes.
   A path in S.paths is {type, hexes} where `type` is one of the ids below.
   Everything that cares about a path's kind — the rail palette, the hint
   line, erasing, the preview colour and the printed stroke — reads this table,
   so adding a new kind of line is one more entry here plus a stroke style in
   render.js.

     water   "avoid" — the line is clipped out of sea and lake hexes
             "only"  — the line is clipped to sea and lake hexes
             "any"   — the line is only clipped to the grid
     colour  screen preview colour while dragging

   Uses:
     palette.js            INK
   -------------------------------------------------------------------------- */
"use strict";

const PATH_TYPES=[
  {id:"road",  name:"Road",       water:"avoid", colour:INK,       key:"r"},
  {id:"trail", name:"Trail",      water:"avoid", colour:INK,       key:"t"},
  {id:"river", name:"River",      water:"avoid", colour:"#3D9BC7", key:"v"},
  {id:"ship",  name:"Ship route", water:"only",  colour:INK,       key:"s"}
];
const P_BY_ID={}; PATH_TYPES.forEach(p=>P_BY_ID[p.id]=p);

/* True when the path node `h` is the grid hex (col,r). Exit nodes never match. */
function pathHits(h,col,r){ return !h.exit && h[0]===col && h[1]===r; }
