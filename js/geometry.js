/* --------------------------------------------------------------------------
   geometry.js

   Hex and page maths, all in millimetres. Where a hex sits, which hex a point is
   over, how far apart two hexes are, which hexes a brush covers.

   Uses:
     state.js              A4_LONG, A4_SHORT, HEAD, M, S
   -------------------------------------------------------------------------- */
"use strict";

const SQ3=Math.sqrt(3);
/* A4 in millimetres, landscape. */
function pageSize(){ return {w:A4_LONG,h:A4_SHORT}; }
/* Grid width and height in hex radii, for the current orientation. */
function factors(){
  return S.orient==="pointy"
    ? { fw:SQ3*(S.cols+(S.rows>1?.5:0)), fh:1.5*(S.rows-1)+2 }
    : { fw:1.5*(S.cols-1)+2, fh:SQ3*(S.rows+(S.cols>1?.5:0)) };
}

/* Work out hex radius and grid origin so the whole grid fits the printable band. */
function layout(){
  const p=pageSize(), availW=p.w-M*2;
  const availH=p.h-M*2-HEAD;     // band between masthead and bottom margin
  const f=factors();
  const s=Math.min(availW/f.fw, availH/f.fh);
  const gw=s*f.fw, gh=s*f.fh;
  return { pw:p.w, ph:p.h, s, gw, gh, availW, availH,
           ox:M+(availW-gw)/2, oy:M+HEAD+(availH-gh)/2 };
}
/* Millimetre centre of hex (c,r) for a given layout. */
function center(c,r,L){
  const s=L.s;
  if(S.orient==="pointy"){
    const w=SQ3*s;
    return [L.ox + w*(c+(r&1?.5:0)) + w/2, L.oy + 1.5*s*r + s];
  }
  const h=SQ3*s;
  return [L.ox + 1.5*s*c + s, L.oy + h*(r+(c&1?.5:0)) + h/2];
}
/* Start a fresh path shaped like one hex, ready to fill or stroke. */
function hexPath(c,cx,cy,s){
  const off=S.orient==="pointy" ? -Math.PI/6 : 0;
  c.beginPath();
  for(let i=0;i<6;i++){
    const a=off+i*Math.PI/3, x=cx+s*Math.cos(a), y=cy+s*Math.sin(a);
    i?c.lineTo(x,y):c.moveTo(x,y);
  }
  c.closePath();
}
/* Same hex outline, appended to the current path so several hexes can be
   combined into one region (used to mask paths away from water tiles). */
function hexInto(c,cx,cy,s){
  const off=S.orient==="pointy" ? -Math.PI/6 : 0;
  for(let i=0;i<6;i++){
    const a=off+i*Math.PI/3, x=cx+s*Math.cos(a), y=cy+s*Math.sin(a);
    i?c.lineTo(x,y):c.moveTo(x,y);
  }
  c.closePath();
}
/* Flat array index of hex (c,r). */
function idx(c,r){ return r*S.cols+c; }
/* True when (c,r) falls inside the current grid. */
function inside(c,r){ return c>=0&&r>=0&&c<S.cols&&r<S.rows; }
/* Hex under a millimetre point, or null when the point misses every hex. */
function pick(mx,my,L){
  const s=L.s; let ra,ca;
  if(S.orient==="pointy"){
    const w=SQ3*s;
    ra=Math.round((my-L.oy-s)/(1.5*s));
    ca=Math.round((mx-L.ox-w/2-(ra&1?w/2:0))/w);
  } else {
    const h=SQ3*s;
    ca=Math.round((mx-L.ox-s)/(1.5*s));
    ra=Math.round((my-L.oy-h/2-(ca&1?h/2:0))/h);
  }
  let best=null,bd=Infinity;
  for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
    const c=ca+dc, r=ra+dr; if(!inside(c,r)) continue;
    const [x,y]=center(c,r,L), d=(x-mx)*(x-mx)+(y-my)*(y-my);
    if(d<bd){ bd=d; best=[c,r]; }
  }
  return best && bd<=(s*.98)*(s*.98) ? best : null;
}

/* Grid coordinates: 1-based, column left-to-right, row top-to-bottom.
   Returned as a padded 4-character string: first two digits = column (01..),
   last two digits = row (01..). Always positive, always top-left origin. */
function gridCoord(c,r){
  return String(c+1).padStart(2,"0") + String(r+1).padStart(2,"0");
}
/* Convert offset coordinates to cube coordinates, which make distance easy. */
function cubeOf(c,r){
  if(S.orient==="pointy"){ const x=c-((r-(r&1))/2); return [x,-x-r,r]; }
  const z=r-((c-(c&1))/2); return [c,-c-z,z];
}
/* Number of steps between two hexes. */
function hexDist(a,b){
  const A=cubeOf(a[0],a[1]), B=cubeOf(b[0],b[1]);
  return Math.max(Math.abs(A[0]-B[0]),Math.abs(A[1]-B[1]),Math.abs(A[2]-B[2]));
}
/* Every hex within `rad` steps of (c,r) — this is what the brush size paints. */
function disc(c,r,rad){
  if(rad===0) return inside(c,r)?[[c,r]]:[];
  const out=[];
  const lo=Math.max(0,r-rad*2), hi=Math.min(S.rows-1,r+rad*2);
  const lc=Math.max(0,c-rad*2), hc=Math.min(S.cols-1,c+rad*2);
  for(let rr=lo;rr<=hi;rr++) for(let cc=lc;cc<=hc;cc++)
    if(hexDist([c,r],[cc,rr])<=rad) out.push([cc,rr]);
  return out;
}
/* The hex across edge k, where edge k spans vertices k and k+1.
   Edge midpoints sit at k*60 degrees (pointy) or 30+k*60 (flat). */
function edgeNeighbour(c,r,k){
  let d;
  if(S.orient==="pointy"){
    const o=r&1;
    d=[[1,0],[o?1:0,1],[o?0:-1,1],[-1,0],[o?0:-1,-1],[o?1:0,-1]][k];
  } else {
    const o=c&1;
    d=[[1,o?1:0],[0,1],[-1,o?1:0],[-1,o?0:-1],[0,-1],[1,o?0:-1]][k];
  }
  return [c+d[0], r+d[1]];
}
/* The six hexes adjacent to (c,r), clipped to the grid. */
function neighbours(c,r){
  const d = S.orient==="pointy"
    ? ((r&1) ? [[1,0],[1,-1],[0,-1],[-1,0],[0,1],[1,1]]
             : [[1,0],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1]])
    : ((c&1) ? [[0,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]]
             : [[0,-1],[1,-1],[1,0],[0,1],[-1,0],[-1,-1]]);
  return d.map(([dc,dr])=>[c+dc,r+dr]).filter(p=>inside(p[0],p[1]));
}
