/* --------------------------------------------------------------------------
   mapgen.js

   The "Generate random map" button. Builds a small kingdom onto the current
   grid: a shaped heightmap gives one coast and land that rises inland, biomes
   follow elevation and moisture, a mending pass fixes pairs that should never
   touch (a lake beside the sea, peaks rising straight out of water), rivers
   run downhill to water, settlements are scored and spaced, roads join them,
   and every settlement gets a name in one shared flavour.

   Everything is built on local arrays and S is written once, after push(), so
   a failed attempt never leaves a half-finished plate behind. The whole file is
   one closure so its many helpers do not leak into the shared global scope.

   Uses:
     exporting.js          showToast
     features.js           F_BY_ID
     geometry.js           SQ3, edgeNeighbour, hexDist, idx, inside, neighbours
     history.js            push
     inspector.js          closeInspector
     render.js             refresh
     state.js              S, blank
     storage.js            store
     terrains.js           TERRAINS, T_BY_ID
   -------------------------------------------------------------------------- */
"use strict";

(function(){

/* ---- small helpers ------------------------------------------------------ */

/* mulberry32: a tiny seeded generator, so each attempt is reproducible while debugging. */
function mulberry(a){ return ()=>{ a=(a+0x6D2B79F5)|0; let t=Math.imul(a^a>>>15,a|1);
  t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
/* Column and row of a flat index. */
function cr(i){ return [i%S.cols,(i/S.cols)|0]; }
/* Terrain value for a built-in id, falling back to plain if a tile ever goes missing. */
function T(id){ return T_BY_ID[id]||T_BY_ID.plain||1; }
/* Terrain id string held at a hex, or "" when unsurveyed. */
function tid(terr,i){ const v=terr[i]; return v?TERRAINS[v-1].id:""; }
/* True for sea and lake. */
function isWater(terr,i){ const t=tid(terr,i); return t==="sea"||t==="lake"; }
/* Flat indices of the six neighbours, clipped to the grid. */
function nbs(i){ const [c,r]=cr(i); return neighbours(c,r).map(p=>idx(p[0],p[1])); }
/* True on the outermost ring of the grid. */
function onEdge(i){ const [c,r]=cr(i); return c===0||r===0||c===S.cols-1||r===S.rows-1; }
/* Steps from a hex to one edge of the sheet. */
function edgeDist(c,r,k){ return k==="W"?c : k==="E"?S.cols-1-c : k==="N"?r : S.rows-1-r; }
/* Random element of an array. */
function pick(rand,a){ return a[Math.floor(rand()*a.length)]; }
/* Shuffle in place. */
function shuffle(rand,a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
/* Smoothstep, for the noise interpolation. */
function sm(t){ return t*t*(3-2*t); }
/* Percentile rank of each listed cell, 0..1, so thresholds become exact fractions. */
function rankNorm(arr,ids){
  const s=ids.slice().sort((a,b)=>arr[a]-arr[b]), out=new Float32Array(arr.length);
  s.forEach((i,k)=>{ out[i]= s.length>1 ? k/(s.length-1) : .5; });
  return out;
}
/* Connected components of the hexes satisfying pred, as arrays of flat indices. */
function components(pred){
  const n=S.cols*S.rows, seen=new Uint8Array(n), out=[];
  for(let i0=0;i0<n;i0++){
    if(seen[i0]||!pred(i0)) continue;
    const comp=[], st=[i0]; seen[i0]=1;
    while(st.length){ const i=st.pop(); comp.push(i);
      nbs(i).forEach(j=>{ if(!seen[j]&&pred(j)){ seen[j]=1; st.push(j); } }); }
    out.push(comp);
  }
  return out;
}
/* Multi-source breadth-first distance; -1 where unreachable. */
function bfs(seeds){
  const n=S.cols*S.rows, d=new Int16Array(n).fill(-1), q=[];
  seeds.forEach(([i,v])=>{ if(d[i]<0||v<d[i]){ d[i]=v; q.push(i); } });
  for(let h=0;h<q.length;h++){ const i=q[h];
    nbs(i).forEach(j=>{ if(d[j]<0||d[i]+1<d[j]){ d[j]=d[i]+1; q.push(j); } }); }
  return d;
}
/* Binary min-heap on [key, value] pairs, for A*. */
function hpush(h,x){ h.push(x); let i=h.length-1;
  while(i>0){ const p=(i-1)>>1; if(h[p][0]<=h[i][0]) break; [h[p],h[i]]=[h[i],h[p]]; i=p; } }
function hpop(h){ const top=h[0], last=h.pop(); if(!h.length) return top; h[0]=last; let i=0;
  for(;;){ const l=2*i+1, r=l+1; let m=i;
    if(l<h.length&&h[l][0]<h[m][0]) m=l; if(r<h.length&&h[r][0]<h[m][0]) m=r;
    if(m===i) break; [h[m],h[i]]=[h[i],h[m]]; i=m; }
  return top; }
/* Direction index (for edgeNeighbour) that walks away from a coast edge; alternates so north/south runs straight. */
function inlandDir(k,step){ return k==="W"?0 : k==="E"?3 : k==="N"?(step&1?2:1) : (step&1?4:5); }

/* ---- 1. shape ----------------------------------------------------------- */

/* Three octaves of value noise sampled at isotropic hex centres. */
function noiseField(rand,period){
  const n=S.cols*S.rows, out=new Float32Array(n);
  const W=S.cols+1, H=Math.ceil(S.rows*SQ3/2)+1;
  let amp=1, tot=0;
  for(let o=0;o<3;o++){
    const per=period/(1<<o), gw=Math.ceil(W/per)+2, gh=Math.ceil(H/per)+2;
    const lat=new Float32Array(gw*gh); for(let i=0;i<lat.length;i++) lat[i]=rand();
    for(let r=0;r<S.rows;r++) for(let c=0;c<S.cols;c++){
      const x=(c+.5*(r&1))/per, y=(r*SQ3/2)/per, x0=Math.floor(x), y0=Math.floor(y), fx=sm(x-x0), fy=sm(y-y0);
      const a=lat[y0*gw+x0], b=lat[y0*gw+x0+1], cc=lat[(y0+1)*gw+x0], d=lat[(y0+1)*gw+x0+1];
      out[idx(c,r)] += amp*((a*(1-fx)+b*fx)*(1-fy)+(cc*(1-fx)+d*fx)*fy);
    }
    tot+=amp; amp*=.5;
  }
  for(let i=0;i<n;i++) out[i]/=tot;
  return out;
}
/* Roll the map-wide facts: which edges are coast, how much land, how warm it is. */
function pickClimate(rand){
  const g=Object.assign({},GEN_DEFAULTS,S.gen||{});
  const edges=["W","E","N","S"], coasts=[];
  const landlocked= g.coast==="landlocked" || (g.coast!=="coastal"&&rand()<.2);
  if(!landlocked){
    const a=pick(rand,edges); coasts.push(a);
    if(rand()<.3) coasts.push(pick(rand,(a==="W"||a==="E")?["N","S"]:["W","E"]));
  }
  const climate= ["temperate","hot","cold"].includes(g.climate) ? g.climate : "temperate";
  const relief=g.mountains/50;   // 1 = the default share of peaks and hills, 0 = flat, 2 = twice as much
  return { coasts, climate,
           landFrac: Math.max(.25,Math.min(.95, 1-g.sea/100+(rand()-.5)*.08)),
           desertMap: climate==="cold" ? false : climate==="hot" ? g.desert>0 : rand()<g.desert/100,
           desertMul: .5+g.desert/60, desertNear: g.desert>=70 ? 2 : 3,   // a high setting lets sand reach closer to water
           tundraMap: climate==="cold"||(climate==="temperate"&&rand()<.4),
           pMtn: relief<.05 ? 1.01 : 1-.09*relief,
           pHills: relief<.05 ? 1.01 : 1-.21*relief,
           forestBias:(g.forest-50)/250,
           lakes:g.lakes/50, rivers:g.rivers/50, poi:.35+g.poi/100*.92, roads:g.roads };
}
/* Elevation as a percentile: noise blended with distance from the coast edge(s). */
function shapeElevation(cfg,noise){
  const n=S.cols*S.rows, e=new Float32Array(n), all=[];
  for(let i=0;i<n;i++){ all.push(i);
    if(!cfg.coasts.length){ e[i]=noise[i]; continue; }
    const [c,r]=cr(i); let g=1;
    cfg.coasts.forEach(k=>{ const ext=(k==="W"||k==="E")?S.cols:S.rows;
      g=Math.min(g, Math.min(1, edgeDist(c,r,k)/(.45*ext))); });
    e[i]=.45*g+.55*noise[i];
  }
  return rankNorm(e,all);
}
/* Drown tiny islands and turn small inland seas into lakes, larger ones into lowland. */
function fixWaterBodies(terr,e,lakesOn){
  const sea=T("sea"), lake=T("lake"), plain=T("plain");
  const hasSea=terr.some(v=>v===sea);
  if(hasSea) components(i=>terr[i]!==sea).forEach(comp=>{ if(comp.length<3) comp.forEach(i=>{ terr[i]=sea; }); });
  components(i=>terr[i]===sea).forEach(comp=>{
    // a puddle of sea, even on the sheet edge, reads better as a lake; a big inland sea becomes lowland
    if(comp.length<=3&&lakesOn){ comp.forEach(i=>{ terr[i]=lake; }); return; }
    if(comp.some(onEdge)) return;
    comp.forEach(i=>{ terr[i]=plain; e[i]=Math.min(1,e[i]+.05); });
  });
}
/* Land height as a percentile of land: half elevation, half distance from the sea, plus an optional mountain range. */
function relief(terr,e,rand){
  const n=S.cols*S.rows, sea=T("sea"), seeds=[];
  for(let i=0;i<n;i++) if(terr[i]===sea) seeds.push([i,0]);
  if(!seeds.length){ // landlocked: water drains towards the two lowest edge hexes
    const edge=[]; for(let i=0;i<n;i++) if(onEdge(i)) edge.push(i);
    edge.sort((a,b)=>e[a]-e[b]); edge.slice(0,2).forEach(i=>seeds.push([i,0]));
  }
  const d=bfs(seeds); let dmax=1; for(let i=0;i<n;i++) dmax=Math.max(dmax,d[i]);
  const e2=new Float32Array(n), land=[];
  for(let i=0;i<n;i++){ e2[i]=.6*e[i]+.4*d[i]/dmax; if(!isWater(terr,i)) land.push(i); }
  if(rand()<.6){
    const far=land.filter(i=>d[i]>=.6*dmax);
    if(far.length){
      let cur=pick(rand,far), k=Math.floor(rand()*6); const len=3+Math.floor(rand()*6), line=[cur];
      for(let s=1;s<len;s++){
        const [c,r]=cr(cur), kk=(k+(rand()<.3?(rand()<.5?1:5):0))%6, nb=edgeNeighbour(c,r,kk);
        if(!inside(nb[0],nb[1])) break; const j=idx(nb[0],nb[1]); if(isWater(terr,j)) break;
        cur=j; line.push(j);
      }
      line.forEach(i=>{ e2[i]+=.35; nbs(i).forEach(j=>{ if(!isWater(terr,j)) e2[j]+=.15; }); });
    }
  }
  return { p:rankNorm(e2,land), d, dmax, land };
}
/* Lakes in low local hollows, well clear of the sea. */
function placeLakes(terr,R,rand,cfg){
  const lake=T("lake"), hasSea=cfg.coasts.length>0, land=R.land;
  const ok=i=>!isWater(terr,i)&&(!hasSea||R.d[i]>=2);
  let cands=land.filter(i=>ok(i)&&R.p[i]<.5&&nbs(i).every(j=>isWater(terr,j)||R.p[j]>R.p[i]));
  cands.sort((a,b)=>R.p[a]-R.p[b]);
  const have=new Set(cands), extra=land.filter(i=>ok(i)&&R.p[i]<.35&&!have.has(i)).sort((a,b)=>R.p[a]-R.p[b]);
  cands=cands.concat(extra);
  const want=Math.max(0,Math.min(7,Math.round((land.length/70+(hasSea?0:1))*cfg.lakes))), placed=[];
  for(const i of cands){
    if(placed.length>=want) break;
    if(placed.some(j=>hexDist(cr(i),cr(j))<5)) continue;
    terr[i]=lake; placed.push(i);
    // lakes scale with slider: at 100%, grow to 4-6 hexes; at 50%, 2-3 hexes
    let grow=rand()<Math.min(1,.4*cfg.lakes)?Math.max(1,Math.round(cfg.lakes*2)):0;
    let cur=i;
    while(grow-->0){
      const cand=nbs(cur).filter(j=>ok(j)&&!nbs(j).some(k=>terr[k]===T("sea"))).sort((a,b)=>R.p[a]-R.p[b])[0];
      if(cand===undefined) break; terr[cand]=lake; cur=cand;
    }
    // organic growth: add extra hexes around the lake shore to avoid straight lines
    const shore=new Set(); for(const l of land) if(terr[l]===lake) nbs(l).forEach(j=>{ if(!isWater(terr,j)&&ok(j)) shore.add(j); });
    for(const l of shore) if(rand()<.35&&!isWater(terr,l)&&ok(l)&&!nbs(l).some(k=>terr[k]===T("sea"))) terr[l]=lake;
  }
}

/* ---- 2. rivers ---------------------------------------------------------- */

/* Walk downhill from start until water or another river; carve through sills, or pool into a tarn when allowed. */
function descend(start,h,terr,riverLand,R,allowTarn,avoid){
  const path=[start], seen=new Set(avoid||[]); seen.add(start); let cur=start, end="stuck";
  for(let step=0;step<S.cols+S.rows;step++){
    const cand=nbs(cur).filter(j=>!seen.has(j));
    if(!cand.length) break;
    // water and existing rivers pull hardest; ground beside a river pulls a little, so a nearby river is joined rather than shadowed
    const key=j=> isWater(terr,j)?-1 : riverLand.has(j)?-.5 : h[j]-(nbs(j).some(k=>riverLand.has(k))?.15:0);
    let next=cand[0]; cand.forEach(j=>{ if(key(j)<key(next)) next=j; });
    if(key(next)>=h[cur]){
      if(allowTarn&&path.length>=3&&R.d[cur]>=2&&!nbs(cur).some(j=>isWater(terr,j))){ terr[cur]=T("lake"); end="tarn"; break; }
      h[next]=h[cur]-.01;
    }
    path.push(next); seen.add(next); cur=next;
    if(isWater(terr,next)){ end="water"; break; }
    if(riverLand.has(next)){ end="river"; break; }
  }
  return { path, end };
}
/* Rivers from the high ground down to the sea or a lake; then an outflow for lakes that have none. */
function carveRivers(terr,R,rand,cfg){
  const land=R.land, h=Float32Array.from(R.p), riverLand=new Set(), paths=[];
  const want= land.length<40||cfg.rivers<=0 ? 0 : Math.max(1,Math.min(5,Math.round(land.length/70*cfg.rivers)));
  // rivers rise on the hills; on a flat map they still start from the highest fifth of the land
  const high=land.filter(i=>R.p[i]>=Math.min(cfg.pHills,.8)).sort((a,b)=>R.p[b]-R.p[a]);
  // sources sit well apart so channels do not run side by side; asking for more rivers loosens that spacing
  const apart=Math.max(3,Math.round(6/Math.max(.5,cfg.rivers)));
  const src=[]; for(const i of high){ if(src.length>=want) break; if(!src.some(j=>hexDist(cr(i),cr(j))<apart)) src.push(i); }
  let tarns=0;
  const commit=(res,minLen)=>{
    if(res.path.length<minLen) return false;
    // a river that shadows another one hex away without ever joining it is dropped: two parallel channels look wrong
    const landHexes=res.path.slice(0,-2).filter(i=>!isWater(terr,i)&&!riverLand.has(i));   // ignore the final approach into a junction
    const beside=landHexes.filter(i=>nbs(i).some(k=>riverLand.has(k))).length;
    if(landHexes.length&&beside/landHexes.length>.35) return false;
    paths.push({type:"river",hexes:res.path.map(cr)});
    res.path.forEach(i=>{ if(!isWater(terr,i)) riverLand.add(i); });
    return true;
  };
  src.forEach(s=>{
    const res=descend(s,h,terr,riverLand,R,tarns<1&&cfg.lakes>0);
    if(res.end==="tarn") tarns++;
    if(res.end!=="stuck") commit(res,3);
  });
  if(cfg.rivers<=0) return { paths, riverLand };   // no rivers means no lake outflows either
  components(i=>tid(terr,i)==="lake").forEach(comp=>{
    if(comp.some(i=>nbs(i).some(j=>riverLand.has(j)))) return;
    if(comp.length<2&&rand()>=.5) return;
    let out=null; comp.forEach(i=>nbs(i).forEach(j=>{ if(!isWater(terr,j)&&(out===null||h[j]<h[out])) out=j; }));
    if(out===null) return;
    const lakeHex=comp.find(i=>nbs(i).includes(out));
    const res=descend(out,h,terr,riverLand,R,false,comp);
    if(res.end==="water"||res.end==="river"){ res.path.unshift(lakeHex); commit(res,3); }
  });
  return { paths, riverLand };
}

/* ---- 3. biomes ---------------------------------------------------------- */

/* Moisture: near fresh water is wet, behind a mountain is dry, with a little noise. */
function moisture(terr,R,riverLand,cfg,rand){
  const n=S.cols*S.rows, seeds=[];
  for(let i=0;i<n;i++){
    if(tid(terr,i)==="lake"||riverLand.has(i)) seeds.push([i,0]);
    else if(!isWater(terr,i)&&nbs(i).some(j=>tid(terr,j)==="sea")) seeds.push([i,1]);
  }
  const dw=bfs(seeds), all=[]; for(let i=0;i<n;i++) all.push(i);
  // rank-normalised so the biome thresholds below are real fractions, not guesses about the noise spread
  const noise=rankNorm(noiseField(rand,Math.max(4,Math.round(Math.sqrt(n)/4))),all);
  const m=new Float32Array(n);
  for(let i=0;i<n;i++){ const w= dw[i]<0 ? 0 : Math.max(0,1-dw[i]/4); m[i]=.45*w+.55*noise[i]+cfg.forestBias; }
  if(cfg.coasts.length){
    const k=cfg.coasts[0];
    for(let i=0;i<n;i++){
      if(isWater(terr,i)||R.p[i]<cfg.pMtn) continue;
      let [c,r]=cr(i);
      for(let s=0;s<3;s++){ const nb=edgeNeighbour(c,r,inlandDir(k,s)); if(!inside(nb[0],nb[1])) break;
        c=nb[0]; r=nb[1]; const j=idx(c,r); if(!isWater(terr,j)) m[j]-=.25; }
    }
  }
  return { m, dw };
}
/* Turn height and moisture into tiles. Water is never touched. */
function assignBiomes(terr,R,M,cfg,rand){
  const n=S.cols*S.rows, hot=cfg.climate==="hot", p=R.p, m=M.m, dw=M.dw;
  for(let i=0;i<n;i++){
    if(isWater(terr,i)) continue;
    const far= dw[i]<0 || dw[i]>=cfg.desertNear;
    let id;
    if(p[i]>=cfg.pMtn) id="mountain";
    else if(p[i]>=cfg.pHills) id="hills";
    else if(cfg.desertMap&&m[i]<(hot?.22:.16)*cfg.desertMul&&far) id="desert";
    else if(p[i]<.2&&dw[i]>=0&&dw[i]<=1&&m[i]>.78) id="swamp";
    else if(m[i]>.70&&p[i]>.35) id= hot?"jungle":"heavy-forest";
    else if(m[i]>.50) id="forest";
    // frozen ground is the cold-climate mirror of desert: a moisture threshold
    // that scales across the whole map, instead of a band pinned to one edge
    else if(cfg.tundraMap&&m[i]<.45) id="tundra";
    else id="plain";
    terr[i]=T(id);
  }
}
/* Pairs that must never touch, and what the lower-priority member becomes when they do. */
const PRIO={sea:10,lake:9,mountain:8,hills:7,desert:6,swamp:5,tundra:4,jungle:3,"heavy-forest":2,forest:1,plain:0,oasis:0};
const MEND={
  lake:          {sea:"sea"},                   // a lake beside the sea is just a bay
  mountain:      {sea:"hills", lake:"hills"},   // peaks never rise straight out of water
  swamp:         {desert:"plain", mountain:"plain"},
  desert:        {lake:"plain"},
  tundra:        {desert:"plain", jungle:"plain"},
  jungle:        {desert:"forest"},
  "heavy-forest":{desert:"forest"}
};
/* Sweep until no forbidden neighbour pair remains; every replacement is itself inoffensive so this converges fast. */
function repairAdjacency(terr){
  const n=S.cols*S.rows;
  for(let sweep=0;sweep<4;sweep++){
    let changed=false;
    for(let i=0;i<n;i++){
      const a=tid(terr,i), rule=MEND[a]; if(!rule) continue;
      for(const j of nbs(i)){ const b=tid(terr,j);
        if(rule[b]&&(PRIO[a]||0)<(PRIO[b]||0)){ terr[i]=T(rule[b]); changed=true; break; } }
    }
    if(!changed) break;
  }
}
/* A lone hex unlike all its neighbours joins the majority around it. */
function smoothSpecks(terr){
  const n=S.cols*S.rows, out=terr.slice();
  for(let i=0;i<n;i++){
    if(isWater(terr,i)) continue;
    const ns=nbs(i); if(ns.some(j=>terr[j]===terr[i])) continue;
    const cnt={}; let best=0, bv=0;
    ns.forEach(j=>{ if(isWater(terr,j)) return; cnt[terr[j]]=(cnt[terr[j]]||0)+1; if(cnt[terr[j]]>best){ best=cnt[terr[j]]; bv=terr[j]; } });
    if(best>=4) out[i]=bv;
  }
  terr.set(out);
}
/* Dry and humid tiles need room between them: any desert within two hexes of heavy forest, jungle or swamp
   becomes plain, so there is always a band of open ground before the sand. Oases inherit the gap because they
   are only ever placed deep inside a desert. */
const HUMID_GAP=3;
function bufferHumid(terr){
  const n=S.cols*S.rows, seeds=[];
  for(let i=0;i<n;i++){ const t=tid(terr,i); if(t==="heavy-forest"||t==="jungle"||t==="swamp") seeds.push([i,0]); }
  if(!seeds.length) return;
  const d=bfs(seeds), des=T("desert"), plain=T("plain");
  for(let i=0;i<n;i++) if(terr[i]===des&&d[i]>=0&&d[i]<HUMID_GAP) terr[i]=plain;
  // whatever sand is left must be part of a desert, not a single stray hex
  for(let i=0;i<n;i++) if(terr[i]===des&&!nbs(i).some(j=>terr[j]===des)) terr[i]=plain;
}
/* An oasis or two deep inside any desert. */
function placeOases(terr,rand){
  const n=S.cols*S.rows, des=T("desert"), cands=[];
  for(let i=0;i<n;i++) if(terr[i]===des&&nbs(i).filter(j=>terr[j]===des).length>=5) cands.push(i);
  let want=Math.min(2,Math.floor(cands.length/12+.5)); if(cands.length&&!want&&rand()<.3) want=1;
  shuffle(rand,cands).slice(0,want).forEach(i=>{ terr[i]=T("oasis"); });
}

/* ---- 4. points of interest ---------------------------------------------- */

const GROUP={capitol:"settle",city:"settle",town:"settle",port:"settle",keep:"castle",
             ruin:"wild",cave:"wild",tower:"wild",mine:"minor",temple:"minor",camp:"minor",mark:"minor",battle:"minor"};
/* What every hex is next to, computed once so the placement rules stay cheap. */
function contexts(terr,riverLand){
  const n=S.cols*S.rows, out=new Array(n);
  for(let i=0;i<n;i++){
    const ns=nbs(i).map(j=>tid(terr,j));
    out[i]={ id:tid(terr,i), sea:ns.includes("sea"), lake:ns.includes("lake"), mtn:ns.includes("mountain"),
             plains:ns.filter(t=>t==="plain").length, river:riverLand.has(i),
             riverNb:nbs(i).some(j=>riverLand.has(j)), edge:onEdge(i) };
  }
  return out;
}
/* How good a hex is to live on. */
function scoreSites(X,rand){
  const base={plain:3,oasis:2.5,forest:2,hills:1,tundra:.5,"heavy-forest":0,jungle:0};
  return X.map(x=>{
    if(!(x.id in base)) return -Infinity;
    return base[x.id]+(x.river?3:0)+(x.riverNb?2:0)+(x.lake?2:0)+(x.sea?2.5:0)+.4*x.plains-(x.edge?1:0)+.8*rand();
  });
}
/* Greedy spaced picks: best candidates first, each at least `dist(kindOfPlaced)` hexes from what is already down. */
function pickSpaced(cands,count,placed,dist,relax){
  const out=[];
  for(const i of cands){
    if(out.length>=count) break;
    const ok=placed.every(q=>hexDist(cr(i),cr(q.i))>=Math.max(1,(dist[GROUP[q.kind]]||1)-relax))
          && out.every(j=>hexDist(cr(i),cr(j))>=Math.max(1,(dist.self||1)-relax));
    if(ok) out.push(i);
  }
  return out;
}
/* Place one class of POI, relaxing the spacing once if the map is too tight. */
function placeClass(feat,placed,kind,cands,count,dist){
  if(count<=0||!cands.length) return;
  let got=pickSpaced(cands,count,placed,dist,0);
  if(got.length<count) got=got.concat(pickSpaced(cands.filter(i=>!got.includes(i)),count-got.length,placed.concat(got.map(i=>({i,kind}))),dist,1));
  got.forEach(i=>{ feat[i]=F_BY_ID[kind]||0; placed.push({i,kind}); });
}
/* Settlements, castles and wilderness sites, in order of importance. */
function placeFeatures(terr,X,score,rand,cfg){
  const n=S.cols*S.rows, feat=new Uint8Array(n), placed=[];
  const land=[]; for(let i=0;i<n;i++) if(!isWater(terr,i)) land.push(i);
  const L=land.length*cfg.poi;   // the "places" setting scales every count below
  const byScore=land.filter(i=>score[i]>-Infinity).sort((a,b)=>score[b]-score[a]);
  const cap= land.length>=60?1:0;
  placeClass(feat,placed,"capitol",byScore,cap,{settle:5,self:5});
  placeClass(feat,placed,"city",byScore,Math.min(2,Math.floor(L/160)),{settle:5,self:5});   // never more than two cities besides the capital
  placeClass(feat,placed,"town",byScore,Math.max(1,Math.round(L/38)-cap),{settle:4,self:4});
  // harbour towns: half the coastal towns become ports
  placed.forEach(q=>{ if(q.kind==="town"&&X[q.i].sea&&rand()<.5){ q.kind="port"; feat[q.i]=F_BY_ID.port||feat[q.i]; } });
  const cast=land.filter(i=>{ const t=X[i].id; return t==="hills"||t==="plain"||t==="forest"||t==="tundra"; })
    .map(i=>[i,(X[i].id==="hills"?3:0)+(X[i].sea||X[i].edge?1:0)+(X[i].river||X[i].riverNb?1:0)+rand()])
    .sort((a,b)=>b[1]-a[1]).map(a=>a[0]);
  placeClass(feat,placed,"keep",cast,Math.round(L/60),{settle:2,castle:3,self:3});
  const wild=Math.round(L/28), wildD={settle:3,castle:2,wild:2,self:2};
  const ruinD={settle:3,castle:2,wild:2,self:3};
  const campD={settle:2,castle:2,wild:2,minor:2,self:3};
  const pref=f=>shuffle(rand,land.filter(i=>!feat[i]&&f(X[i])));
  placeClass(feat,placed,"ruin", pref(x=>["forest","heavy-forest","desert","tundra","jungle"].includes(x.id)), Math.round(wild*.4), ruinD);
  placeClass(feat,placed,"cave", pref(x=>x.id==="hills"||(x.mtn&&x.id!=="mountain")), Math.round(wild*.35), wildD);
  const towerD={settle:2,castle:2,wild:2,self:4};
  placeClass(feat,placed,"tower",pref(x=>x.id==="hills"||(x.sea&&x.id!=="mountain")), wild-Math.round(wild*.4)-Math.round(wild*.35), towerD);
  const minorD={settle:2,castle:2,wild:2,minor:2,self:2};
  placeClass(feat,placed,"mine",  pref(x=>x.id==="hills"&&x.mtn), Math.round(L/90), minorD);
  placeClass(feat,placed,"temple",pref(x=>x.id==="forest"||x.id==="hills"), Math.round(L/100), minorD);
  placeClass(feat,placed,"camp",  pref(x=>["forest","heavy-forest","tundra","desert","jungle"].includes(x.id)), Math.round(L/150), campD);
  placeClass(feat,placed,"mark",  pref(x=>x.id==="mountain"||(x.id==="tundra"&&x.plains>=3)), Math.round(L/120), minorD);
  return { feat, placed };
}

/* ---- 5. roads ----------------------------------------------------------- */

/* A* over the grid from one hex to the first hex satisfying isGoal; null when unreachable. */
function astar(from,target,isGoal,cost){
  const n=S.cols*S.rows, g=new Float32Array(n).fill(Infinity), came=new Int32Array(n).fill(-1), closed=new Uint8Array(n), heap=[];
  const tc=cr(target); g[from]=0; hpush(heap,[hexDist(cr(from),tc)*.9,from]);
  while(heap.length){
    const [,i]=hpop(heap); if(closed[i]) continue; closed[i]=1;
    if(i!==from&&isGoal(i)){ const path=[]; for(let k=i;k!==-1;k=came[k]) path.push(k); return path.reverse(); }
    for(const j of nbs(i)){ const w=cost(j); if(!isFinite(w)) continue;
      const ng=g[i]+w; if(ng<g[j]){ g[j]=ng; came[j]=i; hpush(heap,[ng+hexDist(cr(j),tc)*.9,j]); } }
  }
  return null;
}
const STEP={plain:1,oasis:1,tundra:1.5,forest:2,desert:2,hills:3,"heavy-forest":4,jungle:4,swamp:5,mountain:12};
/* Roads as a spanning tree over the settlements, trails out to the wild sites, bridges where roads meet rivers. */
function buildRoads(terr,feat,placed,riverLand,rand,cfg){
  const paths=[], roadSet=new Set(), r=cfg.roads;
  if(r<=0) return paths;   // a roadless wilderness: no trunk, no spurs, no trails, no bridges
  // only the settlements form the trunk network; castles and ruins get spurs, never main roads between ruins
  const nodes=placed.filter(q=>GROUP[q.kind]==="settle").map(q=>q.i);
  const castles=placed.filter(q=>GROUP[q.kind]==="castle").map(q=>q.i);
  const ruins=new Set(placed.filter(q=>q.kind==="ruin").map(q=>q.i));
  const settle=new Set(nodes.concat(castles));
  const cost=(i,trail)=>{ const t=tid(terr,i); let w=STEP[t]; if(w===undefined) return Infinity;
    if(feat[i]&&!settle.has(i)) w+=3; if(riverLand.has(i)) w+=2; if(!trail&&roadSet.has(i)) w*=.3; return w; };
  const nearest=(i,set)=>{ let b=null; set.forEach(t=>{ if(b===null||hexDist(cr(t),cr(i))<hexDist(cr(b),cr(i))) b=t; }); return b; };
  if(nodes.length>=2){
    const done=[nodes[0]], todo=nodes.slice(1);
    while(todo.length){
      let bi=0, bj=done[0], bd=Infinity;
      todo.forEach((a,k)=>done.forEach(b=>{ if(ruins.has(a)&&ruins.has(b)) return; const d=hexDist(cr(a),cr(b)); if(d<bd){ bd=d; bi=k; bj=b; } }));
      const a=todo.splice(bi,1)[0];
      // below the halfway setting some links are simply never built, leaving towns off the network
      const p= rand()<Math.min(1,.5+r/100) ? astar(a,bj,i=>i===bj||roadSet.has(i),i=>cost(i,false)) : null;
      if(p&&p.length>=2){ paths.push({type:"road",hexes:p.map(cr)}); p.forEach(i=>roadSet.add(i)); }
      done.push(a);
    }
  }
  castles.forEach(i=>{
    const net=new Set([...roadSet,...nodes]); if(!net.size||rand()>=Math.min(1,.7*r/50)) return;
    const tgt=nearest(i,net); if(hexDist(cr(i),cr(tgt))>4) return;   // remote castles stay remote
    const p=astar(i,tgt,j=>roadSet.has(j)||nodes.includes(j),j=>cost(j,false));
    if(p&&p.length>=2&&p.length<=6){ paths.push({type:"road",hexes:p.map(cr)}); p.forEach(j=>roadSet.add(j)); }
  });
  const targets=new Set([...roadSet,...settle]);
  placed.filter(q=>["ruin","cave","mine","temple","camp"].includes(q.kind)).forEach(q=>{
    if(rand()>=Math.min(1,.3*r/50)||!targets.size) return;
    const tgt=nearest(q.i,targets); if(hexDist(cr(q.i),cr(tgt))>5) return;
    const p=astar(q.i,tgt,i=>roadSet.has(i)||settle.has(i),i=>cost(i,true));
    if(p&&p.length>=2&&p.length<=6) paths.push({type:"trail",hexes:p.map(cr)});
  });
  paths.forEach(path=>{
    if(path.type!=="road") return;
    let prev=false;
    path.hexes.forEach(([c,r],k)=>{
      const i=idx(c,r), here= k>0&&k<path.hexes.length-1&&riverLand.has(i)&&!feat[i]&&!prev&&rand()<.6;
      if(here) feat[i]=F_BY_ID.bridge||0;
      prev=here;
    });
  });
  if(rand()<.4){
    const cands=shuffle(rand,[...roadSet].filter(i=>tid(terr,i)==="plain"&&!feat[i]));
    for(const i of cands){ if(placed.every(q=>hexDist(cr(i),cr(q.i))>=2)){ feat[i]=F_BY_ID.battle||0; placed.push({i,kind:"battle"}); break; } }
  }
  return paths;
}

/* ---- 6. names ----------------------------------------------------------- */

/* Three name flavours; one is rolled per map so every place on the plate sounds like it belongs there. */
const FLAVOURS=[
  { onset:["Ash","Bram","Cold","Dun","Ely","Fen","Grim","Hart","Kings","Lang","Mere","Nor","Oak","Pen","Ravens","Stan","Thorn","Wel","Wick","Wood",
           "Ald","Bar","Cray","Dray","East","Fal","Gild","Hol","Ith","Kel","Lind","Marl","Nether","Ox","Ross","Sten","Tam","Ulver","West","Whit","Wyn","Yar","Black","Elm","Hazel","Row","Salt","Sud","Wither","Brack"],
    join:["","","","","","","en","ing"],
    town:["ford","ton","wick","by","ham","stead","bury","field","holm","dale","moor","thorpe","worth","wold","mere","bridge","cross","well","leigh","den","combe","cote","hurst","ley","ing","shaw","stow","wich"],
    grand:["minster","cester","chester","mouth","burgh","march","gate","hold","haven","ford"],
    keep:["{X} Keep","Castle {X}","{X} Hold","{X} Castle"], port:["Port {X}","{X}haven","{X}mouth","{X} Quay"],
    mine:["{X} Delve","{X} Pits","{X} Workings"], temple:["Shrine of {X}","{X} Abbey","{X} Priory"],
    ruin:["Ruins of {X}","Old {X}","Fallen {X}"], tower:["{X} Tower","{X} Watch"] },
  { onset:["Bjor","Dag","Eir","Fjal","Grim","Hal","Ing","Jor","Kald","Lund","Nord","Ran","Skar","Thor","Ulf","Vald","Ask","Bran","Frey","Gunn","Hav","Is","Kol","Lof","Mjol",
           "Odd","Rag","Sig","Stein","Tor","Var","Vig","Yng","Ost","Hel","Alf","Bor","Eld","Gud","Har","Kjel","Lang","Ny","Ros","Sol","Tind","Ulv","Vet"],
    join:["","","","","","a","e"],
    town:["vik","stad","heim","gard","nes","dal","holt","by","fjord","vang","mark","lund","berg","sund","strand","hamn","foss","tveit","hus","lid","vatn","skog","eng","haug"],
    grand:["borg","heim","gard","stad","havn","fjord","borg","vik"],
    keep:["{X} Borg","Castle {X}","{X} Hold","Borg {X}"], port:["Port {X}","{X}havn","{X} Harbour","{X}sund"],
    mine:["{X} Delve","{X} Gruve","{X} Pits"], temple:["Hof of {X}","Shrine of {X}","{X} Hof"],
    ruin:["Ruins of {X}","Old {X}","{X} Barrow"], tower:["{X} Tower","{X} Vard"] },
  { onset:["Aur","Bel","Cal","Dor","Ele","Fal","Gal","Ira","Lor","Mar","Nov","Ost","Pal","Ros","Sal","Tar","Val","Ver","Ald","Bri","Cas","Del","Est","Flor","Gra",
           "Hel","Ill","Lum","Mon","Nar","Or","Per","Quer","Sev","Tul","Vic","Zar","Am","Cor","Lus","Cel","Dam","Fer","Lav","Mir","Ol","Rav","Sil","Ter","Vol"],
    join:["","","","","en","an","in"],
    town:["ia","ium","ona","essa","anti","ara","oria","enza","etta","ino","ella","iano","ento","urra","ova","ica","ense","alia","ola","ate","orno","asca","iva","ume"],
    grand:["opolis","oria","ium","agne","anza","ia Magna","um","ossa"],
    keep:["Castel {X}","Rocca {X}","{X} Keep","Forte {X}"], port:["Porto {X}","Port {X}","{X} Marina","{X} Portus"],
    mine:["{X} Mines","{X} Delve","{X} Quarry"], temple:["Temple of {X}","Sanctum of {X}","{X} Sanctum"],
    ruin:["Ruins of {X}","Old {X}","{X} Antica"], tower:["{X} Tower","Torre {X}"] }
];
/* Names for the places worth naming, deduplicated and clipped to the label limit. */
function nameThings(placed,rand){
  const F=pick(rand,FLAVOURS), used=new Set(), labels={};
  const stem=grand=>{ for(let t=0;t<20;t++){ const s=pick(rand,F.onset)+pick(rand,F.join)+pick(rand,grand?F.grand:F.town);
    if(!used.has(s)){ used.add(s); return s; } } return pick(rand,F.onset)+pick(rand,F.town); };
  const fill=(tpl,grand)=>tpl.replace("{X}",stem(grand));
  placed.forEach(q=>{
    let name=null;
    switch(q.kind){
      case "capitol": case "city": name=stem(true); break;
      case "town":   name=stem(false); break;
      case "port":   name=fill(pick(rand,F.port),false); break;
      case "keep":   name=fill(pick(rand,F.keep),false); break;
      case "mine":   name=fill(pick(rand,F.mine),false); break;
      case "temple": name=fill(pick(rand,F.temple),false); break;
      case "ruin":   name=fill(pick(rand,F.ruin),false); break;
      case "tower":  name=fill(pick(rand,F.tower),false); break;
      case "cave":   name=fill(pick(rand,F.ruin),false); break;
      case "camp": case "battle": case "bridge": case "mark": name=stem(false); break;
    }
    if(name){ name=name.slice(0,28); labels[q.i]=name; used.add(name); }
  });
  return labels;
}

/* ---- 7. assembly -------------------------------------------------------- */

/* Run the whole pipeline for one seed; null means the attempt failed a sanity check and should be rerolled. */
function buildMap(seed){
  const rand=mulberry(seed), n=S.cols*S.rows, terr=new Uint8Array(n);
  const cfg=pickClimate(rand), period=Math.max(4,Math.round(Math.sqrt(n)/4));
  const e=shapeElevation(cfg,noiseField(rand,period));
  const seaLevel=cfg.coasts.length?1-cfg.landFrac:-1, sea=T("sea"), plain=T("plain");
  for(let i=0;i<n;i++) terr[i]= e[i]<seaLevel ? sea : plain;
  fixWaterBodies(terr,e,cfg.lakes>0);
  let seaCount=0; for(let i=0;i<n;i++) if(terr[i]===sea) seaCount++;
  if(cfg.coasts.length&&(seaCount===0||seaCount>(1-cfg.landFrac+.15)*n)) return null;
  const R=relief(terr,e,rand);
  placeLakes(terr,R,rand,cfg);
  const RV=carveRivers(terr,R,rand,cfg);
  const M=moisture(terr,R,RV.riverLand,cfg,rand);
  assignBiomes(terr,R,M,cfg,rand);
  repairAdjacency(terr); smoothSpecks(terr); bufferHumid(terr); smoothSpecks(terr); repairAdjacency(terr);
  placeOases(terr,rand);
  const landComps=components(i=>!isWater(terr,i)), landN=landComps.reduce((a,c)=>a+c.length,0);
  if(!landN||Math.max(...landComps.map(c=>c.length))<.5*landN) return null;
  if((cfg.lakes>0||cfg.rivers>0)&&!cfg.coasts.length&&!RV.paths.length&&!terr.some(v=>v===T("lake"))) return null;
  const X=contexts(terr,RV.riverLand), score=scoreSites(X,rand);
  const P=placeFeatures(terr,X,score,rand,cfg);
  if(!P.placed.some(q=>GROUP[q.kind]==="settle")) return null;
  const roads=buildRoads(terr,P.feat,P.placed,RV.riverLand,rand,cfg);
  return { terr, feat:P.feat, paths:RV.paths.concat(roads), labels:nameThings(P.placed,rand) };
}
/* The button: build on local arrays, then commit to S once, undoably. */
function generateMap(){
  const seed=(Math.random()*4294967296)>>>0; let m=null;
  for(let t=0;t<6&&!m;t++) m=buildMap((seed+t*7919)>>>0);
  if(!m){ showToast("Could not generate a map"); return; }
  push(); blank();
  S.terr.set(m.terr); S.feat.set(m.feat); S.paths=m.paths; S.labels=m.labels;
  closeInspector(); refresh(); store();
}

document.getElementById("gen").onclick=generateMap;

/* ---- 8. the settings popover -------------------------------------------- */

const GEN_FIELDS=[
  /* Water Features */
  { k:"lakes",     name:"Lakes",     hint:"how many inland lakes", group:"Water Features" },
  { k:"rivers",    name:"Rivers",    hint:"how many rivers run from the high ground", group:"Water Features" },
  { k:"sea",       name:"Sea",       hint:"share of the sheet under open water", group:"Water Features" },
  /* Terrain */
  { k:"desert",    name:"Desert",    hint:"chance and extent of dry land", group:"Terrain" },
  { k:"forest",    name:"Forest",    hint:"how readily damp ground grows trees", group:"Terrain" },
  { k:"mountains", name:"Mountains",  hint:"how much of the land is hills and peaks", group:"Terrain" },
  /* Civilization */
  { k:"poi",       name:"Places",    hint:"settlements and points of interest per hex", group:"Civilization" },
  { k:"roads",     name:"Roads",     hint:"how much of the kingdom is linked by road", group:"Civilization" }
];
const GEN_CHOICES=[
  { k:"climate", name:"Climate", hint:"picking a climate retunes every slider above",
    opts:[["temperate","Temperate"],["hot","Hot"],["cold","Cold"]] },
  { k:"coast",   name:"Coast",   hint:"whether the sheet meets the sea",
    opts:[["Standard","Standard"],["coastal","Always coastal"],["landlocked","Landlocked"]] }
];
const panel=document.getElementById("genPanel"), gearBtn=document.getElementById("genOpts");
/* Build the popover once: a slider per percentage, a select per choice, and a reset button. */
function buildGenPanel(){
  if(!panel) return;
  panel.innerHTML="";
  const hd=document.createElement("div"); hd.className="ghd";
  hd.innerHTML='<h2>Random map</h2><button class="btn" type="button" id="genReset">Reset</button>';
  panel.appendChild(hd);
  // the groups sit side by side as columns, so the card is wide rather than tall
  const cols=document.createElement("div"); cols.className="gen-cols"; panel.appendChild(cols);
  const groups={};
  const groupEl=name=>{
    if(!groups[name]){
      const grp=document.createElement("div"); grp.className="gen-group";
      grp.innerHTML='<div class="gen-group-hd">'+name+'</div>';
      cols.appendChild(grp); groups[name]=grp;
    }
    return groups[name];
  };
  GEN_FIELDS.forEach(f=>{
    const row=document.createElement("div"); row.className="row"; row.title=f.hint;
    row.innerHTML='<label for="gen_'+f.k+'">'+f.name+'</label><input type="range" id="gen_'+f.k+'" min="0" max="100" step="2" /><output id="genOut_'+f.k+'"></output>';
    groupEl(f.group).appendChild(row);
    row.querySelector("input").oninput=e=>{ S.gen[f.k]=+e.target.value; row.querySelector("output").textContent=e.target.value+"%"; store(); };
  });
  // the world-wide choices run along the bottom, under the columns
  const world=document.createElement("div"); world.className="gen-world";
  world.innerHTML='<div class="gen-group-hd">World</div>';
  panel.appendChild(world);
  GEN_CHOICES.forEach(f=>{
    const row=document.createElement("div"); row.className="row"; row.title=f.hint;
    row.innerHTML='<label for="gen_'+f.k+'">'+f.name+'</label><select id="gen_'+f.k+'">'+f.opts.map(o=>'<option value="'+o[0]+'">'+o[1]+'</option>').join("")+'</select>';
    world.appendChild(row);
    row.querySelector("select").onchange=e=>{
      S.gen[f.k]=e.target.value;
      // a climate carries a whole landscape with it, so the sliders follow the choice
      if(f.k==="climate"&&CLIMATE_PRESETS[e.target.value]) Object.assign(S.gen,CLIMATE_PRESETS[e.target.value]);
      // landlocked means no sea
      if(f.k==="coast"&&e.target.value==="landlocked") S.gen.sea=0;
      syncGenPanel(); store();
    };
  });
  const note=document.createElement("div"); note.className="note";
  note.textContent="Settings apply to the next Generate and are saved with the plate.";
  panel.appendChild(note);
  document.getElementById("genReset").onclick=()=>{ S.gen=Object.assign({},GEN_DEFAULTS); syncGenPanel(); store(); };
}
/* Push S.gen into the controls, e.g. after a plate is imported. */
function syncGenPanel(){
  if(!panel||!panel.firstChild) return;
  if(!S.gen) S.gen=Object.assign({},GEN_DEFAULTS);
  GEN_FIELDS.forEach(f=>{ const v=S.gen[f.k]!==undefined?S.gen[f.k]:GEN_DEFAULTS[f.k];
    document.getElementById("gen_"+f.k).value=v; document.getElementById("genOut_"+f.k).textContent=v+"%"; });
  GEN_CHOICES.forEach(f=>{ const sel=document.getElementById("gen_"+f.k), v=S.gen[f.k];
    sel.value= f.opts.some(o=>o[0]===v) ? v : GEN_DEFAULTS[f.k]; });
}
/* Show or hide the dropdown. It hangs from the whole Generate Map split
   control, left-aligned with it; if there is no room below it opens above. */
function toggleGenPanel(open){
  if(!panel) return;
  if(open===undefined) open=!panel.classList.contains("on");
  panel.classList.toggle("on",open); gearBtn.setAttribute("aria-expanded",open);
  if(!open) return;
  syncGenPanel();
  const r=(gearBtn.closest(".split")||gearBtn).getBoundingClientRect();
  const w=panel.offsetWidth, h=panel.offsetHeight;
  let left=Math.max(8,Math.min(innerWidth-w-8, r.left));
  let top=r.bottom+8;
  if(top+h>innerHeight-8 && r.top-8-h>=8) top=r.top-8-h;
  top=Math.max(8,Math.min(innerHeight-h-8, top));
  panel.style.top=top+"px"; panel.style.left=left+"px";
}
buildGenPanel(); syncGenPanel();
if(gearBtn) gearBtn.onclick=()=>toggleGenPanel();
// click anywhere else, or press Escape, to dismiss
addEventListener("mousedown",e=>{ if(panel.classList.contains("on")&&!panel.contains(e.target)&&!gearBtn.contains(e.target)) toggleGenPanel(false); });
addEventListener("keydown",e=>{ if(e.key==="Escape"&&panel.classList.contains("on")) toggleGenPanel(false); });
window.syncGenPanel=syncGenPanel;   // exporting.js calls it from syncRail after an import

})();
