import { CAMP, COLORS, EFFECTS, FADE, LIB, S, T } from './modules/state.js';
import { dist, s2w, w2s } from './modules/geometry.js';
import { registerServiceWorker } from './modules/service-worker.js';
import { StorageRepository } from './modules/storage.js';
import { EffectCatalog } from './modules/effect-catalog.js';
import { createRenderer } from './modules/renderer.js';
import { createBackupTools } from './modules/backup.js';
import { createShapeGeometry } from './modules/shape-geometry.js';
import { createAppStorage } from './modules/app-storage.js';
import { createUi } from './modules/ui.js';
import { createSceneLibrary } from './modules/scene-library.js';
import { createCampaignSystem } from './modules/campaigns.js';
import { createCombatSystem } from './modules/combat.js';
import { createTableView } from './modules/table-view.js';

(() => {
"use strict";

const cv = document.getElementById('stage');
const ctx = cv.getContext('2d');
const hit = document.createElement('canvas').getContext('2d');
const readout = document.getElementById('readout');
const $ = id => document.getElementById(id);
let iniUid=1;
let renderer;
function draw(){ renderer.draw(); }
const dprMain = () => Math.min(window.devicePixelRatio||1, 2);

/* ============ palette ============ */
/* Canvas rendering cannot read CSS variables, and querying them for every stroke would
   be costly at 60fps across two windows. Resolve them here at startup and when the
   theme changes, never during drawing. */
const TOKEN_TYPES = ['ink','ink-deep','panel','panel-2','panel-3','field','line','text',
  'text-soft','muted','muted-2','measure','measure-soft','fog','fog-soft','danger',
  'danger-soft','danger-2','frame','frame-soft','point','ring',
  /* Separate channels for translucent canvas strokes. */
  'ink-deep-rgb','measure-rgb','measure-soft-rgb','fog-rgb','danger-rgb','frame-rgb','point-rgb','text-rgb','ink-rgb','line-rgb','ring-rgb'];
const PAL = {};
const camel = s => s.replace(/-(\w)/g, (_,c)=>c.toUpperCase());
function readPalette(){
  const cs = getComputedStyle(document.documentElement);
  for(const f of TOKEN_TYPES){
    const v = cs.getPropertyValue('--'+f).trim();
    if(v) PAL[camel(f)] = v;
  }
}
readPalette();

const ui = createUi({ $, S, touchState, getPalette:()=>PAL });
const { toast, requestText, requestConfirm, openShortcuts, prepareFolding } = ui;

/* A theme is a :root[data-theme] block that only redefines tokens. Adding one means
   adding a block and a line here, without changing code. */
/* The default theme lives in :root without an attribute, so it needs no extra block. */
const THEMES = [
  {id:'ember',     name:'Ember',     note:'Warm amber over neutral greys, with the fog turned cool. The default.'},
  {id:'slate',     name:'Slate',     note:'Cold blues over near-black. The original look, tuned for a dark room.'},
  {id:'parchment', name:'Parchment', note:'Ink on cream for a lit room. The table screen stays dark either way.'}
];
function applyUI(f, save){
  const v = [0.85,1,1.15].includes(f) ? f : 1;
  S.ui=v;
  document.documentElement.style.setProperty('--ui', String(v));
  if(save) touchState();
  resize();
}
function applyTheme(id, save){
  const t = THEMES.find(x=>x.id===id) || THEMES[0];
  /* The default theme already lives in :root and needs no attribute or additional block. */
  if(t===THEMES[0]) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t.id;
  S.theme = t.id;
  readPalette();
  const note=$('themeNote'); if(note) note.textContent=t.note||'';
  drawTableTheme();
  if(save) touchState();
  draw();
}
/* The table window writes its stylesheet only once when opened. If the theme changes
   later, repaint its background or players will keep seeing the previous theme. */
function drawTableTheme(){
  if(!tableOpen() || !T.win.document.body) return;
  T.win.document.body.style.background = PAL.inkDeep;
  const tip=T.win.document.getElementById('tip');
  if(tip) tip.style.color = PAL.muted2;
}

/* These are not theme tokens. The rule colors are chosen by the director for each
   measurement; effect colors describe the effect, and token colors distinguish players.
   Repainting them on a theme change would change their meaning. */
/* ============ state ============ */
/* active scene and its shortcuts */
const sc  = () => LIB.scenes[LIB.idx] || null;
const isMap = () => { const s=sc(); return !!s && s.type==='map'; };
const cal = () => { const s=sc(); return s && s.cal ? s.cal : {gridPx:50,unitVal:5,unitName:'ft',rule:'cheb'}; };
const shapes = () => { const s=sc(); return s && s.shapes ? s.shapes : []; };

/* ============ geometry and measurements ============ */
/* Tools without their own snap setting—pinning the origin or moving a handle—use the
   measurement setting they derive from. */
function snapFor(tool){
  if(tool==='effect')   return S.snap.effect;
  if(tool==='occlusion') return S.snap.occlusion;
  if(tool==='token')    return S.snap.token;
  return S.snap.measure;
}
function snapPoint(p, mode){
  const m = mode || snapFor(S.tool);
  const c=cal(), g=c.gridPx, ox=c.ox||0, oy=c.oy||0;
  /* Pin-to-token is another placement mode: snap to a nearby player instead of the grid.
     If there is no nearby player, leave the effect where it was dropped. */
  if(m==='token'){
    const j=nearbyToken(p);
    const t=j?tokenOf(j):null;
    return t ? {x:t.x, y:t.y} : p;
  }
  if(m==='none' || !g) return p;
  const rx=p.x-ox, ry=p.y-oy;
  if(m==='corner') return {x:Math.round(rx/g)*g+ox, y:Math.round(ry/g)*g+oy};
  return {x:(Math.floor(rx/g)+0.5)*g+ox, y:(Math.floor(ry/g)+0.5)*g+oy};
}
function measure(a,b){
  const c=cal(), g=c.gridPx||1;
  const dx=Math.abs(b.x-a.x)/g, dy=Math.abs(b.y-a.y)/g;
  let sq;
  if(c.rule==='euclid') sq=Math.hypot(dx,dy);
  else if(c.rule==='cheb') sq=Math.max(dx,dy);
  else { const lo=Math.min(dx,dy), hi=Math.max(dx,dy); sq=hi+Math.floor(lo/2); }
  return sq*c.unitVal;
}
function fmt(v){ return (Math.round(v*10)/10).toString()+' '+cal().unitName; }

/* ============ procedural textures ============ */
const PAT = new Map();
function patTile(kind,color,g){
  const t = Math.max(12, Math.round(g/2));
  const key = kind+'|'+color+'|'+t;
  if(PAT.has(key)) return PAT.get(key);
  const cn=document.createElement('canvas'); cn.width=t; cn.height=t;
  const x=cn.getContext('2d');
  x.strokeStyle=color; x.fillStyle=color; x.lineWidth=Math.max(1,t/16); x.lineCap='round';
  const dot=(px,py,r)=>{x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.fill();};
  if(kind==='hatch'){ x.beginPath(); for(let i=-t;i<t*2;i+=t/3){ x.moveTo(i,0); x.lineTo(i+t,t);} x.stroke(); }
  else if(kind==='dots'){ dot(t*0.25,t*0.25,t/12); dot(t*0.75,t*0.75,t/12); dot(t*0.75,t*0.25,t/18); dot(t*0.25,t*0.75,t/18); }
  else if(kind==='waves'){ x.beginPath();
    for(const yy of [t*0.3,t*0.8]){ x.moveTo(0,yy); x.quadraticCurveTo(t*0.25,yy-t*0.16,t*0.5,yy); x.quadraticCurveTo(t*0.75,yy+t*0.16,t,yy); }
    x.stroke(); }
  else if(kind==='flame'){ x.beginPath();
    for(const [ox,oy,s] of [[t*0.28,t*0.72,0.9],[t*0.74,t*0.42,0.65]]){
      x.moveTo(ox,oy); x.quadraticCurveTo(ox-t*0.16*s,oy-t*0.22*s,ox,oy-t*0.44*s);
      x.quadraticCurveTo(ox+t*0.16*s,oy-t*0.22*s,ox,oy); }
    x.fill(); }
  else if(kind==='shard'){ x.beginPath();
    x.moveTo(t*0.5,t*0.08); x.lineTo(t*0.5,t*0.92); x.moveTo(t*0.18,t*0.3); x.lineTo(t*0.82,t*0.7);
    x.moveTo(t*0.82,t*0.3); x.lineTo(t*0.18,t*0.7); x.stroke(); }
  else if(kind==='noise'){ let s=7; const rnd=()=>{ s=(s*1103515245+12345)&0x7fffffff; return (s%1000)/1000; };
    for(let i=0;i<14;i++) dot(rnd()*t,rnd()*t,t/22); }
  else if(kind==='brick'){ x.beginPath();
    x.moveTo(0,t*0.5); x.lineTo(t,t*0.5); x.moveTo(0,0); x.lineTo(t,0);
    x.moveTo(t*0.5,0); x.lineTo(t*0.5,t*0.5); x.moveTo(0,t*0.5); x.lineTo(0,t); x.moveTo(t,t*0.5); x.lineTo(t,t);
    x.stroke(); }
  else if(kind==='rays'){ x.beginPath();
    for(const px of [t*0.2,t*0.5,t*0.8]){ x.moveTo(px,t*0.12); x.lineTo(px,t*0.88); } x.stroke(); }
  PAT.set(key,cn); return cn;
}



/* ============ animated effects (JB2A catalog) ============ */
const effectCatalog = new EffectCatalog({
  storage:{
    get:(store,key)=>dbGet(store,key),
    put:(store,value)=>dbPut(store,value),
    get ok(){ return DB.ok; }
  },
  getActiveScene:()=>sc(),
  getDraft:()=>S.draft,
  getSelectedEffect:()=>S.animSel,
  touchState,
  draw,
  setTool,
  syncCtxBar,
  toast,
  attachTip,
  onSelectEffect:(effect)=>{ S.animSel=effect; S.fxGeo=effect.g; }
});

const CAT = effectCatalog.catalog;
const ANIM = effectCatalog.animations;
function loadCatalog(){ return effectCatalog.load(); }
function anim(id){ return effectCatalog.anim(id); }
function releaseAnimation(id){ effectCatalog.release(id); }
function clearAnimations(){ effectCatalog.clearUnused(); }
function videoFrame(id){ return effectCatalog.videoFrame(id); }
function refreshAnimations(){ effectCatalog.refresh(); }
function filteredCatalog(){ return effectCatalog.filtered(); }
function markRecent(path){ effectCatalog.markRecent(path); }
function toggleFavorite(effect){ effectCatalog.toggleFavorite(effect); }
function renderCatalog(){ effectCatalog.render(); }
/* Drawn with the same geometry as the other effects. */
function drawAnim(c, view, dpr, s, cn, alpha){
  const gp = cal().gridPx || 50;
  c.save();
  c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
  c.globalAlpha = alpha * (s.alpha!=null ? s.alpha : 1);
  if(s.blend && s.blend!=='normal') c.globalCompositeOperation = s.blend;
  c.imageSmoothingQuality='high';
  const rel = cn.height/cn.width;

  if(s.geo==='cone' || s.geo==='wall'){
    /* Directional catalog effects point to the right. */
    const L = dist(s.a,s.b)||1;
    const ang = Math.atan2(s.b.y-s.a.y, s.b.x-s.a.x);
    const W = L, H = W*rel;
    c.translate(s.a.x, s.a.y); c.rotate(ang);
    c.drawImage(cn, 0, -H/2, W, H);
  } else {
    const measure = s.geo==='area'
      ? 2*(Math.max(Math.abs(s.b.x-s.a.x), Math.abs(s.b.y-s.a.y))||1)
      : 2*(dist(s.a,s.b)||1);
    const W = measure, H = W*rel;
    c.translate(s.a.x, s.a.y);
    c.drawImage(cn, -W/2, -H/2, W, H);
  }
  c.restore();
  c.setTransform(dpr,0,0,dpr,0,0);
}

const shapeGeometry = createShapeGeometry({ $, dist, cal, measure, fmt });
const { shapePath, FILLED, polySquares, bbox, shapeLabel } = shapeGeometry;

/* ============ occlusion: walls that block vision ============ */
/* Store walls per scene as vertices in map-pixel coordinates, matching the UVTT
   objects_line_of_sight field so imported and hand-drawn walls can coexist. */
const walls = () => { const s=sc(); return s ? (s.walls || (s.walls=[])) : []; };

/* A wall is a chain of segments: segment i runs from vertex i to i+1, and the final
   segment of a closed polygon returns to the first vertex. Mark doors per segment so
   a single hallway wall can open at just one segment. */
const segCount = w => { const n=w.pts.length; return n<2 ? 0 : (w.closed && n>2 ? n : n-1); };
const segPts   = (w,i) => [w.pts[i], w.pts[(i+1) % w.pts.length]];

/* Each segment stores its state: "open" marks a door, and "dir" specifies which side
   it blocks (0 for both, +1 or -1 for one). Populate this on first access, migrating
   either the older "open" index list or the earlier wall-wide "open" flag. This also
   handles saved walls and UVTT portals. */
function segmentsOf(w){
  const n = segCount(w);
  if(!Array.isArray(w.segs)){
    const open = Array.isArray(w.open) ? w.open
                   : (w.open ? Array.from({length:n},(_,i)=>i) : []);
    w.segs = Array.from({length:n}, (_,i)=>({open: open.includes(i), dir:0}));
    delete w.open; delete w.open;
  }
  /* Preserve matching indices if the vertex count changes. */
  if(w.segs.length !== n){
    const previous = w.segs;
    w.segs = Array.from({length:n}, (_,i)=>previous[i] || {open:false, dir:0});
  }
  return w.segs;
}
const segmentOpen = (w,i) => { const t=segmentsOf(w)[i]; return !!(t && t.open); };
const segDir     = (w,i) => { const t=segmentsOf(w)[i]; return t ? (t.dir||0) : 0; };

function distancePointToSegment(p, a, b){
  const dx=b.x-a.x, dy=b.y-a.y;
  const l2=dx*dx+dy*dy;
  if(l2===0) return dist(p,a);
  let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l2;
  t=Math.max(0,Math.min(1,t));
  return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy));
}
/* Return the specific segment that was hit, not just its wall. */
function wallAt(wp, tol){
  const list=walls();
  for(let k=list.length-1;k>=0;k--){
    const w=list[k], n=segCount(w);
    for(let i=0;i<n;i++){
      const [a,b]=segPts(w,i);
      if(distancePointToSegment(wp,a,b)<=tol) return {wall:w, seg:i};
    }
  }
  return null;
}
function vertexAt(wp, tol){
  for(const w of walls())
    for(let i=0;i<w.pts.length;i++)
      if(dist(wp,w.pts[i])<=tol) return {wall:w, i};
  return null;
}
/* Insert a vertex into a segment and return its index. Splitting a segment shifts later
   indices, so split the state list too. Both halves inherit the original segment's door
   and direction settings. */
/* Occlusion selection is a list of {wall, seg} segments. It commonly includes several
   at once, such as a hallway or all sides of a room; a single segment is a one-item list. */
const selectedSegment   = (w,i) => S.selectedWalls.some(t=>t.wall===w && t.seg===i);
const selectedWall = w => S.selectedWalls.some(t=>t.wall===w);
const selectedWalls = () => [...new Set(S.selectedWalls.map(t=>t.wall))];
function clearSelectedWalls(){ S.selectedWalls=[]; }
/* Shapes and tokens are released together because they form one selection, even though
   they live in separate lists, like wall segments. */
function clearSelection(){ S.sel=null; S.selMulti=[]; S.selTokens=[]; }
/* Copy positions individually so the snapshot does not share objects with the scene;
   otherwise moving a token would also rewrite the history. */
function cloneTokens(t){
  const o={};
  for(const k in (t||{})) o[k]={x:t[k].x, y:t[k].y};
  return o;
}
/* A cheap wall-state fingerprint that changes when a vertex moves, a door opens, or a
   direction reverses. Computing it is far cheaper than recasting rays and avoids
   manually invalidating the cache wherever walls change. */
function wallFootprint(){
  let h=0;
  for(const w of walls()){
    h = (h*31 + w.pts.length + (w.closed?1:0))|0;
    for(const p of w.pts) h = (h*31 + Math.round(p.x*4)*7 + Math.round(p.y*4))|0;
    if(Array.isArray(w.segs))
      for(const t of w.segs) h = (h*31 + (t.open?1:0) + (t.dir||0)*3)|0;
  }
  return h;
}
function selectSegment(w,i,sumar){
  if(!sumar){ S.selectedWalls=[{wall:w, seg:i}]; return; }
  const k=S.selectedWalls.findIndex(t=>t.wall===w && t.seg===i);
  if(k<0) S.selectedWalls.push({wall:w, seg:i}); else S.selectedWalls.splice(k,1);
}
function selectWall(w){
  S.selectedWalls = Array.from({length:segCount(w)}, (_,i)=>({wall:w, seg:i}));
}

/* Deep-copy walls, including points and per-segment state. This is small compared with a
   fog snapshot, so it fits in history without special handling. */
function cloneWalls(list){
  return (list||[]).map(w=>{
    const c={...w, pts:w.pts.map(p=>({...p}))};
    if(Array.isArray(w.segs)) c.segs=w.segs.map(t=>({...t}));
    return c;
  });
}

function insertVertex(w, seg, p){
  const t = segmentsOf(w)[seg];                      // migrate before changing anything
  if(!t) return null;
  const inherited = {open:t.open, dir:t.dir};
  w.pts.splice(seg+1, 0, p);
  w.segs.splice(seg+1, 0, inherited);
  return seg+1;
}

function closeWall(){
  const d=S.wallDraft;
  if(!d || d.pts.length<2){ S.wallDraft=null; draw(); return; }
  push('walls');
  walls().push({pts:d.pts, closed: d.mode==='polygon' && d.pts.length>2, segs:[]});
  S.wallDraft=null; touchScene(); recalculateVision(); draw(); syncCtxBar();
  toast('Wall added. '+walls().length+' in this scene.');
}
function drawWalls(c, view, dpr, o){
  const list=walls();
  const d=S.wallDraft;
  if(!list.length && !d) return;
  c.save();
  c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
  c.lineCap='round'; c.lineJoin='round';

  /* Draw each segment separately so an open door can be distinguished from the rest of
     its wall. */
  for(const w of list){
    const nSeg = segCount(w);
    for(let i=0;i<nSeg;i++){
      const [a,b] = segPts(w,i);
      const open = segmentOpen(w,i);
      const sel = selectedSegment(w,i);
      c.beginPath();
      c.moveTo(a.x,a.y); c.lineTo(b.x,b.y);
      c.strokeStyle = open ? 'rgba('+PAL.frameRgb+',.85)'
        : sel ? PAL.measure : (S.wallsOnly ? 'rgba('+PAL.measureSoftRgb+',.95)' : 'rgba('+PAL.measureSoftRgb+',.55)');
      c.lineWidth = (sel?3.4:2.2)/view.k;
      if(open) c.setLineDash([9/view.k,7/view.k]);
      c.stroke();
      c.setLineDash([]);

      /* A one-way segment has short marks on its blocked side. The normal (-sy, sx) points
         toward the positive side, and dir selects which side. */
      const d = segDir(w,i);
      if(d){
        const sx=b.x-a.x, sy=b.y-a.y, L=Math.hypot(sx,sy)||1;
        const nx=(-sy/L)*d, ny=(sx/L)*d, largo=7/view.k;
        c.beginPath();
        for(const f of [0.25,0.5,0.75]){
          const px=a.x+sx*f, py=a.y+sy*f;
          c.moveTo(px,py); c.lineTo(px+nx*largo, py+ny*largo);
        }
        c.strokeStyle = open ? 'rgba('+PAL.frameRgb+',.9)' : 'rgba('+PAL.fogRgb+',.95)';
        c.lineWidth = 1.6/view.k;
        c.stroke();
      }
    }
    if(S.tool==='occlusion'){
      c.fillStyle = selectedWall(w) ? PAL.measure : 'rgba('+PAL.measureSoftRgb+',.8)';
      for(const p of w.pts){ c.beginPath(); c.arc(p.x,p.y,3.4/view.k,0,Math.PI*2); c.fill(); }
    }
  }

  if(d && d.pts.length){
    c.beginPath();
    c.moveTo(d.pts[0].x, d.pts[0].y);
    for(let i=1;i<d.pts.length;i++) c.lineTo(d.pts[i].x, d.pts[i].y);
    if(S.cursorWorld) c.lineTo(S.cursorWorld.x, S.cursorWorld.y);
    c.strokeStyle=PAL.frame; c.lineWidth=2.4/view.k;
    c.setLineDash([7/view.k,5/view.k]); c.stroke(); c.setLineDash([]);
    c.fillStyle=PAL.frame;
    for(const p of d.pts){ c.beginPath(); c.arc(p.x,p.y,3.6/view.k,0,Math.PI*2); c.fill(); }
  }
  c.restore();
  c.setTransform(dpr,0,0,dpr,0,0);
}

/* ============ player tokens ============ */
/* Position belongs to the scene (each map has its own); the token belongs to the campaign. */
const tokens = () => { const s=sc(); return s ? (s.tokens || (s.tokens={})) : {}; };
const tokenOf = j => tokens()[j.id] || null;
const TOKEN_COLORS = ['#5AD2E8','#8BE07A','#E0A33C','#C88BE8','#E0603C','#FFD86B'];
function playerColor(j){
  const i = players().indexOf(j);
  return j.color || TOKEN_COLORS[(i<0?0:i) % TOKEN_COLORS.length];
}
const initialsOf = j => (j.character||'?').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();

function visionRadius(j){
  const c=cal();
  const feet = (j.vision!=null ? j.vision : 30);
  return (feet / (c.unitVal||5)) * (c.gridPx||50);
}
/* Reveal fog around a position without covering it again. */
function revealAt(pos, radius){
  const s=sc(); if(!s || s.type!=='map' || !s.fogCtx) return;
  const c=s.fogCtx;
  c.save();
  c.globalCompositeOperation='destination-out';
  /* destination-out: these stops use only alpha, not color, so they have no theme token.
     Adding them to the palette would have no effect and could be confusing. */
  const g=c.createRadialGradient(pos.x,pos.y,Math.max(1,radius*0.72), pos.x,pos.y,radius);
  g.addColorStop(0,'rgba(0,0,0,1)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g;
  c.beginPath(); c.arc(pos.x,pos.y,radius,0,Math.PI*2); c.fill();
  c.restore();
  touchFog();
}
function moveToken(j, pos, reveal=true, skipShapes){
  const t=tokens();
  const before=t[j.id];
  t[j.id]={x:pos.x, y:pos.y};
  if(before){
    const dx=pos.x-before.x, dy=pos.y-before.y;
    if(dx||dy) dragAnchored(j, dx, dy, skipShapes);
  }
  if(reveal) updateVisionWhileMoving(j, pos);
  touchScene();
}
const fogMode = () => { const s=sc(); return (s && s.fogMode) || 'manual'; };

function tokenAt(wp){
  const r=(cal().gridPx||50)*0.45;
  for(const j of players()){
    const t=tokenOf(j);
    if(t && dist(wp,t)<=r) return j;
  }
  return null;
}
/* Find the nearest token within a generous radius. To pin an effect, drop it on a player;
   there is no need to hit the token precisely. */
function nearbyToken(wp, radius){
  const r = radius!=null ? radius : (cal().gridPx||50);
  let better=null, nearestDistance=Infinity;
  for(const j of players()){
    const t=tokenOf(j); if(!t) continue;
    const d=dist(wp,t);
    if(d<=r && d<nearestDistance){ better=j; nearestDistance=d; }
  }
  return better;
}
/* Pinned effects use map-pixel coordinates like everything else, so moving a token
   updates their coordinates. Resolving the offset during drawing would also affect hit
   testing, handles, backups, and fog. */
function dragAnchored(j, dx, dy, skipShapes){
  const s=sc(); if(!s || !s.shapes) return;
  for(const sh of s.shapes){
    if(sh.pin!==j.id) continue;
    if(skipShapes && skipShapes.has(sh)) continue;
    translateShape(sh, dx, dy);
  }
}
const pinned = j => (sc()?.shapes || []).filter(sh=>sh.pin===j.id);
/* When a token leaves the scene, release its attached effects in place. Deleting artwork
   placed by the director would be worse than leaving it detached. */
function releaseAnchors(pid){
  for(const sh of (sc()?.shapes || [])) if(sh.pin===pid) delete sh.pin;
}

function drawTokens(c, view, dpr, mode, helpers){
  const list=players();
  if(!list.length || mode==='hidden') return;
  const gp=cal().gridPx||50;
  c.save();
  c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
  for(const j of list){
    const t=tokenOf(j); if(!t) continue;
    const col=playerColor(j);
    const r = mode==='point' ? gp*0.14 : gp*0.36;
    const active = helpers && j===S.tokenSel;
    const marked = helpers && S.selTokens.includes(j);

    /* The vision circle is a director aid and is not drawn in the table view. */
    if(helpers && mode!=='point' && (S.tool==='token' || active)){
      c.beginPath(); c.arc(t.x,t.y,visionRadius(j),0,Math.PI*2);
      c.strokeStyle=col+'55'; c.lineWidth=1.5/view.k;
      c.setLineDash([8/view.k,6/view.k]); c.stroke(); c.setLineDash([]);
    }
    c.beginPath(); c.arc(t.x,t.y,r,0,Math.PI*2);
    c.fillStyle = mode==='point' ? col : col+'D0';
    c.fill();
    c.lineWidth=(active?3:2)/view.k;
    c.strokeStyle = active ? PAL.ring : PAL.inkDeep;
    c.stroke();
    /* A selected token uses the same dashed selection-color ring as a selected shape, so
       mixed groups have a consistent appearance. */
    if(marked){
      c.beginPath(); c.arc(t.x,t.y,r+3/view.k,0,Math.PI*2);
      c.strokeStyle=PAL.measure; c.lineWidth=1.8/view.k;
      c.setLineDash([5/view.k,4/view.k]); c.stroke(); c.setLineDash([]);
    }
    if(mode!=='point'){
      c.fillStyle=PAL.inkDeep;
      c.font='700 '+(gp*0.34)+'px "Inter", system-ui, sans-serif';
      c.textAlign='center'; c.textBaseline='middle';
      c.fillText(initialsOf(j), t.x, t.y);
      c.textAlign='left'; c.textBaseline='alphabetic';
    }
    if(mode==='name'){
      c.font='600 '+(gp*0.26)+'px "Inter", system-ui, sans-serif';
      c.textAlign='center';
      c.fillStyle='rgba('+PAL.inkRgb+',.85)';
      const an=c.measureText(j.character).width;
      roundRect(c, t.x-an/2-gp*0.08, t.y+r+gp*0.06, an+gp*0.16, gp*0.34, gp*0.06);
      c.fill();
      c.fillStyle=PAL.text;
      c.fillText(j.character, t.x, t.y+r+gp*0.30);
      c.textAlign='left';
    }
  }
  c.restore();
  c.setTransform(dpr,0,0,dpr,0,0);
}



/* ============ UVTT map import ============ */
/* Universal VTT is JSON containing an embedded image, scale, vision-blocking geometry,
   doors, and lights. It provides data that would otherwise be drawn by hand here.
   Coordinates in the format are measured in grid squares. */
const EXT_UVTT = /\.(uvtt|dd2vtt|df2vtt)$/i;

async function importUVTT(file){
  let d;
  try{ d = JSON.parse(await file.text()); }
  catch(err){ toast('"'+file.name+'" is not a valid UVTT file.'); return null; }

  const res = d.resolution || {};
  const ppg = res.pixels_per_grid || 100;
  const b64 = (d.image||'').split(',').pop();
  if(!b64){ toast('The file has no embedded image.'); return null; }

  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  const type = (bytes[0]===0x89) ? 'image/png' : 'image/webp';
  const img = new File([bytes.buffer], file.name.replace(EXT_UVTT,'.png'), {type:type});

  const scene = await addSceneFile(img, 'map');
  if(!scene) return null;

  /* The scale is provided, so no manual calibration is needed. */
  scene.cal.gridPx = ppg;
  scene.cal.calibrated = true;       // the file already includes the scale

  const aPx = p => ({x:p.x*ppg, y:p.y*ppg});
  const walls = [];
  for(const group of (d.line_of_sight||[]))
    if(group && group.length>1) walls.push({pts:group.map(aPx), closed:false});
  for(const group of (d.objects_line_of_sight||[]))
    if(group && group.length>1) walls.push({pts:group.map(aPx), closed:true});

  /* Portals are imported as openable walls (doors). An open portal in the file arrives
     with all its segments open. */
  let doors=0;
  for(const pr of (d.portals||[])){
    const b = pr.bounds||[];
    if(b.length<2) continue;
    const pts=b.map(aPx);
    walls.push({pts, closed:false, door:true,
                open: pr.closed===false ? pts.map((_,i)=>i).slice(0,pts.length-1) : []});
    doors++;
  }
  scene.walls = walls;

  /* Preserve lights as provided. They do not illuminate yet, but remain available. */
  scene.lights = (d.lights||[]).map(l=>({
    x:l.position.x*ppg, y:l.position.y*ppg,
    range:(l.range||0)*ppg, intensity:l.intensity||1,
    color:l.color||'ffffff', shadows:!!l.shadows
  }));
  scene.environment = (d.environment||{}).ambient_light || null;
  if((d.environment||{}).baked_lighting !== undefined)
    scene.bakedLighting = !!d.environment.baked_lighting;

  scene.fogMode = walls.length ? 'exploration' : 'manual';
  await saveSceneMeta(scene);
  syncSceneInputs(); renderLibrary(); recalculateVision(); draw();

  toast('"'+scene.name.replace(/\.[^.]+$/,'')+'": '+walls.length+' walls, '+
        doors+' doors and '+scene.lights.length+' lights. Square of '+ppg+' px.');
  return scene;
}

/* Mark file lights on your screen so their locations are visible. */
function drawLights(c, view, dpr){
  const s=sc();
  if(!s || !s.lights || !s.lights.length || !S.showLights) return;
  c.save();
  c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
  for(const l of s.lights){
    const col = '#'+String(l.color).slice(-6);
    c.beginPath(); c.arc(l.x, l.y, Math.max(l.range,4), 0, Math.PI*2);
    c.strokeStyle = col+'44'; c.lineWidth=1.2/view.k;
    c.setLineDash([6/view.k,5/view.k]); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(l.x, l.y, (cal().gridPx||50)*0.12, 0, Math.PI*2);
    c.fillStyle = col+'CC'; c.fill();
  }
  c.restore();
  c.setTransform(dpr,0,0,dpr,0,0);
}

/* ============ visibility: what each token can see ============ */
/* Cast rays from the token toward each wall endpoint, plus several around the circle
   for freeform outlines. Their collision points define the visible polygon; areas
   behind walls remain hidden. */

const EPS = 0.0004;
/* A ray starting directly on a wall hits it at zero distance and closes the polygon
   around the token, making it blind. Require some travel before counting a hit, so a
   wall beneath the token becomes transparent instead. Tool snapping (tokens to centers,
   walls to corners) makes this rare but not impossible. */
const EPS_T = 1e-6;
const BASE_RAYS = 96;        // distributed rays to smooth the vision boundary

/* All scene walls converted to individual segments. */
function mapSegments(){
  const out=[];
  for(const w of walls()){
    const n=segCount(w);
    for(let i=0;i<n;i++){
      if(segmentOpen(w,i)) continue;          // an open segment (a door) does not block vision
      const [a,b]=segPts(w,i);
      out.push({a, b, dir:segDir(w,i)});
    }
  }
  return out;
}

/* Distance at which a ray hits a segment, or null if it does not cross it. */
function rayHit(ox, oy, dx, dy, s){
  const sx=s.b.x-s.a.x, sy=s.b.y-s.a.y;
  const den = dx*sy - dy*sx;
  if(Math.abs(den) < 1e-9) return null;           // parallel
  /* A one-way wall blocks vision only when the viewer is on its blocked side. The cross
     product of the segment and ray origin indicates which side that is. */
  if(s.dir){
    const side = sx*(oy-s.a.y) - sy*(ox-s.a.x);
    if(Math.sign(side) !== s.dir) return null;      // transparent from this side
  }
  const t = ((s.a.x-ox)*sy - (s.a.y-oy)*sx) / den;
  const u = ((s.a.x-ox)*dy - (s.a.y-oy)*dx) / den;
  if(t < EPS_T || u < 0 || u > 1) return null;
  return t;
}

function visiblePolygon(origin, radius, segs){
  /* Only walls within the vision range matter. */
  const nearby = segs.filter(s=>{
    const dmin = Math.min(
      distancePointToSegment(origin, s.a, s.b),
      dist(origin, s.a), dist(origin, s.b));
    return dmin <= radius;
  });

  /* Sort rays by angle to trace the outline in one pass. atan2 returns (-π, π], while
     distributed rays use [0, 2π), so normalize them before sorting. Otherwise negative-
     angle corners above the token move to the start, causing the polygon to overlap itself
     and light to pass through walls. */
  const norm = a => { a %= Math.PI*2; return a < 0 ? a + Math.PI*2 : a; };

  const angles=[];
  for(let i=0;i<BASE_RAYS;i++) angles.push((i/BASE_RAYS)*Math.PI*2);
  for(const s of nearby){
    for(const p of [s.a, s.b]){
      const ang = Math.atan2(p.y-origin.y, p.x-origin.x);
      /* immediately before, at, and immediately after the corner */
      angles.push(norm(ang - EPS), norm(ang), norm(ang + EPS));
    }
  }
  angles.sort((x,y)=>x-y);

  const pts=[];
  for(const ang of angles){
    const dx=Math.cos(ang), dy=Math.sin(ang);
    let better=radius;
    for(const s of nearby){
      const t=rayHit(origin.x, origin.y, dx, dy, s);
      if(t!==null && t<better) better=t;
    }
    pts.push({x:origin.x+dx*better, y:origin.y+dy*better});
  }
  return pts;
}

/* Clear fog inside the visible polygon, fading toward its edge. */
function revealPolygon(poly, origin, radius){
  const s=sc(); if(!s || !s.fogCtx || poly.length<3) return;
  const c=s.fogCtx;
  c.save();
  c.beginPath();
  c.moveTo(poly[0].x, poly[0].y);
  for(let i=1;i<poly.length;i++) c.lineTo(poly[i].x, poly[i].y);
  c.closePath();
  c.clip();
  c.globalCompositeOperation='destination-out';
  const g=c.createRadialGradient(origin.x,origin.y,Math.max(1,radius*0.78), origin.x,origin.y,radius);
  g.addColorStop(0,'rgba(0,0,0,1)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g;
  c.fillRect(origin.x-radius, origin.y-radius, radius*2, radius*2);
  c.restore();
}

function revealToken(j, pos){
  const radius=visionRadius(j);
  if(radius<=0) return;
  revealPolygon(visiblePolygon(pos, radius, mapSegments()), pos, radius);
  touchFog();
}

/* Rebuild all fog. Exploration accumulates previously seen areas; dynamic mode reveals
   only what is visible now. */
function recalculateVision(){
  const s=sc(); if(!s || s.type!=='map' || !s.fogCtx) return;
  const mode=fogMode();
  if(mode==='manual') return;
  if(mode==='dynamic'){
    s.fogCtx.globalCompositeOperation='source-over';
    s.fogCtx.fillStyle=PAL.inkDeep;
    s.fogCtx.fillRect(0,0,s.w,s.h);
  }
  const segs=mapSegments();
  for(const j of players()){
    const t=tokenOf(j); if(!t) continue;
    const radius=visionRadius(j); if(radius<=0) continue;
    revealPolygon(visiblePolygon(t, radius, segs), t, radius);
  }
  touchFog();
}

/* Throttle recalculation while dragging to keep the interaction responsive. */
let lastCalculation=0;
function updateVisionWhileMoving(j, pos){
  const mode=fogMode();
  if(mode==='manual') return;
  const currentTime=performance.now();
  if(mode==='dynamic'){
    if(currentTime-lastCalculation<70) return;
    lastCalculation=currentTime; recalculateVision(); return;
  }
  if(currentTime-lastCalculation<45) return;
  lastCalculation=currentTime; revealToken(j, pos);
}

/* Outline what the selected token sees, on your screen only. */
let visionCache = {key:null, poly:null};
function drawVision(c, view, dpr){
  /* Do not draw while the token is moving: the ray polygon is redundant when the effect
     is already visible in the fog. */
  if(S.drawing && S.drawing.kind==='token') return;
  const j=S.tokenSel; if(!j || !S.showVision) return;
  const t=tokenOf(j); if(!t) return;
  const radius=visionRadius(j); if(radius<=0) return;
  /* This outline redraws every frame while animations play, but recasting rays each time
     is unnecessary. It changes only when the token moves, its range changes, or walls move. */
  const key = (sc()||{}).id+'|'+j.id+'|'+t.x+','+t.y+'|'+radius+'|'+wallFootprint();
  if(visionCache.key !== key){
    visionCache = {key, poly:visiblePolygon(t, radius, mapSegments())};
  }
  const poly = visionCache.poly;
  if(poly.length<3) return;
  c.save();
  c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
  c.beginPath();
  c.moveTo(poly[0].x, poly[0].y);
  for(let i=1;i<poly.length;i++) c.lineTo(poly[i].x, poly[i].y);
  c.closePath();
  c.fillStyle=playerColor(j)+'1A';
  c.fill();
  c.strokeStyle=playerColor(j)+'99';
  c.lineWidth=1.5/view.k;
  c.stroke();
  c.restore();
  c.setTransform(dpr,0,0,dpr,0,0);
}

renderer = createRenderer({
  $, cv, ctx, S, T, PAL, sc, isMap, cal, shapes, players:()=>campaignSystem.players(), tokenOf, dist, w2s, shapePath, FILLED, bbox, shapeLabel, patTile, videoFrame, drawAnim,
  drawWalls, drawLights, drawVision, drawTokens, tableScale, tableOpen, drawTable, turnIdx:(...args)=>combatSystem.turnIdx(...args),
  conditionIcon:(...args)=>combatSystem.conditionIcon(...args), dprMain
});
const { renderScene, drawInitiative } = renderer;

/* ============ view and framing ============ */
function resize(){
  const dpr=dprMain();
  cv.width=Math.round(innerWidth*dpr); cv.height=Math.round(innerHeight*dpr);
  cv.style.width=innerWidth+'px'; cv.style.height=innerHeight+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  draw();
}
addEventListener('resize', resize);

function fitView(){
  const s=sc(); if(!s || !s.ready) return;
  const k=Math.min(innerWidth/s.w, innerHeight/s.h)*0.94;
  S.view={k, x:(innerWidth-s.w*k)/2, y:(innerHeight-s.h*k)/2};
  draw(); updateScaleBar();
}
function zoomAt(cx,cy,f){
  const k2=Math.max(0.05,Math.min(20,S.view.k*f)), r=k2/S.view.k;
  S.view.x=cx-(cx-S.view.x)*r; S.view.y=cy-(cy-S.view.y)*r; S.view.k=k2;
  draw(); updateScaleBar();
}
function updateScaleBar(){
  const s=sc();
  const thereIs = s && s.type==='map';
  $('scalebar').style.visibility = thereIs ? 'visible' : 'hidden';
  if(thereIs){
    $('sbBar').style.width=Math.max(20,cal().gridPx*S.view.k*2)+'px';
    $('sbLabel').textContent=fmt(cal().unitVal*2);
  }
  $('stZoom').textContent = Math.round(S.view.k*100)+'%';
  const open = tableOpen();
  $('stTable').textContent = open ? 'table open' : 'table closed';
  $('stTable').className = open ? 'open' : '';
}


const DIRTY_STATE = {scene:false, fog:false, state:false, campaign:false};
function touchScene(){ DIRTY_STATE.scene=true; }
function touchFog(){ DIRTY_STATE.fog=true; }
function touchState(){ DIRTY_STATE.state=true; }

const appStorage = createAppStorage({
  StorageRepository, $, CAMP, LIB, S, T, PAL, CAT, sc, DIRTY_STATE,
  saveCampaign:()=>campaignSystem.saveCampaign()
});
const { storage, DB, dbOpen, dbPut, dbGet, dbDel, dbAll, migrateCampaignRecord, migrateSceneRecord, migrateStateRecord, migrateCombatant, loadAppState, loadCampaignState,
  blobFromCanvas, loadImage, loadBitmap, scaleCanvas, MAX_SIDE, MAX_THUMBNAIL, MAX_FOG, saveSceneMeta, createFog, saveFog, saveState, saveNotice, flush, loadScene, releaseScene, releaseOthers, updateSpacing } = appStorage;

const sceneLibrary = createSceneLibrary({
  $, S, CAMP, LIB, DB, T, loadBitmap, scaleCanvas, blobFromCanvas, MAX_SIDE, MAX_THUMBNAIL, dbPut, dbDel, saveSceneMeta, updateSpacing, flush,
  clearSelection, clearSelectedWalls, loadScene, releaseOthers, clearAnimations, setBlack, fitView, renderFxList, syncCtxBar, touchState, touchScene, requestConfirm, draw, renderSteps, fogMode, cal, sc, toast
});
const { addSceneFile, selectScene, reorderScene, renderLibrary, chooseImage, renderTray, showImage, hideImage, sceneOverlay, updateNoticeOverlay,
  deleteScene, renameScene, syncSceneInputs } = sceneLibrary;

/* ============ unified history ============ */
/* While redoing, push() must not clear the redo stack; otherwise only one step could
   be redone. */
let redoing=false;

function push(kind){
  if(kind==='ini'){
    S.history.push({kind:'ini', scene:'*',
      arr:S.ini.list.map(m=>({...m, conditions:[...(m.conditions||[])], saves:[...(m.saves||[0,0,0,0,0,0])]}))});
    while(S.history.length>24) S.history.shift();
    return;
  }
  const s=sc(); if(!s || s.type!=='map') return;
  /* A new edit invalidates the remaining redo history for THIS scene because that branch
     no longer applies. Each map has its own timeline, so other branches remain untouched. */
  if(!redoing) S.redo = S.redo.filter(r => r.scene !== s.id);
  if(kind==='fog'){
    /* Store snapshots at disk resolution: at map size, one canvas can reach 67MB and several
       are retained. Fog has a soft edge, so reducing its resolution is not noticeable.
       Copy smaller maps as-is because scale() does not enlarge them. */
    const cn=document.createElement('canvas');
    cn.width=s.fogCv.width; cn.height=s.fogCv.height;
    cn.getContext('2d').drawImage(s.fogCv,0,0);
    S.history.push({kind:'fog', scene:s.id, img:cn});
    const fogs=S.history.filter(h=>h.kind==='fog');
    while(fogs.length>4){ const v=fogs.shift(); S.history.splice(S.history.indexOf(v),1); }
  } else if(kind==='walls'){
    S.history.push({kind:'walls', scene:s.id, arr:cloneWalls(s.walls)});
  } else {
    /* Store tokens with shapes rather than separately so moving both can be undone in one
       step. Existing push('shapes') calls then cover both. */
    S.history.push({kind:'shapes', scene:s.id, arr:s.shapes.map(x=>({...x})),
                    tokens:cloneTokens(s.tokens)});
  }
  if(S.history.length>24) S.history.shift();
  syncHistory();
}
function snapshot(){
  const s=sc();
  if(!s || s.type!=='map') return null;
  /* Tag each scene so a snapshot can only return to the map it came from. */
  return {scene:s.id, shapes:s.shapes.map(x=>({...x})), walls:cloneWalls(s.walls),
          tokens:cloneTokens(s.tokens), ini:S.ini.list.map(m=>({...m}))};
}
function redo(){
  const s=sc();
  /* Redo the latest entry for this scene; entries for other maps wait until they are
     selected again. */
  let i=-1;
  for(let k=S.redo.length-1;k>=0;k--) if(s && S.redo[k].scene===s.id){ i=k; break; }
  if(i<0){ toast('Nothing to redo.'); return; }
  const e=S.redo.splice(i,1)[0];
  redoing=true;
  push('shapes');
  redoing=false;
  s.shapes.length=0; e.shapes.forEach(x=>s.shapes.push(x));
  if(e.walls) s.walls = cloneWalls(e.walls);
  if(e.tokens) s.tokens = cloneTokens(e.tokens);
  clearSelection(); clearSelectedWalls();
  touchScene(); renderFxList(); recalculateVision(); renderPlayers(); syncCtxBar(); draw();
  toast('Redone.');
  syncHistory();
}
function undo(){
  const s=sc();
  const before=snapshot();
  let e=null;
  /* One timeline for undoing strokes, fog, and combat changes alike. */
  while(S.history.length){
    const c=S.history.pop();
    if(c.scene==='*' || (s && c.scene===s.id)){ e=c; break; }
  }
  if(!e) return;
  if(e.kind==='ini'){
    S.ini.list=e.arr; syncAll(); renderInitiativeList(); draw();
    toast('Combat change undone.'); return;
  }
  if(!s) return;
  /* A snapshot may be reduced; scale it to map size as when loading it from disk. */
  if(e.kind==='fog'){ s.fogCtx.clearRect(0,0,s.w,s.h); s.fogCtx.drawImage(e.img,0,0,s.w,s.h); touchFog(); }
  else if(e.kind==='walls'){
    if(before) S.redo.push(before);
    if(S.redo.length>12) S.redo.shift();
    s.walls = e.arr;
    clearSelectedWalls(); S.wallDraft=null;
    touchScene(); recalculateVision(); syncCtxBar();
  }
  else {
    if(before) S.redo.push(before);
    if(S.redo.length>12) S.redo.shift();
    s.shapes.length=0; e.arr.forEach(x=>s.shapes.push(x));
    /* Older entries have no tokens; leave them unchanged rather than clearing them. */
    if(e.tokens){ s.tokens = e.tokens; recalculateVision(); renderPlayers(); }
    clearSelection(); touchScene(); renderFxList();
  }
  draw();
  syncHistory();
}

/* ============ fog ============ */
/* Dynamic mode rebuilds all fog from tokens on every recalculation, so manual painting
   disappears immediately. Do nothing and explain why instead. */
let dynamicNotice=0;
function fogPintable(){
  if(fogMode()!=='dynamic') return true;
  const currentTime=performance.now();
  if(currentTime-dynamicNotice>2500){
    dynamicNotice=currentTime;
    toast('Dynamic fog is rebuilt from the tokens, so painting it has no effect. Switch to manual or exploration to paint.');
  }
  return false;
}

function fogOp(fn){
  const s=sc(); if(!s||s.type!=='map') return;
  if(!fogPintable()) return;
  touchFog();
  const c=s.fogCtx;
  c.globalCompositeOperation = S.fogMode==='hide' ? 'source-over' : 'destination-out';
  c.strokeStyle=PAL.inkDeep; c.fillStyle=PAL.inkDeep;
  fn(c);
  c.globalCompositeOperation='source-over';
}
const fogStroke=(a,b)=>fogOp(c=>{ c.lineWidth=S.brush*2; c.lineCap='round'; c.lineJoin='round';
  c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(b.x,b.y); c.stroke(); });
const fogRect=(a,b)=>fogOp(c=>c.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y)));
const fogCell=p=>fogOp(c=>{ const cc=cal(), g=cc.gridPx, ox=cc.ox||0, oy=cc.oy||0;
  c.fillRect(Math.floor((p.x-ox)/g)*g+ox, Math.floor((p.y-oy)/g)*g+oy, g, g); });
const fogPoly=pts=>fogOp(c=>{ c.beginPath(); c.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++) c.lineTo(pts[i].x,pts[i].y); c.closePath(); c.fill(); });

/* ============ effects ============ */
function renderFxList(){
  touchScene();
  const box=$('effectList'); box.innerHTML='';
  const fx=shapes().filter(s=>s.kind==='effect');
  fx.forEach(s=>{
    const row=document.createElement('div');
    row.className='fxrow';
    const dot=document.createElement('div'); dot.className='dot'; dot.style.background=s.color;
    const nm=document.createElement('div'); nm.className='nm'; nm.textContent=s.name;
    const eye=document.createElement('button'); eye.textContent = s.hidden?'○':'●'; eye.title='Show on table';
    eye.onclick=()=>{ s.hidden=!s.hidden; renderFxList(); draw(); };
    const del=document.createElement('button'); del.textContent='×'; del.title='Remove';
    del.onclick=()=>{ push('shapes'); const a=sc().shapes; a.splice(a.indexOf(s),1);
      if(S.sel===s) S.sel=null; renderFxList(); clearAnimations(); draw(); };
    row.onmouseenter=()=>{ S.sel=s; draw(); };
    row.append(dot,nm,eye,del); box.appendChild(row);
  });
  $('effectHint').style.display = fx.length ? 'none' : 'block';
}


/* ============ first steps ============ */
/* Accurate scale distinguishes this app, but depends on two values users may not know:
   grid calibration and monitor size. Without them, the whole table can be out of scale.
   The checklist updates itself and disappears when no longer needed. */
function calibrationMark(){
  return campaignScenes().some(x => x.type==='map' && x.cal && x.cal.calibrated);
}
/* Two dismissal levels: the close button hides help until the next campaign or reload;
   "Don't show this again" disables it permanently. Steps 1 and 2 are campaign-specific,
   so a new campaign restores them unless help was permanently disabled. */
let hiddenSteps=false;
function renderSteps(){
  const box=$('onboard');
  const steps = [
    {ok: campaignScenes().some(x=>x.type==='map'),
     t:'Add a map', d:'Any image works, or a .uvtt file with its walls already in it.'},
    {ok: calibrationMark(),
     t:'Calibrate a square', d:'Press K and drag across one square of the map, so the app knows how big a square is.'},
    {ok: !!T.diagonalCalibrated,
     t:'Set your monitor size', d:'In the Table tab, enter the diagonal of the screen lying on the table.'},
    {ok: !!T.tableIsOpen,
     t:'Open the table view', d:'Drag it to that screen and click it for full screen.'}
  ];
  const visible = !(S.stepsNever || hiddenSteps || steps.every(p=>p.ok));
  /* The welcome panel mentioned only one of the required paths. It now points to the list,
     but only while the list is visible, so it never targets something off-screen. */
  const eco=$('emptySteps'); if(eco) eco.style.display = visible ? 'block' : 'none';
  if(!visible){ box.classList.remove('on'); return; }
  box.classList.add('on');
  const ol=$('steps'); ol.innerHTML='';
  let firstPending=true;
  for(const p of steps){
    const li=document.createElement('li');
    li.className = p.ok ? 'ok' : (firstPending ? 'now' : '');
    if(!p.ok) firstPending=false;
    const b=document.createElement('b'); b.textContent=p.t;
    const d=document.createElement('span'); d.textContent=p.d;
    li.append(b,d); ol.appendChild(li);
  }
}
$('onboardClose').onclick=()=>{ hiddenSteps=true; renderSteps(); };
$('onboardNever').onclick=()=>{
  S.stepsNever=true; touchState(); renderSteps();
  toast('Getting started hidden. It comes back if you start a new campaign from scratch… unless you keep this off.');
};

const campaignSystem = createCampaignSystem({
  $, S, CAMP, LIB, DB, DIRTY_STATE, T, PAL, dbPut, dbDel, loadCampaignState, flush,
  renderInitiativeList:(...args)=>combatSystem.renderInitiativeList(...args), renderLibrary, selectScene, draw, toast, touchState, requestConfirm, releaseScene, tokenOf,
  newInitiativeId:()=>iniUid++, onCreateCampaign:()=>{hiddenSteps=false;}
});
const { activeCampaign, players, playerById, saveCampaign, touchCampaign, createCampaign, switchCampaign, campaignScenes,
  renderCampaignSelector, renderTokenSelector, renderPlayers, addToCombat, allToCombat, syncPlayer, longRest, undoLongRest, deleteCampaign,
  openPlayer, closePlayer, savePlayer } = campaignSystem;

/* Use a custom tooltip; the browser's native one is delayed and sometimes missing. */
function attachTip(el, text){
  el.addEventListener('mouseenter', ()=>{
    const t=$('tip');
    t.textContent=text; t.style.display='block';
    const r=el.getBoundingClientRect(), tw=t.offsetWidth;
    t.style.left=Math.max(6, Math.min(innerWidth-tw-6, r.left+r.width/2-tw/2))+'px';
    t.style.top=Math.max(6, r.top-t.offsetHeight-6)+'px';
  });
  el.addEventListener('mouseleave', ()=>{ $('tip').style.display='none'; });
  el.addEventListener('click', ()=>{ $('tip').style.display='none'; });
}

let combatSystem;
combatSystem = createCombatSystem({
  $, S, PAL, push, undo, draw, toast, touchState, syncPlayer, renderPlayers, attachTip,
  newInitiativeId:()=>iniUid++
});
const { CONDITIONS, CONDITION_MAP, conditionIcon, turnIdx, syncAll, renderInitiativeList,
  pushIniUndo, entryKey, clearEntry, nextTurn, openCombatant } = combatSystem;

/* ============ selection ============ */
function hitTest(wp){
  const s=sc(); if(!s||s.type!=='map') return null;
  const tol=8/S.view.k;
  for(let i=s.shapes.length-1;i>=0;i--){
    const sh=s.shapes[i]; if(sh.hidden) continue;
    const p=shapePath(sh), g=sh.geo||sh.type;
    if(FILLED.includes(g) && hit.isPointInPath(p,wp.x,wp.y)) return sh;
    hit.lineWidth=tol*2;
    if(hit.isPointInStroke(p,wp.x,wp.y)) return sh;
  }
  return null;
}
function handleAt(sp){
  const s=S.sel; if(!s) return null;
  for(const key of ['b','a']){
    if(!s[key]) continue;
    const p=w2s(s[key]);
    if(Math.hypot(sp.x-p.x,sp.y-p.y)<=9) return key;
  }
  return null;
}
function translateShape(s,dx,dy){
  s.a={x:s.a.x+dx,y:s.a.y+dy}; s.b={x:s.b.x+dx,y:s.b.y+dy};
  if(s.pts) s.pts=s.pts.map(p=>({x:p.x+dx,y:p.y+dy}));
}

/* ============ table view ============ */
let tableViewSystem;
function tableOpen(){ return tableViewSystem.tableOpen(); }
function tableScale(){ return tableViewSystem.tableScale(); }
function drawTable(){ tableViewSystem.drawTable(); }
function setBlack(value){ tableViewSystem.setBlack(value); }
tableViewSystem = createTableView({
  $, S, T, PAL, FADE, cal, sc, sceneOverlay, renderScene, drawInitiative, draw, touchState, touchScene, renderSteps, toast, updateScaleBar
});
const { openTable, closeTable, sizeTable, autoDpi, updateTableInfo, applyFilter, nudgeTable, syncTableUI } = tableViewSystem;

/* animation: pings, fades, and expired effects */
function animate(){
  const fading=performance.now()-T.fadeT<FADE+40;
  const hasAnimations = CAT.animationsActive && !document.hidden &&
                  (shapes().some(s=>s.anim&&!s.hidden) || (S.draft&&S.draft.anim));
  if(hasAnimations) refreshAnimations();
  if(S.pings.length||fading||hasAnimations){
    const now=performance.now();
    S.pings=S.pings.filter(g=>now-g.t<1100);
    draw();
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

/* Without a pointer position, place the copy one square away, as Ctrl+V normally does.
   With a pointer position from the map menu, place it there and use the first item as
   the reference so a group keeps its shape. */
function paste(pos){
  if(!S.clipboard.length || !sc()){ toast('Nothing copied yet.'); return; }
  push('shapes');
  const g=cal().gridPx, nuevos=[];
  const ref=S.clipboard[0];
  const dx = pos ? pos.x-ref.a.x : g;
  const dy = pos ? pos.y-ref.a.y : g;
  S.clipboard.forEach(x=>{
    const c=JSON.parse(JSON.stringify(x));
    /* The anchor belongs to the original placement, not the artwork; the copy starts free. */
    delete c.pin;
    c.a={x:c.a.x+dx,y:c.a.y+dy}; c.b={x:c.b.x+dx,y:c.b.y+dy};
    if(c.pts) c.pts=c.pts.map(p=>({x:p.x+dx,y:p.y+dy}));
    sc().shapes.push(c); nuevos.push(c);
  });
  S.selMulti=nuevos; S.sel=nuevos[nuevos.length-1]; S.selTokens=[];
  touchScene(); renderFxList(); syncCtxBar(); draw();
  toast(nuevos.length===1 ? '1 pasted.' : nuevos.length+' pasted.');
}

/* ============ pin by choosing a player ============ */
/* Pinning previously required selecting a token first, so an effect placed without one
   had to be deleted and placed again with the mode enabled. Now the app waits for the
   effect to be selected, then for a player. */
function startPinning(formas){
  const fx=(formas||[]).filter(x=>x.kind==='effect');
  if(!fx.length){ toast('Pick an effect first.'); return; }
  if(!players().some(j=>tokenOf(j))){
    toast('No player tokens on this map yet — place one with J first.'); return;
  }
  S.pinning=fx;
  const name = fx.length===1 ? (fx[0].name || shapeLabel(fx[0]) || 'this effect')
                            : fx.length+' effects';
  $('anchorText').innerHTML='Select a player to anchor <b></b> to.';
  $('anchorText').querySelector('b').textContent=name;
  $('anchorNotice').classList.add('on');
  toolCursor(); draw();
}
function cancelPinning(callado){
  if(!S.pinning) return;
  S.pinning=null;
  $('anchorNotice').classList.remove('on');
  toolCursor(); draw();
  if(!callado) toast('Pinning cancelled.');
}
function finishPinning(j){
  const fx=S.pinning; if(!fx) return;
  push('shapes');
  fx.forEach(x=>{ x.pin=j.id; });
  S.pinning=null;
  $('anchorNotice').classList.remove('on');
  toolCursor();
  touchScene(); syncCtxBar(); draw();
  toast(fx.length===1 ? 'Pinned to '+j.character+'. It follows them now.'
                      : fx.length+' effects pinned to '+j.character+'.');
}
$('anchorCancel').onclick=()=>cancelPinning();

/* ============ map menu ============ */
/* Right-click was captured and discarded with only preventDefault, despite already
   being used to delete a scene and mark a favorite. */
function closeMapMenu(){
  const m=$('mapMenu');
  if(!m.classList.contains('hide')){ m.classList.add('hide'); cv.focus?.(); }
}
function openMapMenu(sp, title, items){
  const m=$('mapMenu');
  m.innerHTML='';
  if(title){ const c=document.createElement('div'); c.className='header'; c.textContent=title; m.appendChild(c); }
  for(const it of items){
    if(it==='-'){ const s=document.createElement('div'); s.className='sepm'; m.appendChild(s); continue; }
    const b=document.createElement('button');
    b.type='button'; b.setAttribute('role','menuitem'); b.textContent=it.label;
    if(it.danger) b.className='danger';
    b.onclick=()=>{ closeMapMenu(); it.action(); };
    m.appendChild(b);
  }
  m.classList.remove('hide');
  /* Place it at the pointer while keeping it inside the window. */
  const r=m.getBoundingClientRect();
  m.style.left = Math.max(6, Math.min(sp.x, innerWidth  - r.width  - 8)) + 'px';
  m.style.top  = Math.max(6, Math.min(sp.y, innerHeight - r.height - 8)) + 'px';
  const first=m.querySelector('button');
  if(first) first.focus();
}
/* Handle arrows and Escape inside the menu without passing them to the map; arrows move
   the table framing from anywhere. */
$('mapMenu').addEventListener('keydown', e=>{
  e.stopPropagation();
  const bs=[...$('mapMenu').querySelectorAll('button')];
  const i=bs.indexOf(document.activeElement);
  if(e.key==='Escape'){ closeMapMenu(); e.preventDefault(); }
  else if(e.key==='ArrowDown'){ bs[(i+1)%bs.length]?.focus(); e.preventDefault(); }
  else if(e.key==='ArrowUp'){ bs[(i-1+bs.length)%bs.length]?.focus(); e.preventDefault(); }
});
addEventListener('pointerdown', e=>{ if(!$('mapMenu').contains(e.target)) closeMapMenu(); }, true);
addEventListener('wheel', closeMapMenu, {passive:true});

/* ============ interaction ============ */
/* Handle picking from the map in one place. The selection tool and any other tool can
   use it while Ctrl (Cmd on Mac) is held, like the existing spacebar pan shortcut:
   temporarily borrow the tool without changing it. Follow draw order, checking tokens
   first because they appear above everything else. */
function selectionAtPoint(e, sp, wp){
  const j=tokenAt(wp);
  if(j){
    if(e.shiftKey){
      const i=S.selTokens.indexOf(j);
      if(i<0) S.selTokens.push(j); else S.selTokens.splice(i,1);
      S.tokenSel = S.selTokens[S.selTokens.length-1] || null;
      syncCtxBar(); renderPlayers(); draw(); return;
    }
    /* Picking an item already in the selection keeps the group selected, so it can be
       dragged from any of its parts. */
    if(!S.selTokens.includes(j)){ S.selTokens=[j]; S.sel=null; S.selMulti=[]; }
    S.tokenSel=j;
    push('shapes');
    S.drawing={kind:'move', w0:wp};
    syncCtxBar(); renderPlayers(); draw(); return;
  }
  const h=handleAt(sp);
  if(h){ push('shapes'); S.drawing={kind:'handle',key:h}; return; }
  const found=hitTest(wp);
  /* One rule throughout the app: Shift adds or removes, a plain click replaces, and empty
     space clears the selection unless Shift is held. */
  if(found && e.shiftKey){
    const i=S.selMulti.indexOf(found);
    if(i<0) S.selMulti.push(found); else S.selMulti.splice(i,1);
    S.sel = S.selMulti[S.selMulti.length-1] || null;
    syncCtxBar(); draw(); return;
  }
  if(!found){
    if(!e.shiftKey) clearSelection();
    syncCtxBar(); draw(); return;
  }
  if(!S.selMulti.includes(found)){ S.selMulti=[found]; S.selTokens=[]; }
  S.sel=found;
  push('shapes'); S.drawing={kind:'move',w0:wp};
  syncCtxBar(); draw();
}
const evPos=e=>({x:e.clientX,y:e.clientY});
const MEASURE_TOOLS=['measure'];
const MEASURE_SHAPES=['line','circle','cone','square','wall','free'];

cv.addEventListener('pointerdown', e=>{
  cv.setPointerCapture(e.pointerId);
  S.pointers.set(e.pointerId, evPos(e));
  if(S.pointers.size===2){
    const [p1,p2]=[...S.pointers.values()];
    S.pinch={d:Math.hypot(p2.x-p1.x,p2.y-p1.y),c:{x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2}};
    S.drawing=null; S.draft=null; S.panning=null; return;
  }
  if(S.pointers.size>1) return;

  const sp=evPos(e);
  /* Ctrl borrows the selection tool from ANY tool, including hand/pan. Previously pan was
     decided first and consumed the modifier, so borrowing worked for ten tools but not
     the eleventh—worse than not having it. */
  const grabbing = e.button===0 && (e.ctrlKey || e.metaKey) && !S.spaceDown;
  const wantPan = !grabbing && (e.button===1 || S.spaceDown || S.tool==='pan');
  if(wantPan){ S.panning={sx:sp.x,sy:sp.y,vx:S.view.x,vy:S.view.y}; return; }
  const s=sc(); if(!s) return;
  const wp=s2w(sp);
  if(s.type==='image'){
    if(S.tool==='pointer'){ S.pings.push({x:wp.x,y:wp.y,t:performance.now()}); S.drawing={kind:'pointer'}; draw(); }
    return;
  }

  /* While waiting for a player, clicks are reserved for that choice. An invalid click
     shows a notice and keeps waiting; cancelling on a stray click would be worse. */
  if(S.pinning){
    const j=tokenAt(wp);
    if(j) finishPinning(j);
    else toast('Click a player token, or Cancel.');
    return;
  }

  /* Ctrl temporarily borrows the selection tool without dropping the current one: place
     an effect, pick the nearby token, move it, then keep placing without crossing the rail.
     Handle this first so it always means the same thing. Left button only: on Mac, Ctrl
     with other buttons is the system right-click. */
  if(grabbing && S.tool!=='sel'){ selectionAtPoint(e, sp, wp); return; }

  if(S.tool==='pointer'){ S.pings.push({x:wp.x,y:wp.y,t:performance.now()}); S.drawing={kind:'pointer'}; draw(); return; }
  if(S.tool==='frame'){ S.drawing={kind:'frame',w0:wp,c0:{...s.center}}; return; }
  /* Pinning returns to the measurement tool. It used to set 'line', once a tool name but
     now only a shape, leaving S.tool unrecognized by pointerdown and syncCtxBar and making
     the bar empty and map unresponsive. */
  if(S.tool==='anchor'){ S.anchor=snapPoint(wp); setTool('measure'); toast('Origin anchored. Press again to release.'); draw(); return; }

  /* Selection is handled entirely by selectionAtPoint(); this handles tokens only, dragging
     one if present or placing one otherwise. */
  if(S.tool==='sel'){ selectionAtPoint(e, sp, wp); return; }
  if(S.tool==='token'){
    const j=tokenAt(wp);
    if(j){
      S.tokenSel=j;
      S.drawing={kind:'token', j};
      renderPlayers(); draw(); return;
    }
    const target = S.tokenSel || players().find(x=>!tokenOf(x)) || players()[0];
    if(!target){ toast('Add players to the campaign to place their tokens.'); return; }
    /* Clicking empty space used to place the selected player even if already on the map.
       Selecting one from the list (or right-clicking) and touching the map could teleport it.
       Once placed, move it only by dragging. */
    if(tokenOf(target)){
      toast(target.character+' is already on this map — drag the token to move them.');
      return;
    }
    moveToken(target, snapPoint(wp));
    S.tokenSel=target;
    if(fogMode()==='dynamic') recalculateVision();
    renderPlayers(); draw(); return;
  }

  if(S.tool==='occlusion'){
    const tol=10/S.view.k;
    /* Shift adds or removes from the selection, as elsewhere in the app. Start a wall over
       another with the New wall button, not a modifier, leaving Shift free for selection.
       Alt splits a segment. */
    if(!S.wallDraft && !S.wallNew){
      const v=vertexAt(wp,tol);
      if(v){
        selectWall(v.wall);                               // the whole wall, ready to edit
        S.drawing={kind:'vertice', ...v};
        syncCtxBar(); draw(); return;
      }
      const w=wallAt(wp,tol);
      if(w){
        if(e.altKey){
          push('walls');
          const i=insertVertex(w.wall, w.seg, snapPoint(wp));
          if(i!=null){
            selectWall(w.wall);
            S.drawing={kind:'vertice', wall:w.wall, i};              // remains selected, ready to place
            touchScene(); recalculateVision(); syncCtxBar(); draw();
            toast('Vertex added. Drag to place it.');
          }
          return;
        }
        selectSegment(w.wall, w.seg, e.shiftKey);
        syncCtxBar(); draw(); return;
      }
      if(!e.shiftKey) clearSelectedWalls();                // click empty space to clear the selection
    }
    if(!S.wallDraft) S.wallDraft={pts:[], mode:S.wallMode};
    S.wallDraft.pts.push(snapPoint(wp));
    /* Single segment: finish on the second click. Multi-segment and polygon tools collect
       vertices until a double-click or Enter. */
    if(S.wallMode==='segment' && S.wallDraft.pts.length>=2) closeWall();
    draw(); return;
  }

  if(S.tool==='fog'){
    if(S.fogShape==='lasso'){
      if(!S.lasso) S.lasso=[];
      S.lasso.push(wp); draw(); return;
    }
    push('fog');
    if(S.fogShape==='brush'){ S.drawing={kind:'fog',last:wp}; fogStroke(wp,wp); }
    else if(S.fogShape==='cells'){ S.drawing={kind:'cells'}; fogCell(wp); }
    else { S.drawing={kind:'fogrect',a:wp};
      S.draft={geo:'square',rectFree:true,a:wp,b:wp,color:S.fogMode==='hide'?PAL.fog:PAL.measure}; }
    draw(); return;
  }

  if(S.tool==='calibrate'){ S.draft={type:'calibrate',geo:'calibrate',a:wp,b:wp,color:PAL.danger}; S.drawing={kind:'shape'}; draw(); return; }

  if(S.tool==='effect' && S.fxGeo==='poly'){
    S.draft={kind:'effect', geo:'poly', pts:[wp], a:wp, b:wp, color:S.fxPreset.color,
             pat:S.fxPreset.pat, name:S.fxPreset.name};
    S.drawing={kind:'polyfree'}; draw(); return;
  }
  /* In Pin-to-token mode, placing an effect on a player attaches it, using the same click
     as placing it on a grid square. */
  const anchorA = (S.tool==='effect' && S.snap.effect==='token' && !S.anchor)
                   ? nearbyToken(wp) : null;
  if(S.tool==='effect' && S.animSel){
    const e=S.animSel, gp=cal().gridPx;
    const a=S.anchor||snapPoint(wp);
    /* Native size: effect resolution at 100 pixels per grid square. */
    const nat = (e.g==='wall'||e.g==='cone') ? e.sq*gp : (e.sq/2)*gp;
    const b = (e.g==='wall'||e.g==='cone') ? {x:a.x+nat, y:a.y} : {x:a.x+nat, y:a.y};
    S.draft={kind:'effect', anim:e.p, geo:e.g, a, b, color:'#FFD86B', name:e.s,
             alpha:S.fxAlpha, blend:S.fxBlend};
    if(anchorA) S.draft.pin=anchorA.id;
    S.drawing={kind:'shape'}; draw(); return;
  }
  if(S.tool==='effect'){
    const a=S.anchor||snapPoint(wp);
    if(S.fxGeo==='poly'){
      S.draft={kind:'effect', preset:S.fxPreset.id, geo:'poly', pts:[wp], a:wp, b:wp,
               color:S.fxPreset.color, pat:S.fxPreset.pat, name:S.fxPreset.name,
               alpha:S.fxAlpha};
      if(anchorA) S.draft.pin=anchorA.id;
      S.drawing={kind:'polyfree'}; draw(); return;
    }
    S.draft={kind:'effect', preset:S.fxPreset.id, geo:S.fxGeo, a, b:snapPoint(wp),
             color:S.fxPreset.color, pat:S.fxPreset.pat, name:S.fxPreset.name,
             w:S.wallW, alpha:S.fxAlpha};
    if(anchorA) S.draft.pin=anchorA.id;
    S.drawing={kind:'shape'}; draw(); return;
  }
  if(S.tool==='measure'){
    if(S.measureShape==='free'){
      S.draft={kind:'measure',geo:'free',pts:[wp],a:wp,b:wp,color:S.color};
      S.drawing={kind:'free'}; draw(); return;
    }
    const a=S.anchor||snapPoint(wp);
    const fixed = S.measureDistance>0 ? S.measureDistance : null;
    let b = snapPoint(wp);
    if(fixed){
      /* With a fixed distance, the stroke starts at its final size, so one click is enough. */
      const c=cal(); b={x:a.x+(fixed/c.unitVal)*c.gridPx, y:a.y};
    }
    S.draft={kind:'measure',geo:S.measureShape,a,b,color:S.color,w:S.wallW,fixed};
    S.drawing={kind:'shape'}; draw(); return;
  }
});

cv.addEventListener('pointermove', e=>{
  const sp=evPos(e);
  S.cursor=sp;
  if(sc()) S.cursorWorld=s2w(sp);
  if(S.pointers.has(e.pointerId)) S.pointers.set(e.pointerId,sp);

  if(S.pinch&&S.pointers.size>=2){
    const [p1,p2]=[...S.pointers.values()];
    const d=Math.hypot(p2.x-p1.x,p2.y-p1.y), c={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2};
    zoomAt(c.x,c.y,d/S.pinch.d);
    S.view.x+=c.x-S.pinch.c.x; S.view.y+=c.y-S.pinch.c.y;
    S.pinch={d,c}; draw(); return;
  }
  if(S.panning){
    S.view.x=S.panning.vx+(sp.x-S.panning.sx);
    S.view.y=S.panning.vy+(sp.y-S.panning.sy);
    draw(); return;
  }
  if(S.drawing){
    const wp=s2w(sp), d=S.drawing;
    if(d.kind==='fog'){ fogStroke(d.last,wp); d.last=wp; }
    else if(d.kind==='cells'){ fogCell(wp); }
    else if(d.kind==='fogrect'){ S.draft.b=wp; }
    else if(d.kind==='free'){ S.draft.pts.push(wp); S.draft.b=wp; }
    else if(d.kind==='polyfree'){
      const l=S.draft.pts[S.draft.pts.length-1];
      if(Math.hypot(wp.x-l.x,wp.y-l.y) > 3/S.view.k) S.draft.pts.push(wp);
      const bb=bbox(S.draft.pts);
      S.draft.a={x:(bb.x0+bb.x1)/2, y:(bb.y0+bb.y1)/2};
      S.draft.b={x:bb.x1, y:bb.y0};
    }
    else if(d.kind==='frame'){ const s=sc();
      s.center.x=d.c0.x+(wp.x-d.w0.x); s.center.y=d.c0.y+(wp.y-d.w0.y); }
    else if(d.kind==='move'){
      const dx=wp.x-d.w0.x, dy=wp.y-d.w0.y;
      const group = S.selMulti.length ? S.selMulti : (S.sel?[S.sel]:[]);
      /* A selected pinned effect beside its token would move twice, once with the group and
         once with the token. Move it only with the token. */
      const conToken = new Set(S.selTokens.map(j=>j.id));
      const alreadyMoved = new Set(group.filter(x=>x.pin && conToken.has(x.pin)));
      group.forEach(x=>{ if(!alreadyMoved.has(x)) translateShape(x,dx,dy); });
      /* Move group tokens by offset without snapping; when dragging a group, keep its members
         aligned with each other. */
      for(const j of S.selTokens){
        const t=tokenOf(j);
        if(t) moveToken(j, {x:t.x+dx, y:t.y+dy});
      }
      d.w0=wp;
    }
    else if(d.kind==='handle'){
      /* Resizing follows the shape type, not the selection tool. */
      const mode = S.sel && S.sel.kind==='effect' ? S.snap.effect : S.snap.measure;
      const np = mode!=='none' ? snapPoint(wp, mode) : wp;
      if(d.key==='b'){
        if(S.sel.geo==='poly' && S.sel.pts){
          const a=S.sel.a, d0=dist(a,S.sel.b)||1, d1=dist(a,np)||1, f=Math.max(0.15,d1/d0);
          S.sel.pts=S.sel.pts.map(q=>({x:a.x+(q.x-a.x)*f, y:a.y+(q.y-a.y)*f}));
          const bb=bbox(S.sel.pts); S.sel.b={x:bb.x1,y:bb.y0};
        } else S.sel.b=np;
      }
      else { const dx=np.x-S.sel.a.x, dy=np.y-S.sel.a.y; translateShape(S.sel,dx,dy); }
    }
    else if(d.kind==='token'){ moveToken(d.j, snapPoint(wp)); }
    else if(d.kind==='vertice'){ d.wall.pts[d.i]=snapPoint(wp); touchScene(); }
    else if(d.kind==='pointer'){     /* move the pointer only */ }
    else if(S.draft.fixed){
      /* With a fixed distance, dragging rotates the stroke without changing its size. */
      const c=cal(), largo=(S.draft.fixed/c.unitVal)*c.gridPx;
      const dx=wp.x-S.draft.a.x, dy=wp.y-S.draft.a.y, l=Math.hypot(dx,dy);
      if(l>1){ S.draft.b={x:S.draft.a.x+dx/l*largo, y:S.draft.a.y+dy/l*largo}; }
    }
    else { S.draft.b = S.draft.geo==='calibrate' ? wp : snapPoint(wp); }
    draw();
    const lbl = S.draft ? shapeLabel(S.draft) : (S.sel?shapeLabel(S.sel):null);
    if(lbl && d.kind!=='fog' && d.kind!=='cells') showReadout(sp,lbl);
    return;
  }
  if(S.tool==='fog'||S.tool==='pointer'||S.tool==='frame'||S.lasso||S.wallDraft) draw();
});

function endPointer(e){
  S.pointers.delete(e.pointerId);
  if(S.pointers.size<2) S.pinch=null;
  if(S.panning){ S.panning=null; return; }
  if(!S.drawing) return;
  const kind=S.drawing.kind; S.drawing=null; hideReadout();
  const s=sc();

  if(kind==='fogrect'&&S.draft){ fogRect(S.draft.a,S.draft.b); S.draft=null; draw(); return; }
  if(kind==='token'){ touchScene(); recalculateVision(); renderPlayers(); draw(); return; }
  if(kind==='vertice'){ touchScene(); recalculateVision(); draw(); return; }
  if(['fog','cells','frame','pointer','move','handle'].includes(kind)){
    /* If the group included tokens, recalculate visibility on release rather than every
       drag frame. */
    if(kind==='move' && S.selTokens.length){ recalculateVision(); renderPlayers(); }
    touchScene(); renderFxList(); draw(); return;
  }
  if(!S.draft) return;

  if(S.draft.geo==='calibrate'){
    const n=Math.max(1,parseInt($('calSquares').value)||1);
    const px=dist(S.draft.a,S.draft.b)/n;
    if(px>2){ cal().gridPx=Math.round(px*100)/100; $('gridPx').value=cal().gridPx;
      cal().calibrated=true; renderSteps();
      toast('Square calibrated: '+cal().gridPx+' px = '+fmt(cal().unitVal)); }
    S.draft=null; setTool('pan'); updateScaleBar(); draw(); return;
  }
  const moved = (S.draft.geo==='free'||S.draft.geo==='poly')
      ? S.draft.pts.length>3 : dist(S.draft.a,S.draft.b)>2/S.view.k;
  if(moved && (S.draft.kind==='effect'||S.persist)){
    push('shapes'); s.shapes.push(S.draft); touchScene();
    if(S.draft.kind==='effect'){ S.sel=S.draft; S.selMulti=[S.draft]; renderFxList(); }
    /* Place an animation once. Previously it stayed loaded and the next click placed another
       by accident; use Duplicate in the right-click menu to repeat it. Switch to selection
       after placement so the new effect can be moved immediately. */
    if(S.draft.anim){
      S.animSel=null; CAT.sel=null; renderCatalog();
      setTool('sel'); syncCtxBar();
    }
  }
  S.draft=null; draw();
}
cv.addEventListener('pointerup',endPointer);
cv.addEventListener('pointercancel',endPointer);
cv.addEventListener('contextmenu', e=>{
  /* Always suppress the browser menu, whether or not a modifier is held. */
  e.preventDefault();
  /* On Mac, Ctrl-click is system right-click: pointerdown arrives with button 0 and
     ctrlKey, starts borrowing the selection tool, then this event opens the menu during
     the drag. A held borrowing modifier means the menu was not requested. Keep the menu
     on the right button, which is a two-finger trackpad click. */
  if(e.ctrlKey || e.metaKey) return;
  const s=sc(); if(!s || s.type!=='map') return;
  const sp=evPos(e), wp=s2w(sp);
  const j=tokenAt(wp);
  const shape = j ? null : hitTest(wp);
  /* Clicking an already-selected item keeps the selection, so the menu acts on the whole
     group as expected. */
  if(j){
    if(!S.selTokens.includes(j)){ S.selTokens=[j]; S.sel=null; S.selMulti=[]; }
    S.tokenSel=j;
  } else if(shape){
    if(!S.selMulti.includes(shape)){ S.selMulti=[shape]; S.selTokens=[]; }
    S.sel=shape;
  }
  syncCtxBar(); draw();

  const items=[];
  let title=null;
  if(j){
    title=j.character;
    const attachedEffects=pinned(j);
    if(attachedEffects.length) items.push({label:'Release '+(attachedEffects.length===1?'the pinned effect'
                                   :attachedEffects.length+' pinned effects'),
                                  action:()=>{ push('shapes'); releaseAnchors(j.id);
                                              touchScene(); syncCtxBar(); draw();
                                              toast('Released.'); }});
    items.push({label:'Remove from map', danger:true, action:()=>{ S.tokenSel=j; $('removeToken').click(); }});
  } else if(shape){
    const n=S.selMulti.length;
    title = n>1 ? n+' selected' : (shape.name || shapeLabel(shape) || 'Stroke');
    items.push({label:'Bring forward', action:()=>$('btnMoveUp').click()},
               {label:'Send back',     action:()=>$('btnMoveDown').click()});
    if(n<2) items.push({label:'Duplicate', action:()=>$('btnDup').click()});
    const fxSel=S.selMulti.filter(x=>x.kind==='effect');
    if(fxSel.length && fxSel.some(x=>x.pin))
      items.push({label:'Unpin from token', action:()=>{ push('shapes');
        fxSel.forEach(x=>delete x.pin); touchScene(); syncCtxBar(); draw(); toast('Released.'); }});
    else if(fxSel.length && S.selTokens.length===1)
      items.push({label:'Pin to '+S.selTokens[0].character, action:()=>$('btnPin').click()});
    /* Do not offer pinning when the map has no player tokens. */
    else if(fxSel.length && players().some(x=>tokenOf(x)))
      items.push({label:'Pin to player…', action:()=>startPinning(fxSel)});
    items.push('-', {label:'Delete', danger:true, action:()=>$('btnDelete').click()});
  } else {
    if(S.clipboard.length) items.push({label:'Paste here', action:()=>paste(wp)});
    if(s.shapes.some(x=>x.kind!=='effect'))
      items.push({label:'Clear measurements', action:()=>$('btnClearMeasures').click()});
  }
  if(!items.length) return;
  openMapMenu(sp, title, items);
});
cv.addEventListener('dblclick',ev=>{
  if(S.lasso&&S.lasso.length>2) closeLasso();
  else if(S.wallDraft) closeWall();
  else if(S.tool==='occlusion'){
    /* Double-click selects the whole wall, useful for setting a long hallway or all sides
       of a room to one direction. */
    const w=wallAt(s2w(evPos(ev)), 10/S.view.k);
    if(w){ selectWall(w.wall); syncCtxBar(); draw();
           toast(segCount(w.wall)+' segments selected.'); }
  }
});
cv.addEventListener('wheel',e=>{ e.preventDefault(); zoomAt(e.clientX,e.clientY,e.deltaY<0?1.12:1/1.12); },{passive:false});

function closeLasso(){
  if(!S.lasso||S.lasso.length<3){ S.lasso=null; draw(); return; }
  push('fog'); fogPoly(S.lasso); S.lasso=null; draw();
}
function showReadout(sp,t){
  if(!t){ hideReadout(); return; }
  readout.textContent=t; readout.style.display='block';
  readout.style.left=(sp.x+18)+'px'; readout.style.top=(sp.y-34)+'px';
  readout.style.color = S.tool==='calibrate' ? PAL.danger : (S.draft?S.draft.color:S.color);
}
function hideReadout(){ readout.style.display='none'; }

/* ============ tools and context bar ============ */
function setTool(t){
  if(S.tool==='fog'&&t!=='fog') S.lasso=null;
  /* Changing tools should clear all selection highlights. */
  if(t!==S.tool){
    S.wallDraft=null;
    if(t!=='occlusion') clearSelectedWalls();
    if(t!=='sel' && t!=='effect'){ S.sel=null; S.selMulti=[]; }
    if(t!=='sel') S.selTokens=[];
    if(t!=='token' && t!=='sel') S.tokenSel=null;
    hideReadout();
  }
  closeMapMenu(); cancelPinning(true);
  S.tool=t;
  /* Intentionally outside the condition above: clicking the current tool again restores
     its guide if closed. Changing tools does not force it; once closed, it stays closed. */
  showHint(t);
  document.querySelectorAll('#rail button').forEach(b=>b.classList.toggle('on',b.dataset.tool===t));
  $('btnCalibrate').classList.toggle('on',t==='calibrate');
  $('btnFrame').classList.toggle('on',t==='frame');
  toolCursor();
  syncCtxBar(); draw();
}
function toolCursor(){
  const t=S.tool;
  /* An invisible mode is no mode at all: while space or Ctrl is held, the cursor shows
     which tool was borrowed. */
  if(S.spaceDown){ cv.style.cursor='grab'; return; }
  if(S.pinning){ cv.style.cursor='crosshair'; return; }
  if(S.selDown && t!=='sel'){ cv.style.cursor='default'; return; }
  cv.style.cursor = t==='pan'?'grab' : t==='pointer'?'none' : t==='sel'?'default'
    : t==='frame'?'move'
    /* Hide the system cursor only when drawing a custom one, for brush and cell tools.
       Rectangle and lasso draw no custom cursor, so hiding it made them unusable. */
    : (t==='fog' && (S.fogShape==='brush' || S.fogShape==='cells')) ? 'none'
    : t==='token'?'pointer' : 'crosshair';
}
/* Each tool has a guide that appears when selected and can be closed. Clicking the
   current tool again restores it. Remember dismissal per tool across sessions; showing
   eleven guides on every tool change would make the help itself an obstruction. */
const TOOL_HINTS = {
  occlusion: {title:'Walls', rows:[
    ['Click','select segment'], ['Shift','add / remove'], ['Double','whole wall'],
    ['Alt','split'], ['Ctrl','grab'], ['Enter','finish'], ['Ctrl+Z','back one vertex']
  ]},
  pan: {title:'Pan and zoom', rows:[
    ['Drag','move the view'], ['Wheel','zoom'], ['Space','pan from any tool'],
    ['Tab','next scene'], ['H','hide the panel']
  ]},
  sel: {title:'Select and move', rows:[
    ['Click','pick — tokens win'], ['Shift','add / remove'],
    ['Drag','move the lot'], ['Right-click','menu'], ['Del','delete'], ['Esc','let go']
  ]},
  measure: {title:'Measure', rows:[
    ['Drag','draw'], ['Keep','off = vanishes'], ['Fix','distance, one click'],
    ['O','anchor the origin'], ['R C N Q W D','shapes'], ['Ctrl','grab']
  ]},
  effect: {title:'Effects', rows:[
    ['Catalog','pick, then drag'], ['Right-click a tile','favourite'],
    ['Pin to token','drops onto a player'], ['Ctrl','grab'],
    ['They stay','until deleted']
  ]},
  fog: {title:'Fog of war', rows:[
    ['Hide / Reveal','stroke direction'], ['Drag','paint'],
    ['Lasso','corners, Enter to close'], ['Dynamic','rebuilt from tokens'],
    ['Ctrl','grab']
  ]},
  token: {title:'Player tokens', rows:[
    ['Click','place'], ['Drag','move'], ['Vision','what exploring reveals'],
    ['Select tool','takes tokens too']
  ]},
  pointer: {title:'Table pointer', rows:[
    ['Click','ping the table'], ['Fades','after a second'], ['Images too','only tool that does']
  ]},
  calibrate: {title:'Calibrate', rows:[
    ['Drag','across a row of squares'], ['Squares','set the count on the bar'],
    ['Table scale','comes from this']
  ]},
  frame: {title:'Table framing', rows:[
    ['Drag','move what the table shows'], ['Arrows','one pixel'], ['Shift+arrow','one square'],
    ['Your zoom','never moves it']
  ]},
  anchor: {title:'Anchored origin', rows:[
    ['Click','fix the origin'], ['Then','everything starts there'], ['O','release']
  ]}
};
function showHint(tool){
  const p=TOOL_HINTS[tool], box=$('toolHintBar');
  box.innerHTML='';
  if(!p){ box.classList.remove('on'); return; }
  for(const [k,d] of p.rows){
    const s=document.createElement('span'); s.className='fi';
    const b=document.createElement('b'); b.textContent=k;
    const t=document.createElement('span'); t.textContent=d;
    s.append(b,t); box.appendChild(s);
  }
  box.classList.add('on');
}

/* Replace a <select> with segments without changing its behavior: the hidden <select>
   remains the source of truth, so .value and 'change' listeners keep working. Apply only
   where labels are one word; "Multi-segment wall" would break the bar. */
const SEGS=[];
function segment(id){
  const sel=$(id); if(!sel || sel.dataset.seg) return;
  sel.dataset.seg='1';
  sel.style.display='none';
  const box=document.createElement('span');
  box.className='segs';
  box.setAttribute('role','group');
  if(sel.title) box.setAttribute('aria-label', sel.title);
  sel.parentNode.insertBefore(box, sel.nextSibling);
  const par={sel, box};
  SEGS.push(par); drawSegments(par);
}
function drawSegments({sel, box}){
  box.innerHTML='';
  for(const o of sel.options){
    if(o.hidden) continue;
    const b=document.createElement('button');
    b.type='button'; b.textContent=o.textContent;
    b.setAttribute('aria-pressed', String(o.value===sel.value));
    b.classList.toggle('on', o.value===sel.value);
    b.onclick=()=>{
      if(sel.value===o.value) return;
      sel.value=o.value;
      sel.dispatchEvent(new Event('change'));
      drawAllSegments();
    };
    box.appendChild(b);
  }
}
function drawAllSegments(){ for(const s of SEGS) drawSegments(s); }

function syncCtxBar(){
  const t=S.tool;
  const show = {
    measure: MEASURE_TOOLS.includes(t),
    effect: t==='effect',
    fog: t==='fog',
    sel: t==='sel',
    calibrate: t==='calibrate',
    occlusion: t==='occlusion',
    token: t==='token',
    clear: MEASURE_TOOLS.includes(t)
  };
  for(const k in show) $('grp-'+k).classList.toggle('on',show[k]);
  $('ctxbar').classList.toggle('empty', !Object.values(show).some(Boolean));
  /* Keep hidden controls in the layout; showing and hiding them would shift the bar and
     move the next click onto a different button. */
  $('wallWrap').style.visibility = (t==='measure' && S.measureShape==='wall') ? 'visible' : 'hidden';
  $('brushWrap').style.visibility = (S.fogShape==='brush') ? 'visible' : 'hidden';
  /* Each selector shows its tool's setting, which may not be "Free". */
  /* One control serves the four placement tools. It shows and changes only the active
     tool's setting: wall vertices use corners and tokens use centers, according to the
     board geometry rather than user preference. */
  const conPos = ['measure','effect','occlusion','token'].includes(t);
  $('grp-pos').classList.toggle('on', conPos);
  $('selectedPosition').querySelector('option[value="token"]').hidden = t!=='effect';
  if(conPos) $('selectedPosition').value = snapFor(t);
  $('wallNew').classList.toggle('on',S.wallNew);
  $('fogHide').classList.toggle('on',S.fogMode==='hide');
  $('fogShow').classList.toggle('on',S.fogMode==='show');
  $('btnAnchor').classList.toggle('on',!!S.anchor);
  /* The rail control also activates when an origin is set, not just while drawing.
     syncCtxBar() runs after setTool(), so this update takes precedence. */
  const railO=document.querySelector('#rail button[data-tool="anchor"]');
  if(railO) railO.classList.toggle('on', !!S.anchor || t==='anchor');
  if(t==='occlusion'){
    const list=walls();
    let segments=0, doors=0;
    let oneWay=0;
    for(const w of list){
      segments+=segCount(w);
      for(const t of segmentsOf(w)){ if(t.open) doors++; if(t.dir) oneWay++; }
    }
    $('wallCount').textContent = list.length+' walls · '+segments+' seg'
      + (doors ? ' · '+doors+' open' : '')
      + (oneWay ? ' · '+oneWay+' one-way' : '')
      + (S.selectedWalls.length ? ' · '+S.selectedWalls.length+' selected' : '');
  } else $('wallCount').textContent='';
  drawAllSegments();
  if(t==='token') renderTokenSelector();
  /* Show the button as soon as an effect is selected. With a token selected, pin directly;
     otherwise open player-choice mode. If already pinned, release it. */
  const fxSel = S.selMulti.filter(x=>x.kind==='effect');
  const alreadyAnchored = fxSel.length>0 && fxSel.every(x=>x.pin);
  $('btnPin').style.display = fxSel.length ? '' : 'none';
  $('btnPin').textContent = alreadyAnchored ? 'Unpin'
    : (S.selTokens.length===1 ? 'Pin to '+S.selTokens[0].character : 'Pin to player…');
  const nSel = S.selMulti.length + S.selTokens.length;
  $('selName').textContent = nSel>1
    ? nSel+' items selected'
    : (S.selTokens.length===1 ? S.selTokens[0].character
      : (S.sel ? (S.sel.name || shapeLabel(S.sel) || 'Stroke') : 'Nothing selected'));
  if(S.sel && S.sel.kind==='effect'){
    $('fxBlend').value = S.sel.blend || 'normal';
    $('fxAlpha').value = Math.round((S.sel.alpha!=null?S.sel.alpha:1)*100);
  }
}
document.querySelectorAll('#rail button').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
/* The same button toggles the anchor; this logic already belongs to the bar. */
document.querySelector('#rail button[data-tool="anchor"]').onclick=()=>$('btnAnchor').click();
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.tabpane').forEach(p=>p.classList.toggle('on',p.id==='tab-'+b.dataset.tab));
  /* Changing tabs ends any in-progress action: panning, drawing a wall, or selecting
     something. */
  if(['frame','occlusion','token','calibrate','anchor'].includes(S.tool)) setTool('pan');
  else { clearSelection(); clearSelectedWalls(); S.wallDraft=null; syncCtxBar(); draw(); }
});

/* palettes */
const swBox=$('swatches');
COLORS.forEach((c,i)=>{
  const b=document.createElement('button');
  b.className='sw'+(i===0?' on':''); b.style.background=c;
  b.onclick=()=>{ S.color=c; document.querySelectorAll('.sw').forEach(x=>x.classList.remove('on')); b.classList.add('on'); };
  swBox.appendChild(b);
});
const chipBox=$('fxchips');
EFFECTS.forEach((fx,i)=>{
  const b=document.createElement('button');
  b.className='chip'+(i===0?' on':''); b.style.color=fx.color;
  b.innerHTML='<i style="background:'+fx.color+'"></i>'+fx.name;
  b.onclick=()=>{
    S.fxPreset=fx; S.animSel=null; CAT.sel=null; S.fxGeo=fx.geo; $('fxGeo').value=fx.geo;
    if(CAT.loaded) renderCatalog();
    document.querySelectorAll('#fxchips .chip').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); setTool('effect');
  };
  chipBox.appendChild(b);
});

/* ============ controls ============ */
$('gridPx').oninput=e=>{ cal().gridPx=Math.max(4,parseFloat(e.target.value)||50);
  cal().calibrated=true; touchScene(); updateScaleBar(); renderSteps(); draw(); };
$('unitVal').oninput=e=>{ cal().unitVal=Math.max(0.1, parseFloat(e.target.value)||5);
  touchScene(); updateScaleBar(); draw(); };
$('unitName').oninput=e=>{ cal().unitName=e.target.value||'ft'; touchScene(); updateScaleBar(); draw(); };
 $('ruleSel').onchange=e=>{ cal().rule=e.target.value; touchScene(); draw(); };
$('gridOx').oninput=e=>{ cal().ox=parseFloat(e.target.value)||0; touchScene(); draw(); };
$('gridOy').oninput=e=>{ cal().oy=parseFloat(e.target.value)||0; touchScene(); draw(); };
$('showGrid').onchange=e=>{ S.showGrid=e.target.checked; draw(); };
$('btnCalibrate').onclick=()=>setTool('calibrate');
$('btnPin').onclick=()=>{
  const fx=S.selMulti.filter(x=>x.kind==='effect');
  if(!fx.length) return;
  if(fx.every(x=>x.pin)){
    push('shapes');
    fx.forEach(x=>delete x.pin);
    touchScene(); syncCtxBar(); draw();
    toast(fx.length===1 ? 'Effect released.' : fx.length+' effects released.');
    return;
  }
  const j=S.selTokens[0];
  if(!j){ startPinning(fx); return; }     // with no token selected, choose one
  push('shapes');
  fx.forEach(x=>{ x.pin=j.id; });
  touchScene(); syncCtxBar(); draw();
  toast(fx.length===1 ? 'Effect pinned to '+j.character+'.'
                      : fx.length+' effects pinned to '+j.character+'.');
};
const SLOT_POS = {effect:'effect', occlusion:'occlusion', token:'token'};
const positionSlot = t => SLOT_POS[t] || 'measure';
$('selectedPosition').onchange = e=>{
  S.snap[positionSlot(S.tool)] = e.target.value;
  touchState(); draw();
};
$('allPositions').onclick = ()=>{
  const v=$('selectedPosition').value;
  /* Pin-to-token only applies to effects; other items use the grid-square center. */
  const g = v==='token' ? 'center' : v;
  S.snap.measure=g; S.snap.occlusion=g; S.snap.token=g; S.snap.effect=v;
  touchState(); syncCtxBar(); draw();
  toast('Every tool now places on '+$('selectedPosition').selectedOptions[0].textContent.toLowerCase()+'.');
};
for(const id of ['measureShape','fxGeo','fogShape']) segment(id);
$('measureShape').onchange=e=>{ S.measureShape=e.target.value; $('wallWrap').style.visibility = S.measureShape==='wall'?'visible':'hidden'; };
$('measureDistance').oninput=e=>{ S.measureDistance=Math.max(0,parseFloat(e.target.value)||0); };
$('persist').onchange=e=>{ S.persist=e.target.checked; };
$('wallW').oninput=e=>{ S.wallW=Math.max(0.5,parseFloat(e.target.value)||1); if(S.sel){S.sel.w=S.wallW; draw();} };
$('btnAnchor').onclick=()=>{ if(S.anchor){ S.anchor=null; syncCtxBar(); draw(); } else setTool('anchor'); };
$('btnClearMeasures').onclick=()=>{ const s=sc(); if(!s) return; push('shapes');
  const keep=s.shapes.filter(x=>x.kind==='effect'); s.shapes.length=0; keep.forEach(x=>s.shapes.push(x));
  S.sel=null; draw(); };

$('fxGeo').onchange=e=>{ S.fxGeo=e.target.value; };
$('fxBlend').onchange=e=>{
  S.fxBlend=e.target.value;
  if(S.sel && S.sel.kind==='effect'){ S.sel.blend=S.fxBlend; touchScene(); draw(); }
};
$('animOn').onchange=e=>{ CAT.animationsActive=e.target.checked; touchState(); draw(); };
$('catSearch').oninput=e=>{ CAT.filter=e.target.value; renderCatalog(); };
$('catLevel').onchange=e=>{ CAT.level=e.target.value; renderCatalog(); };
$('fxAlpha').oninput=e=>{
  S.fxAlpha=parseFloat(e.target.value)/100;
  if(S.sel && S.sel.kind==='effect'){ S.sel.alpha=S.fxAlpha; touchScene(); draw(); }
};
$('btnClearFx').onclick=async ()=>{
  const s=sc(); if(!s) return;
  const n=s.shapes.filter(x=>x.kind==='effect').length;
  if(!n){ toast('No effects to clear.'); return; }
  if(!await requestConfirm('Clear effects',
      'The '+n+' effects on this map will be removed. Fog and measurements are untouched, and this can be undone.',
      'Clear', true)) return;
  push('shapes');
  const keep=s.shapes.filter(x=>x.kind!=='effect'); s.shapes.length=0; keep.forEach(x=>s.shapes.push(x));
  S.sel=null; touchScene(); renderFxList(); clearAnimations(); draw();
  toast('Effects cleared. Ctrl+Z to bring them back.');
};
$('btnClearAll').onclick=async ()=>{
  const s=sc(); if(!s) return;
  if(!s.shapes.length){ toast('The map is already clear.'); return; }
  if(!await requestConfirm('Clear map',
      'Effects and measurements will be removed. Fog is kept, and this can be undone.',
      'Clear', true)) return;
  push('shapes'); s.shapes.length=0;
  S.sel=null; touchScene(); renderFxList(); clearAnimations(); draw();
  toast('Map cleared. Ctrl+Z to bring it back.');
};

$('btnDelete').onclick=()=>{
  const group = S.selMulti.length ? [...S.selMulti] : (S.sel?[S.sel]:[]);
  const toks = [...S.selTokens];
  if(!group.length && !toks.length) return;
  push('shapes');
  const a=sc().shapes;
  group.forEach(x=>{ const i=a.indexOf(x); if(i>=0) a.splice(i,1); });
  /* Deleting a token removes it from THIS scene, never from the campaign. Its token data
     and hit points remain intact and return when it is placed again. */
  const t=tokens();
  toks.forEach(j=>{ delete t[j.id]; releaseAnchors(j.id); });
  clearSelection();
  touchScene(); renderFxList(); syncCtxBar();
  if(toks.length){ recalculateVision(); renderPlayers(); }
  draw();
  if(toks.length) toast(toks.length===1 ? toks[0].character+' taken off the map. Ctrl+Z to undo.'
                                        : toks.length+' tokens taken off the map. Ctrl+Z to undo.');
};
$('btnMoveUp').onclick=()=>{
  if(!S.sel) return; push('shapes');
  const a=sc().shapes, i=a.indexOf(S.sel);
  if(i>=0 && i<a.length-1){ a.splice(i,1); a.push(S.sel); touchScene(); draw(); }
};
$('btnMoveDown').onclick=()=>{
  if(!S.sel) return; push('shapes');
  const a=sc().shapes, i=a.indexOf(S.sel);
  if(i>0){ a.splice(i,1); a.unshift(S.sel); touchScene(); draw(); }
};
$('btnDup').onclick=()=>{ if(!S.sel) return; push('shapes');
  const g=cal().gridPx, c={...S.sel, a:{x:S.sel.a.x+g,y:S.sel.a.y+g}, b:{x:S.sel.b.x+g,y:S.sel.b.y+g}};
  sc().shapes.push(c); S.sel=c; renderFxList(); draw(); };

$('fogHide').onclick=()=>{ S.fogMode='hide'; setTool('fog'); };
$('fogShow').onclick=()=>{ S.fogMode='show'; setTool('fog'); };
$('fogShape').onchange=e=>{ S.fogShape=e.target.value; S.lasso=null; toolCursor(); syncCtxBar(); draw(); };
$('brushSize').oninput=e=>{ S.brush=parseFloat(e.target.value);
  $('brushLbl').textContent=(Math.round(S.brush*2/cal().gridPx*10)/10)+' squares'; draw(); };
$('fogOpacity').oninput=e=>{ S.fogOpacity=parseFloat(e.target.value)/100; $('opLbl').textContent=e.target.value+'%'; draw(); };
$('wallMode').onchange=e=>{ S.wallMode=e.target.value; S.wallDraft=null; draw(); };
$('wallNew').onclick=()=>{ S.wallNew=!S.wallNew; S.wallDraft=null;
  if(S.wallNew) clearSelectedWalls();
  syncCtxBar(); draw(); };
$('wallsOnly').onchange=e=>{ S.wallsOnly=e.target.checked; draw(); };
$('wallDoor').onclick=()=>{
  if(!S.selectedWalls.length){ toast('Tap a wall segment to turn it into a door.'); return; }
  push('walls');
  /* Normalize all selected items: if any is closed, open all; if all are open, close all.
     This makes a mixed selection consistent. */
  const shouldOpen = S.selectedWalls.some(t=>!segmentsOf(t.wall)[t.seg].open);
  for(const t of S.selectedWalls) segmentsOf(t.wall)[t.seg].open = shouldOpen;
  touchScene(); recalculateVision(); draw(); syncCtxBar();
  const n=S.selectedWalls.length;
  toast(shouldOpen ? (n>1 ? n+' segments opened: vision passes through them.'
                     : 'Door open: vision passes through this segment.')
              : (n>1 ? n+' segments closed: blocking again.'
                     : 'Door closed: this segment blocks again.'));
};
/* A wall can block both sides or either side alone. */
$('wallDirection').onclick=()=>{
  if(!S.selectedWalls.length){ toast('Tap a wall segment to make it one-way.'); return; }
  push('walls');
  /* The first item sets the cycle step for the rest, keeping a whole hallway oriented
     consistently. The sign follows each segment's drawn direction, so walls drawn at once
     remain aligned. */
  const t0=segmentsOf(S.selectedWalls[0].wall)[S.selectedWalls[0].seg];
  const dir = t0.dir===0 ? 1 : (t0.dir===1 ? -1 : 0);
  for(const t of S.selectedWalls) segmentsOf(t.wall)[t.seg].dir = dir;
  touchScene(); recalculateVision(); draw(); syncCtxBar();
  const n=S.selectedWalls.length;
  toast(dir===0 ? (n>1 ? n+' segments block from both sides.' : 'Segment blocks from both sides.')
                : (n>1 ? n+' segments are one-way: they block only from the marked side.'
                       : 'One-way: blocks only from the marked side.'));
};
function deleteSelectedWalls(){
  const list=selectedWalls();
  if(!list.length){ toast('Tap a wall to select it.'); return; }
  push('walls');
  const arr=walls();
  for(const w of list){ const i=arr.indexOf(w); if(i>=0) arr.splice(i,1); }
  clearSelectedWalls();
  touchScene(); recalculateVision(); draw(); syncCtxBar();
  toast(list.length>1 ? list.length+' walls deleted.' : 'Wall deleted.');
}
$('deleteWall').onclick=deleteSelectedWalls;
$('clearWalls').onclick=async ()=>{
  const n=walls().length;
  if(!n){ toast('No walls in this scene.'); return; }
  if(!await requestConfirm('Delete all walls',
      'All '+n+' walls in this scene will be deleted, doors included. This can be undone.',
      'Delete', true)) return;
  const s=sc(); push('walls'); s.walls=[]; clearSelectedWalls();
  touchScene(); recalculateVision(); draw(); syncCtxBar();
};
$('playerTokenSelect').onchange=e=>{
  S.tokenSel = players().find(j=>j.id===e.target.value) || null;
  if(S.tokenSel) $('tokenVision').value = S.tokenSel.vision!=null ? S.tokenSel.vision : 30;
  draw();
};
$('tokenVision').oninput=e=>{
  if(!S.tokenSel) return;
  S.tokenSel.vision=Math.max(0,parseFloat(e.target.value)||0);
  touchCampaign(); recalculateVision(); draw();
};
$('showVision').onchange=e=>{ S.showVision=e.target.checked; draw(); };
$('showLights').onchange=e=>{ S.showLights=e.target.checked; draw(); };
$('tableTokens').onchange=e=>{ S.tableTokens=e.target.value; touchState(); draw(); };
/* This was the last destructive action without undo: it removed a token from the scene
   outside history, leaving no way to restore it except placing it again manually. */
$('removeToken').onclick=()=>{
  if(!S.tokenSel){ toast('Pick a player first.'); return; }
  if(!tokenOf(S.tokenSel)){ toast(S.tokenSel.character+' has no token on this map.'); return; }
  push('shapes');
  const who=S.tokenSel.character;
  delete tokens()[S.tokenSel.id];
  releaseAnchors(S.tokenSel.id);
  S.selTokens=S.selTokens.filter(j=>j!==S.tokenSel);
  touchScene(); recalculateVision(); renderPlayers(); syncCtxBar(); draw();
  toast(who+' taken off the map. Ctrl+Z to undo.');
};
$('fogMode').onchange=e=>{
  const s=sc(); if(!s) return;
  s.fogMode=e.target.value; touchScene();
  if(s.fogMode==='manual'){ toast('Manual fog: paint it with the brush.'); return; }
  if(s.fogMode==='dynamic'){
    /* Dynamic mode rebuilds the entire fog each time. */
    recalculateVision(); draw();
    toast('Dynamic vision: only what tokens can see right now.');
    return;
  }
  const n=players().filter(j=>tokenOf(j)).length;
  recalculateVision(); draw();
  toast(n ? 'Exploration on: '+n+' tokens revealed their surroundings.'
          : 'Exploration on: place tokens to reveal the map.');
};
$('fogReset').onclick=async ()=>{
  const s=sc(); if(!s||s.type!=='map') return;
  if(!await requestConfirm('Reset exploration',
      'The whole map goes back under fog and everything explored so far is cleared. This can be undone.',
      'Reset', true)) return;
  push('fog'); touchFog();
  s.fogCtx.globalCompositeOperation='source-over';
  s.fogCtx.fillStyle=PAL.inkDeep; s.fogCtx.fillRect(0,0,s.w,s.h);
  draw(); toast('Exploration reset.');
};
$('fogAll').onclick=()=>{ const s=sc(); if(!s||s.type!=='map'||!fogPintable()) return; push('fog'); touchFog();
  s.fogCtx.globalCompositeOperation='source-over'; s.fogCtx.fillStyle=PAL.inkDeep; s.fogCtx.fillRect(0,0,s.w,s.h); draw(); };
$('fogNone').onclick=()=>{ const s=sc(); if(!s||s.type!=='map'||!fogPintable()) return; push('fog'); touchFog();
  s.fogCtx.clearRect(0,0,s.w,s.h); draw(); };

$('btnAddCombatant').onclick=()=>openCombatant(null);
$('btnAddPlayer').onclick=()=>openPlayer(null);
$('btnAllToCombat').onclick=allToCombat;
$('btnLongRest').onclick=longRest;
$('btnUndoLongRest').onclick=undoLongRest;
$('playerCancel').onclick=closePlayer;
$('playerSave').onclick=savePlayer;
$('player').onclick=e=>{ if(e.target===$('player')) closePlayer(); };
$('player').addEventListener('keydown', e=>{ e.stopPropagation();
  if(e.key==='Enter') savePlayer(); if(e.key==='Escape') closePlayer(); });
$('shortcutsClose').onclick=()=>$('shortcuts').classList.add('hide');
$('shortcuts').onclick=e=>{ if(e.target===$('shortcuts')) $('shortcuts').classList.add('hide'); };
$('selectedCampaign').onchange=e=>switchCampaign(e.target.value);
$('newCampaign').onclick=async ()=>{
  const n=await requestText('New campaign','Campaign name','Untitled campaign');
  if(n===null) return;
  const c=await createCampaign(n||'Untitled campaign');
  renderCampaignSelector(); await switchCampaign(c.id);
  toast('Campaign "'+c.name+'" created.');
};
$('btnUndo').onclick=()=>undo();
$('btnRedo').onclick=()=>redo();
/* History and redo are per scene, so the button checks what this map can actually undo,
   not the raw stack sizes. */
function syncHistory(){
  const s=sc();
  if(!$('btnUndo')) return;
  const thereIs = S.history.some(e => e.scene==='*' || (s && e.scene===s.id));
  const canRedo = !!s && S.redo.some(r => r.scene===s.id);
  $('btnUndo').disabled=!thereIs;
  $('btnRedo').disabled=!canRedo;
}

$('btnSettings').onclick=()=>{
  const s=$('themeSelect');
  s.innerHTML='';
  for(const t of THEMES){
    const o=document.createElement('option');
    o.value=t.id; o.textContent=t.name; s.appendChild(o);
  }
  s.value=S.theme||'ember';
  $('uiSel').value=String(S.ui||1);
  $('themeNote').textContent=(THEMES.find(x=>x.id===s.value)||THEMES[0]).note||'';
  $('settingsDialog').classList.remove('hide');
  s.focus();
};
/* Apply when selected, not when closed: the map remains visible behind the dialog, which
   makes it useful for comparing themes. */
$('themeSelect').onchange=e=>applyTheme(e.target.value, true);
$('uiSel').onchange=e=>applyUI(parseFloat(e.target.value), true);
$('settingsClose').onclick=()=>$('settingsDialog').classList.add('hide');
$('settingsDialog').onclick=e=>{ if(e.target===$('settingsDialog')) $('settingsDialog').classList.add('hide'); };
$('settingsDialog').addEventListener('keydown',e=>{
  if(e.key==='Escape'){ $('settingsDialog').classList.add('hide'); e.stopPropagation(); }
});

$('campaignMenu').onclick=e=>{
  e.stopPropagation();
  const m=$('campaignMenuPanel');
  const r=$('campaignMenu').getBoundingClientRect();
  m.style.top=(r.bottom+6)+'px';
  m.style.left=Math.min(r.left, innerWidth-236)+'px';
  m.classList.toggle('hide');
};
addEventListener('click', e=>{
  if(!$('campaignMenuPanel').contains(e.target) && e.target!==$('campaignMenu'))
    $('campaignMenuPanel').classList.add('hide');
});
document.querySelectorAll('#campaignMenuPanel button').forEach(b=>{
  b.onclick=async ()=>{
    $('campaignMenuPanel').classList.add('hide');
    const c=activeCampaign(); if(!c) return;
    const op=b.dataset.op;
    if(op==='rename'){
      const n=await requestText('Rename campaign','Campaign name', c.name);
      if(n){ c.name=n; touchCampaign(); renderCampaignSelector(); toast('Campaign renamed.'); }
    } else if(op==='export'){ $('btnSave').click(); }
    else if(op==='import'){ $('fileSes').click(); }
    else if(op==='delete'){ deleteCampaign(); }
  };
});
$('btnNextTurn').onclick=nextTurn;
/* This was the only destructive action without confirmation or history, next to Undo
   application with the same appearance. One extra click during combat cleared the order. */
$('btnClearInitiative').onclick=async ()=>{
  const n=S.ini.list.length;
  if(!n){ toast('No combatants to clear.'); return; }
  if(!await requestConfirm('Clear initiative',
      'All '+n+' combatants leave the order, with their hit points, conditions and death saves. '
      +'Campaign players keep the hit points they have now. This can be undone.',
      'Clear', true)) return;
  pushIniUndo();
  S.ini.list=[]; S.ini.turnId=null; S.ini.selId=null;
  renderInitiativeList(); draw();
  toast('Initiative cleared. Ctrl+Z to bring it back.');
};
$('iniShow').onchange=e=>{ S.ini.show=e.target.checked; draw(); };
$('iniCorner').onchange=e=>{ S.ini.corner=e.target.value; draw(); };
$('iniSize').oninput=e=>{ S.ini.scale=e.target.value/100; $('iniSizeLbl').textContent=e.target.value+'%'; draw(); };
$('iniHp').onchange=e=>{ S.ini.hpMode=e.target.value; draw(); };

$('btnTable').onclick=()=>{ tableOpen()?closeTable():openTable(); };
$('diagIn').oninput=()=>{ T.diagonalCalibrated=true; touchState(); renderSteps(); autoDpi(); };
$('dpiIn').oninput=e=>{ T.dpi=Math.max(20,parseFloat(e.target.value)||96); touchState(); updateTableInfo(); };
$('btnTestGrid').onclick=()=>{ T.test=!T.test; $('btnTestGrid').classList.toggle('on',T.test); draw(); };
$('btnFrame').onclick=()=>{ S.tool==='frame'?setTool('pan'):setTool('frame'); };
$('btnCenterTable').onclick=()=>{ const s=sc(); if(!s||s.type!=='map') return;
  s.center=s2w({x:innerWidth/2,y:innerHeight/2}); touchScene(); draw(); };
$('showFrame').onchange=e=>{ S.showFrame=e.target.checked; draw(); };
$('brIn').oninput=e=>{ T.bright=e.target.value/100; $('brLbl').textContent=e.target.value+'%'; applyFilter(); };
$('coIn').oninput=e=>{ T.contrast=e.target.value/100; $('coLbl').textContent=e.target.value+'%'; applyFilter(); };
$('galCover').onchange=e=>{ T.cover=e.target.checked; draw(); };
$('btnBlack').onclick=()=>setBlack(!T.black);

async function importFiles(files, type){
  const list=[...files];
  if(!list.length) return;
  if(list.length>1) toast('Importing '+list.length+' files…');
  for(const f of list){
    if(EXT_UVTT.test(f.name)) await importUVTT(f);
    else await addSceneFile(f, type);
  }
  if(list.length>1) toast(list.length+' scenes added.');
}
$('fileMap').onchange=e=>{ importFiles(e.target.files,'map'); e.target.value=''; };
$('fileArt').onchange=e=>{ importFiles(e.target.files,'image'); e.target.value=''; };
$('btnRename').onclick=renameScene;
$('librarySearch').oninput=e=>{ LIB.filter=e.target.value; renderLibrary(); };
$('btnDuplicateScene').onclick=async ()=>{
  const o=sc(); if(!o){ toast('No scene to duplicate.'); return; }
  const rec=await dbGet('blobs', o.id+':img');
  if(!rec){ toast('Scene image not found.'); return; }
  const id='e'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const duplicatedScene={
    id, campaignId:CAMP.id, order:LIB.scenes.length, type:o.type,
    name:o.name.replace(/\.[^.]+$/,'')+' (copy)', w:o.w, h:o.h, thumb:o.thumb,
    cal:{...o.cal}, center:{...o.center}, shapes:[],
    walls:JSON.parse(JSON.stringify(o.walls||[])), tokens:{},
    lights:JSON.parse(JSON.stringify(o.lights||[])),
    fogMode:o.fogMode||'manual', img:null, ready:false
  };
  LIB.scenes.push(duplicatedScene);
  if(DB.ok){ await dbPut('blobs',{key:id+':img', blob:rec.blob}); await saveSceneMeta(duplicatedScene); }
  renderLibrary();
  await selectScene(LIB.scenes.indexOf(duplicatedScene));
  toast('Scene duplicated with its calibration and walls, fog reset.');
};
$('trayShow').onclick=()=>{ if(LIB.imgSel) showImage(LIB.imgSel); };
$('overlayBack').onclick=hideImage;
$('btnWipe').onclick=async ()=>{
  if(!await requestConfirm('Clear library',
      'Every scene in this campaign will be deleted, along with its fog and effects. This cannot be undone.',
      'Clear library', true)) return;
  /* The dialog says "in this campaign," but previously cleared all storage and deleted
     scenes from EVERY campaign. Now it deletes only what it says it will. */
  const outside = LIB.scenes.filter(s=>s.campaignId===CAMP.id);
  outside.forEach(s=>{ if(s.thumbUrl) URL.revokeObjectURL(s.thumbUrl); releaseScene(s); });
  LIB.scenes = LIB.scenes.filter(s=>s.campaignId!==CAMP.id);
  LIB.idx=-1;
  if(DB.ok){
    for(const s of outside){
      await dbDel('scenes', s.id);
      /* Clear only those scene blobs. dbClear('blobs') also deleted downloaded 'jb2a:' videos
         and forced the entire catalog to be downloaded again. */
      await dbDel('blobs', s.id+':img');
      await dbDel('blobs', s.id+':fog');
    }
  }
  $('empty').style.display='flex'; $('brandInfo').textContent='no scene';
  renderLibrary(); draw();
  toast(outside.length===1 ? '1 scene deleted.' : outside.length+' scenes deleted.');
};

addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{
  e.preventDefault();
  const imgs=[...e.dataTransfer.files].filter(f=>f.type.startsWith('image/'));
  if(imgs.length) importFiles(imgs,'map');
});

createBackupTools({
  $, S, CAMP, LIB, T, DB, dbGet, dbPut, migrateCombatant, migrateSceneRecord, saveSceneMeta, applyFilter, createCampaign, renderCampaignSelector, renderPlayers, players, activeCampaign, campaignScenes, touchCampaign, touchState, toast, addSceneFile, renderInitiativeList, flush, renderLibrary, selectScene, draw,
  setInitiativeId:value=>{iniUid=value;}
});

/* ============ keyboard ============ */
const KEYS={v:'pan',s:'sel',m:'measure',x:'effect',f:'fog',p:'pointer',k:'calibrate',e:'frame',o:'anchor',
            y:'occlusion',j:'token'};
const KEY_SHAPES={r:'line',c:'circle',n:'cone',q:'square',w:'wall',d:'free'};
addEventListener('keydown',e=>{
  if(!$('modal').classList.contains('hide')) return;
  if(!$('shortcuts').classList.contains('hide')){
    if(e.key==='Escape'||e.key==='?') $('shortcuts').classList.add('hide');
    return;
  }
  if(!$('player').classList.contains('hide')) return;
  if(!$('textDialog').classList.contains('hide')) return;
  if(!$('confirmDialog').classList.contains('hide')) return;
  if(!$('conc').classList.contains('hide')) return;
  if(!$('multi').classList.contains('hide')) return;
  if(/input|select|textarea/i.test(e.target.tagName)) return;
  if(e.code==='Space'){ S.spaceDown=true; toolCursor(); e.preventDefault(); return; }
  /* Do not return here: Ctrl is also the start of Ctrl+Z, Ctrl+C, and Ctrl+V. */
  if(e.key==='Control' || e.key==='Meta'){ S.selDown=true; toolCursor(); }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){
    /* With an unfinished wall, remove the last vertex. Undoing the whole wall because one
       point was extra would discard the entire drawing. */
    if(!e.shiftKey && S.wallDraft && S.wallDraft.pts.length){
      S.wallDraft.pts.pop();
      if(!S.wallDraft.pts.length) S.wallDraft=null;
      draw(); e.preventDefault(); return;
    }
    if(e.shiftKey) redo(); else undo();
    e.preventDefault(); return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){
    const group = S.selMulti.length ? S.selMulti : (S.sel?[S.sel]:[]);
    if(group.length){
      S.clipboard = group.map(x=>JSON.parse(JSON.stringify(x)));
      toast(group.length+(group.length>1?' items copied.':' item copied.'));
    }
    e.preventDefault(); return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){
    paste();
    e.preventDefault(); return;
  }
  if(e.key.startsWith('Arrow')){
    const st=e.shiftKey?T.dpi:1;
    if(e.key==='ArrowLeft') nudgeTable(-st,0);
    if(e.key==='ArrowRight') nudgeTable(st,0);
    if(e.key==='ArrowUp') nudgeTable(0,-st);
    if(e.key==='ArrowDown') nudgeTable(0,st);
    e.preventDefault(); return;
  }
  const k=e.key.toLowerCase();
  if(S.ini.selId && entryKey(k)){ e.preventDefault(); return; }
  if(e.key==='?'){ openShortcuts(); e.preventDefault(); return; }
  if(k==='escape' && S.ini.entry){ clearEntry(); return; }
  if(k==='escape'){ closeMapMenu(); cancelPinning();
    S.draft=null; S.drawing=null; S.lasso=null; clearSelection();
    clearSelectedWalls();              // remained active until another click
    /* A selected catalog effect had no way to be released, so any map click placed it. */
    if(S.animSel){ S.animSel=null; CAT.sel=null; renderCatalog(); }
    S.wallDraft=null;
    hideReadout(); syncCtxBar(); draw(); return; }
  if(k==='enter'&&S.lasso){ closeLasso(); return; }
  if(k==='enter'&&S.wallDraft){ closeWall(); return; }
  if(k==='delete'||k==='backspace'){
    if(S.tool==='occlusion' && S.selectedWalls.length){ deleteSelectedWalls(); e.preventDefault(); return; }
    $('btnDelete').click(); e.preventDefault(); return;
  }
  if(k==='h'){ $('panel').classList.toggle('hidden'); return; }
  if(k==='b'){ setBlack(!T.black); return; }
  if(k==='t'){ nextTurn(); return; }
  if(k==='tab'&&LIB.scenes.length){ selectScene((LIB.idx+1)%LIB.scenes.length); e.preventDefault(); return; }
  if(KEY_SHAPES[k]){
    S.measureShape=KEY_SHAPES[k]; $('measureShape').value=S.measureShape;
    setTool('measure'); return;
  }
  if(KEYS[k]) setTool(KEYS[k]);
});
/* Releasing space should only restore the tool cursor. Calling setTool() treated it as a
   tool re-selection and reopened its dismissed guide. */
addEventListener('keyup',e=>{
  if(e.code==='Space'){ S.spaceDown=false; toolCursor(); }
  if(e.key==='Control' || e.key==='Meta'){ S.selDown=false; toolCursor(); }
});
/* Switching windows while a key is held does not send keyup, which otherwise left the
   app thinking space or Ctrl was still pressed. */
addEventListener('blur',()=>{ S.spaceDown=false; S.selDown=false; toolCursor(); });
$('toggle').onclick=()=>$('panel').classList.remove('hidden');

/* ============ app integration ============ */
registerServiceWorker(() => toast('A new version is available. Reload to apply it.'));

let installPrompt=null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); installPrompt=e;
  $('btnInstall').style.display='block';
});
$('btnInstall').onclick = async () => {
  if(!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt=null; $('btnInstall').style.display='none';
};
addEventListener('appinstalled', () => { $('btnInstall').style.display='none'; });

/* Ask the browser to keep the library available when storage is low. */
if(navigator.storage && navigator.storage.persist){
  navigator.storage.persisted().then(ok => { if(!ok) navigator.storage.persist().catch(()=>{}); });
}

async function startApp(){
  setTool('pan');
  resize();

  try{
    DB.h = await dbOpen();
    DB.ok = true;
  }catch(err){
    const a=$('notice');
    a.style.display='block';
    a.textContent = location.protocol==='file:'
      ? 'You are opening this file directly from disk. Browser storage is unavailable, so nothing you import will be saved. Please use the hosted version instead.'
      : 'Could not open browser storage. The session will work, but nothing will be saved.';
  }

  /* Read collapsed states before mounting sections; otherwise all sections open before
     the saved state arrives. */
  if(DB.ok){
    const previousState = await loadAppState();
    if(previousState && Array.isArray(previousState.collapsedSections)) S.collapsedSections = previousState.collapsedSections;
    /* Apply the theme here before the first draw, alongside collapsed states, so a frame
       using the default palette is never shown. */
    if(previousState && previousState.theme) applyTheme(previousState.theme);
    if(previousState && previousState.ui) applyUI(previousState.ui);
  }
  prepareFolding();

  if(DB.ok){
    /* Create a campaign if none exists and assign any existing scenes to it. */
    const storedCampaigns = await dbAll('camps');
    CAMP.list = storedCampaigns.map(migrateCampaignRecord);
    for(let i=0;i<storedCampaigns.length;i++){
      if(JSON.stringify(CAMP.list[i])!==JSON.stringify(storedCampaigns[i]))
        await dbPut('camps',CAMP.list[i]);
    }
    const appState = await loadAppState();
    if(!CAMP.list.length){
      const c = await createCampaign('My campaign');
      CAMP.id = c.id;
    } else {
      CAMP.id = (appState && appState.campaignId && CAMP.list.some(c=>c.id===appState.campaignId))
        ? appState.campaignId : CAMP.list[0].id;
    }
    CAMP.list.forEach(c=>{ if(!c.players) c.players=[]; });
    renderCampaignSelector();

    const storedScenes = await dbAll('scenes');
    const recs = storedScenes.map(migrateSceneRecord);
    for(let i=0;i<storedScenes.length;i++){
      if(JSON.stringify(recs[i])!==JSON.stringify(storedScenes[i]))
        await dbPut('scenes',recs[i]);
    }
    recs.sort((a,b)=>(a.order||0)-(b.order||0));
    /* Adopt scenes created before campaigns existed into the active campaign. */
    for(const r of recs){ if(!r.campaignId){ r.campaignId=CAMP.id; await dbPut('scenes', r); } }
    LIB.scenes = recs.map(r=>({...r, img:null, ready:false, thumbUrl:null,
                               shapes:r.shapes||[], walls:r.walls||[], tokens:r.tokens||{},
                               lights:r.lights||[], environment:r.environment||null,
                               fogMode:r.fogMode||'manual',
                               cal:r.cal||{gridPx:50,unitVal:5,unitName:'ft',rule:'cheb'}}));
    /* The campaign record stores only {ini, active}; everything else—catalog favorites,
       placement, theme, and monitor size—belongs to app state. The old `||` meant that once
       any campaign existed, its state always won and app state was never read. Merge them:
       campaign values take precedence where present, and the rest comes from global state. */
    const stCamp = await loadCampaignState(CAMP.id);
    const st = (appState || stCamp) ? {...(appState||{}), ...(stCamp||{})} : null;
    if(st){
      if(st.ini){
        S.ini={...S.ini, ...st.ini, selId:null, entry:null, undo:[]};
        S.ini.list=(S.ini.list||[]).map(m=>({temp:0, conditions:[], saves:[0,0,0,0,0,0], ...m}));
        iniUid=Math.max(1,...S.ini.list.map(m=>m.id||0), 0)+1;
      }
      if(st.tableTokens){ S.tableTokens=st.tableTokens; $('tableTokens').value=S.tableTokens; }
      S.stepsNever=!!st.stepsNever;
      /* Placement was not saved, so every reload restored defaults with no way to customize it. */
      if(st.snap) S.snap={...S.snap, ...st.snap};
      if(st.theme) S.theme=st.theme;
      if(st.ui) S.ui=st.ui;   // already applied above; keep state consistent
      if(st.fx){
        CAT.favorites=st.fx.favorites||[]; CAT.recent=st.fx.recent||[];
        CAT.animationsActive=st.fx.animationsActive!==false; $('animOn').checked=CAT.animationsActive;
        /* If the catalog is already loaded, redraw it with restored favorites. */
        if(CAT.loaded) renderCatalog();
      }
      if(st.table){
        T.dpi=st.table.dpi||T.dpi; T.cover=!!st.table.cover;
        T.bright=st.table.bright||1; T.contrast=st.table.contrast||1;
        $('dpiIn').value=T.dpi; $('diagIn').value=st.table.diag||27; $('galCover').checked=T.cover;
        $('brIn').value=Math.round(T.bright*100); $('coIn').value=Math.round(T.contrast*100);
        $('brLbl').textContent=Math.round(T.bright*100)+'%'; $('coLbl').textContent=Math.round(T.contrast*100)+'%';
        if(st.table.hpMode){ S.ini.hpMode=st.table.hpMode; $('iniHp').value=st.table.hpMode; }
        T.diagonalCalibrated=!!st.table.diagonalCalibrated; T.tableIsOpen=!!st.table.tableIsOpen;
      }
    }
    renderPlayers(); renderLibrary(); renderFxList(); renderInitiativeList();
    const own = campaignScenes();
    /* Load the catalog after state has been restored. */
    await loadCatalog();

    let i = st && st.active ? LIB.scenes.findIndex(x=>x.id===st.active) : -1;
    if(i<0 && own.length) i = LIB.scenes.indexOf(own[0]);
    if(i>=0) await selectScene(i);
  } else {
    renderPlayers(); renderLibrary(); renderFxList(); renderInitiativeList();
  }
  draw();
}
startApp();
})();