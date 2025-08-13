(() => {
  const d = document;
  const toast = d.getElementById('toast');
  const reloadBtn = d.getElementById('reloadNow');
  const countdownEl = d.getElementById('countdown');
  const nowLine = d.getElementById('nowLine');

  // Maintain yellow "now" line position across the two charts (assumes 24h grid width)
  function updateNowLine() {
    const charts = d.querySelector('.charts');
    const todayChart = d.getElementById('todayChart');
    if (!charts || !todayChart) return;
    const rect = todayChart.getBoundingClientRect();
    const now = new Date();
    const minutes = now.getMinutes() + now.getHours() * 60;
    const pct = minutes / (24 * 60);
    const x = rect.left + rect.width * pct;
    const pageX = x + window.scrollX - charts.getBoundingClientRect().left;
    nowLine.style.left = `${pageX}px`;
  }
  setInterval(updateNowLine, 60 * 1000);
  window.addEventListener('resize', updateNowLine);
  window.addEventListener('load', updateNowLine);

  // Keep-awake via Screen Wake Lock API
  const keepAwake = d.getElementById('keepAwake');
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {});
    } catch (e) {
      console.warn('Wake Lock not available', e);
    }
  }
  keepAwake?.addEventListener('change', (e) => {
    if (e.target.checked) {
      requestWakeLock();
    } else {
      wakeLock?.release?.();
      wakeLock = null;
    }
  });

  // Version auto-reload SSE fallback to polling
  const currentVersion = d.body.getAttribute('data-app-version');
  let notified = false;
  function scheduleReloadToast() {
    if (notified) return; notified = true;
    toast.classList.remove('hidden');
    let sec = 5;
    countdownEl.textContent = `(${sec})`;
    const timer = setInterval(() => {
      sec -= 1; countdownEl.textContent = `(${sec})`;
      if (sec <= 0) { clearInterval(timer); location.reload(); }
    }, 1000);
  }
  reloadBtn?.addEventListener('click', () => location.reload());
  function beginVersionWatch() {
    if (!!window.EventSource) {
      const es = new EventSource('/events/version');
      es.onmessage = (ev) => {
        const { version } = JSON.parse(ev.data);
        if (version && version !== currentVersion) scheduleReloadToast();
      };
      es.onerror = () => {
        es.close();
        setInterval(checkVersion, 60000);
      };
    } else {
      setInterval(checkVersion, 60000);
    }
  }
  async function checkVersion() {
    try {
      const r = await fetch('/version');
      const j = await r.json();
      if (j.version && j.version !== currentVersion) scheduleReloadToast();
    } catch {}
  }
  beginVersionWatch();
})();
