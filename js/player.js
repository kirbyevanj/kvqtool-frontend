let player = null;

export async function initPlayer(videoEl, url) {
  if (player) destroyPlayer();

  shaka.polyfill.installAll();
  if (!shaka.Player.isBrowserSupported()) {
    console.error('Shaka Player not supported');
    return;
  }

  player = new shaka.Player();
  await player.attach(videoEl);

  player.addEventListener('error', (e) => {
    console.error('Shaka error:', e.detail);
  });

  await player.load(url);
}

export function destroyPlayer() {
  if (player) {
    player.destroy();
    player = null;
  }
}

export async function loadMedia(resourceId, projectId) {
  const resp = await fetch(`/v1/projects/${projectId}/resources/${resourceId}/download-url`);
  const data = await resp.json();

  const videoEl = document.getElementById('shaka-video');
  videoEl.style.display = 'block';
  document.getElementById('frame-canvas').style.display = 'none';

  await initPlayer(videoEl, data.download_url);
  window.showPanel('player');
}

export { player };
