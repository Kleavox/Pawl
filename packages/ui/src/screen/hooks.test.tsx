import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFollowFocus } from "./useFollowFocus";
import { useMachineKeys } from "./useMachineKeys";

afterEach(() => {
  vi.useRealTimers();
});

function Panels({ shown }: { shown: string }): ReactNode {
  const views = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  useFollowFocus(views, shown, returnTo);
  return (
    <div ref={views}>
      <section
        data-view-panel="products"
        tabIndex={-1}
        hidden={shown !== "products"}
      >
        <button
          type="button"
          onClick={(event) => {
            returnTo.current = event.currentTarget;
          }}
        >
          Tile
        </button>
      </section>
      <section data-view-panel="signin" hidden={shown !== "signin"}>
        <button type="button" data-autofocus>
          Continue with Google
        </button>
        <button type="button">Back</button>
      </section>
      <section
        data-view-panel="code"
        tabIndex={-1}
        data-autofocus
        hidden={shown !== "code"}
      >
        <button type="button">Use another email</button>
      </section>
      <section
        data-view-panel="account"
        tabIndex={-1}
        hidden={shown !== "account"}
      >
        <a href="/account">Manage account</a>
      </section>
    </div>
  );
}

describe("useFollowFocus", () => {
  it("does not steal focus when the page first paints", () => {
    render(<Panels shown="signin" />);
    expect(document.activeElement).toBe(document.body);
  });

  it("puts focus on the marked control of a view that opens", () => {
    const { rerender } = render(<Panels shown="products" />);
    rerender(<Panels shown="signin" />);
    expect(document.activeElement).toHaveTextContent("Continue with Google");
  });

  it("puts focus on a marked view itself, so typed digits reach the keypad", () => {
    const { rerender, container } = render(<Panels shown="signin" />);
    rerender(<Panels shown="code" />);
    expect(document.activeElement).toBe(
      container.querySelector("[data-view-panel='code']"),
    );
  });

  it("puts focus into a view with a tabindex when it opens", () => {
    const { rerender, container } = render(<Panels shown="products" />);
    rerender(<Panels shown="account" />);
    expect(document.activeElement).toBe(
      container.querySelector("[data-view-panel='account']"),
    );
  });

  it("returns to the control that left the products, when it is still there", () => {
    const { rerender } = render(<Panels shown="products" />);
    fireEvent.click(screen.getByText("Tile"));
    rerender(<Panels shown="signin" />);
    rerender(<Panels shown="products" />);
    expect(document.activeElement).toHaveTextContent("Tile");
  });
});

function Keys({
  lit,
  onKey,
}: {
  lit: ReadonlySet<string>;
  onKey: (key: string) => void;
}): ReactNode {
  useMachineKeys(onKey, lit);
  const [typed, setTyped] = useState("");
  return (
    <input
      aria-label="field"
      value={typed}
      onChange={(event) => setTyped(event.target.value)}
    />
  );
}

describe("useMachineKeys", () => {
  it("turns Enter into GO and Backspace into CLR, but not while typing in a field", () => {
    const keys: string[] = [];
    render(
      <Keys
        lit={new Set(["GO", "CLR", "3"])}
        onKey={(key) => keys.push(key)}
      />,
    );
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "Backspace" });
    fireEvent.keyDown(document, { key: "4" });
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "3" });
    fireEvent.keyDown(document, { key: "3", ctrlKey: true });
    expect(keys).toEqual(["GO", "CLR"]);
  });

  it("presses a lit digit typed outside a field", () => {
    const keys: string[] = [];
    render(<Keys lit={new Set(["3"])} onKey={(key) => keys.push(key)} />);
    fireEvent.keyDown(document, { key: "3" });
    expect(keys).toEqual(["3"]);
  });
});
