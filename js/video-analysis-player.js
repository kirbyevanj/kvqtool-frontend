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
let syncLoopId = null;
let primaryResourceId = null; // the first video opened, cannot be removed from pool

export function init(projectId) {
  currentProjectId = projectId;
  const divider = document.getElementById('vap-divider');
  if (divider) attachDragListeners(divider);

  document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('vap-fullscreen-btn');
    if (!document.fullscreenElement) btn.classList.remove('vap-btn-active');
    else btn.classList.add('vap-btn-active');
  });
}

export function isPlayerActive() {
  return leftBackend !== null;
}

export async function loadMedia(resourceId, projectId) {
  const pid = projectId || currentProjectId;
  const resp = await fetch(`/v1/projects/${pid}/resources/${resourceId}/download-url`);
  if (!resp.ok) return;
  const data = await resp.json();

  // Preserve timestamp if reloading same video
  const prevTime = leftBackend ? leftBackend.getCurrentTime() : 0;

  // Reset split state for new primary media
  if (splitActive) closeSplit();
  comparisonPool = [];
  frameOffsets = {};
  leftVideoId = null;
  rightVideoId = null;
  primaryResourceId = resourceId;

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

  // Add to pool as primary
  const name = currentResourceName || 'media';
  ensureInPool(resourceId, name, data.download_url);
  leftVideoId = resourceId;
  updatePoolUI();
}

export function togglePlay() {
  if (!leftBackend) return;
  const v = leftBackend.getVideoElement();
  const t = leftBackend.getCurrentTime();
  if (v.paused) { leftBackend.play(); syncRight('play', t); }
  else { leftBackend.pause(); syncRight('pause', t); }
  document.getElementById('vap-play-btn').textContent = v.paused ? 'Play' : 'Pause';
}

export function viewportClick() {
  togglePlay();
}

export function seek(val) {
  if (!leftBackend) return;
  const time = val / 1000;
  const lv = leftBackend.getVideoElement();
  const wasPlaying = !lv.paused;

  if (wasPlaying) leftBackend.pause();

  leftBackend.seek(time);
  updateTimecodeFromTime(time);

  if (splitActive && rightBackend) {
    const rv = rightBackend.getVideoElement();
    if (wasPlaying) rightBackend.pause();
    const offset = (frameOffsets[rightVideoId] || 0) / fps;
    rv.currentTime = Math.max(0, time + offset);

    if (wasPlaying) {
      waitForBothSeeked(lv, rv, () => {
        leftBackend.play();
        rv.play().catch(() => {});
        startFrameSync();
      });
    } else if (frameMode) {
      waitForBothSeeked(lv, rv, () => renderFrameToCanvas());
    }
  } else if (wasPlaying) {
    lv.addEventListener('seeked', () => leftBackend.play(), { once: true });
  } else if (frameMode) {
    lv.addEventListener('seeked', () => renderFrameToCanvas(), { once: true });
  }
}

export function stepFrame(dir) {
  if (!leftBackend) return;
  const t = leftBackend.getCurrentTime();
  const dur = leftBackend.getDuration();
  if (!dur) return;
  const newTime = Math.max(0, Math.min(dur, t + dir / fps));
  leftBackend.seek(newTime);
  currentFrame = Math.round(newTime * fps);
  document.getElementById('vap-frame-counter').textContent = `Frame: ${currentFrame}`;
  updateTimecodeFromTime(newTime);
  syncRight('seek', newTime);
  if (frameMode) {
    const v = leftBackend.getVideoElement();
    v.addEventListener('seeked', () => renderFrameToCanvas(), { once: true });
  }
}

export function toggleFrameMode() {
  frameMode = !frameMode;
  if (!leftBackend) return;
  const v = leftBackend.getVideoElement();
  const canvas = document.getElementById('vap-canvas');
  const btn = document.getElementById('vap-framestep-btn');

  // Preserve current time across mode toggle
  const currentTime = leftBackend.getCurrentTime();

  if (frameMode) {
    leftBackend.pause();
    syncRight('pause');
    canvas.style.display = 'block';
    canvas.width = v.videoWidth || 1920;
    canvas.height = v.videoHeight || 1080;
    // Ensure time hasn't changed
    leftBackend.seek(currentTime);
    v.addEventListener('seeked', () => renderFrameToCanvas(), { once: true });
    btn.classList.add('vap-btn-active');
  } else {
    canvas.style.display = 'none';
    // Restore time
    leftBackend.seek(currentTime);
    btn.classList.remove('vap-btn-active');
  }
}

export function toggleSplit() {
  if (splitActive) {
    closeSplit();
  } else {
    openSplit();
  }
}

function openSplit() {
  splitActive = true;
  const pool = document.getElementById('vap-pool');
  const compare = rightVideoEl();
  const divider = document.getElementById('vap-divider');
  const btn = document.getElementById('vap-split-btn');

  // Preserve timestamp
  const currentTime = leftBackend ? leftBackend.getCurrentTime() : 0;

  // Ensure current media in pool
  if (currentResourceId && leftBackend) {
    const v = leftBackend.getVideoElement();
    ensureInPool(currentResourceId, currentResourceName || 'media', v.src);
    leftVideoId = currentResourceId;
  }

  pool.style.display = 'block';
  compare.style.display = 'block';
  divider.style.display = 'block';
  compare.style.clipPath = `inset(0 0 0 ${splitPosition * 100}%)`;
  divider.style.left = `${splitPosition * 100}%`;
  btn.classList.add('vap-btn-active');

  // Restore timestamp
  if (leftBackend) leftBackend.seek(currentTime);

  // If right side empty and pool has >1 item, auto-fill right
  if (!rightVideoId && comparisonPool.length > 1) {
    const other = comparisonPool.find(v => v.resourceId !== leftVideoId);
    if (other) setRight(other.resourceId);
  }

  // Sync right to same timestamp
  if (rightBackend) {
    const offset = (frameOffsets[rightVideoId] || 0) / fps;
    rightBackend.seek(Math.max(0, currentTime + offset));
  }

  updatePoolUI();
}

function closeSplit() {
  splitActive = false;
  stopSyncLoop();
  const pool = document.getElementById('vap-pool');
  const compare = rightVideoEl();
  const divider = document.getElementById('vap-divider');
  const btn = document.getElementById('vap-split-btn');

  // Preserve timestamp
  const currentTime = leftBackend ? leftBackend.getCurrentTime() : 0;

  pool.style.display = 'none';
  compare.style.display = 'none';
  divider.style.display = 'none';
  compare.style.clipPath = 'none';
  btn.classList.remove('vap-btn-active');

  // Restore timestamp
  if (leftBackend) leftBackend.seek(currentTime);
}

export function toggleFullscreen() {
  const el = document.getElementById('video-analysis-player');
  const btn = document.getElementById('vap-fullscreen-btn');
  if (document.fullscreenElement) {
    document.exitFullscreen();
    btn.classList.remove('vap-btn-active');
  } else {
    el.requestFullscreen();
    btn.classList.add('vap-btn-active');
  }
}

export function toggleControls() {
  controlsVisible = !controlsVisible;
  const controls = document.getElementById('vap-controls');
  const nub = document.getElementById('vap-controls-nub');
  controls.style.display = controlsVisible ? 'block' : 'none';
  nub.style.display = controlsVisible ? 'none' : 'block';
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
  const cleanName = stripEmoji(stripUUIDPrefix(name));
  comparisonPool.push({ resourceId, name: cleanName, url: data.download_url });
  frameOffsets[resourceId] = 0;
  updatePoolUI();

  // Auto-open split and auto-fill right if not set
  if (!splitActive) openSplit();
  if (!rightVideoId && resourceId !== leftVideoId) {
    setRight(resourceId);
  }
}

export function removeFromPool(resourceId) {
  if (resourceId === primaryResourceId) return; // cannot remove primary
  comparisonPool = comparisonPool.filter(v => v.resourceId !== resourceId);
  delete frameOffsets[resourceId];
  if (rightVideoId === resourceId) {
    rightVideoId = null;
    if (rightBackend) { rightBackend.destroy(); rightBackend = null; }
  }
  updatePoolUI();
}

export function setLeft(resourceId) {
  const entry = comparisonPool.find(v => v.resourceId === resourceId);
  if (!entry) return;
  leftVideoId = resourceId;
  const currentTime = leftBackend ? leftBackend.getCurrentTime() : 0;
  const v = leftVideoEl();
  if (leftBackend) leftBackend.destroy();
  leftBackend = createBackend(entry.url, v);
  leftBackend.load(entry.url);
  v.dataset.resourceId = resourceId;
  v.addEventListener('loadeddata', () => {
    leftBackend.seek(currentTime);
    v.addEventListener('seeked', () => {
      if (frameMode) renderFrameToCanvas();
    }, { once: true });
  }, { once: true });
}

export function setRight(resourceId) {
  const entry = comparisonPool.find(v => v.resourceId === resourceId);
  if (!entry) return;
  rightVideoId = resourceId;
  const v = rightVideoEl();
  if (rightBackend) rightBackend.destroy();
  rightBackend = createBackend(entry.url, v);
  rightBackend.load(entry.url);
  // Sync to left timestamp
  const offset = (frameOffsets[resourceId] || 0) / fps;
  const leftTime = leftBackend ? leftBackend.getCurrentTime() : 0;
  v.addEventListener('loadeddata', () => {
    rightBackend.seek(Math.max(0, leftTime + offset));
    v.addEventListener('seeked', () => {
      if (frameMode) renderFrameToCanvas();
    }, { once: true });
  }, { once: true });
  updatePoolUI();
}

export function setFrameOffset(resourceId, offset) {
  const val = Math.max(0, parseInt(offset, 10) || 0);
  const oldVal = frameOffsets[resourceId] || 0;
  frameOffsets[resourceId] = val;
  // Actively seek the right video to reflect the offset change
  if (rightVideoId === resourceId && rightBackend && leftBackend) {
    rightBackend.seek(Math.max(0, leftBackend.getCurrentTime() + val / fps));
  }
  updatePoolUI();
}

export function bumpFrameOffset(resourceId, dir) {
  const current = frameOffsets[resourceId] || 0;
  setFrameOffset(resourceId, Math.max(0, current + dir));
}

export function setCurrentName(name) {
  currentResourceName = stripEmoji(stripUUIDPrefix(name));
}

export function isSplitActive() { return splitActive; }

function ensureInPool(resourceId, name, url) {
  if (comparisonPool.find(p => p.resourceId === resourceId)) return;
  const cleanName = stripEmoji(stripUUIDPrefix(name));
  comparisonPool.push({ resourceId, name: cleanName, url });
  frameOffsets[resourceId] = 0;
}

function stripEmoji(name) {
  return name.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '').trim();
}

function stripUUIDPrefix(name) {
  const d = name.indexOf('-');
  if (d > 30) return name.substring(d + 1);
  return name;
}

function leftVideoEl() { return document.getElementById('vap-video-left'); }
function rightVideoEl() { return document.getElementById('vap-video-right'); }

function waitForBothSeeked(videoA, videoB, callback) {
  let aReady = false;
  let bReady = false;
  const check = () => { if (aReady && bReady) callback(); };

  if (videoA.readyState >= 2 && !videoA.seeking) {
    aReady = true;
  } else {
    videoA.addEventListener('seeked', () => { aReady = true; check(); }, { once: true });
  }

  if (videoB.readyState >= 2 && !videoB.seeking) {
    bReady = true;
  } else {
    videoB.addEventListener('seeked', () => { bReady = true; check(); }, { once: true });
  }

  check();
}

function syncRight(action, explicitTime) {
  if (!splitActive || !rightBackend) return;
  const rv = rightBackend.getVideoElement();
  const offset = (frameOffsets[rightVideoId] || 0) / fps;
  const baseTime = explicitTime !== undefined ? explicitTime : leftBackend.getVideoElement().currentTime;
  const target = Math.max(0, baseTime + offset);

  switch (action) {
    case 'play': {
      const lv = leftBackend.getVideoElement();
      rv.currentTime = target;
      waitForBothSeeked(lv, rv, () => {
        rv.play().catch(() => {});
      });
      startFrameSync();
      break;
    }
    case 'pause':
      rv.pause();
      rv.playbackRate = 1.0;
      stopFrameSync();
      break;
    case 'seek':
      rv.currentTime = target;
      break;
  }
}

function startFrameSync() {
  stopFrameSync();
  const lv = leftBackend.getVideoElement();

  if ('requestVideoFrameCallback' in lv) {
    const onFrame = (now, metadata) => {
      if (!splitActive || !rightBackend || !leftBackend) return;
      if (lv.paused) { rightBackend.getVideoElement().playbackRate = 1.0; return; }

      const rv = rightBackend.getVideoElement();
      const offset = (frameOffsets[rightVideoId] || 0) / fps;
      const leftTime = metadata.mediaTime;
      const target = leftTime + offset;
      const drift = rv.currentTime - target;

      if (Math.abs(drift) > 0.5) {
        rv.currentTime = target;
        rv.playbackRate = 1.0;
      } else if (Math.abs(drift) > 0.02) {
        rv.playbackRate = drift > 0 ? 0.97 : 1.03;
      } else {
        rv.playbackRate = 1.0;
      }

      syncLoopId = lv.requestVideoFrameCallback(onFrame);
    };
    syncLoopId = lv.requestVideoFrameCallback(onFrame);
  } else {
    const tick = () => {
      if (!splitActive || !rightBackend || !leftBackend) return;
      const lv2 = leftBackend.getVideoElement();
      const rv = rightBackend.getVideoElement();
      if (lv2.paused) { rv.playbackRate = 1.0; return; }

      const offset = (frameOffsets[rightVideoId] || 0) / fps;
      const target = leftBackend.getCurrentTime() + offset;
      const drift = rv.currentTime - target;

      if (Math.abs(drift) > 0.5) {
        rv.currentTime = target;
        rv.playbackRate = 1.0;
      } else if (Math.abs(drift) > 0.02) {
        rv.playbackRate = drift > 0 ? 0.97 : 1.03;
      } else {
        rv.playbackRate = 1.0;
      }

      syncLoopId = requestAnimationFrame(tick);
    };
    syncLoopId = requestAnimationFrame(tick);
  }
}

function stopFrameSync() {
  syncLoopId = null;
}

function updateFrame() {
  if (!leftBackend) return;
  currentFrame = Math.round(leftBackend.getCurrentTime() * fps);
  document.getElementById('vap-frame-counter').textContent = `Frame: ${currentFrame}`;
}

function updateTimecode() {
  if (!leftBackend) return;
  updateTimecodeFromTime(leftBackend.getCurrentTime());
}

function updateTimecodeFromTime(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const f = Math.round((t % 1) * fps);
  document.getElementById('vap-timecode').textContent =
    `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
  document.getElementById('vap-seekbar').value = Math.floor(t * 1000);
  currentFrame = Math.round(t * fps);
  document.getElementById('vap-frame-counter').textContent = `Frame: ${currentFrame}`;
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
      rightVideoEl().style.clipPath = `inset(0 0 0 ${splitPosition * 100}%)`;
      divider.style.left = `${splitPosition * 100}%`;
      if (frameMode) renderFrameToCanvas();
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

  container.innerHTML = comparisonPool.map(v => {
    const isPrimary = v.resourceId === primaryResourceId;
    const removeBtn = isPrimary ? '' :
      `<button class="btn btn-sm btn-danger" onclick="window.vapRemoveFromPool('${v.resourceId}')">x</button>`;
    return `<div class="pool-item"><span>${v.name}</span>${removeBtn}</div>`;
  }).join('');

  const opts = comparisonPool.map(v => `<option value="${v.resourceId}">${v.name}</option>`).join('');
  leftSel.innerHTML = '<option value="">-- Left --</option>' + opts;
  rightSel.innerHTML = '<option value="">-- Right --</option>' + opts;
  if (leftVideoId) leftSel.value = leftVideoId;
  if (rightVideoId) rightSel.value = rightVideoId;

  document.getElementById('vap-offset-controls').innerHTML = comparisonPool.map(v =>
    `<div class="offset-row">
      <label>${v.name}</label>
      <button class="vap-btn" onclick="window.vapBumpOffset('${v.resourceId}',-1)">-</button>
      <input type="number" value="${frameOffsets[v.resourceId]||0}" min="0"
        onchange="window.vapSetOffset('${v.resourceId}',this.value)" class="offset-input">
      <button class="vap-btn" onclick="window.vapBumpOffset('${v.resourceId}',1)">+</button>
      <span class="offset-label">frames</span>
    </div>`
  ).join('');
}
