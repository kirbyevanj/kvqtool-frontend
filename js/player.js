export async function loadMedia(resourceId, projectId) {
  const resp = await fetch(`/v1/projects/${projectId}/resources/${resourceId}/download-url`);
  if (!resp.ok) {
    console.error('Failed to get download URL:', resp.status);
    return;
  }
  const data = await resp.json();

  const videoEl = document.getElementById('shaka-video');
  const canvas = document.getElementById('frame-canvas');

  videoEl.style.display = 'block';
  canvas.style.display = 'none';

  videoEl.src = data.download_url;
  videoEl.load();

  window.showPanel('player');
}
