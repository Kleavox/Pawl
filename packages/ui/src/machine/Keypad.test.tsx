import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Keypad } from "./Keypad";

describe("Keypad", () => {
  it("lights only the keys it is given, and an unlit key cannot be pressed", async () => {
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
    await userEvent.click(two);
    await userEvent.click(one);
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

  it("keeps a page's digit a button while it goes dark, so focus stays where it was", () => {
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

  it("draws a static page's digits as unlit plates, not buttons", () => {
    render(<Keypad mode="service" lit={new Set()} />);
    expect(screen.queryByRole("button", { name: /^5/ })).toBeNull();
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
        caption="CLR DENY · GO ALLOW"
      />,
    );
    expect(screen.getByText("CLR DENY · GO ALLOW")).toHaveClass(
      "whitespace-nowrap",
    );
  });
});
