import { S } from './state.js';

export const w2s = (point, view = S.view) => ({
  x:point.x*view.k+view.x,
  y:point.y*view.k+view.y
});

export const s2w = (point, view = S.view) => ({
  x:(point.x-view.x)/view.k,
  y:(point.y-view.y)/view.k
});

export const dist = (a, b) => Math.hypot(b.x-a.x, b.y-a.y);
