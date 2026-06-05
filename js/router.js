// ─── Router: SVG path computation ─────────────────────────────────────────
const Router = {

  segment(s1, s2, routing, corner, cornerR) {
    // Always round to grid for path geometry — fractional coords break diagonal routing
    const x1 = Math.round(s1.gx) * CFG.GRID, y1 = Math.round(s1.gy) * CFG.GRID;
    const x2 = Math.round(s2.gx) * CFG.GRID, y2 = Math.round(s2.gy) * CFG.GRID;
    if (x1 === x2 && y1 === y2) return null;
    const r = cornerR ?? (corner === 'rounded' ? CFG.CORNER_R : 0);
    switch (routing) {
      case 'direct':     return `M${x1},${y1} L${x2},${y2}`;
      case 'orthogonal': return this._ortho(x1, y1, x2, y2, r);
      default:           return this._diag(x1, y1, x2, y2, r);
    }
  },

  _ortho(x1, y1, x2, y2, r) {
    if (x1 === x2 || y1 === y2) return `M${x1},${y1} L${x2},${y2}`;
    const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1);
    if (r === 0) return `M${x1},${y1} L${x2},${y1} L${x2},${y2}`;
    return `M${x1},${y1} L${x2 - sx*r},${y1} Q${x2},${y1} ${x2},${y1 + sy*r} L${x2},${y2}`;
  },

  _diag(x1, y1, x2, y2, r) {
    const dx = x2-x1, dy = y2-y1;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const sx = Math.sign(dx), sy = Math.sign(dy);
    if (adx === 0 || ady === 0) return `M${x1},${y1} L${x2},${y2}`;
    if (adx === ady)            return `M${x1},${y1} L${x2},${y2}`;

    const D = 1 / Math.SQRT2;

    if (adx > ady) {
      const cx = x1 + sx*ady, cy = y2;
      if (r === 0) return `M${x1},${y1} L${cx},${cy} L${x2},${y2}`;
      return `M${x1},${y1} L${cx - sx*r*D},${cy - sy*r*D} Q${cx},${cy} ${cx + sx*r},${cy} L${x2},${y2}`;
    } else {
      const cx = x2, cy = y1 + sy*adx;
      if (r === 0) return `M${x1},${y1} L${cx},${cy} L${x2},${y2}`;
      return `M${x1},${y1} L${cx - sx*r*D},${cy - sy*r*D} Q${cx},${cy} ${cx},${cy + sy*r} L${x2},${y2}`;
    }
  },

  linePath(line) {
    const ss = line.sids.map(id => state.stations.get(id)).filter(Boolean);
    if (ss.length < 2) return null;
    const segs = [];
    for (let i = 0; i < ss.length - 1; i++) {
      const s = this.segment(ss[i], ss[i+1], line.routing, line.corner, line.cornerR);
      if (s) segs.push(s);
    }
    if (line.loop && ss.length >= 3) {
      const s = this.segment(ss[ss.length-1], ss[0], line.routing, line.corner, line.cornerR);
      if (s) segs.push(s);
    }
    return segs.join(' ') || null;
  },

  // Preview from last station to cursor (world coords)
  previewPath(sid, wx, wy, routing, corner, cornerR) {
    const s = state.stations.get(sid);
    if (!s) return null;
    const { gx, gy } = state.snapGrid(wx, wy);
    const fake = { gx, gy };
    return this.segment(s, fake, routing, corner, cornerR)
        || `M${s.gx*CFG.GRID},${s.gy*CFG.GRID} L${wx},${wy}`;
  },
};
