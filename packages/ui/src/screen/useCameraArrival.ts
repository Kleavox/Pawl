import { useEffect, useRef, useState, type RefObject } from "react";

import { arrivalFraming, cleanCamHint, settle, type Framing } from "../camera";

export function useCameraArrival(
  camera: RefObject<HTMLDivElement | null>,
  rest: Framing,
  options: {
    moving?: "in" | "out";
    onRestore?: () => void;
    direct?: Framing;
  } = {},
): Framing {
  const [arrived] = useState<Framing>(() => {
    if (typeof window === "undefined") return rest;
    const hinted = arrivalFraming(window.location.hash);
    return hinted === "whole" ? (options.direct ?? "whole") : hinted;
  });
  const restore = useRef(options.onRestore);
  restore.current = options.onRestore;
  const moving = options.moving;
  useEffect(() => {
    cleanCamHint(window.location, window.history);
    const node = camera.current;
    if (node !== null) void settle(node, arrived, rest, { moving });
    const back = (event: PageTransitionEvent): void => {
      if (!event.persisted || camera.current === null) return;
      delete camera.current.querySelector<HTMLElement>("[data-machine]")
        ?.dataset.leaving;
      restore.current?.();
      void settle(
        camera.current,
        arrivalFraming(`#cam=${camera.current.dataset.framing ?? ""}`),
        rest,
      );
    };
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, [camera, arrived, rest, moving]);
  return arrived;
}
