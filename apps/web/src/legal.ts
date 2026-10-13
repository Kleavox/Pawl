import "@pawl/ui/styles.css";
import "@pawl/ui/machine.css";
import "./styles/display.css";
import "./styles/receipt.css";
import {
  cleanCamHint,
  leave,
  settle,
  shouldAnimateClick,
  withCamHint,
} from "@pawl/ui";
import { scrollBack, tearOff } from "./receipt";
import { mountSound } from "./sound";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

mountSound(document);

const camera = document.querySelector<HTMLElement>("[data-camera]");
const machine = document.querySelector<HTMLElement>("[data-machine]");
const paper = document.querySelector<HTMLElement>("[data-receipt]");
let tearing = false;

function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

async function tear(href: string): Promise<void> {
  if (tearing || camera === null || paper === null) return;
  tearing = true;
  const reduced = reducedMotion();
  await scrollBack(window, { reduced });
  if (machine !== null) machine.dataset.leaving = "tear";
  await tearOff(paper, { reduced });
  await leave(camera, "printer", withCamHint(href, "printer"), {
    durationMs: 0,
    reduced,
    stay: putBack,
  });
}

function putBack(): void {
  tearing = false;
  delete machine?.dataset.leaving;
  if (paper !== null) delete paper.dataset.torn;
  if (camera !== null) void settle(camera, "printer", "printer");
}

for (const control of document.querySelectorAll<HTMLAnchorElement>(
  "a[data-tear]",
)) {
  control.addEventListener("click", (event) => {
    if (!shouldAnimateClick(event)) return;
    event.preventDefault();
    tear(control.href).catch(() => window.location.assign(control.href));
  });
}

cleanCamHint(window.location, window.history);
if (camera !== null) void settle(camera, "printer", "printer");

window.addEventListener("pageshow", (event) => {
  if (event.persisted) putBack();
});
