// MediaBackend: NativeBackend for HTML5 video, DashBackend for .mpd manifests.
// All MP4 playback uses native <video> for smooth decode.
// Frame stepping uses paused video + explicit currentTime seeks.

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
    if (this._player) { this._player.reset(); this._player = null; }
  }
}

function isManifestURL(url) {
  const path = url.split('?')[0].toLowerCase();
  return path.endsWith('.mpd') || path.endsWith('.m3u8');
}

export function createBackend(url, videoEl) {
  if (isManifestURL(url)) return new DashBackend(videoEl);
  return new NativeBackend(videoEl);
}

export { NativeBackend, DashBackend };
