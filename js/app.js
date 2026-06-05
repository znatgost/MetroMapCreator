document.addEventListener('DOMContentLoaded', () => {
  Renderer.init();
  Editor.init();
  UI.init();

  // Center initial viewport
  const rect = document.getElementById('map-svg').getBoundingClientRect();
  state.pan.x = Math.round(rect.width  * 0.12);
  state.pan.y = Math.round(rect.height * 0.10);

  const saved = localStorage.getItem('metro-map-v2');
  if (saved) {
    try { _loadState(JSON.parse(saved)); }
    catch { _buildDemo(); }
  } else {
    _buildDemo();
  }

  // Initial snapshot (index 0 — can't undo past this)
  state.snapshot();
  UI.updateUndoRedo();

  Renderer.render();
  UI.renderLinesList();
  UI.updateStatus();
  UI.updateDrawingChip();

  setInterval(_saveState, 10_000);
  window.addEventListener('beforeunload', _saveState);
  window.addEventListener('resize', () => Renderer.render());
});

// ── Demo map ───────────────────────────────────────────────────────────────
function _buildDemo() {
  // ── Line A: Red, diagonal ──
  const la   = state.addLine();
  const lineA = state.lines.get(la);
  Object.assign(lineA, { name:'Line A', color:'#E63946', routing:'diagonal', corner:'rounded' });

  const [a1,a2,a3,a4,a5] = [
    [2,3,'Westpark','left'], [4,3,'Market','top'],
    [6,5,'Central','bottom'], [9,5,'Riverside','right'], [11,3,'Eastgate','right'],
  ].map(([gx,gy,name,lp]) => {
    const id = state.addStation(gx,gy);
    Object.assign(state.stations.get(id), { name, labelPos:lp });
    return id;
  });
  lineA.sids = [a1,a2,a3,a4,a5];

  // ── Line B: Blue, orthogonal ──
  const lb   = state.addLine();
  const lineB = state.lines.get(lb);
  Object.assign(lineB, { name:'Line B', color:'#3D72F6', routing:'orthogonal', corner:'rounded' });

  const [b1,b4,b5] = [
    [6,1,'Northend','top'], [6,7,'Southpark','left'], [8,9,'Airport','bottom'],
  ].map(([gx,gy,name,lp]) => {
    const id = state.addStation(gx,gy);
    Object.assign(state.stations.get(id), { name, labelPos:lp });
    return id;
  });
  lineB.sids = [b1, a2, a3, b4, b5];   // shares Market + Central

  // ── Line C: Teal, circular ──
  const lc   = state.addLine();
  const lineC = state.lines.get(lc);
  Object.assign(lineC, { name:'Circle C', color:'#2A9D8F', routing:'diagonal', corner:'rounded', loop:true });

  const [c1,c3,c5] = [
    [4,6,'Stadium','left'], [9,7,'Docklands','right'], [7,4,'Midtown','top'],
  ].map(([gx,gy,name,lp]) => {
    const id = state.addStation(gx,gy);
    Object.assign(state.stations.get(id), { name, labelPos:lp });
    return id;
  });
  lineC.sids = [c1, b4, c3, a4, c5];   // shares Southpark + Riverside

  // ── Line D: Orange express, sharp diagonal ──
  const ld   = state.addLine();
  const lineD = state.lines.get(ld);
  Object.assign(lineD, { name:'Express D', color:'#F4A261', routing:'diagonal', corner:'sharp', width:6 });

  const d1 = state.addStation(2,7);
  Object.assign(state.stations.get(d1), { name:'Harbor', labelPos:'left' });
  lineD.sids = [d1, c1, b5];            // shares Stadium + Airport

  state.activeLine = null;
  state.selected   = null;
}

// ── Persistence ────────────────────────────────────────────────────────────
function _saveState() {
  try {
    localStorage.setItem('metro-map-v2', JSON.stringify({
      stations: [...state.stations.entries()],
      lines:    [...state.lines.entries()],
      pan: state.pan, zoom: state.zoom, uid: state._uid,
    }));
  } catch { /* storage full */ }
}

function _loadState(d) {
  state.stations = new Map(d.stations);
  state.lines    = new Map(d.lines.map(([k,v]) => [k, {
    ...v,
    routing: v.routing ?? 'diagonal',
    corner:  v.corner  ?? 'rounded',
    cornerR: v.cornerR ?? (v.corner === 'sharp' ? 0 : CFG.CORNER_R),
    sids:    v.sids    ?? [],
  }]));
  state.pan  = d.pan  ?? state.pan;
  state.zoom = d.zoom ?? 1;
  state._uid = d.uid  ?? 1;
}
