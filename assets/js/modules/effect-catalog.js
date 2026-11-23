export class EffectCatalog {
  constructor({ storage, getActiveScene, getDraft, getSelectedEffect, touchState, draw, setTool,
                syncCtxBar, toast, attachTip, onSelectEffect }) {
    this.storage = storage;
    this.getActiveScene = getActiveScene;
    this.getDraft = getDraft;
    this.getSelectedEffect = getSelectedEffect;
    this.touchState = touchState;
    this.draw = draw;
    this.setTool = setTool;
    this.syncCtxBar = syncCtxBar;
    this.toast = toast;
    this.attachTip = attachTip;
    this.onSelectEffect = onSelectEffect;
    this.catalog = {
      loaded: false, effects: [], base: '', source: '', filter: '', level: '', sel: null,
      animationsActive: true, favorites: [], recent: []
    };
    this.animations = {};
    this.maxAnimations = 8;
  }

  async load() {
    if (this.catalog.loaded) return;
    try {
      const response = await fetch('jb2a-catalog.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const effects = data.effects || data.efectos;
      if (!Array.isArray(effects)) throw new Error('Effect catalog has no effects array');
      this.catalog.effects = effects;
      this.catalog.base = data.base || '';
      this.catalog.source = data.source || data.fuente || '';
      this.catalog.loaded = true;
      document.getElementById('catSource').textContent = this.catalog.source;
      this.render();
    } catch (error) {
      console.error('Could not read the effect catalog.', error);
      document.getElementById('catHint').textContent = 'Could not read the effect catalog.';
    }
  }

  anim(id) {
    let effect = this.animations[id];
    if (!effect) {
      effect = this.animations[id] = {
        video: null, canvas: null, ctx: null, ready: false, downloading: true
      };
      this.prepareAnimation(id, effect);
    }
    return effect;
  }

  async prepareAnimation(id, effect) {
    try {
      let record = await this.storage.get('blobs', 'jb2a:' + id);
      if (!record) {
        const response = await fetch(this.catalog.base + id);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const raw = await response.blob();
        const blob = new Blob([raw], { type: 'video/webm' });
        if (this.storage.ok) await this.storage.put('blobs', { key: 'jb2a:' + id, blob });
        record = { blob };
      }
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      const url = URL.createObjectURL(record.blob);
      effect.url = url;
      video.src = url;
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = reject;
      });
      if (effect.descartado) {
        URL.revokeObjectURL(url);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      effect.video = video;
      effect.canvas = canvas;
      effect.ctx = canvas.getContext('2d');
      effect.ready = true;
      effect.downloading = false;
      video.play().catch(() => {});
      this.draw();
    } catch (error) {
      if (effect.url) URL.revokeObjectURL(effect.url);
      if (effect.descartado) return;
      console.error('Could not prepare effect', id, error);
      effect.downloading = false;
      effect.error = true;
      this.toast('Could not download that effect. Are you online?');
    }
  }

  release(id) {
    const effect = this.animations[id];
    if (!effect) return;
    effect.descartado = true;
    if (effect.video) {
      effect.video.pause();
      effect.video.removeAttribute('src');
      effect.video.load();
    }
    if (effect.url) URL.revokeObjectURL(effect.url);
    delete this.animations[id];
  }

  clearUnused() {
    const inUse = new Set();
    const scene = this.getActiveScene();
    if (scene && scene.shapes)
      for (const shape of scene.shapes)
        if (shape.anim) inUse.add(shape.anim);
    const draft = this.getDraft();
    if (draft && draft.anim) inUse.add(draft.anim);
    const selected = this.getSelectedEffect();
    if (selected) inUse.add(selected.p);
    for (const id of Object.keys(this.animations))
      if (!inUse.has(id)) this.release(id);
  }

  videoFrame(id) {
    const effect = this.animations[id] || this.anim(id);
    return effect.ready ? effect.canvas : null;
  }

  refresh() {
    let active = 0;
    const scene = this.getActiveScene();
    if (!scene || !scene.shapes) return 0;
    const seen = new Set();
    for (const shape of scene.shapes) {
      if (!shape.anim || shape.hidden || seen.has(shape.anim)) continue;
      if (seen.size >= this.maxAnimations) break;
      seen.add(shape.anim);
      const effect = this.animations[shape.anim];
      if (effect && effect.ready && effect.video.readyState >= 2) {
        effect.ctx.clearRect(0, 0, effect.canvas.width, effect.canvas.height);
        effect.ctx.drawImage(effect.video, 0, 0);
        active++;
      }
    }
    const draft = this.getDraft();
    if (draft && draft.anim && !seen.has(draft.anim)) {
      const effect = this.animations[draft.anim];
      if (effect && effect.ready) {
        effect.ctx.clearRect(0, 0, effect.canvas.width, effect.canvas.height);
        effect.ctx.drawImage(effect.video, 0, 0);
        active++;
      }
    }
    return active;
  }

  filtered() {
    const query = this.catalog.filter.trim().toLowerCase();
    if (this.catalog.level === '__fav')
      return this.catalog.effects.filter(effect => this.catalog.favorites.includes(effect.p));
    if (this.catalog.level === '__rec')
      return this.catalog.recent
        .map(path => this.catalog.effects.find(effect => effect.p === path))
        .filter(Boolean);
    return this.catalog.effects.filter(effect => {
      if (this.catalog.level && effect.l !== this.catalog.level) return false;
      if (!query) return true;
      return (effect.s + ' ' + effect.es + ' ' + effect.n).toLowerCase().includes(query);
    });
  }

  markRecent(path) {
    this.catalog.recent = [path, ...this.catalog.recent.filter(item => item !== path)].slice(0, 16);
    this.touchState();
  }

  toggleFavorite(effect) {
    const index = this.catalog.favorites.indexOf(effect.p);
    if (index < 0) this.catalog.favorites.push(effect.p);
    else this.catalog.favorites.splice(index, 1);
    this.touchState();
    this.render();
  }

  render() {
    const grid = document.getElementById('catgrid');
    grid.innerHTML = '';
    const list = this.filtered();
    document.getElementById('catCount').textContent =
      list.length + ' of ' + this.catalog.effects.length + ' effects';
    list.slice(0, 240).forEach(effect => {
      const button = document.createElement('button');
      button.className = 'cat' + (this.catalog.sel === effect ? ' on' : '');
      if (effect.t) button.style.backgroundImage = 'url("' + this.catalog.base + effect.t + '")';
      const favorite = this.catalog.favorites.includes(effect.p);
      button.innerHTML =
        '<span class="tp">' + (effect.g === 'wall' ? 'BEAM' : effect.g === 'cone' ? 'CONE' : 'AREA') + '</span>' +
        (favorite ? '<span class="fav">★</span>' : '') +
        '<span class="nm">' + effect.s + '</span>';
      button.oncontextmenu = event => {
        event.preventDefault();
        this.toggleFavorite(effect);
      };
      this.attachTip(button, effect.s + ' · ' + effect.n + ' · ' + effect.sq + ' squares');
      button.onclick = () => {
        this.catalog.sel = effect;
        if (this.onSelectEffect) this.onSelectEffect(effect);
        this.anim(effect.p);
        this.markRecent(effect.p);
        this.setTool('effect');
        this.render();
        this.syncCtxBar();
        this.toast('"' + effect.s + '" ready: click the map to place it.');
      };
      grid.appendChild(button);
    });
    if (list.length > 240) {
      const paragraph = document.createElement('p');
      paragraph.className = 'hint';
      paragraph.textContent = 'Showing the first 240. Refine your search to see more.';
      grid.appendChild(paragraph);
    }
    document.getElementById('catHint').style.display =
      this.catalog.effects.length ? 'none' : 'block';
  }
}
