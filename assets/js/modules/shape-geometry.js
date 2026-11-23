export function createShapeGeometry({ $, dist, cal, measure, fmt }) {
function shapePath(s){
  const a=s.a,b=s.b,p=new Path2D();
  const g=s.geo||s.type;
  if(g==='line'){ p.moveTo(a.x,a.y); p.lineTo(b.x,b.y); }
  else if(g==='circle'){ p.arc(a.x,a.y,Math.max(dist(a,b),0.001),0,Math.PI*2); }
  else if(g==='cone'){
    const L=dist(a,b)||0.001, ux=(b.x-a.x)/L, uy=(b.y-a.y)/L, hw=L/2;
    p.moveTo(a.x,a.y);
    p.lineTo(a.x+ux*L-uy*hw, a.y+uy*L+ux*hw);
    p.lineTo(a.x+ux*L+uy*hw, a.y+uy*L-ux*hw);
    p.closePath();
  }
  else if(g==='wall'){
    const L=dist(a,b)||0.001, ux=(b.x-a.x)/L, uy=(b.y-a.y)/L;
    const hw=((s.w||1)*cal().gridPx)/2, px=-uy*hw, py=ux*hw;
    p.moveTo(a.x+px,a.y+py); p.lineTo(b.x+px,b.y+py); p.lineTo(b.x-px,b.y-py); p.lineTo(a.x-px,a.y-py); p.closePath();
  }
  else if(g==='area'){
    const hx=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    p.rect(a.x-hx, a.y-hx, hx*2, hx*2);
  }
  else if(g==='square'){
    /* Fog still spans corner to corner: it marks a region, not an effect area. rectFree
       represents that region. */
    if(s.rectFree){ p.rect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y)); return p; }
    /* Square measurement started at a corner while effect areas started at the center,
       even though they are the same gesture. Both now start at the center. */
    const semi=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    p.rect(a.x-semi, a.y-semi, semi*2, semi*2);
  }
  else if(g==='poly'){
    if(s.pts && s.pts.length){
      p.moveTo(s.pts[0].x,s.pts[0].y);
      for(let i=1;i<s.pts.length;i++) p.lineTo(s.pts[i].x,s.pts[i].y);
      p.closePath();
    }
  }
  else if(g==='free'){ if(s.pts && s.pts.length){ p.moveTo(s.pts[0].x,s.pts[0].y);
      for(let i=1;i<s.pts.length;i++) p.lineTo(s.pts[i].x,s.pts[i].y); } }
  else if(g==='calibrate'){ p.moveTo(a.x,a.y); p.lineTo(b.x,b.y); }
  return p;
}
const FILLED = ['circle','cone','square','wall','poly','area'];

/* Approximate outline area in grid squares. */
function polySquares(pts){
  let a=0;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++) a += (pts[j].x+pts[i].x)*(pts[j].y-pts[i].y);
  const g=cal().gridPx||1;
  return Math.abs(a/2)/(g*g);
}
function bbox(pts){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const p of pts){ x0=Math.min(x0,p.x); y0=Math.min(y0,p.y); x1=Math.max(x1,p.x); y1=Math.max(y1,p.y); }
  return {x0,y0,x1,y1};
}

function shapeLabel(s){
  const g=s.geo||s.type;
  if(g==='free' || s.rectFree) return null;
  if(g==='calibrate'){
    const n=Math.max(1,parseInt($('calSquares').value)||1);
    return Math.round(dist(s.a,s.b)/n)+' px / square';
  }
  if(s.kind==='effect'){
    if(s.anim) return null;       // the animation already identifies the effect
    let t=s.name;
    if(g==='poly' && s.pts) t += ' · '+Math.round(polySquares(s.pts))+' squares';
    return t;
  }
  const d = s.fixed!=null ? s.fixed : measure(s.a,s.b);
  if(g==='circle') return 'radius '+fmt(d);
  if(g==='cone') return 'cone '+fmt(d);
  if(g==='wall') return fmt(d)+' × '+(s.w||1)+' squares';
  if(g==='square'){
    if(s.fixed!=null) return 'side '+fmt(s.fixed);
    /* Drag the half-side from the center; the full side is twice as long. */
    const semi=Math.max(Math.abs(s.b.x-s.a.x),Math.abs(s.b.y-s.a.y));
    return 'side '+fmt(measure({x:0,y:0},{x:semi*2,y:0}));
  }
  return fmt(d);
}

  return { shapePath, FILLED, polySquares, bbox, shapeLabel };
}
