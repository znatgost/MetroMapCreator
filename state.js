// ─── Constants ─────────────────────────────────────────────────────────────
const COLORS = [
  // Reds & pinks
  '#E63946','#FF4D6D','#C1121F','#FF6B6B','#E91E63','#FF5E87',
  // Oranges & yellows
  '#F4A261','#FF6B35','#FB8500','#F7B731','#FFD60A','#FFAA00',
  // Greens
  '#2A9D8F','#1ABC9C','#40C057','#69DB7C','#89c742','#52B788',
  // Blues
  '#3D72F6','#4CC9F0','#4361EE','#0077B6','#48CAE4','#0096C7',
  // Purples
  '#9B59B6','#7B2FBE','#C77DFF','#6A0572','#B5179E','#7209B7',
  // Neutrals
  '#8D99AE','#457B9D','#6C757D','#495057',
];

const CFG = {
  GRID:     40,   // Grid cell size px
  CORNER_R: 14,   // Corner bezier radius
  LINE_W:   8,    // Default line width
  STATION_R:6,    // Station circle radius
  SNAP_D:   22,   // Snap threshold px
};

// ─── State ──────────────────────────────────────────────────────────────────
const state = {
  stations: new Map(),  // id → { id, gx, gy, name, labelPos }
  lines:    new Map(),  // id → { id, name, color, width, routing, corner, loop, sids[] }

  tool:       'select',
  selected:   null,       // { type:'station'|'line', id }
  activeLine: null,

  drawing: { active: false, lineId: null, lastSid: null },
  cursor:  { wx: 0, wy: 0 },
  spacePan: false,
  pan:  { x: 80, y: 60 },
  zoom: 1,

  _uid: 1,
  uid() { return `u${this._uid++}`; },

  // ── History (undo / redo) ──────────────────────────────────────────────
  _hist:    [],
  _histIdx: -1,

  /** Save current state snapshot before a mutating action. */
  snapshot() {
    const snap = {
      stations: [...this.stations.entries()].map(([k,v]) => [k, {...v}]),
      lines:    [...this.lines.entries()].map(([k,v]) => [k, {...v, sids:[...v.sids]}]),
      uid:      this._uid,
    };
    // Discard any redo tail
    this._hist = this._hist.slice(0, this._histIdx + 1);
    this._hist.push(snap);
    if (this._hist.length > 60) this._hist.shift();
    else this._histIdx++;
  },

  undo() {
    if (this._histIdx <= 0) return false;
    this._histIdx--;
    this._restore(this._hist[this._histIdx]);
    return true;
  },

  redo() {
    if (this._histIdx >= this._hist.length - 1) return false;
    this._histIdx++;
    this._restore(this._hist[this._histIdx]);
    return true;
  },

  _restore(snap) {
    this.stations = new Map(snap.stations.map(([k,v]) => [k, {...v}]));
    this.lines    = new Map(snap.lines.map(([k,v]) => [k, {...v, sids:[...v.sids]}]));
    this._uid     = snap.uid;
    this.selected   = null;
    this.activeLine = null;
    this.drawing    = { active: false, lineId: null, lastSid: null };
  },

  canUndo() { return this._histIdx > 0; },
  canRedo() { return this._histIdx < this._hist.length - 1; },

  // ── Coordinate helpers ─────────────────────────────────────────────────
  toWorld(sx, sy) {
    return { x: (sx - this.pan.x) / this.zoom, y: (sy - this.pan.y) / this.zoom };
  },
  toSVG(gx, gy) { return { x: gx * CFG.GRID, y: gy * CFG.GRID }; },
  snapGrid(wx, wy) {
    return { gx: Math.round(wx / CFG.GRID), gy: Math.round(wy / CFG.GRID) };
  },

  // ── Finders ────────────────────────────────────────────────────────────
  nearStation(wx, wy, threshold = CFG.SNAP_D) {
    let best = null, bestD = Infinity;
    for (const s of this.stations.values()) {
      const { x, y } = this.toSVG(s.gx, s.gy);
      const d = Math.hypot(wx - x, wy - y);
      if (d < threshold && d < bestD) { bestD = d; best = s; }
    }
    return best;
  },

  atGrid(gx, gy) {
    for (const s of this.stations.values()) {
      if (s.gx === gx && s.gy === gy) return s;
    }
    return null;
  },

  stationLines(sid) {
    return [...this.lines.values()].filter(l => l.sids.includes(sid));
  },

  // ── Mutations (callers must snapshot() first!) ─────────────────────────
  addStation(gx, gy) {
    const id = this.uid();
    this.stations.set(id, { id, gx, gy, name: '', labelPos: 'right' });
    return id;
  },

  addLine() {
    const id  = this.uid();
    const idx = this.lines.size % COLORS.length;
    this.lines.set(id, {
      id, name: `Line ${this.lines.size + 1}`, color: COLORS[idx],
      width: CFG.LINE_W, routing: 'diagonal', corner: 'rounded',
      loop: false, sids: [],
    });
    return id;
  },

  removeStation(id) {
    this.stations.delete(id);
    for (const l of this.lines.values()) l.sids = l.sids.filter(s => s !== id);
    if (this.drawing.lastSid === id) this.drawing = { active:false, lineId:null, lastSid:null };
  },

  removeStationFromLine(sid, lid) {
    const line = this.lines.get(lid);
    if (!line) return;
    line.sids = line.sids.filter(s => s !== sid);
    if (line.loop && line.sids.length < 3) line.loop = false;
  },

  removeLine(id) {
    this.lines.delete(id);
    if (this.activeLine === id) this.activeLine = null;
    if (this.drawing.lineId === id) this.drawing = { active:false, lineId:null, lastSid:null };
  },

  clear() {
    this.stations.clear(); this.lines.clear();
    this.selected = null; this.activeLine = null;
    this.drawing = { active:false, lineId:null, lastSid:null };
  },
};
