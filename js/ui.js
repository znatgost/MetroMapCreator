// ─── UI: panels, toolbar, drawing chip, export ────────────────────────────
const UI = {
  init() {
    document.querySelectorAll('[data-tool]').forEach(btn =>
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool))
    );

    ['btn-new-line','empty-cta'].forEach(id =>
      document.getElementById(id)?.addEventListener('click', () => this.createNewLine())
    );

    // Mobile FAB → show create mode
    document.getElementById('mobile-fab')?.addEventListener('click', () => {
      document.getElementById('mobile-bar-normal').setAttribute('hidden', '');
      document.getElementById('mobile-bar-create').removeAttribute('hidden');
    });
    document.getElementById('mob-create-cancel')?.addEventListener('click', () => {
      document.getElementById('mobile-bar-create').setAttribute('hidden', '');
      document.getElementById('mobile-bar-normal').removeAttribute('hidden');
    });
    document.getElementById('mob-create-station')?.addEventListener('click', () => {
      document.getElementById('mobile-bar-create').setAttribute('hidden', '');
      document.getElementById('mobile-bar-normal').removeAttribute('hidden');
      this.setTool('station');
    });
    document.getElementById('mob-create-line')?.addEventListener('click', () => {
      document.getElementById('mobile-bar-create').setAttribute('hidden', '');
      document.getElementById('mobile-bar-normal').removeAttribute('hidden');
      this.createNewLine();
    });

    // Mobile SVG export
    document.getElementById('mobile-export-svg')?.addEventListener('click', () => {
      document.getElementById('btn-export-svg')?.click();
    });

    document.getElementById('btn-export-png')?.addEventListener('click', () => this.exportPNG());
    document.getElementById('btn-export-svg')?.addEventListener('click', () => this.exportSVG());

    document.getElementById('btn-undo')?.addEventListener('click', () => {
      if (state.undo()) { Renderer.render(); this.renderLinesList(); this.renderProps(); this.updateUndoRedo(); this.updateDrawingChip(); }
    });
    document.getElementById('btn-redo')?.addEventListener('click', () => {
      if (state.redo()) { Renderer.render(); this.renderLinesList(); this.renderProps(); this.updateUndoRedo(); this.updateDrawingChip(); }
    });

    document.getElementById('btn-zoom-in') ?.addEventListener('click', () => this._zoom(1.25));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this._zoom(0.8));
    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => { Renderer.fitToContent(); Renderer.render(); });

    document.getElementById('chip-done')?.addEventListener('click', () => {
      state.drawing = { active: false, lineId: null, lastSid: null };
      Renderer.renderUI(); this.updateDrawingChip();
    });

    // Mobile sheet close
    document.getElementById('sheet-backdrop')?.addEventListener('click', () => this._closeSheet());
    document.getElementById('sheet-close')   ?.addEventListener('click', () => this._closeSheet());

    this._initSettings();
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  mapCfg: {
    labels: true, grid: true,
    legend: true, legendLines: true, legendCounts: true,
    bgColor: '#EFF2F7',
  },

  _initSettings() {
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      document.getElementById('settings-overlay').removeAttribute('hidden');
    });
    document.getElementById('settings-close')?.addEventListener('click', () => {
      document.getElementById('settings-overlay').setAttribute('hidden', '');
    });
    document.getElementById('settings-overlay')?.addEventListener('click', e => {
      if (e.target === document.getElementById('settings-overlay'))
        document.getElementById('settings-overlay').setAttribute('hidden', '');
    });

    const bind = (id, key, cb) => {
      document.getElementById(id)?.addEventListener('change', e => {
        this.mapCfg[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        if (cb) cb();
      });
    };

    bind('cfg-labels',        'labels',       () => { Renderer.renderLabels(); });
    bind('cfg-grid',          'grid',         () => { this._applyGrid(); });
    bind('cfg-legend',        'legend',       () => { this.renderLegend(); });
    bind('cfg-legend-lines',  'legendLines',  () => { this.renderLegend(); });
    bind('cfg-legend-counts', 'legendCounts', () => { this.renderLegend(); });

    document.querySelectorAll('.bg-swatch').forEach(s => {
      s.addEventListener('click', () => {
        this.mapCfg.bgColor = s.dataset.bg;
        document.querySelectorAll('.bg-swatch').forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        this._applyBg();
      });
    });
  },

  _applyGrid() {
    const rect = document.querySelector('#world > rect');
    if (rect) rect.setAttribute('fill', this.mapCfg.grid ? 'url(#grid-pat)' : 'none');
  },

  _applyBg() {
    document.querySelector('.canvas-wrap').style.background = this.mapCfg.bgColor;
  },

  renderLegend() {
    const el = document.getElementById('map-legend');
    if (!el) return;
    if (!this.mapCfg.legend || state.lines.size === 0) { el.innerHTML = ''; return; }
    const rows = [...state.lines.values()].filter(l => l.sids.length > 0).map(l => {
      const count = this.mapCfg.legendCounts ? `<span class="legend-count">${l.sids.length} stops</span>` : '';
      const name  = this.mapCfg.legendLines  ? `<span class="legend-name">${this._esc(l.name)}</span>` : '';
      return `<div class="legend-row"><span class="legend-dot" style="background:${l.color}"></span>${name}${count}</div>`;
    }).join('');
    el.innerHTML = `<div class="legend-inner">${rows}</div>`;
  },

  // ── Tool ─────────────────────────────────────────────────────────────────
  setTool(tool, { keepDrawing = false } = {}) {
    state.tool = tool;
    document.querySelectorAll('[data-tool]').forEach(b =>
      b.classList.toggle('active', b.dataset.tool === tool)
    );
    const cursors = { select:'default', station:'crosshair', line:'crosshair', delete:'crosshair' };
    document.getElementById('map-svg').style.cursor = cursors[tool] ?? 'default';
    if (tool !== 'line' && !keepDrawing) {
      state.drawing = { active: false, lineId: null, lastSid: null };
      Renderer.renderUI();
      this.updateDrawingChip();
    }
    this.updateStatus();
  },

  // ── New line ──────────────────────────────────────────────────────────────
  createNewLine() {
    state.snapshot();
    const id = state.addLine();
    state.activeLine = id;
    state.selected   = { type: 'line', id };
    state.drawing    = { active: false, lineId: id, lastSid: null };
    this.setTool('line');
    this.renderLinesList();
    this.renderProps();
    Renderer.render();
    this.updateUndoRedo();
    setTimeout(() => document.querySelector('#lines-list .line-item.active')?.scrollIntoView({ behavior:'smooth' }), 50);
  },

  // ── Zoom ──────────────────────────────────────────────────────────────────
  _zoom(f) {
    const rect = document.getElementById('map-svg').getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const z  = Math.min(6, Math.max(0.12, state.zoom * f));
    state.pan.x = cx - (cx - state.pan.x) * (z / state.zoom);
    state.pan.y = cy - (cy - state.pan.y) * (z / state.zoom);
    state.zoom  = z;
    Renderer.updateTransform();
  },

  // ── Undo/redo buttons ─────────────────────────────────────────────────────
  updateUndoRedo() {
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if (u) u.disabled = !state.canUndo();
    if (r) r.disabled = !state.canRedo();
  },

  // ── Drawing chip ──────────────────────────────────────────────────────────
  updateDrawingChip() {
    const chip = document.getElementById('drawing-chip');
    if (!chip) return;
    const aLine = state.lines.get(state.activeLine);
    if (state.drawing.active && aLine) {
      chip.removeAttribute('hidden');
      document.getElementById('chip-dot').style.background  = aLine.color;
      document.getElementById('chip-text').textContent = `Drawing: ${aLine.name}`;
    } else {
      chip.setAttribute('hidden', '');
    }
  },

  // ── Lines list ────────────────────────────────────────────────────────────
  renderLinesList() {
    const list = document.getElementById('lines-list');
    if (state.lines.size === 0) {
      list.innerHTML = '<p class="hint-text">Click + to add a line</p>';
      this.renderLegend();
      return;
    }
    list.innerHTML = '';
    for (const line of state.lines.values()) {
      const active = state.activeLine === line.id;
      const div = document.createElement('div');
      div.className = `line-item${active ? ' active' : ''}`;
      div.innerHTML = `
        <span class="line-dot" style="background:${line.color}"></span>
        <span class="line-item-name">${this._esc(line.name)}</span>
        <span class="line-count">${line.sids.length}</span>
        <button class="del-btn" data-lid="${line.id}" title="Delete line">×</button>
      `;
      div.querySelector('.del-btn').addEventListener('click', e => {
        e.stopPropagation();
        state.snapshot(); this.updateUndoRedo();
        if (state.selected?.id === line.id) state.selected = null;
        state.removeLine(line.id);
        Renderer.render(); this.renderLinesList(); this.renderProps(); this.updateDrawingChip();
      });
      div.addEventListener('click', () => {
        state.activeLine = line.id;
        state.selected   = { type: 'line', id: line.id };
        this.renderLinesList(); this.renderProps();
        this.setTool('line');
        Renderer.render();
      });
      list.appendChild(div);
    }
    this.renderLegend();
  },

  _isMobile() {
    // Check if mobile-bar is actually visible (CSS-driven, not width-based)
    const bar = document.querySelector('.mobile-bar');
    return bar && getComputedStyle(bar).display !== 'none';
  },

  // ── Properties panel ─────────────────────────────────────────────────────
  renderProps() {
    const desktop = document.getElementById('props-content');
    this._renderPropsInto(desktop);

    if (this._isMobile() && state.selected) {
      this._openSheet();
      return;
    }

    // Desktop: update sheet if already open
    const sheet = document.getElementById('mobile-sheet');
    if (sheet && !sheet.hasAttribute('hidden')) {
      this._renderPropsInto(document.getElementById('mobile-props-content'));
    }
  },

  _renderPropsInto(container) {
    if (!container) return;
    const content = container.id === 'props-content' ? container : container;

    if (!state.selected) {
      container.innerHTML = '<p class="hint-text">Select an element to edit its properties</p>';
      return;
    }
    if (state.selected.type === 'station') this._stationProps(container);
    else if (state.selected.type === 'line') this._lineProps(container);
  },

  _stationProps(el) {
    const s = state.stations.get(state.selected.id);
    if (!s) { el.innerHTML = ''; return; }

    const lines = state.stationLines(s.id);
    const DIRS  = ['top-left','top','top-right','left','','right','bottom-left','bottom','bottom-right'];
    const GLYPHS = { 'top-left':'↖','top':'↑','top-right':'↗','left':'←','right':'→','bottom-left':'↙','bottom':'↓','bottom-right':'↘' };

    const linesHtml = lines.length === 0 ? '<p class="hint-text">Not on any line</p>' :
      `<div class="station-lines">${lines.map(l => `
        <div class="station-line-row">
          <span class="station-line-dot" style="background:${l.color}"></span>
          <span class="station-line-name">${this._esc(l.name)}</span>
          <button class="station-line-remove" data-lid="${l.id}">Remove</button>
        </div>`).join('')}</div>`;

    el.innerHTML = `
      <div class="prop-row">
        <label class="prop-label">Name</label>
        <div class="prop-input-row">
          <input id="prop-name" class="prop-input" type="text"
            value="${this._esc(s.name)}" placeholder="Station name…">
          <button id="prop-name-ok" class="prop-ok-btn" title="Apply (Enter)">✓</button>
        </div>
      </div>
      <hr class="prop-divider">
      <div class="prop-row">
        <label class="prop-label">Label Position</label>
        <div class="label-grid">
          ${DIRS.map(pos => pos
            ? `<button class="lp-btn${s.labelPos===pos?' active':''}" data-pos="${pos}" title="${pos}"></button>`
            : `<span class="lp-center">⊙</span>`
          ).join('')}
        </div>
      </div>
      <hr class="prop-divider">
      <div class="prop-row">
        <label class="prop-label">Lines</label>
        ${linesHtml}
      </div>
    `;

    const nameInput = document.getElementById('prop-name');
    nameInput?.addEventListener('input', e => {
      Editor._markPropsDirty();
      s.name = e.target.value;
      Renderer.renderLabels();
    });
    nameInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); this.toast('Name saved'); }
    });
    document.getElementById('prop-name-ok')?.addEventListener('click', () => {
      Editor._markPropsDirty();
      s.name = nameInput.value;
      Renderer.renderLabels();
      this.toast('Name saved');
    });

    el.querySelectorAll('.lp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Editor._markPropsDirty();
        s.labelPos = btn.dataset.pos;
        el.querySelectorAll('.lp-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Renderer.renderLabels();
      });
    });

    el.querySelectorAll('.station-line-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        state.snapshot(); this.updateUndoRedo();
        state.removeStationFromLine(s.id, btn.dataset.lid);
        Renderer.render(); this.renderLinesList(); this.renderProps();
      });
    });
  },

  _lineProps(el) {
    const line = state.lines.get(state.selected.id);
    if (!line) { el.innerHTML = ''; return; }

    el.innerHTML = `
      <div class="prop-row">
        <label class="prop-label">Name</label>
        <input id="prop-lname" class="prop-input" type="text" value="${this._esc(line.name)}">
      </div>
      <hr class="prop-divider">
      <div class="prop-row">
        <label class="prop-label">Color</label>
        <div class="color-palette">
          ${COLORS.map(c => `<span class="clr-swatch${line.color===c?' active':''}"
            data-c="${c}" style="background:${c}" title="${c}"></span>`).join('')}
        </div>
      </div>
      <hr class="prop-divider">
      <div class="prop-row">
        <label class="prop-label">Width &nbsp;<span id="wv" style="font-weight:400;text-transform:none">${line.width}px</span></label>
        <input type="range" id="prop-width" class="range-input" min="3" max="20" step="1" value="${line.width}">
      </div>
      <hr class="prop-divider">
      <div class="prop-row">
        <label class="prop-label">Routing</label>
        <div class="seg-btns">
          ${['diagonal','orthogonal','direct'].map(r =>
            `<button class="seg-btn${line.routing===r?' active':''}" data-routing="${r}">${r}</button>`
          ).join('')}
        </div>
      </div>
      <div class="prop-row">
        <label class="prop-label">Corners</label>
        <div class="seg-btns">
          ${['rounded','sharp'].map(c =>
            `<button class="seg-btn${line.corner===c?' active':''}" data-corner="${c}">${c}</button>`
          ).join('')}
        </div>
      </div>
      <hr class="prop-divider">
      <div class="prop-row">
        <label class="prop-label">Loop</label>
        <label class="toggle-row">
          <input type="checkbox" id="prop-loop" ${line.loop?'checked':''}>
          <span class="toggle-track"></span>
          <span class="toggle-text">Circular line</span>
        </label>
      </div>
      <hr class="prop-divider">
      <div class="prop-row">
        <button id="prop-continue" class="btn-continue">▶ Continue drawing this line</button>
      </div>
    `;

    const snap = () => { Editor._markPropsDirty(); };

    document.getElementById('prop-lname').addEventListener('input', e => {
      snap(); line.name = e.target.value; this.renderLinesList();
    });

    el.querySelectorAll('.clr-swatch').forEach(d => {
      d.addEventListener('click', () => {
        snap(); line.color = d.dataset.c;
        el.querySelectorAll('.clr-swatch').forEach(x => x.classList.remove('active'));
        d.classList.add('active');
        Renderer.render(); this.renderLinesList();
      });
    });

    document.getElementById('prop-width').addEventListener('input', e => {
      snap(); line.width = +e.target.value;
      document.getElementById('wv').textContent = `${line.width}px`;
      Renderer.render();
    });

    el.querySelectorAll('[data-routing]').forEach(btn => {
      btn.addEventListener('click', () => {
        snap(); line.routing = btn.dataset.routing;
        el.querySelectorAll('[data-routing]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); Renderer.render();
      });
    });

    el.querySelectorAll('[data-corner]').forEach(btn => {
      btn.addEventListener('click', () => {
        snap(); line.corner = btn.dataset.corner;
        el.querySelectorAll('[data-corner]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); Renderer.render();
      });
    });

    document.getElementById('prop-loop').addEventListener('change', e => {
      snap(); line.loop = e.target.checked; Renderer.render();
    });

    document.getElementById('prop-continue').addEventListener('click', () => {
      state.activeLine = line.id;
      const lastSid = line.sids[line.sids.length - 1];
      state.drawing = lastSid
        ? { active: true,  lineId: line.id, lastSid }
        : { active: false, lineId: line.id, lastSid: null };
      this.setTool('line', { keepDrawing: true });
      this.renderLinesList();
      this.updateDrawingChip();
      Renderer.renderUI();
      this.toast('Click on the canvas to add stations');
    });
  },

  // ── Mobile sheet ──────────────────────────────────────────────────────────
  _openSheet() {
    const sheet = document.getElementById('mobile-sheet');
    if (!sheet) return;
    sheet.removeAttribute('hidden');

    const title = document.getElementById('sheet-title');
    if (state.selected?.type === 'station') {
      const s = state.stations.get(state.selected.id);
      title.textContent = s?.name || 'Station';
    } else if (state.selected?.type === 'line') {
      const l = state.lines.get(state.selected.id);
      title.textContent = l?.name || 'Line';
    }

    const content = document.getElementById('mobile-props-content');
    const wrap = document.createElement('div');
    wrap.className = 'props-content';
    content.innerHTML = '';
    content.appendChild(wrap);
    this._renderPropsInto(wrap);
  },

  _closeSheet() {
    document.getElementById('mobile-sheet')?.setAttribute('hidden', '');
  },

  // ── Status bar ────────────────────────────────────────────────────────────
  updateStatus() {
    const el = document.getElementById('status-text');
    if (!el) return;
    const msgs = {
      select:  'Click to select · drag to move · Del to remove',
      station: 'Click on the canvas to place a station',
      line:    state.activeLine
        ? (state.drawing.active
            ? 'Click stations or canvas · click first station to close loop · double-click or Esc to finish'
            : 'Click a station or canvas to begin drawing')
        : 'Create or select a line first',
      delete: 'Click a station or line to delete it',
    };
    el.textContent = msgs[state.tool] ?? '';
  },

  // ── Toast ─────────────────────────────────────────────────────────────────
  toast(msg) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2400);
  },

  // ── Export PNG ────────────────────────────────────────────────────────────
  exportPNG() {
    const svg  = document.getElementById('map-svg');
    const rect = svg.getBoundingClientRect();

    // Compute tight bounding box around content (world coords → screen)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of state.stations.values()) {
      const { x, y } = state.toSVG(s.gx, s.gy);
      const sx = x * state.zoom + state.pan.x;
      const sy = y * state.zoom + state.pan.y;
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy);
      x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    const PAD = 80;
    const hasBounds = x0 < Infinity;
    const cropX = hasBounds ? Math.max(0, x0 - PAD) : 0;
    const cropY = hasBounds ? Math.max(0, y0 - PAD) : 0;
    const cropW = hasBounds ? Math.min(rect.width,  x1 - x0 + PAD * 2) : rect.width;
    const cropH = hasBounds ? Math.min(rect.height, y1 - y0 + PAD * 2) : rect.height;

    // Target at least 2560px on the long side
    const LONG = 2560;
    const DPR  = Math.max(3, Math.ceil(LONG / Math.max(cropW, cropH)));

    const clone = svg.cloneNode(true);
    clone.setAttribute('width',  rect.width);
    clone.setAttribute('height', rect.height);
    clone.querySelector('#world > rect')?.setAttribute('fill', 'none');

    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = "@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@500&display=swap');";
    clone.insertBefore(style, clone.firstChild);

    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      const canvas  = document.createElement('canvas');
      canvas.width  = Math.round(cropW * DPR);
      canvas.height = Math.round(cropH * DPR);
      const ctx = canvas.getContext('2d');
      ctx.scale(DPR, DPR);
      ctx.fillStyle = this.mapCfg.bgColor || '#EFF2F7';
      ctx.fillRect(0, 0, cropW, cropH);
      ctx.drawImage(img, -cropX, -cropY);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = 'metro-map.png';
      a.href = canvas.toDataURL('image/png', 1.0);
      a.click();
      this.toast(`Exported ${canvas.width}×${canvas.height}px`);
    };
    img.onerror = () => { URL.revokeObjectURL(url); this.toast('PNG export failed — try SVG'); };
    img.src = url;
  },

  exportSVG() {
    const svg  = document.getElementById('map-svg');
    const rect = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true);
    clone.setAttribute('width', rect.width);
    clone.setAttribute('height', rect.height);
    clone.querySelector('#world > rect')?.setAttribute('fill', 'none');
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.download = 'metro-map.svg'; a.href = url; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  },

  _esc(str) {
    return (str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  },
};
