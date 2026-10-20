import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "pawl:sound";
const CLICK_SECONDS = 0.03;
const TONE_SECONDS = 0.09;

const DTMF: Readonly<Record<string, readonly [number, number]>> = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  CLR: [941, 1209],
  "0": [941, 1336],
  GO: [941, 1477],
};

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
  key: (label: string) => void;
} {
  const [on, setOn] = useState(false);
  const live = useRef(false);
  const context = useRef<AudioContext | null>(null);

  useEffect(() => {
    live.current = remembered();
    setOn(live.current);
  }, []);

  const play = useCallback(
    (
      frequencies: readonly number[],
      type: OscillatorType,
      level: number,
      seconds: number,
    ): void => {
      if (!live.current) return;
      try {
        context.current ??= new AudioContext();
        const audio = context.current;
        const now = audio.currentTime;
        const gain = audio.createGain();
        gain.gain.setValueAtTime(level, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
        gain.connect(audio.destination);
        for (const hz of frequencies) {
          const tone = audio.createOscillator();
          tone.type = type;
          tone.frequency.value = hz;
          tone.connect(gain);
          tone.start(now);
          tone.stop(now + seconds);
        }
      } catch {
        return;
      }
    },
    [],
  );

  const click = useCallback(
    (): void => play([1800], "square", 0.035, CLICK_SECONDS),
    [play],
  );

  const key = useCallback(
    (label: string): void => {
      const pair = DTMF[label];
      if (pair === undefined) click();
      else play(pair, "sine", 0.05, TONE_SECONDS);
    },
    [play, click],
  );

  const toggle = useCallback((): void => {
    live.current = !live.current;
    remember(live.current);
    setOn(live.current);
    click();
  }, [click]);

  return { on, toggle, click, key };
}
