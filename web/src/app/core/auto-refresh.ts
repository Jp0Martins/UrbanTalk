import { DestroyRef, inject } from '@angular/core';

// repete uma consulta enquanto a página está aberta e visível; volta a consultar ao reabrir a aba
export function autoRefresh(fn: () => void, ms = 30_000) {
  const run = () => {
    if (document.visibilityState === 'visible') fn();
  };
  const timer = setInterval(run, ms);
  document.addEventListener('visibilitychange', run);
  inject(DestroyRef).onDestroy(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', run);
  });
}
