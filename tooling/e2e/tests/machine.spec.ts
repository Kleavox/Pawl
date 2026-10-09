import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { localViteOrigin, localWorkerOrigin } from "@pawl/topology";
import { clearRateLimits, signedInAs } from "./pass-account";

const GATEWAY = localWorkerOrigin("gateway", "localhost");

function seconds(value: string): number {
  return Number.parseFloat(value);
}

async function openBooted(target: Page): Promise<void> {
  await target.goto("/");
  await target.waitForLoadState("networkidle");
}

async function lampColour(target: Page): Promise<string> {
  return target.evaluate(
    () =>
      getComputedStyle(
        document.querySelector<HTMLElement>("[data-cabinet-state]")!,
        "::before",
      ).backgroundColor,
  );
}

test("the cabinet holds exactly nine bays, three of them filled", async ({
  page,
}) => {
  const session = page.waitForResponse((response) =>
    response.url().includes("/api/session"),
  );
  await page.goto("/");
  await session;
  await expect(page.locator("main")).not.toHaveClass(/pw-main/);
  await expect(page.locator("[data-bay]")).toHaveCount(9);
  await expect(page.locator("[data-cartridge]")).toHaveCount(2);
});

test("each filled bay offers a button named for the person standing there", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator("[data-cartridge='1']"),
    "the static markup names the bay without a role claim, so this can only pass after render",
  ).toHaveAttribute("aria-label", "Select Link, bay 1, visitor pass required");
  for (const name of [
    "Select Link, bay 1, visitor pass required",
    "Select Portfolio, bay 3, ready",
  ]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      1,
    );
  }
});

test("the seven empty bays are not controls", async ({ page }) => {
  await page.goto("/");
  const empties = page.locator("[data-bay]:not(:has([data-cartridge]))");
  await expect(empties).toHaveCount(7);
  await expect(empties.locator("button")).toHaveCount(0);
  await expect(
    empties.locator("a, [tabindex], button, input, select, textarea"),
  ).toHaveCount(0);
  const focusable = await empties.evaluateAll(
    (nodes) =>
      nodes.filter(
        (node) =>
          node.matches("a, button, input, select, textarea") ||
          node.hasAttribute("tabindex"),
      ).length,
  );
  expect(focusable).toBe(0);
});

test("the machine stops growing on a wide desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  const box = await page.locator("[data-machine]").boundingBox();
  expect(box!.width).toBeLessThanOrEqual(820);
});

test("no horizontal overflow at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBe(320);
});

test("the three mobile shelves share one height", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const heights = await page
    .locator("[data-shelf]")
    .evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
    );
  expect(new Set(heights).size).toBe(1);
});

test("every key is reachable and large enough to hit", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1100, height: 620 },
    { width: 900, height: 520 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    if (viewport.width <= 760) await page.locator("[data-dock]").click();
    const keys = page.locator("[data-key]");
    await expect(keys).toHaveCount(12);
    for (const key of await keys.all()) {
      const box = await key.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await expect(key).toBeVisible();
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  }
});

test("the console reports its own open state to assistive tech", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const dock = page.locator("[data-dock]");
  const panel = page.locator("[data-console]");
  await expect(dock).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveAttribute("data-console", "closed");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  expect(await panel.evaluate((node) => node.hasAttribute("inert"))).toBe(true);
  await dock.click();
  await expect(dock).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("[data-console]")).toHaveAttribute(
    "data-console",
    "open",
  );
  await expect(panel).toHaveAttribute("aria-hidden", "false");
  expect(await panel.evaluate((node) => node.hasAttribute("inert"))).toBe(
    false,
  );
  await page.keyboard.press("Escape");
  await expect(dock).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveAttribute("data-console", "closed");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  expect(await panel.evaluate((node) => node.hasAttribute("inert"))).toBe(true);
});

test("closing the console returns focus to the dock", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("[data-dock]").click();
  await expect(page.locator("[data-dock]")).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-dock]")).toBeFocused();
  await expect(page.locator("[data-console]")).toHaveAttribute(
    "data-console",
    "closed",
  );
});

test("the close button and the scrim close it the same way", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const dock = page.locator("[data-dock]");
  const panel = page.locator("[data-console]");

  await dock.click();
  await page.locator("[data-console-close]").click();
  await expect(panel).toHaveAttribute("data-console", "closed");
  await expect(dock).toHaveAttribute("aria-expanded", "false");
  await expect(dock).toBeFocused();

  await dock.click();
  await page.locator("[data-scrim]").click({ position: { x: 30, y: 30 } });
  await expect(panel).toHaveAttribute("data-console", "closed");
  await expect(dock).toHaveAttribute("aria-expanded", "false");
  await expect(dock).toBeFocused();
});

test("the open sheet is a modal, and says so", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const panel = page.locator("[data-console]");
  const reach = async (): Promise<boolean> =>
    page.evaluate(() => {
      const cartridge = document.querySelector<HTMLElement>(
        "[data-cartridge='1']",
      )!;
      cartridge.focus();
      const reached = document.activeElement === cartridge;
      cartridge.blur();
      return reached;
    });

  expect(await reach()).toBe(true);
  await page.locator("[data-dock]").click();
  await expect(panel).toHaveAttribute("role", "dialog");
  await expect(panel).toHaveAttribute("aria-modal", "true");
  expect(await reach()).toBe(false);
  await page.keyboard.press("Escape");
  expect(await reach()).toBe(true);
});

test("on a desktop the console is a landmark, not a modal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const panel = page.locator("[data-console]");
  expect(
    await panel.evaluate((node) => ({
      role: node.getAttribute("role"),
      modal: node.getAttribute("aria-modal"),
      inert: node.hasAttribute("inert"),
    })),
  ).toEqual({ role: null, modal: null, inert: false });
  await page.locator("[data-key='7']").focus();
  await expect(page.locator("[data-key='7']")).toBeFocused();
});

test("narrowing to the sheet does not strand focus inside it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const panel = page.locator("[data-console]");

  await page.locator("[data-key='7']").focus();
  await expect(page.locator("[data-key='7']")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveAttribute("data-console", "closed");
  await expect(page.locator("[data-dock]")).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(panel).toHaveAttribute("data-console", "open");
  await page.locator("[data-cartridge='3']").focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveAttribute("data-console", "closed");
  await expect(page.locator(".cabinet")).not.toHaveAttribute("inert", "");
  await expect(page.locator("[data-cartridge='3']")).toBeFocused();
});

test("narrowing back onto an open sheet does not strand focus on the body", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("[data-dock]").click();
  await expect(page.locator("[data-console]")).toHaveAttribute(
    "data-console",
    "open",
  );
  await expect(page.locator("[data-reader]")).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("[data-cartridge='3']").focus();
  await expect(page.locator("[data-cartridge='3']")).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".cabinet")).toHaveAttribute("inert", "");
  await expect(page.locator("[data-console]")).toHaveAttribute(
    "data-console",
    "open",
  );
  expect(
    await page.evaluate(() => document.activeElement?.tagName ?? null),
  ).not.toBe("BODY");
  await expect(page.locator("[data-reader]")).toBeFocused();
});

test("a resize that keeps the sheet sealed leaves focus where the reader put it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("[data-dock]").click();
  await expect(page.locator("[data-reader]")).toBeFocused();
  await page.locator("[data-key='7']").focus();
  await expect(page.locator("[data-key='7']")).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".cabinet")).not.toHaveAttribute("inert", "");
  await expect(page.locator("[data-key='7']")).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".cabinet")).toHaveAttribute("inert", "");
  await expect(page.locator("[data-console]")).toHaveAttribute(
    "data-console",
    "open",
  );
  await expect(page.locator("[data-key='7']")).toBeFocused();
});

test("the reader stays inside the control column in the DOM", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const inside = await page.evaluate(() =>
    Boolean(document.querySelector("[data-console] [data-reader]")),
  );
  expect(inside).toBe(true);
  await page.locator("[data-dock]").click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const reader = document
          .querySelector("[data-reader]")!
          .getBoundingClientRect();
        const panel = document
          .querySelector("[data-console]")!
          .getBoundingClientRect();
        return Math.round(reader.bottom - panel.top);
      }),
    )
    .toBeLessThanOrEqual(0);
});

test("the login terminal is a modal dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const terminal = page.locator("[data-terminal]");
  await expect(terminal).toBeHidden();
  await page.locator("[data-terminal-open]").click();
  await expect(terminal).toBeVisible();
  expect(await terminal.evaluate((node) => node.matches("dialog:modal"))).toBe(
    true,
  );
});

test("closing the terminal returns focus to the control that opened it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("[data-terminal-open]").click();
  await page.locator("[data-terminal-close]").click();
  await expect(page.locator("[data-terminal]")).toBeHidden();
  await expect(page.locator("[data-terminal-open]")).toBeFocused();
});

test("escape inside the terminal closes it without closing the console", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("[data-dock]").click();
  await page.locator("[data-terminal-open]").click();
  await expect(page.locator("[data-terminal]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-terminal]")).toBeHidden();
  await expect(page.locator("[data-console]")).toHaveAttribute(
    "data-console",
    "open",
  );
  await expect(page.locator("[data-terminal-open]")).toBeFocused();
});

test("closing the terminal hands the machine back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooted(page);
  await page.locator("[data-terminal-open]").click();
  await expect(page.locator("[data-screen]")).toContainText("CHOOSE A METHOD");
  await page.locator("[data-terminal-close]").click();
  await expect(page.locator("[data-terminal]")).toBeHidden();
  await expect(page.locator("[data-screen]")).not.toContainText(
    "THE TERMINAL IS OPEN",
  );

  await page.locator("[data-cartridge='3']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "3");

  await page.locator("[data-terminal-open]").click();
  await expect(page.locator("[data-terminal]")).toBeVisible();
});

test("pressing a bay twice still leaves the product in the tray", async ({
  page,
}) => {
  await openBooted(page);
  await page.locator("[data-cartridge='3']").dblclick();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "3");
  await page.waitForTimeout(1800);
  await expect(
    page.locator("[data-tray]"),
    "a second release timer would have copied an empty selection over the tray",
  ).toHaveAttribute("data-tray", "3");
  await expect(page.locator("[data-screen]")).toContainText("DELIVERED");
});

test("the keypad says which mode it is in, not only what colour", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBooted(page);
  await page.locator("[data-dock]").click();
  const legend = page.locator(".keypad-mode");
  const selector = page.locator("[data-keypad-mode='selector']");
  const otp = page.locator("[data-keypad-mode='otp']");

  await expect(legend).toHaveText("BAY SELECT", { useInnerText: true });
  await expect(selector).toBeVisible();
  await expect(otp).toBeHidden();

  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-machine]")!.dataset.input =
      "otp";
  });
  await expect(legend).toHaveText("EMAIL CODE", { useInnerText: true });
  await expect(otp).toBeVisible();
  await expect(selector).toBeHidden();

  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-machine]")!.dataset.input =
      "selector";
  });
  await expect(legend).toHaveText("BAY SELECT", { useInnerText: true });
  await expect(selector).toBeVisible();
  await expect(otp).toBeHidden();
});

test("the screen words sit inside a polite status region", async ({ page }) => {
  await page.goto("/");
  const region = await page.evaluate(() => {
    const screen = document.querySelector("[data-screen]")!;
    const live = screen.closest("[aria-live]");
    return {
      live: live?.getAttribute("aria-live") ?? null,
      role: live?.getAttribute("role") ?? null,
      text: (screen.textContent ?? "").trim(),
    };
  });
  expect(region.live).toBe("polite");
  expect(region.role).toBe("status");
  expect(region.text.length).toBeGreaterThan(0);
});

test("the renderer lights the bays a guest may take, and paints them", async ({
  page,
}) => {
  await page.goto("/");
  const bays = await page.evaluate(() =>
    ["1", "3"].map((bay) => {
      const light = document.querySelector<HTMLElement>(
        `[data-bay="${bay}"] [data-backlight]`,
      )!;
      const style = getComputedStyle(light);
      return {
        bay,
        lit: light.dataset.lit ?? null,
        paint: [style.backgroundImage, style.borderColor, style.boxShadow].join(
          " | ",
        ),
      };
    }),
  );
  expect(bays.map((entry) => entry.lit)).toEqual(["false", "true"]);
  expect(bays[1]!.paint).not.toBe(bays[0]!.paint);
});

test("the cabinet lamp changes with the pass, and never carries the meaning alone", async ({
  page,
}) => {
  await page.goto("/");
  const plate = page.locator("[data-cabinet-state]");
  await expect(plate).toHaveText("GUEST MODE");

  const lamps = await page.evaluate(() => {
    const node = document.querySelector<HTMLElement>("[data-cabinet-state]")!;
    const read = (): string =>
      getComputedStyle(node, "::before").backgroundColor;
    const guest = read();
    node.dataset.cabinetState = "owner";
    node.textContent = "OWNER MODE";
    return { guest, owner: read(), word: node.textContent };
  });
  expect(lamps.guest).not.toBe(lamps.owner);
  expect(lamps.word).toBe("OWNER MODE");
});

test("the tray offers nothing to press until something is delivered", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-tray]")).toHaveAttribute(
    "data-tray",
    "none",
  );
  await expect(page.locator("[data-tray-action]")).toBeHidden();
  await expect(page.locator(".tray-label")).toBeVisible();
  const reachable = await page.evaluate(() => {
    const action = document.querySelector<HTMLElement>("[data-tray-action]")!;
    action.focus();
    return document.activeElement === action;
  });
  expect(reachable).toBe(false);
});

test("a delivered cartridge gives the tray a real control", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1100, height: 620 },
    { width: 900, height: 520 },
  ]) {
    await page.setViewportSize(viewport);
    await openBooted(page);
    await page.evaluate(async () => {
      document.querySelector<HTMLElement>("[data-tray]")!.dataset.tray = "3";
      const result = document.querySelector<HTMLElement>(".tray-result")!;
      await Promise.all(
        result.getAnimations().map((animation) => animation.finished),
      );
    });
    const action = page.locator("[data-tray-action]");
    await expect(action).toBeVisible();
    await expect(action).toHaveAccessibleName("TAKE DELIVERY");
    await expect(page.locator(".tray-label")).toBeHidden();
    const box = await action.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test("the tray keeps the two products apart by shape", async ({ page }) => {
  await openBooted(page);
  const widths: number[] = [];
  const silhouettes: string[] = [];
  for (const bay of ["1", "3"]) {
    const shape = await page.evaluate(async (code) => {
      document.querySelector<HTMLElement>("[data-tray]")!.dataset.tray = code;
      const result = document.querySelector<HTMLElement>(".tray-result")!;
      await Promise.all(
        result.getAnimations().map((animation) => animation.finished),
      );
      const style = getComputedStyle(
        document.querySelector<HTMLElement>(".tray-item")!,
      );
      return [style.borderRadius, style.backgroundImage, style.boxShadow].join(
        " | ",
      );
    }, bay);
    silhouettes.push(shape);
    const box = await page.locator(".tray-item").boundingBox();
    widths.push(Math.round(box!.width));
  }
  expect(new Set(widths).size).toBe(2);
  expect(new Set(silhouettes).size).toBe(2);
});

test("each product leaves its bay by its own motion", async ({ page }) => {
  await page.goto("/");
  const seen = await page.evaluate(() => {
    const falling = document.querySelector<HTMLElement>("[data-falling]")!;
    const root = getComputedStyle(document.documentElement);
    const sequence = root.getPropertyValue("--pw-t6").trim();
    const rows: { name: string; duration: string; count: string }[] = [];
    for (const bay of ["1", "3"]) {
      falling.dataset.falling = bay;
      const style = getComputedStyle(falling);
      rows.push({
        name: style.animationName,
        duration: style.animationDuration,
        count: style.animationIterationCount,
      });
    }
    falling.dataset.falling = "none";
    return { rows, sequence, resting: getComputedStyle(falling).animationName };
  });
  expect(new Set(seen.rows.map((row) => row.name)).size).toBe(2);
  for (const row of seen.rows) {
    expect(seconds(row.duration)).toBe(seconds(seen.sequence));
    expect(row.count).toBe("1");
  }
  expect(seen.resting).toBe("none");
});

test("nothing on the machine animates forever", async ({ page }) => {
  await page.goto("/");
  const forever = await page.evaluate(() => {
    const machine = document.querySelector<HTMLElement>("[data-machine]")!;
    const tray = document.querySelector<HTMLElement>("[data-tray]")!;
    const falling = document.querySelector<HTMLElement>("[data-falling]")!;
    const transfer = document.querySelector<HTMLElement>("[data-transfer]")!;
    const offenders: string[] = [];
    const sweep = (): void => {
      for (const node of document.querySelectorAll("*")) {
        for (const pseudo of [null, "::before", "::after"]) {
          const style = getComputedStyle(node, pseudo);
          if (style.animationName === "none") continue;
          if (style.animationIterationCount === "1") continue;
          offenders.push(
            [
              node.tagName,
              node.className,
              pseudo ?? "",
              style.animationName,
              style.animationIterationCount,
            ].join(" "),
          );
        }
      }
    };
    machine.dataset.access = "owner";
    machine.dataset.status = "dispensing";
    tray.dataset.tray = "1";
    falling.dataset.falling = "1";
    transfer.dataset.transfer = "1";
    sweep();
    machine.dataset.status = "reading";
    sweep();
    machine.dataset.status = "denied";
    sweep();
    return offenders;
  });
  expect(forever).toEqual([]);
});

test("the pass card is off the machine until the reader is reading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooted(page);
  const card = page.locator(".pawl-card");
  await expect(card).toBeHidden();

  const reading = await page.evaluate(() => {
    const machine = document.querySelector<HTMLElement>("[data-machine]")!;
    machine.dataset.status = "reading";
    const style = getComputedStyle(
      document.querySelector<HTMLElement>(".pawl-card")!,
    );
    return {
      name: style.animationName,
      duration: style.animationDuration,
      count: style.animationIterationCount,
      move: getComputedStyle(document.documentElement)
        .getPropertyValue("--pw-t5")
        .trim(),
    };
  });
  await expect(card).toBeVisible();
  expect(reading.name).toBe("pawl-card-return");
  expect(seconds(reading.duration)).toBe(seconds(reading.move));
  expect(reading.count).toBe("1");

  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-machine]")!.dataset.status =
      "idle";
  });
  await expect(card).toBeHidden();
});

test("the bridge stays out of the way until a cartridge is taken", async ({
  page,
}) => {
  await openBooted(page);
  const cancel = page.locator("[data-transfer-cancel]");
  await expect(page.locator("[data-transfer]")).toBeHidden();
  await expect(cancel).toBeHidden();

  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-transfer]")!.dataset.transfer =
      "3";
  });
  await expect(page.locator("[data-transfer]")).toBeVisible();
  await expect(cancel).toBeVisible();
  const box = await cancel.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  const painted = await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>("[data-transfer]")!;
    const card = document.querySelector<HTMLElement>(
      ".screen-transfer__cartridge",
    )!;
    return {
      overlay: getComputedStyle(overlay).backgroundColor,
      cardFill: getComputedStyle(card).backgroundColor,
      cardRim: getComputedStyle(card).borderTopColor,
      name: overlay.getAttribute("aria-label"),
    };
  });
  expect(painted.overlay).not.toBe("rgba(0, 0, 0, 0)");
  expect(painted.cardFill).not.toBe("rgba(0, 0, 0, 0)");
  expect(painted.cardRim).not.toBe("rgba(0, 0, 0, 0)");
  expect(painted.name).toBe("Opening the selected application");
});

async function openTheBridge(
  browser: import("@playwright/test").Browser,
  reduced: boolean,
): Promise<{
  visible: string;
  slowest: number;
  opacity: string;
  hits: string;
  height: number;
}> {
  const context = await browser.newContext(
    reduced ? { reducedMotion: "reduce" } : {},
  );
  const page = await context.newPage();
  await openBooted(page);
  const seen = await page.evaluate(async () => {
    const overlay = document.querySelector<HTMLElement>("[data-transfer]")!;
    overlay.dataset.transfer = "1";
    await new Promise((settled) => {
      requestAnimationFrame(() => requestAnimationFrame(settled));
    });
    let slowest = 0;
    for (const node of [overlay, ...overlay.querySelectorAll("*")]) {
      for (const pseudo of [null, "::before", "::after"]) {
        const style = getComputedStyle(node, pseudo);
        if (style.animationName === "none") continue;
        const delays = style.animationDelay.split(",");
        const durations = style.animationDuration.split(",");
        for (const [index, delay] of delays.entries()) {
          const ends =
            (Number.parseFloat(delay) +
              Number.parseFloat(
                durations[index % durations.length] ?? durations[0] ?? "0",
              )) *
            1000;
          if (ends > slowest) slowest = ends;
        }
      }
    }
    const cancel = document.querySelector<HTMLElement>(
      "[data-transfer-cancel]",
    )!;
    const style = getComputedStyle(cancel);
    return {
      visible: getComputedStyle(overlay).visibility,
      slowest,
      opacity: style.opacity,
      hits: style.pointerEvents,
      height: cancel.getBoundingClientRect().height,
    };
  });
  await context.close();
  return seen;
}

test("reduced motion shortens the bridge, it does not skip it", async ({
  browser,
}) => {
  const full = await openTheBridge(browser, false);
  const reduced = await openTheBridge(browser, true);

  expect(full.visible).toBe("visible");
  expect(reduced.visible).toBe("visible");

  expect(full.slowest).toBeGreaterThan(600);
  expect(reduced.slowest).toBeLessThanOrEqual(40);

  expect(reduced.opacity).toBe("1");
  expect(reduced.hits).toBe("auto");
  expect(reduced.height).toBeGreaterThanOrEqual(44);
});

test("a full tray stays inside the cabinet it is bolted to", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 700 },
    { width: 390, height: 844 },
    { width: 900, height: 520 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openBooted(page);
    const fit = await page.evaluate(async () => {
      document.querySelector<HTMLElement>("[data-tray]")!.dataset.tray = "3";
      const result = document.querySelector<HTMLElement>(".tray-result")!;
      await Promise.all(
        result.getAnimations().map((animation) => animation.finished),
      );
      const tray = document
        .querySelector<HTMLElement>("[data-tray]")!
        .getBoundingClientRect();
      const action = document
        .querySelector<HTMLElement>("[data-tray-action]")!
        .getBoundingClientRect();
      const cabinet = document
        .querySelector<HTMLElement>(".cabinet")!
        .getBoundingClientRect();
      return {
        overhangRight: tray.right - cabinet.right,
        overhangLeft: cabinet.left - tray.left,
        actionRight: action.right - cabinet.right,
        actionLeft: cabinet.left - action.left,
      };
    });
    expect(fit.overhangRight).toBeLessThanOrEqual(0);
    expect(fit.overhangLeft).toBeLessThanOrEqual(0);
    expect(fit.actionRight).toBeLessThanOrEqual(0);
    expect(fit.actionLeft).toBeLessThanOrEqual(0);
  }
});

test("every route the machine offers is reachable from here", async ({
  page,
}) => {
  await page.goto("/");
  const links = await page.evaluate(() => {
    const hrefs = [
      ...document.querySelectorAll<HTMLElement>("[data-href]"),
    ].map((node) => node.dataset.href ?? "");
    const footer = [
      ...document.querySelectorAll<HTMLAnchorElement>(".ftr-links a"),
    ].map((node) => node.getAttribute("href") ?? "");
    return { hrefs, footer, host: location.hostname };
  });

  expect(links.hrefs).toHaveLength(2);
  for (const href of [...links.hrefs, ...links.footer]) {
    if (!href.includes("://")) continue;
    const url = new URL(href);
    expect(url.hostname).toBe(links.host);
    expect(url.protocol).toBe("http:");
  }

  expect(links.hrefs).toEqual([
    localWorkerOrigin("link", links.host),
    localViteOrigin("portfolio", links.host),
  ]);
});

test("the returning pass card never widens the page", async ({ page }) => {
  for (const width of [761, 800, 900, 1000, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await openBooted(page);
    const measured = await page.evaluate(() => {
      document.querySelector<HTMLElement>("[data-machine]")!.dataset.status =
        "reading";
      return document.documentElement.scrollWidth;
    });
    expect(measured).toBe(width);
  }
});

test("the cabinet still wears its cap and its side rails", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const protrusions = await page.evaluate(() => {
    const machine = document
      .querySelector<HTMLElement>("[data-machine]")!
      .getBoundingClientRect();
    const cap = getComputedStyle(
      document.querySelector<HTMLElement>("[data-machine]")!,
      "::after",
    );
    const cabinet = document.querySelector<HTMLElement>(".cabinet")!;
    const rail = getComputedStyle(cabinet, "::before");
    return {
      capTop: cap.top,
      railLeft: rail.left,
      clipMargin: getComputedStyle(
        document.querySelector<HTMLElement>("[data-machine]")!,
      ).overflowClipMargin,
      machineWidth: Math.round(machine.width),
    };
  });
  expect(protrusions.capTop).toBe("-7px");
  expect(protrusions.railLeft).toBe("-7px");
  expect(Number.parseFloat(protrusions.clipMargin)).toBeGreaterThan(7);
});

test("a guest is told to insert a pass and cannot take LINK", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-screen]")).toHaveText("INSERT PASS");
  await page.locator("[data-cartridge='1']").click();
  await expect(page.locator("[data-screen]")).toContainText("PASS REQUIRED");
  await expect(page.locator("[data-tray]")).toHaveAttribute(
    "data-tray",
    "none",
  );
});

test("a guest can take PORTFOLIO without a pass", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-cartridge='3']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "3");
  await expect(page.locator("[data-screen]")).toContainText("DELIVERED");
});

test("number entry and GO reach the same place as tapping", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Digit3");
  await expect(page.locator("[data-screen]")).toContainText("3 SELECTED");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "3");
});

test("the keypad keys dispense the same way the physical keys do", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-key='3']").click();
  await page.locator("[data-key='GO']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "3");
});

test("taking the delivery opens a real modal bridge that escape can leave", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-cartridge='3']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "3");

  await page.locator("[data-tray-action]").click();
  const bridge = page.locator("[data-transfer]");
  await expect(bridge).toHaveAttribute("data-transfer", "3");
  const sealed = await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>("[data-transfer]")!;
    const cartridge = document.querySelector<HTMLElement>(
      "[data-cartridge='3']",
    )!;
    cartridge.focus();
    return {
      modal: overlay.matches("dialog:modal"),
      reachedBehind: document.activeElement === cartridge,
      focusInside: overlay.contains(document.activeElement),
    };
  });
  expect(sealed.modal).toBe(true);
  expect(sealed.reachedBehind).toBe(false);
  expect(sealed.focusInside).toBe(true);

  await page.keyboard.press("Escape");
  await expect(bridge).toHaveAttribute("data-transfer", "none");
  await expect(page.locator("[data-tray-action]")).toBeFocused();
  await expect(page).toHaveURL(/:\d+\/$/);
});

test("the cancel button leaves the bridge the same way escape does", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-cartridge='3']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "3");
  await page.locator("[data-tray-action]").click();
  await expect(page.locator("[data-transfer]")).toHaveAttribute(
    "data-transfer",
    "3",
  );
  await page.locator("[data-transfer-cancel]").click();
  await expect(page.locator("[data-transfer]")).toHaveAttribute(
    "data-transfer",
    "none",
  );
  await expect(page.locator("[data-tray-action]")).toBeFocused();
});

test("a blocked sessionStorage says so instead of forgetting in silence", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("storage is blocked");
        },
        setItem: () => {
          throw new Error("storage is blocked");
        },
        removeItem: () => {
          throw new Error("storage is blocked");
        },
      },
    });
  });
  await page.goto("/");
  await page.locator("[data-cartridge='1']").click();
  await expect(page.locator("[data-screen]")).toContainText("PASS REQUIRED");

  await page.locator("[data-terminal-open]").click();
  await page.locator("[data-terminal-provider='google']").click();

  const said = page.locator("[data-terminal-error]");
  await expect(said).toBeVisible();
  await expect(said).toContainText(/pick the bay again/i);
  expect(
    await said.evaluate((node) => {
      const dialog = node.closest("dialog");
      return dialog !== null && dialog.matches("dialog:modal");
    }),
  ).toBe(true);
});

test.describe("with a real pass in the machine", () => {
  test.describe.configure({ mode: "serial" });

  let context: BrowserContext;
  let signedIn: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    context = await browser.newContext();
    signedIn = await context.newPage();
    await signedInAs(signedIn, "probemachine", "ADMIN");
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("the machine says the estate is unreadable rather than looking calm", async () => {
    await signedIn.route("**/api/estate", (route) =>
      route.fulfill({ status: 500, body: "{}" }),
    );
    await signedIn.goto(GATEWAY);
    await expect(signedIn.locator("[data-screen]")).toContainText("UNREADABLE");
    await signedIn.unroute("**/api/estate");
  });

  test("a session that could not be read still owes the bay on retry", async () => {
    await signedIn.goto(GATEWAY);
    await expect(signedIn.locator("[data-cabinet-state]")).toHaveText(
      "OWNER MODE",
    );
    await signedIn.evaluate(() =>
      sessionStorage.setItem("pawl:machine-request", "1"),
    );
    let sessions = 0;
    await signedIn.route("**/api/session", async (route) => {
      sessions += 1;
      if (sessions === 1) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    await signedIn.reload();
    await expect(signedIn.locator("[data-screen]")).toContainText(
      "SESSION UNREADABLE",
    );

    await signedIn.locator("[data-key='GO']").click();
    await expect(signedIn.locator("[data-tray]")).toHaveAttribute(
      "data-tray",
      "1",
      { timeout: 20_000 },
    );
    expect(
      await signedIn.evaluate(() =>
        sessionStorage.getItem("pawl:machine-request"),
      ),
    ).toBeNull();
    await signedIn.unroute("**/api/session");
  });

  test("a real pass drives the cabinet plate, not a hand-set attribute", async ({
    browser,
  }) => {
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(GATEWAY);
    await expect(
      guest.locator("[data-cartridge='1']"),
      "the guest half must read a painted label, not the static markup",
    ).toHaveAttribute(
      "aria-label",
      "Select Link, bay 1, visitor pass required",
    );
    await expect(guest.locator("[data-cabinet-state]")).toHaveText(
      "GUEST MODE",
    );
    const guestLamp = await lampColour(guest);
    const guestBays = await guest.evaluate(() =>
      ["1", "3"].map(
        (bay) =>
          document.querySelector<HTMLElement>(
            `[data-bay="${bay}"] [data-backlight]`,
          )!.dataset.lit,
      ),
    );
    await guestContext.close();

    await signedIn.goto(GATEWAY);
    const plate = signedIn.locator("[data-cabinet-state]");
    await expect(plate).toHaveText("OWNER MODE");
    await expect(plate).toHaveAttribute("data-cabinet-state", "owner");
    await expect(signedIn.locator("[data-machine]")).toHaveAttribute(
      "data-access",
      "owner",
    );
    await expect(
      signedIn.getByRole("button", {
        name: "Select Link, bay 1, ready",
        exact: true,
      }),
      "an owner must not be told they need an owner pass",
    ).toHaveCount(1);
    const ownerLamp = await lampColour(signedIn);
    const ownerBays = await signedIn.evaluate(() =>
      ["1", "3"].map(
        (bay) =>
          document.querySelector<HTMLElement>(
            `[data-bay="${bay}"] [data-backlight]`,
          )!.dataset.lit,
      ),
    );

    expect(guestBays).toEqual(["false", "true"]);
    expect(ownerBays).toEqual(["true", "true"]);
    expect(ownerLamp).not.toBe(guestLamp);
  });

  test("an owner can take the bay a guest was refused", async () => {
    await signedIn.goto(GATEWAY);
    await expect(signedIn.locator("[data-cabinet-state]")).toHaveText(
      "OWNER MODE",
    );
    await signedIn.locator("[data-cartridge='1']").click();
    await expect(signedIn.locator("[data-tray]")).toHaveAttribute(
      "data-tray",
      "1",
    );
    await expect(signedIn.locator("[data-screen]")).toContainText("LINK");
  });

  test("the pass terminal cannot walk a signed-in owner back into the sign-in chooser", async () => {
    await signedIn.goto(GATEWAY);
    await expect(signedIn.locator("[data-cabinet-state]")).toHaveText(
      "OWNER MODE",
    );
    await expect(signedIn.locator("[data-terminal-state]")).toHaveText(
      "SIGNED IN",
    );

    await signedIn.locator("[data-terminal-open]").click();
    await expect(signedIn.locator("[data-terminal]")).toBeHidden();
    await expect(
      signedIn.locator("[data-terminal-provider='google']"),
    ).toBeHidden();
    await expect(signedIn.locator("[data-cabinet-state]")).toHaveText(
      "OWNER MODE",
    );
  });

  test("GO retries a failed estate read, says so when it fails again, and clears once it succeeds", async () => {
    let failing = true;
    await signedIn.route("**/api/estate", async (route) => {
      if (failing) {
        await route.fulfill({ status: 500, body: "{}" });
        return;
      }
      await route.continue();
    });
    await signedIn.goto(GATEWAY);

    const screen = signedIn.locator("[data-screen]");
    await expect(screen).toHaveText("ESTATE UNREADABLE");
    await expect(signedIn.locator("[data-screen-sub]")).toHaveText(
      "PRESS GO TO RETRY",
    );

    await signedIn.locator("[data-key='GO']").click();
    await expect(screen).toHaveText("ESTATE STILL UNREADABLE");

    failing = false;
    await signedIn.locator("[data-key='GO']").click();
    await expect(screen).not.toContainText("UNREADABLE", { timeout: 20_000 });
    await expect(signedIn.locator("[data-screen-sub]")).toHaveText(
      "SELECT A BAY",
    );
    await signedIn.unroute("**/api/estate");
  });

  test("a retry after an unreadable session hands the pass back, it does not leave a guest cabinet", async () => {
    let failing = true;
    await signedIn.route("**/api/session", async (route) => {
      if (failing) {
        await route.fulfill({ status: 500, body: "{}" });
        return;
      }
      await route.continue();
    });
    await signedIn.goto(GATEWAY);
    await expect(signedIn.locator("[data-screen]")).toHaveText(
      "SESSION UNREADABLE",
    );
    await expect(signedIn.locator("[data-cabinet-state]")).toHaveText(
      "GUEST MODE",
    );

    failing = false;
    await signedIn.locator("[data-key='GO']").click();

    await expect(signedIn.locator("[data-cabinet-state]")).toHaveText(
      "OWNER MODE",
      { timeout: 20_000 },
    );
    await expect(signedIn.locator("[data-machine]")).toHaveAttribute(
      "data-access",
      "owner",
    );
    await expect(signedIn.locator("[data-cartridge='1']")).toHaveAttribute(
      "aria-label",
      "Select Link, bay 1, ready",
    );

    await signedIn.locator("[data-cartridge='1']").click();
    await expect(
      signedIn.locator("[data-tray]"),
      "the reducer must hold the pass too, not just the model the lamps read",
    ).toHaveAttribute("data-tray", "1", { timeout: 20_000 });

    await signedIn.unroute("**/api/session");
  });
});

test("a broken session endpoint is a fault, not a calm guest", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({ status: 500, body: "{}" }),
  );
  await page.goto(GATEWAY);
  const screen = page.locator("[data-screen]");
  await expect(screen).toContainText("UNREADABLE");
  await expect(screen).toBeVisible();

  const counts = page.locator(".pw-nav-count");
  await expect(
    counts,
    "an unreadable session must not render the header of a calm guest",
  ).toHaveCount(2);
  await expect(counts).toHaveText(["--", "--"]);
  await expect(page.locator(".pw-nav-tool .pw-pad-warn")).toHaveCount(2);
});

async function reachOtpMode(page: Page): Promise<void> {
  await page.locator("[data-reader]").click();
  await expect(page.locator("[data-terminal]")).toBeVisible();
  await page
    .locator("[data-terminal-email]")
    .fill(`otpprobe-${Date.now().toString().slice(-6)}@example.com`);
  await page.locator("[data-terminal-send]").click();
  await expect(page.locator("[data-terminal]")).toBeHidden();
  await expect(page.locator("[data-machine]")).toHaveAttribute(
    "data-input",
    "otp",
  );
}

async function typeCode(page: Page, code: string): Promise<void> {
  for (const digit of code) await page.locator(`[data-key='${digit}']`).click();
}

test.describe("codes typed on the machine keypad", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(() => {
    clearRateLimits();
  });

  test("a rejected code says so, and a new code can be typed at once", async ({
    page,
  }) => {
    await page.goto(GATEWAY);
    await reachOtpMode(page);

    await typeCode(page, "12345");
    await expect(page.locator("[data-screen]")).toHaveText("EMAIL CODE 5/6");

    await page.locator("[data-key='6']").click();
    await expect(page.locator("[data-screen]")).toHaveText("CODE REJECTED");
    await expect(page.locator("[data-screen-sub]")).toContainText("TRIES LEFT");

    await page.locator("[data-key='7']").click();
    await expect(page.locator("[data-screen]")).toHaveText("EMAIL CODE 1/6");
  });

  test("signing in while the estate is down says so, it does not stop at PASS ACCEPTED", async ({
    page,
  }) => {
    await page.route("**/api/auth/otp/verify", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          user: {
            id: "probe",
            email: "probe@example.com",
            username: "probe",
            role: "USER",
          },
          needsSetup: false,
        }),
      }),
    );
    await page.route("**/api/estate", (route) =>
      route.fulfill({ status: 500, body: "{}" }),
    );

    await page.goto(GATEWAY);
    await reachOtpMode(page);
    await typeCode(page, "123456");

    await expect(page.locator("[data-cabinet-state]")).toHaveText(
      "VISITOR MODE",
    );
    await expect(page.locator("[data-screen]")).toHaveText("ESTATE UNREADABLE");
  });

  test("a dropped packet during verify keeps the code, it does not end the sign-in", async ({
    page,
  }) => {
    await page.goto(GATEWAY);
    await reachOtpMode(page);
    await page.route("**/api/auth/otp/verify", (route) => route.abort());
    await typeCode(page, "123456");

    const error = page.locator("[data-terminal-error]");
    await expect(error).toBeVisible();
    await expect(error).toContainText(/could not tell/i);
    await expect(
      error,
      "the machine cannot know the code survived, so it must not promise it",
    ).not.toContainText(/still good/i);
    await expect(page.locator("[data-machine]")).toHaveAttribute(
      "data-input",
      "otp",
    );

    await page.locator("[data-terminal-close]").click();
    await expect(page.locator("[data-screen]")).toHaveText("EMAIL CODE 6/6");

    let verifies = 0;
    await page.unroute("**/api/auth/otp/verify");
    await page.route("**/api/auth/otp/verify", async (route) => {
      verifies += 1;
      await route.continue();
    });
    await page.locator("[data-key='GO']").click();
    await expect(page.locator("[data-screen]")).toHaveText("CODE REJECTED");
    expect(verifies).toBe(1);
  });

  test("the machine greets a code sign-in by name, not as a generic account", async ({
    browser,
  }) => {
    const fresh = await browser.newContext();
    const page = await fresh.newPage();
    await page.route("**/api/auth/otp/verify", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          user: {
            id: "probe",
            email: "namedprobe@example.com",
            username: "namedprobe",
            role: "USER",
          },
          needsSetup: false,
        }),
      }),
    );
    await page.goto(GATEWAY);
    await reachOtpMode(page);
    await typeCode(page, "123456");

    await expect(page.locator("[data-cabinet-state]")).toHaveText(
      "VISITOR MODE",
    );
    await expect(page.locator("[data-account-name]")).toHaveText("namedprobe");
    await fresh.close();
  });

  test("a code sign-in with no username lands on the Pass welcome step", async ({
    browser,
  }) => {
    const fresh = await browser.newContext();
    const page = await fresh.newPage();
    await page.route("**/api/auth/otp/verify", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          user: {
            id: "probe",
            email: "setupprobe@example.com",
            username: null,
            role: "USER",
          },
          needsSetup: true,
        }),
      }),
    );
    await page.goto(GATEWAY);
    await reachOtpMode(page);
    await typeCode(page, "123456");

    await expect(page).toHaveURL(/\/welcome\?returnTo=/, { timeout: 20_000 });
    await fresh.close();
  });

  test("a lost answer to a checked code is settled against the session", async ({
    page,
  }) => {
    await page.goto(GATEWAY);
    await reachOtpMode(page);
    await page.route("**/api/auth/otp/verify", (route) => route.abort());
    await page.route("**/api/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          identity: {
            id: "probe",
            email: "lostanswer@example.com",
            username: "lostanswer",
            role: "USER",
          },
        }),
      }),
    );
    await typeCode(page, "123456");

    await expect(page.locator("[data-cabinet-state]")).toHaveText(
      "VISITOR MODE",
    );
    await expect(page.locator("[data-terminal]")).toBeHidden();
    await page.unroute("**/api/session");
    await page.unroute("**/api/auth/otp/verify");
  });

  test("a new account keeps the bay it asked for on the way to welcome", async ({
    browser,
  }) => {
    const fresh = await browser.newContext();
    const page = await fresh.newPage();
    await page.route("**/api/auth/otp/verify", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          user: {
            id: "probe",
            email: "keptbay@example.com",
            username: null,
            role: "USER",
          },
          needsSetup: true,
        }),
      }),
    );
    await page.route("**/welcome*", (route) =>
      route.fulfill({ status: 204, body: "" }),
    );

    await page.goto(GATEWAY);
    await page.locator("[data-cartridge='1']").click();
    await expect(page.locator("[data-screen]")).toContainText("PASS REQUIRED");
    await reachOtpMode(page);
    await typeCode(page, "123456");

    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem("pawl:machine-request")),
      )
      .toBe("1");
    await fresh.close();
  });

  test("a second code cannot race the first one being checked", async ({
    page,
  }) => {
    await page.goto(GATEWAY);
    await reachOtpMode(page);

    let verifies = 0;
    await page.route("**/api/auth/otp/verify", async (route) => {
      verifies += 1;
      await new Promise((settled) => setTimeout(settled, 1500));
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          code: "invalid_code",
          message: "That code is incorrect.",
          attemptsLeft: 4,
        }),
      });
    });

    await typeCode(page, "123456");
    await page.locator("[data-key='CLR']").click();
    await page.locator("[data-key='9']").click();
    await expect(page.locator("[data-screen]")).toHaveText("CODE REJECTED", {
      timeout: 10_000,
    });
    expect(verifies).toBe(1);
  });
});

test("a fault holds the screen until the next touch, then the estate line comes back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(GATEWAY);
  await expect(page.locator("[data-dock-screen]")).toHaveText("INSERT PASS");

  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-cartridge='3']")!.dataset.href =
      "http://";
  });
  await page.locator("[data-cartridge='3']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "3");
  await page.locator("[data-tray-action]").click();

  await expect(page.locator("[data-dock-screen]")).toHaveText(
    "BRIDGE FAILED, RELEASE IT AGAIN",
    { timeout: 15_000 },
  );
  await expect(page.locator("[data-transfer]")).toHaveAttribute(
    "data-transfer",
    "none",
  );

  await page.locator("[data-dock]").click();
  await expect(
    page.locator("[data-dock-screen]"),
    "a fault must not overwrite the estate line for the life of the page",
  ).toHaveText("INSERT PASS");
});

test("cancel still leaves the bridge after the transfer has resolved", async ({
  page,
}) => {
  await page.goto(GATEWAY);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-cartridge='3']")!.dataset.href =
      "#stay";
  });

  await page.locator("[data-cartridge='3']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "3");
  await page.locator("[data-tray-action]").click();
  const bridge = page.locator("[data-transfer]");
  await expect(bridge).toHaveAttribute("data-transfer", "3");

  await expect(page).toHaveURL(/#stay$/, { timeout: 10_000 });

  await page.locator("[data-transfer-cancel]").click();
  await expect(bridge).toHaveAttribute("data-transfer", "none");
  await expect(page.locator("[data-tray-action]")).toBeFocused();
});

test.describe("with a visitor pass in the machine", () => {
  test.describe.configure({ mode: "serial" });

  let context: BrowserContext;
  let visitor: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    context = await browser.newContext();
    visitor = await context.newPage();
    await signedInAs(visitor, "probevisitor", "USER");
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("a visitor's bays and cartridge names follow the pass they hold", async () => {
    await visitor.goto(GATEWAY);
    await expect(visitor.locator("[data-cartridge='1']")).toHaveAttribute(
      "aria-label",
      "Select Link, bay 1, ready",
    );
    const bays = await visitor.evaluate(() =>
      ["1", "3"].map(
        (bay) =>
          document.querySelector<HTMLElement>(
            `[data-bay="${bay}"] [data-backlight]`,
          )!.dataset.lit,
      ),
    );
    expect(bays).toEqual(["true", "true"]);
  });

  test("a visitor can still take the bay their pass opens", async () => {
    await visitor.goto(GATEWAY);
    await visitor.locator("[data-cartridge='1']").click();
    await expect(visitor.locator("[data-tray]")).toHaveAttribute(
      "data-tray",
      "1",
    );
    await expect(visitor.locator("[data-screen]")).toContainText("LINK");
  });
});
