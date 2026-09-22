/* --------------------------------------------------------------------------
   terrains.js

   The terrain list. Built-in tiles, the factory that turns a spec into a drawable
   tile, and the rebuild that keeps painted hexes pointing at the right tile after
   the list changes.

   Uses:
     palette.js            INK, PAPER, contrastInk, lum, shade
     rail.js               buildTileSwatches
     render.js             draw, refresh
     state.js              S, curT
     symbols.js            SVG_CACHE, SYMBOL_LIB, drawSvgSymbol, loadTileSvg
   -------------------------------------------------------------------------- */
"use strict";

const BUILTIN_TILES = [
  { id:"sea",      name:"Sea",      base:"#58A8D8", sym:"waves" },
  { id:"lake",     name:"Lake",     base:"#7FCFEA", sym:"waves2" },
  { id:"plain",    name:"Plain",    base:"#8EBE80", sym:"none"  },
  { id:"forest",       name:"Forest",       base:"#8EBE80", sym:"trees2" },
  { id:"heavy-forest", name:"Heavy Forest", base:"#2A7248", sym:"trees3" },
  { id:"jungle",   name:"Jungle",   base:"#2A7248", sym:"palms3" },
  { id:"swamp",    name:"Swamp",    base:"#AEB4AD", sym:"reeds" },
  { id:"desert",   name:"Desert",   base:"#F5CE94", sym:"sand"  },
  { id:"oasis",    name:"Oasis",    base:"#F5CE94", sym:"palm"  },
  { id:"hills",    name:"Hills",    base:"#F5CE94", sym:"hills" },
  { id:"mountain", name:"Mountain", base:"#B58A57", sym:"peaks" },
  { id:"tundra",   name:"Tundra",   base:"#C8D4C0", sym:"dots"  }
];

/* Build a terrain object from a spec, giving it a draw() that picks either its SVG or a library symbol. */
function makeTile(spec){
  return {
    id:spec.id, name:spec.name, base:spec.base, sym:spec.sym, custom:!!spec.custom,
    svg:spec.svg||null, svgName:spec.svgName||"", keepColour:!!spec.keepColour,
    draw(c,x,y,s,d){
      // In mono: pure INK for maximum print contrast; in colour: tinted tile shade
      const m = S.mono ? INK : this.mark;
      if(this.svg){ drawSvgSymbol(c,x,y,s,this.id,m,this.keepColour&&!S.mono); return; }
      const L=SYMBOL_LIB[this.sym]; if(L) L.draw(c,x,y,s,m);
    }
  };
}
/* Derive the mark and lettering colours a tile needs from its base colour. */
function tileTones(t){
  t.lum=lum(t.base);
  t.mark = t.lum>.2 ? shade(t.base,-.38) : shade(t.base,.30);
  t.ink  = contrastInk(t.lum);
  return t;
}
const TERRAINS = BUILTIN_TILES.map(s=>tileTones(makeTile(s)));
const T_BY_ID={}; TERRAINS.forEach((t,i)=>{ T_BY_ID[t.id]=i+1; });

/* Rebuild the tile list after custom tiles change, remapping any painted
   hexes through their ids so nothing shifts underneath the map. */
function rebuildTiles(){
  const oldIds=TERRAINS.map(t=>t.id);
  TERRAINS.length=0;
  BUILTIN_TILES.forEach(s=>TERRAINS.push(tileTones(makeTile(s))));
    (S.custom||[]).forEach(s=>{
    TERRAINS.push(tileTones(makeTile({id:s.id,name:s.name,base:s.base,sym:s.sym,
      svg:s.svg,svgName:s.svgName,keepColour:s.keepColour,custom:true})));
    if(s.svg && !(SVG_CACHE[s.id]&&SVG_CACHE[s.id].ready))
      loadTileSvg(s.id,s.svg,()=>{ if(typeof buildTileSwatches==="function") buildTileSwatches();
                                   if(typeof refresh==="function") refresh(); });
  });
  for(const k in T_BY_ID) delete T_BY_ID[k];
  TERRAINS.forEach((t,i)=>{ T_BY_ID[t.id]=i+1; });
  if(S.terr){
    for(let i=0;i<S.terr.length;i++){
      const v=S.terr[i]; if(!v) continue;
      const id=oldIds[v-1];
      S.terr[i]= id ? (T_BY_ID[id]||0) : 0;
    }
  }
  if(!T_BY_ID[curT]) curT=TERRAINS[0].id;
}
const PAPER_INK = contrastInk(lum(PAPER));
