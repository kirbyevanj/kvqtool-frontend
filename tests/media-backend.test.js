/**
 * Unit tests for media-backend.js
 * Tests NativeBackend, DashBackend, and createBackend factory.
 */
import { jest } from '@jest/globals';
import { NativeBackend, DashBackend, createBackend } from '../js/media-backend.js';

function makeVideoEl() {
  const video = document.createElement('video');
  video.play = jest.fn(() => Promise.resolve());
  video.pause = jest.fn();
  video.load = jest.fn();
  return video;
}

describe('NativeBackend', () => {
  test('load sets video src and calls load()', () => {
    const video = makeVideoEl();
    const backend = new NativeBackend(video);
    backend.load('http://example.com/video.mp4');
    expect(video.src).toContain('video.mp4');
    expect(video.load).toHaveBeenCalled();
  });

  test('play calls video.play()', () => {
    const video = makeVideoEl();
    const backend = new NativeBackend(video);
    backend.play();
    expect(video.play).toHaveBeenCalled();
  });

  test('pause calls video.pause()', () => {
    const video = makeVideoEl();
    const backend = new NativeBackend(video);
    backend.pause();
    expect(video.pause).toHaveBeenCalled();
  });

  test('seek sets currentTime', () => {
    const video = makeVideoEl();
    const backend = new NativeBackend(video);
    backend.seek(42.5);
    expect(video.currentTime).toBe(42.5);
  });

  test('getCurrentTime returns video.currentTime', () => {
    const video = makeVideoEl();
    video.currentTime = 10;
    const backend = new NativeBackend(video);
    expect(backend.getCurrentTime()).toBe(10);
  });

  test('getDuration returns video.duration or 0', () => {
    const video = makeVideoEl();
    const backend = new NativeBackend(video);
    expect(backend.getDuration()).toBe(0);
  });

  test('getDuration returns actual duration when set', () => {
    const video = makeVideoEl();
    Object.defineProperty(video, 'duration', { value: 120.5, writable: true });
    const backend = new NativeBackend(video);
    expect(backend.getDuration()).toBe(120.5);
  });

  test('getVideoElement returns the video element', () => {
    const video = makeVideoEl();
    const backend = new NativeBackend(video);
    expect(backend.getVideoElement()).toBe(video);
  });

  test('destroy pauses and clears src', () => {
    const video = makeVideoEl();
    const backend = new NativeBackend(video);
    backend.load('http://example.com/test.mp4');
    backend.destroy();
    expect(video.pause).toHaveBeenCalled();
    expect(video.load).toHaveBeenCalledTimes(2); // once for load, once for destroy
  });
});

describe('DashBackend', () => {
  test('load without dashjs falls back to video.src', () => {
    global.dashjs = undefined;
    const video = makeVideoEl();
    const backend = new DashBackend(video);
    backend.load('http://example.com/stream.mpd');
    expect(video.src).toContain('stream.mpd');
  });

  test('load with dashjs creates player', () => {
    const mockPlayer = {
      initialize: jest.fn(),
      reset: jest.fn(),
      seek: jest.fn(),
    };
    global.dashjs = {
      MediaPlayer: () => ({ create: () => mockPlayer }),
    };

    const video = makeVideoEl();
    const backend = new DashBackend(video);
    backend.load('http://example.com/stream.mpd');
    expect(mockPlayer.initialize).toHaveBeenCalled();
    delete global.dashjs;
  });

  test('pause calls video.pause()', () => {
    const video = makeVideoEl();
    const backend = new DashBackend(video);
    backend.pause();
    expect(video.pause).toHaveBeenCalled();
  });

  test('seek uses video.currentTime when no player', () => {
    global.dashjs = undefined;
    const video = makeVideoEl();
    const backend = new DashBackend(video);
    backend.seek(30);
    expect(video.currentTime).toBe(30);
  });

  test('seek uses player.seek() when player available', () => {
    const mockPlayer = {
      initialize: jest.fn(),
      reset: jest.fn(),
      seek: jest.fn(),
    };
    global.dashjs = {
      MediaPlayer: () => ({ create: () => mockPlayer }),
    };
    const video = makeVideoEl();
    const backend = new DashBackend(video);
    backend.load('http://example.com/stream.mpd');
    backend.seek(99);
    expect(mockPlayer.seek).toHaveBeenCalledWith(99);
    delete global.dashjs;
  });

  test('destroy resets player if present', () => {
    const mockPlayer = {
      initialize: jest.fn(),
      reset: jest.fn(),
      seek: jest.fn(),
    };
    global.dashjs = {
      MediaPlayer: () => ({ create: () => mockPlayer }),
    };
    const video = makeVideoEl();
    const backend = new DashBackend(video);
    backend.load('http://example.com/stream.mpd');
    backend.destroy();
    expect(mockPlayer.reset).toHaveBeenCalled();
    delete global.dashjs;
  });

  test('destroy without player is safe', () => {
    const video = makeVideoEl();
    const backend = new DashBackend(video);
    expect(() => backend.destroy()).not.toThrow();
  });

  test('play calls video.play()', () => {
    const video = makeVideoEl();
    const backend = new DashBackend(video);
    backend.play();
    expect(video.play).toHaveBeenCalled();
  });

  test('getCurrentTime returns video.currentTime', () => {
    const video = makeVideoEl();
    video.currentTime = 42;
    const backend = new DashBackend(video);
    expect(backend.getCurrentTime()).toBe(42);
  });

  test('getDuration returns video.duration', () => {
    const video = makeVideoEl();
    Object.defineProperty(video, 'duration', { value: 120, configurable: true });
    const backend = new DashBackend(video);
    expect(backend.getDuration()).toBe(120);
  });

  test('getVideoElement returns the video element', () => {
    const video = makeVideoEl();
    const backend = new DashBackend(video);
    expect(backend.getVideoElement()).toBe(video);
  });
});

describe('createBackend', () => {
  test('returns NativeBackend for .mp4 URL', () => {
    const video = makeVideoEl();
    const backend = createBackend('http://example.com/video.mp4', video);
    expect(backend).toBeInstanceOf(NativeBackend);
  });

  test('returns DashBackend for .mpd URL', () => {
    const video = makeVideoEl();
    const backend = createBackend('http://example.com/stream.mpd', video);
    expect(backend).toBeInstanceOf(DashBackend);
  });

  test('returns NativeBackend for .mp4 with query params', () => {
    const video = makeVideoEl();
    const backend = createBackend('http://example.com/video.mp4?token=abc', video);
    expect(backend).toBeInstanceOf(NativeBackend);
  });

  test('returns DashBackend for .mpd with query params', () => {
    const video = makeVideoEl();
    const backend = createBackend('http://example.com/stream.mpd?token=xyz', video);
    expect(backend).toBeInstanceOf(DashBackend);
  });

  test('returns NativeBackend for unknown extension', () => {
    const video = makeVideoEl();
    const backend = createBackend('http://example.com/video.webm', video);
    expect(backend).toBeInstanceOf(NativeBackend);
  });

  test('NativeBackend from factory can load and play', () => {
    const video = makeVideoEl();
    const backend = createBackend('http://example.com/v.mp4', video);
    backend.load('http://example.com/v.mp4');
    backend.play();
    expect(video.play).toHaveBeenCalled();
  });
});
