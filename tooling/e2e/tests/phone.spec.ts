import { expect, test, type Page } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";

const GATEWAY = localWorkerOrigin("gateway", "localhost");

type Box = { left: number; top: number; right: number; bottom: number };

async function still(page: Page): Promise<void> {
  await expect(page.locator("[data-camera]")).toHaveAttribute(
    "data-framing",
    "whole",
  );
  await expect(page.locator("[data-camera]")).not.toHaveAttribute(
    "data-moving",
    /./,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(0);
}

async function machineOf(page: Page): Promise<{
  machine: Box;
  strip: Box;
  tray: Box;
  keypad: Box;
  hidden: number[];
  keys: { width: number; height: number }[];
}> {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    };
    const machine = document.querySelector<HTMLElement>("[data-machine]")!;
    const u = parseFloat(getComputedStyle(machine).getPropertyValue("--u"));
    const whole = box("[data-machine]");
    return {
      machine: { ...whole, bottom: whole.bottom + 12 * u },
      strip: box(".strip"),
      tray: box("[data-part='tray']"),
      keypad: box("[data-part='keypad']"),
      hidden: ["speaker", "sensor"].map(
        (part) =>
          document.querySelector<HTMLElement>(`[data-part='${part}']`)!
            .offsetWidth,
      ),
      keys: [
        ...document.querySelectorAll<HTMLElement>(
          "[data-part='keypad'] > :not(:first-child)",
        ),
      ].map((key) => {
        const rect = key.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    };
  });
}

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.right <= outer.right + 0.5 &&
    inner.bottom <= outer.bottom + 0.5
  );
}

const VIEW: Box = { left: 0, top: 0, right: 390, bottom: 664 };

test("on a 390 × 664 phone the whole machine is in view, with the bay in the door beside the keypad", async ({
  browser,
}) => {
  for (const path of ["/", "/privacy.html"]) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 664 },
    });
    await page.goto(`${GATEWAY}${path}`);
    if (path !== "/") {
      await expect(page.locator("[data-receipt-sheet]")).toHaveAttribute(
        "data-stage",
        "hand",
        { timeout: 10_000 },
      );
    }
    await still(page);
    const seen = await machineOf(page);
    expect(inside(seen.machine, VIEW), `${path}: machine in view`).toBe(true);
    expect(inside(seen.tray, seen.strip), `${path}: bay in the door`).toBe(
      true,
    );
    expect(seen.tray.right, `${path}: bay left of the keypad`).toBeLessThan(
      seen.keypad.left + 0.5,
    );
    expect(seen.tray.top, `${path}: bay beside the keypad`).toBeLessThan(
      seen.keypad.bottom,
    );
    expect(seen.tray.bottom, `${path}: bay beside the keypad`).toBeGreaterThan(
      seen.keypad.top,
    );
    expect(seen.hidden, `${path}: no speaker or sensor`).toEqual([0, 0]);
    expect(seen.keys).toHaveLength(12);
    for (const key of seen.keys) {
      expect(key.width, `${path}: key width`).toBeGreaterThanOrEqual(44);
      expect(key.height, `${path}: key height`).toBeGreaterThanOrEqual(44);
    }
    await page.close();
  }
});

test("a delivered cartridge and TAKE DELIVERY fit the bay on a 320 px phone", async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { width: 320, height: 664 } });
  await page.goto(GATEWAY);
  await expect(page.locator("[data-screen]")).toHaveText("PICK A BAY");
  await page.waitForLoadState("networkidle");
  await page.locator("[data-cartridge='7']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");
  await expect(page.locator("[data-tray-action]")).toBeVisible();
  await still(page);
  const seen = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    };
    return {
      tray: box("[data-part='tray']"),
      result: box(".tray__result"),
      action: box("[data-tray-action]"),
    };
  });
  const view: Box = { left: 0, top: 0, right: 320, bottom: 664 };
  expect(inside(seen.result, seen.tray), "result in the bay").toBe(true);
  expect(inside(seen.result, view), "result in view").toBe(true);
  expect(inside(seen.action, seen.tray), "TAKE DELIVERY in the bay").toBe(true);
  await page.close();
});

const WIDE_TYPE = `:root {
  --pw-ui: Verdana, "DejaVu Sans", sans-serif;
  --pw-display: Verdana, "DejaVu Sans", sans-serif;
  --pw-mono: "Courier New", "DejaVu Sans Mono", monospace;
}`;

const LONGEST_LCD = [
  ["9 DENIED, VISITOR PASS REQUIRED", "SIGN IN TO UNLOCK"],
  ["OPEN FAILED, RELEASE IT AGAIN", "OR SIGN IN ON SCREEN"],
  ["9 RELEASING, MANUAL", "WAIT FOR THE DELIVERY BAY"],
  ["PASS ALMOST READY", "PICK A USERNAME"],
] as const;

test("the LCD holds its longest words on a phone, in wide type", async ({
  browser,
}) => {
  for (const width of [390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 664 } });
    await page.goto(GATEWAY);
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: WIDE_TYPE });
    for (const [main, sub] of LONGEST_LCD) {
      const spill = await page.evaluate(
        ([top, under]) => {
          document.querySelector("[data-screen]")!.textContent = top!;
          document.querySelector("[data-screen-sub]")!.textContent = under!;
          const line = document.querySelector<HTMLElement>(".lcd__line")!;
          return line.scrollHeight - line.clientHeight;
        },
        [main, sub],
      );
      expect(spill, `${main} / ${sub} at ${width}px`).toBeLessThanOrEqual(0);
    }
    await page.close();
  }
});

test("the printer framing puts the slot at the slot line on a phone", async ({
  browser,
}) => {
  for (const [width, height] of [
    [390, 844],
    [360, 740],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(GATEWAY);
    await page.waitForLoadState("networkidle");
    const seen = await page.evaluate(() => {
      const camera = document.querySelector<HTMLElement>("[data-camera]")!;
      camera.style.transition = "none";
      camera.dataset.framing = "printer";
      void camera.offsetWidth;
      const slot = document
        .querySelector(".printer__slot")!
        .getBoundingClientRect();
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;top:var(--slot-line);height:0";
      document.body.append(probe);
      const line = probe.getBoundingClientRect().top;
      probe.remove();
      return {
        x: slot.left + slot.width / 2,
        y: slot.top + slot.height / 2,
        line,
      };
    });
    expect(
      Math.abs(seen.x - width / 2),
      `${width}: across`,
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(seen.y - seen.line), `${width}: down`).toBeLessThanOrEqual(
      1,
    );
    await page.close();
  }
});

test("both shapes and a pressable TAKE DELIVERY fit the bay on a phone", async ({
  browser,
}) => {
  for (const width of [390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 664 } });
    await page.goto(GATEWAY);
    await page.waitForLoadState("networkidle");
    for (const [code, shape] of [
      ["2", "tall"],
      ["7", "wide"],
    ] as const) {
      const seen = await page.evaluate(
        async ([bay, form]) => {
          const tray = document.querySelector<HTMLElement>("[data-tray]")!;
          tray.dataset.tray = bay!;
          tray.dataset.trayShape = form!;
          const result = document.querySelector<HTMLElement>(".tray__result")!;
          await Promise.all(
            result.getAnimations().map((animation) => animation.finished),
          );
          const box = (node: Element) => {
            const rect = node.getBoundingClientRect();
            return {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            };
          };
          return {
            tray: box(document.querySelector("[data-part='tray']")!),
            result: box(result),
            action: box(document.querySelector("[data-tray-action]")!),
          };
        },
        [code, shape],
      );
      const where = `${shape} at ${width}px`;
      expect(inside(seen.result, seen.tray), `${where}: in the bay`).toBe(true);
      expect(
        seen.action.bottom - seen.action.top,
        `${where}: TAKE DELIVERY height`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        seen.action.right - seen.action.left,
        `${where}: TAKE DELIVERY width`,
      ).toBeGreaterThanOrEqual(44);
    }
    await page.close();
  }
});
