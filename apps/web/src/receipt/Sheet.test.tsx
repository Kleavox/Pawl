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
  const paperRef = createRef<HTMLElement>();
  const view = render(
    <Sheet
      from={from}
      as={as}
      labelledBy="paper-title"
      sheetRef={sheetRef}
      paperRef={paperRef}
      onCrumple={onCrumple}
    >
      <h1 id="paper-title">Paper</h1>
    </Sheet>,
  );
  return { ...view, sheetRef, paperRef, onCrumple };
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
        paperRef={createRef()}
        onCrumple={() => {}}
      >
        <h1 id="paper-title">Paper</h1>
      </Sheet>,
    );
    expect(sheetRef.current).toHaveAttribute("data-stage", "hand");
  });

  it("holds the paper in a frame that scrolls by itself, with the dim, the creases and the ball beside it", () => {
    const { sheetRef, paperRef } = sheet("feed");
    const root = sheetRef.current!;
    const frame = root.querySelector("[data-receipt-frame]")!;
    expect(frame).toHaveAttribute("tabindex", "0");
    expect(paperRef.current).toBe(frame.querySelector("article[data-receipt]"));
    expect(paperRef.current).toHaveTextContent("Paper");
    expect(paperRef.current).toHaveAttribute("tabindex", "-1");
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
    expect(frame.querySelector("[data-receipt-ball]")).toBeNull();
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
    const { paperRef } = sheet("feed");
    const paper = paperRef.current!;
    expect(paper.className).toContain("receipt-edge");
    expect(paper.className).toContain(
      "group-data-[stage=rip]/sheet:receipt-torn",
    );
    expect(paper.className).toContain(
      "group-data-[stage=hand]/sheet:receipt-torn",
    );
  });

  it("lets the end of the paper scroll into view while it rests at the slot", () => {
    const { sheetRef } = sheet("feed");
    const frame = sheetRef.current!.querySelector("[data-receipt-frame]")!;
    for (const stage of ["slot", "feed"]) {
      expect(frame.className).toContain(
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

  it("is no landmark inside the cabinet's dialog, and names nothing generic", () => {
    const { container } = sheet("slot", "div");
    expect(screen.queryByRole("main")).toBeNull();
    expect(container.querySelector("[data-receipt-sheet]")).not.toHaveAttribute(
      "aria-labelledby",
    );
  });

  it("scrolls the paper in a named region", () => {
    sheet("feed", "main");
    expect(screen.getByRole("region", { name: "Receipt" })).toHaveAttribute(
      "data-receipt-frame",
    );
  });
});
