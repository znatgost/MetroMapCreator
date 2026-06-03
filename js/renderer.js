// ─── Renderer ─────────────────────────────────────────────────────────────
const Renderer = {
  svg: null, world: null,
  layerLines: null, layerStations: null, layerLabels: null, layerUI: null,

  init() {
    this.svg           = document.getElementById('map-svg');
    this.world         = document.getElementById('world');
    this.layerLines    = document.getElementById('layer-lines');
    this.layerStations = document.getElementById('layer-stations');
    this.layerLabels   = document.getElementById('layer-labels');
    this.layerUI       = document.getElementById('layer-ui');
  },

  el(tag, attrs = {}) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  },

  updateTransform() {
    this.world.setAttribute('transform',
      `translate(${state.pan.x},${state.pan.y}) scale(${state.zoom})`);
    const z = document.getElementById('status-zoom');
    if (z) z.textContent = `${Math.round(state.zoom * 100)}%`;
  },

  render() {
    this.renderLines();
    this.renderStations();
    this.renderLabels();
    this.renderUI();
    this.updateTransform();
    this._updateEmptyState();
  },

  // ── Lines ──────────────────────────────────────────────────────────────
  renderLines() {
    this.layerLines.innerHTML = '';
    for (const line of state.lines.values()) {
      const d = Router.linePath(line);
      if (!d) continue;
      const sel    = state.selected?.type === 'line' && state.selected?.id === line.id;
      const active = state.activeLine === line.id;

      // White halo
      this.layerLines.appendChild(this.el('path', {
        d, stroke: 'white', 'stroke-width': line.width + 7, fill: 'none',
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none',
      }));

      // Glow for selected / active
      if (sel || active) {
        this.layerLines.appendChild(this.el('path', {
          d, stroke: line.color, 'stroke-width': line.width + 11, fill: 'none',
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          opacity: sel ? '0.22' : '0.1', 'pointer-events': 'none',
        }));
      }

      // Main stroke
      this.layerLines.appendChild(this.el('path', {
        d, stroke: line.color, 'stroke-width': line.width, fill: 'none',
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none',
      }));

      // Transparent hit-area
      this.layerLines.appendChild(this.el('path', {
        d, stroke: 'transparent', fill: 'none',
        'stroke-width': Math.max(line.width + 12, 20),
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        cursor: 'pointer', 'data-line-id': line.id,
      }));
    }
  },

  // ── Stations ──────────────────────────────────────────────────────────
  renderStations() {
    this.layerStations.innerHTML = '';
    for (const s of state.stations.values()) {
      const { x, y }  = state.toSVG(s.gx, s.gy);
      const lines      = state.stationLines(s.id).filter(l => l.sids.length >= 2);
      const isTransfer = lines.length > 1;
      const isSel      = state.selected?.type === 'station' && state.selected?.id === s.id;
      const aLine      = state.lines.get(state.activeLine);
      const isOnActive = aLine?.sids.includes(s.id);
      const r          = isTransfer ? CFG.STATION_R + 2 : CFG.STATION_R;

      const g = this.el('g', {
        transform: `translate(${x},${y})`,
        cursor: 'pointer', 'data-station-id': s.id,
        'pointer-events': 'all',
      });

      // Invisible large touch hit area
      g.appendChild(this.el('circle', {
        r: Math.max(r + 14, 22), fill: 'transparent',
        'pointer-events': 'all', 'data-station-id': s.id,
      }));

      // Active-line halo
      if (isOnActive) {
        g.appendChild(this.el('circle', { r: r + 5, fill: aLine.color, opacity: '0.15' }));
      }

      // Selection ring
      if (isSel) {
        g.appendChild(this.el('circle', {
          r: r + 5, fill: 'none', stroke: '#1C2333',
          'stroke-width': 1.5, 'stroke-dasharray': '4 2', opacity: '0.5',
        }));
      }

      // Body
      const borderColor = lines.length > 0 ? lines[0].color : '#94A3B8';
      g.appendChild(this.el('circle', {
        r, fill: 'white',
        stroke: isTransfer ? '#1C2333' : borderColor,
        'stroke-width': isTransfer ? 2.5 : 3,
      }));

      // Transfer arcs
      if (isTransfer) {
        const n = lines.length, da = (2 * Math.PI) / n, ri = r - 1.5;
        for (let i = 0; i < n; i++) {
          const a1 = i * da - Math.PI / 2;
          const a2 = (i + 1) * da - Math.PI / 2 - 0.08;
          const x1 = ri * Math.cos(a1), y1 = ri * Math.sin(a1);
          const x2 = ri * Math.cos(a2), y2 = ri * Math.sin(a2);
          g.appendChild(this.el('path', {
            d: `M${x1},${y1} A${ri},${ri} 0 ${da > Math.PI ? 1 : 0},1 ${x2},${y2}`,
            stroke: lines[i].color, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'butt',
          }));
        }
      }

      this.layerStations.appendChild(g);
    }
  },

  // ── Labels ────────────────────────────────────────────────────────────
  renderLabels() {
    this.layerLabels.innerHTML = '';
    if (!UI.mapCfg?.labels) return;
    for (const s of state.stations.values()) {
      if (!s.name) continue;
      const { x, y } = state.toSVG(s.gx, s.gy);
      const off = this._labelOff(s.labelPos, CFG.STATION_R + 8);

      const base = {
        x: x + off.dx, y: y + off.dy,
        'text-anchor': off.anchor, 'dominant-baseline': off.base,
        'font-family': "'DM Mono','Courier New',monospace",
        'font-size': '11', 'font-weight': '500', 'pointer-events': 'none',
      };

      // White knockout stroke
      const shadow = this.el('text', { ...base, fill: 'none', stroke: 'white', 'stroke-width': '3.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'paint-order': 'stroke' });
      shadow.textContent = s.name;

      const text = this.el('text', { ...base, fill: '#1C2333' });
      text.textContent = s.name;

      this.layerLabels.appendChild(shadow);
      this.layerLabels.appendChild(text);
    }
  },

  // ── UI layer: preview + snap dot ─────────────────────────────────────
  renderUI() {
    this.layerUI.innerHTML = '';
    const { wx, wy } = state.cursor;
    const aLine = state.lines.get(state.activeLine);

    // Drawing preview path
    if (state.drawing.active && aLine && state.drawing.lastSid) {
      const d = Router.previewPath(state.drawing.lastSid, wx, wy, aLine.routing, aLine.corner);
      if (d) {
        this.layerUI.appendChild(this.el('path', {
          d, stroke: aLine.color, 'stroke-width': aLine.width, fill: 'none',
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          opacity: '0.40', 'stroke-dasharray': '8 5', 'pointer-events': 'none',
        }));
      }
    }

    // Snap indicator
    if (state.tool === 'station' || state.tool === 'line') {
      const { gx, gy } = state.snapGrid(wx, wy);
      const sx = gx * CFG.GRID, sy = gy * CFG.GRID;
      const color     = aLine?.color ?? '#3D72F6';
      const occupied  = !!state.atGrid(gx, gy);
      const nearSnap  = state.nearStation(wx, wy, CFG.SNAP_D);

      if (!occupied && !nearSnap) {
        // Empty grid cell: cross + circle
        this.layerUI.appendChild(this.el('circle', {
          cx: sx, cy: sy, r: 5, fill: color, opacity: '0.45', 'pointer-events': 'none',
        }));
        ['M'+(sx-9)+','+sy+' L'+(sx+9)+','+sy, 'M'+sx+','+(sy-9)+' L'+sx+','+(sy+9)].forEach(d => {
          this.layerUI.appendChild(this.el('path', {
            d, stroke: color, 'stroke-width': 1.2, opacity: '0.3', 'pointer-events': 'none',
          }));
        });
      } else if (nearSnap && state.tool === 'line') {
        // Highlight nearby existing station
        const { x: nx, y: ny } = state.toSVG(nearSnap.gx, nearSnap.gy);

        // Close-loop hint: pulse ring on first station
        const lineForDraw = state.lines.get(state.activeLine);
        const isFirst = lineForDraw?.sids[0] === nearSnap.id && (lineForDraw?.sids.length ?? 0) >= 3;

        this.layerUI.appendChild(this.el('circle', {
          cx: nx, cy: ny, r: CFG.STATION_R + 6,
          fill: 'none', stroke: isFirst ? '#22C55E' : color,
          'stroke-width': 2.5, opacity: '0.65', 'pointer-events': 'none',
        }));

        if (isFirst) {
          this.layerUI.appendChild(this.el('circle', {
            cx: nx, cy: ny, r: CFG.STATION_R + 10,
            fill: 'none', stroke: '#22C55E', 'stroke-width': 1.5,
            opacity: '0.3', 'pointer-events': 'none',
          }));
        }
      }
    }
  },

  // ── Fit to content ────────────────────────────────────────────────────
  fitToContent() {
    if (state.stations.size === 0) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of state.stations.values()) {
      const { x, y } = state.toSVG(s.gx, s.gy);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const pad  = 100;
    const rect = this.svg.getBoundingClientRect();
    const zoom = Math.min(rect.width / (x1 - x0 + pad * 2), rect.height / (y1 - y0 + pad * 2), 2);
    state.zoom  = zoom;
    state.pan.x = rect.width  / 2 - (x0 + x1) / 2 * zoom;
    state.pan.y = rect.height / 2 - (y0 + y1) / 2 * zoom;
    this.updateTransform();
  },

  _updateEmptyState() {
    const el = document.getElementById('empty-state');
    if (el) el.style.display = (state.stations.size === 0 && state.lines.size === 0) ? 'flex' : 'none';
  },

  _labelOff(pos, d) {
    const g = d * 0.72;
    return ({
      'right':         { dx: d,    dy: 0,    anchor: 'start',  base: 'middle'  },
      'left':          { dx: -d,   dy: 0,    anchor: 'end',    base: 'middle'  },
      'top':           { dx: 0,    dy: -d,   anchor: 'middle', base: 'auto'    },
      'bottom':        { dx: 0,    dy: d,    anchor: 'middle', base: 'hanging' },
      'top-right':     { dx: g,    dy: -g,   anchor: 'start',  base: 'auto'    },
      'top-left':      { dx: -g,   dy: -g,   anchor: 'end',    base: 'auto'    },
      'bottom-right':  { dx: g,    dy: g,    anchor: 'start',  base: 'hanging' },
      'bottom-left':   { dx: -g,   dy: g,    anchor: 'end',    base: 'hanging' },
    })[pos] ?? { dx: d, dy: 0, anchor: 'start', base: 'middle' };
  },
};
