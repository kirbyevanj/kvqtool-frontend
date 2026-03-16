import * as vap from './video-analysis-player.js';
import { uploadToS3 } from './upload.js';
import { connectJobWS } from './ws-progress.js';

let projectId = null;
let pendingFiles = [];

window.vapTogglePlay = () => vap.togglePlay();
window.vapSeek = (val) => vap.seek(val);
window.vapStepFrame = (dir) => vap.stepFrame(dir);
window.vapToggleFrameMode = () => vap.toggleFrameMode();
window.vapToggleSplit = () => vap.toggleSplit();
window.vapToggleFullscreen = () => vap.toggleFullscreen();
window.vapToggleControls = () => vap.toggleControls();
window.vapAddCurrentToPool = () => vap.addCurrentToPool();
window.vapSetLeft = (id) => vap.setLeft(id);
window.vapSetRight = (id) => vap.setRight(id);
window.vapRemoveFromPool = (id) => vap.removeFromPool(id);
window.vapSetOffset = (id, val) => vap.setFrameOffset(id, val);

window.onResourceClick = function(id, type) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  if (type === 'media') vap.loadMedia(id, projectId);
};

window.toggleResMenu = function(id) {
  document.querySelectorAll('.res-menu').forEach(m => {
    if (m.id !== 'res-menu-' + id) m.style.display = 'none';
  });
  const menu = document.getElementById('res-menu-' + id);
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
};

window.addToCompare = function(id, name) {
  vap.addToPool(id, name, projectId);
  document.getElementById('video-analysis-player').style.display = 'block';
  document.getElementById('panel-empty').style.display = 'none';
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

window.showPanel = function() {};

window.triggerUpload = function() {
  document.getElementById('add-dropdown').style.display = 'none';
  document.getElementById('file-upload-input').click();
};

window.handleFileSelect = function(input) {
  if (!input.files.length || !projectId) return;
  pendingFiles = Array.from(input.files);
  const list = document.getElementById('upload-file-list');
  list.innerHTML = pendingFiles.map(f =>
    `<div class="upload-file-entry">${f.name} <span class="upload-file-size">(${(f.size/1024/1024).toFixed(1)} MB)</span></div>`
  ).join('');
  document.getElementById('upload-dialog').showModal();
  input.value = '';
};

window.vapConfirmUpload = async function() {
  const repackage = document.getElementById('repackage-fmp4').checked;
  document.getElementById('upload-dialog').close();
  const progress = document.getElementById('job-progress');

  for (const file of pendingFiles) {
    progress.textContent = `Uploading ${file.name}...`;
    await uploadToS3(projectId, file);
    if (repackage) {
      progress.textContent = `Queuing fMP4 repackage for ${file.name}...`;
      // TODO: POST to repackage endpoint once worker supports it
    }
  }

  pendingFiles = [];
  progress.textContent = 'Upload complete';
  loadSidebar();
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
  vap.init(projectId);

  document.getElementById('add-resource-btn')?.addEventListener('click', () => {
    const dd = document.getElementById('add-dropdown');
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
  });
}

document.addEventListener('click', () => {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
});

document.addEventListener('DOMContentLoaded', init);
