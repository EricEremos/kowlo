const status = document.getElementById('offline-status');

async function initializeOfflineShell() {
  if (!isSecureContext || !('serviceWorker' in navigator)) {
    status.textContent = 'Offline shell unavailable in this browser. Local records can still be saved if browser storage is available.';
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./offline-worker.mjs', { scope: './' });
    let installFailed = false;
    const refresh = () => {
      if (registration.waiting) {
        status.textContent = 'An offline shell update is ready. Close all diagnostic tabs and reopen to apply it. Saved journal records are retained.';
      } else if (navigator.serviceWorker.controller) {
        status.textContent = 'Offline shell ready. Reopen this page without a connection to read, export or delete saved records, or inspect local files. Synthetic fixture downloads still require the local server. Browser storage can be cleared or evicted; export is your backup.';
      } else if (installFailed) {
        status.textContent = 'Offline preparation failed. Keep a connection and reopen this page to retry. Saved journal records are retained.';
      } else {
        status.textContent = 'Preparing application files and reference geography for offline use…';
      }
    };
    const observeInstall = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        installFailed = worker.state === 'redundant';
        refresh();
      });
    };
    navigator.serviceWorker.addEventListener('controllerchange', refresh);
    registration.addEventListener('updatefound', () => { observeInstall(); refresh(); });
    observeInstall();
    refresh();
  } catch {
    status.textContent = 'Offline preparation unavailable. Keep a connection to reopen the page. Saved journal records are retained.';
  }
}

void initializeOfflineShell();
