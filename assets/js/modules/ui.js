export function createUi({ $, S, touchState, getPalette }) {
  const PAL = getPalette();
let tTimer;
/* Sixty-eight call sites share one notice. A second notice within 2.6 seconds used to
   erase the first; in a burst, only the last was readable. Queue them instead. */
const TOAST_QUEUE_MAX = 2;
let toastQueue = [];
function toast(msg){
  const t=$('toast');
  if(t.classList.contains('show')){
    /* Repeating the current notice or filling the queue with old messages helps no one.
       Keep the queue short so the latest event matters. */
    if(t.textContent===msg || toastQueue.includes(msg)) return;
    toastQueue.push(msg);
    while(toastQueue.length>TOAST_QUEUE_MAX) toastQueue.shift();
    return;
  }
  showToast(msg);
}
function showToast(msg){
  const t=$('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(tTimer);
  tTimer=setTimeout(()=>{
    t.classList.remove('show');
    /* The fade takes 260ms; chaining it sooner would look like a flicker. */
    if(toastQueue.length) setTimeout(()=>{ const s=toastQueue.shift(); if(s) showToast(s); }, 260);
  }, 2600);
}

/* ============ custom dialogs ============ */
/* All seven dialogs share a structure, so install the focus trap once. Without it, Tab
   escapes to the still-active page behind the dialog. */
const DIALOGS = ['modal','player','shortcuts','conc','multi','textDialog','confirmDialog','settingsDialog'];
const FOCUSABLE = 'button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])';
for(const id of DIALOGS){
  $(id).addEventListener('keydown', e=>{
    if(e.key!=='Tab') return;
    const fields=[...$(id).querySelectorAll(FOCUSABLE)].filter(el=>el.offsetParent!==null);
    if(!fields.length) return;
    const first=fields[0], last=fields[fields.length-1];
    if(e.shiftKey && document.activeElement===first){ last.focus(); e.preventDefault(); }
    else if(!e.shiftKey && document.activeElement===last){ first.focus(); e.preventDefault(); }
  });
}

/* Replace the browser's prompt() and confirm(), which break the app's appearance and
   appear in the wrong place in full screen. */
let resolveDialog=null;
function requestText(title, etiqueta, value=''){
  $('textTitle').textContent=title;
  $('textLabel').childNodes[0].nodeValue=etiqueta;
  $('textValue').value=value;
  $('textDialog').classList.remove('hide');
  setTimeout(()=>{ $('textValue').focus(); $('textValue').select(); },30);
  return new Promise(res=>{ resolveDialog=res; });
}
function closeText(v){
  $('textDialog').classList.add('hide');
  const r=resolveDialog; resolveDialog=null;
  if(r) r(v);
}
$('dtAceptar').onclick=()=>closeText($('textValue').value.trim());
$('textCancel').onclick=()=>closeText(null);
$('textDialog').onclick=e=>{ if(e.target===$('textDialog')) closeText(null); };
$('textDialog').addEventListener('keydown',e=>{ e.stopPropagation();
  if(e.key==='Enter') closeText($('textValue').value.trim());
  if(e.key==='Escape') closeText(null); });

let confResolver=null;
function requestConfirm(title, text, etiquetaOk='Accept', danger=false){
  $('confirmTitle').textContent=title;
  $('confirmText').textContent=text;
  $('dcAceptar').textContent=etiquetaOk;
  $('dcAceptar').style.color = danger ? PAL.dangerSoft : '';
  $('dcAceptar').style.borderColor = danger ? 'var(--danger)' : '';
  $('dcAceptar').style.background = danger ? 'rgba('+PAL.dangerRgb+',.16)' : '';
  $('confirmDialog').classList.remove('hide');
  return new Promise(res=>{ confResolver=res; });
}
function closeConfirm(v){
  $('confirmDialog').classList.add('hide');
  const r=confResolver; confResolver=null;
  if(r) r(v);
}
$('dcAceptar').onclick=()=>closeConfirm(true);
$('confirmCancel').onclick=()=>closeConfirm(false);
$('confirmDialog').onclick=e=>{ if(e.target===$('confirmDialog')) closeConfirm(false); };
$('confirmDialog').addEventListener('keydown',e=>{ e.stopPropagation();
  if(e.key==='Enter') closeConfirm(true);
  if(e.key==='Escape') closeConfirm(false); });

/* ============ shortcut guide ============ */
const SHORTCUTS = [
  ['Tools', [
    ['V','Pan the view'], ['S','Select and move'], ['M','Measure'],
    ['X','Effects'], ['F','Fog of war'], ['P','Table pointer'],
    ['E','Move table framing'], ['K','Calibrate square'], ['O','Anchor measure origin'],
    ['Y','Occlusion walls'], ['J','Player tokens']
  ]],
  ['Walls and vision', [
    ['Drag token','Recalculates visibility'],
    ['Click a segment','Select it — then Open / close or One-way'],
    ['Shift + click','Add or remove from the selection'],
    ['Double click','Select the whole wall'],
    ['Alt + click','Split a segment with a new vertex'],
    ['Ctrl + Z','Step back one vertex while drawing a wall'],
    ['Del','Delete the selected walls'],
    ['Enter','Finish the wall being drawn']
  ]],
  ['Measurement shapes', [
    ['R','Line'], ['C','Circle'], ['N','Cone'], ['Q','Square'], ['W','Wall'], ['D','Freehand']
  ]],
  ['Selecting', [
    ['Ctrl + click','Borrow the select tool from wherever you are'],
    ['Right-click','Menu for what is under the pointer: shape, token or empty map'],
    ['On a trackpad','Two-finger tap. Ctrl + click is the grab, not the menu'],
    ['Click','Replaces the selection — topmost wins, tokens are topmost'],
    ['Shift + click','Add or remove; on empty space it keeps what you had'],
    ['Drag','Moves everything selected, effects and tokens together'],
    ['Del','Delete; a token only leaves this map, never the campaign']
  ]],
  ['View', [
    ['Wheel','Zoom'], ['Space + drag','Pan the map'], ['H','Hide the panel'],
    ['Tab','Next scene'], ['B','Fade table to black'],
    ['Arrows','Move framing one pixel'], ['Shift + arrows','Move it a full square']
  ]],
  ['Fog and strokes', [
    ['Ctrl + Z','Undo'], ['Ctrl + Shift + Z','Redo'],
    ['Ctrl + C / Ctrl + V','Copy and paste selection'],
    ['Shift + click','Add to selection'],
    ['Esc','Cancel current stroke'],
    ['Enter','Close the fog lasso'], ['Del','Delete selection']
  ]],
  ['Combat', [
    ['T','Next turn'],
    ['number + Enter','Damage to open combatant'], ['+ number','Healing'], ['t number','Temp HP']
  ]],
  ['Help', [ ['?','This screen'] ]]
];
function renderShortcuts(){
  const box=$('shortcutsBody'); box.innerHTML='';
  SHORTCUTS.forEach(([title,rows])=>{
    const col=document.createElement('div');
    col.innerHTML='<p class="eyebrow" style="margin-bottom:7px">'+title+'</p>';
    rows.forEach(([k,d])=>{
      const r=document.createElement('div');
      r.style.cssText='display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:12px';
      r.innerHTML='<span style="color:var(--muted)">'+d+'</span><kbd>'+k+'</kbd>';
      col.appendChild(r);
    });
    box.appendChild(col);
  });
}
function openShortcuts(){ renderShortcuts(); $('shortcuts').classList.remove('hide'); }

/* ============ collapsible sections ============ */
/* Each collapsible heading wraps the rest of its section so it can be hidden. Many
   scenes or combatants otherwise make the panel too long. */
function prepareFolding(){
  /* Store collapse state by section title so the next session restores the panel as left. */
  const closed = new Set(S.collapsedSections||[]);
  document.querySelectorAll('.eyebrow.fold').forEach(h=>{
    const key=(h.textContent||'').trim();         // before adding the chevron
    const body=document.createElement('div');
    body.className='fbody';
    while(h.nextSibling) body.appendChild(h.nextSibling);
    h.parentNode.appendChild(body);
    h.insertAdjacentHTML('afterbegin','<span class="chev">▼</span>');
    const apply=closed=>{
      h.classList.toggle('closed',closed);
      body.style.display = closed ? 'none' : '';
    };
    apply(closed.has(key));
    h.onclick=()=>{
      const closed=!h.classList.contains('closed');
      apply(closed);
      if(closed) closed.add(key); else closed.delete(key);
      S.collapsedSections=[...closed]; touchState();
    };
  });
}

  return { toast, requestText, requestConfirm, openShortcuts, prepareFolding };
}
