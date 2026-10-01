import { useCallback, useEffect, useRef } from 'react';
import { saveStore } from './store.js';

/**
 * Batch rapid React state changes into one synchronous localStorage write.
 * pagehide / visibilitychange flush the latest pending state before the page is left.
 */
export function useStorePersistence(data, { delay = 300, onError } = {}) {
  const latestRef = useRef(data);
  const timerRef = useRef(null);
  const dirtyRef = useRef(false);
  const onErrorRef = useRef(onError);
  const mountedRef = useRef(false);

  onErrorRef.current = onError;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return true;
    try {
      saveStore(latestRef.current);
      dirtyRef.current = false;
      onErrorRef.current?.('');
      return true;
    } catch (error) {
      onErrorRef.current?.(error?.message || '本機資料儲存失敗，本次變更可能尚未安全寫入。');
      return false;
    }
  }, []);

  useEffect(() => {
    latestRef.current = data;
    // loadStore already provides the initial persisted state. Avoid immediately
    // rewriting the full store on mount; only persist actual subsequent changes.
    if (!mountedRef.current) {
      mountedRef.current = true;
      return undefined;
    }
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, delay);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [data, delay, flush]);

  useEffect(() => {
    const onPageHide = () => flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [flush]);

  return { flush };
}
