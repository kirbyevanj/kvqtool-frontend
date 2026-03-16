import { initDrawflow, saveWorkflow as saveWf } from './drawflow-nodes.js';
import { loadMedia } from './player.js';
import { stepFrame, toggleMode } from './frame-stepper.js';
import { loadReport } from './charts.js';
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

window.onResourceClick = function(id, type) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  switch (type) {
    case 'media': playResource(id); break;
    case 'report': viewReport(id); break;
    case 'workflow': break;
  }
};

window.toggleResMenu = function(id) {
  document.querySelectorAll('.res-menu').forEach(m => {
    if (m.id !== 'res-menu-' + id) m.style.display = 'none';
  });
  const menu = document.getElementById('res-menu-' + id);
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
};

window.viewReport = function(id) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  loadReport(id, projectId);
};

window.deleteResource = async function(id) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  if (!confirm('Delete this resource?')) return;
  await fetch(`/v1/projects/${projectId}/resources/${id}`, { method: 'DELETE' });
  loadSidebar();
};

window.renameResource = async function(id) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  const name = prompt('New name:');
  if (!name) return;
  await fetch(`/v1/projects/${projectId}/resources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  loadSidebar();
};

window.openWorkflow = function(id) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  showPanel('editor');
};

window.triggerUpload = function() {
  document.getElementById('add-dropdown').style.display = 'none';
  document.getElementById('file-upload-input').click();
};

window.handleFileUpload = async function(input) {
  if (!input.files.length || !projectId) return;
  for (const file of input.files) {
    await uploadToS3(projectId, file);
  }
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

document.addEventListener('click', () => {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
});

document.addEventListener('DOMContentLoaded', init);

export { projectId };
