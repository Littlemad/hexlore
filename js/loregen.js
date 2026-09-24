/* --------------------------------------------------------------------------
   loregen.js

   Invents a short world history for the current map from its named places:
   a timeline of ages and headline events, plus one written entry per place.
   It lives inside the Lore tab (lore.js) — the "Generate Lore" button sits
   in the Lore tab's own rail panel, and buildLore() calls back in here for
   a full-width timeline block and per-hex history text.

   The chronicle is plate state (S.chronicle): it is saved with the plate,
   restored by hydrate() through validChronicle(), snapshotted for undo, and
   cleared by blank(). Its shape:
     { title, total, ages:[{name,start,end,events:[{year,text,i}]}],
       places:{ [hex]: {name,kind,year,text} } }
   Age names and events are editable in place from the Lore tab; the place
   entries are edited through the hex inspector like any other note.

   Uses:
     exporting.js   showToast
     features.js    FEATURES
     history.js     push
     inspector.js   openInspector
     lore.js        el, syncLore
     state.js       S, sel
     storage.js     store
   -------------------------------------------------------------------------- */
"use strict";

/* ---- small local helpers (own copies, same idea as mapgen.js's private ones) */

function mulberry(a){ return ()=>{ a=(a+0x6D2B79F5)|0; let t=Math.imul(a^a>>>15,a|1);
  t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
function pick(rand,a){ return a[Math.floor(rand()*a.length)]; }

/* ---- word banks ----------------------------------------------------------- */

const AGE_WORDS=["Settling","Iron","Kings","Storms","Silence","Embers","Sundering","Bloom",
  "Ash","Tides","Wolves","Stone","Shadow","Harvest","Rust","Wandering",
  "Salt","Crows","Lanterns","Thorns","Bronze","Frost","the Long Rains","Banners","Ravens","Oaths",
  "Gold","Plenty","the Wandering Star","Reckoning","Smoke","Kettles","Bells","Mending","Ruin","Ivory",
  "the Quiet Kings","Hunger","Charters","the Red Moon","Roads","Amber","Widows","Sowing","Fire","Dust",
  "Antlers","Sails","the Grey Coast","Founding","the Broken Crown","Honey","Tallow","Bramble"];
const GIVEN=["Bram","Alder","Ysolde","Corwin","Maren","Thessaly","Hobb","Ingra","Eldric","Sable",
  "Perrin","Odile","Garrick","Wren","Bastian","Liora","Torvald","Mira","Aldous","Senna",
  "Doran","Kestrel","Halvard","Aveline","Roswen","Cael","Isolt","Brynn","Osric","Tamsin"];
const BYNAME=["the Bold","the Grey","the Elder","Stonehand","Ashfall","the Wanderer","the Quiet",
  "One-Eye","the Tall","Longshadow","the Just","Ironjaw","the Younger","Fairweather","the Cunning",
  "Oakheart","the Red","Thistledown","the Patient","Hollowbrook"];
const DEITY=["the Deep Mother","Kell of the Grain","the Silent Warden","Marrow","the Nine-Fold Flame",
  "the Weaver","Old Barrow","the Salt Father","Vessa of the Tides","the Watcher Above","Ember-Kin","the Grey Judge"];
const RUIN_CAUSE=["a creeping plague","a long siege that no relief ever broke","a night the granaries burned",
  "a curse laid on it by a wronged hedge-witch","a famine that emptied every hall","a war with the folk of the hills",
  "the slow creep of the swamp","an earthquake that swallowed its halls whole","a betrayal from within its own walls",
  "the beasts that came down from the peaks one winter","a winter no stores could outlast","a flood that never fully receded",
  "rot that got into the grain stores","a rival house's long grudge"];
const BEAST=["a wyrm coiled in the dark","a clan of goblins","a bear the size of a cart","a nest of giant spiders",
  "an old, half-blind troll","a pack of shadow-wolves","something with too many eyes that no one has named",
  "a brood of cave-lurking serpents","a hermit who answers no one","bats that never seem to leave"];
const TRIBE=["hide-runners","the reed folk","antler-clan hunters","the ash-wanderers","salt-traders",
  "the long-walkers","charcoal burners","the moss-kin","tinkers who pass through every autumn","goat-herders from the high country"];
const FOE=["raiders off the coast","a rival claimant to the throne","the hill-folk","a mercenary company gone unpaid",
  "a neighbouring lord's levy","outlaws grown bold","a border lord's private army","a warband that came down from the north",
  "a merchant house's hired swords"];
const THREAT=["raiders","the beasts of the wild","a rival lord","bandits on the old road","something out of the deep woods",
  "reavers from across the water","a hungry winter's desperate poor","a claimant with an old grudge","whatever comes down from the hills after dark"];
const GOODS=["wool","amber","salt fish","timber","iron ore","dyed cloth","furs","tallow","dried fruit","copper","millstones","pitch and rope"];

/* ---- place classification --------------------------------------------------
   Kind comes from the placed point of interest; a hand-labelled hex with no
   feature reads as a generic landmark rather than being skipped. */
function kindOf(i){ const f=S.feat[i]; return f?FEATURES[f-1].id:"mark"; }

/* ---- age & timeline assembly ------------------------------------------------ */

function shuffle(rand,a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

/* Carve the (year-sorted) timeline into ages so that every age has something
   recorded in it: an age is a run of events, and its boundary year falls in
   the gap before the next age's first event. No events, no ages. */
function buildAges(rand,total,timeline){
  if(!timeline.length) return [];
  const n=Math.max(1,Math.min(4,Math.floor(timeline.length/3)));
  // cut after these indices, nudged forward so a cut never splits a shared year
  const cuts=[];
  for(let k=1;k<n;k++){
    let c=Math.floor(k*timeline.length/n)-1;
    while(c<timeline.length-1&&timeline[c+1].year===timeline[c].year) c++;
    if(c<timeline.length-1&&!cuts.includes(c)) cuts.push(c);
  }
  const names=shuffle(rand,AGE_WORDS.slice()), ages=[];
  let start=1, from=0;
  cuts.concat(timeline.length-1).forEach((c,k)=>{
    const events=timeline.slice(from,c+1), last=c===timeline.length-1;
    const lo=events[events.length-1].year, hi=last?total:timeline[c+1].year-1;
    const end=last?total:lo+Math.floor(rand()*(hi-lo+1));
    ages.push({name:"The Age of "+names[k], start, end, events});
    start=end+1; from=c+1;
  });
  return ages;
}
/* A year drawn with a bias toward the early (early=true) or late half of the timeline. */
function biasedYear(rand,total,early){
  const f=early ? rand()*rand()*0.7 : 1-rand()*rand()*0.8;
  return Math.max(1,Math.min(total,Math.round(f*total)));
}

/* ---- per-kind history text --------------------------------------------------
   Each kind offers several unrelated little "recipes"; one is rolled per
   place so two towns on the same map rarely read the same way. */

/* A named founder, usually with an epithet but not always — plain names read
   more common-born, epithets more storied. */
function founderName(rand){ return rand()<0.75 ? pick(rand,GIVEN)+" "+pick(rand,BYNAME) : pick(rand,GIVEN); }

const RECIPES={
  capitol:[
    (name,founder,neighbour,year)=>({
      text:`Founded in Year ${year} by ${founder}, ${name} was raised as the seat of the realm`
        +(neighbour?`, its lords later laying claim over ${neighbour} and the lands between.`:"."),
      headline:`${founder} founds ${name} and calls it the seat of the realm.`}),
    (name,founder,neighbour,year)=>({
      text:`The throne moved to ${name} in Year ${year}, ${founder} judging the old seat too exposed to hold`
        +(neighbour?`, and ${neighbour} was the first to send tribute to the new court.`:"."),
      headline:`${founder} moves the throne to ${name}.`}),
    (name,founder,neighbour,year)=>({
      text:`When the old line failed, ${founder} was raised up in Year ${year} and made ${name} the new seat of power`
        +(neighbour?`, binding ${neighbour} to it within the decade.`:"."),
      headline:`${founder} is raised up and makes ${name} the seat of power.`}),
  ],
  city:[
    (name,founder,neighbour,year)=>({
      text:`${name} began as a trading stop under ${founder} in Year ${year}, and grew fat enough on tolls and trade`
        +(neighbour?` with ${neighbour}`:"")+` to be called a city within two generations.`,
      headline:`${founder} lays the first stones of ${name}.`}),
    (name,founder,neighbour,year,goods)=>({
      text:`${founder} chartered ${name} in Year ${year} on the strength of the ${goods} trade`
        +(neighbour?`, and its markets soon outgrew those of ${neighbour}.`:", and its markets soon outgrew every rival for miles."),
      headline:`${founder} charters ${name} on the ${goods} trade.`}),
    (name,founder,neighbour,year)=>({
      text:`What is now ${name} was a cluster of guildhalls before Year ${year}, when ${founder} walled it `
        +`and gave it a charter of its own`+(neighbour?`, much to the annoyance of ${neighbour}.`:"."),
      headline:`${founder} walls ${name} and grants it a charter.`}),
  ],
  town:[
    (name,founder,neighbour,year)=>({
      text:`${founder} settled ${name} in Year ${year}, little more than a handful of houses at first`
        +(neighbour?`, kept alive by the road to ${neighbour}.`:", kept alive by whoever passed through."),
      headline:`${founder} settles ${name}.`}),
    (name,founder,neighbour,year)=>({
      text:`${name} grew up around a well ${founder} dug in Year ${year}`
        +(neighbour?`, at the point where the old track to ${neighbour} crossed the stream.`:", where an old track crossed the stream."),
      headline:`${founder} digs the well that becomes ${name}.`}),
    (name,founder,neighbour,year)=>({
      text:`A handful of families under ${founder} broke ground at ${name} in Year ${year}`
        +(neighbour?`, tenants of the lords of ${neighbour} looking for better land.`:", looking for better land than they had."),
      headline:`${founder} breaks ground at ${name}.`}),
  ],
  port:[
    (name,founder,neighbour,year)=>({
      text:`${name} grew up around a jetty ${founder} drove into the shallows in Year ${year}, `
        +`and has lived off the tide ever since.`,
      headline:`${founder} drives the first pilings of ${name}'s harbour.`}),
    (name,founder,neighbour,year,goods)=>({
      text:`${founder} founded ${name} in Year ${year} to land the ${goods} coming off the boats`
        +(neighbour?`, and it has undercut ${neighbour}'s own harbour ever since.`:", and it has undercut every harbour nearby ever since."),
      headline:`${founder} founds ${name} to land the ${goods} trade.`}),
    (name,founder,neighbour,year)=>({
      text:`A wreck washed in during Year ${year} gave ${founder} the timbers to build ${name}'s first quay`
        +(neighbour?`, and boats bound for ${neighbour} have called there since.`:", and boats have called there ever since."),
      headline:`${founder} builds ${name}'s first quay from a wreck's timbers.`}),
  ],
  keep:[
    (name,founder,neighbour,year,threat)=>({
      text:`${founder} raised ${name} in Year ${year} to hold the land against ${threat}, `
        +`and it has changed hands more than once since.`,
      headline:`${founder} raises ${name} against ${threat}.`}),
    (name,founder,neighbour,year,threat)=>({
      text:`${name} started as a wooden palisade in Year ${year}, thrown up by ${founder} in a hurry against ${threat}, `
        +`and was rebuilt in stone once the danger proved to be lasting.`,
      headline:`${founder} throws up the palisade that becomes ${name}.`}),
    (name,founder,neighbour,year,threat)=>({
      text:`${founder} won ${name} in Year ${year} from whoever held it before, and has kept it walled ever since against ${threat}`
        +(neighbour?`, much to the discomfort of ${neighbour}.`:"."),
      headline:`${founder} takes ${name} and walls it against ${threat}.`}),
  ],
  tower:[
    (name,founder,neighbour,year,threat)=>({
      text:`${name} was built by ${founder} in Year ${year} to watch the country for ${threat}, `
        +`and its lamp is said to still be lit some nights.`,
      headline:`${name} is built to watch the country for ${threat}.`}),
    (name,founder,neighbour,year,threat)=>({
      text:`${founder} climbed the rise at ${name} in Year ${year} and never really came down, keeping a lonely `
        +`watch for ${threat} ever since.`,
      headline:`${founder} keeps a lonely watch from ${name}.`}),
    (name,founder,neighbour,year,threat)=>({
      text:`A beacon has stood at ${name} since Year ${year}, when ${founder} first lit it to warn of ${threat}`
        +(neighbour?`; ${neighbour} still watches for its fire.`:"."),
      headline:`${founder} lights the first beacon at ${name}.`}),
  ],
  temple:[
    (name,founder,neighbour,year,deity)=>({
      text:`Consecrated to ${deity} in Year ${year}, ${name} has drawn pilgrims ever since, `
        +`most asking for little more than a safe harvest.`,
      headline:`${name} is consecrated to ${deity}.`}),
    (name,founder,neighbour,year,deity)=>({
      text:`${founder} built ${name} in Year ${year} after a vision of ${deity}, and the shrine has kept `
        +`its own small order of keepers ever since.`,
      headline:`${founder} builds ${name} after a vision of ${deity}.`}),
    (name,founder,neighbour,year,deity)=>({
      text:`A hermit's cairn at ${name} became a proper shrine to ${deity} in Year ${year}, once `
        +`enough pilgrims had worn a path to it to justify a roof.`,
      headline:`The cairn at ${name} becomes a shrine to ${deity}.`}),
  ],
  mine:[
    (name,founder,neighbour,year)=>({
      text:`${founder} struck a rich seam at ${name} in Year ${year}, and the diggings have never quite run dry.`,
      headline:`${founder} strikes a rich seam at ${name}.`}),
    (name,founder,neighbour,year)=>({
      text:`${name} was opened in Year ${year} and abandoned within a decade, after a fall underground took eleven diggers.`,
      headline:`A fall underground at ${name} takes eleven diggers.`}),
    (name,founder,neighbour,year)=>({
      text:`${founder} leased the workings at ${name} from the crown in Year ${year}, and the ore from it has `
        +`paid for more than one war since.`,
      headline:`${founder} leases the workings at ${name} from the crown.`}),
  ],
  ruin:[
    (name,founder,neighbour,foundYear,year,cause)=>({
      text:`${name} once stood whole, founded in Year ${foundYear} by ${founder}, until ${cause} `
        +`left it to the weather in Year ${year}. Little remains but foundations and a name.`,
      headline:`${name} falls, undone by ${cause}.`}),
    (name,founder,neighbour,foundYear,year,cause)=>({
      text:`${founder} built ${name} up from Year ${foundYear} onward, but ${cause} emptied it by Year ${year}`
        +(neighbour?`, and its stones have since been carried off to build up ${neighbour}.`:", and its stones have since been carried off by anyone passing."),
      headline:`${name} is emptied by ${cause}.`}),
    (name,founder,neighbour,foundYear,year,cause)=>({
      text:`What ${founder} raised at ${name} in Year ${foundYear} lasted only until Year ${year}, when `
        +`${cause} put an end to it; locals still leave offerings at the gate.`,
      headline:`${name} meets its end: ${cause}.`}),
  ],
  battle:[
    (name,founder,neighbour,year,threat,foe)=>({
      text:`In Year ${year}, ${name} saw a battle fought against ${foe}`
        +(neighbour?`, the dead from both sides later given a common grave outside ${neighbour}.`:", and the field has never grown quite even since."),
      headline:`Battle fought at ${name} against ${foe}.`}),
    (name,founder,neighbour,year,threat,foe)=>({
      text:`${name} takes its grim reputation from Year ${year}, when a force met ${foe} there and neither side `
        +`could rightly claim to have won.`,
      headline:`An indecisive battle is fought at ${name} against ${foe}.`}),
    (name,founder,neighbour,year,threat,foe)=>({
      text:`The fields around ${name} were fought over in Year ${year} against ${foe}`
        +(neighbour?`; the survivors are said to have limped back toward ${neighbour}.`:"; the survivors scattered in every direction."),
      headline:`${name} is fought over against ${foe}.`}),
  ],
  bridge:[
    (name,founder,neighbour,year)=>({
      text:`${founder} raised ${name} in Year ${year} to carry the road over the water`
        +(neighbour?`, shortening the way to ${neighbour} by the better part of a day.`:"."),
      headline:`${founder} raises ${name} to carry the road over the water.`}),
    (name,founder,neighbour,year)=>({
      text:`Before ${name} was built in Year ${year}, the crossing was a ford that flooded every spring; `
        +`${founder} paid for the stonework out of pocket`+(neighbour?` to keep the road to ${neighbour} open.`:"."),
      headline:`${founder} pays for ${name} to replace the old flooding ford.`}),
    (name,founder,neighbour,year)=>({
      text:`${name} replaced a rope bridge in Year ${year}, ${founder} having grown tired of losing carts to the river`
        +(neighbour?` on the way to ${neighbour}.`:"."),
      headline:`${founder} replaces the rope bridge with ${name}.`}),
  ],
};

function writeEntry(kind,name,rand,total,otherNames){
  const founder=founderName(rand);
  const neighbour=otherNames.length ? pick(rand,otherNames) : null;
  let year, text, headline=null;
  switch(kind){
    case "capitol": case "bridge": case "town":
      year=biasedYear(rand,total,true);
      ({text,headline}=pick(rand,RECIPES[kind])(name,founder,neighbour,year));
      break;
    case "city": case "port":
      year=biasedYear(rand,total,true);
      ({text,headline}=pick(rand,RECIPES[kind])(name,founder,neighbour,year,pick(rand,GOODS)));
      break;
    case "keep": case "tower":
      year=biasedYear(rand,total,false);
      ({text,headline}=pick(rand,RECIPES[kind])(name,founder,neighbour,year,pick(rand,THREAT)));
      break;
    case "temple":
      year=biasedYear(rand,total,true);
      ({text,headline}=pick(rand,RECIPES.temple)(name,founder,neighbour,year,pick(rand,DEITY)));
      break;
    case "mine":
      year=biasedYear(rand,total,false);
      ({text,headline}=pick(rand,RECIPES.mine)(name,founder,neighbour,year));
      break;
    case "ruin":
      { const foundYear=biasedYear(rand,total,true);
        year=Math.max(foundYear+Math.round(total*0.08),Math.min(total,foundYear+10+Math.floor(rand()*(total-foundYear))));
        ({text,headline}=pick(rand,RECIPES.ruin)(name,founder,neighbour,foundYear,year,pick(rand,RUIN_CAUSE))); }
      break;
    case "cave":
      year=biasedYear(rand,total,false);
      text= rand()<0.5
        ? `${name} was surveyed and mapped in Year ${year}. Locals say it is home to ${pick(rand,BEAST)}, `
          +`and no one has gone in far enough to say they are wrong.`
        : `Something has been living at ${name} since long before Year ${year}, when the last group brave enough to `
          +`look found only ${pick(rand,BEAST)} for their trouble.`;
      break;
    case "camp":
      year=biasedYear(rand,total,false);
      text= rand()<0.5
        ? `${name} has been used as a seasonal camp by ${pick(rand,TRIBE)} for longer than anyone can date, `
          +`the fire-rings older than the eldest name for it.`
        : `${pick(rand,TRIBE)} still pass through ${name} most years, pitching camp exactly where their `
          +`grandparents did in Year ${year}.`;
      break;
    case "battle":
      year=biasedYear(rand,total,false);
      ({text,headline}=pick(rand,RECIPES.battle)(name,founder,neighbour,year,null,pick(rand,FOE)));
      break;
    default:
      year=biasedYear(rand,total,false);
      text= rand()<0.5
        ? `No one now living can say who raised ${name} or why, only that it has stood since before living memory.`
        : `${name} predates every record the realm keeps; even its name has outlived whoever gave it.`;
  }
  return {year,text,headline};
}

/* ---- chronicle assembly ---------------------------------------------------- */

function generateChronicle(){
  const rand=mulberry((Math.random()*4294967296)>>>0);
  const named=[]; for(let i=0;i<S.cols*S.rows;i++) if(S.labels[i]) named.push(i);
  if(!named.length){ S.chronicle=null; return; }
  const total=340+Math.floor(rand()*380);
  const otherNames=named.map(i=>S.labels[i]);
  const timeline=[], places={};
  named.forEach(i=>{
    const kind=kindOf(i), name=S.labels[i];
    const others=otherNames.filter(n=>n!==name);
    const {year,text,headline}=writeEntry(kind,name,rand,total,others);
    places[i]={name,kind,year,text};
    if(headline) timeline.push({year,text:headline,i});
  });
  timeline.sort((a,b)=>a.year-b.year);
  S.chronicle={title:"The Chronicle of "+(S.title||"the Realm"),total,ages:buildAges(rand,total,timeline),places};
}

/* The chronicle out of a loaded file, or null if it isn't one we can use.
   Strings are clipped, years are integers, events must point at a hex on the
   grid and their place must be in the places map. */
function validChronicle(c,n){
  if(!c||typeof c!=="object"||!Array.isArray(c.ages)||!c.places||typeof c.places!=="object") return null;
  const total=Math.max(1,c.total|0), places={};
  for(const k in c.places){
    const p=c.places[k];
    if(+k<n&&p&&typeof p.text==="string") places[k]={name:String(p.name||"").slice(0,28),kind:String(p.kind||"mark"),year:p.year|0,text:p.text.slice(0,1200)};
  }
  const ages=c.ages.filter(a=>a&&Array.isArray(a.events)).map(a=>({
    name:String(a.name||"").slice(0,60), start:a.start|0, end:a.end|0,
    events:a.events.filter(e=>e&&typeof e.text==="string"&&places[e.i]).map(e=>({year:e.year|0,text:e.text.slice(0,400),i:e.i|0}))
  })).filter(a=>a.events.length);
  return {title:String(c.title||"").slice(0,80),total,ages,places};
}

/* ---- what buildLore() (lore.js) reads back from this file ------------------ */

/* The generated history for hex i, or null when there is no chronicle / i wasn't named. */
function chronicleEntry(i){ return S.chronicle ? S.chronicle.places[i]||null : null; }

/* One event's sentence, with the place it concerns turned into a link that
   opens that hex's record. Headlines name their own place exactly once. */
function eventText(e){
  const p=el("p",""), place=S.chronicle.places[e.i], at=place?e.text.indexOf(place.name):-1;
  if(at<0){ p.textContent=e.text; return p; }
  p.appendChild(document.createTextNode(e.text.slice(0,at)));
  const link=el("span","lg-place",place.name); link.setAttribute("role","link"); link.tabIndex=0;
  const open=()=>{ sel=e.i; openInspector(); };
  link.addEventListener("click",open);
  link.addEventListener("keydown",ev=>{ if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); open(); } });
  p.appendChild(link);
  p.appendChild(document.createTextNode(e.text.slice(at+place.name.length)));
  return p;
}

/* ---- editing in place --------------------------------------------------------
   A ✎ button swaps a line for input fields; Enter or leaving the line saves
   (undoably, then stored), Esc puts the line back as it was. */

/* The ✎ button, same as the one on the place cards. */
function editButton(title,onclick){
  const b=el("button","lore-edit","✎"); b.type="button"; b.title=title;
  b.addEventListener("click",e=>{ e.stopPropagation(); onclick(); });
  return b;
}
/* Wire a row of inputs: `save` on Enter or when focus leaves the row, `cancel` on Esc. */
function wireEditor(row,inputs,save,cancel){
  let done=false;
  const finish=fn=>{ if(done) return; done=true; fn(); };
  inputs.forEach(inp=>inp.addEventListener("keydown",e=>{
    if(e.key==="Enter"){ e.preventDefault(); finish(save); }
    else if(e.key==="Escape"){ e.preventDefault(); finish(cancel); }
  }));
  row.addEventListener("focusout",e=>{ if(!row.contains(e.relatedTarget)) finish(save); });
  inputs[0].focus(); inputs[0].select();
}
function textInput(value,cls){ const i=el("input",cls); i.type="text"; i.value=value; return i; }
/* Commit an edit to the chronicle and redraw the Lore page. */
function commit(mutate){ push(); mutate(); store(); syncLore(); }

/* The heading of one age, or its editor. */
function ageHeading(age){
  const hd=el("div","lg-age");
  const years=()=>el("span","lg-age-years","— Years "+age.start+"–"+age.end);
  hd.appendChild(el("span","lg-age-name",age.name));
  hd.appendChild(years());
  hd.appendChild(editButton("Rename this age",()=>{
    const inp=textInput(age.name,"lg-input"); inp.maxLength=60;
    hd.replaceChildren(inp,years());
    wireEditor(hd,[inp],
      ()=>{ const v=inp.value.trim(); if(v&&v!==age.name) commit(()=>{ age.name=v; }); else syncLore(); },
      syncLore);
  }));
  return hd;
}
/* One event's row, or its editor. */
function eventRow(age,e){
  const row=el("div","lg-event");
  row.appendChild(el("span","lg-year","Year "+e.year));
  row.appendChild(eventText(e));
  row.appendChild(editButton("Edit this event",()=>{
    const yr=textInput(e.year,"lg-input lg-input-year"); yr.inputMode="numeric";
    const tx=textInput(e.text,"lg-input"); tx.maxLength=400;
    row.replaceChildren(yr,tx);
    wireEditor(row,[tx,yr],()=>{
      const text=tx.value.trim(), year=Math.max(age.start,Math.min(age.end,parseInt(yr.value,10)||e.year));
      if(!text||(text===e.text&&year===e.year)){ syncLore(); return; }
      // the year stays inside its age, so the ages never overlap or go empty
      commit(()=>{ e.text=text; e.year=year; age.events.sort((a,b)=>a.year-b.year); });
    },syncLore);
  }));
  return row;
}

/* A full-width block for the top of the Lore page: the age-by-age timeline.
   Null when there is no chronicle, or nothing in it was headline-worthy
   (a map of only caves, camps and landmarks). */
function buildChronicleTimeline(){
  if(!S.chronicle||!S.chronicle.ages.length) return null;
  const tl=el("div","lg-timeline");
  S.chronicle.ages.forEach(age=>{
    tl.appendChild(ageHeading(age));
    age.events.forEach(e=>tl.appendChild(eventRow(age,e)));
  });
  return tl;
}

/* Generate Lore needs named places to work with: if the sheet is still blank,
   generate a map first (the same button #gen does), then chronicle it. */
document.getElementById("genLore").onclick=()=>{
  if(!Object.keys(S.labels).length) document.getElementById("gen").click();
  if(!Object.keys(S.labels).length){ showToast("Could not generate a map to chronicle"); return; }
  push(); generateChronicle(); store();
  syncLore();
};
