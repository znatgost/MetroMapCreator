// ─── Editor: pointer, keyboard, context-menu interactions ──────────────────
const Editor = {
  ptr: {
    down: false, btn: 0,
    sx: 0, sy: 0, moved: false,
    target: null, panStart: null,
    dblTimer: 0,
  },
  MOVE_THR: 6,
  _ctxStation: null,
  _propsDirty: false,

  // Pinch-zoom tracking
  _pointers: new Map(),   // pointerId → {sx, sy}
  _pinchDist: null,

  init() {
    const svg = document.getElementById('map-svg');
    svg.addEventListener('pointerdown',   this._onDown.bind(this),  { passive: false });
    svg.addEventListener('pointermove',   this._onMove.bind(this),  { passive: false });
    svg.addEventListener('pointerup',     this._onUp.bind(this));
    svg.addEventListener('pointercancel', this._onCancel.bind(this));
    svg.addEventListener('wheel',         this._onWheel.bind(this), { passive: false });
    svg.addEventListener('dblclick',      this._onDblClick.bind(this));
    svg.addEventListener('contextmenu',   this._onContextMenu.bind(this), { passive: false });

    // Prevent default browser pan/zoom on canvas so we handle it ourselves
    svg.style.touchAction = 'none';

    document.addEventListener('keydown',  this._onKey.bind(this));
    document.addEventListener('keyup',    this._onKeyUp.bind(this));
    document.addEventListener('click',    this._closeCtx.bind(this));
    document.addEventListener('contextmenu', (e) => { if (!e.target.closest('#ctx-menu')) this._closeCtx(); });
  },

  // ── Helpers ──────────────────────────────────────────────────────────────
  _rect()         { return document.getElementById('map-svg').getBoundingClientRect(); },
  _screen(e)      { const r = this._rect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; },
  _world(sx, sy)  { return state.toWorld(sx, sy); },
  _markPropsDirty() {
    if (!this._propsDirty) { state.snapshot(); this._propsDirty = true; UI.updateUndoRedo(); }
  },

  // ── Pointer Down ──────────────────────────────────────────────────────────
  _onDown(e) {
    e.preventDefault();
    this._closeCtx();
    document.getElementById('map-svg').setPointerCapture(e.pointerId);

    const { sx, sy } = this._screen(e);
    this._pointers.set(e.pointerId, { sx, sy });

    // Pinch: second finger down → switch to pinch mode
    if (this._pointers.size === 2) {
      const pts = [...this._pointers.values()];
      this._pinchDist = Math.hypot(pts[1].sx - pts[0].sx, pts[1].sy - pts[0].sy);
      this.ptr.down = false; // cancel single-pointer drag
      return;
    }

    const { x: wx, y: wy } = this._world(sx, sy);

    this.ptr.down  = true;
    this.ptr.btn   = e.button;
    this.ptr.sx    = sx; this.ptr.sy = sy;
    this.ptr.moved = false;

    if (e.button === 1 || state.spacePan) {
      this.ptr.target   = { type: 'pan' };
      this.ptr.panStart = { px: state.pan.x, py: state.pan.y, sx, sy };
      document.getElementById('map-svg').style.cursor = 'grabbing';
      return;
    }

    const nearS   = state.nearStation(wx, wy);
    const lineEl  = e.target.closest?.('[data-line-id]');

    if (nearS)       this.ptr.target = { type: 'station', id: nearS.id };
    else if (lineEl) this.ptr.target = { type: 'line', id: lineEl.dataset.lineId };
    else             this.ptr.target = { type: 'canvas' };
  },

  // ── Pointer Move ──────────────────────────────────────────────────────────
  _onMove(e) {
    const { sx, sy } = this._screen(e);

    // Update pointer tracking
    if (this._pointers.has(e.pointerId)) {
      this._pointers.set(e.pointerId, { sx, sy });
    }

    // ── Pinch-zoom (2 fingers) ──
    if (this._pointers.size === 2 && this._pinchDist !== null) {
      const pts = [...this._pointers.values()];
      const newDist = Math.hypot(pts[1].sx - pts[0].sx, pts[1].sy - pts[0].sy);
      const factor  = newDist / this._pinchDist;
      const midX    = (pts[0].sx + pts[1].sx) / 2;
      const midY    = (pts[0].sy + pts[1].sy) / 2;
      const newZoom = Math.min(6, Math.max(0.12, state.zoom * factor));
      state.pan.x   = midX - (midX - state.pan.x) * (newZoom / state.zoom);
      state.pan.y   = midY - (midY - state.pan.y) * (newZoom / state.zoom);
      state.zoom    = newZoom;
      this._pinchDist = newDist;
      Renderer.updateTransform();
      return;
    }

    // ── Single-finger pan (on empty canvas, select tool or space) ──
    if (this._pointers.size === 1 && this.ptr.down &&
        this.ptr.target?.type === 'canvas' && state.tool === 'select') {
      if (!this.ptr.panStart) {
        this.ptr.panStart = { px: state.pan.x, py: state.pan.y, sx: this.ptr.sx, sy: this.ptr.sy };
      }
      const ps = this.ptr.panStart;
      const dx = sx - ps.sx, dy = sy - ps.sy;
      if (Math.hypot(dx, dy) > this.MOVE_THR) {
        this.ptr.moved = true;
        state.pan.x = ps.px + dx;
        state.pan.y = ps.py + dy;
        Renderer.updateTransform();
        return;
      }
    }

    const { x: wx, y: wy } = this._world(sx, sy);
    state.cursor = { wx, wy };

    if (!this.ptr.down) {
      if (state.tool === 'station' || state.tool === 'line' || state.drawing.active)
        Renderer.renderUI();
      return;
    }

    if (!this.ptr.moved) {
      if (Math.hypot(sx - this.ptr.sx, sy - this.ptr.sy) > this.MOVE_THR) this.ptr.moved = true;
    }

    if (this.ptr.target?.type === 'pan') {
      const ps = this.ptr.panStart;
      state.pan.x = ps.px + (sx - ps.sx);
      state.pan.y = ps.py + (sy - ps.sy);
      Renderer.updateTransform();
      return;
    }

    if (this.ptr.moved && this.ptr.target?.type === 'station' && state.tool === 'select') {
      const s = state.stations.get(this.ptr.target.id);
      if (s) {
        const { gx, gy } = state.snapGrid(wx, wy);
        if (s.gx !== gx || s.gy !== gy) {
          if (!this._dragSnapshotted) { state.snapshot(); this._dragSnapshotted = true; UI.updateUndoRedo(); }
          s.gx = gx; s.gy = gy;
          Renderer.render();
        }
      }
      return;
    }

    Renderer.renderUI();
  },

  _dragSnapshotted: false,

  // ── Pointer Up ────────────────────────────────────────────────────────────
  _onUp(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinchDist = null;

    if (!this.ptr.down) return;
    this.ptr.down = false;
    this._dragSnapshotted = false;
    this.ptr.panStart = null;

    if (this.ptr.target?.type === 'pan') {
      document.getElementById('map-svg').style.cursor = state.spacePan ? 'grab' : '';
      return;
    }

    if (!this.ptr.moved) {
      this._handleClick();
    }
  },

  _onCancel(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinchDist = null;
    this.ptr.down = false;
    this._dragSnapshotted = false;
    this.ptr.panStart = null;
  },

  // ── Double-click: finish line drawing ─────────────────────────────────────
  _onDblClick(e) {
    if (state.drawing.active) {
      state.drawing = { active: false, lineId: null, lastSid: null };
      Renderer.renderUI();
      UI.updateDrawingChip();
    }
  },

  // ── Click dispatch ────────────────────────────────────────────────────────
  _handleClick() {
    const t = this.ptr.target;
    const { x: wx, y: wy } = this._world(this.ptr.sx, this.ptr.sy);
    const { gx, gy }       = state.snapGrid(wx, wy);

    if      (t.type === 'station') this._clickStation(t.id);
    else if (t.type === 'line')    this._clickLine(t.id);
    else                           this._clickCanvas(gx, gy);
  },

  _clickStation(sid) {
    switch (state.tool) {
      case 'select':
        this._propsDirty = false;
        state.selected = { type: 'station', id: sid };
        UI.renderProps();
        Renderer.render();
        break;

      case 'line':
        this._addToLine(sid);
        break;

      case 'delete':
        state.snapshot();
        UI.updateUndoRedo();
        if (state.selected?.id === sid) state.selected = null;
        state.removeStation(sid);
        Renderer.render();
        UI.renderLinesList();
        UI.renderProps();
        break;
    }
  },

  _clickLine(lid) {
    switch (state.tool) {
      case 'select':
      case 'line':
        this._propsDirty = false;
        state.selected = { type: 'line', id: lid };
        UI.renderProps();
        Renderer.render();
        break;

      case 'delete':
        state.snapshot();
        UI.updateUndoRedo();
        if (state.selected?.id === lid) state.selected = null;
        state.removeLine(lid);
        Renderer.render();
        UI.renderLinesList();
        UI.renderProps();
        break;
    }
  },

  _clickCanvas(gx, gy) {
    switch (state.tool) {
      case 'select':
        state.selected = null;
        UI.renderProps();
        Renderer.render();
        break;

      case 'station': {
        if (state.atGrid(gx, gy)) return;
        state.snapshot();
        UI.updateUndoRedo();
        const id = state.addStation(gx, gy);
        this._propsDirty = false;
        state.selected = { type: 'station', id };
        UI.renderProps();
        Renderer.render();
        setTimeout(() => document.getElementById('prop-name')?.focus(), 30);
        break;
      }

      case 'line': {
        if (!state.activeLine) { UI.toast('Select or create a line first'); return; }
        state.snapshot();
        UI.updateUndoRedo();
        const existing = state.atGrid(gx, gy);
        const id = existing ? existing.id : state.addStation(gx, gy);
        this._addToLine(id, /* alreadySnapshotted */ true);
        break;
      }
    }
  },

  _addToLine(sid, alreadySnapshotted = false) {
    if (!state.activeLine) { UI.toast('Select or create a line first'); return; }
    const line = state.lines.get(state.activeLine);
    if (!line) return;

    const sids = line.sids;

    // Close loop on click of first station
    if (sids.length >= 3 && sids[0] === sid && sids[sids.length - 1] !== sid) {
      if (!alreadySnapshotted) { state.snapshot(); UI.updateUndoRedo(); }
      line.loop = true;
      state.drawing = { active: false, lineId: null, lastSid: null };
      UI.toast('Loop closed ✓');
      Renderer.render();
      UI.renderProps();
      UI.updateDrawingChip();
      return;
    }

    if (sids[sids.length - 1] === sid) return;

    if (!alreadySnapshotted) { state.snapshot(); UI.updateUndoRedo(); }
    sids.push(sid);
    state.drawing = { active: true, lineId: state.activeLine, lastSid: sid };

    Renderer.render();
    UI.renderLinesList();
    UI.updateDrawingChip();
    UI.updateStatus();
  },

  // ── Right-click context menu on stations ──────────────────────────────────
  _onContextMenu(e) {
    e.preventDefault();
    const { sx, sy } = this._screen(e);
    const { x: wx, y: wy } = this._world(sx, sy);
    const near = state.nearStation(wx, wy, CFG.SNAP_D * 1.5);
    if (!near) return;

    this._ctxStation = near.id;
    const lines = state.stationLines(near.id);

    const lineActions = document.getElementById('ctx-line-actions');
    lineActions.innerHTML = '';

    if (lines.length > 0) {
      const label = document.createElement('div');
      label.style.cssText = 'padding:4px 12px 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8';
      label.textContent = 'Remove from line';
      lineActions.appendChild(label);

      lines.forEach(line => {
        const row = document.createElement('div');
        row.className = 'ctx-line-item ctx-danger';
        row.innerHTML = `<span class="ctx-line-dot" style="background:${line.color}"></span>${line.name}`;
        row.dataset.lid = line.id;
        row.addEventListener('click', () => {
          state.snapshot(); UI.updateUndoRedo();
          state.removeStationFromLine(near.id, line.id);
          Renderer.render(); UI.renderLinesList(); UI.renderProps();
          this._closeCtx();
        });
        lineActions.appendChild(row);
      });
    }

    const menu = document.getElementById('ctx-menu');
    menu.removeAttribute('hidden');
    // Position near cursor but within viewport
    const menuW = 200, menuH = 80 + lines.length * 32;
    const vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = Math.min(e.clientX, vw - menuW - 8) + 'px';
    menu.style.top  = Math.min(e.clientY, vh - menuH - 8) + 'px';

    // Rename
    document.getElementById('ctx-rename').onclick = () => {
      this._propsDirty = false;
      state.selected = { type: 'station', id: near.id };
      UI.renderProps(); Renderer.render();
      this._closeCtx();
      setTimeout(() => document.getElementById('prop-name')?.focus(), 30);
    };

    // Delete
    document.getElementById('ctx-delete').onclick = () => {
      state.snapshot(); UI.updateUndoRedo();
      if (state.selected?.id === near.id) state.selected = null;
      state.removeStation(near.id);
      Renderer.render(); UI.renderLinesList(); UI.renderProps();
      this._closeCtx();
    };
  },

  _closeCtx() {
    document.getElementById('ctx-menu')?.setAttribute('hidden', '');
    this._ctxStation = null;
  },

  // ── Scroll zoom ───────────────────────────────────────────────────────────
  _onWheel(e) {
    e.preventDefault();
    const { sx, sy } = this._screen(e);
    const factor  = e.deltaY > 0 ? 0.87 : 1 / 0.87;
    const newZoom = Math.min(6, Math.max(0.12, state.zoom * factor));
    state.pan.x = sx - (sx - state.pan.x) * (newZoom / state.zoom);
    state.pan.y = sy - (sy - state.pan.y) * (newZoom / state.zoom);
    state.zoom  = newZoom;
    Renderer.updateTransform();
  },

  // ── Keyboard ──────────────────────────────────────────────────────────────
  _onKey(e) {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.code === 'Space') { e.preventDefault(); state.spacePan = true; document.getElementById('map-svg').style.cursor = 'grab'; return; }

    // Undo / Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) { if (state.redo()) { Renderer.render(); UI.renderLinesList(); UI.renderProps(); UI.updateUndoRedo(); } }
      else            { if (state.undo()) { Renderer.render(); UI.renderLinesList(); UI.renderProps(); UI.updateUndoRedo(); } }
      UI.updateDrawingChip(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      if (state.redo()) { Renderer.render(); UI.renderLinesList(); UI.renderProps(); UI.updateUndoRedo(); }
      UI.updateDrawingChip(); return;
    }

    // Tools
    const tools = { s:'select', a:'station', l:'line', x:'delete' };
    if (tools[e.key]) { UI.setTool(tools[e.key]); return; }
    if (e.key === 'n' || e.key === 'N') { UI.createNewLine(); return; }

    if (e.key === 'Escape') {
      if (state.drawing.active) {
        state.drawing = { active: false, lineId: null, lastSid: null };
        Renderer.renderUI(); UI.updateDrawingChip();
      } else {
        state.selected = null;
        UI.renderProps(); Renderer.render();
      }
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!state.selected) return;
      state.snapshot(); UI.updateUndoRedo();
      const sel = state.selected; state.selected = null;
      if (sel.type === 'station') state.removeStation(sel.id);
      else                         state.removeLine(sel.id);
      Renderer.render(); UI.renderLinesList(); UI.renderProps(); UI.updateDrawingChip();
    }
  },

  _onKeyUp(e) {
    if (e.code === 'Space') {
      state.spacePan = false;
      if (!this.ptr.down) {
        const c = { select:'default', station:'crosshair', line:'crosshair', delete:'crosshair' };
        document.getElementById('map-svg').style.cursor = c[state.tool] || 'default';
      }
    }
  },
};
