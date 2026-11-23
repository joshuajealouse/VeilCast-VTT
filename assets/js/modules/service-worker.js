export function registerServiceWorker(onUpdate) {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;

  addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../../../sw.js', import.meta.url)).then(reg => {
      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller)
            onUpdate();
        });
      });
    }).catch(() => {});
  });
}
