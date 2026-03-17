// MediaBackend abstraction layer.
// MSEBackend: mp4box.js demux -> MediaSource SourceBuffer (frame-accurate)
// DashBackend: DASH manifests via dash.js
// NativeBackend: fallback for non-MP4
// Factory: createBackend(url, videoEl) auto-selects based on URL.

class MSEBackend {
  constructor(videoEl) {
    this._video = videoEl;
    this._mediaSource = null;
    this._mp4File = null;
    this._sourceBuffers = {};
    this._pendingBuffers = {};
    this._ready = false;
    this._url = null;
  }

  load(url) {
    this.destroy();
    this._url = url;
    this._mediaSource = new MediaSource();
    this._video.src = URL.createObjectURL(this._mediaSource);

    this._mediaSource.addEventListener('sourceopen', () => {
      this._initMP4Box();
      this._fetchAndAppend(url);
    }, { once: true });
  }

  _initMP4Box() {
    this._mp4File = MP4Box.createFile();

    this._mp4File.onReady = (info) => {
      this._ready = true;
      const dur = info.isFragmented
        ? info.fragment_duration / info.timescale
        : info.duration / info.timescale;

      if (this._mediaSource.readyState === 'open') {
        this._mediaSource.duration = dur;
      }

      for (const track of info.tracks) {
        this._addTrack(track);
      }

      const initSegs = this._mp4File.initializeSegmentation();
      for (const seg of initSegs) {
        const sb = seg.user;
        if (sb && !sb.updating) {
          sb.appendBuffer(seg.buffer);
        }
      }

      this._mp4File.start();
    };

    this._mp4File.onSegment = (id, sb, buffer, sampleNum, isLast) => {
      if (!this._pendingBuffers[id]) this._pendingBuffers[id] = [];
      this._pendingBuffers[id].push({ buffer, sampleNum, isLast });
      this._flushPending(id, sb);
    };

    this._mp4File.onError = (e) => {
      console.error('mp4box error:', e);
    };
  }

  _addTrack(track) {
    const codec = `video/mp4; codecs="${track.codec}"`;
    if (!MediaSource.isTypeSupported(codec)) {
      console.warn('Unsupported codec:', codec);
      return;
    }
    const sb = this._mediaSource.addSourceBuffer(codec);
    sb.mode = 'segments';
    this._sourceBuffers[track.id] = sb;
    this._pendingBuffers[track.id] = [];

    sb.addEventListener('updateend', () => {
      this._flushPending(track.id, sb);
    });

    this._mp4File.setSegmentOptions(track.id, sb, { nbSamples: 100 });
  }

  _flushPending(id, sb) {
    if (!this._pendingBuffers[id] || sb.updating) return;
    if (this._mediaSource.readyState !== 'open') return;

    const next = this._pendingBuffers[id].shift();
    if (!next) {
      if (this._allFlushed() && this._allLast()) {
        try { this._mediaSource.endOfStream(); } catch (e) {}
      }
      return;
    }

    this._evictBuffer(sb);

    try {
      sb.appendBuffer(next.buffer);
      if (next.sampleNum) {
        this._mp4File.releaseUsedSamples(id, next.sampleNum);
      }
      sb._isLast = next.isLast;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        this._evictBuffer(sb, true);
        try {
          sb.appendBuffer(next.buffer);
          sb._isLast = next.isLast;
        } catch (e2) {
          this._pendingBuffers[id].unshift(next);
        }
      } else {
        console.error('appendBuffer error:', e);
      }
    }
  }

  _evictBuffer(sb, aggressive) {
    if (sb.updating) return;
    const currentTime = this._video.currentTime;
    const behind = aggressive ? 5 : 30;
    const buffered = sb.buffered;
    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      if (end < currentTime - behind) {
        try { sb.remove(start, end); } catch (e) {}
        return;
      }
      if (start < currentTime - behind) {
        try { sb.remove(start, currentTime - behind); } catch (e) {}
        return;
      }
    }
  }

  _allFlushed() {
    for (const id in this._pendingBuffers) {
      if (this._pendingBuffers[id].length > 0) return false;
    }
    return true;
  }

  _allLast() {
    for (const id in this._sourceBuffers) {
      if (!this._sourceBuffers[id]._isLast) return false;
    }
    return true;
  }

  async _fetchAndAppend(url) {
    try {
      const response = await fetch(url);
      const reader = response.body.getReader();
      let offset = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          this._mp4File.flush();
          break;
        }

        const buf = value.buffer;
        buf.fileStart = offset;
        offset += buf.byteLength;
        this._mp4File.appendBuffer(buf);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    }
  }

  play() { return this._video.play(); }
  pause() { this._video.pause(); }
  seek(time) { this._video.currentTime = time; }
  getCurrentTime() { return this._video.currentTime; }
  getDuration() { return this._video.duration || 0; }
  getVideoElement() { return this._video; }

  destroy() {
    this._video.pause();
    if (this._mp4File) {
      try { this._mp4File.stop(); } catch (e) {}
      this._mp4File = null;
    }
    if (this._mediaSource && this._mediaSource.readyState === 'open') {
      try { this._mediaSource.endOfStream(); } catch (e) {}
    }
    this._sourceBuffers = {};
    this._pendingBuffers = {};
    this._ready = false;
    this._video.removeAttribute('src');
    this._video.load();
  }
}

class NativeBackend {
  constructor(videoEl) {
    this._video = videoEl;
  }

  load(url) {
    this._video.src = url;
    this._video.load();
  }

  play() { return this._video.play(); }
  pause() { this._video.pause(); }
  seek(time) { this._video.currentTime = time; }
  getCurrentTime() { return this._video.currentTime; }
  getDuration() { return this._video.duration || 0; }
  getVideoElement() { return this._video; }

  destroy() {
    this._video.pause();
    this._video.removeAttribute('src');
    this._video.load();
  }
}

class DashBackend {
  constructor(videoEl) {
    this._video = videoEl;
    this._player = null;
  }

  load(url) {
    this.destroy();
    if (typeof dashjs === 'undefined') {
      console.error('dash.js not loaded, falling back to native');
      this._video.src = url;
      this._video.load();
      return;
    }
    this._player = dashjs.MediaPlayer().create();
    this._player.initialize(this._video, url, false);
  }

  play() { return this._video.play(); }
  pause() { this._video.pause(); }
  seek(time) {
    if (this._player) this._player.seek(time);
    else this._video.currentTime = time;
  }
  getCurrentTime() { return this._video.currentTime; }
  getDuration() { return this._video.duration || 0; }
  getVideoElement() { return this._video; }

  destroy() {
    if (this._player) {
      this._player.reset();
      this._player = null;
    }
  }
}

function isManifestURL(url) {
  const path = url.split('?')[0].toLowerCase();
  return path.endsWith('.mpd') || path.endsWith('.m3u8');
}

function isMSESupported() {
  return typeof MediaSource !== 'undefined' && typeof MP4Box !== 'undefined';
}

export function createBackend(url, videoEl) {
  if (isManifestURL(url)) return new DashBackend(videoEl);
  if (isMSESupported()) return new MSEBackend(videoEl);
  return new NativeBackend(videoEl);
}

export { MSEBackend, NativeBackend, DashBackend };
