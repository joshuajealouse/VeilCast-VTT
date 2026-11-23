export function createAppStorage({ StorageRepository, $, CAMP, LIB, S, T, PAL, CAT, sc, DIRTY_STATE, saveCampaign }) {
const storage = new StorageRepository();
const DB = { h:null, ok:false };

async function dbOpen(){
  const db=await storage.open();
  storage.db=db;
  return db;
}
const dbPut=(store,value)=>{ storage.db=DB.h; storage.ok=DB.ok; return storage.put(store,value); };
const dbGet=(store,key)=>{ storage.db=DB.h; storage.ok=DB.ok; return storage.get(store,key); };
const dbDel=(store,key)=>{ storage.db=DB.h; storage.ok=DB.ok; return storage.del(store,key); };
const dbAll=(store)=>{ storage.db=DB.h; storage.ok=DB.ok; return storage.all(store); };

const migrateCampaignRecord=record=>storage.migrateCampaignRecord(record);
const migrateSceneRecord=record=>storage.migrateSceneRecord(record);
const migrateStateRecord=record=>storage.migrateStateRecord(record);
const migrateCombatant=record=>storage.migrateCombatant(record);
const syncStorage=()=>{ storage.db=DB.h; storage.ok=DB.ok; };
const loadAppState=()=>{ syncStorage(); return storage.loadAppState(); };
const loadCampaignState=id=>{ syncStorage(); return storage.loadCampaignState(id); };

/* --- image utilities --- */
function blobFromCanvas(cn, type='image/webp', quality=0.85){
  return new Promise(res=>{
    if(cn.toBlob) cn.toBlob(b=>res(b), type, quality);
    else res(null);
  });
}
/* Always use HTMLImageElement for content drawn in both windows; objects created in one
   window are not always valid in the other's context. */
function loadImage(blob){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(blob);
    const im=new Image();
    im.onload=()=>{ im.__url=url; res(im); };
    im.onerror=e=>{ URL.revokeObjectURL(url); rej(e); };
    im.src=url;
  });
}
async function loadBitmap(blob){
  if(self.createImageBitmap){
    try{ return await createImageBitmap(blob); }catch(e){}
  }
  const url=URL.createObjectURL(blob);
  const im=new Image();
  await new Promise((res,rej)=>{ im.onload=res; im.onerror=rej; im.src=url; });
  im.__url=url;
  return im;
}
function scaleCanvas(src, w, h, maxSide){
  const f=Math.min(1, maxSide/Math.max(w,h));
  const cn=document.createElement('canvas');
  cn.width=Math.max(1,Math.round(w*f)); cn.height=Math.max(1,Math.round(h*f));
  cn.getContext('2d').drawImage(src,0,0,cn.width,cn.height);
  return cn;
}

const MAX_SIDE = 4096;   // maximum resolution stored for a map
const MAX_THUMBNAIL = 320;    // library thumbnail side length
const MAX_FOG = 2048; // resolution used to store the fog mask

/* --- deferred save --- */
async function saveSceneMeta(s){
  if(!DB.ok || !s) return;
  await dbPut('scenes', {
    id:s.id, campaignId:s.campaignId, order:s.order, type:s.type, name:s.name, w:s.w, h:s.h,
    thumb:s.thumb, cal:s.cal, center:s.center, shapes:s.shapes,
    walls:s.walls||[], tokens:s.tokens||{}, fogMode:s.fogMode||'manual',
    lights:s.lights||[], environment:s.environment||null, updated:Date.now()
  });
}
/* Fog stays at its stored resolution rather than the map resolution. Previously it was
   enlarged on load and reduced on save, blurring explored areas a little more each
   session. The context applies the scale, so everything else still draws in map pixels. */
function createFog(s){
  const f = Math.min(1, MAX_FOG/Math.max(s.w,s.h));
  s.fogCv = document.createElement('canvas');
  s.fogCv.width  = Math.max(1, Math.round(s.w*f));
  s.fogCv.height = Math.max(1, Math.round(s.h*f));
  s.fogCtx = s.fogCv.getContext('2d');
  s.fogCtx.setTransform(f,0,0,f,0,0);
}

async function saveFog(s){
  if(!DB.ok || !s || s.type!=='map' || !s.fogCv) return;
  /* Already at disk resolution; save as-is without resampling again. */
  const b = await blobFromCanvas(s.fogCv,'image/png');
  if(b) await dbPut('blobs',{key:s.id+':fog', blob:b});
}
async function saveState(){
  if(!DB.ok) return;
  /* State belonging to the active campaign. */
  if(CAMP.id) await dbPut('state', {id:'campaign:'+CAMP.id, ini:S.ini,
                                    active:sc()?sc().id:null});
  await dbPut('state', {id:'app', campaignId:CAMP.id, ini:S.ini, active:sc()?sc().id:null,
    fx:{favorites:CAT.favorites, recent:CAT.recent, animationsActive:CAT.animationsActive},
    tableTokens:S.tableTokens, collapsedSections:S.collapsedSections||[], stepsNever:!!S.stepsNever,
    snap:S.snap, theme:S.theme||'ember', ui:S.ui||1,
    table:{dpi:T.dpi, diag:parseFloat($('diagIn').value)||27, cover:T.cover,
          bright:T.bright, contrast:T.contrast, hpMode:S.ini.hpMode,
          diagonalCalibrated:!!T.diagonalCalibrated, tableIsOpen:!!T.tableIsOpen}});
}
/* If the browser stops accepting writes, usually because storage is full, the failure
   used to appear only in the console and the session was lost on reload. Show the warning
   and keep it visible until a save succeeds. */
function saveNotice(err){
  const a=$('notice');
  if(!err){
    if(a.dataset.motivo==='saved'){ a.style.display='none'; a.dataset.motivo=''; }
    return;
  }
  const storageFull = err && (err.name==='QuotaExceededError' ||
                        /quota|exceed/i.test(err.message||''));
  a.dataset.motivo='saved';
  a.style.display='block';
  a.textContent = storageFull
    ? 'Storage is full, so nothing is being saved. Export a backup now from the Library tab, then delete scenes you no longer need.'
    : 'Could not save to browser storage, so changes since the last save are not being kept. Export a backup to be safe.';
}

async function flush(){
  try{
    if(DIRTY_STATE.scene){ DIRTY_STATE.scene=false; await saveSceneMeta(sc()); }
    if(DIRTY_STATE.fog){ DIRTY_STATE.fog=false; await saveFog(sc()); }
    if(DIRTY_STATE.state){ DIRTY_STATE.state=false; await saveState(); }
    if(DIRTY_STATE.campaign){ DIRTY_STATE.campaign=false; await saveCampaign(); }
    saveNotice(null);
  }catch(err){
    console.error('Save error:', err);
    saveNotice(err);
  }
}
setInterval(flush, 4000);
addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') flush(); });

/* --- scene loading and release --- */
async function loadScene(s){
  if(!s || s.ready || s.cargando) return;
  s.cargando=true;
  try{
    const rec = await dbGet('blobs', s.id+':img');
    if(!rec){ s.cargando=false; return; }
    s.img = await loadImage(rec.blob);
    s.w = s.img.width || s.img.naturalWidth;
    s.h = s.img.height || s.img.naturalHeight;
    if(s.type==='map'){
      createFog(s);
      const fog = await dbGet('blobs', s.id+':fog');
      if(fog){
        const fi=await loadImage(fog.blob);
        s.fogCtx.drawImage(fi,0,0,s.w,s.h);
        if(fi.__url) URL.revokeObjectURL(fi.__url);
      } else {
        s.fogCtx.fillStyle=PAL.inkDeep; s.fogCtx.fillRect(0,0,s.w,s.h);
      }
      if(!s.center) s.center={x:s.w/2,y:s.h/2};
    }
    s.ready=true;
  }catch(err){ console.error('Could not load scene', err); }
  s.cargando=false;
}
function releaseScene(s){
  if(!s || !s.ready) return;
  if(s.img){
    if(s.img.close) s.img.close();
    else if(s.img.__url) URL.revokeObjectURL(s.img.__url);
  }
  s.img=null; s.fogCv=null; s.fogCtx=null; s.ready=false;
}
function releaseOthers(){
  const action=sc();
  LIB.scenes.forEach(s=>{ if(s!==action && s.ready) releaseScene(s); });
}

/* --- storage indicator --- */
async function updateSpacing(){
  if(!navigator.storage || !navigator.storage.estimate) return;
  try{
    const e=await navigator.storage.estimate();
    const mb=(e.usage/1048576);
    $('space').textContent = LIB.scenes.length+' scenes · '+
      (mb<1000 ? mb.toFixed(1)+' MB' : (mb/1024).toFixed(2)+' GB')+' used';
  }catch(err){}
}

  return { storage, DB, dbOpen, dbPut, dbGet, dbDel, dbAll, migrateCampaignRecord, migrateSceneRecord, migrateStateRecord, migrateCombatant, loadAppState, loadCampaignState, blobFromCanvas, loadImage, loadBitmap, scaleCanvas, MAX_SIDE, MAX_THUMBNAIL, MAX_FOG, saveSceneMeta, createFog, saveFog, saveState, saveNotice, flush, loadScene, releaseScene, releaseOthers, updateSpacing };
}
