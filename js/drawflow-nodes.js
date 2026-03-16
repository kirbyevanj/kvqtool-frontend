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
};

export function initDrawflow(container) {
  editor = new Drawflow(container);
  editor.reroute = true;
  editor.start();

  let x = 50, y = 50;
  for (const [name, html] of Object.entries(nodeTemplates)) {
    const inputs = name === 'MetricAnalysis' ? 2 : (name === 'FileSource' ? 0 : 1);
    const outputs = name === 'FileOutput' ? 0 : 1;
    editor.addNode(name, inputs, outputs, x, y, name.toLowerCase(), {}, html);
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
