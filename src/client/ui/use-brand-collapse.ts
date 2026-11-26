/**
 * Collapses the brand's text to the logo alone when "logo + title (+ tagline)"
 * does not fit on one row. Plain CSS cannot do this: whether the text fits
 * depends on its own length, so it is measured.
 *
 * The root element must contain `.brand__logo` and `.brand__text`; the text
 * is laid out on one line (`.brand--logo`), so its `scrollWidth` is its
 * natural width even while it is hidden. The root's own width must not depend
 * on the text (`flex: 1 1 0; min-width: 0`), otherwise this would oscillate.
 * The text is hidden visually only (`.brand--collapsed`); it stays in the DOM.
 */
import { useLayoutEffect, useRef, useState } from 'react';

export function useBrandCollapse(hasLogo: boolean, textKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!hasLogo || !root) {
      setCollapsed(false);
      return;
    }
    const measure = () => {
      const logo = root.querySelector<HTMLElement>('.brand__logo');
      const text = root.querySelector<HTMLElement>('.brand__text');
      if (!logo || !text) return;
      const gap = parseFloat(getComputedStyle(root).columnGap) || 0;
      setCollapsed(logo.offsetWidth + gap + text.scrollWidth > root.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    // Web fonts change the text width after first paint.
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [hasLogo, textKey]);

  return { ref, collapsed };
}
