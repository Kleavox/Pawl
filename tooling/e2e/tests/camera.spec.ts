import { expect, test, type Page } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";

const GATEWAY = localWorkerOrigin("gateway", "localhost");
const PASS = localWorkerOrigin("pass", "localhost");

type Box = { left: number; top: number; width: number; height: number };

async function partSizes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-part]")].map((node) => [
        node.dataset.part!,
        `${node.offsetWidth}x${node.offsetHeight}`,
      ]),
    ),
  );
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
  });
  return page.locator(selector).evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    };
  });
}

async function frameStill(page: Page, framing: string): Promise<void> {
  await page.locator("[data-camera]").evaluate((node, to) => {
    const camera = node as HTMLElement;
    camera.style.transition = "none";
    camera.dataset.framing = to;
    void camera.offsetWidth;
  }, framing);
}

function expectSameBox(
  actual: Box,
  expected: Box,
  where: string,
  slack = 2,
): void {
  for (const key of ["left", "top", "width", "height"] as const) {
    expect(
      Math.abs(actual[key] - expected[key]),
      `${where}: ${key} ${JSON.stringify({ actual, expected })}`,
    ).toBeLessThanOrEqual(slack);
  }
}

test.use({ viewport: { width: 1440, height: 900 } });

test("every page draws the same machine: each part keeps its size on the cabinet, a receipt, paw. and a 404", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/`);
  const cabinet = await partSizes(page);
  expect(Object.keys(cabinet)).toHaveLength(17);
  for (const url of [
    `${GATEWAY}/privacy.html`,
    `${GATEWAY}/terms.html`,
    `${PASS}/`,
    `${GATEWAY}/no/such/bay`,
  ]) {
    await page.goto(url);
    expect(await partSizes(page), url).toEqual(cabinet);
  }
});

test("the cabinet's last frame on its way to a receipt is the receipt's first frame", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/`);
  await frameStill(page, "printer");
  const leaving = await boxOf(page, ".printer__slot");
  await page.goto(`${GATEWAY}/privacy.html#cam=printer`);
  expectSameBox(await boxOf(page, ".printer__slot"), leaving, "receipt");
  await expect(page).toHaveURL(/\/privacy(\.html)?$/);
});

test("the cabinet's last frame on its way to paw. is paw.'s first frame", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/`);
  await frameStill(page, "screen");
  const leaving = await boxOf(page, ".bezel");
  await page.goto(`${PASS}/#cam=screen`);
  expectSameBox(await boxOf(page, ".bezel"), leaving, "paw.");
});

test("a page arriving with a hint is already in that framing on its first frame, before its scripts load", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/privacy.html`);
  const slot = await boxOf(page, ".printer__slot");
  await page.goto(`${PASS}/#cam=screen`);
  const bezel = await boxOf(page, ".bezel");

  await page.route("**/*.js", async (route) => {
    await new Promise((later) => setTimeout(later, 300));
    await route.abort();
  });
  await page.goto(`${GATEWAY}/#cam=printer`);
  expectSameBox(
    await boxOf(page, ".printer__slot"),
    slot,
    "from a receipt",
    slot.width * 0.02,
  );
  await page.goto("about:blank");
  await page.goto(`${GATEWAY}/#cam=screen`);
  expectSameBox(
    await boxOf(page, ".bezel"),
    bezel,
    "from paw.",
    bezel.width * 0.01,
  );
  await page.goto("about:blank");
  await page.goto(`${PASS}/#cam=screen`);
  expectSameBox(
    await boxOf(page, ".bezel"),
    bezel,
    "paw. from the machine",
    bezel.width * 0.01,
  );
});

test("the cabinet pulls back to the whole machine after arriving from a receipt or paw.", async ({
  page,
}) => {
  for (const hint of ["#cam=printer", "#cam=screen"]) {
    await page.goto("about:blank");
    await page.goto(`${GATEWAY}/${hint}`);
    await expect(page).toHaveURL(`${GATEWAY}/`);
    const camera = page.locator("[data-camera]");
    await expect(camera).toHaveAttribute("data-framing", "whole");
    await expect(camera).not.toHaveAttribute("data-moving", /./, {
      timeout: 5_000,
    });
    await expect(page.locator("[data-tile]").first()).toBeVisible();
  }
});

test("a hint the machine does not know frames the whole machine and leaves the address", async ({
  page,
}) => {
  for (const odd of [
    "#cam=SCREEN",
    "#cam=../x",
    "#cam=screen&cam=printer",
    "#cam=",
  ]) {
    await page.goto("about:blank");
    await page.goto(`${GATEWAY}/${odd}`);
    await expect(page).toHaveURL(`${GATEWAY}/`);
    expect(
      await page
        .locator("[data-camera]")
        .evaluate((node) => getComputedStyle(node).getPropertyValue("--cam-s")),
      odd,
    ).toBe("1");
  }
});

type Seen = {
  stage: string;
  framing: string;
  unit: number;
  slot: Box;
  frame: Box;
  paper: Box;
};

function watchStages(): void {
  const seen: Seen[] = [];
  (window as unknown as { stages: Seen[] }).stages = seen;
  const box = (node: Element): Box => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  };
  const record = (): void => {
    const sheet = document.querySelector<HTMLElement>("[data-receipt-sheet]");
    const camera = document.querySelector<HTMLElement>("[data-camera]");
    const slot = document.querySelector(".printer__slot");
    const frame = document.querySelector("[data-receipt-frame]");
    const paper = document.querySelector("[data-receipt]");
    if (!sheet || !camera || !slot || !frame || !paper) return;
    seen.push({
      stage: sheet.dataset.stage ?? "",
      framing: camera.dataset.framing ?? "",
      unit:
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--u"),
        ) * parseFloat(getComputedStyle(camera).getPropertyValue("--cam-s")),
      slot: box(slot),
      frame: box(frame),
      paper: box(paper),
    });
  };
  new MutationObserver(record).observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-stage"],
  });
  document.addEventListener("DOMContentLoaded", record);
}

async function inHand(page: Page): Promise<void> {
  await expect(page.locator("[data-receipt-sheet]")).toHaveAttribute(
    "data-stage",
    "hand",
    { timeout: 5_000 },
  );
  await expect(page.locator("[data-camera]")).not.toHaveAttribute(
    "data-moving",
    /./,
  );
  await page.waitForTimeout(700);
}

test("the receipt's paper feeds from the slot without the slot ever changing size, then is held up in front of the whole machine", async ({
  page,
}) => {
  await page.addInitScript(watchStages);
  await page.goto(`${GATEWAY}/privacy.html`);
  await inHand(page);
  const seen = await page.evaluate(
    () => (window as unknown as { stages: Seen[] }).stages,
  );
  const fed = seen.find((entry) => entry.stage === "feed")!;
  const ripped = seen.find((entry) => entry.stage === "rip")!;
  expect(fed.framing).toBe("printer");
  expectSameBox(ripped.slot, fed.slot, "slot until the tear");
  expect(
    Math.abs(fed.frame.top - (fed.slot.top + fed.slot.height / 2)),
    "the paper comes out of the slot",
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(fed.slot.width - fed.paper.width - 12 * fed.unit),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(fed.paper.left - fed.slot.left - 6 * fed.unit),
  ).toBeLessThanOrEqual(1);

  const held = await boxOf(page, "[data-receipt-frame]");
  const paper = await boxOf(page, "[data-receipt]");
  const margin = await page.evaluate(() =>
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--margin"),
    ),
  );
  expect(Math.abs(held.top - (margin + 52))).toBeLessThanOrEqual(1);
  expect(Math.abs(paper.width - fed.paper.width)).toBeLessThanOrEqual(1);
  await expect(page.locator("[data-camera]")).toHaveAttribute(
    "data-framing",
    "whole",
  );
});

test("the paper takes the keys without a ring around it, and they scroll it", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/privacy.html`);
  await inHand(page);
  const paper = page.locator("article[data-receipt]");
  const frame = page.locator("[data-receipt-frame]");
  await expect(paper).toBeFocused();
  expect(
    await page.evaluate(() => {
      const ringed = (node: Element | null): boolean =>
        node !== null && getComputedStyle(node).outlineStyle !== "none";
      return {
        paper: ringed(document.querySelector("article[data-receipt]")),
        inner: ringed(document.querySelector("[data-receipt-inner]")),
        frame: document
          .querySelector("[data-receipt-frame]")!
          .matches(":focus-visible"),
      };
    }),
  ).toEqual({ paper: false, inner: false, frame: false });
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => frame.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0);
});

test("the paper in hand scrolls freely and nothing hangs", async ({ page }) => {
  await page.goto(`${GATEWAY}/privacy.html`);
  await inHand(page);
  await expect(page.locator("[data-receipt-slack]")).toHaveCount(0);
  const frame = page.locator("[data-receipt-frame]");
  const atRest = await boxOf(page, "[data-receipt-held]");
  for (const share of [0.2, 1]) {
    await frame.evaluate(
      (node, part) =>
        (node.scrollTop = (node.scrollHeight - node.clientHeight) * part),
      share,
    );
    expectSameBox(
      await boxOf(page, "[data-receipt-held]"),
      atRest,
      `held at ${share}`,
      0.5,
    );
  }
  expect(await frame.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(
    page.getByRole("link", { name: "Terms of service" }).last(),
  ).toBeInViewport();
});

test("without JavaScript the receipt still reads to its end", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${GATEWAY}/privacy.html`);
  await page
    .locator("[data-receipt-frame]")
    .evaluate((node) => (node.scrollTop = node.scrollHeight));
  await expect(
    page.getByRole("link", { name: "Terms of service" }).last(),
  ).toBeInViewport();
  await context.close();
});

test("crumpling a receipt returns to the cabinet, whole", async ({ page }) => {
  await page.goto(`${GATEWAY}/privacy.html`);
  await inHand(page);
  await page.getByRole("button", { name: "Crumple the receipt" }).click();
  await expect(page).toHaveURL(`${GATEWAY}/`, { timeout: 5_000 });
  const camera = page.locator("[data-camera]");
  await expect(camera).toHaveAttribute("data-framing", "whole");
  await expect(camera).not.toHaveAttribute("data-moving", /./, {
    timeout: 5_000,
  });
});

test("a receipt can be crumpled at any point of it, by Escape too", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/terms.html`);
  await inHand(page);
  await page
    .locator("[data-receipt-frame]")
    .evaluate(
      (node) => (node.scrollTop = (node.scrollHeight - node.clientHeight) / 2),
    );
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(`${GATEWAY}/`, { timeout: 5_000 });
});

test("a page restored from the back/forward cache pulls back instead of sitting zoomed", async ({
  page,
}) => {
  const restore = () =>
    page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
  await page.goto(`${GATEWAY}/`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    const camera = document.querySelector<HTMLElement>("[data-camera]")!;
    camera.dataset.framing = "printer";
    document.querySelector<HTMLElement>("[data-machine]")!.dataset.leaving =
      "printer";
  });
  await restore();
  await expect(page.locator("[data-camera]")).toHaveAttribute(
    "data-framing",
    "whole",
  );
  await expect(page.locator("[data-machine]")).not.toHaveAttribute(
    "data-leaving",
    /./,
  );

  await page.goto(`${GATEWAY}/privacy.html`);
  await inHand(page);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-receipt-sheet]")!.dataset.stage =
      "gone";
  });
  await restore();
  await expect(page.locator("[data-receipt-sheet]")).toHaveAttribute(
    "data-stage",
    "hand",
  );
  await expect(page.locator("[data-camera]")).toHaveAttribute(
    "data-framing",
    "whole",
  );

  await page.goto(`${PASS}/#cam=screen`);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-camera]")!.dataset.framing =
      "printer";
  });
  await restore();
  await expect(page.locator("[data-camera]")).toHaveAttribute(
    "data-framing",
    "screen",
  );
});

test("Back to the cabinet from a receipt lands on the whole machine", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/`);
  await page.waitForLoadState("networkidle");
  await page.locator(".plate a[href$='/privacy.html']").click();
  await expect(page).toHaveURL(/\/privacy(\.html)?$/, { timeout: 5_000 });
  await page.goBack();
  await expect(page).toHaveURL(`${GATEWAY}/`);
  await expect(page.locator("[data-camera]")).toHaveAttribute(
    "data-framing",
    "whole",
  );
});

test("a short window never zooms the screen below the machine's own size; the page scrolls instead", async ({
  browser,
}) => {
  for (const [width, height, url] of [
    [844, 390, `${PASS}/#cam=screen`],
    [844, 390, `${GATEWAY}/no/such/bay`],
    [915, 412, `${GATEWAY}/no/such/bay`],
    [1280, 460, `${PASS}/#cam=screen`],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const seen = await page.evaluate(() => {
      const camera = document.querySelector<HTMLElement>("[data-camera]")!;
      let least = Infinity;
      for (const node of document.querySelectorAll<HTMLElement>(
        "[data-machine] *",
      )) {
        const text = [...node.childNodes].some(
          (child) =>
            child.nodeType === Node.TEXT_NODE &&
            (child.textContent ?? "").trim() !== "",
        );
        if (!text || node.getClientRects().length === 0) continue;
        if (node.closest("[hidden]")) continue;
        const size = parseFloat(getComputedStyle(node).fontSize);
        least = Math.min(
          least,
          size *
            parseFloat(getComputedStyle(camera).getPropertyValue("--cam-s")),
        );
      }
      return {
        scale: parseFloat(getComputedStyle(camera).getPropertyValue("--cam-s")),
        least,
      };
    });
    expect(seen.scale, `${url} at ${width}x${height}`).toBeGreaterThanOrEqual(
      1,
    );
    expect(seen.least, `${url} at ${width}x${height}`).toBeGreaterThanOrEqual(
      10.88,
    );
    for (const key of await page.locator(".keypad .pw-key").all()) {
      const box = await key.boundingBox();
      expect(box!.height, `${url} key`).toBeGreaterThanOrEqual(44);
    }
    await page.close();
  }
});

test("the plate's links stay out of the keyboard's way where the camera does not show them", async ({
  page,
}) => {
  for (const url of [`${PASS}/#cam=screen`, `${GATEWAY}/no/such/bay`]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".plate"), url).toHaveAttribute("inert", "");
  }
  await page.goto(`${GATEWAY}/`);
  await expect(page.locator(".plate")).not.toHaveAttribute("inert", /.*/);
});

test("a 404's numerals stand above its title, not on it", async ({ page }) => {
  await page.goto(`${GATEWAY}/no/such/bay`);
  const led = await boxOf(page, ".page-led");
  const title = await boxOf(page, ".page-view h1");
  expect(led.top + led.height).toBeLessThanOrEqual(title.top + 0.5);
  expect(led.height).toBeGreaterThan(40);
});

test("the ticker scrolls once when its words outrun its window", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/`);
  await page.waitForLoadState("networkidle");
  const ticker = page.locator("[data-ticker-text]");
  const long = await ticker.evaluate(
    (node) => node.scrollWidth > node.parentElement!.clientWidth,
  );
  if (long) {
    await expect(ticker).toHaveAttribute("data-scroll", "once");
    expect(
      await ticker.evaluate((node) => ({
        name: getComputedStyle(node).animationName,
        count: getComputedStyle(node).animationIterationCount,
      })),
    ).toEqual({ name: "machine-ticker", count: "1" });
  }
});

test("a receipt's policy is the page's main content; the machine is beside it", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/privacy.html`);
  const main = page.getByRole("main");
  await expect(main).toHaveCount(1);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    "Privacy policy",
  );
  await expect(
    page.getByRole("region", { name: "Fixture vending machine" }),
  ).toBeVisible();
});

test("at the smallest scale every word stays readable and every key and tile stays big enough to press", async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
  await page.goto(`${GATEWAY}/`);
  await page.waitForLoadState("networkidle");
  const smallest = await page.evaluate(() => {
    let least = Infinity;
    let where = "";
    for (const node of document.querySelectorAll<HTMLElement>(
      "[data-machine] *",
    )) {
      const text = [...node.childNodes].some(
        (child) =>
          child.nodeType === Node.TEXT_NODE &&
          (child.textContent ?? "").trim() !== "",
      );
      if (!text || node.getClientRects().length === 0) continue;
      if (node.closest("[hidden], [aria-hidden='true'][data-falling]"))
        continue;
      const size = parseFloat(getComputedStyle(node).fontSize);
      if (size < least) {
        least = size;
        where = `${node.tagName}.${node.className}`;
      }
    }
    return { least, where };
  });
  expect(smallest.least, smallest.where).toBeGreaterThanOrEqual(10.88);
  for (const selector of ["[data-key]", "[data-cartridge]"]) {
    for (const target of await page.locator(selector).all()) {
      const box = await target.boundingBox();
      expect(box!.width, selector).toBeGreaterThanOrEqual(44);
      expect(box!.height, selector).toBeGreaterThanOrEqual(44);
    }
  }
  await page.close();
});

test("a hinted arrival's first frame is the hinted framing and the pull-back never zooms in again", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const seen: number[] = [];
    (window as unknown as { scales: number[] }).scales = seen;
    const tick = () => {
      const camera = document.querySelector("[data-camera]");
      if (camera !== null) {
        seen.push(new DOMMatrix(getComputedStyle(camera).transform).a);
      }
      if (document.readyState !== "complete" || seen.length < 90) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  await page.goto(`${GATEWAY}/#cam=printer`);
  await page.waitForTimeout(1500);
  const scales = await page.evaluate(
    () => (window as unknown as { scales: number[] }).scales,
  );
  expect(scales[0]).toBeGreaterThan(1.5);
  for (let index = 1; index < scales.length; index += 1) {
    expect(scales[index]!, `frame ${index}`).toBeLessThanOrEqual(
      scales[index - 1]! + 0.001,
    );
  }
  expect(scales.at(-1)).toBe(1);
});

test("Back from paw. to the cabinet lands on the whole machine", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/`);
  await page.waitForLoadState("networkidle");
  await page.locator("[data-sign-in]").click();
  await expect(page).toHaveURL(/:8787\//, { timeout: 10_000 });
  await page.goBack();
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(page.locator("[data-camera]")).toHaveAttribute(
    "data-framing",
    "whole",
  );
});

test("only the paper scrolls on a receipt; the room stays where it is", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/privacy.html`);
  await page.waitForTimeout(700);
  const top = () =>
    page.locator(".room").evaluate((node) => node.getBoundingClientRect().top);
  const room = await top();
  await page
    .locator("[data-receipt-frame]")
    .evaluate((node) => (node.scrollTop = 800));
  expect(
    await page
      .locator("[data-receipt-frame]")
      .evaluate((node) => node.scrollTop),
  ).toBeGreaterThan(0);
  expect(await top()).toBe(room);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(
    await page
      .locator("[data-receipt-frame]")
      .evaluate((node: HTMLElement) => node.offsetWidth - node.clientWidth),
    "the paper shows no scrollbar",
  ).toBe(0);
});
