export function createRenderer({ $, cv, ctx, S, T, PAL, sc, isMap, cal, shapes, players, tokenOf, dist, w2s, shapePath, FILLED, bbox, shapeLabel, patTile, videoFrame, drawAnim, drawWalls, drawLights, drawVision, drawTokens, tableScale, tableOpen, drawTable, turnIdx, conditionIcon, dprMain }) {
function renderScene(c, view, W, H, dpr, o){
  c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,W,H);
  c.fillStyle=PAL.inkDeep; c.fillRect(0,0,W,H);
  const s=sc();
  if(!s || !s.ready){ if(o.initiative) drawInitiative(c,W,H,dpr); return; }

  c.save();
  c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
  c.imageSmoothingQuality='high';
  if(o.dim) c.globalAlpha=0.3;
  c.drawImage(s.img,0,0);
  c.globalAlpha=1;
  c.restore();

  if(s.type==='map'){
    if(o.grid) drawGrid(c,view,dpr,W,H,false);
    if(s.fogCv){
      c.save();
      c.globalAlpha=o.fogOpacity;
      c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
      c.imageSmoothingEnabled=false;
      c.drawImage(s.fogCv,0,0,s.w,s.h);
      c.restore();
    }
    const all = S.draft ? s.shapes.concat([S.draft]) : s.shapes;
    for(const sh of all){
      if(sh.hidden) continue;
      if(o.hideHelpers && (sh.rectFree || sh.type==='calibrate')) continue;
      drawShape(c,view,dpr,sh, sh===S.draft, o);
    }
    if(S.lasso) drawLasso(c,view,dpr);
    if(o.testGrid) drawGrid(c,view,dpr,W,H,true);
    if(o.labels) drawLabels(c,view,dpr,o);
    if(o.handles && S.sel && S.selMulti.length<2 && !S.selTokens.length) drawHandles(c,view,dpr);
    if(o.handles && S.selMulti.length+S.selTokens.length>1) drawSelBox(c,view,dpr);
    if(o.handles) drawAnchors(c,view,dpr);
    if(o.anchor && S.anchor) drawAnchor(c,view,dpr);
    if(o.tableFrame) drawTableFrame(c,view,dpr);
    if(o.lights) drawLights(c,view,dpr);
    if(o.vision && S.tool==='token') drawVision(c,view,dpr);
    if(o.walls) drawWalls(c,view,dpr,o);
    if(o.tokens) drawTokens(c,view,dpr,o.tokens,!o.hideHelpers);
    if(o.brushCursor) drawBrushCursor(c,view,dpr);
  }
  if(o.pointer) drawPointer(c,view,dpr);
  drawPings(c,view,dpr);
  if(o.initiative) drawInitiative(c,W,H,dpr);
}

function drawGrid(c,view,dpr,W,H,bright){
  const g=cal().gridPx; const s=sc();
  if(!g || g*view.k<5 || !s) return;
  c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
  const ox=cal().ox||0, oy=cal().oy||0;
  const x0=Math.floor((-view.x/view.k-ox)/g)*g+ox, x1=(W-view.x)/view.k;
  const y0=Math.floor((-view.y/view.k-oy)/g)*g+oy, y1=(H-view.y)/view.k;
  c.beginPath();
  if(bright){
    for(let x=x0;x<=x1;x+=g){ c.moveTo(x,y0); c.lineTo(x,y1); }
    for(let y=y0;y<=y1;y+=g){ c.moveTo(x0,y); c.lineTo(x1,y); }
  } else {
    for(let x=ox%g;x<=s.w;x+=g){ c.moveTo(x,0); c.lineTo(x,s.h); }
    for(let y=oy%g;y<=s.h;y+=g){ c.moveTo(0,y); c.lineTo(s.w,y); }
  }
  c.strokeStyle = bright ? 'rgba('+PAL.measureRgb+',.85)' : 'rgba('+PAL.textRgb+',.20)';
  c.lineWidth = (bright?1.4:1)/view.k;
  c.stroke();
  c.setTransform(dpr,0,0,dpr,0,0);
}

function drawShape(c,view,dpr,s,isDraft,o){
  const g=s.geo||s.type;
  let alpha=1;
  /* Selection belongs to the director. Previously it was calculated without checking the
     window, so the table view thickened the outline of whatever the director had selected. */
  const marked = !o.hideHelpers && (s===S.sel || S.selMulti.includes(s));

  /* Draw animated effects using the current video frame. */
  if(s.anim){
    const cn = videoFrame(s.anim);
    if(cn){
      drawAnim(c, view, dpr, s, cn, alpha);
      /* Draw the outline only while drawing or selecting. The former "s!==S.sel" condition
         prevented the multiple-selection branch from running, so animated effects within a
         multi-selection were never marked. */
      if(!isDraft && !marked) return;
      c.save();
      c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
      c.strokeStyle = marked ? PAL.measure : (s.color||PAL.fog);
      c.lineWidth = (marked?2.4:1.4)/view.k;
      c.setLineDash([6/view.k,5/view.k]);
      c.stroke(shapePath(s));
      c.setLineDash([]);
      c.restore();
      c.setTransform(dpr,0,0,dpr,0,0);
      return;
    }
  }

  c.save();
  c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
  const p=shapePath(s);
  const col = g==='calibrate' ? PAL.danger : s.color;
  c.globalAlpha=alpha;

  if(FILLED.includes(g)){
    c.fillStyle = col+(s.kind==='effect'?'26':'22'); c.fill(p);
    if(s.kind==='effect' && s.pat){
      const tile=patTile(s.pat,col,cal().gridPx);
      const pattern=c.createPattern(tile,'repeat');
      if(pattern){ c.save(); c.globalAlpha=alpha*0.6; c.fillStyle=pattern; c.fill(p); c.restore(); }
    }
  }
  c.strokeStyle=col;
  c.lineWidth=(marked?3.2:2.2)/view.k;
  c.lineJoin='round'; c.lineCap='round';
  if(isDraft) c.setLineDash([7/view.k,5/view.k]);
  c.shadowColor=col; c.shadowBlur=s.kind==='effect'?6:10;
  c.stroke(p);
  c.shadowBlur=0; c.setLineDash([]);
  /* An extra half-pixel of width is not enough to distinguish a selection. Overlay a
     dashed selection-color line, as for animated effects, so the shape keeps its color
     and is still immediately recognizable. */
  if(marked){
    c.strokeStyle=PAL.measure; c.lineWidth=1.6/view.k;
    c.setLineDash([6/view.k,5/view.k]);
    c.stroke(p);
    c.setLineDash([]);
  }
  if(g!=='free' && s.kind!=='effect'){
    c.fillStyle=col; c.beginPath(); c.arc(s.a.x,s.a.y,3.2/view.k,0,Math.PI*2); c.fill();
  }
  c.globalAlpha=1;
  c.restore();
  c.setTransform(dpr,0,0,dpr,0,0);
}

function drawLabels(c,view,dpr,o){
  const s=sc(); if(!s) return;
  c.setTransform(dpr,0,0,dpr,0,0);
  /* The in-progress stroke already shows its measurement by the cursor on your screen, so
     do not repeat its label there. Draw it in the table view, which has no cursor. */
  const all = (o.draftLabels && S.draft) ? s.shapes.concat([S.draft]) : s.shapes;
  for(const sh of all){
    if(sh.hidden) continue;
    if(o.hideHelpers && (sh.rectFree || sh.type==='calibrate')) continue;
    const t=shapeLabel(sh); if(!t) continue;
    const p=w2s(sh.b,view);
    c.font='600 13px ui-monospace, Menlo, monospace';
    const wd=c.measureText(t).width, x=p.x+12, y=p.y-12;
    c.fillStyle='rgba('+PAL.inkRgb+',.85)'; c.strokeStyle='rgba('+PAL.lineRgb+',1)'; c.lineWidth=1;
    roundRect(c,x-6,y-15,wd+12,22,4); c.fill(); c.stroke();
    c.fillStyle = (sh.geo||sh.type)==='calibrate' ? PAL.danger : sh.color;
    c.fillText(t,x,y);
  }
}
function roundRect(c,x,y,w,h,r){
  c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}
function drawHandles(c,view,dpr){
  const s=S.sel; if(!s) return;
  c.setTransform(dpr,0,0,dpr,0,0);
  for(const [pt,fill] of [[s.a,PAL.inkDeep],[s.b,s.color]]){
    if(!pt) continue;
    const p=w2s(pt,view);
    c.beginPath(); c.arc(p.x,p.y,6,0,Math.PI*2);
    c.fillStyle=fill; c.fill(); c.strokeStyle=s.color; c.lineWidth=2; c.stroke();
  }
}
/* Use a shape's actual corners, not only its two points: a radius-300 circle has nearby
   endpoints but may fill half the screen. This frames the selection correctly. */
function borderPoints(s){
  const a=s.a, b=s.b, g=s.geo||s.type;
  if((g==='poly'||g==='free') && s.pts && s.pts.length) return s.pts;
  if(!a || !b) return s.pts || [];
  if(g==='circle'){
    const r=dist(a,b);
    return [{x:a.x-r,y:a.y-r},{x:a.x+r,y:a.y+r}];
  }
  if(g==='cone'){
    const L=dist(a,b)||0.001, ux=(b.x-a.x)/L, uy=(b.y-a.y)/L, hw=L/2;
    return [a, {x:a.x+ux*L-uy*hw, y:a.y+uy*L+ux*hw},
               {x:a.x+ux*L+uy*hw, y:a.y+uy*L-ux*hw}];
  }
  if(g==='wall'){
    const L=dist(a,b)||0.001, ux=(b.x-a.x)/L, uy=(b.y-a.y)/L;
    const hw=((s.w||1)*cal().gridPx)/2, px=-uy*hw, py=ux*hw;
    return [{x:a.x+px,y:a.y+py},{x:b.x+px,y:b.y+py},
            {x:b.x-px,y:b.y-py},{x:a.x-px,y:a.y-py}];
  }
  if(g==='area'){
    const h=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    return [{x:a.x-h,y:a.y-h},{x:a.x+h,y:a.y+h}];
  }
  if(g==='square' && !s.rectFree){
    const semi=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    return [{x:a.x-semi,y:a.y-semi},{x:a.x+semi,y:a.y+semi}];
  }
  return [a,b];
}
/* Two or more selected objects would create a swarm of handles, so frame the whole group.
   The frame shows both what is selected and that dragging moves everything together. */
function drawSelBox(c,view,dpr){
  let pts=[];
  for(const s of S.selMulti) pts=pts.concat(borderPoints(s));
  const rt=(cal().gridPx||50)*0.36;
  for(const j of S.selTokens){
    const t=tokenOf(j);
    if(t) pts.push({x:t.x-rt,y:t.y-rt},{x:t.x+rt,y:t.y+rt});
  }
  if(pts.length<2) return;
  const bb=bbox(pts), m=7/view.k;
  c.save();
  c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
  c.strokeStyle=PAL.measure; c.lineWidth=1.5/view.k;
  c.setLineDash([7/view.k,5/view.k]);
  c.strokeRect(bb.x0-m, bb.y0-m, (bb.x1-bb.x0)+m*2, (bb.y1-bb.y0)+m*2);
  c.setLineDash([]);
  c.restore();
  c.setTransform(dpr,0,0,dpr,0,0);
}
/* Show the link only when either endpoint is selected; always drawing it would clutter
   the map when several effects are pinned. */
function drawAnchors(c,view,dpr){
  const s=sc(); if(!s || !s.shapes) return;
  const pairs=[];
  for(const sh of s.shapes){
    if(!sh.pin) continue;
    const j=players().find(x=>x.id===sh.pin); if(!j) continue;
    const t=tokenOf(j); if(!t) continue;
    if(S.selTokens.includes(j) || sh===S.sel || S.selMulti.includes(sh)) pairs.push([t,sh]);
  }
  if(!pairs.length) return;
  c.save();
  c.setTransform(dpr*view.k,0,0,dpr*view.k, dpr*view.x, dpr*view.y);
  c.strokeStyle=PAL.point; c.lineWidth=1.4/view.k;
  c.setLineDash([3/view.k,4/view.k]);
  for(const [t,sh] of pairs){
    c.beginPath(); c.moveTo(t.x,t.y); c.lineTo(sh.a.x,sh.a.y); c.stroke();
  }
  c.setLineDash([]);
  c.restore();
  c.setTransform(dpr,0,0,dpr,0,0);
}
function drawAnchor(c,view,dpr){
  c.setTransform(dpr,0,0,dpr,0,0);
  const p=w2s(S.anchor,view);
  c.save(); c.strokeStyle=PAL.point; c.lineWidth=1.8; c.setLineDash([4,3]);
  c.beginPath(); c.arc(p.x,p.y,9,0,Math.PI*2); c.stroke(); c.setLineDash([]);
  c.beginPath(); c.moveTo(p.x-13,p.y); c.lineTo(p.x+13,p.y); c.moveTo(p.x,p.y-13); c.lineTo(p.x,p.y+13); c.stroke();
  c.restore();
}
function drawLasso(c,view,dpr){
  c.setTransform(dpr,0,0,dpr,0,0);
  const pts=S.lasso.map(p=>w2s(p,view));
  c.save(); c.strokeStyle=S.fogMode==='hide'?PAL.fog:PAL.measure; c.lineWidth=2; c.setLineDash([6,4]);
  c.beginPath(); c.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++) c.lineTo(pts[i].x,pts[i].y);
  if(S.cursor) c.lineTo(S.cursor.x,S.cursor.y);
  c.stroke(); c.setLineDash([]);
  for(const p of pts){ c.beginPath(); c.arc(p.x,p.y,3.5,0,Math.PI*2); c.fillStyle=c.strokeStyle; c.fill(); }
  c.restore();
}
function drawTableFrame(c,view,dpr){
  const s=sc(); if(!s) return;
  const kT=tableScale(); if(!kT) return;
  c.setTransform(dpr,0,0,dpr,0,0);
  const wW=T.W/kT, wH=T.H/kT;
  const x=(s.center.x-wW/2)*view.k+view.x, y=(s.center.y-wH/2)*view.k+view.y;
  c.save();
  c.strokeStyle = S.tool==='frame' ? PAL.frame : 'rgba('+PAL.frameRgb+',.55)';
  c.lineWidth = S.tool==='frame' ? 2.5 : 1.5;
  c.setLineDash([9,6]); c.strokeRect(x,y,wW*view.k,wH*view.k); c.setLineDash([]);
  if(S.tool==='frame'){ c.fillStyle='rgba('+PAL.frameRgb+',.08)'; c.fillRect(x,y,wW*view.k,wH*view.k); }
  c.font='600 11px ui-monospace, Menlo, monospace'; c.fillStyle=PAL.frame; c.fillText('TABLE',x+8,y+18);
  c.restore();
}
function hpColor(f){ return f>0.5 ? PAL.frame : f>0.25 ? PAL.fog : PAL.danger; }

function drawInitiative(c,W,H,dpr){
  const I=S.ini;
  if(!I.show || !I.list.length) return;
  c.setTransform(dpr,0,0,dpr,0,0);
  let u = Math.max(15, Math.min(34, H/26)) * I.scale;
  const rows=I.list.length;
  /* With many combatants, the card extended below the table screen and hid the end of the
     order. Shrink it just enough to fit. */
  const height = un => un*0.5*2 + un*1.5 + rows*un*1.25;
  const limit = H - 24;
  if(height(u) > limit) u = Math.max(9, u * limit/height(u));
  const pad = u*0.5;
  const w = u*10.5;
  const h = height(u);
  const x = I.corner.includes('l') ? pad : W-w-pad;
  const y = I.corner.startsWith('t') ? pad : H-h-pad;
  const ti = turnIdx();

  c.save();
  c.fillStyle='rgba('+PAL.inkRgb+',.86)'; c.strokeStyle='rgba('+PAL.lineRgb+',1)'; c.lineWidth=1;
  roundRect(c,x,y,w,h,u*0.35); c.fill(); c.stroke();
  c.font='600 '+(u*0.55)+'px ui-monospace, Menlo, monospace';
  c.fillStyle=PAL.muted;
  c.fillText('INITIATIVE', x+pad, y+pad+u*0.7);

  I.list.forEach((m,i)=>{
    const ry = y+pad+u*1.5+i*u*1.25;
    const cur = i===ti;
    const down = m.hpMax>0 && m.hp<=0;
    c.globalAlpha = down ? 0.45 : 1;

    if(cur){
      c.fillStyle='rgba('+PAL.measureRgb+',.16)';
      roundRect(c,x+pad*0.5,ry-u*0.15,w-pad,u*1.1,u*0.2); c.fill();
      c.fillStyle=PAL.measure; c.fillRect(x+pad*0.5,ry-u*0.15,u*0.14,u*1.1);
    }

    /* position in the order */
    c.font='600 '+(u*0.5)+'px ui-monospace, Menlo, monospace';
    c.fillStyle = cur ? PAL.measure : PAL.muted2;
    c.textAlign='right';
    c.fillText(String(i+1), x+pad+u*0.85, ry+u*0.64);
    c.textAlign='left';

    /* name */
    c.font=(cur?'700 ':'500 ')+(u*0.62)+'px "Inter", system-ui, sans-serif';
    c.fillStyle = cur ? PAL.text : PAL.textSoft;
    const barW = (I.hpMode==='all' || (I.hpMode==='pj' && m.type==='pj')) && m.hpMax>0 ? u*3.1 : 0;
    const maxName = w - u*1.6 - barW - (m.conditions?m.conditions.length*u*0.85:0);
    let name = m.name;
    if(c.measureText(name).width>maxName){
      while(name.length>1 && c.measureText(name+'…').width>maxName) name=name.slice(0,-1);
      name += '…';
    }
    if(name!==m.name) name=name.slice(0,-1)+'…';
    c.fillText(name, x+pad+u*1.2, ry+u*0.64);

    /* health bar only when enabled and the character is a player character */
    let iconRight = x+w-pad;
    const showBar = m.hpMax>0 && (I.hpMode==='all' || (I.hpMode==='pj' && m.type==='pj'));
    if(showBar){
      const bw=u*2.6, bh=u*0.4, bx=x+w-pad-bw, by=ry+u*0.24;
      const total=m.hpMax+(m.temp||0);
      const f=Math.max(0,m.hp)/total, tf=(m.temp||0)/total;
      c.fillStyle='rgba('+PAL.ringRgb+',.10)'; roundRect(c,bx,by,bw,bh,bh/2); c.fill();
      if(f>0){ c.fillStyle=hpColor(Math.max(0,m.hp)/m.hpMax); roundRect(c,bx,by,bw*f,bh,bh/2); c.fill(); }
      if(tf>0){ c.fillStyle='rgba('+PAL.measureSoftRgb+',.85)';
        roundRect(c,bx+bw*f,by,bw*tf,bh,bh/2); c.fill(); }
      iconRight = bx-u*0.35;
    }

    /* condition icons, right to left */
    if(m.conditions && m.conditions.length){
      const size=u*0.7;
      m.conditions.slice().reverse().forEach((id,j)=>{
        const col = id==='concentration' ? PAL.point : PAL.fog;
        const ic = conditionIcon(id, col, Math.max(24, Math.round(size*2)));
        if(!ic) return;
        const ix=iconRight-size-(j*(size+u*0.16));
        c.drawImage(ic, ix, ry+u*0.2, size, size);
      });
    }
    c.globalAlpha=1;
  });
  c.restore();
}

function drawPointer(c,view,dpr){
  if(!S.cursorWorld) return;
  c.setTransform(dpr,0,0,dpr,0,0);
  const p=w2s(S.cursorWorld,view);
  c.save();
  c.strokeStyle=PAL.point; c.shadowColor=PAL.point; c.shadowBlur=14; c.lineWidth=2;
  c.beginPath(); c.arc(p.x,p.y,11,0,Math.PI*2); c.stroke();
  c.beginPath();
  c.moveTo(p.x-20,p.y); c.lineTo(p.x-15,p.y); c.moveTo(p.x+15,p.y); c.lineTo(p.x+20,p.y);
  c.moveTo(p.x,p.y-20); c.lineTo(p.x,p.y-15); c.moveTo(p.x,p.y+15); c.lineTo(p.x,p.y+20);
  c.stroke();
  c.fillStyle=PAL.point; c.beginPath(); c.arc(p.x,p.y,2.5,0,Math.PI*2); c.fill();
  c.restore();
}
function drawPings(c,view,dpr){
  if(!S.pings.length) return;
  const now=performance.now();
  c.setTransform(dpr,0,0,dpr,0,0);
  for(const g of S.pings){
    const t=(now-g.t)/1100; if(t>1) continue;
    const p=w2s(g,view);
    c.save(); c.globalAlpha=1-t; c.strokeStyle=PAL.point; c.shadowColor=PAL.point; c.shadowBlur=16;
    for(const d of [0,0.28]){ const tt=t-d; if(tt<0) continue;
      c.lineWidth=3*(1-tt); c.beginPath(); c.arc(p.x,p.y,8+tt*60,0,Math.PI*2); c.stroke(); }
    c.restore();
  }
}
function drawBrushCursor(c,view,dpr){
  if(S.tool!=='fog' || !S.cursor || S.fogShape==='lasso') return;
  c.setTransform(dpr,0,0,dpr,0,0);
  c.save();
  c.strokeStyle = S.fogMode==='hide' ? 'rgba('+PAL.fogRgb+',.9)' : 'rgba('+PAL.measureRgb+',.9)';
  c.setLineDash([5,4]); c.lineWidth=1.5;
  if(S.fogShape==='brush'){ c.beginPath(); c.arc(S.cursor.x,S.cursor.y,S.brush*view.k,0,Math.PI*2); c.stroke(); }
  else if(S.fogShape==='cells' && S.cursorWorld){
    const g=cal().gridPx, cx=Math.floor(S.cursorWorld.x/g)*g, cy=Math.floor(S.cursorWorld.y/g)*g;
    const p=w2s({x:cx,y:cy},view); c.strokeRect(p.x,p.y,g*view.k,g*view.k);
  }
  c.setLineDash([]); c.restore();
}

function draw(){
  renderScene(ctx, S.view, innerWidth, innerHeight, dprMain(), {
    grid:S.showGrid, fogOpacity:S.fogOpacity, labels:true, handles:true, anchor:true,
    brushCursor:true, tableFrame:S.showFrame && tableOpen(), pointer:S.tool==='pointer',
    initiative:true, walls:true, tokens:'name', dim:S.wallsOnly, draftLabels:false,
    vision:true, lights:true
  });
  drawTable();
}

  return { renderScene, draw, drawInitiative };
}
