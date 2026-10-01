import { useEffect } from 'react';

/** Includes nested dialogs opened by child screens, not just App's modal state. */
export function useModalViewport() {
  useEffect(() => {
    let locked = false;
    let previousOverflow = '';
    let frame;
    const sync = () => {
      const hasModal = Boolean(document.querySelector('.modal-overlay'));
      if (hasModal && !locked) {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        locked = true;
      } else if (!hasModal && locked) {
        document.body.style.overflow = previousOverflow;
        locked = false;
      }
    };
    const revealInput = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const input = document.activeElement;
        if (!input?.matches('input, textarea, select') || !input.closest('.modal')) return;
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop || 0;
        const height = viewport?.height || window.innerHeight;
        const rect = input.getBoundingClientRect();
        if (rect.top < top + 70 || rect.bottom > top + height - 85) {
          input.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
        }
      });
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    document.addEventListener('focusin', revealInput);
    window.visualViewport?.addEventListener('resize', revealInput);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', revealInput);
      window.visualViewport?.removeEventListener('resize', revealInput);
      if (locked) document.body.style.overflow = previousOverflow;
    };
  }, []);
}
