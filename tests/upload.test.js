/**
 * Unit tests for upload.js
 * Tests the uploadToS3 flow and uploadWithProgress using mocked browser APIs.
 */

import { jest } from '@jest/globals';

// Set up DOM elements before importing module
document.body.innerHTML = '<div id="job-progress"></div>';

// Mock fetch globally
global.fetch = jest.fn();

// Mock XMLHttpRequest
class MockXHR {
  constructor() {
    this.upload = { onprogress: null };
    this.onload = null;
    this.onerror = null;
    this.status = 200;
    this._headers = {};
    this.open = jest.fn();
    this.setRequestHeader = jest.fn((k, v) => { this._headers[k] = v; });
    this.send = jest.fn((data) => {
      // Simulate progress then completion
      if (this.upload.onprogress) {
        this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
        this.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
      }
      if (this.onload) this.onload();
    });
  }
}

global.XMLHttpRequest = jest.fn(() => new MockXHR());

// Helper to reset mocks between tests
beforeEach(() => {
  fetch.mockReset();
  XMLHttpRequest.mockClear();
  document.getElementById('job-progress').textContent = '';
});

describe('uploadToS3', () => {
  test('shows uploading message and calls upload-url endpoint', async () => {
    const { uploadToS3 } = await import('../js/upload.js');

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resource_id: 'rid-123', upload_url: 'http://s3/upload' }),
    });
    // confirm-upload response
    fetch.mockResolvedValueOnce({ ok: true });

    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
    await uploadToS3('proj-1', file);

    const progressEl = document.getElementById('job-progress');
    expect(progressEl.textContent).toContain('uploaded successfully');
    expect(fetch).toHaveBeenCalledWith(
      '/v1/projects/proj-1/resources/upload-url',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('shows error message when upload-url fetch fails', async () => {
    const { uploadToS3 } = await import('../js/upload.js');

    fetch.mockResolvedValueOnce({ ok: false });

    const file = new File(['content'], 'fail.mp4', { type: 'video/mp4' });
    await uploadToS3('proj-1', file);

    const progressEl = document.getElementById('job-progress');
    expect(progressEl.textContent).toContain('Failed');
  });

  test('sends correct filename and content_type in body', async () => {
    const { uploadToS3 } = await import('../js/upload.js');

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resource_id: 'rid-abc', upload_url: 'http://s3/upload' }),
    });
    fetch.mockResolvedValueOnce({ ok: true });

    const file = new File(['data'], 'movie.mp4', { type: 'video/mp4' });
    await uploadToS3('my-project', file);

    const [, options] = fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.filename).toBe('movie.mp4');
    expect(body.content_type).toBe('video/mp4');
  });

  test('calls confirm-upload endpoint after S3 upload', async () => {
    const { uploadToS3 } = await import('../js/upload.js');

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resource_id: 'rid-xyz', upload_url: 'http://s3/upload' }),
    });
    fetch.mockResolvedValueOnce({ ok: true });

    const file = new File(['data'], 'test.mp4', { type: 'video/mp4' });
    await uploadToS3('proj-2', file);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe('/v1/projects/proj-2/resources/rid-xyz/confirm-upload');
  });

  test('shows failure message when confirm-upload fails', async () => {
    const { uploadToS3 } = await import('../js/upload.js');

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resource_id: 'rid-fail', upload_url: 'http://s3/upload' }),
    });
    fetch.mockResolvedValueOnce({ ok: false });

    const file = new File(['data'], 'test.mp4', { type: 'video/mp4' });
    await uploadToS3('proj-3', file);

    const progressEl = document.getElementById('job-progress');
    expect(progressEl.textContent).toContain('failed');
  });

  test('uses video/mp4 as default content_type when file type is empty', async () => {
    const { uploadToS3 } = await import('../js/upload.js');

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resource_id: 'rid-def', upload_url: 'http://s3/upload' }),
    });
    fetch.mockResolvedValueOnce({ ok: true });

    // File with no type
    const file = new File(['data'], 'noext');
    Object.defineProperty(file, 'type', { value: '' });
    await uploadToS3('proj-4', file);

    const [, options] = fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.content_type).toBe('video/mp4');
  });

  test('rejects with error when XHR returns non-2xx status', async () => {
    const { uploadToS3 } = await import('../js/upload.js');

    // Override MockXHR to simulate a 403 response
    const origXHR = global.XMLHttpRequest;
    global.XMLHttpRequest = jest.fn(() => {
      const xhr = {
        upload: { onprogress: null },
        onload: null,
        onerror: null,
        status: 403,
        open: jest.fn(),
        setRequestHeader: jest.fn(),
        send: jest.fn(function() { if (this.onload) this.onload(); }),
      };
      return xhr;
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resource_id: 'rid-403', upload_url: 'http://s3/upload' }),
    });

    const file = new File(['data'], 'test.mp4', { type: 'video/mp4' });
    await uploadToS3('proj-5', file);

    const progressEl = document.getElementById('job-progress');
    expect(progressEl.textContent).toContain('failed');
    global.XMLHttpRequest = origXHR;
  });
});
