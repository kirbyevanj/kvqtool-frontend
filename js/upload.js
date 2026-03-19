export async function uploadToS3(projectId, file) {
  const progressEl = document.getElementById('job-progress');
  progressEl.textContent = `Uploading ${file.name}...`;

  const urlResp = await fetch(`/v1/projects/${projectId}/resources/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type || 'video/mp4',
      folder_id: null,
    }),
  });

  if (!urlResp.ok) {
    progressEl.textContent = 'Failed to get upload URL';
    return;
  }

  const { resource_id, upload_url } = await urlResp.json();

  try {
    await uploadWithProgress(upload_url, file, (pct) => {
      progressEl.textContent = `Uploading ${file.name}: ${pct}%`;
    });
  } catch (err) {
    progressEl.textContent = `Upload failed: ${err.message}`;
    return;
  }

  const confirmResp = await fetch(`/v1/projects/${projectId}/resources/${resource_id}/confirm-upload`, {
    method: 'POST',
  });

  if (confirmResp.ok) {
    progressEl.textContent = `${file.name} uploaded successfully`;
  } else {
    progressEl.textContent = 'Upload confirmation failed';
  }
}

function uploadWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(file);
  });
}
