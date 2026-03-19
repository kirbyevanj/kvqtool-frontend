/**
 * Unit tests for ws-progress.js
 * Tests WebSocket connection, message handling, and disconnection.
 */

import { jest } from '@jest/globals';

// Set up DOM
document.body.innerHTML = '<div id="job-progress"></div>';

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.CONNECTING;
    MockWebSocket.instances.push(this);
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this.close = jest.fn(() => {
      this.readyState = WebSocket.CLOSED;
      if (this.onclose) this.onclose();
    });
  }

  static instances = [];
  static reset() {
    MockWebSocket.instances = [];
  }
}
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;

global.WebSocket = MockWebSocket;

// Mock location
Object.defineProperty(window, 'location', {
  value: { protocol: 'http:', host: 'localhost' },
  writable: true,
});

beforeEach(() => {
  MockWebSocket.reset();
  document.getElementById('job-progress').textContent = '';
});

describe('connectJobWS', () => {
  test('creates a WebSocket connection to correct URL', async () => {
    const { connectJobWS } = await import('../js/ws-progress.js');

    connectJobWS('job-123');

    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost/v1/jobs/job-123/ws');
  });

  test('uses wss:// when on https', async () => {
    const { connectJobWS } = await import('../js/ws-progress.js');

    window.location.protocol = 'https:';
    connectJobWS('job-456');
    window.location.protocol = 'http:';

    const wsUrl = MockWebSocket.instances[MockWebSocket.instances.length - 1].url;
    expect(wsUrl).toMatch(/^wss:/);
  });

  test('shows progress message on progress event', async () => {
    const { connectJobWS } = await import('../js/ws-progress.js');

    connectJobWS('job-789');
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    ws.onmessage({
      data: JSON.stringify({
        type: 'progress',
        progress_pct: 42,
        current_frame: 100,
        total_frames: 240,
        fps: 25.5,
      }),
    });

    const progressEl = document.getElementById('job-progress');
    expect(progressEl.textContent).toContain('42%');
    expect(progressEl.textContent).toContain('100/240');
    expect(progressEl.textContent).toContain('25.5');
  });

  test('shows status message on status event', async () => {
    const { connectJobWS } = await import('../js/ws-progress.js');

    connectJobWS('job-status');
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    ws.onmessage({ data: JSON.stringify({ type: 'status', status: 'running' }) });

    const progressEl = document.getElementById('job-progress');
    expect(progressEl.textContent).toContain('running');
  });

  test('closes WebSocket on completed status', async () => {
    const { connectJobWS } = await import('../js/ws-progress.js');

    connectJobWS('job-complete');
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    ws.onmessage({ data: JSON.stringify({ type: 'status', status: 'completed' }) });

    expect(ws.close).toHaveBeenCalled();
  });

  test('closes WebSocket on failed status', async () => {
    const { connectJobWS } = await import('../js/ws-progress.js');

    connectJobWS('job-fail');
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    ws.onmessage({ data: JSON.stringify({ type: 'status', status: 'failed' }) });

    expect(ws.close).toHaveBeenCalled();
  });

  test('shows error message on error event', async () => {
    const { connectJobWS } = await import('../js/ws-progress.js');

    connectJobWS('job-err');
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    ws.onmessage({ data: JSON.stringify({ type: 'error', message: 'something went wrong' }) });

    const progressEl = document.getElementById('job-progress');
    expect(progressEl.textContent).toContain('Error');
    expect(progressEl.textContent).toContain('something went wrong');
  });

  test('shows connection error on WebSocket onerror', async () => {
    const { connectJobWS } = await import('../js/ws-progress.js');

    connectJobWS('job-wserr');
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    ws.onerror();

    const progressEl = document.getElementById('job-progress');
    expect(progressEl.textContent).toContain('error');
  });

  test('closes existing connection before opening new one', async () => {
    const { connectJobWS } = await import('../js/ws-progress.js');

    connectJobWS('job-first');
    const ws1 = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    connectJobWS('job-second');

    expect(ws1.close).toHaveBeenCalled();
  });
});

describe('disconnectJobWS', () => {
  test('closes active WebSocket', async () => {
    const { connectJobWS, disconnectJobWS } = await import('../js/ws-progress.js');

    connectJobWS('job-disconnect');
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    disconnectJobWS();

    expect(ws.close).toHaveBeenCalled();
  });

  test('is safe to call when no connection is open', async () => {
    const { disconnectJobWS } = await import('../js/ws-progress.js');

    // Should not throw
    expect(() => disconnectJobWS()).not.toThrow();
  });
});
