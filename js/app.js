import * as vap from './video-analysis-player.js';
import * as wfb from './workflow-builder.js';
import { uploadToS3 } from './upload.js';
import { connectJobWS } from './ws-progress.js';

let projectId = null;
let pendingFiles = [];
let pendingSwitchId = null;
let pendingSwitchName = null;

window.vapTogglePlay = () => vap.togglePlay();
window.vapSeek = (val) => vap.seek(val);
window.vapStepFrame = (dir) => vap.stepFrame(dir);
window.vapToggleFrameMode = () => vap.toggleFrameMode();
window.vapToggleSplit = () => vap.toggleSplit();
window.vapToggleFullscreen = () => vap.toggleFullscreen();
window.vapToggleControls = () => vap.toggleControls();
window.vapSetLeft = (id) => vap.setLeft(id);
window.vapSetRight = (id) => vap.setRight(id);
window.vapRemoveFromPool = (id) => vap.removeFromPool(id);
window.vapSetOffset = (id, val) => vap.setFrameOffset(id, val);
window.vapBumpOffset = (id, dir) => vap.bumpFrameOffset(id, dir);
window.vapViewportClick = (e) => {
  if (e.target.closest('.vap-divider')) return;
  vap.viewportClick();
};

window.onResourceClick = function(id, type) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  if (type !== 'media') return;

  const row = document.querySelector(`.resource-item[data-id="${id}"]`);
  const label = row?.querySelector('.res-label')?.textContent?.trim() || '';

  if (vap.isPlayerActive()) {
    pendingSwitchId = id;
    pendingSwitchName = label;
    document.getElementById('confirm-switch-dialog').showModal();
  } else {
    vap.setCurrentName(label);
    vap.loadMedia(id, projectId);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirm-switch-btn')?.addEventListener('click', () => {
    document.getElementById('confirm-switch-dialog').close();
    if (pendingSwitchId) {
      vap.setCurrentName(pendingSwitchName || '');
      vap.loadMedia(pendingSwitchId, projectId);
      pendingSwitchId = null;
      pendingSwitchName = null;
    }
  });
});

window.toggleResMenu = function(id, event) {
  document.querySelectorAll('.res-menu').forEach(m => {
    if (m.id !== 'res-menu-' + id) m.style.display = 'none';
  });
  const menu = document.getElementById('res-menu-' + id);
  if (!menu) return;
  const show = menu.style.display === 'none';
  menu.style.display = show ? 'block' : 'none';
};

window.addToCompare = function(id, name) {
  vap.addToPool(id, name, projectId);
  showView('player');
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

window.showView = showView;
function showView(view) {
  const player = document.getElementById('video-analysis-player');
  const workflow = document.getElementById('panel-workflow');
  const empty = document.getElementById('panel-empty');

  player.style.display = 'none';
  workflow.style.display = 'none';
  empty.style.display = 'none';

  switch (view) {
    case 'player':
      if (vap.isPlayerActive()) {
        player.style.display = 'flex';
      } else {
        empty.style.display = 'block';
      }
      break;
    case 'workflow':
      workflow.style.display = 'flex';
      break;
    default:
      empty.style.display = 'block';
  }
}

window.onNodeDragStart = function(event, nodeType) {
  event.dataTransfer.setData('application/x-kvq-node', nodeType);
  event.dataTransfer.effectAllowed = 'copy';
};

window.deleteWorkflow = async function(id, name) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  if (!confirm('Delete workflow "' + name + '"?')) return;
  const resp = await fetch('/v1/projects/' + projectId + '/workflows/' + id, { method: 'DELETE' });
  if (!resp.ok) {
    const err = await resp.text();
    alert('Delete failed: ' + err);
  }
  loadSidebar();

  };

window.editWorkflow = function(id) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  toggleWorkflowPanel();
  loadSelectedWorkflow(id);
};

window.copyWorkflow = async function(id) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  const resp = await fetch('/v1/projects/' + projectId + '/workflows/' + id);
  if (!resp.ok) return;
  const wf = await resp.json();
  const copyResp = await fetch('/v1/projects/' + projectId + '/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name + ' (copy)', dag_json: wf.dag_json }),
  });
  if (copyResp.ok) loadSidebar();
};

window.toggleWfMenu = function(id) {
  document.querySelectorAll('.res-menu').forEach(m => {
    if (m.id !== 'wf-menu-' + id) m.style.display = 'none';
  });
  const menu = document.getElementById('wf-menu-' + id);
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
};
window.refreshSidebar = function() { loadSidebar(); };

window.downloadResource = async function(id) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  const resp = await fetch(`/v1/projects/${projectId}/resources/${id}/download-url`);
  if (!resp.ok) return;
  const data = await resp.json();
  window.open(data.download_url, '_blank');
};

window.copyResource = async function(id, name) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  const resp = await fetch(`/v1/projects/${projectId}/resources/${id}/copy`, { method: 'POST' });
  if (resp.ok) loadSidebar();
  else alert('Copy failed');
};

window.downloadWorkflow = async function(id) {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
  const resp = await fetch(`/v1/projects/${projectId}/workflows/${id}`);
  if (!resp.ok) return;
  const wf = await resp.json();
  const blob = new Blob([JSON.stringify(wf.dag_json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (wf.name || 'workflow') + '.json';
  a.click();
  URL.revokeObjectURL(url);
};

window.onResDragStart = function(event, resourceId, name) {
  event.dataTransfer.setData('application/x-kvq-resource', JSON.stringify({ id: resourceId, name: name }));
  event.dataTransfer.effectAllowed = 'copy';
};

window.toggleWorkflowPanel = function() {
  const panel = document.getElementById('panel-workflow');
  if (panel.style.display === 'none' || panel.style.display === '') {
    showView('workflow');
    setTimeout(async () => {
      const container = document.getElementById('drawflow-container');
      wfb.initDrawflow(container);
      container.addEventListener('contextmenu', showNodeMenu);
      container.addEventListener('click', () => {
        document.getElementById('wf-node-menu').style.display = 'none';
      });
      container.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('application/x-kvq-node')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      });
      container.addEventListener('drop', async (e) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('application/x-kvq-node');
        if (nodeType) {
          wfb.addNode(nodeType);
          await refreshResourceDropdowns();
        }
      });
      await refreshResourceDropdowns();
    }, 50);
    loadWorkflowList();
  } else {
    showView('player');
  }
};

window.addWorkflowNode = async function(type) {
  wfb.addNode(type);
  document.getElementById('wf-node-menu').style.display = 'none';
  await refreshResourceDropdowns();
};

window.showNodeMenu = function(e) {
  e.preventDefault();
  const menu = document.getElementById('wf-node-menu');
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.style.display = 'block';
};

window.newWorkflow = function() {
  wfb.clearEditor();
  const container = document.getElementById('drawflow-container');
  wfb.initDrawflow(container);
};

window.saveWorkflow = async function() {
  const name = prompt('Workflow name:');
  if (!name) return;
  await refreshResourceDropdowns();
  const dag = wfb.exportDAG(name, projectId);
  if (!dag) return;

  const wfId = wfb.getWorkflowId();
  const method = wfId ? 'PUT' : 'POST';
  const url = wfId
    ? `/v1/projects/${projectId}/workflows/${wfId}`
    : `/v1/projects/${projectId}/workflows`;

  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, dag_json: dag }),
  });
  if (resp.ok) {
    const data = await resp.json();
    wfb.setWorkflowId(data.id);
    loadWorkflowList();
    document.getElementById('job-progress').textContent = 'Workflow saved';
    setTimeout(loadSidebar, 1000);
  }
};

window.runWorkflow = async function() {
  const wfId = wfb.getWorkflowId();
  if (!wfId) { alert('Save workflow first'); return; }

  const resp = await fetch(`/v1/projects/${projectId}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow_id: wfId }),
  });
  if (resp.ok) {
    const data = await resp.json();
    document.getElementById('job-progress').textContent = `Workflow started: ${data.run_id || data.job_id}`;
  } else {
    const err = await resp.json();
    document.getElementById('job-progress').textContent = `Error: ${err.error || 'Unknown'}`;
  }
};

window.loadSelectedWorkflow = async function(wfId) {
  if (!wfId) return;
  const resp = await fetch(`/v1/projects/${projectId}/workflows/${wfId}`);
  if (!resp.ok) return;
  const wf = await resp.json();
  wfb.setWorkflowId(wf.id);
  if (wf.dag_json) wfb.importDAG(wf.dag_json);
  await refreshResourceDropdowns();
  if (wf.dag_json) wfb.restoreSelectValues(wf.dag_json);
};

async function refreshResourceDropdowns() {
  try {
    const resp = await fetch(`/v1/projects/${projectId}/resources`);
    if (resp.ok) {
      const resources = await resp.json();
      wfb.populateResourceDropdowns(resources || []);
    }
  } catch (e) {}
}

async function loadWorkflowList() {
  const resp = await fetch(`/v1/projects/${projectId}/workflows`);
  if (!resp.ok) return;
  const workflows = await resp.json();
  const sel = document.getElementById('wf-load-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Load Workflow --</option>' +
    (workflows || []).map(w => `<option value="${w.id}">${w.name}</option>`).join('');
}

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
  }
  pendingFiles = [];
  progress.textContent = 'Upload complete';
  loadSidebar();

  };

function loadSidebar() {
  if (!projectId) return;
  htmx.ajax('GET', `/htmx/projects/${projectId}/sidebar`, '#folder-tree');
  htmx.ajax('GET', `/htmx/projects/${projectId}/workflows-list`, '#workflow-list');
}

function initPoolDropZone() {
  const pool = document.getElementById('vap-pool');
  const viewport = document.getElementById('video-analysis-player');
  if (!pool || !viewport) return;
  for (const el of [pool, viewport]) {
    el.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/x-kvq-resource')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        pool.classList.add('vap-pool-dragover');
      }
    });
    el.addEventListener('dragleave', () => { pool.classList.remove('vap-pool-dragover'); });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      pool.classList.remove('vap-pool-dragover');
      const raw = e.dataTransfer.getData('application/x-kvq-resource');
      if (!raw) return;
      const { id, name } = JSON.parse(raw);
      vap.addToPool(id, name, projectId);
      pool.style.display = 'block';
    });
  }
}

function initResizeHandle() {
  const handle = document.getElementById('vap-resize');
  if (!handle) return;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const viewport = document.querySelector('.vap-viewport');
    const startY = e.clientY;
    const startH = viewport.offsetHeight;
    const onMove = (ev) => {
      const h = Math.max(100, startH + (ev.clientY - startY));
      viewport.style.height = h + 'px';
      viewport.style.flex = 'none';
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
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

    setInterval(loadSidebar, 60000);
  initPoolDropZone();
  vap.init(projectId);
  initResizeHandle();
  document.getElementById('add-resource-btn')?.addEventListener('click', () => {
    const dd = document.getElementById('add-dropdown');
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
  });
}

document.addEventListener('click', () => {
  document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'none');
});

document.addEventListener('DOMContentLoaded', init);
