import { expect, test, type Browser, type Page } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";

const GATEWAY = localWorkerOrigin("gateway", "localhost");
const PASS = localWorkerOrigin("pass", "localhost");
const BUDGET_MS = 500;

function watchMotion(): void {
  const heavy = new Set<string>();
  (window as unknown as { heavy: Set<string> }).heavy = heavy;
  const light = new Set([
    "transform",
    "opacity",
    "offset",
    "computedOffset",
    "easing",
    "composite",
  ]);
  let frames = 0;
  const look = () => {
    for (const animation of document.getAnimations()) {
      if (animation instanceof CSSTransition) {
        const target = (animation.effect as KeyframeEffect).target;
        if (
          target instanceof HTMLElement &&
          target.hasAttribute("data-camera") &&
          animation.transitionProperty !== "transform"
        ) {
          heavy.add(`camera transition: ${animation.transitionProperty}`);
        }
        continue;
      }
      if (!(animation instanceof CSSAnimation)) continue;
      for (const frame of (animation.effect as KeyframeEffect).getKeyframes()) {
        for (const property of Object.keys(frame)) {
          if (!light.has(property)) {
            heavy.add(`${animation.animationName}: ${property}`);
          }
        }
      }
    }
    frames += 1;
    if (frames < 600) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}

async function heavyMotion(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...(window as unknown as { heavy: Set<string> }).heavy,
  ]);
}

test("the camera glides on transform, which the compositor runs", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/`);
  expect(
    await page
      .locator("[data-camera]")
      .evaluate((node) => getComputedStyle(node).transitionProperty),
  ).toBe("transform");
});

test("every animation at an arrival, a dispense, a paw. step and a tear moves only transform and opacity", async ({
  page,
}) => {
  await page.addInitScript(watchMotion);

  await page.goto(`${GATEWAY}/#cam=printer`);
  await page.waitForTimeout(1200);
  await page.locator("[data-cartridge='7']").click();
  await page.waitForTimeout(1500);
  expect(await heavyMotion(page), "cabinet").toEqual([]);

  await page.goto(`${PASS}/#cam=screen`);
  await expect(page.locator("[data-view-panel='methods']")).toBeVisible();
  await page.locator("[data-method='email']").click();
  await page.waitForTimeout(600);
  expect(await heavyMotion(page), "paw.").toEqual([]);

  await page.route(/:8786\/(#.*)?$/, (route) => route.fulfill({ status: 204 }));
  await page.goto(`${GATEWAY}/terms.html`);
  await page.waitForTimeout(800);
  await page.locator(".receipt__head a[data-tear]").click();
  await expect(page.locator("[data-receipt-frame]")).toHaveAttribute(
    "data-torn",
    "fall",
  );
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/terms/);
  expect(await heavyMotion(page), "receipt").toEqual([]);
});

type Loaf = { start: number; duration: number };

function watchFrames(): void {
  const seen: Loaf[] = [];
  (window as unknown as { loafs: Loaf[] }).loafs = seen;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      seen.push({ start: entry.startTime, duration: entry.duration });
    }
  }).observe({ type: "long-animation-frame", buffered: true });
}

async function onPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(watchFrames);
  return page;
}

async function longestAfter(
  page: Page,
  act: () => Promise<void>,
): Promise<number> {
  await page.waitForTimeout(3000);
  const from = await page.evaluate(() => performance.now());
  await act();
  await page.waitForTimeout(2500);
  return page.evaluate(
    (since) =>
      Math.max(
        0,
        ...(window as unknown as { loafs: Loaf[] }).loafs
          .filter((loaf) => loaf.start >= since)
          .map((loaf) => loaf.duration),
      ),
    from,
  );
}

test("on a slow phone, a bay press, a paw. step and a tear keep every frame under the budget", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  const cabinet = await onPhone(browser);
  await cabinet.goto(`${GATEWAY}/`);
  const press = await longestAfter(cabinet, () =>
    cabinet.locator("[data-cartridge='7']").click(),
  );
  await cabinet.context().close();

  const pass = await onPhone(browser);
  await pass.goto(`${PASS}/`);
  const step = await longestAfter(pass, () =>
    pass.locator("[data-method='email']").click(),
  );
  await pass.context().close();

  const receipt = await onPhone(browser);
  await receipt.route(/:8786\/(#.*)?$/, (route) =>
    route.fulfill({ status: 204 }),
  );
  await receipt.goto(`${GATEWAY}/terms.html`);
  const tear = await longestAfter(receipt, async () => {
    await receipt.locator(".receipt__head a[data-tear]").click();
    await expect(receipt.locator("[data-receipt-frame]")).toHaveAttribute(
      "data-torn",
      "fall",
    );
  });
  await expect(receipt).toHaveURL(/terms/);
  await receipt.context().close();

  expect(press, "bay press").toBeLessThanOrEqual(BUDGET_MS);
  expect(step, "paw. step").toBeLessThanOrEqual(BUDGET_MS);
  expect(tear, "receipt tear").toBeLessThanOrEqual(BUDGET_MS);
});
