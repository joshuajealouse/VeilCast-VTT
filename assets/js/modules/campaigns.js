export function createCampaignSystem({ $, S, CAMP, LIB, DB, DIRTY_STATE, T, PAL, dbPut, dbDel, loadCampaignState, flush, renderInitiativeList, renderLibrary, selectScene, draw, toast, touchState, requestConfirm, releaseScene, tokenOf, newInitiativeId, onCreateCampaign }) {
/* A campaign groups its scenes, players, and combat state. Player hit points belong to
   the campaign, so combat updates them directly without copies or later synchronization. */
const activeCampaign = () => CAMP.list.find(c=>c.id===CAMP.id) || null;
const players  = () => { const c=activeCampaign(); return c ? (c.players||(c.players=[])) : []; };
const playerById = id => players().find(j=>j.id===id) || null;

async function saveCampaign(){
  const c=activeCampaign(); if(!c || !DB.ok) return;
  c.updated=Date.now();
  await dbPut('camps', {id:c.id, name:c.name, players:c.players||[], created:c.created, updated:c.updated});
}
function touchCampaign(){ DIRTY_STATE.campaign=true; }

async function createCampaign(name){
  const c={id:'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
           name:name||'Untitled campaign', players:[], created:Date.now()};
  CAMP.list.push(c);
  onCreateCampaign();           // new campaign: make the help available again
  if(DB.ok) await dbPut('camps', {...c});
  return c;
}
async function switchCampaign(id){
  if(id===CAMP.id) return;
  await flush();
  CAMP.id=id;
  LIB.idx=-1; LIB.imgSel=null; S.sel=null; S.history=[];
  S.ini={...S.ini, list:[], turnId:null, selId:null, entry:null, undo:[]};
  const campaignState = await loadCampaignState(id);
  if(campaignState && campaignState.ini) S.ini={...S.ini, ...campaignState.ini, selId:null, entry:null, undo:[]};
  renderCampaignSelector(); renderPlayers(); renderInitiativeList(); renderLibrary();
  const scenes=campaignScenes();
  if(scenes.length){
    const i = campaignState && campaignState.active ? LIB.scenes.findIndex(x=>x.id===campaignState.active) : LIB.scenes.indexOf(scenes[0]);
    await selectScene(i>=0 ? i : LIB.scenes.indexOf(scenes[0]));
  } else {
    $('empty').style.display='flex'; $('brandInfo').textContent='no scene'; draw();
  }
  touchState();
}
const campaignScenes = () => LIB.scenes.filter(s=>s.campaignId===CAMP.id);

function renderCampaignSelector(){
  const sel=$('selectedCampaign'); sel.innerHTML='';
  CAMP.list.forEach(c=>{
    const o=document.createElement('option');
    o.value=c.id; o.textContent=c.name; if(c.id===CAMP.id) o.selected=true;
    sel.appendChild(o);
  });
}

/* --- campaign players --- */
let playerUid=1;
function renderTokenSelector(){
  const sel=$('playerTokenSelect'); if(!sel) return;
  const list=players();
  sel.innerHTML='';
  if(!list.length){
    const o=document.createElement('option'); o.textContent='(no players)'; sel.appendChild(o); return;
  }
  list.forEach(j=>{
    const o=document.createElement('option');
    o.value=j.id;
    o.textContent = j.character + (tokenOf(j) ? ' · on map' : ' · not placed');
    if(S.tokenSel===j) o.selected=true;
    sel.appendChild(o);
  });
  if(!S.tokenSel) S.tokenSel=list[0];
  $('tokenVision').value = S.tokenSel.vision!=null ? S.tokenSel.vision : 30;
}

function renderPlayers(){
  const box=$('playerList'); if(!box) return;
  box.innerHTML='';
  const list=players();
  list.forEach((j,i)=>{
    const row=document.createElement('div');
    const downed = j.hpMax>0 && j.hp<=0;
    row.className='ini'+(downed?' down':'');
    row.title='Edit player';
    const dot=document.createElement('div'); dot.className='dot'; dot.style.background=PAL.measure;
    const nm=document.createElement('div'); nm.className='nm';
    nm.textContent = j.character + (j.player ? ' · '+j.player : '');
    const hp=document.createElement('div'); hp.className='hp';
    hp.textContent = (j.hpMax>0 ? j.hp+'/'+j.hpMax+(j.temp>0?' +'+j.temp:'') : '—');
    const add=document.createElement('button'); add.className='ed'; add.textContent='＋';
    add.title='Add to combat';
    add.onclick=ev=>{ ev.stopPropagation(); addToCombat(j); };
    const ed=document.createElement('button'); ed.className='ed'; ed.textContent='✎';
    ed.onclick=ev=>{ ev.stopPropagation(); openPlayer(j); };
    const del=document.createElement('button'); del.className='x'; del.textContent='×';
    del.onclick=async ev=>{ ev.stopPropagation();
      if(!await requestConfirm('Remove player',
          j.character+' will be removed from this campaign, together with their hit points and token.',
          'Remove', true)) return;
      list.splice(i,1);
      S.ini.list=S.ini.list.filter(m=>m.pid!==j.id);
      touchCampaign(); renderPlayers(); renderInitiativeList(); draw(); };
    row.append(dot,nm,hp,add,ed,del);
    row.onclick=()=>openPlayer(j);
    box.appendChild(row);
  });
  $('playerHint').style.display = list.length ? 'none' : 'block';
}

function addToCombat(j){
  if(S.ini.list.some(m=>m.pid===j.id)){ toast(j.character+' is already in combat.'); return; }
  const m={id:newInitiativeId(), pid:j.id, name:j.character, init:10, type:'pj',
           hp:j.hp, hpMax:j.hpMax, temp:j.temp||0, conditions:[...(j.conditions||[])], saves:[...(j.saves||[0,0,0,0,0,0])]};
  S.ini.list.push(m);
  if(!S.ini.turnId) S.ini.turnId=m.id;
  renderInitiativeList(); draw();
  toast(j.character+' added. Set their initiative.');
}
function allToCombat(){
  players().forEach(j=>{ if(!S.ini.list.some(m=>m.pid===j.id)) addToCombat(j); });
}

/* Copy combat changes back to the campaign player. */
function syncPlayer(m){
  if(!m || !m.pid) return;
  const j=playerById(m.pid); if(!j) return;
  j.hp=m.hp; j.hpMax=m.hpMax; j.temp=m.temp||0;
  j.conditions=[...(m.conditions||[])]; j.saves=[...(m.saves||[0,0,0,0,0,0])];
  touchCampaign(); renderPlayers();
}
/* --- long rest --- */
let restBackup=null;
async function longRest(){
  const list=players();
  if(!list.length){ toast('No players in this campaign.'); return; }
  if(!await requestConfirm('Long rest',
      'Every character returns to full hit points, loses temporary HP and has their conditions removed. This can be undone.',
      'Rest')) return;
  restBackup = list.map(j=>({...j, conditions:[...(j.conditions||[])], saves:[...(j.saves||[0,0,0,0,0,0])]}));
  list.forEach(j=>{ j.hp=j.hpMax; j.temp=0; j.conditions=[]; j.saves=[0,0,0,0,0,0]; });
  S.ini.list.forEach(m=>{
    const j=m.pid?playerById(m.pid):null;
    if(j){ m.hp=j.hp; m.temp=0; m.conditions=[]; m.saves=[0,0,0,0,0,0]; }
  });
  $('btnUndoLongRest').style.display='block';
  touchCampaign(); renderPlayers(); renderInitiativeList(); draw();
  toast('Long rest applied.');
}
function undoLongRest(){
  if(!restBackup) return;
  const c=activeCampaign(); if(!c) return;
  c.players=restBackup; restBackup=null;
  S.ini.list.forEach(m=>{
    const j=m.pid?playerById(m.pid):null;
    if(j){ m.hp=j.hp; m.temp=j.temp||0; m.conditions=[...(j.conditions||[])]; m.saves=[...(j.saves||[0,0,0,0,0,0])]; }
  });
  $('btnUndoLongRest').style.display='none';
  touchCampaign(); renderPlayers(); renderInitiativeList(); draw();
  toast('Long rest undone.');
}

async function deleteCampaign(){
  const c=activeCampaign(); if(!c) return;
  if(CAMP.list.length<2){ toast('You cannot delete your only campaign.'); return; }
  const ok = await requestConfirm('Delete campaign',
    'This will remove all scenes in "'+c.name+'", their fog, effects and players. This cannot be undone.',
    'Delete', true);
  if(!ok) return;
  for(const s of LIB.scenes.filter(x=>x.campaignId===c.id)){
    if(s.thumbUrl) URL.revokeObjectURL(s.thumbUrl);
    releaseScene(s);
    if(DB.ok){ await dbDel('scenes',s.id); await dbDel('blobs',s.id+':img'); await dbDel('blobs',s.id+':fog'); }
  }
  LIB.scenes = LIB.scenes.filter(x=>x.campaignId!==c.id);
  CAMP.list = CAMP.list.filter(x=>x.id!==c.id);
  if(DB.ok){
    await dbDel('camps',c.id);
    await dbDel('state','campaign:'+c.id);
    await dbDel('state','camp:'+c.id);
  }
  CAMP.id=null;
  renderCampaignSelector();
  await switchCampaign(CAMP.list[0].id);
  toast('Campaign deleted.');
}

/* --- player dialog --- */
let playerTarget=null;
function openPlayer(j){
  playerTarget=j||null;
  $('playerTitle').textContent = j ? 'Edit player' : 'New player';
  $('playerCharacter').value = j ? j.character : '';
  $('playerName').value   = j ? (j.player||'') : '';
  $('playerClass').value     = j ? (j.cls||'') : '';
  $('playerLevel').value     = j ? (j.level||1) : 1;
  $('playerHp').value        = j ? j.hp : 10;
  $('playerMaxHp').value       = j ? j.hpMax : 10;
  $('playerTempHp').value      = j ? (j.temp||0) : 0;
  $('player').classList.remove('hide');
  setTimeout(()=>$('playerCharacter').focus(),30);
}
function closePlayer(){ $('player').classList.add('hide'); playerTarget=null; }
function savePlayer(){
  const character=($('playerCharacter').value||'').trim()||'Character';
  const data={
    character, player:($('playerName').value||'').trim(),
    cls:($('playerClass').value||'').trim(), level:parseInt($('playerLevel').value)||1,
    hpMax:Math.max(0,parseInt($('playerMaxHp').value)||0),
    hp:Math.max(0,parseInt($('playerHp').value)||0),
    temp:Math.max(0,parseInt($('playerTempHp').value)||0)
  };
  if(playerTarget){
    Object.assign(playerTarget, data);
    S.ini.list.forEach(m=>{ if(m.pid===playerTarget.id){
      m.name=data.character; m.hp=data.hp; m.hpMax=data.hpMax; m.temp=data.temp; } });
  } else {
    players().push({id:'j'+(playerUid++)+Date.now().toString(36), conditions:[], saves:[0,0,0,0,0,0],
                      vision:30, ...data});
  }
  closePlayer(); touchCampaign(); renderPlayers(); renderInitiativeList(); draw();
}

  return { activeCampaign, players, playerById, saveCampaign, touchCampaign, createCampaign, switchCampaign, campaignScenes, renderCampaignSelector, renderTokenSelector, renderPlayers, addToCombat, allToCombat, syncPlayer, longRest, undoLongRest, deleteCampaign, openPlayer, closePlayer, savePlayer };
}
