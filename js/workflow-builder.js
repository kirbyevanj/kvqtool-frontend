let editor = null;
let currentWorkflowId = null;
let currentWorkflowName = null;
let sessionGroupCounter = 0;

const SESSION_COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// Port type definitions matching kvq-models/types/workflow_dag.go NodePortSpecs.
const PORT_TYPES = {
  video:    { label: 'video',    color: '#6366F1' },
  scenecut: { label: 'scenecut', color: '#F59E0B' },
  metrics:  { label: 'metrics',  color: '#10B981' },
  report:   { label: 'report',   color: '#3B82F6' },
  any:      { label: 'any',      color: '#6B7280' },
};

const NODE_PORT_SPECS = {
  ResourceDownload:        { in: [],                        out: ['video'] },
  ResourceUpload:          { in: ['video'],                 out: [] },
  x264Transcode:           { in: ['video'],                 out: ['video'] },
  FileMetricAnalysis:      { in: ['video', 'video'],        out: ['metrics'] },
  x264RemoteTranscode:     { in: [],                        out: ['video'] },
  RemoteFileMetricAnalysis:{ in: [],                        out: ['metrics'] },
  SceneCut:                { in: ['video'],                 out: ['scenecut'] },
  RemoteSceneCut:          { in: [],                        out: ['scenecut'] },
  TransnetV2SceneCut:      { in: ['video'],                 out: ['scenecut'] },
  SegmentMedia:            { in: ['video'],                 out: ['scenecut'] },
  RemoteSegmentMedia:      { in: [],                        out: ['scenecut'] },
  GenerateReport:          { in: ['any'],                   out: ['report'] },
  FragmentedMP4Repackage:  { in: ['video'],                 out: ['video'] },
  FetchWorkflowDAG:        { in: [],                        out: ['any'] },
  SceneCutDispatch:        { in: ['scenecut'],              out: [] },
  CompositeWorkflow:       { in: ['any'],                   out: ['any'] },
};

// PORT_INPUT_NAMES overrides the per-port label text for nodes with named input semantics.
const PORT_INPUT_NAMES = {
  FileMetricAnalysis: ['ref', 'dist'],
};

// addPortLabels injects type-colored label spans directly into Drawflow's port dot elements.
// Labels appear above the dot (position: absolute; bottom: 100%) so they float near the pad.
// Call after nodeCreated and after importDAG (with a tick delay for DOM settlement).
function addPortLabels(nodeId) {
  if (!editor) return;
  const dfData = editor.drawflow?.drawflow?.Home?.data;
  if (!dfData || !dfData[nodeId]) return;
  const nodeType = dfData[nodeId].name;
  const spec = NODE_PORT_SPECS[nodeType] || { in: [], out: [] };
  const nodeEl = document.querySelector(`#node-${nodeId}`);
  if (!nodeEl) return;

  // Remove stale labels to prevent duplication on re-import.
  nodeEl.querySelectorAll('.port-dot-label').forEach(el => el.remove());

  const inLabels = PORT_INPUT_NAMES[nodeType] || spec.in;

  nodeEl.querySelectorAll('.inputs .input').forEach((dot, i) => {
    const type = spec.in[i];
    if (!type) return;
    const p = PORT_TYPES[type] || PORT_TYPES.any;
    const span = document.createElement('span');
    span.className = 'port-dot-label';
    span.textContent = inLabels[i] || p.label;
    span.style.setProperty('--pc', p.color);
    dot.appendChild(span);
  });

  nodeEl.querySelectorAll('.outputs .output').forEach((dot, i) => {
    const type = spec.out[i];
    if (!type) return;
    const p = PORT_TYPES[type] || PORT_TYPES.any;
    const span = document.createElement('span');
    span.className = 'port-dot-label';
    span.textContent = p.label;
    span.style.setProperty('--pc', p.color);
    dot.appendChild(span);
  });
}

const LOCAL_NODE_TYPES = new Set([
  'x264Transcode', 'FileMetricAnalysis', 'SceneCut', 'TransnetV2SceneCut',
  'SegmentMedia', 'ResourceDownload', 'ResourceUpload',
  'GenerateReport', 'FragmentedMP4Repackage'
]);

const nodeTemplates = {
  // --- Storage ---
  ResourceDownload: {
    inputs: 0, outputs: 1,
    html: `<div class="wf-node"><p><strong>Resource Download</strong></p>
      <label>Resource <select df-resource_id class="wf-select"></select></label></div>`
  },
  ResourceUpload: {
    inputs: 1, outputs: 0,
    html: `<div class="wf-node"><p><strong>Resource Upload</strong></p>
      <label>Name <input type="text" df-output_name value="output.mp4" class="wf-input"></label></div>`
  },

  // --- Local Processing ---
  x264Transcode: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>x264 Transcode</strong></p>
      <label>CRF <input type="number" df-crf value="23" min="0" max="51" class="wf-input"></label>
      <label>Preset <select df-preset class="wf-select">
        <option>ultrafast</option><option>superfast</option><option>veryfast</option>
        <option>faster</option><option>fast</option><option selected>medium</option>
        <option>slow</option><option>slower</option><option>veryslow</option>
      </select></label>
      <label>GOP <input type="number" df-gop_length value="250" class="wf-input"></label>
      <label>Tune <select df-tune class="wf-select"><option value="">None</option><option>film</option><option>animation</option><option>grain</option><option>psnr</option><option>ssim</option></select></label>
      <label>Profile <select df-profile class="wf-select"><option selected>high</option><option>main</option><option>baseline</option></select></label>
      <label>Start Time <input type="text" df-start_time value="" class="wf-input" placeholder="HH:MM:SS.mmm"></label>
      <label>End Time <input type="text" df-end_time value="" class="wf-input" placeholder="HH:MM:SS.mmm"></label>
      <label>Width <input type="number" df-scale_width value="" class="wf-input" placeholder="e.g. 1920"></label>
      <label>Height <input type="number" df-scale_height value="" class="wf-input" placeholder="e.g. 1080"></label>
      <label>Scale <select df-scale_method class="wf-select"><option value="">None</option><option value="lanczos">Lanczos</option><option value="bilinear">Bilinear</option><option value="bicubic">Bicubic</option></select></label></div>`
  },
  FileMetricAnalysis: {
    inputs: 2, outputs: 1,
    html: `<div class="wf-node"><p><strong>File Metric Analysis</strong></p>
      <label><input type="checkbox" df-vmaf checked> VMAF</label>
      <label><input type="checkbox" df-ssim checked> SSIM</label>
      <label><input type="checkbox" df-psnr checked> PSNR</label>
      <label>Resize Algo <select df-scale_method class="wf-select">
        <option value="bicubic" selected>Bicubic (default)</option>
        <option value="bilinear">Bilinear</option>
        <option value="fast_bilinear">Fast Bilinear</option>
        <option value="lanczos">Lanczos</option>
        <option value="sinc">Sinc</option>
        <option value="spline">Spline</option>
        <option value="area">Area (best for downscale)</option>
        <option value="neighbor">Nearest Neighbor</option>
        <option value="gauss">Gaussian</option>
      </select></label></div>`
  },

  // --- Remote Processing ---
  x264RemoteTranscode: {
    inputs: 0, outputs: 1,
    html: `<div class="wf-node"><p><strong>x264 Remote Transcode</strong></p>
      <label>Resource <select df-resource_id class="wf-select"></select></label>
      <label>Output Name <input type="text" df-output_name value="encoded.mp4" class="wf-input"></label>
      <label>CRF <input type="number" df-crf value="23" min="0" max="51" class="wf-input"></label>
      <label>Bitrate (kbps) <input type="number" df-bitrate_kbps value="" class="wf-input" placeholder="Leave empty for CRF"></label>
      <label>Preset <select df-preset class="wf-select">
        <option>ultrafast</option><option>superfast</option><option>veryfast</option>
        <option>faster</option><option>fast</option><option selected>medium</option>
        <option>slow</option><option>slower</option><option>veryslow</option><option>placebo</option>
      </select></label>
      <label>GOP <input type="number" df-gop_length value="250" class="wf-input"></label>
      <label>Tune <select df-tune class="wf-select"><option value="">None</option><option>film</option><option>animation</option><option>grain</option><option>psnr</option><option>ssim</option></select></label>
      <label>Profile <select df-profile class="wf-select"><option selected>high</option><option>main</option><option>baseline</option></select></label>
      <label>Width <input type="number" df-scale_width value="" class="wf-input" placeholder="e.g. 1920"></label>
      <label>Height <input type="number" df-scale_height value="" class="wf-input" placeholder="e.g. 1080"></label>
      <label>Scale <select df-scale_method class="wf-select"><option value="">None</option><option value="lanczos">Lanczos</option><option value="bilinear">Bilinear</option></select></label>
      <label>Start <input type="text" df-start_time value="" class="wf-input" placeholder="HH:MM:SS.mmm"></label>
      <label>End <input type="text" df-end_time value="" class="wf-input" placeholder="HH:MM:SS.mmm"></label></div>`
  },
  RemoteFileMetricAnalysis: {
    inputs: 0, outputs: 1,
    html: `<div class="wf-node"><p><strong>Remote Metric Analysis</strong></p>
      <label>Reference <select df-reference_resource_id class="wf-select"></select></label>
      <label>Distorted <select df-distorted_resource_id class="wf-select"></select></label>
      <label><input type="checkbox" df-vmaf checked> VMAF</label>
      <label><input type="checkbox" df-ssim checked> SSIM</label>
      <label><input type="checkbox" df-psnr checked> PSNR</label>
      <label>Resize Algo <select df-scale_method class="wf-select">
        <option value="bicubic" selected>Bicubic (default)</option>
        <option value="bilinear">Bilinear</option>
        <option value="fast_bilinear">Fast Bilinear</option>
        <option value="lanczos">Lanczos</option>
        <option value="sinc">Sinc</option>
        <option value="spline">Spline</option>
        <option value="area">Area (best for downscale)</option>
        <option value="neighbor">Nearest Neighbor</option>
        <option value="gauss">Gaussian</option>
      </select></label>
      <label>Output Name <input type="text" df-output_name value="metrics.json" class="wf-input"></label></div>`
  },

  // --- Scene Detection ---
  SceneCut: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>Scene Cut</strong></p>
      <label>Threshold <input type="number" df-threshold value="0.3" min="0" max="1" step="0.05" class="wf-input"></label></div>`
  },
  RemoteSceneCut: {
    inputs: 0, outputs: 1,
    html: `<div class="wf-node"><p><strong>Remote Scene Cut (TransNet V2)</strong></p>
      <label>Resource <select df-resource_id class="wf-select"></select></label>
      <label>Threshold <input type="range" df-threshold value="0.5" min="0" max="1" step="0.01" class="wf-input" oninput="this.nextElementSibling.textContent=this.value"><span>0.5</span></label>
      <details class="wf-details"><summary>Frame Dimensions</summary>
        <label>Width <input type="number" df-frame_width value="48" min="1" class="wf-input" placeholder="48"></label>
        <label>Height <input type="number" df-frame_height value="27" min="1" class="wf-input" placeholder="27"></label>
        <small class="wf-hint">TransNet V2 default: 48×27. Change only for custom/fine-tuned models.</small>
      </details></div>`
  },
  // TransnetV2SceneCut kept for import compatibility; not shown in palette.
  TransnetV2SceneCut: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>TransNet V2 Scene Cut</strong></p>
      <label>Threshold <input type="range" df-threshold value="0.5" min="0" max="1" step="0.01" class="wf-input" oninput="this.nextElementSibling.textContent=this.value"><span>0.5</span></label>
      <details class="wf-details"><summary>Frame Dimensions</summary>
        <label>Width <input type="number" df-frame_width value="48" min="1" class="wf-input" placeholder="48"></label>
        <label>Height <input type="number" df-frame_height value="27" min="1" class="wf-input" placeholder="27"></label>
        <small class="wf-hint">TransNet V2 default: 48×27. Change only for custom/fine-tuned models.</small>
      </details></div>`
  },

  // --- Segmentation ---
  SegmentMedia: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>Segment Media</strong></p>
      <label>Duration (s) <input type="number" df-segment_duration value="10" min="1" class="wf-input"></label></div>`
  },
  RemoteSegmentMedia: {
    inputs: 0, outputs: 1,
    html: `<div class="wf-node"><p><strong>Remote Segment Media</strong></p>
      <label>Resource <select df-resource_id class="wf-select"></select></label>
      <label>Duration (s) <input type="number" df-segment_duration value="10" min="1" class="wf-input"></label></div>`
  },

  // --- Orchestration ---
  SceneCutDispatch: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>SceneCut Dispatch</strong></p>
      <label>Workflow <select df-workflow_ref class="wf-select wf-workflow-select"></select></label>
      <label>Source URI <input type="text" df-source_uri value="" class="wf-input" placeholder="From upstream"></label>
      <label>Batch Size <input type="number" df-batch_size value="16" min="1" class="wf-input"></label></div>`
  },
  CompositeWorkflow: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>Composite Workflow</strong></p>
      <label>Workflow <select df-workflow_ref class="wf-select wf-workflow-select"></select></label></div>`
  },

  // --- Utility ---
  GenerateReport: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>Generate Report</strong></p></div>`
  },
  FragmentedMP4Repackage: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>fMP4 Repackage</strong></p></div>`
  },
};

const nodeDefaults = {
  ResourceDownload: { resource_id: '' },
  ResourceUpload: { output_name: 'output.mp4' },
  x264Transcode: { crf: '23', preset: 'medium', gop_length: '250', profile: 'high' },
  FileMetricAnalysis: { vmaf: 'true', ssim: 'true', psnr: 'true', scale_method: 'bicubic' },
  x264RemoteTranscode: { crf: '23', preset: 'medium', gop_length: '250', profile: 'high', output_name: 'encoded.mp4' },
  RemoteFileMetricAnalysis: { vmaf: 'true', ssim: 'true', psnr: 'true', scale_method: 'bicubic', output_name: 'metrics.json' },
  SceneCut: { threshold: '0.3' },
  RemoteSceneCut: { threshold: '0.3' },
  TransnetV2SceneCut: { threshold: '0.5' },
  SegmentMedia: { segment_duration: '10' },
  RemoteSegmentMedia: { segment_duration: '10' },
  SceneCutDispatch: { batch_size: '16' },
  CompositeWorkflow: {},
  GenerateReport: {},
  FragmentedMP4Repackage: {},
};

export function initDrawflow(container) {
  if (editor) return;
  editor = new Drawflow(container);
  editor.reroute = true;
  editor.start();

  editor.on('nodeCreated', (id) => {
    applySessionGroupStyling(id);
    // Defer one tick so Drawflow finishes injecting the port dot elements.
    setTimeout(() => addPortLabels(id), 0);
  });
}

export function addNode(type) {
  if (!editor || !nodeTemplates[type]) return;
  const tmpl = nodeTemplates[type];
  const pos = { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 };
  const nodeId = editor.addNode(type, tmpl.inputs, tmpl.outputs, pos.x, pos.y, type.toLowerCase(), {}, tmpl.html);

  if (LOCAL_NODE_TYPES.has(type)) {
    assignDefaultSessionGroup(nodeId);
  }

  return nodeId;
}

function assignDefaultSessionGroup(nodeId) {
  const dfData = editor.drawflow?.drawflow?.Home?.data;
  if (!dfData || !dfData[nodeId]) return;
  if (!dfData[nodeId].data) dfData[nodeId].data = {};
  if (!dfData[nodeId].data._session_group) {
    dfData[nodeId].data._session_group = 'session-0';
  }
  applySessionGroupStyling(nodeId);
}

function applySessionGroupStyling(nodeId) {
  const dfData = editor.drawflow?.drawflow?.Home?.data;
  if (!dfData || !dfData[nodeId]) return;
  const group = dfData[nodeId]?.data?._session_group;
  if (!group) return;

  const idx = parseInt(group.replace('session-', ''), 10) || 0;
  const color = SESSION_COLORS[idx % SESSION_COLORS.length];
  const el = document.querySelector(`#node-${nodeId}`);
  if (el) {
    el.style.borderColor = color;
    el.style.borderWidth = '2px';
    el.style.borderStyle = 'dashed';
  }
}

export function exportDAG(name, projectId) {
  if (!editor) return null;
  const raw = editor.export();
  const homeData = raw?.drawflow?.Home?.data || {};

  const nodes = {};
  const sessionGroupMap = {};

  for (const [id, node] of Object.entries(homeData)) {
    const outputs = [];
    for (const port of Object.values(node.outputs || {})) {
      for (const conn of (port.connections || [])) {
        if (!outputs.includes(conn.node)) outputs.push(conn.node);
      }
    }
    const inputs = [];
    for (const port of Object.values(node.inputs || {})) {
      for (const conn of (port.connections || [])) {
        if (!inputs.includes(conn.node)) inputs.push(conn.node);
      }
    }

    const defaults = nodeDefaults[node.name] || {};
    const cleanData = {};
    let sessionGroup = '';
    let workflowRef = '';
    const inputMap = {};

    for (const [k, v] of Object.entries(node.data || {})) {
      if (k === '_session_group') {
        sessionGroup = v;
        continue;
      }
      if (k === 'workflow_ref') {
        workflowRef = v;
        continue;
      }
      if (k.startsWith('_inputmap_')) {
        const globalKey = k.replace('_inputmap_', '');
        if (v) inputMap[globalKey] = v;
        continue;
      }
      if (v !== '' && v !== undefined && v !== null) cleanData[k] = String(v);
    }
    const params = { ...defaults, ...cleanData, project_id: projectId };

    const spec = NODE_PORT_SPECS[node.name] || { in: [], out: [] };
    const inputTypes  = Object.fromEntries(spec.in.map((t, i) => [String(i), t]));
    const outputTypes = Object.fromEntries(spec.out.map((t, i) => [String(i), t]));

    const dagNode = {
      id: String(id),
      type: node.name,
      params,
      inputs,
      outputs,
      ...(Object.keys(inputTypes).length  > 0 ? { input_types: inputTypes }  : {}),
      ...(Object.keys(outputTypes).length > 0 ? { output_types: outputTypes } : {}),
    };

    if (sessionGroup) {
      dagNode.session_group = sessionGroup;
      if (!sessionGroupMap[sessionGroup]) {
        sessionGroupMap[sessionGroup] = { id: sessionGroup, label: sessionGroup, nodes: [] };
      }
      sessionGroupMap[sessionGroup].nodes.push(String(id));
    }
    if (workflowRef) dagNode.workflow_ref = workflowRef;
    if (Object.keys(inputMap).length > 0) dagNode.input_map = inputMap;

    nodes[String(id)] = dagNode;
  }

  const dag = { version: "2.0", name: name || "Untitled", nodes };
  if (Object.keys(sessionGroupMap).length > 0) {
    dag.session_groups = sessionGroupMap;
  }
  return dag;
}

export function importDAG(dagJson) {
  if (!editor) return;
  try {
    if (dagJson?.drawflow) {
      editor.import(dagJson);
      return;
    }

    editor.clear();
    const nodes = dagJson?.nodes || {};
    const posMap = {};
    let x = 80, y = 80;

    for (const [id, node] of Object.entries(nodes)) {
      const tmpl = nodeTemplates[node.type];
      if (!tmpl) continue;
      const params = { ...(node.params || {}) };
      if (node.session_group) params._session_group = node.session_group;
      if (node.workflow_ref) params.workflow_ref = node.workflow_ref;
      if (node.input_map) {
        for (const [gk, lk] of Object.entries(node.input_map)) {
          params['_inputmap_' + gk] = lk;
        }
      }

      const nodeId = editor.addNode(
        node.type, tmpl.inputs, tmpl.outputs,
        x, y, node.type.toLowerCase(), params, tmpl.html
      );
      posMap[id] = nodeId;

      const nodeEl = document.querySelector(`#node-${nodeId}`);
      if (nodeEl) {
        for (const [key, val] of Object.entries(params)) {
          if (key.startsWith('_')) continue;
          const input = nodeEl.querySelector(`[df-${key}]`);
          if (input && val !== undefined && val !== null) {
            input.value = val;
            editor.drawflow.drawflow.Home.data[nodeId].data[key] = val;
          }
        }
      }

      applySessionGroupStyling(nodeId);

      x += 280;
      if (x > 800) { x = 80; y += 220; }
    }

    for (const [id, node] of Object.entries(nodes)) {
      const srcId = posMap[id];
      if (!srcId) continue;
      for (const outId of (node.outputs || [])) {
        const dstId = posMap[outId];
        if (dstId) {
          try { editor.addConnection(srcId, dstId, 'output_1', 'input_1'); } catch (e) {}
        }
      }
    }
    // Add port labels to all imported nodes after DOM settles.
    setTimeout(() => {
      const dfData = editor.drawflow?.drawflow?.Home?.data || {};
      for (const nodeId of Object.keys(dfData)) {
        addPortLabels(parseInt(nodeId));
      }
    }, 50);
  } catch (e) {
    console.error('Failed to import DAG:', e);
  }
}

export function clearEditor() {
  if (editor) editor.clear();
  currentWorkflowId = null;
  currentWorkflowName = null;
  sessionGroupCounter = 0;
}

export function setWorkflowId(id) { currentWorkflowId = id; }
export function getWorkflowId() { return currentWorkflowId; }
export function setWorkflowName(name) { currentWorkflowName = name; }
export function getWorkflowName() { return currentWorkflowName; }
export function getNodeTypes() { return Object.keys(nodeTemplates); }

export function populateResourceDropdowns(resources) {
  const opts = resources.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  document.querySelectorAll('select[df-resource_id], select[df-reference_resource_id], select[df-distorted_resource_id]').forEach(sel => {
    const current = sel.value;
    sel.innerHTML = '<option value="">Select resource...</option>' + opts;
    if (current) sel.value = current;
  });
}

export function populateWorkflowDropdowns(workflows) {
  const opts = workflows.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  document.querySelectorAll('select.wf-workflow-select').forEach(sel => {
    const current = sel.value;
    sel.innerHTML = '<option value="">Select workflow...</option>' + opts;
    if (current) sel.value = current;
  });
}

// restoreSelectValues re-applies saved data-model values to all select elements after
// populateResourceDropdowns has repopulated the options. Uses the editor's data model as
// the source of truth; the dagJson argument is accepted but not required.
export function restoreSelectValues(_dagJson) {
  if (!editor) return;
  const dfData = editor.drawflow?.drawflow?.Home?.data || {};
  for (const [nodeId, dfNode] of Object.entries(dfData)) {
    const el = document.querySelector(`#node-${nodeId}`);
    if (!el) continue;
    for (const [key, val] of Object.entries(dfNode.data || {})) {
      if (!val || key.startsWith('_')) continue;
      const input = el.querySelector(`[df-${key}]`);
      if (input && input.tagName === 'SELECT') {
        input.value = val;
      }
    }
  }
}

export function getSessionColors() { return SESSION_COLORS; }
export function getLocalNodeTypes() { return LOCAL_NODE_TYPES; }

// zoomReset forces Drawflow to recalculate and repaint its canvas.
// Call this after showing a previously-hidden panel that contains the editor.
export function zoomReset() {
  if (!editor) return;
  editor.zoom_reset();
  window.dispatchEvent(new Event('resize'));
}
