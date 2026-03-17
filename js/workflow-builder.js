let editor = null;
let currentWorkflowId = null;

const nodeTemplates = {
  ResourceDownload: {
    inputs: 0, outputs: 1,
    html: `<div class="wf-node"><p><strong>Resource Download</strong></p>
      <label>Resource <select df-resource_id class="wf-select"></select></label></div>`
  },
  GStreamerEncode: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>x264 Encode</strong></p>
      <label>CRF <input type="number" df-crf value="23" min="0" max="51" class="wf-input"></label>
      <label>Preset <select df-preset class="wf-select">
        <option>ultrafast</option><option>superfast</option><option>veryfast</option>
        <option>faster</option><option>fast</option><option selected>medium</option>
        <option>slow</option><option>slower</option><option>veryslow</option>
      </select></label>
      <label>GOP <input type="number" df-gop_length value="250" class="wf-input"></label></div>`
  },
  GStreamerMetrics: {
    inputs: 2, outputs: 1,
    html: `<div class="wf-node"><p><strong>Metrics Analysis</strong></p>
      <label><input type="checkbox" df-vmaf checked> VMAF</label>
      <label><input type="checkbox" df-ssim checked> SSIM</label>
      <label><input type="checkbox" df-psnr checked> PSNR</label></div>`
  },
  ResourceUpload: {
    inputs: 1, outputs: 0,
    html: `<div class="wf-node"><p><strong>Resource Upload</strong></p>
      <label>Name <input type="text" df-output_name value="output.mp4" class="wf-input"></label></div>`
  },
  SplitVideo: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>Split Video</strong></p>
      <label>Segment (s) <input type="number" df-segment_duration value="4" min="1" class="wf-input"></label></div>`
  },
  ConcatVideo: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>Concat Video</strong></p></div>`
  },
  GenerateReport: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>Generate Report</strong></p></div>`
  },
  RemoteEncodeX264: {
    inputs: 0, outputs: 0,
    html: `<div class="wf-node"><p><strong>Remote x264 Encode</strong></p>
      <label>Input Resource <select df-resource_id class="wf-select"></select></label>
      <label>Output Name <input type="text" df-output_name value="encoded.mp4" class="wf-input"></label>
      <label>CRF <input type="number" df-crf value="23" min="0" max="51" class="wf-input"></label>
      <label>Bitrate (kbps) <input type="number" df-bitrate_kbps value="" class="wf-input" placeholder="Leave empty for CRF"></label>
      <label>Preset <select df-preset class="wf-select">
        <option>ultrafast</option><option>superfast</option><option>veryfast</option>
        <option>faster</option><option>fast</option><option selected>medium</option>
        <option>slow</option><option>slower</option><option>veryslow</option><option>placebo</option>
      </select></label>
      <label>GOP Length <input type="number" df-gop_length value="250" class="wf-input"></label>
      <label>Tune <select df-tune class="wf-select">
        <option value="">None</option><option>film</option><option>animation</option>
        <option>grain</option><option>stillimage</option><option>psnr</option><option>ssim</option>
      </select></label>
      <label>Profile <select df-profile class="wf-select">
        <option selected>high</option><option>main</option><option>baseline</option>
      </select></label>
      <label>Output Width <input type="number" df-scale_width value="" class="wf-input" placeholder="e.g. 1920"></label>
      <label>Output Height <input type="number" df-scale_height value="" class="wf-input" placeholder="e.g. 1080"></label>
      <label>Scale Method <select df-scale_method class="wf-select">
        <option value="">None (keep original)</option>
        <option value="lanczos">Lanczos (sharp, best quality)</option>
        <option value="bilinear">Bilinear (fast)</option>
        <option value="bicubic">Bicubic (balanced)</option>
        <option value="nearest">Nearest Neighbor (pixel art)</option>
        <option value="sinc">Sinc (high quality)</option>
        <option value="spline">Spline (smooth)</option>
      </select></label>
      <label>Start Time <input type="text" df-start_time value="" class="wf-input" placeholder="e.g. 00:00:05"></label>
      <label>End Time <input type="text" df-end_time value="" class="wf-input" placeholder="e.g. 00:01:30"></label>
    </div>`
  },
  FragmentedMP4Repackage: {
    inputs: 1, outputs: 1,
    html: `<div class="wf-node"><p><strong>fMP4 Repackage</strong></p></div>`
  },
};

export function initDrawflow(container) {
  if (editor) return;
  editor = new Drawflow(container);
  editor.reroute = true;
  editor.start();
}

export function addNode(type) {
  if (!editor || !nodeTemplates[type]) return;
  const tmpl = nodeTemplates[type];
  const pos = { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 };
  editor.addNode(type, tmpl.inputs, tmpl.outputs, pos.x, pos.y, type.toLowerCase(), {}, tmpl.html);
}

const nodeDefaults = {
  ResourceDownload: { resource_id: '' },
  ResourceUpload: { output_name: 'output.mp4' },
  GStreamerEncode: { crf: '23', preset: 'medium', gop_length: '250' },
  GStreamerMetrics: { vmaf: 'true', ssim: 'true', psnr: 'true' },
  SplitVideo: { segment_duration: '4' },
  ConcatVideo: {},
  GenerateReport: {},
  RemoteEncodeX264: {
    inputs: 0, outputs: 0,
    html: `<div class="wf-node"><p><strong>Remote x264 Encode</strong></p>
      <label>Input Resource <select df-resource_id class="wf-select"></select></label>
      <label>Output Name <input type="text" df-output_name value="encoded.mp4" class="wf-input"></label>
      <label>CRF <input type="number" df-crf value="23" min="0" max="51" class="wf-input"></label>
      <label>Bitrate (kbps) <input type="number" df-bitrate_kbps value="" class="wf-input" placeholder="Leave empty for CRF"></label>
      <label>Preset <select df-preset class="wf-select">
        <option>ultrafast</option><option>superfast</option><option>veryfast</option>
        <option>faster</option><option>fast</option><option selected>medium</option>
        <option>slow</option><option>slower</option><option>veryslow</option><option>placebo</option>
      </select></label>
      <label>GOP Length <input type="number" df-gop_length value="250" class="wf-input"></label>
      <label>Tune <select df-tune class="wf-select">
        <option value="">None</option><option>film</option><option>animation</option>
        <option>grain</option><option>stillimage</option><option>psnr</option><option>ssim</option>
      </select></label>
      <label>Profile <select df-profile class="wf-select">
        <option selected>high</option><option>main</option><option>baseline</option>
      </select></label>
      <label>Output Width <input type="number" df-scale_width value="" class="wf-input" placeholder="e.g. 1920"></label>
      <label>Output Height <input type="number" df-scale_height value="" class="wf-input" placeholder="e.g. 1080"></label>
      <label>Scale Method <select df-scale_method class="wf-select">
        <option value="">None (keep original)</option>
        <option value="lanczos">Lanczos (sharp, best quality)</option>
        <option value="bilinear">Bilinear (fast)</option>
        <option value="bicubic">Bicubic (balanced)</option>
        <option value="nearest">Nearest Neighbor (pixel art)</option>
        <option value="sinc">Sinc (high quality)</option>
        <option value="spline">Spline (smooth)</option>
      </select></label>
      <label>Start Time <input type="text" df-start_time value="" class="wf-input" placeholder="e.g. 00:00:05"></label>
      <label>End Time <input type="text" df-end_time value="" class="wf-input" placeholder="e.g. 00:01:30"></label>
    </div>`
  },
  RemoteEncodeX264: { crf: '23', preset: 'medium', gop_length: '250', profile: 'high', output_name: 'encoded.mp4' },
  FragmentedMP4Repackage: {},
};

export function exportDAG(name, projectId) {
  if (!editor) return null;
  const raw = editor.export();
  const homeData = raw?.drawflow?.Home?.data || {};

  const nodes = {};
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
    for (const [k, v] of Object.entries(node.data || {})) {
      if (v !== '' && v !== undefined && v !== null) cleanData[k] = v;
    }
    const params = { ...defaults, ...cleanData, project_id: projectId };
    nodes[String(id)] = {
      id: String(id),
      type: node.name,
      params,
      inputs,
      outputs,
    };
  }

  return { version: "1.0", name: name || "Untitled", nodes };
}

export function importDAG(dagJson) {
  if (!editor) return;
  try {
    const drawflowData = dagJson?.drawflow || dagJson;
    editor.import({ drawflow: drawflowData });
  } catch (e) {
    console.error('Failed to import DAG:', e);
  }
}

export function clearEditor() {
  if (editor) editor.clear();
  currentWorkflowId = null;
}

export function setWorkflowId(id) { currentWorkflowId = id; }
export function getWorkflowId() { return currentWorkflowId; }
export function getNodeTypes() { return Object.keys(nodeTemplates); }


export function populateResourceDropdowns(resources) {
  const opts = resources.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  document.querySelectorAll('select[df-resource_id]').forEach(sel => {
    const current = sel.value;
    sel.innerHTML = '<option value="">Select resource...</option>' + opts;
    if (current) sel.value = current;
  });
}
