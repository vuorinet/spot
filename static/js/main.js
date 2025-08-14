(() => {
  const d = document;
  const toast = d.getElementById('toast');
  const reloadBtn = d.getElementById('reloadNow');
  const countdownEl = d.getElementById('countdown');


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
        const event = JSON.parse(ev.data);
        
        // Handle version updates
        if (event.type === 'version' && event.version && event.version !== currentVersion) {
          scheduleReloadToast();
        }
        
        // Handle cache updates (midnight rotation, new data arrivals)
        if (event.type === 'cache_rotated' || event.type === 'today_updated' || event.type === 'tomorrow_updated') {
          console.log(`Cache event received: ${event.type}`, event);
          window.refreshCharts();
        }
      };
      es.onerror = () => {
        es.close();
        console.warn('SSE connection error, falling back to polling for version updates.');
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

  // Global function to refresh charts
  window.refreshCharts = function() {
    // Trigger HTMX refresh for both charts
    const margin = d.body.getAttribute('data-default-margin') || '0';
    htmx.ajax('GET', `/partials/prices?date=today&margin=${margin}`, {target: '#todayChart', swap: 'outerHTML'});
    htmx.ajax('GET', `/partials/prices?date=tomorrow&margin=${margin}`, {target: '#tomorrowChart', swap: 'outerHTML'});
  };
})();
