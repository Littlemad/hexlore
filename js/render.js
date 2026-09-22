/* --------------------------------------------------------------------------
   render.js

   Everything that puts pixels on the canvas. paint() produces the printable plate;
   draw() composites that buffer with the screen-only cursor and previews.

   Uses:
     features.js           FEATURES, GLYPH, GLYPH_BG
     geometry.js           center, disc, edgeNeighbour, gridCoord, hexInto, hexPath, idx,
                           inside, layout
     palette.js            DARK_TEXT, INK, META, PAPER, PAPERLINE
     pointer.js            activePath, drawing, pathEraseHover
     rail.js               showFit
     state.js              DPMM_PRINT, HEAD, M, S, brush, hover, ppmView, printing, sel,
                           tool
     symbols.js            SYM_SHIFT, SYM_SQUASH
     terrains.js           PAPER_INK, TERRAINS
     lore.js               syncLore (loads later; refresh() guards the call with typeof)
   -------------------------------------------------------------------------- */
"use strict";

const cv=document.getElementById("plate"), ctx=cv.getContext("2d");

/* Draw the whole plate — paper, hexes, symbols, paths, masthead — into a context at `ppm` pixels per mm. The only function that touches the printed output. */
function paint(c,ppm,L){
  const W=L.pw*ppm, H=L.ph*ppm;
  c.setTransform(1,0,0,1,0,0);
  c.fillStyle=PAPER; c.fillRect(0,0,W,H);
  c.save(); c.scale(ppm,ppm);

  // plate frame
  c.strokeStyle=PAPERLINE;
  c.lineWidth=.35; c.strokeRect(5,5,L.pw-10,L.ph-10);
  c.lineWidth=.12; c.strokeRect(6.8,6.8,L.pw-13.6,L.ph-13.6);

  // masthead: title, hex count beside it, compass needle at the right
  const titleTxt=S.title||"Untitled plate";
  c.fillStyle=INK; c.textBaseline="alphabetic"; c.textAlign="left";
  c.font='600 7.2px "Bodoni Moda", Didot, serif';
  c.fillText(titleTxt, M, M+8.6);
  const tw=c.measureText(titleTxt).width;
  c.fillStyle=META; c.font='500 3px "IBM Plex Mono", monospace';
  c.fillText(S.cols+"×"+S.rows+" hexes", M+tw+5, M+8.6);

  // compass needle, right-aligned in the masthead band
  (function(){
    const r=5.4, cx=L.pw-M-r*1.1, cy=M+HEAD/2;
    c.fillStyle=INK; c.textAlign="center"; c.textBaseline="alphabetic";
    c.font='700 '+(r*.68)+'px "Archivo", sans-serif';
    c.fillText("N", cx, cy-r*1.2);
    const w=r*.62, base=cy+r*.72, notch=cy+r*.16;
    c.fillStyle=INK;                              // east half, solid
    c.beginPath(); c.moveTo(cx,cy-r); c.lineTo(cx+w,base); c.lineTo(cx,notch);
    c.closePath(); c.fill();
    c.fillStyle=PAPER;                            // west half, open
    c.beginPath(); c.moveTo(cx,cy-r); c.lineTo(cx-w,base); c.lineTo(cx,notch);
    c.closePath(); c.fill();
    c.strokeStyle=INK; c.lineWidth=r*.055; c.lineJoin="round";
    c.beginPath(); c.moveTo(cx,cy-r); c.lineTo(cx-w,base); c.lineTo(cx,notch);
    c.closePath(); c.stroke();
  })();

  c.strokeStyle=PAPERLINE; c.lineWidth=.18;
  c.beginPath(); c.moveTo(M,M+16.6); c.lineTo(L.pw-M,M+16.6); c.stroke();

  const s=L.s;
  SYM_SQUASH = S.coord ? .85 : 1;
  SYM_SHIFT  = S.coord ? -.08 : 0;
  // Layer 1: tile bodies + tile graphics. These stay untouched by path
  // masking, so hills/forests/etc. look exactly as they did before.
  for(let r=0;r<S.rows;r++) for(let col=0;col<S.cols;col++){
    const i=idx(col,r), t=S.terr[i]; if(!t) continue;
    const [cx,cy]=center(col,r,L), def=TERRAINS[t-1];
    c.save(); hexPath(c,cx,cy,s+s*.02); c.clip();
    c.fillStyle=S.mono?PAPER:def.base; c.fill();
    // When a POI icon sits on this tile, fade only the terrain symbols so
    // the icon reads as the dominant element; the base fill colour is untouched.
    if(S.feat[i]) c.globalAlpha=.35;
    def.draw(c,cx,cy,s,def);
    if(S.feat[i]) c.globalAlpha=1;
    c.restore();
  }
  // outlines — always drawn, opacity controlled by S.hexOpacity (0–100)
  {
    // Each shared edge belongs to two hexes. Stroking every hex's whole
    // outline paints interior edges twice and boundary edges once, which
    // makes the outer border visibly paler. Walk unique edges instead and
    // stroke them all in one pass, so every border has identical weight.
    const alpha=(S.hexOpacity!==undefined?S.hexOpacity:72)/100;
    c.strokeStyle="rgba(46,36,24,"+alpha+")"; c.lineWidth=s*.026;
    c.lineJoin="round"; c.lineCap="butt";
    const off=S.orient==="pointy" ? -Math.PI/6 : 0;
    c.beginPath();
    for(let r=0;r<S.rows;r++) for(let col=0;col<S.cols;col++){
      const [cx,cy]=center(col,r,L), me=idx(col,r);
      for(let k=0;k<6;k++){
        const nb=edgeNeighbour(col,r,k);
        // the lower-indexed hex of a pair owns the shared edge
        if(inside(nb[0],nb[1]) && idx(nb[0],nb[1])<me) continue;
        const a1=off+k*Math.PI/3, a2=off+(k+1)*Math.PI/3;
        c.moveTo(cx+s*Math.cos(a1), cy+s*Math.sin(a1));
        c.lineTo(cx+s*Math.cos(a2), cy+s*Math.sin(a2));
      }
    }
    c.stroke();
  }
  // Layer 2: paths live on their own transparent canvas.
  // A feature can then erase only the path pixels beneath itself without
  // repainting or disturbing the terrain graphics underneath.
  const pathCv=document.createElement("canvas");
  pathCv.width=W; pathCv.height=H;
  const pc=pathCv.getContext("2d");
  pc.setTransform(1,0,0,1,0,0);
  pc.clearRect(0,0,W,H);
  pc.save(); pc.scale(ppm,ppm);

  // ── Paths: roads and rivers — Catmull-Rom spline for soft turns ─────────
  /* Draw a smooth curve through all hex centres using Catmull-Rom splines
     converted to cubic Bézier segments. */
  function strokeSpline(c2,pts){
    if(pts.length<2) return;
    if(pts.length===2){ c2.moveTo(pts[0][0],pts[0][1]); c2.lineTo(pts[1][0],pts[1][1]); return; }
    c2.moveTo(pts[0][0],pts[0][1]);
    for(let i=0;i<pts.length-1;i++){
      const p0=pts[Math.max(0,i-1)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(pts.length-1,i+2)];
      const dx12=p2[0]-p1[0], dy12=p2[1]-p1[1];
      const chord=Math.sqrt(dx12*dx12+dy12*dy12)||1;
      const t=0.18;
      let cp1x=p1[0]+(p2[0]-p0[0])*t, cp1y=p1[1]+(p2[1]-p0[1])*t;
      let cp2x=p2[0]-(p3[0]-p1[0])*t, cp2y=p2[1]-(p3[1]-p1[1])*t;
      const maxPull=chord*0.42;
      const d1=Math.sqrt((cp1x-p1[0])**2+(cp1y-p1[1])**2)||1;
      const d2=Math.sqrt((cp2x-p2[0])**2+(cp2y-p2[1])**2)||1;
      if(d1>maxPull){ cp1x=p1[0]+(cp1x-p1[0])/d1*maxPull; cp1y=p1[1]+(cp1y-p1[1])/d1*maxPull; }
      if(d2>maxPull){ cp2x=p2[0]+(cp2x-p2[0])/d2*maxPull; cp2y=p2[1]+(cp2y-p2[1])/d2*maxPull; }
      c2.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,p2[0],p2[1]);
    }
  }
  if(S.paths && S.paths.length){
    /* Paths sit above the tiles, but must not run across open water: clip to
       the whole sheet minus every sea/lake hex, so a river meeting the coast
       stops at the shoreline instead of drawing over it. */
    pc.save();
    // Clip to the union of all hex cells, then subtract sea/lake hexes.
    // This prevents any road, trail or river from drawing outside the grid boundary.
    pc.beginPath();
    for(let r=0;r<S.rows;r++) for(let col=0;col<S.cols;col++){
      hexInto(pc,center(col,r,L)[0],center(col,r,L)[1],s+s*.01);
    }
    for(let r=0;r<S.rows;r++) for(let col=0;col<S.cols;col++){
      const t=S.terr[idx(col,r)]; if(!t) continue;
      const id=TERRAINS[t-1].id;
      if(id!=="sea" && id!=="lake") continue;
      const [wx,wy]=center(col,r,L);
      hexInto(pc,wx,wy,s+s*.01);
    }
    pc.clip("evenodd");

    // Group rivers and draw them all in one compound stroke pass so their
    // thick outlines blend at junctions instead of double-painting.
    const rivers=S.paths.filter(p=>p.type==="river" && p.hexes.length>=2);
    const nonRivers=S.paths.filter(p=>p.type!=="river" && p.hexes.length>=2);

    if(rivers.length){
      if(!S.mono){
        pc.lineCap="round"; pc.lineJoin="round";
        pc.strokeStyle="#3D9BC7"; pc.lineWidth=s*.10;
        pc.beginPath();
        rivers.forEach(path=>{
          const pts=path.hexes.map(h=>h.exit?[h.ex,h.ey]:center(h[0],h[1],L));
          strokeSpline(pc,pts);
        });
        pc.stroke();
      } else {
        // Mono: twin parallel lines + cross-hatching for each river
        rivers.forEach(path=>{
          const pts=path.hexes.map(h=>h.exit?[h.ex,h.ey]:center(h[0],h[1],L));
          pc.lineCap="round"; pc.lineJoin="round"; pc.strokeStyle=INK;
          const off=s*.1;
          for(const side of [-1,1]){
            pc.lineWidth=s*.042; pc.beginPath();
            pts.forEach(([px,py],i)=>{
              const n=i<pts.length-1?i+1:i-1;
              const dx=pts[n][0]-px, dy=pts[n][1]-py, len=Math.sqrt(dx*dx+dy*dy)||1;
              const ox=-dy/len*off*side, oy=dx/len*off*side;
              i?pc.lineTo(px+ox,py+oy):pc.moveTo(px+ox,py+oy);
            }); pc.stroke();
          }
          pc.lineWidth=s*.028; pc.lineCap="butt";
          for(let n=0;n<pts.length-1;n++){
            const [x1,y1]=pts[n],[x2,y2]=pts[n+1];
            const dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy)||1;
            const segs=Math.max(2,Math.round(len/s));
            for(let k=1;k<segs;k++){
              const t2=k/segs,mx=x1+dx*t2,my=y1+dy*t2;
              const nx=-dy/len*off*.85,ny=dx/len*off*.85;
              pc.beginPath(); pc.moveTo(mx-nx,my-ny); pc.lineTo(mx+nx,my+ny); pc.stroke();
            }
          }
        });
      }
    }

    nonRivers.forEach(path=>{
      const pts=path.hexes.map(h=>h.exit?[h.ex,h.ey]:center(h[0],h[1],L));
      pc.lineCap="round"; pc.lineJoin="round"; pc.strokeStyle=INK;
      if(path.type==="road"){
        // Main road: solid unbroken line
        pc.lineWidth=s*.055;
        pc.beginPath(); strokeSpline(pc,pts); pc.stroke();
      } else if(path.type==="trail"){
        // Trail: hand-drawn irregular dashes
        pc.lineCap="round"; pc.lineJoin="round";
        const STEPS=600;
        const seed=pts.length ? (pts[0][0]*73856093^pts[0][1]*19349663)>>>0 : 1;
        let rng=seed||1;
        function rand(){ rng=(rng*1664525+1013904223)>>>0; return rng/4294967296; }
        const spline=[];
        for(let i=0;i<=STEPS;i++){
          const t=i/STEPS, n=Math.min(Math.floor(t*(pts.length-1)),pts.length-2);
          const lt=t*(pts.length-1)-n;
          const p0=pts[Math.max(0,n-1)],p1=pts[n],p2=pts[n+1],p3=pts[Math.min(pts.length-1,n+2)];
          const tt=lt, tt2=tt*tt, tt3=tt2*tt;
          const q0=-.5*tt3+tt2-.5*tt, q1=1.5*tt3-2.5*tt2+1,
                q2=-1.5*tt3+2*tt2+.5*tt, q3=.5*tt3-.5*tt2;
          spline.push([q0*p0[0]+q1*p1[0]+q2*p2[0]+q3*p3[0],
                       q0*p0[1]+q1*p1[1]+q2*p2[1]+q3*p3[1]]);
        }
        let dist=0, drawing=false, segLeft=0;
        const minDash=s*.06, maxDash=s*.16, minGap=s*.07, maxGap=s*.18;
        segLeft = minGap+rand()*(maxGap-minGap); drawing=false;
        pc.beginPath();
        for(let i=1;i<spline.length;i++){
          const dx=spline[i][0]-spline[i-1][0], dy=spline[i][1]-spline[i-1][1];
          let step=Math.sqrt(dx*dx+dy*dy); if(step===0) continue;
          let walked=0;
          while(walked<step){
            const remaining=step-walked, canWalk=Math.min(remaining,segLeft);
            const frac=(walked+canWalk)/step;
            const px=spline[i-1][0]+dx*frac, py=spline[i-1][1]+dy*frac;
            if(drawing) pc.lineTo(px,py); else pc.moveTo(px,py);
            walked+=canWalk; segLeft-=canWalk;
            if(segLeft<1e-9){
              if(drawing){ drawing=false; segLeft=minGap+rand()*(maxGap-minGap); }
              else { drawing=true; segLeft=minDash+rand()*(maxDash-minDash); }
            }
          }
        }
        pc.lineWidth=s*.038; pc.stroke();
      } else {
        // Legacy fallback
        pc.lineWidth=s*.055;
        pc.beginPath(); strokeSpline(pc,pts); pc.stroke();
      }
    });
    pc.restore();   // release the water mask
  }

  // note marks, top of the hex
  if(S.notes){
    for(const k in S.memo){
      if(!S.memo[k]) continue;
      const i=+k, col=i%S.cols, r=(i-col)/S.cols; if(!inside(col,r)) continue;
      const [cx,cy]=center(col,r,L), t=S.terr[i];
      const col2 = S.mono ? INK : (t ? TERRAINS[t-1].ink : PAPER_INK);
      const px=cx+s*.44, py=cy-s*(S.orient==="pointy"?.5:.42);
      c.strokeStyle=col2; c.lineWidth=s*.05;
      c.beginPath(); c.arc(px,py,s*.115,0,6.283); c.stroke();
      c.fillStyle=col2; c.beginPath(); c.arc(px,py,s*.045,0,6.283); c.fill();
    }
  }
  // Remove only path pixels inside each feature buffer. The terrain layer
  // underneath is never touched, so hills/forests remain fully intact.
  for(let r=0;r<S.rows;r++) for(let col=0;col<S.cols;col++){
    const i=idx(col,r), f=S.feat[i]; if(!f) continue;
    const [cx,cy]=center(col,r,L), u=s*.4;
    pc.save();
    pc.globalCompositeOperation="destination-out";
    pc.fillStyle="#fff";
    pc.beginPath(); pc.arc(cx,cy,u*.95,0,6.283); pc.fill();
    pc.restore();
  }
  pc.restore();

  // Composite paths above terrain graphics, with feature buffers already
  // applied to the path layer only.
  c.save();
  c.setTransform(1,0,0,1,0,0);
  c.drawImage(pathCv,0,0);
  c.restore();

  // place names no longer drawn on the map
  // doubled coordinates along the bottom of each hex
  if(S.coord){
    c.textAlign="center"; c.textBaseline="middle";
    c.font='600 '+(s*.32)+'px "IBM Plex Mono", monospace';
    for(let r=0;r<S.rows;r++) for(let col=0;col<S.cols;col++){
      const i=idx(col,r), t=S.terr[i];
      const [cx,cy]=center(col,r,L);
      const ty = cy + s*(S.orient==="pointy"?.53:.56);
      // White knockout pill behind the coord so any road or river crossing
      // it doesn't bleed through the digits — sized to the measured text.
      const coord=gridCoord(col,r);
      const tw2=c.measureText(coord).width;
      const ph=s*.16, pw2=tw2*.5+s*.03;
      c.fillStyle=S.mono?PAPER:(t?TERRAINS[t-1].base:PAPER);
      c.beginPath();
      c.ellipse(cx,ty,pw2,ph,0,0,Math.PI*2);
      c.fill();
      c.fillStyle = S.mono ? DARK_TEXT : (t ? TERRAINS[t-1].ink : PAPER_INK);
      c.fillText(coord, cx, ty);
    }
  }
  SYM_SQUASH=1; SYM_SHIFT=0;

  // Layer 4: features. Paths have already been erased underneath the icon,
  // while the terrain graphics remain at their original full opacity.
  for(let r=0;r<S.rows;r++) for(let col=0;col<S.cols;col++){
    const i=idx(col,r), f=S.feat[i]; if(!f) continue;
    const [cx,cy]=center(col,r,L), u=s*.4, t=S.terr[i];
    const bgCol = S.mono ? PAPER : (t ? TERRAINS[t-1].base : PAPER);
    GLYPH    = S.mono ? INK : (t ? TERRAINS[t-1].ink : PAPER_INK);
    GLYPH_BG = bgCol;
    c.save(); FEATURES[f-1].draw(c,cx,cy,u); c.restore();
  }
  GLYPH=INK; GLYPH_BG=PAPER;
  c.restore();
}

/* the plate is painted into a buffer; cursor motion only recomposites it */
let baseCv=null, baseCtx=null, dirty=true;
/* Mark the plate buffer stale and redraw. Use this after any change to S. */
function refresh(){ dirty=true; draw(); if(typeof syncLore==="function") syncLore(); }

/* Composite the cached plate buffer, then overlay screen-only cursor, selection and path preview. */
function draw(){
  const L=layout();
  let ppm = printing ? DPMM_PRINT : ppmView*Math.min(2,window.devicePixelRatio||1);
  while(L.pw*ppm*L.ph*ppm>14e6 && ppm>1) ppm-=.4;
  const W=Math.round(L.pw*ppm), H=Math.round(L.ph*ppm);
  if(!baseCv){ baseCv=document.createElement("canvas"); baseCtx=baseCv.getContext("2d"); }
  if(cv.width!==W||cv.height!==H){ cv.width=W; cv.height=H; baseCv.width=W; baseCv.height=H; dirty=true; }
  // only the width is set, so the sheet always keeps its A4 proportions
  cv.style.width=(L.pw*ppmView)+"px";
  document.documentElement.style.setProperty("--pw",L.pw+"mm");
  document.documentElement.style.setProperty("--ph",L.ph+"mm");
  if(dirty){ paint(baseCtx,ppm,L); dirty=false; }
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.drawImage(baseCv,0,0);

  // cursor and selection live on screen only, never on the printed plate
  ctx.save(); ctx.scale(ppm,ppm);
  if(sel!==null){
    const col=sel%S.cols, r=(sel-col)/S.cols;
    if(inside(col,r)){
      const [x,y]=center(col,r,L);
      ctx.strokeStyle="rgba(216,172,62,.95)"; ctx.lineWidth=L.s*.075;
      hexPath(ctx,x,y,L.s*.96); ctx.stroke();
    }
  }
  // preview of the path being drawn right now
  if(activePath && activePath.hexes.length){
    const pts=activePath.hexes.map(h=>h.exit?[h.ex,h.ey]:center(h[0],h[1],L));
    // Only append hover if it is not already represented by an exit node
    const lastH=activePath.hexes[activePath.hexes.length-1];
    if(hover && !(lastH && lastH.exit)) pts.push(center(hover[0],hover[1],L));
    const col=activePath.type==="river" ? "#3D9BC7" : INK; // road and trail both preview in INK
    ctx.strokeStyle=col; ctx.lineWidth=L.s*.12; ctx.lineCap="round"; ctx.lineJoin="round";
    ctx.beginPath(); pts.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py)); ctx.stroke();
  }
  // erasepath highlight: tint paths that pass through the hovered hex
  if(tool==="erasepath" && pathEraseHover){
    const [hx,hy]=center(pathEraseHover[0],pathEraseHover[1],L);
    const doomed=(S.paths||[]).filter(p=>p.hexes.some(h=>!h.exit&&h[0]===pathEraseHover[0]&&h[1]===pathEraseHover[1]));
    doomed.forEach(path=>{
      const pts=path.hexes.map(h=>h.exit?[h.ex,h.ey]:center(h[0],h[1],L));
      ctx.save();
      ctx.strokeStyle="rgba(220,60,40,.9)"; ctx.lineWidth=L.s*.28;
      ctx.lineCap="round"; ctx.lineJoin="round";
      ctx.beginPath(); pts.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py)); ctx.stroke();
      ctx.restore();
    });
    // X marker on the hovered hex
    const r=L.s*.28;
    ctx.strokeStyle="rgba(220,60,40,.95)"; ctx.lineWidth=L.s*.09; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(hx-r,hy-r); ctx.lineTo(hx+r,hy+r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx+r,hy-r); ctx.lineTo(hx-r,hy+r); ctx.stroke();
  }
  if(hover && tool!=="fill"){
    const cells=(tool==="paint"||tool==="erase") ? disc(hover[0],hover[1],brush) : [hover];
    ctx.strokeStyle = tool==="erase" ? "rgba(190,70,50,.95)"
                    : tool==="inspect" ? "rgba(69,196,222,.95)" : "rgba(20,40,52,.9)";
    ctx.lineWidth=L.s*.055;
    cells.forEach(([c0,r0])=>{ const [x,y]=center(c0,r0,L); hexPath(ctx,x,y,L.s*.94); ctx.stroke(); });
  }
  ctx.restore();
  showFit(L);
}
