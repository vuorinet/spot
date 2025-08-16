(() => {
  const d = document;
  const toast = d.getElementById('toast');
  const reloadBtn = d.getElementById('reloadNow');
  const countdownEl = d.getElementById('countdown');


  // Keep-awake via URL query parameter
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        console.log('Wake lock released');
      });
      console.log('Wake lock activated');
    } catch (e) {
      console.warn('Wake Lock not available', e);
    }
  }
  
  // Check URL parameter for keep-awake
  const urlParams = new URLSearchParams(window.location.search);
  const keepAwakeParam = urlParams.get('keepAwake') || urlParams.get('keep-awake');
  if (keepAwakeParam === 'true' || keepAwakeParam === '1') {
    console.log('Keep-awake enabled via URL parameter');
    requestWakeLock();
  }

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

  // Function to update yellow line immediately
  window.updateNowLineImmediately = function() {
    const todayChartElement = d.querySelector('#todayChart [id*="googleChart"]');
    if (todayChartElement && todayChartElement._chart && todayChartElement._validData && window.addNowLine) {
      console.log('Updating yellow line immediately due to focus/visibility change');
      // Remove existing line
      const svgElement = todayChartElement.querySelector('svg');
      if (svgElement) {
        const existingLines = svgElement.querySelectorAll('.now-line');
        existingLines.forEach(line => line.remove());
      }
      // Add new line at current time
      window.addNowLine(todayChartElement._chart, todayChartElement, todayChartElement._validData);
    }
  };

  // Function to hide yellow line when window goes to background
  window.hideNowLine = function() {
    const todayChartElement = d.querySelector('#todayChart [id*="googleChart"]');
    if (todayChartElement) {
      console.log('Hiding yellow line - window in background');
      const svgElement = todayChartElement.querySelector('svg');
      if (svgElement) {
        const existingLines = svgElement.querySelectorAll('.now-line');
        existingLines.forEach(line => line.remove());
      }
    }
  };

  // Track the current date to detect midnight transitions
  let lastKnownDate = new Date().toDateString();

  // Function to check if date has changed and refresh if needed
  window.checkDateChange = function() {
    const currentDate = new Date().toDateString();
    if (currentDate !== lastKnownDate) {
      console.log('Date changed detected:', lastKnownDate, '->', currentDate);
      lastKnownDate = currentDate;
      // Date has changed - refresh charts to get new data
      window.refreshCharts();
      return true;
    }
    return false;
  };

  // Listen for window focus and visibility changes
  window.addEventListener('focus', () => {
    console.log('Window focused - checking for date change and updating yellow line');
    if (!window.checkDateChange()) {
      // Only update yellow line if date didn't change (charts would be refreshed anyway)
      window.updateNowLineImmediately();
    }
  });

  // Note: We don't hide on blur because the window might still be visible
  // (e.g., side-by-side windows on desktop). Only hide when actually not visible.

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('Document became visible - checking for date change and updating yellow line');
      if (!window.checkDateChange()) {
        // Only update yellow line if date didn't change (charts would be refreshed anyway)
        window.updateNowLineImmediately();
      }
    } else {
      console.log('Document became hidden - hiding yellow line');
      window.hideNowLine();
    }
  });

  // Listen for wake lock events (when screen is re-enabled)
  if ('wakeLock' in navigator) {
    // Unfortunately, there's no direct wake lock event, but we can detect when
    // the page regains focus after potential screen sleep
    let wasHidden = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        wasHidden = true;
      } else if (wasHidden) {
        console.log('Screen likely re-enabled - checking for date change and updating yellow line');
        setTimeout(() => {
          if (!window.checkDateChange()) {
            window.updateNowLineImmediately();
          }
        }, 100); // Small delay to ensure everything is ready
        wasHidden = false;
      }
    });
  }

  // Periodic date check as backup (every 5 minutes when page is visible)
  setInterval(() => {
    if (!document.hidden) {
      window.checkDateChange();
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Handle orientation changes and window resize for responsive charts
  let resizeTimeout;
  function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      console.log('Window resized or orientation changed - refreshing charts');
      window.refreshCharts();
    }, 300); // Debounce resize events
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    // Small delay to ensure orientation change is complete
    setTimeout(handleResize, 100);
  });

  // Global function to refresh charts
  window.refreshCharts = function() {
    // Clean up any existing now line timers before refresh
    const todayChartElement = d.querySelector('#todayChart [id*="googleChart"]');
    const tomorrowChartElement = d.querySelector('#tomorrowChart [id*="googleChart"]');
    
    if (todayChartElement && todayChartElement._nowLineTimer) {
      clearInterval(todayChartElement._nowLineTimer);
      delete todayChartElement._nowLineTimer;
    }
    if (tomorrowChartElement && tomorrowChartElement._nowLineTimer) {
      clearInterval(tomorrowChartElement._nowLineTimer);
      delete tomorrowChartElement._nowLineTimer;
    }
    
    // Trigger HTMX refresh for both charts
    const margin = d.body.getAttribute('data-default-margin') || '0';
    htmx.ajax('GET', `/partials/prices?date=today&margin=${margin}`, {target: '#todayChart', swap: 'outerHTML'});
    htmx.ajax('GET', `/partials/prices?date=tomorrow&margin=${margin}`, {target: '#tomorrowChart', swap: 'outerHTML'});
  };
})();
