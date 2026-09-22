/* --------------------------------------------------------------------------
   symbols.js

   The tile symbol library. Each entry draws a small motif inside a hex — trees,
   waves, peaks — plus the loader and tint cache for user-uploaded SVG symbols.

   Uses:
     render.js             draw
   -------------------------------------------------------------------------- */
"use strict";

/* ══════════════ symbols ══════════════
   Flat line art, one stroke weight, no shading and nothing random: every tile
   of a given type carries the same symbols in the same places. Symbols are
   drawn in page space, so they stay upright whichever way the hexes sit.
   All sizes are millimetres; layout offsets are fractions of the hex radius. */

/* When coordinates are shown the symbols are squeezed upward so the bottom of
   the hex stays clear for the number. Neutral (1, 0) otherwise. */
let SYM_SQUASH=1, SYM_SHIFT=0;
/* Turn unit offsets into page coordinates around (x,y), applying the coordinate squash. */
function spots(x,y,s,pts){
  return pts.map(([dx,dy])=>[x+dx*s, y+(dy*SYM_SQUASH+SYM_SHIFT)*s]);
}
/* Set stroke colour plus a hairline width proportional to the hex size. */
function pen(c,col,s){ c.strokeStyle=col; c.lineWidth=s*.055; c.lineCap="round"; c.lineJoin="round"; }

/* broadleaf tree: short trunk under a lobed canopy */
function symTree(c,x,y,k){
  c.beginPath(); c.moveTo(x,y+k*.95); c.lineTo(x,y+k*.25); c.stroke();
  c.beginPath();
  c.moveTo(x-k*.9, y+k*.3);
  c.quadraticCurveTo(x-k*1.05, y-k*.5, x-k*.32, y-k*.55);
  c.quadraticCurveTo(x-k*.1,  y-k*1.1, x+k*.36, y-k*.68);
  c.quadraticCurveTo(x+k*1.05,y-k*.55, x+k*.9,  y+k*.3);
  c.quadraticCurveTo(x,       y+k*.62, x-k*.9,  y+k*.3);
  c.stroke();
}
/* palm: bare stem with a spray of fronds */
function symPalm(c,x,y,k){
  c.beginPath(); c.moveTo(x-k*.08,y+k); c.quadraticCurveTo(x+k*.08,y+k*.3,x,y-k*.15); c.stroke();
  for(let i=-2;i<=2;i++){
    const a=-Math.PI/2 + i*.6;
    c.beginPath(); c.moveTo(x,y-k*.15);
    c.quadraticCurveTo(x+Math.cos(a)*k*.75, y+Math.sin(a)*k*.85,
                       x+Math.cos(a)*k*1.05, y+Math.sin(a)*k*.5);
    c.stroke();
  }
}
/* palm tree: tapered trunk under filled leaf blades — the fronds carry real
   width, which is what separates a palm from a spider at map scale */
function symPalmTree(c,x,y,k){
  c.fillStyle=c.strokeStyle;
  // trunk, slightly wider at the foot
  c.beginPath();
  c.moveTo(x-k*.1,  y+k);
  c.lineTo(x+k*.1,  y+k);
  c.lineTo(x+k*.05, y-k*.34);
  c.lineTo(x-k*.05, y-k*.34);
  c.closePath(); c.fill();
  const cx=x, cy=y-k*.42;
  // each frond is a closed blade: out along a bowed upper edge to the tip,
  // back along a flatter lower edge — a filled, tapered leaf
  function blade(ang,len,w){
    const dx=Math.sin(ang), dy=-Math.cos(ang);
    const px=dy, py=-dx;                                  // perpendicular, up-ish
    const droop=k*.5*Math.abs(dx);
    const tx=cx+dx*k*len, ty=cy+dy*k*len*.8+droop;        // drooping tip
    const ux=cx+dx*k*len*.48+px*k*w,   uy=cy+dy*k*len*.48+py*k*w;
    const lx=cx+dx*k*len*.5 -px*k*w*.25, ly=cy+dy*k*len*.5 -py*k*w*.25;
    c.beginPath();
    c.moveTo(cx,cy);
    c.quadraticCurveTo(ux,uy,tx,ty);
    c.quadraticCurveTo(lx,ly,cx,cy);
    c.closePath(); c.fill();
  }
  blade(-1.35, 1.0, .3);
  blade(-0.72, 1.0, .3);
  blade(-0.08, 0.85,.26);
  blade( 0.55, 1.0, .3);
  blade( 1.3,  1.0, .3);
}
/* upward arrow */
function symArrow(c,x,y,k){
  c.beginPath(); c.moveTo(x,y+k*.8); c.lineTo(x,y-k*.6); c.stroke();
  c.beginPath(); c.moveTo(x,y-k*.6); c.lineTo(x-k*.38,y-k*.1); c.stroke();
  c.beginPath(); c.moveTo(x,y-k*.6); c.lineTo(x+k*.38,y-k*.1); c.stroke();
}
/* mountain: one solid triangle */
function symPeak(c,x,y,k,fill){
  c.fillStyle=fill;
  c.beginPath(); c.moveTo(x,y-k); c.lineTo(x+k*.86,y+k*.66); c.lineTo(x-k*.86,y+k*.66);
  c.closePath(); c.fill();
}
/* hill: a single rounded rise */
function symHill(c,x,y,k){
  c.beginPath(); c.moveTo(x-k,y+k*.42);
  c.quadraticCurveTo(x, y-k*.95, x+k, y+k*.42); c.stroke();
}
/* grass: a short spray of blades */
function symGrass(c,x,y,k){
  for(let i=-1;i<=1;i++){
    const bx=x+i*k*.36;
    c.beginPath(); c.moveTo(bx, y+k*.48);
    c.quadraticCurveTo(bx+k*.07, y, bx+k*.22, y-k*.52); c.stroke();
  }
}
/* reeds standing in water: blades over two water lines */
function symReeds(c,x,y,k){
  for(let i=-1;i<=1;i++){
    c.beginPath(); c.moveTo(x+i*k*.4, y+k*.5);
    c.quadraticCurveTo(x+i*k*.48, y-k*.2, x+i*k*.72, y-k*.8); c.stroke();
  }
  c.beginPath(); c.moveTo(x-k*.85,y+k*.62); c.lineTo(x+k*.85,y+k*.62);
  c.moveTo(x-k*.45,y+k*.9); c.lineTo(x+k*.45,y+k*.9); c.stroke();
}
/* sand: stipple, deliberately nothing like the hill curve */
function symSand(c,x,y,k,col){
  c.fillStyle=col;
  c.beginPath(); c.arc(x,y,k,0,6.283); c.fill();
}
/* open water: a short wave dash */
function symWave(c,x,y,k){
  c.beginPath(); c.moveTo(x-k,y);
  c.quadraticCurveTo(x-k*.34,y-k*.34,x,y);
  c.quadraticCurveTo(x+k*.34,y+k*.34,x+k,y); c.stroke();
}

/* ══════════════ symbol library ══════════════
   Every tile — built in or user made — picks one of these. Keeping them in a
   single registry is what lets a custom tile reuse the same drawing code. */
const SYMBOL_LIB = {
  none:   { name:"None",   draw(){} },
  grass:  { name:"Grass",  draw(c,x,y,s,m){ pen(c,m,s);
    spots(x,y,s,[[-.34,-.02],[.02,-.3],[.32,.16]]).forEach(p=>symGrass(c,p[0],p[1],s*.24)); } },
  trees:  { name:"Trees",  draw(c,x,y,s,m){ pen(c,m,s);
    spots(x,y,s,[[0,-.3],[-.36,.12],[.36,.14]]).forEach(p=>symTree(c,p[0],p[1],s*.24)); } },
  trees2: { name:"2 Trees",draw(c,x,y,s,m){ pen(c,m,s);
    spots(x,y,s,[[-.3,-.22],[.28,.06]]).forEach(p=>symTree(c,p[0],p[1],s*.28)); } },
  trees3: { name:"3 Trees",draw(c,x,y,s,m){ pen(c,m,s);
    spots(x,y,s,[[0,-.3],[-.36,.12],[.36,.14]]).forEach(p=>symTree(c,p[0],p[1],s*.24)); } },
  palm:   { name:"Palm",   draw(c,x,y,s,m){ pen(c,m,s);
    spots(x,y,s,[[0,-.08]]).forEach(p=>symPalmTree(c,p[0],p[1],s*.34)); } },
  palms3: { name:"Palms",  draw(c,x,y,s,m){ pen(c,m,s);
    spots(x,y,s,[[0,-.3],[-.36,.18],[.36,.16]]).forEach(p=>symPalmTree(c,p[0],p[1],s*.3)); } },
  arrows: { name:"Arrows", draw(c,x,y,s,m){ pen(c,m,s);
    spots(x,y,s,[[0,-.28],[-.34,.22],[.34,.2]]).forEach(p=>symArrow(c,p[0],p[1],s*.4)); } },
  peaks:  { name:"Peaks",  draw(c,x,y,s,m){
    spots(x,y,s,[[0,-.02]]).forEach(p=>symPeak(c,p[0],p[1],s*.41,m)); } },
  hills:  { name:"Hills",  draw(c,x,y,s,m){ pen(c,m,s);
    spots(x,y,s,[[-.26,-.14],[.24,.16]]).forEach(p=>symHill(c,p[0],p[1],s*.32)); } },
  reeds:  { name:"Reeds",  draw(c,x,y,s,m){ pen(c,m,s);
    spots(x,y,s,[[-.3,-.14],[.28,.16]]).forEach(p=>symReeds(c,p[0],p[1],s*.26)); } },
  waves:  { name:"Waves",  draw(c,x,y,s,m){ pen(c,m,s);
    spots(x,y,s,[[-.26,-.28],[.22,-.04],[-.08,.24]]).forEach(p=>symWave(c,p[0],p[1],s*.26)); } },
  waves2: { name:"2 Waves",draw(c,x,y,s,m){ pen(c,m,s);
    spots(x,y,s,[[-.16,-.16],[.16,.16]]).forEach(p=>symWave(c,p[0],p[1],s*.3)); } },
  sand:   { name:"Sand",   draw(c,x,y,s,m){ pen(c,m,s);
    c.lineWidth=s*.058; c.lineCap="butt";
    const yy=spots(x,y,s,[[0,0]])[0][1];
    // long dash + short dash, same weight as the hill curves
    c.beginPath(); c.moveTo(x-s*.54,yy); c.lineTo(x+s*.12,yy); c.stroke();
    c.beginPath(); c.moveTo(x+s*.28,yy); c.lineTo(x+s*.48,yy); c.stroke(); } },
  dots:   { name:"Stipple",draw(c,x,y,s,m){ c.fillStyle=m;
    spots(x,y,s,[[-.3,-.2],[.06,-.32],[.3,-.08],[-.16,.08],[.24,.24],[-.34,.26]])
      .forEach(p=>{ c.beginPath(); c.arc(p[0],p[1],s*.07,0,6.283); c.fill(); }); } },
  crosses:{ name:"Crosses",draw(c,x,y,s,m){ pen(c,m,s); c.lineWidth=s*.06;
    spots(x,y,s,[[-.28,-.16],[.24,-.2],[0,.2]]).forEach(p=>{
      const k=s*.13;
      c.beginPath(); c.moveTo(p[0]-k,p[1]); c.lineTo(p[0]+k,p[1]);
      c.moveTo(p[0],p[1]-k); c.lineTo(p[0],p[1]+k); c.stroke(); }); } }
};

/* ══════════════ uploaded SVG symbols ══════════════
   A custom tile can carry its own SVG. Images decode asynchronously, so each
   one is cached and the plate repainted once it is ready. Loading the file as
   an <img> means any script inside it is inert. */
const SVG_CACHE={};
/* Browsers size an <img> from the SVG's own width/height. Files that carry
   only a viewBox render at a UA default, so give them explicit dimensions. */
function normaliseSvg(txt){
  if(!/xmlns=/i.test(txt)) txt=txt.replace(/<svg/i,'<svg xmlns="http://www.w3.org/2000/svg"');
  const hasW=/<svg[^>]*\swidth=/i.test(txt), hasH=/<svg[^>]*\sheight=/i.test(txt);
  if(!hasW || !hasH){
    const m=txt.match(/viewBox=["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
    const w=m?parseFloat(m[1]):256, h=m?parseFloat(m[2]):256;
    txt=txt.replace(/<svg/i,'<svg width="'+w+'" height="'+h+'"');
  }
  return txt;
}
/* base64 rather than percent-encoding: some renderers reject the latter.
   Encode via TextEncoder so non-ASCII inside the file survives btoa. */
function svgToUrl(txt){
  const bytes=new TextEncoder().encode(txt);
  let bin=""; for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
  return "data:image/svg+xml;base64,"+btoa(bin);
}
/* Decode an uploaded SVG into the cache under `id`, then call `done` once it is ready. */
function loadTileSvg(id, txt, done){
  if(typeof Image==="undefined" || !txt) return;
  const img=new Image();
  img.onload =()=>{ SVG_CACHE[id]={img,ready:true}; if(done) done(); };
  img.onerror=()=>{ SVG_CACHE[id]={ready:false}; };
  img.src=svgToUrl(normaliseSvg(txt));
  if(!SVG_CACHE[id]) SVG_CACHE[id]={ready:false};
}
/* Recolour the symbol to the tile's mark colour so it always reads, cached
   per colour so the compositing only happens when something changes. */
function svgTinted(e, tint){
  if(e.tintCv && e.tintCol===tint) return e.tintCv;
  const px=256;
  const off=document.createElement("canvas"); off.width=off.height=px;
  const oc=off.getContext("2d");
  oc.drawImage(e.img,0,0,px,px);
  oc.globalCompositeOperation="source-in";
  oc.fillStyle=tint; oc.fillRect(0,0,px,px);
  e.tintCv=off; e.tintCol=tint;
  return off;
}
/* Draw a cached SVG centred on (x,y), tinted unless the tile keeps its own colours. */
function drawSvgSymbol(c,x,y,s,id,tint,keepColour){
  const e=SVG_CACHE[id];
  if(!e||!e.ready) return;
  const box=s*1.2*SYM_SQUASH, yy=y+s*SYM_SHIFT;
  const src=keepColour ? e.img : svgTinted(e,tint);
  c.drawImage(src, x-box/2, yy-box/2, box, box);
}
