export function createSceneLibrary({ $, S, CAMP, LIB, DB, T, loadBitmap, scaleCanvas, blobFromCanvas, MAX_SIDE, MAX_THUMBNAIL, dbPut, dbDel, saveSceneMeta, updateSpacing, flush, clearSelection, clearSelectedWalls, loadScene, releaseOthers, clearAnimations, setBlack, fitView, renderFxList, syncCtxBar, touchState, touchScene, requestConfirm, draw, renderSteps, fogMode, cal, sc, toast }) {
let uid=1;

/* Add a scene from a file: store its binary data, generate a thumbnail, and resize
   images that are too large for the screen. */
async function addSceneFile(file, type){
  if(!/^image\//.test(file.type)){ toast('"'+file.name+'" is not an image.'); return null; }
  try{
    const bmp = await loadBitmap(file);
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;

    let blob = file, W=w, H=h;
    if(Math.max(w,h) > MAX_SIDE){
      const cn = scaleCanvas(bmp,w,h,MAX_SIDE);
      const b = await blobFromCanvas(cn,'image/webp',0.92);
      if(b){ blob=b; W=cn.width; H=cn.height; }
    }
    const mini = scaleCanvas(bmp,w,h,MAX_THUMBNAIL);
    const thumb = await blobFromCanvas(mini,'image/webp',0.8);
    if(bmp.close) bmp.close(); else if(bmp.__url) URL.revokeObjectURL(bmp.__url);

    const id = 'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    const s = {
      id, campaignId:CAMP.id, order:LIB.scenes.length, type, name:file.name, w:W, h:H,
      thumb, cal:{gridPx:50,unitVal:5,unitName:'ft',rule:'cheb'},
      shapes:[], walls:[], tokens:{}, fogMode:'manual', center:{x:W/2,y:H/2},
      img:null, ready:false
    };
    LIB.scenes.push(s);
    if(DB.ok){
      await dbPut('blobs',{key:id+':img', blob});
      await saveSceneMeta(s);
    }
    renderLibrary(); updateSpacing();
    if(LIB.idx<0) await selectScene(LIB.scenes.indexOf(s));
    return s;
  }catch(err){
    console.error(err); toast('Could not import "'+file.name+'".'); return null;
  }
}

async function selectScene(i){
  if(i<0 || i>=LIB.scenes.length) return;
  if(LIB.scenes[i].type==='image'){ chooseImage(LIB.scenes[i]); return; }
  await flush();     // do not leave changes from the previous scene unsaved
  LIB.idx=i; clearSelection(); S.draft=null; S.lasso=null; S.history=[];
  S.wallDraft=null; clearSelectedWalls(); S.tokenSel=null;
  T.fadeT=performance.now();
  const s=sc();
  await loadScene(s);
  releaseOthers();
  clearAnimations();
  syncSceneInputs();
  $('empty').style.display='none';
  $('brandInfo').textContent = s.name.replace(/\.[^.]+$/,'').slice(0,28)+' · '+s.w+'×'+s.h;
  if(T.black) setBlack(false);
  fitView(); renderLibrary(); renderFxList(); syncCtxBar();
  touchState();
}

let sceneDrag=null;
async function reorderScene(origin, destination){
  const list=LIB.scenes;
  /* Dropping an item onto itself removes its destination from the list, which would make
     splice move it to the end. Dragging already prevents this, but the function should not
     depend on that safeguard. */
  if(origin===destination) return;
  const from=list.indexOf(origin), to=list.indexOf(destination);
  if(from<0 || to<0) return;
  list.splice(from,1);
  list.splice(list.indexOf(destination) + (from<to ? 1 : 0), 0, origin);
  sceneDrag=null;
  list.forEach((x,k)=>{ x.order=k; });
  renderLibrary();
  if(DB.ok) for(const x of list) await saveSceneMeta(x);
}

function renderLibrary(){
  const g=$('library'); g.innerHTML='';
  const q=(LIB.filter||'').trim().toLowerCase();
  LIB.scenes.forEach((s,i)=>{
    if(s.campaignId && s.campaignId!==CAMP.id) return;
    if(q && !s.name.toLowerCase().includes(q)) return;
    const b=document.createElement('button');
    if(s.thumb){
      if(!s.thumbUrl) s.thumbUrl=URL.createObjectURL(s.thumb);
      b.style.backgroundImage='url("'+s.thumbUrl+'")';
    }
    if(i===LIB.idx) b.classList.add('on');
    b.title=s.name;
    b.innerHTML='<span class="tp">'+(s.type==='map'?'MAP':'IMG')+'</span><span class="nm">'+
      s.name.replace(/\.[^.]+$/,'').slice(0,20)+'</span>';
    b.onclick=()=> s.type==='image' ? chooseImage(s) : selectScene(i);
    b.oncontextmenu=ev=>{ ev.preventDefault(); deleteScene(i); };
    /* The "order" field is already used on load, so reordering only needs to rewrite it. */
    b.draggable=true;
    b.ondragstart=ev=>{ sceneDrag=s; b.classList.add('dragging');
                        ev.dataTransfer.effectAllowed='move'; };
    b.ondragend=()=>{ b.classList.remove('dragging');
                      document.querySelectorAll('.lib button.destination')
                              .forEach(x=>x.classList.remove('destination')); };
    b.ondragover=ev=>{ if(sceneDrag && sceneDrag!==s){ ev.preventDefault();
                       b.classList.add('destination'); } };
    b.ondragleave=()=>b.classList.remove('destination');
    b.ondrop=ev=>{ ev.preventDefault(); b.classList.remove('destination');
                   if(sceneDrag && sceneDrag!==s) reorderScene(sceneDrag, s); };
    g.appendChild(b);
  });
  $('libHint').style.display = LIB.scenes.length ? 'none' : 'block';
  updateSpacing();
  /* Keep this here rather than at every scene insertion or removal: all those paths call
     this function, so the first-steps list stays up to date. */
  renderSteps();
}

/* Images overlay the map in the table view rather than replacing it; the map, fog, and
   effects remain active underneath. */
function chooseImage(s){
  LIB.imgSel = (LIB.imgSel===s) ? null : s;
  renderLibrary(); renderTray();
}
function renderTray(){
  const b=$('tray');
  const s=LIB.imgSel;
  if(!s){ b.style.display='none'; return; }
  b.style.display='block';
  $('trayName').textContent = s.name.replace(/\.[^.]+$/,'').slice(0,30);
  $('trayShow').textContent = (T.overlay===s.id) ? 'Remove from screen' : 'Show on screen';
}
async function showImage(s){
  if(T.overlay===s.id){ hideImage(); return; }
  await loadScene(s);
  T.overlay = s.id;
  T.fadeT = performance.now();
  renderTray(); updateNoticeOverlay(); draw();
}
function hideImage(){
  T.overlay = null; T.fadeT = performance.now();
  renderTray(); updateNoticeOverlay(); draw();
}
function sceneOverlay(){ return T.overlay ? LIB.scenes.find(x=>x.id===T.overlay) : null; }
function updateNoticeOverlay(){
  const s=sceneOverlay();
  const av=$('noticeOverlay');
  if(!s){ av.style.display='none'; return; }
  av.style.display='flex';
  $('overlayName').textContent = s.name.replace(/\.[^.]+$/,'').slice(0,34);
}

async function deleteScene(i){
  const s=LIB.scenes[i]; if(!s) return;
  if(!await requestConfirm('Remove scene',
      '"'+s.name+'" will be removed from the library, along with its fog and effects. This cannot be undone.',
      'Remove', true)) return;
  if(s.thumbUrl) URL.revokeObjectURL(s.thumbUrl);
  releaseScene(s);
  LIB.scenes.splice(i,1);
  if(DB.ok){ await dbDel('scenes',s.id); await dbDel('blobs',s.id+':img'); await dbDel('blobs',s.id+':fog'); }
  if(LIB.idx===i){
    LIB.idx=-1;
    if(LIB.scenes.length) await selectScene(Math.min(i,LIB.scenes.length-1));
    else { $('empty').style.display='flex'; $('brandInfo').textContent='no scene'; draw(); }
  } else if(LIB.idx>i) LIB.idx--;
  renderLibrary(); draw();
}

async function renameScene(){
  const s=sc(); if(!s) return;
  const n=prompt('Scene name:', s.name);
  if(n===null) return;
  s.name=n.trim()||s.name;
  await saveSceneMeta(s);
  $('brandInfo').textContent=s.name.replace(/\.[^.]+$/,'').slice(0,28)+' · '+s.w+'×'+s.h;
  renderLibrary();
}

function syncSceneInputs(){
  const c=cal();
  $('gridPx').value=c.gridPx; $('unitVal').value=c.unitVal;
  $('unitName').value=c.unitName; $('ruleSel').value=c.rule;
  $('gridOx').value=c.ox||0; $('gridOy').value=c.oy||0;
  $('fogMode').value = fogMode();
}

  return { addSceneFile, selectScene, reorderScene, renderLibrary, chooseImage, renderTray, showImage, hideImage, sceneOverlay, updateNoticeOverlay, deleteScene, renameScene, syncSceneInputs };
}
