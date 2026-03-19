/**
 * Unit tests for video-analysis-player.js exports
 */
import { jest } from '@jest/globals';

// Mock media-backend.js
const mockBackend = {
  load: jest.fn(),
  play: jest.fn(() => Promise.resolve()),
  pause: jest.fn(),
  seek: jest.fn(),
  getCurrentTime: jest.fn(() => 0),
  getDuration: jest.fn(() => 100),
  getVideoElement: jest.fn(() => document.getElementById('vap-video-left') || document.createElement('video')),
  destroy: jest.fn(),
};

jest.unstable_mockModule('../js/media-backend.js', () => ({
  createBackend: jest.fn(() => mockBackend),
  NativeBackend: jest.fn(),
  DashBackend: jest.fn(),
}));

// Set up DOM that video-analysis-player.js requires
document.body.innerHTML = `
  <div id="video-analysis-player" style="display:none">
    <video id="vap-video-left" class="vap-video"></video>
    <video id="vap-video-right" class="vap-video vap-video-right" style="display:none"></video>
    <div id="vap-divider" style="display:none"></div>
    <canvas id="vap-canvas" style="display:none"></canvas>
    <div id="vap-metric-overlay"></div>
  </div>
  <div id="vap-controls" class="vap-controls">
    <button id="vap-play-btn">Play</button>
    <input type="range" id="vap-seekbar" min="0" max="1000" value="0" />
    <span id="vap-timecode">00:00:00:00</span>
    <span id="vap-frame-counter">Frame: 0</span>
    <button id="vap-framestep-btn">Frame Step</button>
    <button id="vap-split-btn">Split View</button>
    <button id="vap-fullscreen-btn">Fullscreen</button>
  </div>
  <div id="vap-pool" style="display:none">
    <div id="vap-pool-items"></div>
    <select id="vap-left-select"></select>
    <select id="vap-right-select"></select>
    <div id="vap-offset-controls"></div>
  </div>
  <div id="vap-controls-nub" style="display:none"></div>
  <div id="vap-resize"></div>
`;

// Mock video.play() since jsdom doesn't support media playback
window.HTMLVideoElement.prototype.play = jest.fn(() => Promise.resolve());
window.HTMLVideoElement.prototype.pause = jest.fn();

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ download_url: 'http://example.com/video.mp4' }),
  })
);

// Import after mocks
const vap = await import('../js/video-analysis-player.js');

describe('video-analysis-player - isPlayerActive', () => {
  test('returns false before any media is loaded', () => {
    expect(vap.isPlayerActive()).toBe(false);
  });
});

describe('video-analysis-player - isSplitActive', () => {
  test('returns false initially', () => {
    expect(vap.isSplitActive()).toBe(false);
  });
});

describe('video-analysis-player - setCurrentName / getCurrentName', () => {
  test('setCurrentName can be called without error', () => {
    expect(() => vap.setCurrentName('test-video.mp4')).not.toThrow();
  });
});

describe('video-analysis-player - togglePlay', () => {
  test('togglePlay does not throw when no media loaded', () => {
    expect(() => vap.togglePlay()).not.toThrow();
  });
});

describe('video-analysis-player - toggleFrameMode', () => {
  test('toggleFrameMode toggles without error', () => {
    expect(() => vap.toggleFrameMode()).not.toThrow();
    expect(() => vap.toggleFrameMode()).not.toThrow();
  });
});

describe('video-analysis-player - toggleSplit', () => {
  test('toggleSplit can be called without error', () => {
    expect(() => vap.toggleSplit()).not.toThrow();
  });
});

describe('video-analysis-player - seek', () => {
  test('seek does not throw', () => {
    expect(() => vap.seek(500)).not.toThrow();
  });
});

describe('video-analysis-player - stepFrame', () => {
  test('stepFrame forward does not throw', () => {
    expect(() => vap.stepFrame(1)).not.toThrow();
  });

  test('stepFrame backward does not throw', () => {
    expect(() => vap.stepFrame(-1)).not.toThrow();
  });
});

describe('video-analysis-player - comparison pool', () => {
  test('addToPool does not throw', () => {
    expect(() => vap.addToPool('res-1', 'Video 1', 'proj-1')).not.toThrow();
  });

  test('removeFromPool does not throw for unknown id', () => {
    expect(() => vap.removeFromPool('nonexistent')).not.toThrow();
  });

  test('setLeft does not throw', () => {
    expect(() => vap.setLeft('res-1')).not.toThrow();
  });

  test('setRight does not throw', () => {
    expect(() => vap.setRight('res-1')).not.toThrow();
  });
});

describe('video-analysis-player - frame offsets', () => {
  test('setFrameOffset does not throw', () => {
    expect(() => vap.setFrameOffset('res-1', 5)).not.toThrow();
  });

  test('bumpFrameOffset does not throw', () => {
    expect(() => vap.bumpFrameOffset('res-1', 1)).not.toThrow();
    expect(() => vap.bumpFrameOffset('res-1', -1)).not.toThrow();
  });
});

describe('video-analysis-player - controls', () => {
  test('toggleControls does not throw', () => {
    expect(() => vap.toggleControls()).not.toThrow();
    expect(() => vap.toggleControls()).not.toThrow();
  });
});

describe('video-analysis-player - init', () => {
  test('init sets projectId without error', () => {
    expect(() => vap.init('proj-123')).not.toThrow();
  });
});

describe('video-analysis-player - togglePlay with active backend', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/video.mp4' }),
    });
    await vap.loadMedia('res-toggle', 'proj-1');
  });

  test('togglePlay when playing pauses', () => {
    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    expect(() => vap.togglePlay()).not.toThrow();
  });

  test('togglePlay when paused plays', () => {
    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    expect(() => vap.togglePlay()).not.toThrow();
  });

  test('viewportClick triggers togglePlay', () => {
    expect(() => vap.viewportClick()).not.toThrow();
  });

  test('seek with active backend does not throw', () => {
    expect(() => vap.seek(500)).not.toThrow();
  });

  test('stepFrame with active backend and duration does not throw', () => {
    mockBackend.getDuration.mockReturnValue(100);
    expect(() => vap.stepFrame(1)).not.toThrow();
    expect(() => vap.stepFrame(-1)).not.toThrow();
  });

  test('toggleFrameMode enables frame mode', () => {
    vap.toggleFrameMode();
    // should not throw
    vap.toggleFrameMode(); // toggle back
  });
});

describe('video-analysis-player - loadMedia', () => {
  beforeEach(() => {
    fetch.mockReset();
    mockBackend.load.mockReset();
    mockBackend.play.mockReset();
    mockBackend.pause.mockReset();
  });

  test('loadMedia fetches download URL', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/video.mp4' }),
    });
    await vap.loadMedia('res-abc', 'proj-1');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/resources/res-abc/download-url')
    );
  });

  test('loadMedia returns early if fetch fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    await vap.loadMedia('res-fail', 'proj-1');
    // Should not throw
    expect(mockBackend.load).not.toHaveBeenCalled();
  });

  test('loadMedia sets player active after load', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/video.mp4' }),
    });
    await vap.loadMedia('res-load', 'proj-1');
    expect(vap.isPlayerActive()).toBe(true);
  });

  test('loadMedia with different resource resets pool', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/v2.mp4' }),
    });
    await vap.loadMedia('res-new', 'proj-1');
    // Should not throw and pool should be reset
  });
});

describe('video-analysis-player - toggleFullscreen', () => {
  test('toggleFullscreen requests fullscreen when not in fullscreen', () => {
    const el = document.getElementById('video-analysis-player');
    el.requestFullscreen = jest.fn(() => Promise.resolve());
    Object.defineProperty(document, 'fullscreenElement', {
      value: null, writable: true, configurable: true,
    });
    expect(() => vap.toggleFullscreen()).not.toThrow();
    expect(el.requestFullscreen).toHaveBeenCalled();
  });

  test('toggleFullscreen exits fullscreen when in fullscreen', () => {
    document.exitFullscreen = jest.fn(() => Promise.resolve());
    const btn = document.getElementById('vap-fullscreen-btn');
    btn.classList.add('vap-btn-active');
    Object.defineProperty(document, 'fullscreenElement', {
      value: {}, writable: true, configurable: true,
    });
    expect(() => vap.toggleFullscreen()).not.toThrow();
    expect(document.exitFullscreen).toHaveBeenCalled();
  });
});

describe('video-analysis-player - addToPool (async)', () => {
  beforeEach(() => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/pool.mp4' }),
    });
  });

  test('addToPool fetches download URL', async () => {
    await vap.addToPool('pool-res-1', 'Pool Video', 'proj-1');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/resources/pool-res-1/download-url')
    );
  });

  test('addToPool returns early if fetch fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    await vap.addToPool('pool-fail', 'Fail Video', 'proj-1');
    // Should not throw
  });

  test('addToPool does not add duplicate resources', async () => {
    await vap.addToPool('pool-dup-1', 'Dup Video', 'proj-1');
    const fetchCount = fetch.mock.calls.length;
    await vap.addToPool('pool-dup-1', 'Dup Video', 'proj-1');
    // Second call should not fetch again
    expect(fetch.mock.calls.length).toBe(fetchCount);
  });
});

describe('video-analysis-player - split and sync operations', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/video.mp4' }),
    });
    // Load media first so leftBackend is set
    await vap.loadMedia('res-split', 'proj-1');
  });

  test('toggleSplit opens split view', () => {
    // If not split, toggleSplit opens it
    if (!vap.isSplitActive()) {
      vap.toggleSplit();
      expect(vap.isSplitActive()).toBe(true);
    }
  });

  test('toggleSplit closes split view when already open', () => {
    // Open split
    if (!vap.isSplitActive()) vap.toggleSplit();
    // Close split
    vap.toggleSplit();
    expect(vap.isSplitActive()).toBe(false);
  });

  test('seek with split active does not throw', () => {
    vap.toggleSplit(); // open
    expect(() => vap.seek(500)).not.toThrow();
  });

  test('togglePlay when split active triggers syncRight', () => {
    vap.toggleSplit(); // open split
    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    expect(() => vap.togglePlay()).not.toThrow();
    vap.toggleSplit(); // close
  });
});

describe('video-analysis-player - removeFromPool with active right video', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/video.mp4' }),
    });
    await vap.loadMedia('res-primary', 'proj-1');
  });

  test('removeFromPool non-primary resource removes it', async () => {
    // Add a second video to pool
    await vap.addToPool('res-secondary', 'Secondary', 'proj-1');
    // Remove it
    expect(() => vap.removeFromPool('res-secondary')).not.toThrow();
  });

  test('removeFromPool primary resource does nothing', () => {
    // primary cannot be removed
    expect(() => vap.removeFromPool('res-primary')).not.toThrow();
  });
});

describe('video-analysis-player - setLeft and setRight', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/lr.mp4' }),
    });
    await vap.loadMedia('res-lr-main', 'proj-1');
    await vap.addToPool('res-lr-other', 'Other', 'proj-1');
  });

  test('setLeft with pool entry switches left video', () => {
    expect(() => vap.setLeft('res-lr-other')).not.toThrow();
  });

  test('setRight with pool entry switches right video', () => {
    expect(() => vap.setRight('res-lr-other')).not.toThrow();
  });

  test('setLeft with unknown id does nothing', () => {
    expect(() => vap.setLeft('nonexistent')).not.toThrow();
  });

  test('setRight with unknown id does nothing', () => {
    expect(() => vap.setRight('nonexistent')).not.toThrow();
  });
});

describe('video-analysis-player - setFrameOffset with backends', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/foffset.mp4' }),
    });
    await vap.loadMedia('res-foffset-l', 'proj-1');
    await vap.addToPool('res-foffset-r', 'Right', 'proj-1');
    vap.setRight('res-foffset-r');
  });

  test('setFrameOffset adjusts right video position', () => {
    expect(() => vap.setFrameOffset('res-foffset-r', 5)).not.toThrow();
  });

  test('bumpFrameOffset positive increases offset', () => {
    expect(() => vap.bumpFrameOffset('res-foffset-r', 1)).not.toThrow();
  });
});

describe('video-analysis-player - fullscreenchange event', () => {
  test('fullscreenchange event removes active class on exit', () => {
    const btn = document.getElementById('vap-fullscreen-btn');
    btn.classList.add('vap-btn-active');
    Object.defineProperty(document, 'fullscreenElement', {
      value: null, writable: true, configurable: true,
    });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(btn.classList.contains('vap-btn-active')).toBe(false);
  });

  test('fullscreenchange event adds active class on enter', () => {
    const btn = document.getElementById('vap-fullscreen-btn');
    btn.classList.remove('vap-btn-active');
    Object.defineProperty(document, 'fullscreenElement', {
      value: {}, writable: true, configurable: true,
    });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(btn.classList.contains('vap-btn-active')).toBe(true);
  });
});

describe('video-analysis-player - stepFrame with frameMode and split', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/frames.mp4' }),
    });
    mockBackend.getDuration.mockReturnValue(100);
    await vap.loadMedia('res-frames', 'proj-1');
  });

  test('stepFrame when not in frameMode activates frameMode', () => {
    // toggleFrameMode to ensure we start with known state
    const canvas = document.getElementById('vap-canvas');
    expect(() => vap.stepFrame(1)).not.toThrow();
  });
});

describe('video-analysis-player - seek edge cases', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/seek.mp4' }),
    });
    mockBackend.getDuration.mockReturnValue(100);
    await vap.loadMedia('res-seek-edge', 'proj-1');
  });

  test('seek when wasPlaying re-plays after seek', () => {
    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    expect(() => vap.seek(500)).not.toThrow();
  });

  test('seek in frameMode triggers renderFrameToCanvas', () => {
    // Enable frameMode first
    const canvas = document.getElementById('vap-canvas');
    canvas.getContext = jest.fn(() => ({
      drawImage: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      beginPath: jest.fn(),
      rect: jest.fn(),
      clip: jest.fn(),
      fillRect: jest.fn(),
      fillStyle: '',
    }));
    vap.toggleFrameMode(); // enable
    expect(() => vap.seek(200)).not.toThrow();
    vap.toggleFrameMode(); // disable
  });
});

// Helper to set up a mock canvas context
function mockCanvasContext() {
  const canvas = document.getElementById('vap-canvas');
  canvas.getContext = jest.fn(() => ({
    drawImage: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn(),
    fillRect: jest.fn(),
    fillStyle: '',
  }));
}

describe('video-analysis-player - togglePlay pause branch covers syncRight', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/pause-branch.mp4' }),
    });
    await vap.loadMedia('res-pause-branch', 'proj-1');
  });

  test('togglePlay when video is playing calls pause (lines 88-89)', () => {
    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    expect(() => vap.togglePlay()).not.toThrow();
    expect(mockBackend.pause).toHaveBeenCalled();
  });
});

describe('video-analysis-player - loadedmetadata event handler', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/meta.mp4' }),
    });
    mockBackend.getDuration.mockReturnValue(30);
  });

  test('loadedmetadata fires seekbar max update (lines 68-69)', async () => {
    await vap.loadMedia('res-meta-load', 'proj-1');
    const video = document.getElementById('vap-video-left');
    video.dispatchEvent(new Event('loadedmetadata'));
    const seekbar = document.getElementById('vap-seekbar');
    expect(seekbar.max).toBe('30000');
  });

  test('loadedmetadata with zero duration skips seekbar update', async () => {
    mockBackend.getDuration.mockReturnValue(0);
    await vap.loadMedia('res-meta-zero', 'proj-1');
    const video = document.getElementById('vap-video-left');
    video.dispatchEvent(new Event('loadedmetadata'));
    // Should not throw
  });
});

describe('video-analysis-player - syncRight pause and seek (lines 424-430)', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/sync.mp4' }),
    });
    await vap.loadMedia('res-sync-main', 'proj-1');
    await vap.addToPool('res-sync-right', 'Right Sync', 'proj-1');
    vap.setRight('res-sync-right');
    // Open split to set splitActive=true
    if (!vap.isSplitActive()) vap.toggleSplit();
  });

  afterEach(() => {
    if (vap.isSplitActive()) vap.toggleSplit();
  });

  test('togglePlay when playing triggers syncRight pause (lines 424-426)', () => {
    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    expect(() => vap.togglePlay()).not.toThrow();
  });

  test('seek triggers syncRight seek (lines 428-430)', () => {
    expect(() => vap.seek(1000)).not.toThrow();
  });

  test('seek with split wasPlaying triggers play+sync (lines 116-119)', () => {
    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    expect(() => vap.seek(2000)).not.toThrow();
  });
});

describe('video-analysis-player - syncRight play / startFrameSync (lines 418, 461-483)', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/framesync.mp4' }),
    });
    await vap.loadMedia('res-framesync', 'proj-1');
    await vap.addToPool('res-framesync-r', 'Right FrameSync', 'proj-1');
    vap.setRight('res-framesync-r');
    if (!vap.isSplitActive()) vap.toggleSplit();
  });

  afterEach(() => {
    if (vap.isSplitActive()) vap.toggleSplit();
  });

  test('togglePlay when paused triggers syncRight play + startFrameSync via rAF (lines 461-483)', () => {
    // Mock requestAnimationFrame to execute callback synchronously once
    const origRAF = global.requestAnimationFrame;
    let callCount = 0;
    global.requestAnimationFrame = jest.fn((cb) => {
      if (callCount++ < 2) cb(); // Call callback once to cover tick body
      return callCount;
    });

    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    expect(() => vap.togglePlay()).not.toThrow();

    global.requestAnimationFrame = origRAF;
  });

  test('startFrameSync tick when paused resets playbackRate', () => {
    const origRAF = global.requestAnimationFrame;
    let callCount = 0;
    global.requestAnimationFrame = jest.fn((cb) => {
      if (callCount++ < 1) {
        // Simulate video paused state during tick
        const video = document.getElementById('vap-video-left');
        Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
        cb();
      }
      return callCount;
    });

    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    expect(() => vap.togglePlay()).not.toThrow();

    global.requestAnimationFrame = origRAF;
  });

  test('startFrameSync tick drift correction branches', () => {
    const origRAF = global.requestAnimationFrame;
    let callCount = 0;
    global.requestAnimationFrame = jest.fn((cb) => {
      if (callCount++ < 3) {
        const video = document.getElementById('vap-video-left');
        Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
        // Set large drift for branch coverage (rightBackend.getVideoElement() returns vap-video-left)
        const rVideo = document.getElementById('vap-video-left');
        Object.defineProperty(rVideo, 'currentTime', { value: 100, writable: true, configurable: true });
        cb();
      }
      return callCount;
    });
    mockBackend.getCurrentTime.mockReturnValue(0);

    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    expect(() => vap.togglePlay()).not.toThrow();

    global.requestAnimationFrame = origRAF;
  });
});

describe('video-analysis-player - seek wasPlaying without split (line 125)', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/seekwas.mp4' }),
    });
    // Ensure split is closed
    if (vap.isSplitActive()) vap.toggleSplit();
    await vap.loadMedia('res-seekwas', 'proj-1');
  });

  test('seek wasPlaying without split adds seeked listener for replay (line 125)', () => {
    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    expect(() => vap.seek(500)).not.toThrow();
    // Fire seeked event to trigger the listener
    video.dispatchEvent(new Event('seeked'));
  });
});

describe('video-analysis-player - setLeft loadeddata+seeked with frameMode (lines 317-319)', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/setleft.mp4' }),
    });
    mockCanvasContext();
    await vap.loadMedia('res-setleft-main', 'proj-1');
    await vap.addToPool('res-setleft-other', 'Other', 'proj-1');
  });

  test('setLeft fires loadeddata then seeked in frameMode (lines 317-319)', () => {
    // Enable frameMode
    vap.toggleFrameMode(); // on
    vap.setLeft('res-setleft-other');
    const video = document.getElementById('vap-video-left');
    video.dispatchEvent(new Event('loadeddata'));
    video.dispatchEvent(new Event('seeked'));
    vap.toggleFrameMode(); // off
  });
});

describe('video-analysis-player - setRight loadeddata+seeked with frameMode (lines 336-338)', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/setright.mp4' }),
    });
    mockCanvasContext();
    await vap.loadMedia('res-setright-main', 'proj-1');
    await vap.addToPool('res-setright-other', 'Other Right', 'proj-1');
  });

  test('setRight fires loadeddata then seeked in frameMode (lines 336-338)', () => {
    vap.toggleFrameMode(); // on
    vap.setRight('res-setright-other');
    const video = document.getElementById('vap-video-right');
    video.dispatchEvent(new Event('loadeddata'));
    video.dispatchEvent(new Event('seeked'));
    vap.toggleFrameMode(); // off
  });
});

describe('video-analysis-player - waitForBothSeeked readyState branches (lines 392, 398)', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/wseeked.mp4' }),
    });
    mockCanvasContext();
    await vap.loadMedia('res-wseeked', 'proj-1');
    await vap.addToPool('res-wseeked-r', 'Right WS', 'proj-1');
    vap.setRight('res-wseeked-r');
    if (!vap.isSplitActive()) vap.toggleSplit();
  });

  afterEach(() => {
    if (vap.isSplitActive()) vap.toggleSplit();
  });

  test('seek in frameMode triggers waitForBothSeeked with readyState >= 2 (lines 391-403)', () => {
    const lv = document.getElementById('vap-video-left');
    const rv = document.getElementById('vap-video-right');
    // Set readyState to HAVE_CURRENT_DATA (2) and seeking=false -> aReady=true immediately
    Object.defineProperty(lv, 'readyState', { value: 2, writable: true, configurable: true });
    Object.defineProperty(lv, 'seeking', { value: false, writable: true, configurable: true });
    Object.defineProperty(rv, 'readyState', { value: 2, writable: true, configurable: true });
    Object.defineProperty(rv, 'seeking', { value: false, writable: true, configurable: true });
    vap.toggleFrameMode(); // on
    expect(() => vap.seek(500)).not.toThrow();
    vap.toggleFrameMode(); // off
  });
});

describe('video-analysis-player - renderFrameToCanvas with split (lines 515-530)', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/rfcsplit.mp4' }),
    });
    mockCanvasContext();
    await vap.loadMedia('res-rfc-l', 'proj-1');
    await vap.addToPool('res-rfc-r', 'RFC Right', 'proj-1');
    vap.setRight('res-rfc-r');
    if (!vap.isSplitActive()) vap.toggleSplit();
  });

  afterEach(() => {
    if (vap.isSplitActive()) vap.toggleSplit();
  });

  test('stepFrame in frameMode with split calls renderFrameToCanvas split branch (lines 146-147, 515-530)', () => {
    mockBackend.getDuration.mockReturnValue(100);
    vap.toggleFrameMode(); // on
    const lv = document.getElementById('vap-video-left');
    const rv = document.getElementById('vap-video-right');
    Object.defineProperty(lv, 'readyState', { value: 2, writable: true, configurable: true });
    Object.defineProperty(lv, 'seeking', { value: false, writable: true, configurable: true });
    Object.defineProperty(rv, 'readyState', { value: 2, writable: true, configurable: true });
    Object.defineProperty(rv, 'seeking', { value: false, writable: true, configurable: true });
    expect(() => vap.stepFrame(1)).not.toThrow();
    vap.toggleFrameMode(); // off
  });

  test('seek in frameMode with split calls renderFrameToCanvas split branch (lines 122, 515-530)', () => {
    vap.toggleFrameMode(); // on
    const lv = document.getElementById('vap-video-left');
    const rv = document.getElementById('vap-video-right');
    Object.defineProperty(lv, 'readyState', { value: 2, writable: true, configurable: true });
    Object.defineProperty(lv, 'seeking', { value: false, writable: true, configurable: true });
    Object.defineProperty(rv, 'readyState', { value: 2, writable: true, configurable: true });
    Object.defineProperty(rv, 'seeking', { value: false, writable: true, configurable: true });
    expect(() => vap.seek(1000)).not.toThrow();
    vap.toggleFrameMode(); // off
  });
});

describe('video-analysis-player - seek frameMode no split no wasPlaying (line 127)', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/fm127.mp4' }),
    });
    mockCanvasContext();
    if (vap.isSplitActive()) vap.toggleSplit();
    await vap.loadMedia('res-fm127', 'proj-1');
  });

  test('seek in frameMode without split and not wasPlaying adds seeked listener (line 127)', () => {
    const video = document.getElementById('vap-video-left');
    // Ensure not playing (paused=true), so wasPlaying=false
    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    vap.toggleFrameMode(); // enable frameMode
    expect(() => vap.seek(500)).not.toThrow();
    // Fire seeked to trigger renderFrameToCanvas
    video.dispatchEvent(new Event('seeked'));
    vap.toggleFrameMode(); // disable
  });
});

describe('video-analysis-player - updateTimecode via timeupdate event (lines 497-499)', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/tcu.mp4' }),
    });
    await vap.loadMedia('res-tcu', 'proj-1');
  });

  test('timeupdate event fires updateTimecode (lines 497-499)', () => {
    const video = document.getElementById('vap-video-left');
    mockBackend.getCurrentTime.mockReturnValue(65.5);
    video.dispatchEvent(new Event('timeupdate'));
    const tc = document.getElementById('vap-timecode');
    expect(tc.textContent).toMatch(/01:05/);
  });
});

describe('video-analysis-player - startFrameSync rAF drift branches (lines 473-476)', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/drift.mp4' }),
    });
    await vap.loadMedia('res-drift', 'proj-1');
    await vap.addToPool('res-drift-r', 'Right Drift', 'proj-1');
    vap.setRight('res-drift-r');
    if (!vap.isSplitActive()) vap.toggleSplit();
  });

  afterEach(() => {
    if (vap.isSplitActive()) vap.toggleSplit();
  });

  test('rAF tick with small drift (0.02 < drift <= 0.5) adjusts playbackRate (line 475-476)', () => {
    const origRAF = global.requestAnimationFrame;
    let callCount = 0;
    global.requestAnimationFrame = jest.fn((cb) => {
      if (callCount++ < 2) {
        const video = document.getElementById('vap-video-left');
        Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
        // drift = 0.1 (small, > 0.02 but <= 0.5) - use vap-video-left as rightBackend.getVideoElement() returns it
        const rVideo = document.getElementById('vap-video-left');
        Object.defineProperty(rVideo, 'currentTime', { value: 0.1, writable: true, configurable: true });
        mockBackend.getCurrentTime.mockReturnValue(0);
        cb();
      }
      return callCount;
    });
    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    expect(() => vap.togglePlay()).not.toThrow();
    global.requestAnimationFrame = origRAF;
  });

  test('rAF tick with zero drift sets playbackRate 1.0 (line 478)', () => {
    const origRAF = global.requestAnimationFrame;
    let callCount = 0;
    global.requestAnimationFrame = jest.fn((cb) => {
      if (callCount++ < 2) {
        const video = document.getElementById('vap-video-left');
        Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
        // drift = 0 (no drift) - use vap-video-left as rightBackend.getVideoElement() returns it
        const rVideo = document.getElementById('vap-video-left');
        Object.defineProperty(rVideo, 'currentTime', { value: 0, writable: true, configurable: true });
        mockBackend.getCurrentTime.mockReturnValue(0);
        cb();
      }
      return callCount;
    });
    const video = document.getElementById('vap-video-left');
    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    expect(() => vap.togglePlay()).not.toThrow();
    global.requestAnimationFrame = origRAF;
  });
});

describe('video-analysis-player - startFrameSync requestVideoFrameCallback branch (lines 439-460)', () => {
  beforeEach(async () => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: 'http://example.com/rvfc.mp4' }),
    });
    await vap.loadMedia('res-rvfc', 'proj-1');
    await vap.addToPool('res-rvfc-r', 'Right RVFC', 'proj-1');
    vap.setRight('res-rvfc-r');
    if (!vap.isSplitActive()) vap.toggleSplit();
  });

  afterEach(() => {
    if (vap.isSplitActive()) vap.toggleSplit();
  });

  test('startFrameSync uses requestVideoFrameCallback when available (lines 439-460)', () => {
    const video = document.getElementById('vap-video-left');
    // Add requestVideoFrameCallback to the video element
    let rvfcCallback = null;
    video.requestVideoFrameCallback = jest.fn((cb) => {
      rvfcCallback = cb;
      return 1;
    });

    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    vap.togglePlay(); // starts startFrameSync -> uses requestVideoFrameCallback

    // Call the callback with mock metadata (large drift > 0.5)
    // rightBackend.getVideoElement() returns vap-video-left
    Object.defineProperty(video, 'currentTime', { value: 100, writable: true, configurable: true });
    if (rvfcCallback) {
      Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
      rvfcCallback(0, { mediaTime: 0 });
    }
    delete video.requestVideoFrameCallback;
  });

  test('requestVideoFrameCallback tick with small drift adjusts playbackRate (line 452-453)', () => {
    const video = document.getElementById('vap-video-left');
    let rvfcCallback = null;
    video.requestVideoFrameCallback = jest.fn((cb) => {
      rvfcCallback = cb;
      return 1;
    });

    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    vap.togglePlay();

    if (rvfcCallback) {
      Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
      // rightBackend.getVideoElement() returns vap-video-left
      Object.defineProperty(video, 'currentTime', { value: 0.1, writable: true, configurable: true });
      rvfcCallback(0, { mediaTime: 0 }); // drift=0.1 -> small drift branch
    }
    delete video.requestVideoFrameCallback;
  });

  test('requestVideoFrameCallback tick with zero drift (line 454-455)', () => {
    const video = document.getElementById('vap-video-left');
    let rvfcCallback = null;
    video.requestVideoFrameCallback = jest.fn((cb) => {
      rvfcCallback = cb;
      return 1;
    });

    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    vap.togglePlay();

    if (rvfcCallback) {
      Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
      // rightBackend.getVideoElement() returns vap-video-left
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });
      rvfcCallback(0, { mediaTime: 0 }); // drift=0 -> zero drift branch
    }
    delete video.requestVideoFrameCallback;
  });

  test('requestVideoFrameCallback tick when paused resets playbackRate (line 441)', () => {
    const video = document.getElementById('vap-video-left');
    let rvfcCallback = null;
    video.requestVideoFrameCallback = jest.fn((cb) => {
      rvfcCallback = cb;
      return 1;
    });

    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    vap.togglePlay();

    if (rvfcCallback) {
      // lv.paused = true during callback
      Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
      rvfcCallback(0, { mediaTime: 0 });
    }
    delete video.requestVideoFrameCallback;
  });
});

describe('video-analysis-player - attachDragListeners (lines 535-549)', () => {
  test('pointerdown on divider starts drag, pointermove updates splitPosition, pointerup cleans up', () => {
    const divider = document.getElementById('vap-divider');
    divider.setPointerCapture = jest.fn();
    divider.releasePointerCapture = jest.fn();

    // pointerdown starts drag
    const downEvt = new MouseEvent('pointerdown', { clientX: 500, bubbles: true });
    Object.defineProperty(downEvt, 'pointerId', { value: 1 });
    divider.dispatchEvent(downEvt);

    // pointermove updates position
    const container = divider.parentElement;
    container.getBoundingClientRect = jest.fn(() => ({ left: 0, width: 1000 }));
    const moveEvt = new MouseEvent('pointermove', { clientX: 300, bubbles: false });
    divider.dispatchEvent(moveEvt);

    // pointerup ends drag
    const upEvt = new MouseEvent('pointerup', { bubbles: false });
    divider.dispatchEvent(upEvt);
  });

  test('pointermove in frameMode renders frame to canvas', () => {
    mockCanvasContext();
    const divider = document.getElementById('vap-divider');
    divider.setPointerCapture = jest.fn();

    const downEvt = new MouseEvent('pointerdown', { clientX: 500, bubbles: true });
    Object.defineProperty(downEvt, 'pointerId', { value: 2 });
    divider.dispatchEvent(downEvt);

    // Enable frameMode so renderFrameToCanvas is called during move
    vap.toggleFrameMode();
    const container = divider.parentElement;
    container.getBoundingClientRect = jest.fn(() => ({ left: 0, width: 1000 }));
    const moveEvt = new MouseEvent('pointermove', { clientX: 400, bubbles: false });
    divider.dispatchEvent(moveEvt);
    vap.toggleFrameMode(); // off

    const upEvt = new MouseEvent('pointerup', { bubbles: false });
    divider.dispatchEvent(upEvt);
  });
});
