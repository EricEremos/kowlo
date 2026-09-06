const status = document.querySelector('#offline-status');

async function prepareOffline() {
  if (!isSecureContext || !('serviceWorker' in navigator)) {
    status.textContent = 'Keep a connection to reopen your atlas in this browser.';
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./offline-worker.mjs', { scope: './' });
    let failed = false;
    const refresh = () => {
      if (registration.waiting) {
        status.textContent = 'An update is ready. Save any edits, then close all atlas tabs and reopen. Your saved memories stay here.';
      } else if (navigator.serviceWorker.controller) {
        status.textContent = 'Ready offline. Your saved atlas travels with you.';
      } else if (failed) {
        status.textContent = 'Offline preparation did not finish. Reopen with a connection to try again.';
      } else {
        status.textContent = 'Preparing your atlas for offline use…';
      }
    };
    const observe = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { failed = worker.state === 'redundant'; refresh(); });
    };
    navigator.serviceWorker.addEventListener('controllerchange', refresh);
    registration.addEventListener('updatefound', () => { observe(); refresh(); });
    observe();
    refresh();
  } catch {
    status.textContent = 'Keep a connection to reopen your atlas. Offline preparation is unavailable.';
  }
}

void prepareOffline();
