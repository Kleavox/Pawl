import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";
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
        document.querySelector<HTMLElement>(
          "[data-cabinet-state] .pw-chip__lamp",
        )!,
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
    page.locator("[data-cartridge='2']"),
    "the static markup names the bay without a role claim, so this can only pass after render",
  ).toHaveAttribute("aria-label", "Select Notes, bay 2, visitor pass required");
  for (const name of [
    "Select Notes, bay 2, visitor pass required",
    "Select Docs, bay 7, ready",
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
  expect(box!.width).toBeLessThanOrEqual(1120);
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

test("the service panel is a landmark at every width, never a modal", async ({
  page,
}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const panel = page.getByRole("region", { name: "Service panel" });
    await expect(panel).toBeVisible();
    expect(
      await panel.evaluate((node) => ({
        role: node.getAttribute("role"),
        modal: node.getAttribute("aria-modal"),
        inert: node.hasAttribute("inert"),
      })),
    ).toEqual({ role: null, modal: null, inert: false });
    await page.locator("[data-key='7']").focus();
    await expect(page.locator("[data-key='7']")).toBeFocused();
  }
});

test("on a phone the machine is one tall column, top to bottom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tops = await page.evaluate(() =>
    [
      ".marquee",
      ".glass",
      "[data-screen-zone]",
      ".keypad",
      ".reader",
      "[data-tray]",
      ".plate",
    ].map((selector) =>
      Math.round(document.querySelector(selector)!.getBoundingClientRect().top),
    ),
  );
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  await expect(page.locator("[data-dock]")).toHaveCount(0);
  await expect(page.locator("[data-scrim]")).toHaveCount(0);
});

test("signing in on a phone brings the screen to the person", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator("[data-terminal-open]").click({ force: true });
  await expect(page.locator("[data-terminal]")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const box = document
          .querySelector("[data-screen-zone]")!
          .getBoundingClientRect();
        return box.top < window.innerHeight && box.bottom > 0;
      }),
    )
    .toBe(true);
});

test("under reduced motion the screen jumps to the person instead of gliding", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const seen: unknown[] = [];
    Object.assign(window, { scrolls: seen });
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      seen.push(options);
      return original.call(this, options);
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator("[data-terminal-open]").click({ force: true });
  await expect(page.locator("[data-terminal]")).toBeVisible();
  const scrolls = await page.evaluate(
    () => (window as unknown as { scrolls: ScrollIntoViewOptions[] }).scrolls,
  );
  expect(scrolls.length).toBeGreaterThan(0);
  for (const options of scrolls) expect(options.behavior).not.toBe("smooth");
});

test("the sign-in view lives on the machine's screen, not in a dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const terminal = page.locator("[data-terminal]");
  await expect(terminal).toBeHidden();
  await page.locator("[data-terminal-open]").click();
  await expect(terminal).toBeVisible();
  expect(
    await terminal.evaluate((node) => ({
      dialog: node.closest("dialog") !== null,
      onScreen: node.closest(".screen") !== null,
    })),
  ).toEqual({ dialog: false, onScreen: true });
  await expect(page.locator("[data-view-panel]:visible")).toHaveCount(1);
  await expect(page.locator("[data-terminal-provider='google']")).toBeFocused();
});

test("closing the sign-in view returns focus to the control that opened it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("[data-terminal-open]").click();
  await page.locator("[data-terminal-close]").click();
  await expect(page.locator("[data-terminal]")).toBeHidden();
  await expect(page.locator("[data-terminal-open]")).toBeFocused();
});

test("escape leaves the sign-in view and gives the screen back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("[data-terminal-open]").click();
  await expect(page.locator("[data-terminal]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-terminal]")).toBeHidden();
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

  await page.locator("[data-cartridge='7']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");

  await page.locator("[data-terminal-open]").click();
  await expect(page.locator("[data-terminal]")).toBeVisible();
});

test("pressing a bay twice still leaves the product in the tray", async ({
  page,
}) => {
  await openBooted(page);
  await page.locator("[data-cartridge='7']").dblclick();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");
  await page.waitForTimeout(1800);
  await expect(
    page.locator("[data-tray]"),
    "a second release timer would have copied an empty selection over the tray",
  ).toHaveAttribute("data-tray", "7");
  await expect(page.locator("[data-screen]")).toContainText("DELIVERED");
});

test("the keypad says which mode it is in, not only what colour", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBooted(page);
  const marker = (mode: string) =>
    page
      .locator(`[data-keypad-mode='${mode}']`)
      .evaluate((node) => getComputedStyle(node, "::before").content);

  await expect(page.locator(".keypad-mode")).toHaveText(/SELECT\s*CODE/i, {
    useInnerText: true,
  });
  expect(await marker("selector")).toBe('"▸"');
  expect(await marker("otp")).toBe("none");

  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-machine]")!.dataset.input =
      "otp";
  });
  expect(await marker("otp")).toBe('"▸"');
  expect(await marker("selector")).toBe("none");
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
    ["2", "7"].map((bay) => {
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
    const lamp = node.querySelector<HTMLElement>(".pw-chip__lamp")!;
    const read = (): string => getComputedStyle(lamp).backgroundColor;
    const guest = read();
    node.dataset.cabinetState = "owner";
    node.querySelector("[data-cabinet-word]")!.textContent = "OWNER MODE";
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
      const tray = document.querySelector<HTMLElement>("[data-tray]")!;
      tray.dataset.tray = "7";
      tray.dataset.trayShape = "wide";
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
  for (const bay of [
    ["2", "tall"],
    ["7", "wide"],
  ]) {
    const shape = await page.evaluate(async ([code, form]) => {
      const tray = document.querySelector<HTMLElement>("[data-tray]")!;
      tray.dataset.tray = code;
      tray.dataset.trayShape = form;
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
    for (const [bay, form] of [
      ["2", "tall"],
      ["7", "wide"],
    ]) {
      falling.dataset.falling = bay;
      falling.dataset.fallingShape = form;
      const style = getComputedStyle(falling);
      rows.push({
        name: style.animationName,
        duration: style.animationDuration,
        count: style.animationIterationCount,
      });
    }
    falling.dataset.falling = "none";
    falling.dataset.fallingShape = "none";
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
    tray.dataset.tray = "2";
    tray.dataset.trayShape = "tall";
    falling.dataset.falling = "2";
    falling.dataset.fallingShape = "tall";
    transfer.dataset.transfer = "2";
    transfer.dataset.transferShape = "tall";
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
  expect(reading.name).toBe("pawl-card-insert");
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
    const transfer = document.querySelector<HTMLElement>("[data-transfer]")!;
    transfer.dataset.transfer = "7";
    transfer.dataset.transferShape = "wide";
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
    overlay.dataset.transfer = "2";
    overlay.dataset.transferShape = "tall";
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
      const slot = document.querySelector<HTMLElement>("[data-tray]")!;
      slot.dataset.tray = "7";
      slot.dataset.trayShape = "wide";
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
      ...document.querySelectorAll<HTMLAnchorElement>(".plate a"),
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
    `http://${links.host}:8790`,
    `http://${links.host}:8791`,
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

test("the whole site lives inside the machine: no page header, no page footer", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("header, footer")).toHaveCount(0);
  const inside = await page.evaluate(() => {
    const machine = document.querySelector("[data-machine]")!;
    return [
      "[data-ticker-text]",
      "[data-cabinet-state]",
      "[data-screen]",
      ".plate a[href='/privacy.html']",
      ".plate a[href='/terms.html']",
      "[data-sound]",
    ].map((selector) => machine.contains(document.querySelector(selector)));
  });
  expect(inside).toEqual([true, true, true, true, true, true]);
});

test("each bay's rail tells a guest what it holds, never a count", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-bay='2'] [data-led]")).toHaveText("PASS");
  await expect(page.locator("[data-bay='7'] [data-led]")).toHaveText("OPEN ↗");
  await expect(page.locator("[data-bay='2'] .rail__code")).toHaveText("02");
});

test("the sound switch starts off and remembers being turned on", async ({
  page,
}) => {
  await page.goto("/");
  const sound = page.locator("[data-sound]");
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("[data-sound]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the receipts print from the machine's printer, whole and without a header", async ({
  page,
}) => {
  for (const [path, title] of [
    ["/privacy.html", "Privacy policy"],
    ["/terms.html", "Terms of service"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.locator("[data-receipt]")).toBeVisible();
    await expect(page.locator("header, footer")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Tear off and return to the machine" }),
    ).toHaveAttribute("href", "/");
  }
  await page.goto("/privacy.html");
  await expect(page.locator("[data-receipt]")).toContainText(
    "openid email profile",
  );
});

const OWNER_SESSION = {
  authenticated: true,
  identity: {
    id: "probe",
    email: "probe.with.a.long.address@example.com",
    username: "maximilian_ananda_01",
    role: "ADMIN",
  },
};

async function hardwareOn(page: Page, screen: string): Promise<string> {
  if (screen === "signed-in") {
    await page.route("**/api/session", (route) =>
      route.fulfill({ json: OWNER_SESSION }),
    );
    await page.route("**/api/estate", (route) =>
      route.fulfill({ json: { role: "ADMIN", tools: {}, attention: [] } }),
    );
  }
  await page.route("**/api/auth/otp/start", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto(GATEWAY);
  if (screen === "signed-in") {
    await expect(page.locator("[data-view-panel='signed-in']")).toBeVisible();
  }
  if (screen === "signin" || screen === "email" || screen === "code") {
    await page.locator("[data-terminal-open]").click();
    await expect(page.locator("[data-terminal]")).toBeVisible();
  }
  if (screen === "email" || screen === "code") {
    await page.locator("[data-terminal-email-choice]").click();
  }
  if (screen === "code") {
    await page
      .locator("[data-terminal-email]")
      .fill("someone.with.a.long.name@example-domain.test");
    await page.locator("[data-terminal-send]").click();
    await expect(page.locator("[data-view-panel='code']")).toBeVisible();
  }
  return page.evaluate(() =>
    [
      "[data-machine]",
      ".cabinet",
      "[aria-label='Service panel']",
      "[data-screen-zone]",
      ".keypad",
      "[data-tray]",
    ]
      .map((selector) => {
        const box = document.querySelector(selector)!.getBoundingClientRect();
        return `${selector} ${box.width}x${box.height}@${box.top + scrollY}`;
      })
      .join(" | "),
  );
}

const SCREENS = ["idle", "signin", "email", "code", "signed-in"];

test("the machine keeps its size whatever the screen shows", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  for (const width of [1440, 1000, 390]) {
    const seen = new Map<string, string>();
    for (const screen of SCREENS) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
      });
      seen.set(screen, await hardwareOn(page, screen));
      await page.close();
    }
    const boxes = new Set(seen.values());
    expect(boxes.size, `${width}px: ${[...seen].join("\n")}`).toBe(1);
  }
});

async function fitOf(page: Page): Promise<{
  spare: number;
  status: number;
  hint: number;
  wide: number;
}> {
  return page.evaluate(() => {
    const view = document.querySelector<HTMLElement>(
      "[data-view-panel]:not([hidden])",
    )!;
    const pushed = [
      ...view.querySelectorAll<HTMLElement>(".view__actions, .view__back"),
    ];
    for (const node of pushed) node.style.marginTop = "0";
    const shown = [...view.children].filter(
      (node) => node.getClientRects().length > 0,
    );
    const last = shown[shown.length - 1]!.getBoundingClientRect();
    const needed =
      last.bottom -
      view.getBoundingClientRect().top +
      parseFloat(getComputedStyle(view).paddingBottom);
    for (const node of pushed) node.style.marginTop = "";
    const status = document.querySelector<HTMLElement>(".screen__status")!;
    const hint = document.querySelector<HTMLElement>(".screen__hint")!;
    return {
      spare: Math.floor(view.clientHeight - needed),
      status: status.scrollHeight - status.clientHeight,
      hint: hint.scrollWidth - hint.clientWidth,
      wide: view.scrollWidth - view.clientWidth,
    };
  });
}

const LONGEST_SAY =
  "The machine could not tell whether your code went through. Press GO to try it again.";

const WIDE_TYPE = `:root {
  --pw-ui: Verdana, "DejaVu Sans", sans-serif;
  --pw-display: Verdana, "DejaVu Sans", sans-serif;
  --pw-mono: "Courier New", "DejaVu Sans Mono", monospace;
}`;

test("every view fits the fixed screen it is shown on, message and wide type included", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  for (const width of [1440, 1000, 390, 320]) {
    for (const screen of SCREENS) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
      });
      await hardwareOn(page, screen);
      const states: [string, () => Promise<void>][] = [
        ["bare", async () => {}],
        [
          "with its longest message",
          () =>
            page.evaluate((words) => {
              const view = document.querySelector(
                "[data-view-panel]:not([hidden])",
              )!;
              view.querySelector("[data-say]")!.textContent = words;
              const tries = view.querySelector("[data-code-tries]");
              if (tries !== null) {
                tries.textContent = "That code was not right. 4 tries left.";
              }
            }, LONGEST_SAY),
        ],
        [
          "in wide type",
          async () => {
            await page.addStyleTag({ content: WIDE_TYPE });
          },
        ],
      ];
      for (const [state, apply] of states) {
        await apply();
        const fit = await fitOf(page);
        const where = `${screen} ${state} at ${width}px`;
        expect(fit.spare, where).toBeGreaterThanOrEqual(0);
        expect(fit.status, `${where}: status`).toBeLessThanOrEqual(0);
        expect(fit.hint, `${where}: hint`).toBeLessThanOrEqual(0);
        expect(fit.wide, `${where}: sideways`).toBeLessThanOrEqual(0);
      }
      await page.close();
    }
  }
});

test("the keyboard's digits and Backspace work the screen even while a choice has focus", async ({
  page,
}) => {
  await page.goto(GATEWAY);
  await page.locator("[data-terminal-open]").click();
  await expect(page.locator("[data-terminal-provider='google']")).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(page.locator("[data-terminal]")).toBeHidden();

  await page.locator("[data-terminal-open]").click();
  await expect(page.locator("[data-terminal-provider='google']")).toBeFocused();
  await page.keyboard.press("3");
  await expect(page.locator("[data-view-panel='email']")).toBeVisible();
});

test("a guest is told to insert a pass and cannot take NOTE", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-screen]")).toHaveText("INSERT PASS");
  await page.locator("[data-cartridge='2']").click();
  await expect(page.locator("[data-screen]")).toContainText("PASS REQUIRED");
  await expect(page.locator("[data-tray]")).toHaveAttribute(
    "data-tray",
    "none",
  );
});

test("a guest can take MANUAL without a pass", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-cartridge='7']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");
  await expect(page.locator("[data-screen]")).toContainText("DELIVERED");
});

test("number entry and GO reach the same place as tapping", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Digit7");
  await expect(page.locator("[data-screen]")).toContainText("7 SELECTED");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");
});

test("the keypad keys dispense the same way the physical keys do", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-key='7']").click();
  await page.locator("[data-key='GO']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");
});

test("taking the delivery opens a real modal bridge that escape can leave", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-cartridge='7']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");

  await page.locator("[data-tray-action]").click();
  const bridge = page.locator("[data-transfer]");
  await expect(bridge).toHaveAttribute("data-transfer", "7");
  const sealed = await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>("[data-transfer]")!;
    const cartridge = document.querySelector<HTMLElement>(
      "[data-cartridge='7']",
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
  await page.locator("[data-cartridge='7']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");
  await page.locator("[data-tray-action]").click();
  await expect(page.locator("[data-transfer]")).toHaveAttribute(
    "data-transfer",
    "7",
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
  await page.locator("[data-cartridge='2']").click();
  await expect(page.locator("[data-screen]")).toContainText("PASS REQUIRED");

  await page.locator("[data-terminal-open]").click();
  await page.locator("[data-terminal-provider='google']").click();

  const said = page.locator("[data-terminal-error]");
  await expect(said).toBeVisible();
  await expect(said).toContainText(/pick the bay again/i);
  expect(
    await said.evaluate(
      (node) => node.closest("[data-view-panel='signin']") !== null,
    ),
    "the warning is said on the machine's own screen",
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
      sessionStorage.setItem("pawl:machine-request", "2"),
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
      "2",
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
      guest.locator("[data-cartridge='2']"),
      "the guest half must read a painted label, not the static markup",
    ).toHaveAttribute(
      "aria-label",
      "Select Notes, bay 2, visitor pass required",
    );
    await expect(guest.locator("[data-cabinet-state]")).toHaveText(
      "GUEST MODE",
    );
    const guestLamp = await lampColour(guest);
    const guestBays = await guest.evaluate(() =>
      ["2", "7"].map(
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
        name: "Select Notes, bay 2, ready",
        exact: true,
      }),
      "an owner must not be told they need an owner pass",
    ).toHaveCount(1);
    const ownerLamp = await lampColour(signedIn);
    const ownerBays = await signedIn.evaluate(() =>
      ["2", "7"].map(
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
    await signedIn.locator("[data-cartridge='2']").click();
    await expect(signedIn.locator("[data-tray]")).toHaveAttribute(
      "data-tray",
      "2",
    );
    await expect(signedIn.locator("[data-screen]")).toContainText("NOTE");
  });

  test("the pass terminal cannot walk a signed-in owner back into the sign-in chooser", async () => {
    await signedIn.goto(GATEWAY);
    await expect(signedIn.locator("[data-cabinet-state]")).toHaveText(
      "OWNER MODE",
    );
    await expect(signedIn.locator("[data-terminal-open]")).toBeHidden();
    await expect(signedIn.locator("[data-logout]")).toBeVisible();
    await expect(signedIn.locator("[data-reader]")).toBeHidden();
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
    await expect(signedIn.locator("[data-cartridge='2']")).toHaveAttribute(
      "aria-label",
      "Select Notes, bay 2, ready",
    );

    await signedIn.locator("[data-cartridge='2']").click();
    await expect(
      signedIn.locator("[data-tray]"),
      "the reducer must hold the pass too, not just the model the lamps read",
    ).toHaveAttribute("data-tray", "2", { timeout: 20_000 });

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

  await expect(
    page.locator("[data-ticker-text]"),
    "an unreadable session must not run the ticker of a calm guest",
  ).toContainText("UNREADABLE");
});

async function reachOtpMode(page: Page): Promise<void> {
  await page.locator("[data-reader]").click();
  await expect(page.locator("[data-terminal]")).toBeVisible();
  await page.locator("[data-terminal-email-choice]").click();
  await page
    .locator("[data-terminal-email]")
    .fill(`otpprobe-${Date.now().toString().slice(-6)}@example.com`);
  await page.locator("[data-terminal-send]").click();
  await expect(page.locator("[data-view-panel='email']")).toBeHidden();
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
    let accepted = false;
    await page.route("**/api/auth/otp/verify", (route) => {
      accepted = true;
      return route.fulfill({
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
      });
    });
    await page.route("**/api/session", (route) =>
      accepted
        ? route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              authenticated: true,
              identity: {
                id: "probe",
                email: "probe@example.com",
                username: "probe",
                role: "USER",
              },
            }),
          })
        : route.continue(),
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

    const error = page.locator("[data-code-error]");
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
    let accepted = false;
    await page.route("**/api/auth/otp/verify", (route) => {
      accepted = true;
      return route.fulfill({
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
      });
    });
    await page.route("**/api/session", (route) =>
      accepted
        ? route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              authenticated: true,
              identity: {
                id: "probe",
                email: "namedprobe@example.com",
                username: "namedprobe",
                role: "USER",
              },
            }),
          })
        : route.continue(),
    );
    await page.goto(GATEWAY);
    await reachOtpMode(page);
    await typeCode(page, "123456");

    await expect(page.locator("[data-cabinet-state]")).toHaveText(
      "VISITOR MODE",
    );
    await expect(page.locator("[data-account-name]")).toHaveText("namedprobe");
    await expect(
      page.locator("[data-view-panel=\x27signed-in\x27]"),
      "Enter after a keypad sign-in presses GO, it does not follow a link out of the machine",
    ).toBeFocused();
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
    await page.locator("[data-cartridge='2']").click();
    await expect(page.locator("[data-screen]")).toContainText("PASS REQUIRED");
    await reachOtpMode(page);
    await typeCode(page, "123456");

    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem("pawl:machine-request")),
      )
      .toBe("2");
    await fresh.close();
  });

  test("Use another email steps back to the email, and the next code starts empty", async ({
    page,
  }) => {
    await page.goto(GATEWAY);
    await reachOtpMode(page);
    const email = await page.locator("[data-terminal-email]").inputValue();

    await typeCode(page, "123");
    await page.getByRole("button", { name: "Use another email" }).click();
    await expect(page.locator("[data-view-panel='email']")).toBeVisible();
    await expect(page.locator("[data-terminal-email]")).toHaveValue(email);
    await expect(page.locator("[data-terminal-email]")).toBeFocused();

    await page.locator("[data-terminal-send]").click();
    await expect(page.locator("[data-machine]")).toHaveAttribute(
      "data-input",
      "otp",
    );
    await page.locator("[data-key='4']").click();
    await expect(page.locator("[data-screen]")).toHaveText("EMAIL CODE 1/6");
  });

  test("a key is lit only when it does something on the screen it serves", async ({
    page,
  }) => {
    await page.goto(GATEWAY);
    const key = (label: string) => page.locator(`[data-key='${label}']`);
    await expect(key("7")).toHaveAttribute("aria-disabled", "false");
    for (const dark of ["5", "0", "CLR", "GO"]) {
      await expect(key(dark)).toHaveAttribute("aria-disabled", "true");
    }

    await page.keyboard.press("5");
    await expect(page.locator("[data-screen]")).toHaveText("INSERT PASS");

    await page.locator("[data-reader]").click();
    await expect(page.locator("[data-terminal]")).toBeVisible();
    await expect(key("7")).toHaveAttribute("aria-disabled", "true");
    await expect(key("3")).toHaveAttribute("aria-disabled", "false");
    await expect(key("GO")).toHaveAttribute("aria-disabled", "true");

    await key("3").click();
    await expect(page.locator("[data-view-panel='email']")).toBeVisible();
    await expect(page.locator("[data-terminal-email]")).toBeFocused();
    await expect(key("3")).toHaveAttribute("aria-disabled", "true");
    await expect(key("GO")).toHaveAttribute("aria-disabled", "false");

    await page
      .locator("[data-terminal-email]")
      .fill(`goprobe-${Date.now().toString().slice(-6)}@example.com`);
    await key("GO").click();
    await expect(page.locator("[data-machine]")).toHaveAttribute(
      "data-input",
      "otp",
    );
    await expect(key("0")).toHaveAttribute("aria-disabled", "false");
  });

  test("GO pressed twice sends one email, and leaving mid-send says nothing false", async ({
    page,
  }) => {
    let starts = 0;
    await page.route("**/api/auth/otp/start", async (route) => {
      starts += 1;
      await new Promise((settled) => setTimeout(settled, 1200));
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(GATEWAY);
    await page.locator("[data-reader]").click();
    await expect(page.locator("[data-terminal]")).toBeVisible();
    await page.locator("[data-terminal-email-choice]").click();
    await page.locator("[data-terminal-email]").fill("twice@example.com");
    await page.locator("[data-terminal-send]").click();
    await page.locator("[data-terminal-send]").click();
    await page.locator("[data-key='CLR']").click();
    await expect(page.locator("[data-terminal]")).toBeVisible();
    await page.waitForTimeout(1600);
    expect(starts).toBe(1);
    await expect(page.locator("[data-terminal]")).toBeVisible();
    await expect(page.locator("[data-terminal-error]")).toHaveText("");
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
  await expect(page.locator("[data-screen]")).toHaveText("INSERT PASS");

  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-cartridge='7']")!.dataset.href =
      "http://";
  });
  await page.locator("[data-cartridge='7']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");
  await page.locator("[data-tray-action]").click();

  await expect(page.locator("[data-screen]")).toHaveText(
    "BRIDGE FAILED, RELEASE IT AGAIN",
    { timeout: 15_000 },
  );
  await expect(page.locator("[data-transfer]")).toHaveAttribute(
    "data-transfer",
    "none",
  );

  await page.locator("[data-key='CLR']").click();
  await expect(
    page.locator("[data-screen]"),
    "a fault must not overwrite the estate line for the life of the page",
  ).toHaveText("INSERT PASS");
});

test("cancel still leaves the bridge after the transfer has resolved", async ({
  page,
}) => {
  await page.goto(GATEWAY);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-cartridge='7']")!.dataset.href =
      "#stay";
  });

  await page.locator("[data-cartridge='7']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");
  await page.locator("[data-tray-action]").click();
  const bridge = page.locator("[data-transfer]");
  await expect(bridge).toHaveAttribute("data-transfer", "7");

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
    await expect(visitor.locator("[data-cartridge='2']")).toHaveAttribute(
      "aria-label",
      "Select Notes, bay 2, ready",
    );
    const bays = await visitor.evaluate(() =>
      ["2", "7"].map(
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
    await visitor.locator("[data-cartridge='2']").click();
    await expect(visitor.locator("[data-tray]")).toHaveAttribute(
      "data-tray",
      "2",
    );
    await expect(visitor.locator("[data-screen]")).toContainText("NOTE");
  });
});
