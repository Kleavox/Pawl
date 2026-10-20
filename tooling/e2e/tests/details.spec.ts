import { expect, test } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";

const GATEWAY = localWorkerOrigin("gateway", "localhost");
const PASS = localWorkerOrigin("pass", "localhost");

type Box = { left: number; top: number; right: number; bottom: number };

function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

test("the credit display reads FrEE on the cabinet and paw., and the code on a 404", async ({
  page,
}) => {
  for (const [url, reads] of [
    [`${GATEWAY}/`, "FrEE"],
    [`${PASS}/`, "FrEE"],
    [`${GATEWAY}/privacy.html`, "FrEE"],
    [`${GATEWAY}/no/such/bay`, "404"],
  ] as const) {
    await page.goto(url);
    const credit = page.locator("[data-part='credit']");
    await expect(credit, url).toHaveAttribute("data-credit", reads);
    await expect(credit, url).toBeVisible();
  }
  await page.goto(`${GATEWAY}/`);
  const boxes = await page.evaluate(() =>
    ["credit", "speaker", "sensor"].map((part) => {
      const rect = document
        .querySelector(`[data-part='${part}']`)!
        .getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    }),
  );
  expect(overlaps(boxes[0]!, boxes[1]!)).toBe(false);
  expect(overlaps(boxes[0]!, boxes[2]!)).toBe(false);
});

test("on a phone the credit display sits in the lights row without covering a light", async ({
  browser,
}) => {
  for (const [width, height] of [
    [390, 664],
    [320, 640],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${GATEWAY}/`);
    await page.waitForLoadState("networkidle");
    const seen = await page.evaluate(() => {
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
        credit: box(document.querySelector("[data-part='credit']")!),
        lenses: box(document.querySelector("[data-part='lenses']")!),
        lights: [...document.querySelectorAll(".lens")].map(box),
      };
    });
    expect(seen.credit.left, `${width}`).toBeGreaterThanOrEqual(
      seen.lenses.left,
    );
    expect(seen.credit.right, `${width}`).toBeLessThanOrEqual(
      seen.lenses.right,
    );
    expect(seen.credit.top, `${width}`).toBeGreaterThanOrEqual(seen.lenses.top);
    expect(seen.credit.bottom, `${width}`).toBeLessThanOrEqual(
      seen.lenses.bottom,
    );
    for (const light of seen.lights) {
      expect(overlaps(seen.credit, light), `${width}`).toBe(false);
    }
    await page.close();
  }
});

test("the keypad carries the ADA marks and the bay the rocking sticker", async ({
  browser,
}) => {
  const desk = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await desk.goto(`${GATEWAY}/`);
  await expect(
    desk.locator("[data-key='5'] [data-tactile='bar']"),
  ).toBeVisible();
  await expect(
    desk.locator("[data-key='GO'] [data-tactile='circle']"),
  ).toBeVisible();
  await expect(
    desk.locator("[data-key='CLR'] [data-tactile='arrow']"),
  ).toBeVisible();
  await expect(desk.locator("[data-hinge]")).toHaveCount(2);
  for (const hinge of await desk.locator("[data-hinge]").all()) {
    await expect(hinge).toBeVisible();
  }
  const sticker = desk.locator("[data-sticker='tilt']");
  await expect(sticker).toBeVisible();
  const seen = await desk.evaluate(() => {
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
      sticker: box("[data-sticker='tilt']"),
      tray: box("[data-part='tray']"),
      flap: box(".tray__flap"),
      label: box(".tray__label"),
    };
  });
  expect(seen.sticker.left).toBeGreaterThanOrEqual(seen.tray.left);
  expect(seen.sticker.bottom).toBeLessThanOrEqual(seen.tray.bottom);
  expect(overlaps(seen.sticker, seen.flap)).toBe(false);
  expect(overlaps(seen.sticker, seen.label)).toBe(false);
  await desk.close();
  const phone = await browser.newPage({
    viewport: { width: 390, height: 664 },
  });
  await phone.goto(`${GATEWAY}/`);
  await expect(
    phone.locator("[data-key='5'] [data-tactile='bar']"),
  ).toBeVisible();
  await expect(phone.locator("[data-sticker='tilt']")).toBeHidden();
  for (const hinge of await phone.locator("[data-hinge]").all()) {
    await expect(hinge).toBeHidden();
  }
  await phone.close();
});

const CODE39_VALUES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. ";

function code39Char(pattern: string): string {
  const bars = [0, 2, 4, 6, 8].map((at) => pattern[at] === "w");
  const spaces = [1, 3, 5, 7].map((at) => pattern[at] === "w");
  const weight = [1, 2, 4, 7, 0].reduce(
    (sum, value, at) => sum + (bars[at] ? value : 0),
    0,
  );
  const inGroup = weight === 11 ? 0 : weight;
  const group = spaces.indexOf(true);
  const start = [30, 0, 10, 20][group]!;
  const value =
    group === 1 ? inGroup : start + (inGroup === 0 ? 10 : inGroup) - 1;
  return value === 39 ? "*" : (CODE39_VALUES[value] ?? "?");
}

test("the privacy receipt's barcode decodes to PRIVACY", async ({ page }) => {
  await page.goto(`${GATEWAY}/privacy.html`);
  const rects = await page.evaluate(() =>
    [...document.querySelectorAll("[data-barcode] svg rect")].map((rect) => ({
      x: Number(rect.getAttribute("x")),
      width: Number(rect.getAttribute("width")),
    })),
  );
  const pattern: string[] = [];
  rects.forEach((rect, at) => {
    pattern.push(rect.width >= 2 ? "w" : "n");
    const next = rects[at + 1];
    if (next !== undefined) {
      pattern.push(next.x - (rect.x + rect.width) >= 2 ? "w" : "n");
    }
  });
  const chars: string[] = [];
  for (let at = 0; at < pattern.length; at += 10) {
    chars.push(code39Char(pattern.slice(at, at + 9).join("")));
  }
  expect(chars.join("")).toBe("*PRIVACY*");
});

test("a forced lucky roll ends on 7777 and says so", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto(`${GATEWAY}/`);
  await page.waitForLoadState("networkidle");
  await page.locator("[data-cartridge='7']").click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");
  const credit = page.locator("[data-part='credit']");
  await expect(credit).toHaveAttribute("data-credit", "7777");
  await expect(credit).toHaveAttribute("data-credit-blink", "");
  await expect(page.locator("[data-screen-sub]")).toHaveText(
    "LUCKY 7777, ONE MORE ON US",
  );
  await page.locator("[data-tray-action]").click();
  await expect(credit).toHaveAttribute("data-credit", "FrEE");
  await expect(page.locator("[data-screen-sub]")).not.toHaveText(/LUCKY/);
});

test("five taps on the steel rock the machine and warn", async ({ page }) => {
  await page.goto(`${GATEWAY}/`);
  await page.waitForLoadState("networkidle");
  const brand = page.locator(".marquee__brand");
  for (let tap = 0; tap < 5; tap += 1) await brand.click();
  await expect(page.locator("[data-machine]")).toHaveAttribute(
    "data-rocking",
    "",
  );
  await expect(page.locator("[data-screen]")).toHaveText("NEVER ROCK OR TILT");
  await expect(page.locator("[data-screen-sub]")).toHaveText(
    "IT IS FREE ANYWAY",
  );
  const iterations = await page.evaluate(() =>
    document
      .getAnimations()
      .map((animation) => animation.effect?.getTiming().iterations),
  );
  expect(iterations.every((count) => count === 1)).toBe(true);
  await expect(page.locator("[data-machine]")).not.toHaveAttribute(
    "data-rocking",
    /.*/,
  );
});

test("the Konami code adds thirty lives", async ({ page }) => {
  await page.goto(`${GATEWAY}/`);
  await page.waitForLoadState("networkidle");
  for (const key of [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a",
  ]) {
    await page.keyboard.press(key);
  }
  await expect(page.locator("[data-part='credit']")).toHaveAttribute(
    "data-credit",
    "  30",
  );
  await expect(page.locator("[data-screen]")).toHaveText("+30 LIVES");
});

test("4-2-3-1 opens the service menu, prints a DEX audit, and CLR hands the bays back", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/`);
  await page.waitForLoadState("networkidle");
  for (const key of ["4", "2", "3", "1"]) await page.keyboard.press(key);
  await expect(page.locator("[data-cabinet-word]")).toHaveText("SERVICE MODE");
  await expect(page.locator("[data-screen]")).toHaveText("SERVICE 1 ERROR");
  await expect(page.locator("[data-part='credit']")).toHaveAttribute(
    "data-credit",
    "SEr1",
  );
  await page.keyboard.press("4");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-machine]")).toHaveAttribute(
    "data-lamp-test",
    "",
  );
  await expect(page.locator("[data-part='credit']")).toHaveAttribute(
    "data-credit",
    "8888",
  );
  await expect(page.locator("[data-machine]")).not.toHaveAttribute(
    "data-lamp-test",
    /.*/,
  );
  await page.keyboard.press("5");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-receipt-sheet]")).toHaveAttribute(
    "data-stage",
    "hand",
    { timeout: 10_000 },
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Machine audit" }),
  ).toBeVisible();
  const dex = await page.locator("pre[data-dex]").textContent();
  expect(dex).toMatch(/^DXS\*PAWL-GW-01\*VA\*V1\/1\*1\n/);
  expect(dex).toMatch(/\nG85\*[0-9A-F]{4}\nSE\*\d+\*0001\nDXE\*1\*1$/);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-receipt-sheet]")).toHaveCount(0, {
    timeout: 10_000,
  });
  for (const key of ["4", "2", "3", "1"]) await page.keyboard.press(key);
  await expect(page.locator("[data-cabinet-word]")).toHaveText("SERVICE MODE");
  await page.keyboard.press("Backspace");
  await expect(page.locator("[data-cabinet-word]")).toHaveText("GUEST MODE");
  await expect(page.locator("[data-part='credit']")).toHaveAttribute(
    "data-credit",
    "FrEE",
  );
});

test("a receipt's barcode is drawn wide enough to scan off the screen", async ({
  browser,
}) => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${GATEWAY}/privacy.html`);
    const module = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>("[data-barcode] svg")!;
      return svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    });
    expect(module, `${width}`).toBeGreaterThanOrEqual(1.4);
    await page.close();
  }
});

test("finger coke answers like CMU's board, and every answer says GNU Terry Pratchett", async ({
  request,
}) => {
  for (const origin of [GATEWAY, PASS]) {
    const host = new URL(origin).hostname;
    const response = await request.get(
      `${origin}/.well-known/webfinger?resource=${encodeURIComponent(`acct:coke@${host}`)}`,
    );
    expect(response.status(), origin).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/jrd+json");
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    expect(response.headers()["x-clacks-overhead"]).toBe("GNU Terry Pratchett");
    const board = (await response.json()) as {
      properties: Record<string, string>;
      links: { rel: string; href: string }[];
    };
    const states = Object.values(board.properties);
    expect(states).toHaveLength(9);
    expect(states).toContain("READY");
    expect(states.every((state) => /^(EMPTY|READY|LOCKED)$/.test(state))).toBe(
      true,
    );
    expect(board.links[0]!.rel).toBe(
      "http://openid.net/specs/connect/1.0/issuer",
    );
  }
  for (const url of [`${GATEWAY}/`, `${PASS}/`, `${GATEWAY}/privacy.html`]) {
    const response = await request.get(url);
    expect(response.headers()["x-clacks-overhead"], url).toBe(
      "GNU Terry Pratchett",
    );
  }
});

test("the console says STOP, then names the secret", async ({ page }) => {
  for (const url of [`${GATEWAY}/`, `${PASS}/`]) {
    const said: string[] = [];
    const listen = (message: { type: () => string; text: () => string }) => {
      if (message.type() === "log") said.push(message.text());
    };
    page.on("console", listen);
    await page.goto(url);
    await expect
      .poll(() => said.length, { message: url })
      .toBeGreaterThanOrEqual(3);
    page.off("console", listen);
    expect(said[0], url).toContain("STOP");
    expect(said[1], url).toContain("paste");
    expect(said[2], url).toContain("4-2-3-1");
  }
});
