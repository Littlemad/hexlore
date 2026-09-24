/* --------------------------------------------------------------------------
   custom-tiles.js

   The custom terrain editor modal: colour picker, SVG upload, live preview.

   Uses:
     palette.js            PAPER, lum, shade
     rail.js               buildTileSwatches, selectTerrain
     render.js             refresh
     state.js              S, curT
     storage.js            store
     symbols.js            SVG_CACHE, SYM_SHIFT, SYM_SQUASH, drawSvgSymbol, loadTileSvg
     terrains.js           TERRAINS, T_BY_ID, rebuildTiles
   -------------------------------------------------------------------------- */
"use strict";

// Colours grouped by family: water · green · arid · cold/rock · special
const TM_COLORS = [
  "#58A8D8","#7FCFEA",  // water
  "#8EBE80","#4E9E4A",  // green land
  "#2A7248","#AEB4AD",  // jungle / swamp
  "#F5CE94","#B58A57",  // arid / desert
  "#C8D4C0","#8FA8B8",  // tundra / cold
  "#D4B896","#6E6E6E",  // rock / stone
];
const tileModal=document.getElementById("tileModal");
let tmColor="#CFE0E8", tmSvg=null, tmSvgName="", tmKeepColour=false;
const TM_PREVIEW_ID="__tmPreview";

/* Choose a mark colour that stays legible on the given base colour. */
function markFor(base){ const L=lum(base); return L>.2 ? shade(base,-.38) : shade(base,.30); }

/* Render a single preview hex into the custom-tile editor canvas. */
function drawTileHex(c,w,h,base,mark,svgId,keep){
  c.clearRect(0,0,w,h);
  c.fillStyle=PAPER; c.fillRect(0,0,w,h);
  const s=Math.min(w,h)*.42, cx=w/2, cy=h/2;
  const hex=()=>{ c.beginPath();
    for(let i=0;i<6;i++){ const a=-Math.PI/6+i*Math.PI/3;
      const px=cx+s*Math.cos(a), py=cy+s*Math.sin(a); i?c.lineTo(px,py):c.moveTo(px,py); }
    c.closePath(); };
  c.save(); hex(); c.clip();
  SYM_SQUASH=1; SYM_SHIFT=0;
  c.fillStyle=base; c.fill();
  if(svgId) drawSvgSymbol(c,cx,cy,s,svgId,mark,keep);
  c.restore();
  c.strokeStyle="rgba(46,36,24,.55)"; c.lineWidth=1; hex(); c.stroke();
}
/* Redraw the custom-tile editor to match the current colour and symbol choices. */
function tmRefresh(){
  const cv2=document.getElementById("tmPreview");
  drawTileHex(cv2.getContext("2d"),cv2.width,cv2.height,
              tmColor,markFor(tmColor), tmSvg?TM_PREVIEW_ID:null, tmKeepColour);
  [...document.getElementById("tmColors").children]
    .forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.col===tmColor)));
  document.getElementById("tmFileName").textContent =
    tmSvgName || "No symbol — a flat colour tile";
  document.getElementById("tmKeepWrap").style.display = tmSvg ? "" : "none";
}
(function buildColourSwatches(){
  const cw=document.getElementById("tmColors");
  TM_COLORS.forEach(col=>{
    const b=document.createElement("button");
    b.type="button"; b.dataset.col=col; b.style.background=col; b.title=col;
    b.onclick=()=>{ tmColor=col; document.getElementById("tmColor").value=col; tmRefresh(); };
    cw.appendChild(b);
  });
})();
document.getElementById("tmColor").oninput=e=>{ tmColor=e.target.value; tmRefresh(); };
document.getElementById("tmKeep").onchange=e=>{ tmKeepColour=e.target.checked; tmRefresh(); };
document.getElementById("tmPick").onclick=()=>document.getElementById("tmFile").click();
document.getElementById("tmDrop").onclick=()=>{
  tmSvg=null; tmSvgName=""; tmKeepColour=false;
  document.getElementById("tmKeep").checked=false;
  document.getElementById("tmFile").value="";
  delete SVG_CACHE[TM_PREVIEW_ID];
  tmRefresh();
};
document.getElementById("tmFile").onchange=e=>{
  const f=e.target.files && e.target.files[0]; if(!f) return;
  const warn=document.getElementById("tmWarn");
  if(f.size>96*1024){ warn.textContent="That SVG is over 96 KB — try a simpler one."; return; }
  const rd=new FileReader();
  rd.onload=()=>{
    let txt=String(rd.result);
    if(txt.indexOf("<svg")<0){ warn.textContent="That file isn't an SVG."; return; }
    txt=txt.replace(/<script[\s\S]*?<\/script>/gi,"");   // inert anyway, dropped for safety
    warn.textContent="";
    tmSvg=txt; tmSvgName=f.name;
    loadTileSvg(TM_PREVIEW_ID, txt, tmRefresh);
  };
  rd.readAsText(f);
};
document.getElementById("tmClose").onclick=()=>tileModal.classList.remove("on");
tileModal.addEventListener("pointerdown",e=>{ if(e.target===tileModal) tileModal.classList.remove("on"); });
document.getElementById("newTile").onclick=()=>{
  document.getElementById("tmName").value="";
  document.getElementById("tmWarn").textContent="";
  document.getElementById("tmFile").value="";
  document.getElementById("tmKeep").checked=false;
  tmColor="#CFE0E8"; tmSvg=null; tmSvgName=""; tmKeepColour=false;
  delete SVG_CACHE[TM_PREVIEW_ID];
  document.getElementById("tmColor").value=tmColor;
  tileModal.classList.add("on");
  tmRefresh();
  document.getElementById("tmName").focus();
};
document.getElementById("tmSave").onclick=()=>{
  const nm=document.getElementById("tmName").value.trim();
  const warn=document.getElementById("tmWarn");
  if(!nm){ warn.textContent="Give the tile a name."; return; }
  if(TERRAINS.length>=40){ warn.textContent="That is as many tiles as a sheet can hold."; return; }
  const id="cu_"+Date.now().toString(36);
  S.custom.push({id, name:nm, base:tmColor, sym:"none",
                 svg:tmSvg, svgName:tmSvgName, keepColour:tmKeepColour});
  if(tmSvg) loadTileSvg(id, tmSvg, ()=>{ buildTileSwatches(); refresh(); });
  rebuildTiles(); buildTileSwatches();
  tileModal.classList.remove("on");
  selectTerrain(id); refresh(); store();
};
/* Remove a custom terrain and clear it from any hex that used it. */
function deleteCustom(id){
  const v=T_BY_ID[id];
  if(v) for(let i=0;i<S.terr.length;i++) if(S.terr[i]===v) S.terr[i]=0;
  S.custom=S.custom.filter(t=>t.id!==id);
  rebuildTiles(); buildTileSwatches(); refresh(); store();
}
