/* --------------------------------------------------------------------------
   features.js

   Points of interest: towns, castles, ruins and the rest. Built-in icons are
   loaded from the #feature-sprite SVG element inlined in index.html; custom
   ones are user-uploaded. Both render through drawSvgSymbol in symbols.js.

   To swap a built-in icon: edit assets/features.svg, then run
     node update-sprite.js
   to patch the inline block in index.html.

   Uses:
     palette.js            INK, PAPER
     rail.js               buildFeatureSwatches
     render.js             draw, refresh
     state.js              S, curF
     symbols.js            SVG_CACHE, drawSvgSymbol, loadTileSvg
   -------------------------------------------------------------------------- */
"use strict";

let GLYPH=INK, GLYPH_BG=PAPER;

const BUILTIN_FEATURES = [
  { id:"town",    name:"Town" },
  { id:"city",    name:"City" },
  { id:"capitol", name:"Capitol" },
  { id:"keep",    name:"Castle" },
  { id:"tower",   name:"Tower" },
  { id:"ruin",    name:"Ruins" },
  { id:"cave",    name:"Cave" },
  { id:"temple",  name:"Temple" },
  { id:"camp",    name:"Camp" },
  { id:"bridge",  name:"Bridge" },
  { id:"port",    name:"Harbour" },
  { id:"mine",    name:"Mine" },
  { id:"battle",  name:"Battle" },
  { id:"mark",    name:"Landmark" },
];
BUILTIN_FEATURES.forEach(f => {
  f.draw = function(c,x,y,u){ drawSvgSymbol(c,x,y,u*1.6,this.id,GLYPH,false); };
});

const FEATURES = BUILTIN_FEATURES.slice();
const F_BY_ID={}; FEATURES.forEach((f,i)=>{ F_BY_ID[f.id]=i+1; });

/* Extract each <symbol> from the inline sprite and register it in SVG_CACHE. */
function loadFeatureSprite(){
  const sprite = document.getElementById('feature-sprite');
  if(!sprite) return;
  sprite.querySelectorAll('symbol').forEach(sym => {
    const id = sym.getAttribute('id');
    if(!id) return;
    const vb = sym.getAttribute('viewBox') || '0 0 100 100';
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100" height="100">${sym.innerHTML}</svg>`;
    loadTileSvg(id, svgStr, ()=>{
      if(typeof buildFeatureSwatches==='function') buildFeatureSwatches();
      if(typeof refresh==='function') refresh();
    });
  });
}
loadFeatureSprite();

/* Wrap a user-uploaded SVG as a point-of-interest that draws like a built-in one. */
function makeCustomFeat(spec){
  return {
    id:spec.id, name:spec.name, custom:true, svg:spec.svg||null, svgName:spec.svgName||"",
    draw(c,x,y,u){
      if(this.svg) drawSvgSymbol(c,x,y,u*1.6,this.id,GLYPH,false);
    }
  };
}
/* Rebuild the POI list after custom features change, remapping placed
   marks through their ids so nothing shifts underneath the map. */
function rebuildFeatures(){
  const oldIds=FEATURES.map(f=>f.id);
  FEATURES.length=0;
  BUILTIN_FEATURES.forEach(f=>FEATURES.push(f));
  (S.customFeats||[]).forEach(s=>{
    FEATURES.push(makeCustomFeat(s));
    if(s.svg && !(SVG_CACHE[s.id]&&SVG_CACHE[s.id].ready))
      loadTileSvg(s.id,s.svg,()=>{ if(typeof buildFeatureSwatches==="function") buildFeatureSwatches();
                                   if(typeof refresh==="function") refresh(); });
  });
  for(const k in F_BY_ID) delete F_BY_ID[k];
  FEATURES.forEach((f,i)=>{ F_BY_ID[f.id]=i+1; });
  if(S.feat){
    for(let i=0;i<S.feat.length;i++){
      const v=S.feat[i]; if(!v) continue;
      const id=oldIds[v-1];
      S.feat[i]= id ? (F_BY_ID[id]||0) : 0;
    }
  }
  if(!F_BY_ID[curF]) curF=FEATURES[0].id;
}
