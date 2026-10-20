import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { auditLines } from "../machine/audit";
import { Audit } from "./Audit";

const LINES = auditLines({
  serial: "PAWL-GW-01",
  model: "GW-01",
  host: "example.test",
  bays: [{ code: "3", title: "Docs", vends: 1 }],
  reads: 1,
});

function printed() {
  return render(
    <Audit
      facts={{
        serial: "PAWL-GW-01",
        model: "GW-01",
        host: "example.test",
        printed: new Date(2026, 9, 20, 9, 5),
        lines: LINES,
      }}
    />,
  );
}

describe("the audit ticket", () => {
  it("is headed as a machine audit, for the dialog to name it", () => {
    printed();
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute(
      "id",
      "delivery-title",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Machine audit",
    );
  });

  it("prints every DEX line exactly, one per line", () => {
    const { container } = printed();
    expect(container.querySelector("pre[data-dex]")!.textContent).toBe(
      LINES.join("\n"),
    );
  });

  it("wraps a long line on the paper instead of hiding it sideways", () => {
    const { container } = printed();
    const pre = container.querySelector("pre[data-dex]")!;
    expect(pre.className).toContain("whitespace-pre-wrap");
    expect(pre.className).toContain("break-all");
    expect(pre.className).not.toContain("overflow-x-auto");
  });

  it("says what each segment is", () => {
    const { container } = printed();
    for (const segment of ["ID1", "VA1", "VA3", "PA1", "PA2", "EA3", "G85"]) {
      expect(
        container.querySelector(`[data-segment='${segment}']`),
        segment,
      ).not.toBeNull();
    }
    expect(container).toHaveTextContent("Free vends");
  });

  it("names the machine and ends with a barcode of its check value", () => {
    const { container } = printed();
    expect(container).toHaveTextContent("PAWL-GW-01");
    expect(container).toHaveTextContent("GW-01");
    expect(container).toHaveTextContent("example.test");
    const check = LINES.find((line) => line.startsWith("G85*"))!.slice(4);
    expect(container.querySelector("[data-barcode]")).toHaveAttribute(
      "data-barcode",
      `G85-${check}`,
    );
  });
});
