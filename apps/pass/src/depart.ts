import {
  ROOT_ORIGIN,
  leave,
  settle,
  shouldAnimateClick,
  withCamHint,
} from "@pawl/ui";

const SCAN_OFF_MS = 150;
const STILL_HERE_MS = 3000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function departure(
  url: string,
  here: string,
  rootOrigin: string,
): { href: string; toMachine: boolean } {
  const target = new URL(url, here);
  const toMachine = target.origin === new URL(rootOrigin).origin;
  return {
    href: toMachine ? withCamHint(target.href, "screen") : target.href,
    toMachine,
  };
}

function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

let departing = false;

export function departTo(url: string): void {
  if (departing) return;
  departing = true;
  setTimeout(() => {
    departing = false;
    document.getElementById("screen")?.classList.remove("is-scanning-off");
  }, STILL_HERE_MS);
  const { href, toMachine } = departure(url, window.location.href, ROOT_ORIGIN);
  const view = document.getElementById("screen");
  if (!toMachine || view === null || reducedMotion()) {
    window.location.assign(href);
    return;
  }
  view.classList.add("is-scanning-off");
  setTimeout(() => window.location.assign(href), SCAN_OFF_MS);
}

export function mountDepartures(root: ParentNode): void {
  const camera = root.querySelector<HTMLElement>("[data-camera]");
  const machine = root.querySelector<HTMLElement>("[data-machine]");
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    "[data-to-machine]",
  )) {
    link.addEventListener("click", (event) => {
      if (!shouldAnimateClick(event)) return;
      event.preventDefault();
      departTo(link.href);
    });
  }
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    ".plate__links a",
  )) {
    link.addEventListener("click", (event) => {
      if (camera === null || !shouldAnimateClick(event)) return;
      event.preventDefault();
      if (machine !== null) machine.dataset.leaving = "printer";
      void leave(camera, "printer", withCamHint(link.href, "printer"), {
        stay: () => {
          delete machine?.dataset.leaving;
          void settle(camera, "printer", "screen");
        },
      });
    });
  }
}
