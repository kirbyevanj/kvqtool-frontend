import { createBackend } from './media-backend.js';

let fps = 30;
let currentFrame = 0;
let frameMode = false;
let splitActive = false;
let splitPosition = 0.5;
let comparisonPool = [];
let leftVideoId = null;
let rightVideoId = null;
let frameOffsets = {};
let controlsVisible = true;
let currentProjectId = null;
let currentResourceId = null;
let currentResourceName = null;
let leftBackend = null;
let rightBackend = null;

export function init(projectId) {
  currentProjectId = projectId;
  const divider = document.getElementById('vap-divider');
  if (divider) attachDragListeners(divider);
}

export async function loadMedia(resourceId, projectId) {
  const pid = projectId || currentProjectId;
  const resp = await fetch(`/v1/projects/${pid}/resources/${resourceId}/download-url`);
  if (!resp.ok) return;
  const data = await resp.json();

  currentResourceId = resourceId;
  const video = leftVideoEl();

  if (leftBackend) leftBackend.destroy();
  leftBackend = createBackend(data.download_url, video);
  leftBackend.load(data.download_url);

  video.dataset.resourceId = resourceId;
  document.getElementById('video-analysis-player').style.display = 'block';
  document.getElementById('panel-empty').style.display = 'none';

  video.removeEventListener('timeupdate', updateTimecode);
  video.addEventListener('timeupdate', updateTimecode);
  video.addEventListener('loadedmetadata', () => {
    const dur = leftBackend.getDuration();
    if (dur) document.getElementById('vap-seekbar').max = Math.floor(dur * 1000);
  }, { once: true });
}

export function togglePlay() {
  const b = leftBackend;
  if (!b) return;
  const v = b.getVideoElement();
  if (v.paused) { b.play(); syncRight('play'); }
  else { b.pause(); syncRight('pause'); }
  document.getElementById('vap-play-btn').textContent = v.paused ? 'Play' : 'Pause';
}

export function seek(val) {
  if (!leftBackend) return;
  leftBackend.seek(val / 1000);
  syncRight('seek');
  updateFrame();
}

export function stepFrame(dir) {
  if (!leftBackend) return;
  const t = leftBackend.getCurrentTime();
  const dur = leftBackend.getDuration();
  if (!dur) return;
  leftBackend.seek(Math.max(0, Math.min(dur, t + dir / fps)));
  currentFrame = Math.round(leftBackend.getCurrentTime() * fps);
  document.getElementById('vap-frame-counter').textContent = `Frame: ${currentFrame}`;
  syncRight('seek');
  if (frameMode) renderFrameToCanvas();
  updateTimecode();
}

export function toggleFrameMode() {
  frameMode = !frameMode;
  if (!leftBackend) return;
  const v = leftBackend.getVideoElement();
  const canvas = document.getElementById('vap-canvas');
  const btn = document.getElementById('vap-framestep-btn');

  if (frameMode) {
    leftBackend.pause();
    syncRight('pause');
    canvas.style.display = 'block';
    canvas.width = v.videoWidth || 1920;
    canvas.height = v.videoHeight || 1080;
    renderFrameToCanvas();
    btn.classList.add('vap-btn-active');
  } else {
    canvas.style.display = 'none';
    btn.classList.remove('vap-btn-active');
  }
}

export function toggleSplit() {
  splitActive = !splitActive;
  const pool = document.getElementById('vap-pool');
  const compare = rightVideoEl();
  const divider = document.getElementById('vap-divider');
  const primary = leftVideoEl();
  const btn = document.getElementById('vap-split-btn');

  if (splitActive) {
    ensureCurrentInPool();
    pool.style.display = 'block';
    compare.style.display = 'block';
    divider.style.display = 'block';
    primary.style.clipPath = `inset(0 ${(1 - splitPosition) * 100}% 0 0)`;
    divider.style.left = `${splitPosition * 100}%`;
    btn.classList.add('vap-btn-active');
  } else {
    pool.style.display = 'none';
    compare.style.display = 'none';
    divider.style.display = 'none';
    primary.style.clipPath = 'none';
    btn.classList.remove('vap-btn-active');
  }
}

export function toggleFullscreen() {
  const el = document.getElementById('video-analysis-player');
  if (document.fullscreenElement) document.exitFullscreen();
  else el.requestFullscreen();
}

export function toggleControls() {
  controlsVisible = !controlsVisible;
  document.getElementById('vap-controls').style.display = controlsVisible ? 'block' : 'none';
  if (!controlsVisible) {
    const pool = document.getElementById('vap-pool');
    if (pool) pool.style.display = 'none';
  }
}

export async function addToPool(resourceId, name, projectId) {
  if (comparisonPool.find(v => v.resourceId === resourceId)) return;
  const pid = projectId || currentProjectId;
  const resp = await fetch(`/v1/projects/${pid}/resources/${resourceId}/download-url`);
  if (!resp.ok) return;
  const data = await resp.json();
  const cleanName = stripUUIDPrefix(name);
  comparisonPool.push({ resourceId, name: cleanName, url: data.download_url });
  frameOffsets[resourceId] = 0;
  updatePoolUI();
}

export function removeFromPool(resourceId) {
  comparisonPool = comparisonPool.filter(v => v.resourceId !== resourceId);
  delete frameOffsets[resourceId];
  updatePoolUI();
}

export function setLeft(resourceId) {
  const entry = comparisonPool.find(v => v.resourceId === resourceId);
  if (!entry) return;
  leftVideoId = resourceId;
  const v = leftVideoEl();
  if (leftBackend) leftBackend.destroy();
  leftBackend = createBackend(entry.url, v);
  leftBackend.load(entry.url);
  v.dataset.resourceId = resourceId;
}

export function setRight(resourceId) {
  const entry = comparisonPool.find(v => v.resourceId === resourceId);
  if (!entry) return;
  rightVideoId = resourceId;
  const v = rightVideoEl();
  if (rightBackend) rightBackend.destroy();
  rightBackend = createBackend(entry.url, v);
  rightBackend.load(entry.url);
}

export function setFrameOffset(resourceId, offset) {
  frameOffsets[resourceId] = parseInt(offset, 10) || 0;
}

export function addCurrentToPool() {
  ensureCurrentInPool();
}

function ensureCurrentInPool() {
  if (!leftBackend || !currentProjectId || !currentResourceId) return;
  const v = leftBackend.getVideoElement();
  if (!v.src) return;
  const rid = currentResourceId;
  const name = currentResourceName || stripUUIDPrefix(decodeURIComponent(v.src.split('/').pop().split('?')[0] || 'current'));
  if (!comparisonPool.find(p => p.resourceId === rid)) {
    comparisonPool.push({ resourceId: rid, name, url: v.src });
    frameOffsets[rid] = 0;
  }
  leftVideoId = rid;
  updatePoolUI();
}

export function isSplitActive() { return splitActive; }
export function setCurrentName(name) { currentResourceName = stripUUIDPrefix(name); }

function stripUUIDPrefix(name) {
  const d = name.indexOf('-');
  if (d > 30) return name.substring(d + 1);
  return name;
}

function leftVideoEl() { return document.getElementById('vap-video-left'); }
function rightVideoEl() { return document.getElementById('vap-video-right'); }

function syncRight(action) {
  if (!splitActive || !rightBackend) return;
  const offset = (frameOffsets[rightVideoId] || 0) / fps;
  switch (action) {
    case 'play': rightBackend.play(); break;
    case 'pause': rightBackend.pause(); break;
    case 'seek': rightBackend.seek(Math.max(0, leftBackend.getCurrentTime() + offset)); break;
  }
}

function updateFrame() {
  if (!leftBackend) return;
  currentFrame = Math.round(leftBackend.getCurrentTime() * fps);
  document.getElementById('vap-frame-counter').textContent = `Frame: ${currentFrame}`;
}

function updateTimecode() {
  if (!leftBackend) return;
  const t = leftBackend.getCurrentTime();
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const f = Math.round((t % 1) * fps);
  document.getElementById('vap-timecode').textContent =
    `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
  document.getElementById('vap-seekbar').value = Math.floor(t * 1000);
  updateFrame();
}

function renderFrameToCanvas() {
  const canvas = document.getElementById('vap-canvas');
  const ctx = canvas.getContext('2d');
  const v = leftBackend.getVideoElement();

  if (splitActive && rightBackend) {
    const r = rightBackend.getVideoElement();
    const w = canvas.width, h = canvas.height;
    const sx = Math.round(w * splitPosition);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx, h); ctx.clip();
    ctx.drawImage(v, 0, 0, w, h); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(sx, 0, w - sx, h); ctx.clip();
    ctx.drawImage(r, 0, 0, w, h); ctx.restore();
    ctx.fillStyle = '#22C55E'; ctx.fillRect(sx - 1, 0, 3, h);
    return;
  }
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
}

function attachDragListeners(divider) {
  divider.addEventListener('pointerdown', (e) => {
    divider.setPointerCapture(e.pointerId);
    const container = divider.parentElement;
    const onMove = (ev) => {
      const rect = container.getBoundingClientRect();
      splitPosition = Math.max(0.05, Math.min(0.95, (ev.clientX - rect.left) / rect.width));
      leftVideoEl().style.clipPath = `inset(0 ${(1 - splitPosition) * 100}% 0 0)`;
      divider.style.left = `${splitPosition * 100}%`;
    };
    const onUp = () => {
      divider.removeEventListener('pointermove', onMove);
      divider.removeEventListener('pointerup', onUp);
    };
    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup', onUp);
  });
}

function updatePoolUI() {
  const container = document.getElementById('vap-pool-items');
  const leftSel = document.getElementById('vap-left-select');
  const rightSel = document.getElementById('vap-right-select');
  if (!container || !leftSel || !rightSel) return;

  container.innerHTML = comparisonPool.map(v =>
    `<div class="pool-item"><span>${v.name}</span>
     <button class="btn btn-sm btn-danger" onclick="window.vapRemoveFromPool('${v.resourceId}')">x</button></div>`
  ).join('');

  const opts = comparisonPool.map(v => `<option value="${v.resourceId}">${v.name}</option>`).join('');
  leftSel.innerHTML = '<option value="">-- Left --</option>' + opts;
  rightSel.innerHTML = '<option value="">-- Right --</option>' + opts;
  if (leftVideoId) leftSel.value = leftVideoId;
  if (rightVideoId) rightSel.value = rightVideoId;

  document.getElementById('vap-offset-controls').innerHTML = comparisonPool.map(v =>
    `<div class="offset-row"><label>${v.name}</label>
     <input type="number" value="${frameOffsets[v.resourceId]||0}"
       onchange="window.vapSetOffset('${v.resourceId}',this.value)" class="offset-input">
     <span class="offset-label">frames</span></div>`
  ).join('');
}
