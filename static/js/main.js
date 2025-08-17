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
          
          // Show notification for important price updates
          if (event.type === 'tomorrow_updated') {
            const reason = event.reason || 'new data available';
            console.log(`Tomorrow's prices updated: ${reason}`);
            
            // Show a brief notification for tomorrow price updates
            const existingNotification = d.querySelector('.price-update-notification');
            if (existingNotification) {
              existingNotification.remove();
            }
            
            const notification = d.createElement('div');
            notification.className = 'price-update-notification';
            notification.style.cssText = `
              position: fixed;
              top: 20px;
              left: 50%;
              transform: translateX(-50%);
              background: #2ecc71;
              color: white;
              padding: 10px 16px;
              border-radius: 4px;
              font-size: 14px;
              z-index: 1001;
              opacity: 0.95;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            notification.textContent = `📈 Tomorrow's electricity prices updated!`;
            d.body.appendChild(notification);
            
            // Remove notification after 4 seconds
            setTimeout(() => {
              if (notification.parentNode) {
                notification.remove();
              }
            }, 4000);
          }
          
          // Always refresh charts when server notifies us of new data
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
    if (todayChartElement && todayChartElement._chartInstance && todayChartElement._validData && window.addNowLine) {
      console.log('Updating yellow line immediately due to focus/visibility change');
      // Remove existing line
      const svgElement = todayChartElement.querySelector('svg');
      if (svgElement) {
        const existingLines = svgElement.querySelectorAll('.now-line');
        existingLines.forEach(line => line.remove());
      }
      // Add new line at current time
      window.addNowLine(todayChartElement._chartInstance, todayChartElement, todayChartElement._validData);
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
  
  // Track when we last checked for activity (to detect sleep/wake cycles)
  let lastActivityCheck = Date.now();
  
  // Track when chart data was last fetched and key metadata
  window.chartDataTimestamps = {
    today: null,
    tomorrow: null
  };
  
  // Track additional metadata for smart refresh decisions
  window.chartDataMetadata = {
    today: { fetchedDate: null, fetchedHour: null },
    tomorrow: { fetchedDate: null, fetchedHour: null }
  };

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

  // Function to check if device likely woke up from sleep
  window.checkWakeFromSleep = function() {
    const now = Date.now();
    const timeSinceLastCheck = now - lastActivityCheck;
    lastActivityCheck = now;
    
    // If more than 10 minutes passed since last check, likely woke from sleep
    const SLEEP_THRESHOLD = 10 * 60 * 1000; // 10 minutes
    if (timeSinceLastCheck > SLEEP_THRESHOLD) {
      console.log(`Potential wake from sleep detected: ${Math.round(timeSinceLastCheck / 1000 / 60)} minutes inactive`);
      return true;
    }
    return false;
  };

  // Function to check if chart data is stale and needs refresh
  window.checkStaleData = function() {
    const now = new Date();
    const nowTimestamp = now.getTime();
    const currentHour = now.getHours();
    const currentDate = now.toDateString();
    
    const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
    let needsRefresh = false;
    let reasons = [];
    
    // Check today's data
    if (window.chartDataTimestamps.today && window.chartDataMetadata.today) {
      const todayAge = nowTimestamp - window.chartDataTimestamps.today;
      const fetchedDate = window.chartDataMetadata.today.fetchedDate;
      
      // Basic staleness check
      if (todayAge > STALE_THRESHOLD) {
        reasons.push(`today data ${Math.round(todayAge / 1000 / 60)} min old`);
        needsRefresh = true;
      }
      
      // Cross-day check: if data was fetched on a different date
      if (fetchedDate && fetchedDate !== currentDate) {
        reasons.push(`today data from previous day (${fetchedDate})`);
        needsRefresh = true;
      }
    }
    
    // Check tomorrow's data with smart 2 PM logic
    if (window.chartDataTimestamps.tomorrow && window.chartDataMetadata.tomorrow) {
      const tomorrowAge = nowTimestamp - window.chartDataTimestamps.tomorrow;
      const fetchedHour = window.chartDataMetadata.tomorrow.fetchedHour;
      const fetchedDate = window.chartDataMetadata.tomorrow.fetchedDate;
      
      // Basic staleness check
      if (tomorrowAge > STALE_THRESHOLD) {
        reasons.push(`tomorrow data ${Math.round(tomorrowAge / 1000 / 60)} min old`);
        needsRefresh = true;
      }
      
      // Cross-day check: if data was fetched on a different date
      if (fetchedDate && fetchedDate !== currentDate) {
        reasons.push(`tomorrow data from previous day (${fetchedDate})`);
        needsRefresh = true;
      }
      
      // Smart 2 PM check: if data was fetched before 2 PM and it's now after 2 PM
      if (fetchedHour !== null && fetchedHour < 14 && currentHour >= 14) {
        reasons.push(`tomorrow data fetched pre-2PM (${fetchedHour}:00), now post-2PM`);
        needsRefresh = true;
      }
      
      // Extended afternoon check: during 2-6 PM, be more aggressive about refreshing
      // tomorrow's data (since prices can be published late or updated)
      if (currentHour >= 14 && currentHour <= 18) {
        const AFTERNOON_STALE_THRESHOLD = 20 * 60 * 1000; // 20 minutes during afternoon
        if (tomorrowAge > AFTERNOON_STALE_THRESHOLD) {
          reasons.push(`tomorrow data ${Math.round(tomorrowAge / 1000 / 60)} min old during afternoon hours`);
          needsRefresh = true;
        }
      }
    }
    
    if (needsRefresh && reasons.length > 0) {
      console.log(`Stale data detected: ${reasons.join(', ')}`);
    }
    
    return needsRefresh;
  };

  // Listen for window focus and visibility changes
  window.addEventListener('focus', () => {
    console.log('Window focused - checking for sleep/wake, date change, and stale data');
    
    // Check if we likely woke from sleep
    const wokeFromSleep = window.checkWakeFromSleep();
    
    // Check for date change first (most important)
    const dateChanged = window.checkDateChange();
    
    if (!dateChanged) {
      // If date didn't change, check if data is stale or we woke from sleep
      const hasStaleData = window.checkStaleData();
      
      if (wokeFromSleep || hasStaleData) {
        console.log('Refreshing charts due to wake from sleep or stale data');
        window.refreshCharts();
      } else {
        // Only update yellow line if no refresh is needed
        window.updateNowLineImmediately();
      }
    }
  });

  // Note: We don't hide on blur because the window might still be visible
  // (e.g., side-by-side windows on desktop). Only hide when actually not visible.

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('Document became visible - checking for sleep/wake, date change, and stale data');
      
      // Check if we likely woke from sleep
      const wokeFromSleep = window.checkWakeFromSleep();
      
      // Check for date change first (most important)
      const dateChanged = window.checkDateChange();
      
      if (!dateChanged) {
        // If date didn't change, check if data is stale or we woke from sleep
        const hasStaleData = window.checkStaleData();
        
        if (wokeFromSleep || hasStaleData) {
          console.log('Refreshing charts due to wake from sleep or stale data');
          window.refreshCharts();
        } else {
          // Only update yellow line if no refresh is needed
          window.updateNowLineImmediately();
        }
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
        console.log('Screen likely re-enabled - checking for sleep/wake, date change, and stale data');
        setTimeout(() => {
          // Check if we likely woke from sleep
          const wokeFromSleep = window.checkWakeFromSleep();
          
          // Check for date change first (most important)
          const dateChanged = window.checkDateChange();
          
          if (!dateChanged) {
            // If date didn't change, check if data is stale or we woke from sleep
            const hasStaleData = window.checkStaleData();
            
            if (wokeFromSleep || hasStaleData) {
              console.log('Refreshing charts due to wake from sleep or stale data');
              window.refreshCharts();
            } else {
              // Only update yellow line if no refresh is needed
              window.updateNowLineImmediately();
            }
          }
        }, 100); // Small delay to ensure everything is ready
        wasHidden = false;
      }
    });
  }

  // Periodic checks as backup (every 5 minutes when page is visible)
  setInterval(() => {
    if (!document.hidden) {
      // Update activity timestamp to detect sleep/wake cycles
      lastActivityCheck = Date.now();
      
      // Check for date change (triggers refresh if needed)
      const dateChanged = window.checkDateChange();
      
      // If date didn't change, check for stale data
      if (!dateChanged && window.checkStaleData()) {
        console.log('Periodic check detected stale data - refreshing charts');
        window.refreshCharts();
      }
    }
  }, 5 * 60 * 1000); // 5 minutes

  // More frequent price update check (every 10 minutes during key hours)
  setInterval(() => {
    if (!document.hidden) {
      const now = new Date();
      const hour = now.getHours();
      
      // Check more frequently during key price update times:
      // - Morning hours (6-10 AM) when today's final prices might update
      // - Critical afternoon hours (2-6 PM) when tomorrow's prices are published/updated
      const isKeyHour = (hour >= 6 && hour <= 10) || (hour >= 14 && hour <= 18);
      
      if (isKeyHour) {
        console.log(`Key hour check (${hour}:00) - checking for stale data`);
        
        // Use the smart stale data logic that includes 2 PM awareness
        if (window.checkStaleData()) {
          console.log('Key hour check triggered refresh');
          window.refreshCharts();
        }
        
        // Special case: during prime tomorrow publication time (2-4 PM),
        // check for tomorrow data that might be missing entirely
        if (hour >= 14 && hour <= 16 && !window.chartDataTimestamps.tomorrow) {
          console.log('Critical time window: No tomorrow data cached, forcing refresh');
          window.refreshCharts();
        }
      }
    }
  }, 10 * 60 * 1000); // 10 minutes

  // Handle orientation changes only on mobile devices
  let currentOrientation = screen.orientation ? screen.orientation.angle : window.orientation;
  let orientationChangeTimeout;
  
  function handleOrientationChange() {
    clearTimeout(orientationChangeTimeout);
    orientationChangeTimeout = setTimeout(() => {
      const newOrientation = screen.orientation ? screen.orientation.angle : window.orientation;
      
      if (newOrientation !== currentOrientation) {
        console.log(`Orientation changed: ${currentOrientation}° → ${newOrientation}°`);
        currentOrientation = newOrientation;
        
        // Only redraw charts on actual orientation change
        window.redrawCharts();
      }
    }, 300); // Wait for orientation change to complete
  }
  
  // Only listen for orientation changes, ignore resize events on mobile
  if (window.innerWidth <= 900) {
    console.log('Mobile device detected - listening for orientation changes only');
    window.addEventListener('orientationchange', handleOrientationChange);
    
    // Also listen to screen.orientation.onchange if available (more reliable)
    if (screen.orientation && screen.orientation.addEventListener) {
      screen.orientation.addEventListener('change', handleOrientationChange);
    }
  } else {
    // On desktop, only listen for actual window resize (not mobile scrolling issues)
    console.log('Desktop device detected - listening for window resize');
    let resizeTimeout;
    
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        console.log('Desktop window resized - redrawing charts');
        window.redrawCharts();
      }, 300);
    });
  }

  // Add HTMX event listeners for debugging chart swaps
  d.body.addEventListener('htmx:afterSwap', function(evt) {
    console.log('HTMX afterSwap:', evt.detail.target.id || evt.detail.target.className);
  });

  d.body.addEventListener('htmx:swapError', function(evt) {
    console.error('HTMX swap error:', evt.detail);
  });

  // Function to redraw existing charts (for responsive resize)
  window.redrawCharts = function() {
    console.log('Redrawing existing charts for responsive layout...');
    
    // Find existing chart instances and redraw them
    const todayChartElement = d.querySelector('#todayChart [id*="googleChart"]');
    const tomorrowChartElement = d.querySelector('#tomorrowChart [id*="googleChart"]');
    
    // Only redraw if charts actually exist (avoid double drawing on page load)
    if (todayChartElement && todayChartElement._chartInstance && window.createChart_today) {
      console.log('Redrawing today chart with cached data');
      window.createChart_today();
    }
    
    if (tomorrowChartElement && tomorrowChartElement._chartInstance && window.createChart_tomorrow) {
      console.log('Redrawing tomorrow chart with cached data');
      window.createChart_tomorrow();
    }
  };

  // Global function to refresh charts (fetch new data from server)
  window.refreshCharts = function() {
    console.log('Refreshing charts with new data from server...');
    
    // Show a brief visual indicator that data is being refreshed
    const existingIndicator = d.querySelector('.refresh-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    const indicator = d.createElement('div');
    indicator.className = 'refresh-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: #fff;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      opacity: 0.9;
      pointer-events: none;
    `;
    indicator.textContent = 'Updating prices...';
    d.body.appendChild(indicator);
    
    // Remove indicator after 3 seconds
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 3000);
    
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
    
    // Verify target elements exist before refreshing
    const todayTarget = d.querySelector('#todayChart');
    const tomorrowTarget = d.querySelector('#tomorrowChart');
    
    if (!todayTarget) {
      console.error('Today chart target element not found');
      return;
    }
    if (!tomorrowTarget) {
      console.error('Tomorrow chart target element not found');
      return;
    }
    
    // Trigger HTMX refresh for both charts
    const margin = d.body.getAttribute('data-default-margin') || '0';
    
    try {
      htmx.ajax('GET', `/partials/prices?date=today&margin=${margin}`, {
        target: '#todayChart', 
        swap: 'outerHTML'
      });
      htmx.ajax('GET', `/partials/prices?date=tomorrow&margin=${margin}`, {
        target: '#tomorrowChart', 
        swap: 'outerHTML'
      });
      console.log('Chart refresh requests sent');
    } catch (error) {
      console.error('Error refreshing charts:', error);
    }
  };
})();
