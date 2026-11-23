export function createBackupTools({ $, S, CAMP, LIB, T, DB, dbGet, dbPut, migrateCombatant, migrateSceneRecord, saveSceneMeta, applyFilter, createCampaign, renderCampaignSelector, renderPlayers, players, activeCampaign, campaignScenes, touchCampaign, touchState, toast, addSceneFile, renderInitiativeList, flush, renderLibrary, selectScene, draw, setInitiativeId }) {
/* The library is stored automatically in the browser. Export it to move everything to
   another computer or keep an offline backup. */
const blobToDataURL = b => new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(b); });

$('btnSave').onclick=async ()=>{
  if(!campaignScenes().length && !players().length){ toast('This campaign is empty.'); return; }
  toast('Preparing backup…');
  const scenes=[];
  for(const s of campaignScenes()){
    const img=await dbGet('blobs', s.id+':img');
    const fog=await dbGet('blobs', s.id+':fog');
    scenes.push({
      type:s.type, name:s.name, w:s.w, h:s.h, cal:s.cal, center:s.center, shapes:s.shapes,
      walls:s.walls||[], tokens:s.tokens||{}, fogMode:s.fogMode||'manual',
      img: img ? await blobToDataURL(img.blob) : null,
      fog: fog ? await blobToDataURL(fog.blob) : null
    });
  }
  const c=activeCampaign();
  const data={ v:6, campaign:{name:c?c.name:'Campaign', players:players()},
    ini:S.ini, idx:LIB.idx,
    table:{dpi:T.dpi, diag:parseFloat($('diagIn').value)||27, cover:T.cover,
           bright:T.bright, contrast:T.contrast} , scenes:scenes };
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  const slug=(c?c.name:'campaign').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,28);
  a.download='tabletop-'+slug+'-'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(a.href);
  toast('Campaign exported: '+scenes.length+' scenes and '+players().length+' players.');
};

const dataURLToBlob = async u => (await fetch(u)).blob();

$('fileSes').onchange=e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  const r=new FileReader();
  r.onload=async ()=>{
    let d; try{ d=JSON.parse(r.result); }catch(err){ toast('That file is not a valid backup.'); return; }
    const list=d.scenes||[];
    /* An imported backup always becomes a new campaign and never overwrites existing data. */
    const backupCampaign = d.campaign || d.campana;
    const name = (backupCampaign && backupCampaign.name) ? backupCampaign.name+' (imported)' : 'Imported campaign';
    const newCampaign = await createCampaign(name);
    CAMP.id = newCampaign.id;
    if(backupCampaign && backupCampaign.players)
      newCampaign.players = backupCampaign.players.map(migrateCombatant);
    renderCampaignSelector(); renderPlayers();
    toast('Importing '+list.length+' scenes…');
    for(const legacyScene of list){
      const sd=migrateSceneRecord(legacyScene);
      /* Older formats stored the image in "src"; newer ones use "img". */
      const source = sd.img || sd.src;
      if(!source) continue;
      const blob = await dataURLToBlob(source);
      const file = new File([blob], sd.name||'scene.png', {type:blob.type||'image/png'});
      const importedScene = await addSceneFile(file, sd.type||'map');
      if(!importedScene) continue;
      if(sd.cal) importedScene.cal=sd.cal;
      if(sd.center) importedScene.center=sd.center;
      if(sd.shapes) importedScene.shapes=sd.shapes;
      if(sd.walls) importedScene.walls=sd.walls;
      if(sd.tokens) importedScene.tokens=sd.tokens;
      if(sd.fogMode) importedScene.fogMode=sd.fogMode;
      await saveSceneMeta(importedScene);
      if(sd.fog && DB.ok){
        const fb=await dataURLToBlob(sd.fog);
        await dbPut('blobs',{key:importedScene.id+':fog', blob:fb});
      }
    }
    if(d.table){
      T.dpi=d.table.dpi||T.dpi; T.cover=!!d.table.cover;
      T.bright=d.table.bright||1; T.contrast=d.table.contrast||1;
      $('dpiIn').value=T.dpi; $('diagIn').value=d.table.diag||27; $('galCover').checked=T.cover;
      $('brIn').value=Math.round(T.bright*100); $('coIn').value=Math.round(T.contrast*100);
      $('brLbl').textContent=Math.round(T.bright*100)+'%'; $('coLbl').textContent=Math.round(T.contrast*100)+'%';
      applyFilter();
    }
    if(d.ini){
      S.ini={...S.ini, ...d.ini, selId:null, entry:null, undo:[]};
      S.ini.list=(S.ini.list||[]).map(m=>({temp:0, conditions:[], saves:[0,0,0,0,0,0], ...m}));
      setInitiativeId(Math.max(1,...S.ini.list.map(m=>m.id||0))+1);
      if(S.ini.numbers!==undefined && !d.ini.hpMode) S.ini.hpMode = S.ini.numbers ? 'pj' : 'none';
      $('iniHp').value=S.ini.hpMode||'pj'; renderInitiativeList();
    }
    touchCampaign(); touchState(); await flush();
    renderLibrary(); renderPlayers();
    const own=campaignScenes();
    if(own.length) await selectScene(LIB.scenes.indexOf(own[0]));
    draw();
    toast('Campaign "'+name+'" imported.');
  };
  r.readAsText(f);
};
}
