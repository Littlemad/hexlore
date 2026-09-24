/* --------------------------------------------------------------------------
   pointer.js

   All pointer input on the canvas. One set of handlers dispatches on the
   active layer: terrain and feature edits go through apply() in edits.js,
   while the path layer draws or erases whole roads, trails, rivers and ship
   routes here.

   Uses:
     edits.js              apply
     geometry.js           center, edgeNeighbour, idx, inside, layout, neighbours, pick
     history.js            buttons, past, push
     inspector.js          openInspector, syncInspector
     paths.js              pathHits
     rail.js               readout
     render.js             cv, draw, refresh
     state.js              S, curP, hover, layer, sel, tool
     storage.js            store
   -------------------------------------------------------------------------- */
"use strict";

let drawing=false, lastCell=null, erasing=false;
let activePath=null;      // {type,hexes:[]} being drawn right now
let pathEraseHover=null;  // hex under cursor while erasing paths

/* Convert a pointer event into [mmX, mmY, layout] on the sheet. */
function toSheet(ev){
  const rect=cv.getBoundingClientRect(), L=layout();
  return [ (ev.clientX-rect.left)/rect.width*L.pw,
           (ev.clientY-rect.top)/rect.height*L.ph, L ];
}
/* True while the pointer edits paths rather than hex contents. */
function onPaths(){ return layer==="path" && tool!=="inspect" && tool!=="fill"; }

cv.addEventListener("contextmenu",e=>e.preventDefault());

cv.addEventListener("pointerdown",e=>{
  const [mx,my,L]=toSheet(e), cell=pick(mx,my,L); if(!cell) return;
  erasing = e.button===2 || e.shiftKey;
  if(tool==="inspect" && !erasing){
    sel=idx(cell[0],cell[1]); openInspector(); draw(); return;
  }
  if(onPaths()){
    if(erasing||tool==="erase"){
      push();
      if(!erasePathsAt(cell[0],cell[1])) past.pop();
      buttons(); pathEraseHover=null; store(); refresh(); return;
    }
    cv.setPointerCapture(e.pointerId);
    startPath(curP,cell[0],cell[1]);
    hover=cell; draw(); return;
  }
  cv.setPointerCapture(e.pointerId);
  drawing=true; lastCell=cell.join(); push();
  if(!apply(cell[0],cell[1],erasing)) past.pop();
  buttons(); hover=cell;
  if(sel===idx(cell[0],cell[1])) syncInspector();
  refresh(); store();
});

cv.addEventListener("pointermove",e=>{
  const [mx,my,L]=toSheet(e), cell=pick(mx,my,L);
  const key=cell?cell.join():null;
  if(onPaths()){
    if(activePath){ movePath(cell,mx,my,L); return; }
    pathEraseHover = tool==="erase" ? (cell||null) : null;
  }
  if(drawing&&cell&&key!==lastCell){
    lastCell=key; apply(cell[0],cell[1],erasing); hover=cell;
    if(sel===idx(cell[0],cell[1])) syncInspector();
    refresh(); store(); return;
  }
  if(key!==(hover?hover.join():null) || pathEraseHover){ hover=cell; draw(); }
  readout(cell);
});

window.addEventListener("pointerup",()=>{
  drawing=false; lastCell=null;
  if(activePath){ commitPath(); refresh(); }
});
cv.addEventListener("pointerleave",()=>{ hover=null; pathEraseHover=null; draw(); readout(null); });

/* ══════════════ path drawing ══════════════
   Each path is a sequence of hex grid positions. Dragging through hexes
   extends the active path; dragging off the grid adds an exit node so the
   line runs to the sheet edge. */

/* Begin a new path of `type` at (col,row). */
function startPath(type,col,r){
  activePath={type,hexes:[[col,r]]};
}
/* Add the hex under the cursor to the path being drawn, if it is a new one. */
function extendPath(col,r){
  if(!activePath) return;
  const hexes=activePath.hexes;
  const last=hexes[hexes.length-1];
  if(last && !last.exit && last[0]===col && last[1]===r) return;  // same hex, skip
  if(last && last.exit) hexes.pop();  // remove exit node when back on grid
  // If the entered hex is the second-to-last, the user dragged back — trim the last hex
  if(hexes.length>=2){
    const prev=hexes[hexes.length-2];
    if(prev && !prev.exit && prev[0]===col && prev[1]===r){
      hexes.pop(); return;
    }
  }
  hexes.push([col,r]);
}
/* True when two path nodes are the same hex. Exit nodes never match. */
function hexEq(a,b){ if(!a||!b||a.exit||b.exit) return false; return a[0]===b[0]&&a[1]===b[1]; }
/* Finish the active path, merging it into an existing same-type path when the endpoints meet. */
function commitPath(){
  if(!activePath) return;
  if(activePath.hexes.length>=2){
    push();
    const type=activePath.type;
    const hexes=activePath.hexes.slice();
    const head=hexes[0], tail=hexes[hexes.length-1];
    // look for an existing same-type path that shares an endpoint
    let merged=false;
    for(let i=0;i<S.paths.length;i++){
      const p=S.paths[i];
      if(p.type!==type) continue;
      const ph=p.hexes[0], pt=p.hexes[p.hexes.length-1];
      if(hexEq(head,pt)){
        // new path extends an existing path's tail → append
        p.hexes=p.hexes.concat(hexes.slice(1));
        merged=true; break;
      } else if(hexEq(tail,ph)){
        // new path feeds into an existing path's head → prepend
        p.hexes=hexes.concat(p.hexes.slice(1));
        merged=true; break;
      } else if(hexEq(tail,pt)){
        // new path connects to tail reversed → reverse-append
        p.hexes=p.hexes.concat(hexes.slice(0,-1).reverse());
        merged=true; break;
      } else if(hexEq(head,ph)){
        // new path connects to head reversed → reverse-prepend
        p.hexes=hexes.slice(1).reverse().concat(p.hexes);
        merged=true; break;
      }
    }
    if(!merged) S.paths.push({type, hexes});
    store();
  }
  activePath=null;
}
/* The paths of the active kind that run through (col,r). */
function pathsAt(col,r){
  return S.paths.filter(p=>p.type===curP && p.hexes.some(h=>pathHits(h,col,r)));
}
/* Drop every path of the active kind that runs through (col,r). Returns true if any went. */
function erasePathsAt(col,r){
  const before=S.paths.length;
  S.paths=S.paths.filter(p=>!(p.type===curP && p.hexes.some(h=>pathHits(h,col,r))));
  return S.paths.length!==before;
}

/* ── Exit-point helpers ──────────────────────────────────────────────────────
   An exit node has the form {exit:true, col, row, ex, ey} where (ex,ey) is
   the mm coordinate of the outward edge midpoint of the border hex [col,row].
   It is appended as the last point of a path when the user drags off the grid,
   giving the visual impression that the road continues to an adjacent map. */
function exitPoint(borderCol, borderRow, mx, my, L){
  const [cx,cy]=center(borderCol,borderRow,L);
  // Find which of the 6 edge midpoints is closest to the drag position
  const s=L.s;
  const off=S.orient==="pointy" ? -Math.PI/6 : 0;
  let best=null, bd=Infinity;
  for(let k=0;k<6;k++){
    const a1=off+k*Math.PI/3, a2=off+(k+1)*Math.PI/3;
    const emx=(cx+s*Math.cos(a1)+cx+s*Math.cos(a2))/2;
    const emy=(cy+s*Math.sin(a1)+cy+s*Math.sin(a2))/2;
    // Only consider edges that face away from the grid interior
    const nb=edgeNeighbour(borderCol,borderRow,k);
    if(inside(nb[0],nb[1])) continue;   // shared with another hex → interior edge
    const d=(emx-mx)*(emx-mx)+(emy-my)*(emy-my);
    if(d<bd){ bd=d; best={ex:emx,ey:emy}; }
  }
  if(!best) return null;
  return {exit:true, col:borderCol, row:borderRow, ex:best.ex, ey:best.ey};
}

/* Pointer moved while a path is being drawn: extend it on the grid, or aim
   an exit node at the sheet edge when the pointer is off the grid. */
function movePath(cell,mx,my,L){
  if(!cell){
    // Off-grid: find nearest border hex and compute exit edge midpoint
    let best=null, bd=Infinity;
    for(let r=0;r<S.rows;r++) for(let col=0;col<S.cols;col++){
      // Only consider border hexes (at least one neighbour is outside the grid)
      const isBorder=neighbours(col,r).length<6 ||
        [0,1,2,3,4,5].some(k=>{ const nb=edgeNeighbour(col,r,k); return !inside(nb[0],nb[1]); });
      if(!isBorder) continue;
      const [cx,cy]=center(col,r,L);
      const d=(cx-mx)*(cx-mx)+(cy-my)*(cy-my);
      if(d<bd){ bd=d; best=[col,r]; }
    }
    if(best){
      hover=best;
      const last=activePath.hexes[activePath.hexes.length-1];
      if(last && !last.exit && last[0]===best[0] && last[1]===best[1]){
        // Only add an exit if the last hex in the active path is this border hex
        const ep=exitPoint(best[0],best[1],mx,my,L);
        if(ep) activePath.hexes.push(ep);
      } else if(last && last.exit){
        // Update the exit direction as the user moves
        activePath.hexes.pop();
        const ep=exitPoint(best[0],best[1],mx,my,L);
        if(ep) activePath.hexes.push(ep);
      }
    }
    refresh(); return;
  }
  // Back on the grid: remove any trailing exit node, then extend
  const last=activePath.hexes[activePath.hexes.length-1];
  if(last && last.exit) activePath.hexes.pop();
  hover=cell; extendPath(cell[0],cell[1]);
  refresh();
}
