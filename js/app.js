import { initDrawflow, saveWorkflow as saveWf } from './drawflow-nodes.js';
import { initPlayer } from './player.js';
import { stepFrame, toggleMode } from './frame-stepper.js';
import { renderChart } from './charts.js';
import { connectJobWS } from './ws-progress.js';
import { uploadToS3 } from './upload.js';

let projectId = null;

window.showPanel = function(name) {
  document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
  const el = document.getElementById('panel-' + name);
  if (el) el.style.display = 'block';
};

window.saveWorkflow = function() { saveWf(projectId); };
window.frameStep = function(dir) { stepFrame(dir); };
window.toggleFrameMode = function() { toggleMode(); };

window.triggerUpload = function() {
  document.getElementById('add-dropdown').style.display = 'none';
  document.getElementById('file-upload-input').click();
};

window.handleFileUpload = async function(input) {
  if (!input.files.length || !projectId) return;
  await uploadToS3(projectId, input.files[0]);
  loadSidebar();
  input.value = '';
};

function loadSidebar() {
  if (!projectId) return;
  htmx.ajax('GET', `/htmx/projects/${projectId}/sidebar`, '#folder-tree');
}

function init() {
  const params = new URLSearchParams(window.location.search);
  projectId = params.get('project');

  if (!projectId) return;

  const nameEl = document.getElementById('project-name');
  if (nameEl) {
    fetch(`/v1/projects/${projectId}`)
      .then(r => r.json())
      .then(p => { nameEl.textContent = p.name; });
  }

  loadSidebar();

  const editorEl = document.getElementById('drawflow-container');
  if (editorEl) initDrawflow(editorEl);

  document.getElementById('add-resource-btn')?.addEventListener('click', () => {
    const dd = document.getElementById('add-dropdown');
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', init);

export { projectId };
