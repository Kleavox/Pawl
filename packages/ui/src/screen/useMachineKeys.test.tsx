import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Keypad } from "../machine/Keypad";
import { useMachineKeys } from "./useMachineKeys";

function Pad(props: {
  lit: ReadonlySet<string>;
  onKey: (key: string) => void;
}) {
  useMachineKeys(props.onKey, props.lit);
  return <Keypad mode="machine" lit={props.lit} onPress={props.onKey} />;
}

describe("useMachineKeys", () => {
  it("presses an idle key's cap from the keyboard too, and only a lit key reaches the page", () => {
    const pressed: string[] = [];
    const { container } = render(
      <Pad lit={new Set(["1"])} onKey={(key) => pressed.push(key)} />,
    );
    fireEvent.keyDown(document, { key: "7" });
    expect(container.querySelector("[data-key='7']")).toHaveClass("is-pressed");
    fireEvent.keyDown(document, { key: "1" });
    expect(pressed).toEqual(["1"]);
  });
});
