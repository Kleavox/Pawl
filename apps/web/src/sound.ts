const KEY = "pawl:sound";
const CLICK_SECONDS = 0.03;

function remembered(): boolean {
  try {
    return globalThis.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function remember(on: boolean): void {
  try {
    globalThis.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    return;
  }
}

export function mountSound(root: ParentNode): { click: () => void } {
  const button = root.querySelector<HTMLButtonElement>("[data-sound]");
  let on = remembered();
  let context: AudioContext | null = null;

  const paint = (): void => {
    button?.setAttribute("aria-pressed", String(on));
  };

  const click = (): void => {
    if (!on) return;
    try {
      context ??= new AudioContext();
      const now = context.currentTime;
      const tone = context.createOscillator();
      const level = context.createGain();
      tone.type = "square";
      tone.frequency.value = 1800;
      level.gain.setValueAtTime(0.035, now);
      level.gain.exponentialRampToValueAtTime(0.0001, now + CLICK_SECONDS);
      tone.connect(level).connect(context.destination);
      tone.start(now);
      tone.stop(now + CLICK_SECONDS);
    } catch {
      return;
    }
  };

  button?.addEventListener("click", () => {
    on = !on;
    remember(on);
    paint();
    click();
  });
  paint();
  return { click };
}
