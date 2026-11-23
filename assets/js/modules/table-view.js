export function createTableView({ $, S, T, PAL, FADE, cal, sc, sceneOverlay, renderScene, drawInitiative, draw, touchState, touchScene, renderSteps, toast, updateScaleBar }) {
  function tableOpen(){ return !!(T.win && !T.win.closed); }
  function tableScale(){ return cal().gridPx ? T.dpi/cal().gridPx : 0; }
  function tableView(){
    const s=sc();
    if(!s) return {k:1,x:0,y:0};
    const k=tableScale();
    return {k, x:T.W/2-s.center.x*k, y:T.H/2-s.center.y*k};
  }
  async function openTable(){
    if(tableOpen()){ T.win.focus(); return; }

    /* On a secure origin, query the monitor layout and open the table window directly on
       the table display. */
    let features='width=1280,height=720', screen=null;
    try{
      if(window.getScreenDetails){
        const det=await window.getScreenDetails();
        screen = det.screens.find(p=>!p.isCurrent) || null;
        if(screen) features='left='+screen.availLeft+',top='+screen.availTop+
                            ',width='+screen.availWidth+',height='+screen.availHeight;
      }
    }catch(err){ /* If permission is denied or only one monitor exists, open as usual. */ }

    const w=window.open('','mesaDeBatalla',features);
    if(!w){ toast('The browser blocked the window. Please allow pop-ups for this site.'); return; }
    w.document.open();
    w.document.write('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Tabletop — player view</title>'+
      '<style>html,body{margin:0;height:100%;background:'+PAL.inkDeep+';overflow:hidden;cursor:none}'+
      'canvas{display:block;width:100%;height:100%}'+
      '#tip{position:fixed;left:0;right:0;bottom:26px;text-align:center;color:'+PAL.muted2+';'+
      'font:12px ui-monospace,Menlo,monospace;transition:opacity .5s}</style></head>'+
      '<body><canvas id="c"></canvas><div id="tip">Drag this window to your table monitor and click for full screen</div></body></html>');
    w.document.close();
    T.win=w; T.cv=w.document.getElementById('c'); T.ctx=T.cv.getContext('2d');
    w.addEventListener('resize', sizeTable);
    w.document.body.addEventListener('click',()=>{
      const el=w.document.documentElement;
      if(el.requestFullscreen) el.requestFullscreen().catch(()=>{});
      const t=w.document.getElementById('tip'); if(t) t.style.opacity='0';
    });
    T.tableIsOpen=true; touchState(); renderSteps();
    autoDpi(); sizeTable(); applyFilter(); syncTableUI();

    if(screen){
      try{
        await w.document.documentElement.requestFullscreen({screen:screen});
        const t=w.document.getElementById('tip'); if(t) t.style.opacity='0';
        toast('Table view opened on '+(screen.label||'the second monitor')+'.');
      }catch(err){
        toast('Table view opened on the second monitor. Click it for full screen.');
      }
    } else {
      toast('Table view opened. Move it to your table monitor and click for full screen.');
    }
  }
  function closeTable(){ if(tableOpen()) T.win.close(); T.win=null; syncTableUI(); draw(); }
  function sizeTable(){
    if(!tableOpen()) return;
    const w=T.win, dpr=w.devicePixelRatio||1;
    T.W=w.innerWidth; T.H=w.innerHeight;
    T.cv.width=Math.round(T.W*dpr); T.cv.height=Math.round(T.H*dpr); T.dpr=dpr;
    $('tableRes').textContent=T.W+'×'+T.H;
    const sig=w.screen.width+'x'+w.screen.height;
    if(sig!==T.lastScreen){ T.lastScreen=sig; autoDpi(); }
    draw();
  }
  function autoDpi(){
    const d=parseFloat($('diagIn').value);
    if(!tableOpen()||!d) return;
    const s=T.win.screen;
    T.dpi=Math.round(Math.hypot(s.width,s.height)/d*100)/100;
    $('dpiIn').value=T.dpi; updateTableInfo();
  }
  function updateTableInfo(){
    $('tableInfo').textContent = tableOpen()
      ? (Math.round(T.W/T.dpi*10)/10)+'×'+(Math.round(T.H/T.dpi*10)/10)+' squares'
      : 'not open';
    draw();
  }
  function applyFilter(){
    if(tableOpen()) T.cv.style.filter='brightness('+T.bright+') contrast('+T.contrast+')';
  }
  function drawTable(){
    if(!tableOpen()||!T.ctx) return;
    const c=T.ctx, dpr=T.dpr||1;
    const ov = sceneOverlay();
    if(T.black){
      c.setTransform(dpr,0,0,dpr,0,0);
      c.clearRect(0,0,T.W,T.H); c.fillStyle=PAL.inkDeep; c.fillRect(0,0,T.W,T.H);
    } else if(ov && ov.ready){
      c.setTransform(dpr,0,0,dpr,0,0);
      c.clearRect(0,0,T.W,T.H); c.fillStyle=PAL.inkDeep; c.fillRect(0,0,T.W,T.H);
      const k = T.cover ? Math.max(T.W/ov.w, T.H/ov.h) : Math.min(T.W/ov.w, T.H/ov.h);
      const w=ov.w*k, h=ov.h*k;
      c.imageSmoothingQuality='high';
      c.drawImage(ov.img, (T.W-w)/2, (T.H-h)/2, w, h);
      if(S.ini.show) drawInitiative(c,T.W,T.H,dpr);
    } else {
      try{
        renderScene(c, tableView(), T.W, T.H, dpr, {
          grid:false, fogOpacity:1, labels:true, handles:false, anchor:false,
          brushCursor:false, hideHelpers:true, tableFrame:false,
          pointer:S.tool==='pointer', testGrid:T.test, initiative:true,
          walls:false, tokens:S.tableTokens, draftLabels:true
        });
      }catch(err){
        console.error('Failed to draw table:', err);
        if(!T.warned){ T.warned=true; toast('Error drawing the table: '+err.message); }
      }
    }
    const el=performance.now()-T.fadeT;
    if(el<FADE){
      c.setTransform(dpr,0,0,dpr,0,0);
      c.globalAlpha=1-el/FADE; c.fillStyle=PAL.inkDeep; c.fillRect(0,0,T.W,T.H); c.globalAlpha=1;
    }
  }
  function setBlack(v){
    if(T.black!==v) T.fadeT=performance.now();
    T.black=v; $('btnBlack').classList.toggle('on',v); draw();
  }
  function nudgeTable(dx,dy){
    const s=sc(); if(!s||s.type!=='map') return;
    const k=tableScale()||1;
    s.center.x+=dx/k; s.center.y+=dy/k; touchScene(); draw();
  }
  function syncTableUI(){
    const on=tableOpen();
    $('btnTable').textContent = on ? 'Close table view' : 'Open table view';
    $('btnTable').classList.toggle('on',on);
    updateTableInfo();
    updateScaleBar();
  }
  setInterval(()=>{ if(!tableOpen() && $('btnTable').classList.contains('on')) syncTableUI(); },1000);
  addEventListener('beforeunload',()=>{ if(tableOpen()) T.win.close(); });

  return { tableOpen, tableScale, openTable, closeTable, sizeTable, autoDpi, updateTableInfo, applyFilter, drawTable, setBlack, nudgeTable, syncTableUI };
}
