/* --------------------------------------------------------------------------
   edits.js

   Applying a tool to the grid: painting, erasing and flood fill.

   Uses:
     features.js           F_BY_ID
     geometry.js           disc, idx, neighbours
     state.js              S, brush, curF, curT, tool
     terrains.js           T_BY_ID
   -------------------------------------------------------------------------- */
"use strict";

/* Apply the active tool at (c,r) across the brush area. Returns true if anything actually changed. */
function apply(c,r,erase){
  const cells=(tool==="paint"||tool==="erase"||erase) ? disc(c,r,brush) : [[c,r]];
  let changed=false;
  if(erase||tool==="erase"){
    cells.forEach(([cc,rr])=>{ const i=idx(cc,rr);
      if(S.terr[i]||S.feat[i]||S.labels[i]||S.memo[i]) changed=true;
      S.terr[i]=0; S.feat[i]=0; delete S.labels[i]; delete S.memo[i];
    });
  } else if(tool==="paint"){
    const v=T_BY_ID[curT];
    cells.forEach(([cc,rr])=>{ const i=idx(cc,rr); if(S.terr[i]!==v){ S.terr[i]=v; changed=true; } });
  } else if(tool==="feature"){
    const i=idx(c,r), v=F_BY_ID[curF];
    S.feat[i] = S.feat[i]===v ? 0 : v; changed=true;
  } else if(tool==="fill"){
    changed=flood(c,r);
  }
  return changed;
}
/* Flood-fill the contiguous run of same-terrain hexes starting at (c,r). */
function flood(c,r){
  const from=S.terr[idx(c,r)], to=T_BY_ID[curT];
  if(from===to) return false;
  const st=[[c,r]], seen=new Set([idx(c,r)]);
  while(st.length){
    const [cc,rr]=st.pop(); S.terr[idx(cc,rr)]=to;
    neighbours(cc,rr).forEach(([nc,nr])=>{
      const ni=idx(nc,nr);
      if(!seen.has(ni)&&S.terr[ni]===from){ seen.add(ni); st.push([nc,nr]); }
    });
  }
  return true;
}
