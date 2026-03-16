let frameMode = false;
let currentFrame = 0;
let fps = 30;

export function toggleMode() {
  frameMode = !frameMode;
  const video = document.getElementById('shaka-video');
  const canvas = document.getElementById('frame-canvas');
  const btn = document.getElementById('toggle-framemode');

  if (frameMode) {
    video.pause();
    video.style.display = 'none';
    canvas.style.display = 'block';
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    drawCurrentFrame(video, canvas);
    btn.textContent = 'Streaming Mode';
  } else {
    canvas.style.display = 'none';
    video.style.display = 'block';
    btn.textContent = 'Frame Step Mode';
  }
}

export function stepFrame(direction) {
  const video = document.getElementById('shaka-video');
  if (!video.duration) return;

  const frameDuration = 1 / fps;
  video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + direction * frameDuration));
  currentFrame = Math.round(video.currentTime * fps);

  document.getElementById('frame-counter').textContent = `Frame: ${currentFrame}`;

  if (frameMode) {
    const canvas = document.getElementById('frame-canvas');
    video.onseeked = () => drawCurrentFrame(video, canvas);
  }

  updateMetricOverlay(currentFrame);
}

function drawCurrentFrame(video, canvas) {
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
}

function updateMetricOverlay(frame) {
  const overlay = document.getElementById('metric-overlay');
  if (!window._reportData) {
    overlay.textContent = '';
    return;
  }

  const parts = [];
  for (const [metric, data] of Object.entries(window._reportData)) {
    if (metric === 'header') continue;
    const distData = data['0'];
    if (distData && distData[String(frame)] !== undefined) {
      parts.push(`${metric.toUpperCase()}: ${Number(distData[String(frame)]).toFixed(2)}`);
    }
  }
  overlay.textContent = parts.join(' | ');
}

export function setFPS(newFps) { fps = newFps; }
export function getCurrentFrame() { return currentFrame; }
