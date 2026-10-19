import { ROOT_ORIGIN, withCamHint } from "@pawl/ui";

const SCAN_OFF_MS = 150;
const STILL_HERE_MS = 3000;
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
  if (!toMachine || view === null) {
    window.location.assign(href);
    return;
  }
  view.classList.add("is-scanning-off");
  setTimeout(() => window.location.assign(href), SCAN_OFF_MS);
}
