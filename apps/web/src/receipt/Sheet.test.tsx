import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Sheet } from "./Sheet";

function sheet(
  from: "slot" | "feed",
  as: "main" | "div" = "div",
  onCrumple = vi.fn(),
) {
  const sheetRef = createRef<HTMLDivElement>();
  const frameRef = createRef<HTMLDivElement>();
  const view = render(
    <Sheet
      from={from}
      as={as}
      labelledBy="paper-title"
      sheetRef={sheetRef}
      frameRef={frameRef}
      onCrumple={onCrumple}
    >
      <h1 id="paper-title">Paper</h1>
    </Sheet>,
  );
  return { ...view, sheetRef, frameRef, onCrumple };
}

describe("Sheet", () => {
  it("renders the stage it is given once and leaves it to the runner", () => {
    const { sheetRef, rerender } = sheet("slot");
    expect(sheetRef.current).toHaveAttribute("data-stage", "slot");
    sheetRef.current!.dataset.stage = "hand";
    rerender(
      <Sheet
        from="slot"
        as="div"
        labelledBy="paper-title"
        sheetRef={sheetRef}
        frameRef={createRef()}
        onCrumple={() => {}}
      >
        <h1 id="paper-title">Paper</h1>
      </Sheet>,
    );
    expect(sheetRef.current).toHaveAttribute("data-stage", "hand");
  });

  it("holds the paper in a frame that scrolls by itself, with the dim, the creases and the ball beside it", () => {
    const { sheetRef, frameRef } = sheet("feed");
    const root = sheetRef.current!;
    expect(frameRef.current).toHaveAttribute("data-receipt-frame");
    expect(frameRef.current).toHaveAttribute("tabindex", "0");
    expect(
      frameRef.current!.querySelector("article[data-receipt]"),
    ).toHaveTextContent("Paper");
    for (const part of [
      "[data-receipt-dim]",
      "[data-receipt-creases]",
      "[data-receipt-ball]",
    ]) {
      expect(root.querySelector(part), part).not.toBeNull();
      expect(root.querySelector(part), part).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
    expect(frameRef.current!.querySelector("[data-receipt-ball]")).toBeNull();
  });

  it("hides Crumple until the paper is in hand, and crumples on it", () => {
    const { onCrumple } = sheet("slot");
    const crumple = screen.getByRole("button", {
      name: "Crumple the receipt",
      hidden: true,
    });
    expect(crumple).toHaveTextContent("Crumple ✕");
    expect(crumple.className).toContain("invisible");
    expect(crumple.className).toContain(
      "group-data-[stage=hand]/sheet:visible",
    );
    fireEvent.click(crumple);
    expect(onCrumple).toHaveBeenCalledOnce();
  });

  it("tears the paper's top only once it has ripped, and its end always", () => {
    const { frameRef } = sheet("feed");
    const paper = frameRef.current!.querySelector("article[data-receipt]")!;
    expect(paper.className).toContain("receipt-edge");
    expect(paper.className).toContain(
      "group-data-[stage=rip]/sheet:receipt-torn",
    );
    expect(paper.className).toContain(
      "group-data-[stage=hand]/sheet:receipt-torn",
    );
  });

  it("lets the end of the paper scroll into view while it rests at the slot", () => {
    const { frameRef } = sheet("feed");
    for (const stage of ["slot", "feed"]) {
      expect(frameRef.current!.className).toContain(
        `group-data-[stage=${stage}]/sheet:pb-(--lift)`,
      );
    }
  });

  it("is the page's main content when asked, named by its title", () => {
    sheet("feed", "main");
    expect(screen.getByRole("main")).toHaveAttribute(
      "aria-labelledby",
      "paper-title",
    );
  });

  it("is no landmark inside the cabinet's dialog", () => {
    sheet("slot", "div");
    expect(screen.queryByRole("main")).toBeNull();
  });
});
