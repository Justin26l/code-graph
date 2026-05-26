import type { GraphNode, GraphEdge } from '../types.js';

export function generateHtml(nodes: GraphNode[], edges: GraphEdge[], title: string = 'Code Relation Graph'): string {
  const nodeColors: Record<string, string> = {
    directory: '#97C2FC',
    file: '#B0E57C',
    module: '#FFD700',
    class: '#FFA07A',
    interface: '#DDA0DD',
    function: '#87CEEB',
    method: '#77DD77',
    variable: '#F0E68C',
    export: '#FFB347',
  };

  const nodesJson = JSON.stringify(nodes.map(n => ({
    id: n.id,
    label: n.name,
    group: n.type,
    title: `<b>${n.name}</b><br/>Type: ${n.type}<br/>File: ${n.filePath}:${n.startLine}-${n.endLine}<br/>Language: ${n.language}`,
    shape: n.type === 'directory' ? 'box' : n.type === 'file' ? 'ellipse' : 'dot',
    size: n.type === 'function' || n.type === 'method' ? 14 : n.type === 'class' ? 20 : n.type === 'file' ? 10 : n.type === 'directory' ? 8 : 10,
  })));

  const edgesJson = JSON.stringify(edges.map(e => ({
    from: e.sourceId,
    to: e.targetId,
    title: edgeTypeLabel(e.edgeType),
    arrows: e.edgeType === 'CALLS' ? 'to' : undefined,
    dashes: e.edgeType === 'IMPORTS' || e.edgeType === 'REFERENCES',
    color: edgeColor(e.edgeType),
    width: e.edgeType === 'CONTAINS' ? 1 : 1.5,
    edgeType: e.edgeType,
  })));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; overflow: hidden; height: 100vh; }
  #controls { position: fixed; top: 12px; left: 12px; z-index: 100; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  #controls input, #controls select, #controls button { padding: 6px 12px; border: 1px solid #444; border-radius: 6px; background: #16213e; color: #eee; font-size: 13px; outline: none; }
  #controls input::placeholder { color: #888; }
  #controls label { font-size: 12px; color: #aaa; display: flex; align-items: center; gap: 4px; }
  #controls .active { background: #0f3460; border-color: #4FC3F7; }
  #stats { position: fixed; bottom: 12px; left: 12px; font-size: 11px; color: #666; z-index: 100; }
  #mynetwork { width: 100vw; height: 100vh; }
  #loading { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 200; color: #888; font-size: 14px; }
</style>
</head>
<body>
<div id="loading">Loading graph...</div>
<div id="controls">
  <input type="text" id="search" placeholder="Search nodes..." oninput="filterGraph(this.value)">
  <select id="typeFilter" onchange="filterGraph(document.getElementById('search').value)">
    <option value="">All types</option>
    ${Object.keys(nodeColors).map(t => `<option value="${t}">${t}</option>`).join('')}
  </select>
  <select id="layoutSelect" onchange="changeLayout(this.value)">
    <option value="hierarchical">Hierarchical</option>
    <option value="force">Force-directed</option>
  </select>
  <label><input type="checkbox" checked onchange="toggleEdges('CONTAINS')"> Contain</label>
  <label><input type="checkbox" checked onchange="toggleEdges('CALLS')"> Calls</label>
  <label><input type="checkbox" checked onchange="toggleEdges('IMPORTS')"> Imports</label>
  <button id="focusBtn" onclick="toggleFocus()">Focus: OFF</button>
</div>
<div id="stats"></div>
<div id="mynetwork"></div>

<script src="https://cdn.jsdelivr.net/npm/vis-network@10.1.0/standalone/umd/vis-network.min.js"></script>
<script>
const allNodes = new vis.DataSet(${nodesJson});
const allEdges = new vis.DataSet(${edgesJson});
let network = null;
let focusActive = false;
let focusNodeId = null;

const options = {
  layout: { hierarchical: { direction: 'UD', sortMethod: 'directed', levelSeparation: 150, nodeSpacing: 100 } },
  edges: { smooth: { type: 'dynamic', roundness: 0.2 } },
  interaction: { hover: true, tooltipDelay: 200, navigationButtons: true, keyboard: true },
  nodes: { font: { color: '#fff', size: 11, strokeWidth: 2, strokeColor: '#1a1a2e' }, borderWidth: 1, color: { border: '#333' } },
  groups: {
    ${Object.entries(nodeColors).map(([k, v]) => `${k}: { color: { background: '${v}', border: '#555' } }`).join(',\n    ')}
  }
};

function init() {
  const container = document.getElementById('mynetwork');
  network = new vis.Network(container, { nodes: allNodes, edges: allEdges }, options);
  document.getElementById('loading').style.display = 'none';
  updateStats();
  network.on('click', function(params) {
    if (params.nodes.length > 0) {
      network.selectNodes([params.nodes[0]]);
      const node = allNodes.get(params.nodes[0]);
      document.getElementById('stats').innerHTML = '<b>' + node.label + '</b> (' + node.group + ') &mdash; ' + (node.title || '');
      if (focusActive) applyFocus(params.nodes[0]);
    } else {
      if (focusActive) clearFocus();
    }
  });
  network.on('doubleClick', function() {
    if (focusActive) clearFocus();
  });
}

function filterGraph(query) {
  const typeFilter = document.getElementById('typeFilter').value;
  const q = query.toLowerCase();
  const filtered = allNodes.get().filter(n => {
    if (typeFilter && n.group !== typeFilter) return false;
    return n.label.toLowerCase().includes(q);
  });
  const ids = new Set(filtered.map(n => n.id));
  const edgeIdSet = new Set();
  allEdges.get().forEach(e => {
    if (ids.has(e.from) && ids.has(e.to)) edgeIdSet.add(e.id);
  });
  allNodes.update(allNodes.get().map(n => ({ id: n.id, hidden: !ids.has(n.id) })));
  allEdges.update(allEdges.get().map(e => ({ id: e.id, hidden: !edgeIdSet.has(e.id) })));
  updateStats();
}

function toggleEdges(type) {
  allEdges.forEach(e => {
    if (e.edgeType === type) {
      allEdges.update({ id: e.id, hidden: !e.hidden });
    }
  });
}

function changeLayout(type) {
  const opts = { ...options };
  delete opts.layout;
  if (type === 'hierarchical') {
    opts.layout = { hierarchical: { direction: 'UD', sortMethod: 'directed', levelSeparation: 150, nodeSpacing: 100 } };
    opts.physics = false;
  } else {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('loading').textContent = 'Stabilizing...';
    opts.physics = {
      solver: 'repulsion',
      repulsion: { nodeDistance: 150, centralGravity: 0.005, springLength: 200, springConstant: 0.05, damping: 0.09 },
      maxVelocity: 20,
      stabilization: { iterations: 100, updateInterval: 50 }
    };
    network.once('stabilizationIterationsDone', () => {
      document.getElementById('loading').style.display = 'none';
    });
  }
  network.setOptions(opts);
}

function toggleFocus() {
  focusActive = !focusActive;
  document.getElementById('focusBtn').textContent = 'Focus: ' + (focusActive ? 'ON' : 'OFF');
  document.getElementById('focusBtn').className = focusActive ? 'active' : '';
  if (!focusActive) clearFocus();
}

function applyFocus(nodeId) {
  focusNodeId = nodeId;
  const neighborIds = network.getConnectedNodes(nodeId);
  const edgeIds = network.getConnectedEdges(nodeId);
  const neighborSet = new Set(neighborIds);
  neighborSet.add(nodeId);

  allNodes.update(allNodes.get().map(n => ({
    id: n.id,
    opacity: neighborSet.has(n.id) ? 1.0 : 0.1
  })));

  allEdges.update(allEdges.get().map(e => ({
    id: e.id,
    color: { opacity: edgeIds.includes(e.id) ? 1.0 : 0.05 }
  })));

  updateStats();
}

function clearFocus() {
  focusNodeId = null;
  allNodes.update(allNodes.get().map(n => ({ id: n.id, opacity: 1.0 })));
  allEdges.update(allEdges.get().map(e => ({ id: e.id, color: { opacity: 1.0 } })));
  updateStats();
}

function updateStats() {
  const visible = allNodes.get({ filter: n => !n.hidden });
  document.getElementById('stats').textContent = visible.length + ' visible / ' + allNodes.length + ' nodes, ' + allEdges.get({ filter: e => !e.hidden }).length + ' edges';
}

// Edge type display helpers
window.edgeTypeLabel = ${JSON.stringify({
    CONTAINS: '', CALLS: 'calls', IMPORTS: 'imports',
    EXTENDS: 'extends', IMPLEMENTS: 'implements', REFERENCES: 'refs'
  })};
window.edgeColor = ${JSON.stringify({
    CONTAINS: '#666', CALLS: '#4FC3F7', IMPORTS: '#81C784',
    EXTENDS: '#FFB74D', IMPLEMENTS: '#BA68C8', REFERENCES: '#90A4AE'
  })};

init();
</script>
</body>
</html>`;
}

function edgeTypeLabel(type: string): string {
  switch (type) {
    case 'CONTAINS': return '';
    case 'CALLS': return 'calls';
    case 'IMPORTS': return 'imports';
    case 'EXTENDS': return 'extends';
    case 'IMPLEMENTS': return 'implements';
    case 'REFERENCES': return 'refs';
    default: return '';
  }
}

function edgeColor(type: string): string {
  switch (type) {
    case 'CONTAINS': return '#666';
    case 'CALLS': return '#4FC3F7';
    case 'IMPORTS': return '#81C784';
    case 'EXTENDS': return '#FFB74D';
    case 'IMPLEMENTS': return '#BA68C8';
    case 'REFERENCES': return '#90A4AE';
    default: return '#888';
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
