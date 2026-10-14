import { useCallback, useEffect, useRef, useState } from "react";

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

export function useSound(): {
  on: boolean;
  toggle: () => void;
  click: () => void;
} {
  const [on, setOn] = useState(false);
  const live = useRef(false);
  const context = useRef<AudioContext | null>(null);

  useEffect(() => {
    live.current = remembered();
    setOn(live.current);
  }, []);

  const click = useCallback((): void => {
    if (!live.current) return;
    try {
      context.current ??= new AudioContext();
      const audio = context.current;
      const now = audio.currentTime;
      const tone = audio.createOscillator();
      const level = audio.createGain();
      tone.type = "square";
      tone.frequency.value = 1800;
      level.gain.setValueAtTime(0.035, now);
      level.gain.exponentialRampToValueAtTime(0.0001, now + CLICK_SECONDS);
      tone.connect(level).connect(audio.destination);
      tone.start(now);
      tone.stop(now + CLICK_SECONDS);
    } catch {
      return;
    }
  }, []);

  const toggle = useCallback((): void => {
    live.current = !live.current;
    remember(live.current);
    setOn(live.current);
    click();
  }, [click]);

  return { on, toggle, click };
}
