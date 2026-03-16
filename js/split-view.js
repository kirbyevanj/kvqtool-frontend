let comparisonPool = [];
let leftVideoId = null;
let rightVideoId = null;
let splitPosition = 0.5;
let frameOffsets = {};
let splitActive = false;
let currentProjectId = null;

export function isSplitActive() { return splitActive; }
export function getSplitPosition() { return splitPosition; }

export function initSplitView(projectId) {
  currentProjectId = projectId;
  const divider = document.getElementById('split-divider');
  if (!divider) return;
  attachDragListeners(divider);
}

export async function addToPool(resourceId, name, projectId) {
  if (comparisonPool.find(v => v.resourceId === resourceId)) return;

  const pid = projectId || currentProjectId;
  const resp = await fetch(`/v1/projects/${pid}/resources/${resourceId}/download-url`);
  if (!resp.ok) return;
  const data = await resp.json();

  comparisonPool.push({ resourceId, name, url: data.download_url });
  frameOffsets[resourceId] = 0;
  updatePoolUI();
}

export function removeFromPool(resourceId) {
  comparisonPool = comparisonPool.filter(v => v.resourceId !== resourceId);
  delete frameOffsets[resourceId];
  if (leftVideoId === resourceId) leftVideoId = null;
  if (rightVideoId === resourceId) rightVideoId = null;
  updatePoolUI();
}

export function toggleSplit() {
  splitActive = !splitActive;
  const pool = document.getElementById('comparison-pool');
  const compare = document.getElementById('compare-video');
  const divider = document.getElementById('split-divider');
  const primary = document.getElementById('shaka-video');
  const btn = document.getElementById('toggle-split-btn');

  if (splitActive) {
    pool.style.display = 'block';
    compare.style.display = 'block';
    divider.style.display = 'block';
    applySplitClip(primary, splitPosition);
    divider.style.left = `${splitPosition * 100}%`;
    btn.textContent = 'Exit Split View';
  } else {
    pool.style.display = 'none';
    compare.style.display = 'none';
    divider.style.display = 'none';
    primary.style.clipPath = 'none';
    btn.textContent = 'Split View';
  }
}

export function setLeftVideo(resourceId) {
  const entry = comparisonPool.find(v => v.resourceId === resourceId);
  if (!entry) return;
  leftVideoId = resourceId;
  const video = document.getElementById('shaka-video');
  video.src = entry.url;
  video.load();
  syncFromLeft();
}

export function setRightVideo(resourceId) {
  const entry = comparisonPool.find(v => v.resourceId === resourceId);
  if (!entry) return;
  rightVideoId = resourceId;
  const video = document.getElementById('compare-video');
  video.src = entry.url;
  video.load();
  syncFromLeft();
}

export function setFrameOffset(resourceId, offset) {
  frameOffsets[resourceId] = parseInt(offset, 10) || 0;
  syncFromLeft();
  updateOffsetUI();
}

export function getFrameOffset(videoId) {
  return frameOffsets[videoId] || 0;
}

export function getRightVideo() {
  return document.getElementById('compare-video');
}

export function drawSplitFrame(canvas, leftVideo, rightVideo, pos) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const splitX = Math.round(w * pos);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, splitX, h);
  ctx.clip();
  ctx.drawImage(leftVideo, 0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(splitX, 0, w - splitX, h);
  ctx.clip();
  ctx.drawImage(rightVideo, 0, 0, w, h);
  ctx.restore();

  ctx.fillStyle = 'var(--accent, #22C55E)';
  ctx.fillRect(splitX - 1, 0, 3, h);
}

export function destroySplitView() {
  splitActive = false;
  comparisonPool = [];
  leftVideoId = null;
  rightVideoId = null;
  frameOffsets = {};
  const compare = document.getElementById('compare-video');
  const divider = document.getElementById('split-divider');
  const pool = document.getElementById('comparison-pool');
  if (compare) { compare.src = ''; compare.style.display = 'none'; }
  if (divider) divider.style.display = 'none';
  if (pool) pool.style.display = 'none';
}

function attachDragListeners(divider) {
  divider.addEventListener('pointerdown', (e) => {
    divider.setPointerCapture(e.pointerId);
    const container = divider.parentElement;

    const onMove = (ev) => {
      const rect = container.getBoundingClientRect();
      splitPosition = (ev.clientX - rect.left) / rect.width;
      splitPosition = Math.max(0.05, Math.min(0.95, splitPosition));
      const primary = document.getElementById('shaka-video');
      applySplitClip(primary, splitPosition);
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

function applySplitClip(video, pos) {
  video.style.clipPath = `inset(0 ${(1 - pos) * 100}% 0 0)`;
}

function syncFromLeft() {
  const left = document.getElementById('shaka-video');
  const right = document.getElementById('compare-video');
  if (!left || !right || !splitActive) return;

  const fps = 30;
  const rightOffset = rightVideoId ? (frameOffsets[rightVideoId] || 0) : 0;
  const offsetSec = rightOffset / fps;

  left.addEventListener('play', () => { right.play(); });
  left.addEventListener('pause', () => { right.pause(); });
  left.addEventListener('seeked', () => {
    right.currentTime = Math.max(0, left.currentTime + offsetSec);
  });

  if (left.currentTime > 0) {
    right.currentTime = Math.max(0, left.currentTime + offsetSec);
  }
}

function updatePoolUI() {
  const container = document.getElementById('pool-items');
  const leftSel = document.getElementById('left-select');
  const rightSel = document.getElementById('right-select');
  if (!container || !leftSel || !rightSel) return;

  container.innerHTML = comparisonPool.map(v =>
    `<div class="pool-item">
      <span>${v.name}</span>
      <button class="btn btn-sm btn-danger" onclick="window.removeFromPool('${v.resourceId}')">x</button>
    </div>`
  ).join('');

  const optionsHTML = comparisonPool.map(v =>
    `<option value="${v.resourceId}">${v.name}</option>`
  ).join('');

  leftSel.innerHTML = '<option value="">-- Left --</option>' + optionsHTML;
  rightSel.innerHTML = '<option value="">-- Right --</option>' + optionsHTML;

  if (leftVideoId) leftSel.value = leftVideoId;
  if (rightVideoId) rightSel.value = rightVideoId;

  updateOffsetUI();
}

function updateOffsetUI() {
  const container = document.getElementById('offset-controls');
  if (!container) return;

  container.innerHTML = comparisonPool.map(v =>
    `<div class="offset-row">
      <label>${v.name}</label>
      <input type="number" value="${frameOffsets[v.resourceId] || 0}"
        onchange="window.setSplitFrameOffset('${v.resourceId}', this.value)" class="offset-input">
      <span class="offset-label">frames</span>
    </div>`
  ).join('');
}
