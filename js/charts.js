let chart = null;

export function renderChart(reportData) {
  const container = document.getElementById('echart-container');
  if (!container) return;

  if (chart) chart.dispose();
  chart = echarts.init(container);

  window._reportData = reportData;
  const header = reportData.header;
  const metrics = header.metrics || [];
  const series = [];

  for (const metric of metrics) {
    const metricData = reportData[metric];
    if (!metricData) continue;

    for (const [distIdx, frames] of Object.entries(metricData)) {
      const points = Object.entries(frames)
        .map(([f, v]) => [Number(f), Number(v)])
        .sort((a, b) => a[0] - b[0]);

      const distName = header.dist?.[distIdx] || `dist ${distIdx}`;
      series.push({
        name: `${metric.toUpperCase()} — ${distName}`,
        type: 'line',
        data: points,
        smooth: false,
        symbol: 'none',
        lineStyle: { width: 1.5 },
      });
    }
  }

  chart.setOption({
    title: { text: 'Per-Frame Metrics', textStyle: { color: '#eee' } },
    tooltip: { trigger: 'axis' },
    legend: { top: 30, textStyle: { color: '#999' } },
    grid: { top: 80, bottom: 40, left: 60, right: 20 },
    xAxis: { type: 'value', name: 'Frame', nameTextStyle: { color: '#999' } },
    yAxis: { type: 'value', name: 'Score', nameTextStyle: { color: '#999' } },
    series,
    backgroundColor: 'transparent',
  });

  chart.on('click', (params) => {
    if (params.data) {
      const frame = params.data[0];
      const video = document.getElementById('shaka-video');
      if (video && video.duration) {
        video.currentTime = frame / 30;
        window.showPanel('player');
      }
    }
  });

  window.addEventListener('resize', () => chart?.resize());
}

export async function loadReport(resourceId, projectId) {
  const resp = await fetch(`/v1/projects/${projectId}/resources/${resourceId}/download-url`);
  const urlData = await resp.json();

  const reportResp = await fetch(urlData.download_url);
  const reportData = await reportResp.json();

  renderChart(reportData);
  window.showPanel('chart');
}
