let editor = null;

const nodeTemplates = {
  FileSource: `<div class="node-content">
    <p><strong>File Source</strong></p>
    <select df-resource_id class="node-select"><option value="">Select media...</option></select>
  </div>`,

  x264Encode: `<div class="node-content">
    <p><strong>x264 Encode</strong></p>
    <label>CRF <input type="number" df-crf value="23" min="0" max="51" class="node-input"></label>
    <label>Preset <select df-preset class="node-select">
      <option>ultrafast</option><option>superfast</option><option>veryfast</option>
      <option>faster</option><option>fast</option><option selected>medium</option>
      <option>slow</option><option>slower</option><option>veryslow</option>
    </select></label>
    <label>GOP <input type="number" df-gop_length value="250" class="node-input"></label>
  </div>`,

  MetricAnalysis: `<div class="node-content">
    <p><strong>Metric Analysis</strong></p>
    <label><input type="checkbox" df-vmaf checked> VMAF</label>
    <label><input type="checkbox" df-ssim checked> SSIM</label>
    <label><input type="checkbox" df-psnr checked> PSNR</label>
  </div>`,

  FileOutput: `<div class="node-content">
    <p><strong>File Output</strong></p>
    <label>Name <input type="text" df-output_name value="output.mp4" class="node-input"></label>
  </div>`,

  SceneCutAndEncode: `<div class="node-content">
    <p><strong>Scene Cut & Encode</strong></p>
    <label>Threshold <input type="number" df-threshold value="0.5" min="0" max="1" step="0.05" class="node-input"></label>
    <label>Min Segment (frames) <input type="number" df-min_seg_frames value="30" class="node-input"></label>
    <label>CRF <input type="number" df-crf value="23" min="0" max="51" class="node-input"></label>
    <label>Preset <select df-preset class="node-select">
      <option>ultrafast</option><option>superfast</option><option>veryfast</option>
      <option>faster</option><option>fast</option><option selected>medium</option>
      <option>slow</option><option>slower</option><option>veryslow</option>
    </select></label>
  </div>`,

  FixedCutAndEncode: `<div class="node-content">
    <p><strong>Fixed Cut & Encode</strong></p>
    <label>Segment Duration (s) <input type="number" df-segment_duration value="4" min="1" class="node-input"></label>
    <label>CRF <input type="number" df-crf value="23" min="0" max="51" class="node-input"></label>
    <label>Preset <select df-preset class="node-select">
      <option>ultrafast</option><option>superfast</option><option>veryfast</option>
      <option>faster</option><option>fast</option><option selected>medium</option>
      <option>slow</option><option>slower</option><option>veryslow</option>
    </select></label>
  </div>`,

  MetricOptimizer: `<div class="node-content">
    <p><strong>Metric Optimizer</strong></p>
    <label>Target Metric <select df-target_metric class="node-select">
      <option selected>vmaf</option><option>ssim</option><option>psnr</option>
    </select></label>
    <label>Target Value <input type="number" df-target_value value="93" class="node-input"></label>
    <label>Tolerance <input type="number" df-tolerance value="1" step="0.5" class="node-input"></label>
    <label>CRF Min <input type="number" df-search_min value="15" class="node-input"></label>
    <label>CRF Max <input type="number" df-search_max value="30" class="node-input"></label>
    <label>Preset <select df-preset class="node-select">
      <option>ultrafast</option><option>superfast</option><option>veryfast</option>
      <option>faster</option><option>fast</option><option selected>medium</option>
      <option>slow</option><option>slower</option><option>veryslow</option>
    </select></label>
  </div>`,
};

export function initDrawflow(container) {
  editor = new Drawflow(container);
  editor.reroute = true;
  editor.start();

  const nodeIO = {
    FileSource:         { inputs: 0, outputs: 1 },
    x264Encode:         { inputs: 1, outputs: 1 },
    MetricAnalysis:     { inputs: 2, outputs: 1 },
    FileOutput:         { inputs: 1, outputs: 0 },
    SceneCutAndEncode:  { inputs: 1, outputs: 1 },
    FixedCutAndEncode:  { inputs: 1, outputs: 1 },
    MetricOptimizer:    { inputs: 2, outputs: 1 },
  };

  let x = 50, y = 50;
  for (const [name, html] of Object.entries(nodeTemplates)) {
    const io = nodeIO[name] || { inputs: 1, outputs: 1 };
    editor.addNode(name, io.inputs, io.outputs, x, y, name.toLowerCase().replace(/&/g, ''), {}, html);
    x += 300;
    if (x > 900) { x = 50; y += 200; }
  }
}

export async function saveWorkflow(projectId) {
  if (!editor || !projectId) return;

  const dagJson = editor.export();
  const name = prompt('Workflow name:');
  if (!name) return;

  const resp = await fetch(`/v1/projects/${projectId}/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, dag_json: dagJson }),
  });

  if (resp.ok) {
    alert('Workflow saved');
  } else {
    const err = await resp.json();
    alert('Error: ' + (err.error || 'Unknown'));
  }
}

export function loadWorkflow(dagJson) {
  if (!editor) return;
  editor.import(dagJson);
}

export function getEditor() { return editor; }
