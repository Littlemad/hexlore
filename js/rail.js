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
     paths.js              PATH_TYPES, P_BY_ID
     pointer.js            pathEraseHover
     render.js             draw, paint, refresh
     state.js              S, blank, brush, curF, curP, curT, layer, ppmView, sel, tool,
                           usesBrush
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

/* The tools are verbs. What they act on — a tile, a path kind or a point of
   interest — is whichever swatch is selected in the palettes below them. */
const TOOLS=[
  {id:"paint",   name:"Paint", key:"B"},
  {id:"fill",    name:"Fill",  key:"G"},
  {id:"erase",   name:"Erase", key:"E"},
  {id:"inspect", name:"Lore",  key:"I"}
];
/* Footer hint for the current tool and layer. */
function hintFor(){
  if(tool==="inspect") return "Click any hex to add lore — name and notes";
  if(tool==="fill") return "Click to flood every connected matching tile";
  if(layer==="path"){
    const nm=P_BY_ID[curP].name.toLowerCase();
    return tool==="erase"
      ? "Hover a "+nm+" to highlight it · click to erase it"
      : "Click or drag through hexes to draw a "+nm+" · right-click to erase";
  }
  if(tool==="erase") return "Drag to erase tiles, points of interest and notes";
  if(layer==="feature") return "Click a hex to place "+FEATURES[F_BY_ID[curF]-1].name+" · click again to remove";
  return "Drag to paint · right-click erases";
}
const toolBox=document.getElementById("tools");
/* Switch the active tool and update the button states and hint line. */
function setTool(id){
  if(id==="fill"&&layer!=="terrain") return;   // fill only applies to tiles
  tool=id;
  [...toolBox.children].forEach((x,n)=>x.setAttribute("aria-pressed",TOOLS[n].id===tool));
  syncToolUi();
  if(tool!=="inspect") closeInspector(); else draw();
}
/* Refresh the parts of the rail that depend on both tool and layer. */
function syncToolUi(){
  toolBox.children[1].disabled = layer!=="terrain";
  document.getElementById("brushRow").style.display=usesBrush()?"":"none";
  document.getElementById("hint").textContent=hintFor();
  pathEraseHover=null;
  cv.style.cursor = tool==="erase" ? ERASER_CURSOR : "";
}
/* A small eraser drawn as an SVG cursor; the hotspot is its bottom-left corner. */
const ERASER_CURSOR='url("data:image/svg+xml;utf8,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'
  +'<g transform="rotate(-45 12 12)">'
  +'<rect x="3" y="8" width="18" height="8" rx="1.5" fill="#E9E4D8" stroke="#142B18" stroke-width="1.6"/>'
  +'<rect x="3" y="8" width="7" height="8" rx="1.5" fill="#D26D6D" stroke="#142B18" stroke-width="1.6"/>'
  +'</g></svg>')+'") 3 21, cell';
TOOLS.forEach(t=>{
  const b=document.createElement("button");
  b.className="tool"; b.type="button"; b.setAttribute("aria-pressed",t.id===tool);
  b.title=t.name+" ("+t.key+")";
  b.innerHTML='<span>'+t.name+'</span>';
  b.onclick=()=>setTool(t.id);
  toolBox.appendChild(b);
});

/* Make `l` the active layer. Picking a swatch means "I want to put this on
   the map", so the tool becomes Paint — except Fill, which stays while it
   still applies (terrain only). */
function setLayer(l){
  layer=l;
  if(!(tool==="fill"&&layer==="terrain")) tool="paint";
  [...toolBox.children].forEach((x,n)=>x.setAttribute("aria-pressed",TOOLS[n].id===tool));
  syncSwatches(); syncToolUi(); closeInspector(); draw();
}
/* Press the selected swatch in the active palette and dim the other palettes. */
function syncSwatches(){
  const boxes=[["terrain",terrBox,TERRAINS,curT],["path",pathBox,PATH_TYPES,curP],["feature",featBox,FEATURES,curF]];
  boxes.forEach(([l,box,list,cur])=>{
    box.dataset.off = layer!==l;
    [...box.children].forEach((x,n)=>x.setAttribute("aria-pressed",layer===l&&list[n].id===cur));
  });
}
/* Select a tile and switch to the terrain layer. */
function selectTerrain(id){ curT=id; setLayer("terrain"); }
/* Select a kind of path and switch to the path layer. */
function selectPath(id){ curP=id; setLayer("path"); }
/* Select a point of interest and switch to the feature layer. */
function selectFeature(id){ curF=id; setLayer("feature"); }

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
  terrBox.innerHTML=""; terrBox.dataset.off = layer!=="terrain";
  TERRAINS.forEach(t=>{
    const b=document.createElement("button");
    b.className="swatch"; b.type="button"; b.title=t.name;
    b.setAttribute("aria-pressed",layer==="terrain"&&t.id===curT);
    b.appendChild(paintChip(t));
    const sp=document.createElement("span"); sp.textContent=t.name; b.appendChild(sp);
    if(t.custom){
      const del=document.createElement("button");
      del.className="del"; del.type="button"; del.textContent="\u00d7";
      del.title="Remove this tile";
      del.onclick=e=>{ e.stopPropagation(); deleteCustom(t.id); };
      b.appendChild(del);
    }
    b.onclick=()=>selectTerrain(t.id);
    terrBox.appendChild(b);
  });
}
buildTileSwatches();

const pathBox=document.getElementById("paths");
/* Draw one path kind's preview stroke onto its swatch, in the style render.js prints it. */
function pathChip(p){
  return chip(62,40,(c,w,h)=>{
    c.fillStyle = p.water==="only" ? "#CFE0E8" : PAPER; c.fillRect(0,0,w,h);
    c.lineCap="round"; c.lineJoin="round";
    c.beginPath(); c.moveTo(6,h*.68); c.quadraticCurveTo(w*.45,h*.05,w-6,h*.45);
    if(p.id==="river"){ c.strokeStyle=p.colour; c.lineWidth=3.5; }
    else if(p.id==="trail"){ c.strokeStyle=INK; c.lineWidth=2; c.setLineDash([3,3]); }
    else if(p.id==="ship"){ c.strokeStyle=INK; c.lineWidth=2; c.lineCap="butt"; c.setLineDash([7,4]); }
    else { c.strokeStyle=INK; c.lineWidth=2.5; }
    c.stroke(); c.setLineDash([]);
  });
}
/* Build the path swatch grid: one button per entry in PATH_TYPES. */
function buildPathSwatches(){
  pathBox.innerHTML=""; pathBox.dataset.off = layer!=="path";
  PATH_TYPES.forEach(p=>{
    const b=document.createElement("button");
    b.className="swatch"; b.type="button"; b.title=p.name+" ("+p.key.toUpperCase()+")";
    b.setAttribute("aria-pressed",layer==="path"&&p.id===curP);
    b.appendChild(pathChip(p));
    const sp=document.createElement("span"); sp.textContent=p.name; b.appendChild(sp);
    b.onclick=()=>selectPath(p.id);
    pathBox.appendChild(b);
  });
}
buildPathSwatches();
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
  featBox.innerHTML=""; featBox.dataset.off = layer!=="feature";
  FEATURES.forEach(f=>{
    const b=document.createElement("button");
    b.className="swatch"; b.type="button"; b.title=f.name;
    b.setAttribute("aria-pressed",layer==="feature"&&f.id===curF);
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
    b.onclick=()=>selectFeature(f.id);
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

/* Collapsible rail groups remember whether they were open across reloads;
   groups the user never touched start closed. The "Expand/Collapse all"
   link mirrors whatever state that leaves the groups in. */
(function(){
  let saved={};
  try{ saved=JSON.parse(localStorage.getItem("hexlore.rail")||"{}"); }catch(e){}
  const groups=[...document.querySelectorAll("details.grp")];
  const toggleAll=document.getElementById("railToggleAll");
  function save(){ try{ localStorage.setItem("hexlore.rail",JSON.stringify(saved)); }catch(e){} }
  function syncLabel(){ toggleAll.textContent = groups.every(d=>d.open) ? "Collapse all categories" : "Expand all categories"; }
  groups.forEach(d=>{
    d.open = !!saved[d.id];
    d.addEventListener("toggle",()=>{ saved[d.id]=d.open; save(); syncLabel(); });
  });
  toggleAll.onclick=e=>{
    e.preventDefault();
    const open=!groups.every(d=>d.open);
    groups.forEach(d=>{ d.open=open; saved[d.id]=open; });
    save(); syncLabel();
  };
  syncLabel();
})();

document.getElementById("clear").onclick=()=>{ push(); blank(); closeInspector(); refresh(); store(); };
document.getElementById("undo").onclick=undo;
document.getElementById("redo").onclick=redo;
