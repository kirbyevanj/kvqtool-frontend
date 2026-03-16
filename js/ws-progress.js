let ws = null;

export function connectJobWS(jobId) {
  if (ws) ws.close();

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/v1/jobs/${jobId}/ws`);

  const progressEl = document.getElementById('job-progress');

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case 'progress':
        progressEl.textContent = `Encoding: ${msg.progress_pct}% (frame ${msg.current_frame}/${msg.total_frames}) ${msg.fps ? msg.fps.toFixed(1) + ' fps' : ''}`;
        break;
      case 'status':
        progressEl.textContent = `Job ${msg.status}`;
        if (msg.status === 'completed' || msg.status === 'failed') {
          ws.close();
        }
        break;
      case 'error':
        progressEl.textContent = `Error: ${msg.message}`;
        break;
    }
  };

  ws.onerror = () => {
    progressEl.textContent = 'WebSocket connection error';
  };

  ws.onclose = () => {
    ws = null;
  };
}

export function disconnectJobWS() {
  if (ws) {
    ws.close();
    ws = null;
  }
}
