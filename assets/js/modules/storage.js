export class StorageRepository {
  constructor(dbName = 'tabletop-control-overlay', dbVersion = 3) {
    this.dbName = dbName;
    this.dbVersion = dbVersion;
    this.db = null;
    this.ok = false;
  }

  open() {
    return new Promise((resolve, reject) => {
      if (!self.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('scenes'))
          database.createObjectStore('scenes', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('blobs'))
          database.createObjectStore('blobs', { keyPath: 'key' });
        if (!database.objectStoreNames.contains('state'))
          database.createObjectStore('state', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('fx'))
          database.createObjectStore('fx', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('camps'))
          database.createObjectStore('camps', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  transaction(storeName, mode = 'readonly') {
    return this.db.transaction(storeName, mode).objectStore(storeName);
  }

  request(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  put(storeName, value) {
    return this.ok
      ? this.request(this.transaction(storeName, 'readwrite').put(value))
      : Promise.resolve();
  }

  get(storeName, key) {
    return this.ok
      ? this.request(this.transaction(storeName).get(key))
      : Promise.resolve(null);
  }

  del(storeName, key) {
    return this.ok
      ? this.request(this.transaction(storeName, 'readwrite').delete(key))
      : Promise.resolve();
  }

  all(storeName) {
    return this.ok
      ? this.request(this.transaction(storeName).getAll())
      : Promise.resolve([]);
  }

  clear(storeName) {
    return this.ok
      ? this.request(this.transaction(storeName, 'readwrite').clear())
      : Promise.resolve();
  }

  migrateConditions(conditions) {
    const legacy = new Map([
      ['concentracion', 'concentration'], ['cegado', 'blinded'], ['hechizado', 'charmed'],
      ['ensordecido', 'deafened'], ['exhausto', 'exhausted'], ['asustado', 'frightened'],
      ['agarrado', 'grappled'], ['incapacitado', 'incapacitated'], ['petrificado', 'petrified'],
      ['envenenado', 'poisoned'], ['paralizado', 'paralyzed'], ['derribado', 'prone'],
      ['aturdido', 'stunned'], ['inconsciente', 'unconscious']
    ]);
    return Array.isArray(conditions)
      ? conditions.map(id => legacy.get(id) || id)
      : conditions;
  }

  migrateGeometry(value) {
    return new Map([
      ['segmento', 'segment'], ['polisegmento', 'multisegment'], ['poligono', 'polygon']
    ]).get(value) || value;
  }

  migrateEffectId(value) {
    return new Map([
      ['dificil', 'difficult'], ['fuego', 'fire'], ['hielo', 'ice'], ['veneno', 'poison'],
      ['oscuro', 'dark'], ['agua', 'water'], ['sagrado', 'hallowed']
    ]).get(value) || value;
  }

  migrateCombatant(combatant) {
    if (!combatant || typeof combatant !== 'object') return combatant;
    const result = { ...combatant };
    if (!Object.prototype.hasOwnProperty.call(result, 'conditions') && Array.isArray(result.cond))
      result.conditions = result.cond;
    delete result.cond;
    if (Array.isArray(result.conditions))
      result.conditions = this.migrateConditions(result.conditions);
    if (result.type === 'enemigo') result.type = 'enemy';
    if (result.type === 'aliado') result.type = 'ally';
    return result;
  }

  migrateCampaignRecord(record) {
    if (!record || !Array.isArray(record.players)) return record;
    return { ...record, players: record.players.map(player => this.migrateCombatant(player)) };
  }

  migrateSceneRecord(record) {
    if (!record || typeof record !== 'object') return record;
    const result = { ...record };
    const legacyKeys = [
      ['camp', 'campaignId'], ['orden', 'order'], ['fogModo', 'fogMode'], ['ambiente', 'environment']
    ];
    for (const [oldKey, newKey] of legacyKeys) {
      if (!Object.prototype.hasOwnProperty.call(result, newKey) &&
          Object.prototype.hasOwnProperty.call(result, oldKey))
        result[newKey] = result[oldKey];
      delete result[oldKey];
    }
    if (result.cal && typeof result.cal === 'object') {
      result.cal = { ...result.cal };
      if (!Object.prototype.hasOwnProperty.call(result.cal, 'calibrated') &&
          Object.prototype.hasOwnProperty.call(result.cal, 'hecha'))
        result.cal.calibrated = result.cal.hecha;
      delete result.cal.hecha;
    }
    if (Array.isArray(result.shapes)) {
      result.shapes = result.shapes.map(shape => {
        if (!shape || typeof shape !== 'object') return shape;
        const migrated = { ...shape };
        if (migrated.geo) migrated.geo = this.migrateGeometry(migrated.geo);
        if (migrated.type) migrated.type = this.migrateGeometry(migrated.type);
        if (migrated.mode) migrated.mode = this.migrateGeometry(migrated.mode);
        if (migrated.preset) migrated.preset = this.migrateEffectId(migrated.preset);
        return migrated;
      });
    }
    if (result.fogMode === 'dinamica') result.fogMode = 'dynamic';
    if (result.fogMode === 'explora') result.fogMode = 'exploration';
    if (Array.isArray(result.walls)) {
      result.walls = result.walls.map(wall => {
        if (!wall || typeof wall !== 'object' ||
            !Object.prototype.hasOwnProperty.call(wall, 'puerta')) return wall;
        const migrated = { ...wall };
        if (!Object.prototype.hasOwnProperty.call(migrated, 'door'))
          migrated.door = migrated.puerta;
        delete migrated.puerta;
        return migrated;
      });
    }
    if (Array.isArray(result.lights)) {
      result.lights = result.lights.map(light => {
        if (!light || typeof light !== 'object') return light;
        const migrated = { ...light };
        if (!Object.prototype.hasOwnProperty.call(migrated, 'range') &&
            Object.prototype.hasOwnProperty.call(migrated, 'rango'))
          migrated.range = migrated.rango;
        if (!Object.prototype.hasOwnProperty.call(migrated, 'intensity') &&
            Object.prototype.hasOwnProperty.call(migrated, 'intensidad'))
          migrated.intensity = migrated.intensidad;
        delete migrated.rango;
        delete migrated.intensidad;
        return migrated;
      });
    }
    return result;
  }

  migrateStateRecord(record) {
    if (!record || typeof record !== 'object') return record;
    const result = { ...record };
    const legacyKeys = [
      ['camp', 'campaignId'], ['activa', 'active'], ['tokensMesa', 'tableTokens'],
      ['plegadas', 'collapsedSections'], ['pasosNunca', 'stepsNever'], ['tema', 'theme'], ['mesa', 'table']
    ];
    for (const [oldKey, newKey] of legacyKeys) {
      if (!Object.prototype.hasOwnProperty.call(result, newKey) &&
          Object.prototype.hasOwnProperty.call(result, oldKey))
        result[newKey] = result[oldKey];
      delete result[oldKey];
    }
    if (result.fx) {
      result.fx = { ...result.fx };
      for (const [oldKey, newKey] of [
        ['favoritos', 'favorites'], ['recientes', 'recent'], ['activas', 'animationsActive']
      ]) {
        if (!Object.prototype.hasOwnProperty.call(result.fx, newKey) &&
            Object.prototype.hasOwnProperty.call(result.fx, oldKey))
          result.fx[newKey] = result.fx[oldKey];
        delete result.fx[oldKey];
      }
    }
    if (result.snap) {
      result.snap = { ...result.snap };
      if (!Object.prototype.hasOwnProperty.call(result.snap, 'occlusion') &&
          Object.prototype.hasOwnProperty.call(result.snap, 'oclusion'))
        result.snap.occlusion = result.snap.oclusion;
      delete result.snap.oclusion;
    }
    if (result.tableTokens === 'ocultos') result.tableTokens = 'hidden';
    if (result.tableTokens === 'punto') result.tableTokens = 'point';
    if (result.tableTokens === 'nombre') result.tableTokens = 'name';
    if (result.table) {
      result.table = { ...result.table };
      if (!Object.prototype.hasOwnProperty.call(result.table, 'diagonalCalibrated') &&
          Object.prototype.hasOwnProperty.call(result.table, 'diagHecha'))
        result.table.diagonalCalibrated = result.table.diagHecha;
      if (!Object.prototype.hasOwnProperty.call(result.table, 'tableIsOpen') &&
          Object.prototype.hasOwnProperty.call(result.table, 'mesaAbierta'))
        result.table.tableIsOpen = result.table.mesaAbierta;
      delete result.table.diagHecha;
      delete result.table.mesaAbierta;
    }
    if (result.ini && Array.isArray(result.ini.list))
      result.ini = { ...result.ini, list: result.ini.list.map(player => this.migrateCombatant(player)) };
    return result;
  }

  async loadAppState() {
    const record = await this.get('state', 'app');
    if (!record) return null;
    const migrated = this.migrateStateRecord(record);
    if (JSON.stringify(migrated) !== JSON.stringify(record))
      await this.put('state', migrated);
    return migrated;
  }

  async loadCampaignState(id) {
    const key = 'campaign:' + id;
    let record = await this.get('state', key);
    if (!record) record = await this.get('state', 'camp:' + id);
    if (!record) return null;
    const migrated = this.migrateStateRecord(record);
    const legacyId = record.id !== key;
    migrated.id = key;
    if (legacyId || JSON.stringify(migrated) !== JSON.stringify(record)) {
      await this.put('state', migrated);
      if (legacyId) await this.del('state', record.id);
    }
    return migrated;
  }
}
