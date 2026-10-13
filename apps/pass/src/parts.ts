import { SCREEN_FORM, type Holder, type Screen } from "./machine";

type Text = { textContent: string | null };

export type MachineParts = {
  machine: HTMLElement;
  chip: HTMLElement;
  word: Text;
  main: Text;
  sub: Text;
  where: Text;
  clr: HTMLButtonElement;
  go: HTMLButtonElement;
};

function access(holder: Holder | null): "guest" | "owner" | "visitor" {
  if (holder === null) return "guest";
  return holder.role === "ADMIN" ? "owner" : "visitor";
}

export function machineParts(root: ParentNode): MachineParts | null {
  const find = <T extends Element>(selector: string): T | null =>
    root.querySelector<T>(selector);
  const parts = {
    machine: find<HTMLElement>("[data-machine]"),
    chip: find<HTMLElement>("[data-cabinet-state]"),
    word: find<HTMLElement>("[data-cabinet-word]"),
    main: find<HTMLElement>("[data-screen]"),
    sub: find<HTMLElement>("[data-screen-sub]"),
    where: find<HTMLElement>("[data-pass-where]"),
    clr: find<HTMLButtonElement>("button[data-key='CLR']"),
    go: find<HTMLButtonElement>(`button[form='${SCREEN_FORM}']`),
  };
  return Object.values(parts).includes(null) ? null : (parts as MachineParts);
}

function write(node: Text, words: string): void {
  if (node.textContent !== words) node.textContent = words;
}

export function paintMachine(
  parts: MachineParts,
  screen: Screen,
  holder: Holder | null,
): void {
  const who = access(holder);
  const handle = holder?.handle.toUpperCase() ?? "";
  parts.machine.dataset.access = who;
  parts.chip.dataset.cabinetState = who;
  write(parts.word, `${who.toUpperCase()} MODE`);
  write(parts.main, screen.status);
  write(
    parts.sub,
    holder === null
      ? (screen.sub ?? "")
      : `${handle} · ${who.toUpperCase()} PASS`,
  );
  write(
    parts.where,
    holder === null ? screen.status : `HI, ${handle} · ${who.toUpperCase()}`,
  );
  parts.clr.disabled = screen.back === undefined;
  parts.go.disabled = !screen.go;
}
