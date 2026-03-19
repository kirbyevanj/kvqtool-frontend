/**
 * metric-viewer.js — Metric report visualization panel.
 *
 * Provides an ECharts line chart (VMAF/SSIM/PSNR per-frame), a draggable
 * frame-seek marker, and a mini video player with full controls.
 */
import { createBackend } from './media-backend.js';

// --- Module state ---
let projectId = null;
let chartInstance = null;
/** @type {Map<string, {resourceId:string,name:string,color:string,header:object,vmaf?:number[][],ssim?:number[][],psnr?:number[][]}>} */
let loadedReports = new Map();
let currentFrame = 0;
let maxFrame = 0;
let playerBackend = null;
let playerFps = 24;
let playerFrameMode = false;
let playerControlsVisible = true;
let isDragging = false;

const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
let colorIdx = 0;

// ─── Exported API ────────────────────────────────────────────────────────────

export function init(projId) {
  projectId = projId;
  _initResize();
  _initPlayerDOMEvents();
}

/**
 * Fetch a metric report resource, parse it, add to the chart.
 * Returns true on success, false if the resource is not a valid MetricReports JSON.
 */
export async function loadReport(resourceId, resourceName) {
  const urlResp = await fetch(`/v1/projects/${projectId}/resources/${resourceId}/download-url`);
  if (!urlResp.ok) return false;
  const { download_url } = await urlResp.json();

  const dataResp = await fetch(download_url);
  if (!dataResp.ok) return false;

  let report;
  try {
    report = await dataResp.json();
  } catch {
    return false;
  }
  if (!report?.header) return false;

  const color = COLORS[colorIdx++ % COLORS.length];
  const parsed = _parseMetricData(report);
  const reportMax = _computeMaxFrame(parsed);
  maxFrame = Math.max(maxFrame, reportMax);

  loadedReports.set(resourceId, { resourceId, name: resourceName, color, header: report.header, ...parsed });

  _updateLegend();
  _renderChart();
  await _tryFindVideo(report.header);
  return true;
}

/** Remove a previously-loaded report from the chart. */
export function removeReport(resourceId) {
  loadedReports.delete(resourceId);
  if (loadedReports.size === 0) {
    maxFrame = 0;
    currentFrame = 0;
  } else {
    maxFrame = 0;
    for (const r of loadedReports.values()) {
      maxFrame = Math.max(maxFrame, _computeMaxFrame(r));
    }
  }
  _updateLegend();
  _renderChart();
}

/** Returns true if at least one report is loaded. */
export function isViewerActive() {
  return loadedReports.size > 0;
}

/**
 * Seek both the mini player and the chart marker to the given frame.
 * Called by the chart drag handler and by player timeupdate.
 */
export function setFrame(frame) {
  currentFrame = Math.max(0, Math.min(maxFrame, Math.round(frame)));
  const fc = document.getElementById('mrv-frame-counter');
  if (fc) fc.textContent = `Frame: ${currentFrame}`;

  if (playerBackend) {
    const t = currentFrame / playerFps;
    playerBackend.seek(t);
    _updatePlayerTimecode(t);
  }
  _updateChartMarker();
}

// ─── Player controls ─────────────────────────────────────────────────────────

export function playerTogglePlay() {
  if (!playerBackend) return;
  const v = playerBackend.getVideoElement();
  if (v.paused) {
    if (playerFrameMode) playerToggleFrameMode();
    playerBackend.play();
    const btn = document.getElementById('mrv-play-btn');
    if (btn) btn.textContent = 'Pause';
  } else {
    playerBackend.pause();
    const btn = document.getElementById('mrv-play-btn');
    if (btn) btn.textContent = 'Play';
  }
}

export function playerSeek(ms) {
  if (!playerBackend) return;
  const t = ms / 1000;
  playerBackend.seek(t);
  _updatePlayerTimecode(t);
  currentFrame = Math.round(t * playerFps);
  const fc = document.getElementById('mrv-frame-counter');
  if (fc) fc.textContent = `Frame: ${currentFrame}`;
  _updateChartMarker();
}

export function playerStepFrame(dir) {
  if (!playerBackend) return;
  if (!playerFrameMode) playerToggleFrameMode();
  const t = playerBackend.getCurrentTime();
  const dur = playerBackend.getDuration();
  if (!dur) return;
  const newTime = Math.max(0, Math.min(dur, t + dir / playerFps));
  playerBackend.seek(newTime);
  currentFrame = Math.round(newTime * playerFps);
  _updatePlayerTimecode(newTime);
  _updateChartMarker();
  const v = playerBackend.getVideoElement();
  v.addEventListener('seeked', () => _renderPlayerCanvas(), { once: true });
}

export function playerToggleFrameMode() {
  playerFrameMode = !playerFrameMode;
  const canvas = document.getElementById('mrv-canvas');
  const btn = document.getElementById('mrv-framestep-btn');
  if (!playerBackend) return;
  const v = playerBackend.getVideoElement();
  const t = playerBackend.getCurrentTime();
  if (playerFrameMode) {
    playerBackend.pause();
    const pb = document.getElementById('mrv-play-btn');
    if (pb) pb.textContent = 'Play';
    if (canvas) {
      canvas.style.display = 'block';
      canvas.width = v.videoWidth || 1920;
      canvas.height = v.videoHeight || 1080;
    }
    playerBackend.seek(t);
    v.addEventListener('seeked', () => _renderPlayerCanvas(), { once: true });
    if (btn) btn.classList.add('vap-btn-active');
  } else {
    if (canvas) canvas.style.display = 'none';
    playerBackend.seek(t);
    if (btn) btn.classList.remove('vap-btn-active');
  }
}

export function playerToggleControls() {
  playerControlsVisible = !playerControlsVisible;
  const controls = document.getElementById('mrv-controls');
  const nub = document.getElementById('mrv-controls-nub');
  if (controls) controls.style.display = playerControlsVisible ? 'block' : 'none';
  if (nub) nub.style.display = playerControlsVisible ? 'none' : 'block';
}

/** Load a video resource into the mini player by resource ID. */
export async function playerLoadResource(resourceId) {
  if (!resourceId || !projectId) return;
  const resp = await fetch(`/v1/projects/${projectId}/resources/${resourceId}/download-url`);
  if (!resp.ok) return;
  const { download_url } = await resp.json();

  const v = document.getElementById('mrv-video');
  if (!v) return;
  if (playerBackend) playerBackend.destroy();
  playerBackend = createBackend(download_url, v);
  playerBackend.load(download_url);

  v.addEventListener('loadedmetadata', () => {
    const seekbar = document.getElementById('mrv-seekbar');
    const dur = playerBackend.getDuration();
    if (seekbar && dur) seekbar.max = Math.floor(dur * 1000);
  }, { once: true });

  const label = document.getElementById('mrv-video-label');
  if (label) label.style.display = 'none';
  const pb = document.getElementById('mrv-play-btn');
  if (pb) pb.textContent = 'Play';
  playerFrameMode = false;
  const canvas = document.getElementById('mrv-canvas');
  if (canvas) canvas.style.display = 'none';
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Parse MetricReports JSON into per-metric sorted frame arrays: [[frameNum, value], ...]
 * Skips non-numeric keys (e.g. "mean", "average").
 */
function _parseMetricData(report) {
  const result = {};
  for (const metric of ['vmaf', 'ssim', 'psnr']) {
    if (!report[metric]) continue;
    const allFrames = [];
    for (const frames of Object.values(report[metric])) {
      for (const [key, value] of Object.entries(frames)) {
        if (/^\d+$/.test(key)) {
          allFrames.push([parseInt(key, 10), parseFloat(value)]);
        }
      }
    }
    if (allFrames.length > 0) {
      allFrames.sort((a, b) => a[0] - b[0]);
      result[metric] = allFrames;
    }
  }
  return result;
}

/** Return the highest frame index in a parsed report's metric arrays. */
function _computeMaxFrame(report) {
  let max = 0;
  for (const metric of ['vmaf', 'ssim', 'psnr']) {
    const arr = report[metric];
    if (Array.isArray(arr) && arr.length > 0) {
      max = Math.max(max, arr[arr.length - 1][0]);
    }
  }
  return max;
}

function _updateLegend() {
  const container = document.getElementById('mrv-legend-items');
  if (!container) return;
  if (loadedReports.size === 0) {
    container.innerHTML = '<span class="mrv-legend-empty">No reports loaded. Double-click a 📊 report resource.</span>';
    return;
  }
  container.innerHTML = Array.from(loadedReports.entries()).map(([key, r]) =>
    `<div class="mrv-legend-item">
      <span class="mrv-legend-swatch" style="background:${r.color}"></span>
      <span class="mrv-legend-name" title="${_esc(r.name)}">${_esc(r.name)}</span>
      <button class="vap-btn mrv-legend-remove" onclick="mrvRemoveReport('${key}')">✕</button>
    </div>`
  ).join('');
}

function _renderChart() {
  const container = document.getElementById('mrv-chart');
  if (!container) return;
  if (typeof window.echarts === 'undefined') return;

  if (!chartInstance) {
    chartInstance = window.echarts.init(container, 'dark');
    _initChartEvents();
  }

  if (loadedReports.size === 0) {
    chartInstance.clear();
    return;
  }

  // Determine which metric types are present across all reports
  const present = new Set();
  for (const r of loadedReports.values()) {
    for (const m of ['vmaf', 'ssim', 'psnr']) {
      if (r[m]) present.add(m);
    }
  }

  // Build y-axes (one per metric type)
  const yAxes = [];
  const metricYIdx = {};
  let yIdx = 0;

  if (present.has('vmaf')) {
    metricYIdx['vmaf'] = yIdx++;
    yAxes.push({ name: 'VMAF', min: 0, max: 100, type: 'value', position: 'left',
      nameTextStyle: { color: '#3B82F6' }, axisLabel: { color: '#3B82F6' },
      axisLine: { lineStyle: { color: '#3B82F6' } } });
  }
  if (present.has('ssim')) {
    metricYIdx['ssim'] = yIdx++;
    yAxes.push({ name: 'SSIM', min: 0, max: 1, type: 'value', position: 'right',
      nameTextStyle: { color: '#10B981' }, axisLabel: { color: '#10B981' },
      axisLine: { lineStyle: { color: '#10B981' } } });
  }
  if (present.has('psnr')) {
    metricYIdx['psnr'] = yIdx++;
    const offset = present.has('ssim') ? 70 : 0;
    yAxes.push({ name: 'PSNR (dB)', min: 0, type: 'value', position: 'right', offset,
      nameTextStyle: { color: '#F59E0B' }, axisLabel: { color: '#F59E0B' },
      axisLine: { lineStyle: { color: '#F59E0B' } } });
  }

  const series = [];
  let firstSeries = true;
  for (const r of loadedReports.values()) {
    for (const metric of ['vmaf', 'ssim', 'psnr']) {
      if (!r[metric]) continue;
      const s = {
        name: `${r.name} — ${metric.toUpperCase()}`,
        type: 'line',
        data: r[metric],
        yAxisIndex: metricYIdx[metric],
        lineStyle: { color: r.color, width: 1.5 },
        itemStyle: { color: r.color },
        symbol: 'none',
        smooth: false,
        animation: false,
        large: true,
      };
      // Add frame-position markLine on first series only
      if (firstSeries) {
        s.markLine = {
          silent: true,
          lineStyle: { color: '#FF4500', type: 'solid', width: 2 },
          label: { show: true, formatter: () => `F${currentFrame}`, position: 'insideEndTop', color: '#FF4500' },
          data: [{ xAxis: currentFrame }],
          symbol: ['none', 'arrow'],
          symbolSize: 8,
        };
        firstSeries = false;
      }
      series.push(s);
    }
  }

  const rightAxisCount = (present.has('ssim') ? 1 : 0) + (present.has('psnr') ? 1 : 0);
  const rightMargin = rightAxisCount > 1 ? '14%' : (rightAxisCount === 1 ? '10%' : '4%');

  chartInstance.setOption({
    animation: false,
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
    legend: { show: true, type: 'scroll', bottom: 0, textStyle: { color: '#ccc' } },
    grid: { left: '8%', right: rightMargin, top: '8%', bottom: '12%' },
    xAxis: { type: 'value', name: 'Frame', nameLocation: 'middle', nameGap: 25,
      min: 0, max: maxFrame || undefined, axisLabel: { color: '#aaa' }, nameTextStyle: { color: '#aaa' } },
    yAxis: yAxes,
    series,
  }, { notMerge: true });
}

function _initChartEvents() {
  if (!chartInstance) return;

  const zr = chartInstance.getZr();
  zr.on('mousedown', () => { isDragging = true; });
  zr.on('mouseup', () => { isDragging = false; });
  zr.on('mousemove', (params) => {
    if (!isDragging) return;
    _seekToPixel(params.offsetX, params.offsetY);
  });
  chartInstance.on('click', (params) => {
    _seekToPixel(params.event.offsetX, params.event.offsetY);
  });

  const chartEl = document.getElementById('mrv-chart');
  if (chartEl && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => chartInstance?.resize()).observe(chartEl);
  }
}

function _seekToPixel(x, y) {
  if (!chartInstance) return;
  const pt = [x, y];
  if (chartInstance.containPixel('grid', pt)) {
    const val = chartInstance.convertFromPixel('grid', pt);
    setFrame(Math.max(0, val[0]));
  }
}

function _updateChartMarker() {
  if (!chartInstance) return;
  const opt = chartInstance.getOption();
  if (!opt?.series?.length) return;

  // Update markLine xAxis on the first series that has one
  const newSeries = opt.series.map((s) => {
    if (!s.markLine) return s;
    return {
      ...s,
      markLine: {
        ...s.markLine,
        label: { show: true, formatter: () => `F${currentFrame}`, position: 'insideEndTop', color: '#FF4500' },
        data: [{ xAxis: currentFrame }],
      },
    };
  });
  chartInstance.setOption({ series: newSeries });
}

function _renderPlayerCanvas() {
  const canvas = document.getElementById('mrv-canvas');
  if (!canvas || !playerBackend) return;
  const ctx = canvas.getContext('2d');
  const v = playerBackend.getVideoElement();
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
}

function _updatePlayerTimecode(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const f = Math.round((t % 1) * playerFps);
  const tc = `${_pad(h)}:${_pad(m)}:${_pad(s)}:${_pad(f)}`;
  const tcEl = document.getElementById('mrv-timecode');
  if (tcEl) tcEl.textContent = tc;
  const seekbar = document.getElementById('mrv-seekbar');
  if (seekbar) seekbar.value = Math.floor(t * 1000);
}

function _pad(n) { return String(n).padStart(2, '0'); }

function _initPlayerDOMEvents() {
  const v = document.getElementById('mrv-video');
  if (!v) return;
  v.addEventListener('timeupdate', () => {
    if (!playerBackend) return;
    const t = playerBackend.getCurrentTime();
    _updatePlayerTimecode(t);
    const newFrame = Math.round(t * playerFps);
    if (newFrame !== currentFrame) {
      currentFrame = newFrame;
      const fc = document.getElementById('mrv-frame-counter');
      if (fc) fc.textContent = `Frame: ${currentFrame}`;
      _updateChartMarker();
    }
  });
}

function _initResize() {
  const handle = document.getElementById('mrv-resize');
  if (!handle) return;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const viewport = document.getElementById('mrv-viewport');
    const startY = e.clientY;
    const startH = viewport.offsetHeight;
    const onMove = (ev) => {
      const h = Math.max(80, startH + (ev.clientY - startY));
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

async function _tryFindVideo(header) {
  if (!projectId || !header) return;
  const resp = await fetch(`/v1/projects/${projectId}/resources`);
  if (!resp.ok) return;
  let resources;
  try { resources = await resp.json(); } catch { return; }
  if (!Array.isArray(resources)) return;

  const media = resources.filter(r => r.resource_type === 'media');
  if (media.length === 0) return;

  const select = document.getElementById('mrv-video-select');
  if (!select) return;

  select.innerHTML = '<option value="">— No video —</option>' +
    media.map(r => `<option value="${r.id}">${_esc(r.name)}</option>`).join('');
  select.style.display = 'inline-block';

  // Try to auto-match reference or distorted filename
  const refName = header.reference || '';
  const distName = (header.dist && header.dist['0']) || '';
  const match = media.find(r =>
    r.name === refName || r.name === distName ||
    (refName && r.name.includes(refName)) ||
    (distName && r.name.includes(distName))
  );
  if (match) {
    select.value = match.id;
    await playerLoadResource(match.id);
  }
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
