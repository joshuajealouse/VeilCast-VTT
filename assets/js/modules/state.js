export const COLORS = ['#5AD2E8','#E0A33C','#E0603C','#8BE07A','#C88BE8'];

export const EFFECTS = [
  {id:'difficult', name:'Difficult terrain', color:'#C89B5A', pat:'hatch', geo:'area'},
  {id:'fire',      name:'Fire',              color:'#E0603C', pat:'flame', geo:'circle'},
  {id:'ice',       name:'Ice',               color:'#7FD4E8', pat:'shard', geo:'circle'},
  {id:'poison',    name:'Poison',            color:'#8BE07A', pat:'dots',  geo:'circle'},
  {id:'dark',      name:'Darkness',          color:'#8A7BE8', pat:'noise', geo:'circle'},
  {id:'water',     name:'Water or fog',      color:'#5AD2E8', pat:'waves', geo:'area'},
  {id:'wall',      name:'Wall',              color:'#E0A33C', pat:'brick', geo:'wall'},
  {id:'hallowed',  name:'Hallowed ground',   color:'#FFD86B', pat:'rays',  geo:'circle'}
];

export const S = {
  view:{x:0,y:0,k:1},
  tool:'pan', color:COLORS[0], persist:false, showGrid:false,
  /* Snapping is per tool so measuring does not move walls or tokens off-grid. */
  snap:{measure:'none', effect:'center', occlusion:'corner', token:'center'},
  measureShape:'line', measureDistance:0,
  wallDraft:null, selectedWalls:[], wallMode:'segment', wallNew:false, wallsOnly:false,
  tokenSel:null, tableTokens:'hidden', showVision:false, showLights:false,
  fogMode:'hide', fogShape:'brush', brush:75,
  /* Keep new maps partly visible in the DM view while fog remains opaque at the table. */
  fogOpacity:0.5,
  fxPreset:EFFECTS[0], animSel:null, fxGeo:'circle', fxAlpha:1, fxBlend:'normal', wallW:1,
  sel:null, selMulti:[], selTokens:[], pinning:null, clipboard:[], redo:[], anchor:null,
  theme:'ember', ui:1,
  ini:{list:[], turnId:null, selId:null, mode:'dmg', entry:null, undo:[],
       show:true, corner:'tr', scale:1, hpMode:'pj'},
  pointers:new Map(), pinch:null, spaceDown:false, selDown:false, panning:null, drawing:null,
  cursor:null, cursorWorld:null, pings:[], showFrame:true, lasso:null,
  draft:null, history:[]
};

export const LIB = { scenes:[], idx:-1, imgSel:null, filter:'' };
export const CAMP = { list:[], id:null };
export const T = { win:null, cv:null, ctx:null, W:1280, H:720, dpi:96, test:false,
                   black:false, cover:false, fadeT:0, bright:1, contrast:1 };
export const FADE = 320;
