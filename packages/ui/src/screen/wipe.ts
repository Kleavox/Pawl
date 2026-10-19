export const WIPE_MS = 220;

const PANE =
  "screen__window absolute inset-0 z-1 overflow-hidden pointer-events-none animate-[wipe-window_220ms_linear_1_both]";

const GHOST = [
  "screen__ghost",
  "absolute",
  "inset-0",
  "bg-(image:--pw-lcd)!",
  "animate-[wipe-ghost_220ms_linear_1_both]",
];

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
  ghost.classList.add(...GHOST);
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  return ghost;
}

function paneOf(previous: HTMLElement | null): HTMLElement {
  const pane = document.createElement("div");
  pane.className = PANE;
  pane.setAttribute("aria-hidden", "true");
  if (previous !== null) {
    pane.append(ghostOf(previous));
    return pane;
  }
  const blank = document.createElement("div");
  blank.classList.add(...GHOST);
  pane.append(blank);
  return pane;
}

export function scanWipe(
  views: HTMLElement,
  previous: HTMLElement | null,
): void {
  const running = sweeps.get(views);
  if (running !== undefined) clearTimeout(running);
  for (const old of views.querySelectorAll(".screen__window")) old.remove();
  views.classList.remove("is-wiping");
  void views.offsetWidth;
  views.append(paneOf(previous));
  views.classList.add("is-wiping");
  sweeps.set(
    views,
    setTimeout(() => {
      sweeps.delete(views);
      views.classList.remove("is-wiping");
      for (const old of views.querySelectorAll(".screen__window")) old.remove();
    }, WIPE_MS),
  );
}
