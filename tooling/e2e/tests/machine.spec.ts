import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";
import { signedInAs, view } from "./pass-account";

const GATEWAY = localWorkerOrigin("gateway", "localhost");
const PASS = localWorkerOrigin("pass", "localhost");

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
          "[data-cabinet-state] .marquee__lamp",
        )!,
      ).backgroundColor,
  );
}

async function tilesLit(target: Page): Promise<(string | undefined)[]> {
  return target.evaluate(() =>
    ["2", "7"].map(
      (bay) =>
        document.querySelector<HTMLElement>(`[data-tile="${bay}"]`)!.dataset
          .lit,
    ),
  );
}

test("the cabinet's screen draws exactly nine bays, two of them stocked", async ({
  page,
}) => {
  const session = page.waitForResponse((response) =>
    response.url().includes("/api/session"),
  );
  await page.goto("/");
  await session;
  await expect(page.locator("main")).not.toHaveClass(/pw-main/);
  await expect(page.locator("[data-tile]")).toHaveCount(9);
  await expect(page.locator("[data-cartridge]")).toHaveCount(2);
  expect(
    await page
      .locator("[data-tile]")
      .first()
      .evaluate((node) => node.closest("[data-part='display']") !== null),
  ).toBe(true);
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
  const empties = page.locator("[data-tile]:not(:has([data-cartridge]))");
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

test("the nine tiles share one size on a phone and on a laptop", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const sizes = await page
      .locator("[data-tile]")
      .evaluateAll((nodes) =>
        nodes.map(
          (node) =>
            `${(node as HTMLElement).offsetWidth}x${(node as HTMLElement).offsetHeight}`,
        ),
      );
    expect(new Set(sizes).size, sizes.join(" ")).toBe(1);
  }
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
    [".marquee", ".bezel", ".strip", "[data-part='tray']", ".plate"].map(
      (selector) =>
        Math.round(
          document.querySelector(selector)!.getBoundingClientRect().top,
        ),
    ),
  );
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  const deck = await page.evaluate(() => {
    const lcd = document.querySelector(".lcd")!.getBoundingClientRect();
    const keypad = document.querySelector(".keypad")!.getBoundingClientRect();
    return { lcdRight: lcd.right, keypadLeft: keypad.left };
  });
  expect(deck.lcdRight).toBeLessThanOrEqual(deck.keypadLeft);
});
test("the machine fits the screen without scrolling on the laptops and phones it is made for", async ({
  browser,
}) => {
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [1920, 1080],
    [390, 844],
    [412, 915],
    [360, 740],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    for (const step of ["products"]) {
      const spill = await page.evaluate(() => ({
        down: document.documentElement.scrollHeight - innerHeight,
        across: document.documentElement.scrollWidth - innerWidth,
      }));
      expect(spill, `${step} at ${width}x${height}`).toEqual({
        down: 0,
        across: 0,
      });
    }
    await page.close();
  }
});
test("under reduced motion the camera never moves and a receipt opens at once", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const camera = page.locator("[data-camera]");
  expect(
    await camera.evaluate((node) => ({
      transition: getComputedStyle(node).transitionProperty,
      running: node.getAnimations().length,
    })),
  ).toEqual({ transition: "none", running: 0 });
  const started = Date.now();
  await page.locator(".plate a[href$='/privacy.html']").click();
  await expect(page).toHaveURL(/\/privacy(\.html)?$/);
  expect(Date.now() - started).toBeLessThan(2000);
  expect(
    await page
      .locator("[data-receipt]")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
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

test("every key looks alike and presses, even one with nothing to do", async ({
  page,
}) => {
  await openBooted(page);
  const keys = page.locator("[data-part='keypad'] [data-key]");
  expect(
    await keys.evaluateAll((all) => [
      ...new Set(all.map((key) => getComputedStyle(key).opacity)),
    ]),
  ).toEqual(["1"]);
  const idle = await page
    .locator("[data-part='keypad'] [data-key][aria-disabled='true']")
    .first()
    .getAttribute("data-key");
  const screen = await page.locator("[data-screen]").textContent();
  expect(
    await page.evaluate((key) => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key }));
      return document
        .querySelector(`[data-key='${key}']`)!
        .classList.contains("is-pressed");
    }, idle!),
  ).toBe(true);
  await page
    .locator(`[data-part='keypad'] [data-key='${idle}']`)
    .click({ force: true });
  await expect(page.locator("[data-screen]")).toHaveText(screen!);
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

  await expect(page.locator(".keypad__mode")).toHaveText(/SELECT\s*CODE/i, {
    useInnerText: true,
  });
  expect(await marker("selector")).toBe('"▸"');
  expect(await marker("otp")).toBe("none");
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
  await expect(page.locator("[data-tile='2']")).toHaveAttribute(
    "data-locked",
    "guest",
  );
  const bays = await page.evaluate(() =>
    ["2", "7"].map((bay) => {
      const tile = document.querySelector<HTMLElement>(`[data-tile="${bay}"]`)!;
      const art = getComputedStyle(tile.querySelector(".tile__art i")!);
      return {
        lit: tile.dataset.lit ?? null,
        paint: [art.backgroundImage, art.boxShadow].join(" | "),
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
    const lamp = node.querySelector<HTMLElement>(".marquee__lamp")!;
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
  await expect(page.locator(".tray__label")).toBeVisible();
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
      const result = document.querySelector<HTMLElement>(".tray__result")!;
      await Promise.all(
        result.getAnimations().map((animation) => animation.finished),
      );
    });
    const action = page.locator("[data-tray-action]");
    await expect(action).toBeVisible();
    await expect(action).toHaveAccessibleName("TAKE DELIVERY");
    await expect(page.locator(".tray__label")).toBeHidden();
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
      const result = document.querySelector<HTMLElement>(".tray__result")!;
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
    machine.dataset.status = "denied";
    document.querySelector<HTMLElement>("[data-tile='2']")!.dataset.state =
      "denied";
    sweep();
    document.querySelector<HTMLElement>("[data-tile='2']")!.dataset.state =
      "releasing";
    machine.dataset.leaving = "printer";
    sweep();
    return offenders;
  });
  expect(forever).toEqual([]);
});

test("there is no pass card, card reader or card words on any page of the machine", async ({
  page,
}) => {
  for (const url of ["/", "/privacy.html", "/terms.html", "/no/such/bay"]) {
    await page.goto(url);
    await expect(
      page.locator(".pawl-card, [data-reader], [data-card-holder]"),
      url,
    ).toHaveCount(0);
    expect(await page.evaluate(() => document.body.innerText), url).not.toMatch(
      /INSERT PASS|EJECT PASS|PASS DOCK/i,
    );
  }
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

test("a full tray stays inside the delivery bay it is bolted to", async ({
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
      await Promise.all(
        slot.getAnimations().map((animation) => animation.finished),
      );
      const bay = document
        .querySelector<HTMLElement>("[data-part='tray']")!
        .getBoundingClientRect();
      const machine = document
        .querySelector<HTMLElement>("[data-machine]")!
        .getBoundingClientRect();
      const action = document
        .querySelector<HTMLElement>("[data-tray-action]")!
        .getBoundingClientRect();
      return {
        bayInMachine:
          bay.left >= machine.left - 0.5 && bay.right <= machine.right + 0.5,
        actionInBay:
          action.left >= bay.left - 0.5 &&
          action.right <= bay.right + 0.5 &&
          action.top >= bay.top - 0.5 &&
          action.bottom <= bay.bottom + 0.5,
      };
    });
    expect(fit, `${viewport.width}x${viewport.height}`).toEqual({
      bayInMachine: true,
      actionInBay: true,
    });
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

test("a refusal never widens the page", async ({ page }) => {
  for (const width of [761, 800, 900, 1000, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await openBooted(page);
    const measured = await page.evaluate(() => {
      document.querySelector<HTMLElement>("[data-machine]")!.dataset.status =
        "denied";
      document.querySelector<HTMLElement>("[data-tile='2']")!.dataset.state =
        "denied";
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
      ".plate a[href$='/privacy.html']",
      ".plate a[href$='/terms.html']",
      "[data-sound]",
    ].map((selector) => machine.contains(document.querySelector(selector)));
  });
  expect(inside).toEqual([true, true, true, true, true, true]);
});

test("each tile tells a guest what it holds, never a count", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-tile='2'] [data-badge]")).toHaveText(
    "SIGN IN",
  );
  await expect(page.locator("[data-tile='7'] [data-badge]")).toHaveText(
    "OPEN ↗",
  );
  await expect(page.locator("[data-tile='2'] .tile__code")).toHaveText("02");
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

const PROBE_BAY = {
  code: "5",
  key: "probe",
  estate: false,
  product: "PROBEAPP",
  chars: 8,
  title: "A probe app with a long name ok!",
  access: "visitor",
  shape: "wide",
  href: "https://probe.a-much-longer-company-domain.example",
  card: true,
};

const LONGEST_CARD = {
  title: "Wide words make the longest card title on it".slice(0, 40),
  message: "Wide words wrap over several lines of the display. "
    .repeat(4)
    .slice(0, 90),
  fields: [
    { label: "The longest label ok", value: "W".repeat(70), copy: true },
    { label: "Another label at 20!", value: "M".repeat(70), copy: true },
  ],
  action: {
    label: "Sixteen letters!",
    href: "https://probe.a-much-longer-company-domain.example/",
  },
};

async function cardOn(page: Page, screen: string): Promise<void> {
  await page.route("**/api/catalog", async (route) => {
    const real = (await (await route.fetch()).json()) as {
      bays: unknown[];
    };
    await route.fulfill({ json: { ...real, bays: [...real.bays, PROBE_BAY] } });
  });
  await page.route("**/api/apps/probe/card", (route) =>
    screen === "card"
      ? route.fulfill({ json: { card: LONGEST_CARD } })
      : route.fulfill({
          status: 409,
          json: {
            code: "CONSENT_REQUIRED",
            connect: `${PASS}/oauth/connect?client_id=probe`,
          },
        }),
  );
}

async function hardwareOn(page: Page, screen: string): Promise<string> {
  const card = screen === "card" || screen === "card-connect";
  if (card) await cardOn(page, screen);
  if (screen === "owner" || screen === "account" || card) {
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
  if (screen === "owner" || screen === "account" || card) {
    await expect(page.locator("[data-account-open]")).toBeVisible();
  }
  if (screen === "account") {
    await page.locator("[data-account-open]").click();
    await expect(page.locator("[data-view-panel='account']")).toBeVisible();
  }
  if (card) {
    await page.locator("[data-cartridge='5']").click();
    await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "5");
    await page.locator("[data-tray-action]").click();
    await expect(
      page.locator("[data-view-panel='card'] [data-card-go]"),
    ).toBeVisible();
  }
  return page.evaluate(() =>
    [
      "[data-machine]",
      ".bezel",
      ".display",
      ".strip",
      ".lcd",
      ".keypad",
      "[data-part='tray']",
    ]
      .map((selector) => {
        const node = document.querySelector<HTMLElement>(selector)!;
        return `${selector} ${node.offsetWidth}x${node.offsetHeight}@${node.offsetTop}`;
      })
      .join(" | "),
  );
}

const SCREENS = ["products", "owner", "account", "card", "card-connect"];

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
    const body = view.querySelector<HTMLElement>(".view__body")!;
    const status = document.querySelector<HTMLElement>(".lcd__line")!;
    const foot = view.querySelector<HTMLElement>(".view__foot")!;
    const hint = foot.querySelector<HTMLElement>(".view__hint")!;
    return {
      spare: body.clientHeight - body.scrollHeight,
      status: status.scrollHeight - status.clientHeight,
      hint: Math.max(
        hint.scrollWidth - hint.clientWidth,
        foot.scrollHeight - foot.clientHeight,
      ),
      wide: body.scrollWidth - body.clientWidth,
    };
  });
}

const LONGEST_SAY =
  "The machine could not tell whether your code went through. Press GO to try it again.";

const LONG_ADDRESS = "Sign in on paw.a-much-longer-company-domain.example";

const WIDE_TYPE = `:root {
  --pw-ui: Verdana, "DejaVu Sans", sans-serif;
  --pw-display: Verdana, "DejaVu Sans", sans-serif;
  --pw-mono: "Courier New", "DejaVu Sans Mono", monospace;
}`;

async function fitsEverywhere(
  browser: Browser,
  views: readonly string[],
  open: (page: Page, name: string) => Promise<unknown>,
): Promise<void> {
  for (const width of [1440, 1000, 390, 320]) {
    for (const screen of views) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
      });
      await open(page, screen);
      const states: [string, () => Promise<void>][] = [
        ["bare", async () => {}],
        [
          "in wide type",
          async () => {
            await page.addStyleTag({ content: WIDE_TYPE });
          },
        ],
        [
          "with a long address, in wide type",
          () =>
            page.evaluate((words) => {
              const link = document.querySelector(
                "[data-view-panel]:not([hidden]) .view__aside a",
              );
              if (link !== null) link.textContent = words;
            }, LONG_ADDRESS),
        ],
        [
          "with its longest message, in wide type",
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
      ];
      for (const [state, apply] of states) {
        await apply();
        const fit = await fitOf(page);
        const where = `${screen} ${state} at ${width}px`;
        expect.soft(fit.spare, where).toBeGreaterThanOrEqual(0);
        expect.soft(fit.status, `${where}: status`).toBeLessThanOrEqual(0);
        expect.soft(fit.hint, `${where}: hint`).toBeLessThanOrEqual(0);
        expect.soft(fit.wide, `${where}: sideways`).toBeLessThanOrEqual(0);
      }
      await page.close();
    }
  }
}

test("every view fits the fixed screen it is shown on, message and wide type included", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  await fitsEverywhere(browser, SCREENS, hardwareOn);
});

const LONG_HOLDER = {
  id: "probe",
  email: "probe.with.a.long.address@example.com",
  username: "maximilian_ananda_01",
  role: "ADMIN",
};

const LONG_DEVICES = Array.from({ length: 3 }, (_, index) => ({
  id: `d${index}`,
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Safari/605.1.15",
  ip: "2001:db8:85a3:0000:0000:8a2e:0370:7334",
  createdAt: "2026-10-01T10:00:00.000Z",
  current: index === 0,
}));

const LONG_APPS = Array.from({ length: 3 }, (_, index) => ({
  clientId: `app${index}`,
  name: `A third-party app with a long name ${index}`,
  homepage: null,
  sector: "apps.a-much-longer-company-domain.example",
  scopes: ["openid", "email", "profile"],
  createdAt: "2026-10-01T10:00:00.000Z",
}));

const PASS_VIEWS = [
  "methods",
  "email",
  "code",
  "password",
  "forgot",
  "register",
  "register-key",
  "welcome",
  "welcome-key",
  "account",
  "profile",
  "profile-name",
  "profile-key",
  "devices",
  "apps",
  "security",
  "delete",
  "registry",
  "registry-name",
  "registry-label",
  "registry-return",
  "registry-secret",
  "registry-remove",
] as const;

const LONG_ORIGIN = "https://apps.a-much-longer-company-domain.example";

const LONG_OUTSIDE = Array.from({ length: 3 }, (_, index) => ({
  key: `app${index}`,
  label: `app${index}`,
  title: `A registered app, long name ${index}`,
  origin: LONG_ORIGIN,
  access: "visitor",
  card: true,
  clientId: `app${index}`,
  redirectUri: `${LONG_ORIGIN}/auth/callback`,
  createdAt: "2026-10-01T10:00:00.000Z",
}));

const SIGNED_OUT = new Set([
  "methods",
  "email",
  "code",
  "password",
  "forgot",
  "register",
  "register-key",
]);

async function passOn(page: Page, name: string): Promise<void> {
  const welcoming = name === "welcome" || name === "welcome-key";
  const user = {
    ...LONG_HOLDER,
    username: welcoming ? null : LONG_HOLDER.username,
  };
  if (!SIGNED_OUT.has(name)) {
    await page.route(`${PASS}/api/session`, (route) =>
      route.fulfill({ json: { authenticated: true, user } }),
    );
    await page.route(`${PASS}/api/account`, (route) =>
      route.fulfill({ json: { user, providers: ["google"] } }),
    );
    await page.route(`${PASS}/api/sessions`, (route) =>
      route.fulfill({ json: { sessions: LONG_DEVICES } }),
    );
    await page.route(`${PASS}/api/account/grants`, (route) =>
      route.fulfill({ json: { grants: LONG_APPS } }),
    );
    await page.route(`${PASS}/api/admin/apps`, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 201,
            json: {
              app: LONG_OUTSIDE[0],
              secret: "Zx9".repeat(14).slice(0, 43),
            },
          })
        : route.fulfill({ json: { apps: LONG_OUTSIDE } }),
    );
  }
  await page.route(`${PASS}/api/auth/otp/start`, (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto(`${PASS}/`);
  const go = () => page.locator("button[form='screen-form']").click();
  const on = (panel: string) => expect(view(page, panel)).toBeVisible();
  if (SIGNED_OUT.has(name)) await on("methods");
  if (name === "email" || name === "code") {
    await view(page, "methods").locator("[data-method='email']").click();
  }
  if (name === "code") {
    await view(page, "email")
      .locator("#code-email")
      .fill("someone.with.a.long.name@example-domain.test");
    await view(page, "email")
      .getByRole("button", { name: "Send code" })
      .click();
  }
  if (name === "password" || name === "forgot") {
    await view(page, "methods").locator("[data-method='password']").click();
  }
  if (name === "forgot") {
    await view(page, "password")
      .getByRole("button", { name: "Forgot password?" })
      .click();
  }
  if (name === "register" || name === "register-key") {
    await view(page, "methods")
      .getByRole("button", { name: "Create one" })
      .click();
  }
  if (name === "register-key") {
    await view(page, "register")
      .locator('input[name="username"]')
      .fill("maximilian_ananda_01");
    await view(page, "register")
      .locator('input[name="email"]')
      .fill("someone.with.a.long.name@example-domain.test");
    await go();
  }
  if (name === "welcome-key") {
    await on("welcome");
    await view(page, "welcome")
      .locator('input[name="username"]')
      .fill("maximilian_ananda_01");
    await go();
  }
  const sections: Record<string, string> = {
    profile: "1",
    "profile-name": "1",
    "profile-key": "1",
    devices: "2",
    apps: "3",
    security: "4",
    delete: "4",
    registry: "5",
    "registry-name": "5",
    "registry-label": "5",
    "registry-return": "5",
    "registry-secret": "5",
    "registry-remove": "5",
  };
  const digit = sections[name];
  if (digit !== undefined) {
    await on("account");
    await page.keyboard.press(digit);
  }
  if (name.startsWith("registry-")) {
    await on("registry");
    await expect(
      view(page, "registry").locator("[data-registry-row]"),
    ).toHaveCount(3);
  }
  if (name === "registry-remove") {
    await view(page, "registry")
      .getByRole("button", { name: /^Remove / })
      .first()
      .click();
  } else if (name.startsWith("registry-")) {
    await view(page, "registry")
      .getByRole("button", { name: "New app" })
      .click();
  }
  if (["registry-label", "registry-return", "registry-secret"].includes(name)) {
    await view(page, "registry-name")
      .locator("#registry-app-title")
      .fill("A registered app, the long one");
    await view(page, "registry-name")
      .locator("#registry-app-address")
      .fill(LONG_ORIGIN);
    await go();
  }
  if (["registry-return", "registry-secret"].includes(name)) {
    await on("registry-label");
    await go();
  }
  if (name === "registry-secret") {
    await on("registry-return");
    await go();
  }
  if (name === "profile-name") {
    await view(page, "profile")
      .getByRole("button", { name: "Edit username" })
      .click();
  }
  if (name === "profile-key") {
    await view(page, "profile")
      .getByRole("button", { name: "Set a password" })
      .click();
  }
  if (name === "delete") {
    await view(page, "security")
      .getByRole("button", { name: "Delete this account" })
      .click();
  }
  await on(name);
}

test("every view of paw. fits the fixed screen it is shown on, message and wide type included", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  await fitsEverywhere(browser, PASS_VIEWS, passOn);
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

  const said = page.locator("[data-view-panel]:not([hidden]) [data-say]");
  await expect(said).toContainText(/pick the bay again/i);
  expect(
    await said.evaluate((node) => node.closest(".screen") !== null),
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
    const guestBays = await tilesLit(guest);
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
    const ownerBays = await tilesLit(signedIn);

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

  test("a signed-in owner is offered the account, never SIGN IN", async () => {
    await signedIn.goto(GATEWAY);
    await expect(signedIn.locator("[data-cabinet-state]")).toHaveText(
      "OWNER MODE",
    );
    await expect(signedIn.locator("[data-sign-in]")).toBeHidden();
    await expect(signedIn.locator("[data-account-open]")).toBeVisible();
    await expect(signedIn.locator("[data-reader]")).toHaveCount(0);
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

  test("ACCOUNT ▸ swaps the products for the account screen, and CLR brings them back", async () => {
    await signedIn.goto(GATEWAY);
    await expect(signedIn.locator("[data-greeting]")).toHaveText(
      /^HI, PROBEMACHINE\d* · OWNER$/,
    );
    const opener = signedIn.locator("[data-account-open]");
    await opener.click();
    const account = signedIn.locator("[data-view-panel='account']");
    await expect(account).toBeVisible();
    await expect(signedIn.locator("[data-view-panel]:visible")).toHaveCount(1);
    await expect(signedIn.locator("[data-screen]")).toHaveText("YOUR ACCOUNT");
    await expect(signedIn.locator("[data-account-pass]")).toHaveText(
      "OWNER PASS",
    );
    await expect(signedIn.locator("[data-account-email]")).toContainText("@");
    for (const dark of ["1", "2", "7", "GO"]) {
      await expect(signedIn.locator(`[data-key='${dark}']`)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
    await signedIn.locator("[data-key='CLR']").click();
    await expect(account).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("Manage account dollies to the screen and paw. takes the screen over", async () => {
    await signedIn.setViewportSize({ width: 1440, height: 900 });
    await signedIn.goto(GATEWAY);
    await signedIn.locator("[data-account-open]").click();
    const manage = signedIn.locator("[data-account-manage]");
    await manage.evaluate((link) => {
      const anchor = link as HTMLAnchorElement;
      anchor.href = anchor.href.replace("127.0.0.1", "localhost");
    });
    await manage.click();
    await expect(signedIn.locator("[data-camera]")).toHaveAttribute(
      "data-framing",
      "screen",
    );
    await expect(signedIn.locator("[data-screen]")).toHaveText(
      "OPENING ACCOUNT",
    );
    await expect(signedIn).toHaveURL(/:8787\/$/, { timeout: 5_000 });
    await expect(signedIn.locator("[data-camera]")).toHaveAttribute(
      "data-framing",
      "screen",
    );
    await expect(signedIn.locator("[data-screen-sub]")).toHaveText(
      /^PROBEMACHINE\d* · OWNER PASS$/,
    );
    await expect(
      signedIn.getByRole("heading", { name: /^probemachine\d*$/ }),
    ).toBeVisible();
  });

  test("signing out leaves a guest at the products, and the ticker says so", async () => {
    await signedIn.goto(GATEWAY);
    await signedIn.locator("[data-account-open]").click();
    await signedIn.locator("[data-logout]").click();
    await expect(signedIn.locator("[data-cabinet-state]")).toHaveText(
      "GUEST MODE",
      { timeout: 20_000 },
    );
    await expect(
      signedIn.locator("[data-view-panel='products']"),
    ).toBeVisible();
    await expect(signedIn.locator("[data-ticker-text]")).toContainText(
      "SIGNED OUT",
    );
    await expect(signedIn.locator("[data-screen]")).toHaveText("SIGNED OUT");
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

test("a fault holds the screen until the next touch, then the estate line comes back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(GATEWAY);
  await expect(page.locator("[data-screen]")).toHaveText("PICK A BAY");

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
  ).toHaveText("PICK A BAY");
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
    expect(await tilesLit(visitor)).toEqual(["true", "true"]);
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
