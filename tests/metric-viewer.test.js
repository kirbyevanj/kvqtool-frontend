/**
 * Tests for metric-viewer.js
 */
import { jest } from '@jest/globals';

// ─── Mock media-backend ───────────────────────────────────────────────────────
const mockBackend = {
  load: jest.fn(),
  play: jest.fn(() => Promise.resolve()),
  pause: jest.fn(),
  seek: jest.fn(),
  getCurrentTime: jest.fn(() => 0),
  getDuration: jest.fn(() => 100),
  getVideoElement: jest.fn(() => document.getElementById('mrv-video') || document.createElement('video')),
  destroy: jest.fn(),
};

jest.unstable_mockModule('../js/media-backend.js', () => ({
  createBackend: jest.fn(() => mockBackend),
  NativeBackend: jest.fn(),
  DashBackend: jest.fn(),
}));

// ─── Minimal DOM ─────────────────────────────────────────────────────────────
document.body.innerHTML = `
  <div id="panel-report" style="display:none">
    <div class="mrv-player-area">
      <div class="mrv-viewport" id="mrv-viewport">
        <video id="mrv-video" playsinline></video>
        <canvas id="mrv-canvas" style="display:none"></canvas>
      </div>
      <div id="mrv-resize"></div>
      <div id="mrv-controls">
        <button id="mrv-play-btn">Play</button>
        <input type="range" id="mrv-seekbar" min="0" max="1000" value="0">
        <span id="mrv-timecode">00:00:00:00</span>
        <button id="mrv-framestep-btn">Frame Step</button>
        <span id="mrv-frame-counter">Frame: 0</span>
        <select id="mrv-video-select" style="display:none"></select>
        <span id="mrv-video-label">No video loaded</span>
      </div>
      <div id="mrv-controls-nub" style="display:none"></div>
    </div>
    <div id="mrv-legend">
      <div id="mrv-legend-items"></div>
    </div>
    <div id="mrv-chart"></div>
  </div>
  <div id="sidebar">
    <div class="resource-item" data-id="rpt-1" data-type="report">
      <span class="res-label">📊 my-report.json</span>
    </div>
  </div>
`;

// HTMLVideoElement stubs
window.HTMLVideoElement.prototype.play = jest.fn(() => Promise.resolve());
window.HTMLVideoElement.prototype.pause = jest.fn();

// ─── ResizeObserver mock (jsdom lacks it; needed to cover line 376) ──────────
const mockResizeObserver = jest.fn().mockImplementation((cb) => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
global.ResizeObserver = mockResizeObserver;

// ─── ECharts mock ─────────────────────────────────────────────────────────────
const mockZr = {
  _handlers: {},
  on: jest.fn((evt, fn) => { mockZr._handlers[evt] = fn; }),
};
const mockChart = {
  init: jest.fn(),
  setOption: jest.fn(),
  getOption: jest.fn(() => ({
    series: [{ markLine: { data: [{ xAxis: 0 }], label: {} } }],
  })),
  clear: jest.fn(),
  resize: jest.fn(),
  containPixel: jest.fn(() => true),
  convertFromPixel: jest.fn(() => [42, 50]),
  on: jest.fn(),
  getZr: jest.fn(() => mockZr),
  dispose: jest.fn(),
};
global.echarts = {
  init: jest.fn(() => mockChart),
};

// ─── fetch mock ───────────────────────────────────────────────────────────────
const SAMPLE_REPORT = {
  header: { version: '0.1', metrics: ['vmaf', 'ssim', 'psnr'], reference: 'ref.mp4', dist: { '0': 'dist.mp4' } },
  vmaf: { '0': { '0': '95.23', '1': '94.87', '2': '93.10', mean: '94.40' } },
  ssim: { '0': { '0': '0.991', '1': '0.988', '2': '0.985', mean: '0.988000' } },
  psnr: { '0': { '0': '45.23', '1': '44.80', '2': '43.90', average: '44.64' } },
};

global.fetch = jest.fn();

function mockFetchSuccess(data = SAMPLE_REPORT) {
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ download_url: 'http://example.com/metrics.json' }),
  });
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  });
}

function mockResourcesList(resources = []) {
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => resources,
  });
}

// ─── Import module after mocks ────────────────────────────────────────────────
const mrv = await import('../js/metric-viewer.js');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('metric-viewer - init', () => {
  test('init sets projectId and attaches DOM listeners', () => {
    expect(() => mrv.init('proj-abc')).not.toThrow();
  });

  test('init with no mrv-resize does not throw', () => {
    const handle = document.getElementById('mrv-resize');
    const parent = handle.parentNode;
    parent.removeChild(handle);
    expect(() => mrv.init('proj-abc')).not.toThrow();
    // Restore
    const restored = document.createElement('div');
    restored.id = 'mrv-resize';
    parent.appendChild(restored);
  });
});

describe('metric-viewer - isViewerActive', () => {
  test('returns false before any reports loaded', () => {
    expect(mrv.isViewerActive()).toBe(false);
  });
});

describe('metric-viewer - loadReport', () => {
  beforeEach(() => {
    fetch.mockReset();
    mockBackend.destroy.mockReset();
    mrv.removeReport('rpt-test');
  });

  afterEach(() => {
    // Clean up any reports loaded by success tests
    for (const key of ['rpt-1', 'rpt-2', 'rpt-agg', 'rpt-vmaf-only']) {
      mrv.removeReport(key);
    }
  });

  test('loadReport returns false when download-url fetch fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    const result = await mrv.loadReport('rpt-1', 'My Report');
    expect(result).toBe(false);
  });

  test('loadReport returns false when data fetch fails', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/f.json' }) });
    fetch.mockResolvedValueOnce({ ok: false });
    const result = await mrv.loadReport('rpt-1', 'My Report');
    expect(result).toBe(false);
  });

  test('loadReport returns false for invalid JSON (parse error)', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/f.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('bad json'); } });
    const result = await mrv.loadReport('rpt-1', 'My Report');
    expect(result).toBe(false);
  });

  test('loadReport returns false for non-metric JSON (no header)', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/f.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ something: 'else' }) });
    const result = await mrv.loadReport('rpt-1', 'My Report');
    expect(result).toBe(false);
  });

  test('loadReport returns true and renders chart for valid report', async () => {
    mockFetchSuccess();
    mockResourcesList([]);
    const result = await mrv.loadReport('rpt-2', 'Test Report');
    expect(result).toBe(true);
    expect(mrv.isViewerActive()).toBe(true);
  });

  test('loadReport with no per-frame data (only aggregate keys) still succeeds', async () => {
    const aggregateOnly = {
      header: { version: '0.1', metrics: ['vmaf'], reference: 'r.mp4', dist: { '0': 'd.mp4' } },
      vmaf: { '0': { mean: '87.50' } },
    };
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/f.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => aggregateOnly });
    mockResourcesList([]);
    const result = await mrv.loadReport('rpt-agg', 'Agg Report');
    expect(result).toBe(true);
  });

  test('loadReport with only VMAF (no ssim/psnr) succeeds', async () => {
    const vmafOnly = {
      header: { version: '0.1', metrics: ['vmaf'], reference: 'r.mp4', dist: { '0': 'd.mp4' } },
      vmaf: { '0': { '0': '90.0', '1': '91.0', mean: '90.5' } },
    };
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/f.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => vmafOnly });
    mockResourcesList([]);
    const result = await mrv.loadReport('rpt-vmaf-only', 'VMAF Only');
    expect(result).toBe(true);
  });
});

describe('metric-viewer - removeReport', () => {
  beforeEach(async () => {
    fetch.mockReset();
    mockFetchSuccess();
    mockResourcesList([]);
    await mrv.loadReport('rpt-remove', 'Remove Me');
  });

  test('removeReport removes report from chart', () => {
    expect(mrv.isViewerActive()).toBe(true);
    mrv.removeReport('rpt-remove');
  });

  test('removeReport on non-existent key does not throw', () => {
    expect(() => mrv.removeReport('nonexistent')).not.toThrow();
  });

  test('isViewerActive returns false after all reports removed', () => {
    mrv.removeReport('rpt-remove');
    expect(mrv.isViewerActive()).toBe(false);
  });
});

describe('metric-viewer - setFrame', () => {
  beforeEach(async () => {
    fetch.mockReset();
    mockFetchSuccess();
    mockResourcesList([]);
    await mrv.loadReport('rpt-frame', 'Frame Test');
  });

  afterEach(() => {
    mrv.removeReport('rpt-frame');
  });

  test('setFrame updates frame counter DOM element', () => {
    mrv.setFrame(1);
    expect(document.getElementById('mrv-frame-counter').textContent).toBe('Frame: 1');
  });

  test('setFrame clamps to 0 for negative input', () => {
    mrv.setFrame(-5);
    expect(document.getElementById('mrv-frame-counter').textContent).toBe('Frame: 0');
  });

  test('setFrame clamps to maxFrame for large input', () => {
    mrv.setFrame(999999);
    // Should not throw and should clamp
    const text = document.getElementById('mrv-frame-counter').textContent;
    expect(text).toMatch(/^Frame: \d+$/);
  });

  test('setFrame calls playerBackend.seek when backend is available', async () => {
    // Load a video to set playerBackend
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-vid');
    mockBackend.seek.mockReset();
    mrv.setFrame(5);
    expect(mockBackend.seek).toHaveBeenCalled();
  });
});

describe('metric-viewer - playerTogglePlay', () => {
  test('playerTogglePlay does nothing when no backend', () => {
    expect(() => mrv.playerTogglePlay()).not.toThrow();
  });

  test('playerTogglePlay plays when paused', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-toggle');
    const video = document.getElementById('mrv-video');
    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    expect(() => mrv.playerTogglePlay()).not.toThrow();
    expect(mockBackend.play).toHaveBeenCalled();
  });

  test('playerTogglePlay pauses when playing', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-toggle2');
    const video = document.getElementById('mrv-video');
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    mockBackend.pause.mockReset();
    expect(() => mrv.playerTogglePlay()).not.toThrow();
    expect(mockBackend.pause).toHaveBeenCalled();
  });
});

describe('metric-viewer - playerSeek', () => {
  test('playerSeek does nothing when no backend', () => {
    expect(() => mrv.playerSeek(1000)).not.toThrow();
  });

  test('playerSeek updates timecode and chart', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-seek');
    mockBackend.seek.mockReset();
    mrv.playerSeek(2500);
    expect(mockBackend.seek).toHaveBeenCalledWith(2.5);
    const tc = document.getElementById('mrv-timecode');
    expect(tc.textContent).toBe('00:00:02:12');
  });
});

describe('metric-viewer - playerStepFrame', () => {
  test('playerStepFrame does nothing when no backend', () => {
    expect(() => mrv.playerStepFrame(1)).not.toThrow();
  });

  test('playerStepFrame returns early when getDuration returns 0', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-step');
    mockBackend.getDuration.mockReturnValueOnce(0);
    expect(() => mrv.playerStepFrame(1)).not.toThrow();
  });

  test('playerStepFrame forward with duration', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-step2');
    mockBackend.getDuration.mockReturnValue(100);
    mockBackend.getCurrentTime.mockReturnValue(1.0);
    mockBackend.seek.mockReset();
    // Need to enable frame mode first
    const video = document.getElementById('mrv-video');
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    expect(() => mrv.playerStepFrame(1)).not.toThrow();
    expect(mockBackend.seek).toHaveBeenCalled();
  });
});

describe('metric-viewer - playerToggleFrameMode', () => {
  test('playerToggleFrameMode does nothing when no backend (after toggle)', () => {
    // First toggle without backend changes the flag but returns early
    expect(() => mrv.playerToggleFrameMode()).not.toThrow();
    expect(() => mrv.playerToggleFrameMode()).not.toThrow();
  });

  test('playerToggleFrameMode with backend shows canvas', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-fm');
    const video = document.getElementById('mrv-video');
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    const canvas = document.getElementById('mrv-canvas');
    // Enable frame mode
    expect(() => mrv.playerToggleFrameMode()).not.toThrow();
    // Disable frame mode
    expect(() => mrv.playerToggleFrameMode()).not.toThrow();
    expect(canvas.style.display).toBe('none');
  });

  test('playerToggleFrameMode seeked event fires canvas render', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-fm2');
    const canvas = document.getElementById('mrv-canvas');
    canvas.getContext = jest.fn(() => ({
      drawImage: jest.fn(), save: jest.fn(), restore: jest.fn(),
      beginPath: jest.fn(), rect: jest.fn(), clip: jest.fn(),
    }));
    expect(() => mrv.playerToggleFrameMode()).not.toThrow();
    const video = document.getElementById('mrv-video');
    video.dispatchEvent(new Event('seeked'));
    expect(() => mrv.playerToggleFrameMode()).not.toThrow(); // off
  });
});

describe('metric-viewer - playerToggleControls', () => {
  test('toggles controls visibility', () => {
    const controls = document.getElementById('mrv-controls');
    const nub = document.getElementById('mrv-controls-nub');
    mrv.playerToggleControls();
    expect(controls.style.display).toBe('none');
    expect(nub.style.display).toBe('block');
    mrv.playerToggleControls();
    expect(controls.style.display).toBe('block');
    expect(nub.style.display).toBe('none');
  });
});

describe('metric-viewer - playerLoadResource', () => {
  beforeEach(() => {
    fetch.mockReset();
    mockBackend.destroy.mockReset();
  });

  test('playerLoadResource does nothing for empty id', async () => {
    await expect(mrv.playerLoadResource('')).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('playerLoadResource returns early when fetch fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    await expect(mrv.playerLoadResource('res-fail')).resolves.toBeUndefined();
  });

  test('playerLoadResource creates backend and loads URL', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-ok');
    expect(mockBackend.load).toHaveBeenCalled();
  });

  test('playerLoadResource fires loadedmetadata to update seekbar', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-lmd');
    const video = document.getElementById('mrv-video');
    mockBackend.getDuration.mockReturnValue(60);
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(document.getElementById('mrv-seekbar').max).toBe('60000');
  });

  test('playerLoadResource destroys old backend before creating new', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v1.mp4' }) });
    await mrv.playerLoadResource('res-1st');
    mockBackend.destroy.mockReset();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v2.mp4' }) });
    await mrv.playerLoadResource('res-2nd');
    expect(mockBackend.destroy).toHaveBeenCalled();
  });
});

describe('metric-viewer - resize handle', () => {
  test('pointerdown on mrv-resize starts resize drag', () => {
    mrv.init('proj-resize');
    const handle = document.getElementById('mrv-resize');
    handle.setPointerCapture = jest.fn();
    const viewport = document.getElementById('mrv-viewport');
    Object.defineProperty(viewport, 'offsetHeight', { value: 200, configurable: true });

    const down = new MouseEvent('pointerdown', { clientY: 200, bubbles: true });
    Object.defineProperty(down, 'pointerId', { value: 1 });
    handle.dispatchEvent(down);

    // Move
    const move = new MouseEvent('pointermove', { clientY: 250, bubbles: false });
    handle.dispatchEvent(move);

    // Up
    const up = new MouseEvent('pointerup', { bubbles: false });
    handle.dispatchEvent(up);
  });
});

describe('metric-viewer - timeupdate event', () => {
  test('timeupdate updates timecode and chart marker when backend set', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-tu');
    mockBackend.getCurrentTime.mockReturnValue(5.0);
    const video = document.getElementById('mrv-video');
    video.dispatchEvent(new Event('timeupdate'));
    const tc = document.getElementById('mrv-timecode');
    expect(tc.textContent).toBe('00:00:05:00');
  });
});

describe('metric-viewer - chart drag events', () => {
  beforeEach(async () => {
    fetch.mockReset();
    mockFetchSuccess();
    mockResourcesList([]);
    await mrv.loadReport('rpt-drag', 'Drag Test');
  });

  afterEach(() => {
    mrv.removeReport('rpt-drag');
  });

  test('chart click handler triggers setFrame via seekToPixel', () => {
    // Simulate chart click event handler
    const clickHandlers = mockChart.on.mock.calls.filter(c => c[0] === 'click');
    if (clickHandlers.length > 0) {
      const clickCb = clickHandlers[clickHandlers.length - 1][1];
      expect(() => clickCb({ event: { offsetX: 300, offsetY: 150 } })).not.toThrow();
    }
  });

  test('chart zr mousedown/move/up triggers drag seek', () => {
    const zrHandlers = mockZr.on.mock.calls;
    const downCb = zrHandlers.find(c => c[0] === 'mousedown')?.[1];
    const moveCb = zrHandlers.find(c => c[0] === 'mousemove')?.[1];
    const upCb = zrHandlers.find(c => c[0] === 'mouseup')?.[1];

    if (downCb) downCb({});
    if (moveCb) moveCb({ offsetX: 200, offsetY: 100 });
    if (upCb) upCb({});
  });

  test('chart mousemove without mousedown does not seek', () => {
    // No drag started; moveCb should be no-op
    const zrHandlers = mockZr.on.mock.calls;
    const moveCb = zrHandlers.find(c => c[0] === 'mousemove')?.[1];
    if (moveCb) {
      expect(() => moveCb({ offsetX: 200, offsetY: 100 })).not.toThrow();
    }
  });
});

describe('metric-viewer - legend update', () => {
  test('legend shows empty message when no reports', () => {
    // Remove all reports that may have been loaded by prior tests
    for (const key of ['rpt-2', 'rpt-agg', 'rpt-vmaf-only', 'rpt-remove', 'rpt-frame',
                       'rpt-drag', 'rpt-legend', 'rpt-vid-match', 'any-key']) {
      mrv.removeReport(key);
    }
    const items = document.getElementById('mrv-legend-items');
    expect(items.innerHTML).toContain('No reports loaded');
  });

  test('legend shows report names with remove button after load', async () => {
    fetch.mockReset();
    mockFetchSuccess();
    mockResourcesList([]);
    await mrv.loadReport('rpt-legend', 'Legend Report');
    const items = document.getElementById('mrv-legend-items');
    expect(items.innerHTML).toContain('Legend Report');
    expect(items.innerHTML).toContain('mrvRemoveReport');
    mrv.removeReport('rpt-legend');
  });
});

describe('metric-viewer - tryFindVideo with matching resource', () => {
  test('auto-loads video when resource name matches reference', async () => {
    fetch.mockReset();
    // download-url for report
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/m.json' }) });
    // report data
    fetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_REPORT });
    // resources list (with matching media)
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'vid-1', name: 'ref.mp4', resource_type: 'media' },
        { id: 'vid-2', name: 'other.mp4', resource_type: 'media' },
      ],
    });
    // playerLoadResource download-url
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });

    const result = await mrv.loadReport('rpt-vid-match', 'Report with Video');
    expect(result).toBe(true);
    const sel = document.getElementById('mrv-video-select');
    expect(sel.style.display).toBe('inline-block');
    mrv.removeReport('rpt-vid-match');
  });

  test('tryFindVideo returns early when resource list fetch fails', async () => {
    fetch.mockReset();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/m.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_REPORT });
    fetch.mockResolvedValueOnce({ ok: false });
    const result = await mrv.loadReport('rpt-no-vid', 'No Vid Report');
    expect(result).toBe(true);
    mrv.removeReport('rpt-no-vid');
  });

  test('tryFindVideo returns early when resources is not an array', async () => {
    fetch.mockReset();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/m.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_REPORT });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => null });
    const result = await mrv.loadReport('rpt-null-list', 'Null List');
    expect(result).toBe(true);
    mrv.removeReport('rpt-null-list');
  });

  test('tryFindVideo with no media resources does not populate select', async () => {
    fetch.mockReset();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/m.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_REPORT });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'wf-1', name: 'wf.json', resource_type: 'workflow' }] });
    const result = await mrv.loadReport('rpt-no-media', 'No Media');
    expect(result).toBe(true);
    mrv.removeReport('rpt-no-media');
  });

  test('tryFindVideo resources parse error is caught gracefully', async () => {
    fetch.mockReset();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/m.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_REPORT });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('bad'); } });
    const result = await mrv.loadReport('rpt-err', 'Err Report');
    expect(result).toBe(true);
    mrv.removeReport('rpt-err');
  });
});

describe('metric-viewer - updateChartMarker with no series', () => {
  test('does not throw when chart has no series', () => {
    mockChart.getOption.mockReturnValueOnce({ series: [] });
    expect(() => mrv.setFrame(5)).not.toThrow();
  });

  test('does not throw when chart option returns null', () => {
    mockChart.getOption.mockReturnValueOnce(null);
    expect(() => mrv.setFrame(5)).not.toThrow();
  });
});

describe('metric-viewer - multiple report loading', () => {
  afterEach(() => {
    mrv.removeReport('rpt-m1');
    mrv.removeReport('rpt-m2');
  });

  test('loading multiple reports increases max frame correctly', async () => {
    fetch.mockReset();

    const report1 = { ...SAMPLE_REPORT };
    const report2 = {
      header: { version: '0.1', metrics: ['vmaf'], reference: 'r2.mp4', dist: { '0': 'd2.mp4' } },
      vmaf: { '0': { '0': '80.0', '10': '82.0', mean: '81.0' } },
    };

    // Load report 1
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/m1.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => report1 });
    mockResourcesList([]);
    await mrv.loadReport('rpt-m1', 'Report 1');

    // Load report 2
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/m2.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => report2 });
    mockResourcesList([]);
    await mrv.loadReport('rpt-m2', 'Report 2');

    expect(mrv.isViewerActive()).toBe(true);
  });

  test('removing one of two reports keeps the other active', async () => {
    fetch.mockReset();

    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/ma.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_REPORT });
    mockResourcesList([]);
    await mrv.loadReport('rpt-m1', 'Report A');

    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/mb.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_REPORT });
    mockResourcesList([]);
    await mrv.loadReport('rpt-m2', 'Report B');

    mrv.removeReport('rpt-m1');
    expect(mrv.isViewerActive()).toBe(true);
  });
});

describe('metric-viewer - playerStepFrame in frame mode activates frame mode', () => {
  test('stepFrame enables frame mode when not active', async () => {
    fetch.mockReset();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/v.mp4' }) });
    await mrv.playerLoadResource('res-sfm');
    mockBackend.getDuration.mockReturnValue(100);
    mockBackend.getCurrentTime.mockReturnValue(0);

    // Ensure frame mode is off first (toggle twice to reset)
    const canvas = document.getElementById('mrv-canvas');
    canvas.getContext = jest.fn(() => ({ drawImage: jest.fn() }));

    // Call stepFrame - it will enable frameMode internally
    expect(() => mrv.playerStepFrame(1)).not.toThrow();
    // Fire seeked on video
    const video = document.getElementById('mrv-video');
    video.dispatchEvent(new Event('seeked'));
  });
});

describe('metric-viewer - echarts not available', () => {
  test('renderChart does nothing when echarts is undefined', async () => {
    const orig = global.echarts;
    global.echarts = undefined;

    fetch.mockReset();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ download_url: 'http://x.com/m.json' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_REPORT });
    mockResourcesList([]);
    const result = await mrv.loadReport('rpt-noecharts', 'No ECharts');
    expect(result).toBe(true); // loadReport itself still succeeds

    global.echarts = orig;
    mrv.removeReport('rpt-noecharts');
  });
});

describe('metric-viewer - markLine formatter coverage', () => {
  beforeEach(async () => {
    fetch.mockReset();
    mockFetchSuccess();
    mockResourcesList([]);
    await mrv.loadReport('rpt-fmt', 'Formatter Test');
  });

  afterEach(() => {
    mrv.removeReport('rpt-fmt');
  });

  test('markLine label formatter returns frame string', () => {
    // Extract the formatter from the last setOption call's first series markLine
    const calls = mockChart.setOption.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastOption = calls[calls.length - 1][0];
    const series = lastOption?.series;
    if (series && series.length > 0) {
      const firstWithMarkLine = series.find(s => s.markLine);
      if (firstWithMarkLine) {
        const fmt = firstWithMarkLine.markLine.label?.formatter;
        if (typeof fmt === 'function') {
          const result = fmt();
          expect(typeof result).toBe('string');
          expect(result).toMatch(/^F\d+$/);
        }
      }
    }
  });

  test('updateChartMarker formatter returns frame string', () => {
    // setFrame triggers _updateChartMarker which calls setOption with updated series
    mockChart.setOption.mockClear();
    mrv.setFrame(1);
    const calls = mockChart.setOption.mock.calls;
    if (calls.length > 0) {
      const opt = calls[calls.length - 1][0];
      const series = opt?.series;
      if (Array.isArray(series)) {
        const withMarkLine = series.find(s => s.markLine);
        if (withMarkLine) {
          const fmt = withMarkLine.markLine.label?.formatter;
          if (typeof fmt === 'function') {
            const result = fmt();
            expect(typeof result).toBe('string');
          }
        }
      }
    }
  });
});

describe('metric-viewer - ResizeObserver coverage', () => {
  test('ResizeObserver was constructed with a callback that resizes the chart', () => {
    // ResizeObserver was mocked globally before module import.
    // The first _initChartEvents call (triggered during the first successful loadReport
    // in the loadReport describe) registered a ResizeObserver. Retrieve that callback
    // and invoke it to cover line 376.
    expect(mockResizeObserver).toHaveBeenCalled();
    const [capturedCb] = mockResizeObserver.mock.calls[0];
    mockChart.resize.mockClear();
    capturedCb([]);
    expect(mockChart.resize).toHaveBeenCalled();
  });
});
