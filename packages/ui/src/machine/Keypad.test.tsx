import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Keypad } from "./Keypad";

describe("Keypad", () => {
  it("presses every key alike, and only a lit key reaches the page", async () => {
    const pressed: string[] = [];
    render(
      <Keypad
        mode="machine"
        lit={new Set(["1", "GO"])}
        onPress={(key) => pressed.push(key)}
      />,
    );
    const one = screen.getByRole("button", { name: /^1/ });
    const two = screen.getByRole("button", { name: /^2/ });
    expect(one).not.toHaveAttribute("aria-disabled", "true");
    expect(two).toHaveAttribute("aria-disabled", "true");
    expect(two.className).toBe(one.className);
    expect(two.className).not.toContain("opacity-");
    await userEvent.click(two);
    await userEvent.click(one);
    expect(pressed).toEqual(["1"]);
  });

  it("tells a listener of every touch, dark keys too, without pressing a dark key", async () => {
    const pressed: string[] = [];
    const touched: string[] = [];
    render(
      <Keypad
        mode="machine"
        lit={new Set(["1"])}
        onPress={(key) => pressed.push(key)}
        onTouch={(key) => touched.push(key)}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^4/ }));
    await userEvent.click(screen.getByRole("button", { name: /^1/ }));
    await userEvent.click(screen.getByRole("button", { name: "CLR" }));
    expect(touched).toEqual(["4", "1", "CLR"]);
    expect(pressed).toEqual(["1"]);
  });

  it("lights a service keypad's digits when the page asks for them", async () => {
    const pressed: string[] = [];
    render(
      <Keypad
        mode="service"
        lit={new Set(["5", "CLR"])}
        onPress={(key) => pressed.push(key)}
        clr={{ kind: "button" }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^5/ }));
    await userEvent.click(screen.getByRole("button", { name: "CLR" }));
    expect(pressed).toEqual(["5", "CLR"]);
    expect(screen.getByRole("button", { name: /^4/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("keeps a page's digit a button while it has nothing to do, so focus stays where it was", () => {
    const press = () => undefined;
    const { rerender } = render(
      <Keypad mode="service" lit={new Set(["5"])} onPress={press} />,
    );
    const five = screen.getByRole("button", { name: /^5/ });
    five.focus();
    rerender(<Keypad mode="service" lit={new Set()} onPress={press} />);
    expect(document.activeElement).toBe(five);
    expect(five).toHaveAttribute("aria-disabled", "true");
  });

  it("draws a static page's digits as plates with the keys' own face, not buttons", () => {
    const { container } = render(<Keypad mode="service" lit={new Set()} />);
    expect(screen.queryByRole("button", { name: /^5/ })).toBeNull();
    const plate = container.querySelector<HTMLElement>(".pw-key.is-plate")!;
    expect(plate.className).not.toContain("opacity-");
    expect(plate.className).toContain("active:[transform:translateY(");
  });

  it("lets an idle GO press without submitting, and a lit GO submit", async () => {
    const submitted: string[] = [];
    const page = (lit: ReadonlySet<string>) => (
      <>
        <form
          id="screen-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitted.push("go");
          }}
        />
        <Keypad
          mode="service"
          lit={lit}
          onPress={() => undefined}
          clr={{ kind: "button" }}
          go={{ kind: "submit", form: "screen-form" }}
        />
      </>
    );
    const { rerender } = render(page(new Set()));
    const go = screen.getByRole("button", { name: "GO" });
    expect(go).not.toHaveAttribute("disabled");
    expect(go).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(go);
    expect(submitted).toEqual([]);
    rerender(page(new Set(["GO"])));
    await userEvent.click(go);
    expect(submitted).toEqual(["go"]);
  });

  it("carries the ADA's raised marks on every keypad: a bar on 5, a ring on GO, a left arrow on CLR", () => {
    const keypads = [
      <Keypad key="machine" mode="machine" lit={new Set()} />,
      <Keypad
        key="page"
        mode="service"
        lit={new Set()}
        onPress={() => undefined}
        clr={{ kind: "button" }}
        go={{ kind: "submit", form: "screen-form" }}
      />,
      <Keypad
        key="link"
        mode="service"
        lit={new Set()}
        go={{ kind: "link", href: "/" }}
      />,
      <Keypad key="static" mode="service" lit={new Set()} />,
    ];
    for (const keypad of keypads) {
      const { container, unmount } = render(keypad);
      const marks = [
        ...container.querySelectorAll<HTMLElement>("[data-tactile]"),
      ].map((mark) => [
        mark.closest(".pw-key")!.firstChild!.textContent,
        mark.dataset.tactile,
        mark.getAttribute("aria-hidden"),
      ]);
      expect(marks, String(keypad.key)).toEqual([
        ["5", "bar", "true"],
        ["CLR", "arrow", "true"],
        ["GO", "circle", "true"],
      ]);
      expect(container.querySelectorAll("[data-braille]")).toHaveLength(10);
      unmount();
    }
  });

  it("names the cabinet's keypad for the one thing it does, selecting a bay", () => {
    render(<Keypad mode="machine" lit={new Set()} />);
    expect(
      screen.getByRole("group", { name: "Bay selector keypad" }),
    ).toBeVisible();
  });

  it("captions a service keypad in its lamp row on one line", () => {
    render(
      <Keypad
        mode="service"
        lit={new Set(["CLR", "GO"])}
        caption="CLR deny · GO allow"
      />,
    );
    expect(screen.getByText("CLR deny · GO allow")).toHaveClass(
      "whitespace-nowrap",
    );
  });
});
