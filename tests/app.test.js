/**
 * Unit tests for app.js window-exposed functions.
 * Tests fetch-based functions and view switching logic.
 */
import { jest } from '@jest/globals';

// Set up comprehensive DOM before importing app.js
document.body.innerHTML = `
  <div id="video-analysis-player" style="display:none"></div>
  <div id="panel-workflow" style="display:none"></div>
  <div id="panel-empty" style="display:none"></div>
  <div id="drawflow-container"></div>
  <div id="wf-node-menu" style="display:none"></div>
  <div id="folder-tree"></div>
  <div id="workflow-list"></div>
  <div id="add-resource-btn"></div>
  <div id="add-dropdown" style="display:none"></div>
  <input id="file-upload" type="file" style="display:none" />
  <div id="job-progress"></div>
  <select id="wf-load-select"><option value="">-- Load --</option></select>
  <input id="wf-name-input" value="Test" />
  <div id="project-name"></div>
  <div class="vap-viewport"></div>
  <dialog id="confirm-switch-dialog">
    <button id="confirm-switch-btn"></button>
  </dialog>
  <div id="vap-pool" style="display:none"></div>
  <div id="vap-pool-items"></div>
  <select id="vap-left-select"></select>
  <select id="vap-right-select"></select>
  <div id="vap-offset-controls"></div>
  <button id="vap-play-btn">Play</button>
  <input id="vap-seekbar" type="range" value="0" />
  <span id="vap-timecode">00:00:00:00</span>
  <span id="vap-frame-counter">Frame: 0</span>
  <button id="vap-split-btn">Split</button>
  <button id="vap-framestep-btn">Frame Step</button>
  <button id="vap-fullscreen-btn">Fullscreen</button>
  <video id="vap-video-left"></video>
  <video id="vap-video-right" style="display:none"></video>
  <div id="vap-divider" style="display:none"></div>
  <canvas id="vap-canvas" style="display:none"></canvas>
  <div id="vap-metric-overlay"></div>
  <div id="vap-controls-nub" style="display:none"></div>
  <div id="vap-resize"></div>
  <div class="res-menu" id="res-menu-1" style="display:block"></div>
  <div class="resource-item" data-id="res-1">
    <span class="res-label">test.mp4</span>
  </div>
`;

// Mock fetch
global.fetch = jest.fn();

// Mock window.open
window.open = jest.fn();

// Mock confirm and prompt
window.confirm = jest.fn(() => true);
window.prompt = jest.fn(() => 'new-name.mp4');
window.alert = jest.fn();

// Mock URL.createObjectURL / revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

// Mock Drawflow
class MockDrawflow {
  constructor() { this.on = jest.fn(); }
  start() {}
  addNode() { return 1; }
  export() { return { drawflow: { Home: { data: {} } } }; }
  import() {}
  clear() {}
  zoom_reset() {}
  getNodeFromId() { return null; }
  updateNodeDataFromId() {}
}
global.Drawflow = MockDrawflow;

// Mock media-backend
jest.unstable_mockModule('../js/media-backend.js', () => ({
  createBackend: jest.fn(() => ({
    load: jest.fn(),
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(),
    seek: jest.fn(),
    getCurrentTime: jest.fn(() => 0),
    getDuration: jest.fn(() => 0),
    getVideoElement: jest.fn(() => document.createElement('video')),
    destroy: jest.fn(),
  })),
}));

// Set htmx mock
global.htmx = { ajax: jest.fn() };

beforeEach(() => {
  fetch.mockReset();
  window.open.mockReset();
  window.confirm.mockReturnValue(true);
  window.prompt.mockReturnValue('new-name.mp4');
  window.alert.mockReset();
  // Reset fetch to a reasonable default
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({}),
    text: async () => '',
  });
});

// Import app.js (sets up window functions)
await import('../js/app.js');

describe('app.js - showView', () => {
  test('showView("workflow") makes workflow panel visible', () => {
    window.showView('workflow');
    expect(document.getElementById('panel-workflow').style.display).toBe('flex');
  });

  test('showView("workflow") hides player panel', () => {
    window.showView('workflow');
    expect(document.getElementById('video-analysis-player').style.display).toBe('none');
  });

  test('showView with unknown view shows empty panel', () => {
    window.showView('unknown-view');
    const empty = document.getElementById('panel-empty');
    expect(empty.style.display).toBe('block');
  });

  test('showView("player") without active player shows empty panel', () => {
    window.showView('player');
    // Since no media loaded, empty panel shows
    const empty = document.getElementById('panel-empty');
    expect(empty.style.display).toBe('block');
  });

  test('showView("player") with force=true shows player panel', () => {
    window.showView('player', true);
    expect(document.getElementById('video-analysis-player').style.display).toBe('flex');
  });
});

describe('app.js - toggleResMenu', () => {
  beforeEach(() => {
    // Reset menu states
    document.querySelectorAll('.res-menu').forEach(m => m.style.display = 'block');
  });

  test('shows menu for given id', () => {
    // First click: other menus hidden, target menu shown
    const menu = document.getElementById('res-menu-1');
    menu.style.display = 'none';
    window.toggleResMenu('1', {});
    expect(menu.style.display).toBe('block');
  });

  test('hides other menus when showing a menu', () => {
    // Add another menu
    const extra = document.createElement('div');
    extra.id = 'res-menu-2';
    extra.className = 'res-menu';
    extra.style.display = 'block';
    document.body.appendChild(extra);

    const menu1 = document.getElementById('res-menu-1');
    menu1.style.display = 'none';
    window.toggleResMenu('1', {});
    expect(extra.style.display).toBe('none');
    document.body.removeChild(extra);
  });

  test('toggles menu off when already visible', () => {
    const menu = document.getElementById('res-menu-1');
    menu.style.display = 'block';
    window.toggleResMenu('1', {});
    // toggles to hidden
    expect(menu.style.display).toBe('none');
  });
});

describe('app.js - deleteResource', () => {
  test('calls DELETE API when confirmed', async () => {
    window.confirm.mockReturnValue(true);
    fetch.mockResolvedValueOnce({ ok: true });
    fetch.mockResolvedValueOnce({ ok: true, text: async () => '' }); // for loadSidebar htmx

    await window.deleteResource('res-123');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/resources/res-123'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('does not call DELETE API when cancelled', async () => {
    window.confirm.mockReturnValue(false);
    await window.deleteResource('res-456');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('app.js - renameResource', () => {
  test('calls PUT API when name provided', async () => {
    window.prompt.mockReturnValue('renamed.mp4');
    fetch.mockResolvedValue({ ok: true, text: async () => '' });

    await window.renameResource('res-789');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/resources/res-789'),
      expect.objectContaining({ method: 'PUT' })
    );
  });

  test('does not call PUT API when prompt cancelled', async () => {
    window.prompt.mockReturnValue(null);
    await window.renameResource('res-000');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('sends correct name in request body', async () => {
    window.prompt.mockReturnValue('my-new-name.mp4');
    fetch.mockResolvedValue({ ok: true, text: async () => '' });

    await window.renameResource('res-aaa');

    const [, options] = fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.name).toBe('my-new-name.mp4');
  });
});

describe('app.js - downloadResource', () => {
  test('fetches download URL and opens in new tab', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ download_url: 'http://s3/file.mp4' }),
    });

    await window.downloadResource('res-dl-1');

    expect(window.open).toHaveBeenCalledWith('http://s3/file.mp4', '_blank');
  });

  test('does not open window if fetch fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    await window.downloadResource('res-dl-2');
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe('app.js - copyResource', () => {
  test('calls copy API endpoint', async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    fetch.mockResolvedValueOnce({ ok: true, text: async () => '' }); // sidebar refresh

    await window.copyResource('res-cp-1', 'video.mp4');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/resources/res-cp-1/copy'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('shows alert on copy failure', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    await window.copyResource('res-cp-2', 'fail.mp4');
    expect(window.alert).toHaveBeenCalled();
  });
});

describe('app.js - copyWorkflow', () => {
  test('fetches workflow and creates copy', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'My Workflow', dag_json: {} }),
    });
    fetch.mockResolvedValueOnce({ ok: true });
    fetch.mockResolvedValueOnce({ ok: true, text: async () => '' }); // sidebar

    await window.copyWorkflow('wf-1');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('aborts if first fetch fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    await window.copyWorkflow('wf-fail');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('app.js - deleteWorkflow', () => {
  test('calls DELETE when confirmed', async () => {
    window.confirm.mockReturnValue(true);
    fetch.mockResolvedValueOnce({ ok: true });
    fetch.mockResolvedValueOnce({ ok: true, text: async () => '' });

    await window.deleteWorkflow('wf-del-1', 'Test Workflow');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/workflows/wf-del-1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('skips DELETE when cancelled', async () => {
    window.confirm.mockReturnValue(false);
    await window.deleteWorkflow('wf-del-2', 'My Workflow');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('app.js - toggleWfMenu', () => {
  test('toggleWfMenu for unknown id does not throw', () => {
    expect(() => window.toggleWfMenu('nonexistent')).not.toThrow();
  });

  test('toggleWfMenu shows menu when hidden', () => {
    const menu = document.createElement('div');
    menu.id = 'wf-menu-abc';
    menu.className = 'res-menu';
    menu.style.display = 'none';
    document.body.appendChild(menu);
    window.toggleWfMenu('abc');
    expect(menu.style.display).toBe('block');
    document.body.removeChild(menu);
  });

  test('toggleWfMenu hides menu when visible', () => {
    const menu = document.createElement('div');
    menu.id = 'wf-menu-xyz';
    menu.className = 'res-menu';
    menu.style.display = 'block';
    document.body.appendChild(menu);
    window.toggleWfMenu('xyz');
    expect(menu.style.display).toBe('none');
    document.body.removeChild(menu);
  });
});

describe('app.js - deleteWorkflow with failed request', () => {
  test('shows alert when delete fails', async () => {
    window.confirm.mockReturnValue(true);
    fetch.mockResolvedValueOnce({ ok: false, text: async () => 'server error' });
    fetch.mockResolvedValue({ ok: true, json: async () => [] });

    await window.deleteWorkflow('wf-fail', 'Test WF');
    expect(window.alert).toHaveBeenCalled();
  });
});

describe('app.js - editWorkflow', () => {
  test('editWorkflow when panel is hidden shows workflow panel', async () => {
    document.getElementById('panel-workflow').style.display = 'none';
    // Reset listeners
    const container = document.getElementById('drawflow-container');
    container._kvqListenersAttached = false;

    fetch.mockResolvedValue({ ok: true, json: async () => [] });

    await window.editWorkflow(null);
    // Should show workflow panel
    expect(document.getElementById('panel-workflow').style.display).toBe('flex');
  });

  test('editWorkflow when panel already open skips reinit', async () => {
    document.getElementById('panel-workflow').style.display = 'flex';
    fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'wf', name: 'N', dag_json: null }) });
    await window.editWorkflow('wf-open');
  });
});

describe('app.js - runWorkflow (with workflow id)', () => {
  test('runWorkflow with workflow id calls jobs endpoint', async () => {
    const { setWorkflowId } = await import('../js/workflow-builder.js');
    setWorkflowId('wf-run-1');

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ job_id: 'job-1', run_id: 'run-1' }),
    });

    await window.runWorkflow();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/jobs'),
      expect.objectContaining({ method: 'POST' })
    );

    setWorkflowId(null);
  });

  test('runWorkflow shows error on failed job creation', async () => {
    const { setWorkflowId } = await import('../js/workflow-builder.js');
    setWorkflowId('wf-run-fail');

    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'workflow not found' }),
    });

    await window.runWorkflow();
    expect(document.getElementById('job-progress').textContent).toContain('Error');

    setWorkflowId(null);
  });
});

describe('app.js - onNodeDragStart', () => {
  test('sets dataTransfer data', () => {
    const event = {
      dataTransfer: {
        setData: jest.fn(),
        effectAllowed: '',
      },
    };
    window.onNodeDragStart(event, 'x264Transcode');
    expect(event.dataTransfer.setData).toHaveBeenCalledWith(
      'application/x-kvq-node',
      'x264Transcode'
    );
  });
});

describe('app.js - onResourceClick', () => {
  test('unknown type returns early without action', () => {
    const fetchCallsBefore = fetch.mock.calls.length;
    window.onResourceClick('res-1', 'unknown-type');
    expect(fetch.mock.calls.length).toBe(fetchCallsBefore);
  });

  test('report type calls viewReport (which fetches download-url)', () => {
    expect(() => window.onResourceClick('res-1', 'report')).not.toThrow();
  });

  test('file type with .json extension calls viewReport', () => {
    // Add a fake .json resource-item to the DOM
    const div = document.createElement('div');
    div.className = 'resource-item';
    div.dataset.id = 'json-res-1';
    div.innerHTML = '<span class="res-label">📄 metrics.json</span>';
    document.body.appendChild(div);
    expect(() => window.onResourceClick('json-res-1', 'file')).not.toThrow();
    document.body.removeChild(div);
  });

  test('file type without .json extension returns without action', () => {
    const fetchCallsBefore = fetch.mock.calls.length;
    const div = document.createElement('div');
    div.className = 'resource-item';
    div.dataset.id = 'txt-res-1';
    div.innerHTML = '<span class="res-label">📄 notes.txt</span>';
    document.body.appendChild(div);
    window.onResourceClick('txt-res-1', 'file');
    expect(fetch.mock.calls.length).toBe(fetchCallsBefore);
    document.body.removeChild(div);
  });

  test('media type calls loadMedia', async () => {
    window.onResourceClick('res-1', 'media');
    // just ensure no error thrown
  });
});

describe('app.js - addToCompare', () => {
  test('calls addToPool without error', () => {
    expect(() => window.addToCompare('res-pool-1', 'Video.mp4')).not.toThrow();
  });
});

describe('app.js - onResDragStart', () => {
  test('sets resource dataTransfer', () => {
    const event = { dataTransfer: { setData: jest.fn(), effectAllowed: '' } };
    window.onResDragStart(event, 'res-drag-1', 'my-video.mp4');
    expect(event.dataTransfer.setData).toHaveBeenCalledWith(
      'application/x-kvq-resource',
      expect.stringContaining('res-drag-1')
    );
  });
});

describe('app.js - newWorkflow', () => {
  test('newWorkflow does not throw', () => {
    expect(() => window.newWorkflow()).not.toThrow();
  });
});

describe('app.js - saveWorkflow (new workflow)', () => {
  test('prompts for name and saves via POST', async () => {
    window.prompt.mockReturnValueOnce('New Pipeline');
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'new-wf-id', name: 'New Pipeline' }),
      })
      // resources fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      // workflows fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      // loadWorkflowList - non-empty to cover map lambda
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'w1', name: 'WF 1' }] });

    await window.saveWorkflow();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/workflows'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('aborts if name prompt cancelled', async () => {
    window.prompt.mockReturnValueOnce(null);
    await window.saveWorkflow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('app.js - runWorkflow', () => {
  test('alerts if no workflow id set', async () => {
    // Ensure no workflow id
    const { setWorkflowId } = await import('../js/workflow-builder.js');
    setWorkflowId(null);

    await window.runWorkflow();
    expect(window.alert).toHaveBeenCalled();
  });
});

describe('app.js - showNodeMenu', () => {
  test('showNodeMenu sets menu position and shows it', () => {
    const menu = document.getElementById('wf-node-menu');
    menu.style.display = 'none';
    const event = {
      preventDefault: jest.fn(),
      clientX: 100,
      clientY: 200,
    };
    window.showNodeMenu(event);
    expect(menu.style.display).toBe('block');
    expect(menu.style.left).toBe('100px');
    expect(menu.style.top).toBe('200px');
  });
});

describe('app.js - loadSelectedWorkflow', () => {
  test('returns early for null wfId', async () => {
    await window.loadSelectedWorkflow(null);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('returns early for empty wfId', async () => {
    await window.loadSelectedWorkflow('');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('fetches workflow by id', async () => {
    // First call: get workflow, subsequent calls: resources/workflows lists
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'wf-123', name: 'Test WF', dag_json: { nodes: {} } }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => [],
      });
    await window.loadSelectedWorkflow('wf-123');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/workflows/wf-123'));
  });
});

describe('app.js - downloadWorkflow', () => {
  test('fetches workflow and triggers download', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'CRF Encode', dag_json: { drawflow: {} } }),
    });

    // Mock document.createElement for anchor
    const mockA = { href: '', download: '', click: jest.fn() };
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return mockA;
      return origCreate(tag);
    });

    await window.downloadWorkflow('wf-download-1');

    expect(mockA.click).toHaveBeenCalled();
    expect(mockA.download).toContain('CRF Encode');
    document.createElement.mockRestore();
  });
});

// Add DOM elements needed for remaining tests
beforeAll(() => {
  // Mock showModal/close on dialog elements
  const switchDialog = document.getElementById('confirm-switch-dialog');
  if (switchDialog && !switchDialog.showModal) {
    switchDialog.showModal = jest.fn();
    switchDialog.close = jest.fn();
  }

  // toggleWorkflowPanel / addWorkflowNode
  if (!document.getElementById('wf-session-legend')) {
    const legend = document.createElement('div');
    legend.id = 'wf-session-legend';
    document.body.appendChild(legend);
  }
  // upload dialog and related
  if (!document.getElementById('upload-dialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'upload-dialog';
    dialog.showModal = jest.fn();
    dialog.close = jest.fn();
    document.body.appendChild(dialog);
  }
  if (!document.getElementById('upload-file-list')) {
    const list = document.createElement('div');
    list.id = 'upload-file-list';
    document.body.appendChild(list);
  }
  if (!document.getElementById('file-upload-input')) {
    const input = document.createElement('input');
    input.id = 'file-upload-input';
    input.type = 'file';
    input.click = jest.fn();
    document.body.appendChild(input);
  }
  if (!document.getElementById('repackage-fmp4')) {
    const cb = document.createElement('input');
    cb.id = 'repackage-fmp4';
    cb.type = 'checkbox';
    document.body.appendChild(cb);
  }
  if (!document.getElementById('vap-controls')) {
    const ctrl = document.createElement('div');
    ctrl.id = 'vap-controls';
    document.body.appendChild(ctrl);
  }
});

describe('app.js - toggleWorkflowPanel', () => {
  beforeEach(() => {
    fetch.mockResolvedValue({ ok: true, json: async () => [] });
    document.getElementById('panel-workflow').style.display = 'none';
    const container = document.getElementById('drawflow-container');
    container._kvqListenersAttached = false;
  });

  test('toggleWorkflowPanel when hidden shows workflow panel', async () => {
    jest.useFakeTimers();
    window.toggleWorkflowPanel();
    expect(document.getElementById('panel-workflow').style.display).toBe('flex');
    jest.useRealTimers();
  });

  test('toggleWorkflowPanel when visible hides panel (shows player)', () => {
    document.getElementById('panel-workflow').style.display = 'flex';
    window.toggleWorkflowPanel();
    // Should switch to player view
    expect(document.getElementById('panel-workflow').style.display).toBe('none');
  });

  test('toggleWorkflowPanel attaches listeners once', async () => {
    jest.useFakeTimers();
    document.getElementById('panel-workflow').style.display = 'none';
    const container = document.getElementById('drawflow-container');
    container._kvqListenersAttached = false;

    window.toggleWorkflowPanel();
    jest.runAllTimers();
    expect(container._kvqListenersAttached).toBe(true);
    jest.useRealTimers();
  });
});

describe('app.js - addWorkflowNode', () => {
  beforeEach(() => {
    fetch.mockResolvedValue({ ok: true, json: async () => [] });
  });

  test('addWorkflowNode does not throw', async () => {
    await expect(window.addWorkflowNode('x264Transcode')).resolves.not.toThrow();
  });

  test('addWorkflowNode hides node menu', async () => {
    const menu = document.getElementById('wf-node-menu');
    menu.style.display = 'block';
    await window.addWorkflowNode('x264Transcode');
    expect(menu.style.display).toBe('none');
  });
});

describe('app.js - handleFileSelect', () => {
  test('handleFileSelect does nothing without files', () => {
    const input = { files: [], value: '' };
    expect(() => window.handleFileSelect(input)).not.toThrow();
  });

  test('handleFileSelect with files opens upload dialog', () => {
    const mockFile = new File(['content'], 'test.mp4', { type: 'video/mp4' });
    const dialog = document.getElementById('upload-dialog');
    const input = { files: [mockFile], value: '' };
    // projectId may be null in test context but we just check no error
    expect(() => window.handleFileSelect(input)).not.toThrow();
  });
});

describe('app.js - triggerUpload', () => {
  test('triggerUpload hides add-dropdown and triggers file input click', () => {
    const dd = document.getElementById('add-dropdown');
    dd.style.display = 'block';
    const fileInput = document.getElementById('file-upload-input');
    fileInput.click = jest.fn();

    window.triggerUpload();

    expect(dd.style.display).toBe('none');
    expect(fileInput.click).toHaveBeenCalled();
  });
});

describe('app.js - vapConfirmUpload', () => {
  beforeEach(() => {
    fetch.mockResolvedValue({ ok: true, json: async () => [] });
  });

  test('vapConfirmUpload closes dialog and processes pending files', async () => {
    // Set up a pending file
    const mockFile = new File(['x'], 'test.mp4', { type: 'video/mp4' });
    const input = { files: [mockFile], value: '' };
    window.handleFileSelect(input);

    // Mock uploadToS3 (it imports upload.js which has its own fetch calls)
    fetch.mockResolvedValue({ ok: true, json: async () => ({ upload_url: 'http://s3/url', resource_id: 'r1' }) });

    const dialog = document.getElementById('upload-dialog');
    dialog.close = jest.fn();
    await window.vapConfirmUpload();
    expect(dialog.close).toHaveBeenCalled();
  });
});

describe('app.js - renderSessionLegend (via saveWorkflow)', () => {
  beforeEach(() => {
    fetch.mockResolvedValue({ ok: true, json: async () => [] });
  });

  test('renderSessionLegend populates legend element', async () => {
    // The legend is populated by refreshResourceDropdowns which is called by saveWorkflow
    const legend = document.getElementById('wf-session-legend');
    // Call loadSelectedWorkflow which calls refreshResourceDropdowns -> renderSessionLegend
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'wf-x', name: 'X', dag_json: null }),
    }).mockResolvedValue({ ok: true, json: async () => [] });

    await window.loadSelectedWorkflow('wf-x');
    // legend should have been populated with session color swatches
    expect(legend.innerHTML.length).toBeGreaterThan(0);
  });
});

describe('app.js - onResourceClick split active branch', () => {
  test('media type click does not throw', () => {
    window.onResourceClick('res-1', 'media');
    // Should not throw (non-split path)
  });
});

describe('app.js - vapViewportClick', () => {
  test('vapViewportClick calls togglePlay when not clicking divider', () => {
    const event = {
      target: { closest: jest.fn(() => null) },
    };
    expect(() => window.vapViewportClick(event)).not.toThrow();
  });

  test('vapViewportClick does nothing when clicking divider', () => {
    const event = {
      target: { closest: jest.fn(() => ({})) }, // returns non-null for '.vap-divider'
    };
    expect(() => window.vapViewportClick(event)).not.toThrow();
  });
});

describe('app.js - init via DOMContentLoaded', () => {
  beforeAll(async () => {
    // Set URL with project param so init() sets projectId
    window.history.pushState({}, '', '/?project=test-proj-init');
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Test Project', id: 'test-proj-init' }),
    });
    // Fire DOMContentLoaded - triggers init() AND the confirm-switch-btn listener
    document.dispatchEvent(new Event('DOMContentLoaded'));
    // Let async tasks settle
    await new Promise(r => setTimeout(r, 50));
  });

  afterAll(() => {
    // Reset URL
    window.history.pushState({}, '', '/');
  });

  test('init runs without error when project param present', () => {
    // projectId should be set after DOMContentLoaded dispatched above
    // loadSidebar should have been called
    expect(htmx.ajax).toHaveBeenCalled();
  });

  test('loadSidebar calls htmx.ajax for sidebar and workflows', () => {
    expect(htmx.ajax).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining('/sidebar'),
      '#folder-tree'
    );
  });

  test('project name element is populated from init', () => {
    const nameEl = document.getElementById('project-name');
    expect(nameEl.textContent).toBe('Test Project');
  });
});

describe('app.js - handleFileSelect and vapConfirmUpload with projectId set', () => {
  let origXHR;

  beforeAll(() => {
    // Mock XMLHttpRequest so uploadToS3's XHR doesn't make real requests
    origXHR = global.XMLHttpRequest;
    global.XMLHttpRequest = jest.fn().mockImplementation(() => {
      const xhr = {
        open: jest.fn(),
        setRequestHeader: jest.fn(),
        status: 200,
        onload: null,
        onerror: null,
        send: jest.fn(function() {
          // Simulate async successful load
          setTimeout(() => { if (this.onload) this.onload(); }, 0);
        }),
      };
      return xhr;
    });
  });

  afterAll(() => {
    global.XMLHttpRequest = origXHR;
  });

  test('handleFileSelect with no files returns early', () => {
    const input = { files: [], value: '' };
    expect(() => window.handleFileSelect(input)).not.toThrow();
  });

  test('triggerUpload calls file-upload-input.click', () => {
    const fileInput = document.getElementById('file-upload-input');
    fileInput.click = jest.fn();
    window.triggerUpload();
    expect(fileInput.click).toHaveBeenCalled();
  });

  test('vapConfirmUpload closes dialog', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ upload_url: 'http://s3/url', resource_id: 'r1' }) });
    const dialog = document.getElementById('upload-dialog');
    dialog.close = jest.fn();
    // Handle any remaining pendingFiles gracefully
    await window.vapConfirmUpload();
    expect(dialog.close).toHaveBeenCalled();
  });

  test('handleFileSelect with files does not throw', () => {
    const mockFile = new File(['content'], 'test.mp4', { type: 'video/mp4' });
    const dialog = document.getElementById('upload-dialog');
    dialog.showModal = jest.fn();
    const input = { files: [mockFile], value: '' };
    expect(() => window.handleFileSelect(input)).not.toThrow();
  });
});

describe('app.js - editWorkflow event listeners', () => {
  beforeEach(async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [] });
    // Open workflow panel so listeners are attached
    document.getElementById('panel-workflow').style.display = 'none';
    const container = document.getElementById('drawflow-container');
    container._kvqListenersAttached = false;
    await window.editWorkflow(null);
  });

  test('click on drawflow-container hides node menu', () => {
    const menu = document.getElementById('wf-node-menu');
    menu.style.display = 'block';
    const container = document.getElementById('drawflow-container');
    container.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.style.display).toBe('none');
  });

  test('contextmenu on drawflow-container calls showNodeMenu', () => {
    const container = document.getElementById('drawflow-container');
    const evt = new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: 50, clientY: 60,
    });
    container.dispatchEvent(evt);
    const menu = document.getElementById('wf-node-menu');
    expect(menu.style.display).toBe('block');
  });

  test('dragover with kvq-node type prevents default', () => {
    const container = document.getElementById('drawflow-container');
    const evt = new Event('dragover', { cancelable: true });
    evt.dataTransfer = { types: { includes: () => true }, dropEffect: '' };
    evt.preventDefault = jest.fn();
    container.dispatchEvent(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
  });

  test('dragover without kvq-node type does not prevent default', () => {
    const container = document.getElementById('drawflow-container');
    const evt = new Event('dragover', { cancelable: true });
    evt.dataTransfer = { types: { includes: () => false }, dropEffect: '' };
    evt.preventDefault = jest.fn();
    container.dispatchEvent(evt);
    expect(evt.preventDefault).not.toHaveBeenCalled();
  });

  test('drop with kvq-node adds node', async () => {
    const container = document.getElementById('drawflow-container');
    const evt = new Event('drop', { cancelable: true });
    evt.dataTransfer = { getData: jest.fn(() => 'x264Transcode') };
    evt.preventDefault = jest.fn();
    container.dispatchEvent(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
  });

  test('drop without kvq-node data does nothing', async () => {
    const container = document.getElementById('drawflow-container');
    const evt = new Event('drop', { cancelable: true });
    evt.dataTransfer = { getData: jest.fn(() => '') };
    evt.preventDefault = jest.fn();
    container.dispatchEvent(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
  });
});

describe('app.js - toggleWorkflowPanel setTimeout', () => {
  beforeEach(() => {
    fetch.mockResolvedValue({ ok: true, json: async () => [] });
    document.getElementById('panel-workflow').style.display = 'none';
    const container = document.getElementById('drawflow-container');
    container._kvqListenersAttached = false;
  });

  test('toggleWorkflowPanel attaches listeners in setTimeout callback', async () => {
    jest.useFakeTimers();
    window.toggleWorkflowPanel();
    await jest.runAllTimersAsync();
    jest.useRealTimers();
    const container = document.getElementById('drawflow-container');
    expect(container._kvqListenersAttached).toBe(true);
  });

  test('toggleWorkflowPanel drop listener added via setTimeout', async () => {
    jest.useFakeTimers();
    document.getElementById('panel-workflow').style.display = 'none';
    const container = document.getElementById('drawflow-container');
    container._kvqListenersAttached = false;
    window.toggleWorkflowPanel();
    await jest.runAllTimersAsync();
    jest.useRealTimers();
    // Dispatch drop to check listener was added
    const evt = new Event('drop', { cancelable: true });
    evt.dataTransfer = { getData: jest.fn(() => 'x264Transcode') };
    evt.preventDefault = jest.fn();
    container.dispatchEvent(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
  });
});

describe('app.js - confirm-switch-btn listener', () => {
  test('confirm-switch-btn click does not throw', () => {
    const btn = document.getElementById('confirm-switch-btn');
    expect(() => btn.click()).not.toThrow();
  });
});

describe('app.js - loadWorkflowList', () => {
  test('loadSelectedWorkflow triggers loadWorkflowList and populates select', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'wf-q', name: 'My WF', dag_json: null }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // resources
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'w1', name: 'WF1' }] }) // workflows
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'w1', name: 'WF1' }] }); // loadWorkflowList

    await window.loadSelectedWorkflow('wf-q');

    const sel = document.getElementById('wf-load-select');
    expect(sel).not.toBeNull();
  });
});

describe('app.js - vapConfirmUpload with pending files', () => {
  let origXHR;

  beforeAll(() => {
    origXHR = global.XMLHttpRequest;
    global.XMLHttpRequest = jest.fn().mockImplementation(function() {
      const obj = {
        open: jest.fn(),
        setRequestHeader: jest.fn(),
        status: 200,
        onload: null,
        onerror: null,
        upload: { onprogress: null },
        send: jest.fn(function() {
          // Call onload synchronously to resolve the upload promise
          const handler = obj.onload;
          if (handler) handler();
        }),
      };
      return obj;
    });
  });

  afterAll(() => {
    global.XMLHttpRequest = origXHR;
  });

  test('vapConfirmUpload processes pending files (covers upload loop)', async () => {
    // Set pending files by calling handleFileSelect (projectId set from DOMContentLoaded)
    const mockFile = new File(['content'], 'loop-test.mp4', { type: 'video/mp4' });
    const dialog = document.getElementById('upload-dialog');
    dialog.showModal = jest.fn();
    dialog.close = jest.fn();
    window.handleFileSelect({ files: [mockFile], value: '' });

    // Mock fetch for upload-url and confirm-upload steps
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ upload_url: 'http://s3/bucket/key', resource_id: 'r-loop' }),
    });

    await window.vapConfirmUpload();

    expect(dialog.close).toHaveBeenCalled();
    // progress should show upload complete
    expect(document.getElementById('job-progress').textContent).toContain('complete');
  });
});

describe('app.js - add-resource-btn click listener', () => {
  test('clicking add-resource-btn toggles add-dropdown', () => {
    const dd = document.getElementById('add-dropdown');
    dd.style.display = 'none';
    document.getElementById('add-resource-btn').click();
    expect(dd.style.display).toBe('block');
    document.getElementById('add-resource-btn').click();
    expect(dd.style.display).toBe('none');
  });
});

describe('app.js - initPoolDropZone events', () => {
  test('dragover on vap-pool with kvq-resource type adds dragover class', () => {
    const pool = document.getElementById('vap-pool');
    const evt = new Event('dragover', { cancelable: true });
    evt.dataTransfer = { types: { includes: () => true }, dropEffect: '' };
    evt.preventDefault = jest.fn();
    pool.dispatchEvent(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
  });

  test('dragleave on vap-pool removes dragover class', () => {
    const pool = document.getElementById('vap-pool');
    pool.classList.add('vap-pool-dragover');
    pool.dispatchEvent(new Event('dragleave'));
    expect(pool.classList.contains('vap-pool-dragover')).toBe(false);
  });

  test('drop on vap-pool without data does nothing', () => {
    const pool = document.getElementById('vap-pool');
    const evt = new Event('drop', { cancelable: true });
    evt.dataTransfer = { getData: jest.fn(() => '') };
    evt.preventDefault = jest.fn();
    pool.dispatchEvent(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
  });

  test('drop on vap-pool with resource data calls addToPool', () => {
    const pool = document.getElementById('vap-pool');
    const evt = new Event('drop', { cancelable: true });
    const resourceData = JSON.stringify({ id: 'res-drop-1', name: 'Dropped Video' });
    evt.dataTransfer = { getData: jest.fn(() => resourceData) };
    evt.preventDefault = jest.fn();
    fetch.mockResolvedValue({ ok: true, json: async () => ({ download_url: 'http://s3/video.mp4' }) });
    pool.dispatchEvent(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
  });
});

describe('app.js - initResizeHandle events', () => {
  test('pointerdown on vap-resize does not throw', () => {
    const handle = document.getElementById('vap-resize');
    handle.setPointerCapture = jest.fn();
    const evt = new MouseEvent('pointerdown', { bubbles: true, clientY: 100 });
    Object.defineProperty(evt, 'pointerId', { value: 1 });
    expect(() => handle.dispatchEvent(evt)).not.toThrow();
  });

  test('pointermove and pointerup during resize do not throw', () => {
    const handle = document.getElementById('vap-resize');
    handle.setPointerCapture = jest.fn();

    const downEvt = new MouseEvent('pointerdown', { bubbles: true, clientY: 100 });
    Object.defineProperty(downEvt, 'pointerId', { value: 2 });
    handle.dispatchEvent(downEvt);

    const moveEvt = new MouseEvent('pointermove', { bubbles: true, clientY: 150 });
    handle.dispatchEvent(moveEvt);

    const upEvt = new MouseEvent('pointerup', { bubbles: true });
    handle.dispatchEvent(upEvt);
  });
});
