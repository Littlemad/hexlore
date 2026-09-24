/* --------------------------------------------------------------------------
   rail.js

   The left control rail. Tool buttons, terrain and feature swatches, grid size,
   display toggles — and the footer readouts, which are the same kind of UI glue.

   Uses:
     custom-features.js    deleteCustomFeat
     custom-tiles.js       deleteCustom
     features.js           FEATURES, GLYPH, GLYPH_BG
     geometry.js           SQ3, gridCoord, idx, pick
     history.js            push, redo, undo
     inspector.js          closeInspector, syncInspector
     palette.js            INK, PAPER
     render.js             draw, paint, refresh
     state.js              S, blank, brush, curF, curT, ppmView, sel, tool
     storage.js            store
     symbols.js            SYM_SHIFT, SYM_SQUASH
     terrains.js           TERRAINS
     zoom.js               doFit, setZoom
   -------------------------------------------------------------------------- */
"use strict";

/* Update the footer strip to describe the hex under the cursor. */
function readout(cell){
  const el=document.getElementById("readout");
  if(!cell){ el.innerHTML="<b>—</b>"; return; }
  const i=idx(cell[0],cell[1]), t=S.terr[i], f=S.feat[i], gc=gridCoord(cell[0],cell[1]);
  el.innerHTML="<b>"+gc+"</b>"
    +"  ·  "+(t?TERRAINS[t-1].name:"unsurveyed")
    +(f?"  ·  "+FEATURES[f-1].name:"")
    +(S.labels[i]?"  ·  “"+S.labels[i]+"”":"")
    +(S.memo[i]?"  ·  noted":"");
}
/* Report the physical hex size in millimetres in the footer. */
function showFit(L){
  document.getElementById("fitNote").textContent=
    "hex "+(L.s*2).toFixed(1)+"mm tall "+(L.s*SQ3).toFixed(1)+"mm wide";
}

/* Feature is not listed here: picking a feature swatch switches to it. */
const TOOLS=[
  {id:"paint",   name:"Tile Paint"},
  {id:"fill",    name:"Tile Fill"},
  {id:"road", name:"Draw Road"},
  {id:"trail", name:"Draw Trail"},
  {id:"river",   name:"Draw River"},
  {id:"inspect", name:"Lore"},
  {id:"erasepath",name:"Erase path"},
  {id:"erase",   name:"Erase tile"}
];
const HINTS={
  paint:"Drag to paint · right-click erases",
  fill:"Click to flood every connected matching tile",
  feature:"Click a hex to place the feature · click again to remove",
  erase:"Drag to erase tiles, points of interest and notes",
  road:"Click or drag through hexes to draw a road · right-click to erase",
  trail:"Click or drag through hexes to draw a trail · right-click to erase",

  river:"Click or drag through hexes to draw a river · right-click to erase",
  erasepath:"Hover a path to highlight it · click to erase it",
  inspect:"Click any hex to add lore — name and notes"
};
const toolBox=document.getElementById("tools");
/* Switch the active tool and update the button states and hint line. */
function setTool(id){
  tool=id;
  [...toolBox.children].forEach((x,n)=>x.setAttribute("aria-pressed",TOOLS[n].id===tool));
  document.getElementById("brushRow").style.display=(tool==="paint"||tool==="erase")?"":"none";
  document.getElementById("hint").textContent=HINTS[tool];
  if(tool!=="inspect") closeInspector(); else draw();
}
TOOLS.forEach(t=>{
  const b=document.createElement("button");
  b.className="tool"; b.type="button"; b.setAttribute("aria-pressed",t.id===tool);
  b.innerHTML='<span>'+t.name+'</span>';
  b.onclick=()=>setTool(t.id);
  toolBox.appendChild(b);
});

/* Create a small off-screen canvas for a swatch thumbnail. CSS stretches it to
   the swatch width, so it is drawn at twice the pixel density: shrinking a
   bitmap stays sharp, enlarging one blurs. */
function chip(w,h,fn){
  const el=document.createElement("canvas");
  const dpr=2*Math.min(2,window.devicePixelRatio||1);
  el.width=w*dpr; el.height=h*dpr; el.style.aspectRatio=w+"/"+h;
  const c=el.getContext("2d"); c.scale(dpr,dpr); fn(c,w,h);
  return el;
}
const terrBox=document.getElementById("terrains");
/* Draw one terrain's preview hex onto its swatch. */
function paintChip(t){
  return chip(62,44,(c,w,h)=>{
    c.fillStyle=PAPER; c.fillRect(0,0,w,h);
    const s=20, cx=w/2, cy=h/2;
    const off=S.orient==="pointy" ? -Math.PI/6 : 0;
    c.save(); c.beginPath();
    for(let i=0;i<6;i++){ const a=off+i*Math.PI/3;
      const x=cx+s*Math.cos(a), y=cy+s*Math.sin(a); i?c.lineTo(x,y):c.moveTo(x,y); }
    c.closePath(); c.clip();
    SYM_SQUASH=1; SYM_SHIFT=0;
    c.fillStyle=t.base; c.fill(); t.draw(c,cx,cy,s,t);
    c.restore();
  });
}
/* Rebuild the terrain swatch grid, including the custom tiles and the add button. */
function buildTileSwatches(){
  terrBox.innerHTML="";
  TERRAINS.forEach(t=>{
    const b=document.createElement("button");
    b.className="swatch"; b.type="button"; b.title=t.name;
    b.setAttribute("aria-pressed",t.id===curT);
    b.appendChild(paintChip(t));
    const sp=document.createElement("span"); sp.textContent=t.name; b.appendChild(sp);
    if(t.custom){
      const del=document.createElement("button");
      del.className="del"; del.type="button"; del.textContent="\u00d7";
      del.title="Remove this tile";
      del.onclick=e=>{ e.stopPropagation(); deleteCustom(t.id); };
      b.appendChild(del);
    }
    b.onclick=()=>{
      curT=t.id;
      [...terrBox.children].forEach((x,n)=>x.setAttribute("aria-pressed",TERRAINS[n].id===curT));
      [...featBox.children].forEach(x=>x.setAttribute("aria-pressed","false"));
      if(tool!=="paint"&&tool!=="fill") setTool("paint");
    };
    terrBox.appendChild(b);
  });
}
buildTileSwatches();
/* Repaint every swatch thumbnail, after a colour or orientation change. */
function redrawChips(){
  TERRAINS.forEach((t,n)=>{
    const b=terrBox.children[n]; if(!b) return;
    b.replaceChild(paintChip(t), b.firstChild);
  });
}
const featBox=document.getElementById("features");
/* Rebuild the point-of-interest swatch grid. */
function buildFeatureSwatches(){
  featBox.innerHTML="";
  FEATURES.forEach(f=>{
    const b=document.createElement("button");
    b.className="swatch"; b.type="button"; b.title=f.name;
    b.setAttribute("aria-pressed",f.id===curF);
    b.appendChild(chip(62,40,(c,w,h)=>{
      c.fillStyle=PAPER; c.fillRect(0,0,w,h);
      GLYPH=INK; GLYPH_BG=PAPER; f.draw(c,w/2,h/2,13);
    }));
    const sp=document.createElement("span"); sp.textContent=f.name; b.appendChild(sp);
    if(f.custom){
      const del=document.createElement("button");
      del.className="del"; del.type="button"; del.textContent="\u00d7";
      del.title="Remove this point of interest";
      del.onclick=e=>{ e.stopPropagation(); deleteCustomFeat(f.id); };
      b.appendChild(del);
    }
    b.onclick=()=>{
      curF=f.id;
      [...terrBox.children].forEach(x=>x.setAttribute("aria-pressed","false"));
      [...featBox.children].forEach((x,n)=>x.setAttribute("aria-pressed",FEATURES[n].id===curF));
      setTool("feature");
      document.getElementById("hint").textContent=
        "Click a hex to place "+f.name+" · click again to remove";
    };
    featBox.appendChild(b);
  });
}
buildFeatureSwatches();

const brushI=document.getElementById("brush"), brushO=document.getElementById("brushOut");
brushI.oninput=()=>{ brush=+brushI.value; brushO.value=[1,7,19][brush]+" hex"+(brush?"es":""); draw(); };

const colsI=document.getElementById("cols"), rowsI=document.getElementById("rows"),
      colsO=document.getElementById("colsOut"), rowsO=document.getElementById("rowsOut");
/* Change the grid to nc x nr, keeping whatever content still fits. */
function resize(nc,nr){
  const t=new Uint8Array(nc*nr), f=new Uint8Array(nc*nr), l={}, m={};
  for(let r=0;r<Math.min(nr,S.rows);r++) for(let c=0;c<Math.min(nc,S.cols);c++){
    t[r*nc+c]=S.terr[r*S.cols+c]; f[r*nc+c]=S.feat[r*S.cols+c];
    const a=S.labels[r*S.cols+c]; if(a) l[r*nc+c]=a;
    const b=S.memo[r*S.cols+c];   if(b) m[r*nc+c]=b;
  }
  S.cols=nc; S.rows=nr; S.terr=t; S.feat=f; S.labels=l; S.memo=m;
  if(sel!==null&&sel>=nc*nr) sel=null;
  syncInspector();
}
colsI.oninput=()=>{ colsO.value=colsI.value; push(); resize(+colsI.value,S.rows); refresh(); store(); };
rowsI.oninput=()=>{ rowsO.value=rowsI.value; push(); resize(S.cols,+rowsI.value); refresh(); store(); };

/* Set hex orientation. Currently pinned to pointy-top; the flat-top maths in geometry.js is still live but unreachable from the UI. */
function setOrient(o){
  S.orient="pointy";
  redrawChips();
}

document.getElementById("title").oninput=e=>{ S.title=e.target.value; refresh(); store(); };
(function(){
  const adj=["Ashen","Crimson","Iron","Silent","Hollow","Sunken","Broken","Grey",
              "Ancient","Blighted","Faded","Bitter","Wandering","Forsaken","Dark",
              "Scarred","Lost","Pale","Storm","Ember"];
  const noun=["Reach","Vale","Moor","Crossing","Expanse","Waste","Fen","Marches",
               "Shore","Downs","Pass","Hold","Hollow","Basin","Reach","Heath",
               "Strand","Peaks","Crown","Gate"];
  const prefix=["The ","The ","","","The ",""];
  document.getElementById("randTitle").onclick=()=>{
    const pick=a=>a[Math.floor(Math.random()*a.length)];
    const t=pick(prefix)+pick(adj)+" "+pick(noun);
    document.getElementById("title").value=t;
    S.title=t; refresh(); store();
  };
})();


document.getElementById("zIn").onclick=()=>setZoom(ppmView*1.25,true);
document.getElementById("zOut").onclick=()=>setZoom(ppmView/1.25,true);
document.getElementById("zFit").onclick=doFit;

const SHOW=[["cCoord","coord"],["cNotes","notes"],["cMono","mono"]];
SHOW.forEach(([id,k])=>{
  const el=document.getElementById(id);
  el.onchange=()=>{ S[k]=el.checked; refresh(); store(); };
});

// Hex opacity slider
(function(){
  const sl=document.getElementById("hexOpacity");
  const out=document.getElementById("hexOpacityOut");
  sl.oninput=()=>{
    S.hexOpacity=+sl.value;
    out.textContent=sl.value+"%";
    refresh(); store();
  };
})();

document.getElementById("clear").onclick=()=>{ push(); blank(); closeInspector(); refresh(); store(); };
document.getElementById("undo").onclick=undo;
document.getElementById("redo").onclick=redo;
