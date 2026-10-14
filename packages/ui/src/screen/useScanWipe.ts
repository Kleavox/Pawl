import { useLayoutEffect, useRef, type RefObject } from "react";

import { scanWipe } from "./wipe";

export function useScanWipe(
  views: RefObject<HTMLElement | null>,
  shown: string,
  onArrival = false,
): void {
  const before = useRef<string | null>(null);
  useLayoutEffect(() => {
    const previous = before.current;
    before.current = shown;
    const root = views.current;
    if (root === null || previous === shown) return;
    if (previous === null) {
      if (onArrival) scanWipe(root, null);
      return;
    }
    scanWipe(
      root,
      root.querySelector<HTMLElement>(`[data-view-panel="${previous}"]`),
    );
  }, [shown, views, onArrival]);
}
