export const WIPE_MS = 220;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

const sweeps = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function ghostOf(panel: HTMLElement): HTMLElement {
  const ghost = panel.cloneNode(true) as HTMLElement;
  for (const node of [ghost, ...ghost.querySelectorAll<HTMLElement>("*")]) {
    for (const name of node.getAttributeNames()) {
      if (name === "id" || name === "for" || name.startsWith("data-")) {
        node.removeAttribute(name);
      }
    }
  }
  ghost.hidden = false;
  ghost.removeAttribute("aria-labelledby");
  ghost.removeAttribute("tabindex");
  ghost.classList.add("screen__ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  return ghost;
}

export function scanWipe(
  views: HTMLElement,
  previous: HTMLElement | null,
): void {
  if (reducedMotion()) return;
  const running = sweeps.get(views);
  if (running !== undefined) clearTimeout(running);
  for (const old of views.querySelectorAll(".screen__ghost")) old.remove();
  views.classList.remove("is-wiping");
  void views.offsetWidth;
  if (previous !== null) views.append(ghostOf(previous));
  views.classList.add("is-wiping");
  sweeps.set(
    views,
    setTimeout(() => {
      sweeps.delete(views);
      views.classList.remove("is-wiping");
      for (const old of views.querySelectorAll(".screen__ghost")) old.remove();
    }, WIPE_MS),
  );
}
