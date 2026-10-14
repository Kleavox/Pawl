import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";

const GATEWAY = localWorkerOrigin("gateway", "localhost");
const PASS = localWorkerOrigin("pass", "localhost");
const FIXTURE = new URL("../fixture/geometry.json", import.meta.url);
const PAGES = {
  cabinet: `${GATEWAY}/`,
  receipt: `${GATEWAY}/privacy.html`,
  pass: `${PASS}/`,
  missing: `${GATEWAY}/no/such/bay`,
} as const;
const VIEWPORTS = [
  [1440, 900],
  [1366, 768],
  [390, 844],
  [360, 740],
] as const;

type Box = [number, number, number, number];
type Shot = { parts: Record<string, Box>; bezel: Box; slot: Box };

async function shoot(page: Page): Promise<Shot> {
  await page.evaluate(() => document.fonts.ready);
  const parts = await page.evaluate(() => {
    const machine = document.querySelector<HTMLElement>("[data-machine]")!;
    const within = (node: HTMLElement): [number, number, number, number] => {
      let x = 0;
      let y = 0;
      let at: HTMLElement | null = node;
      while (at !== null && at !== machine) {
        x += at.offsetLeft;
        y += at.offsetTop;
        at = at.offsetParent as HTMLElement | null;
      }
      return [x, y, node.offsetWidth, node.offsetHeight];
    };
    return Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-part]")].map((n) => [
        n.dataset.part!,
        within(n),
      ]),
    );
  });
  const framed = async (to: string, selector: string): Promise<Box> =>
    page.evaluate(
      ([framing, target]) => {
        const camera = document.querySelector<HTMLElement>("[data-camera]")!;
        camera.style.transition = "none";
        camera.dataset.framing = framing!;
        void camera.offsetWidth;
        const box = document.querySelector(target!)!.getBoundingClientRect();
        return [box.left, box.top, box.width, box.height] as [
          number,
          number,
          number,
          number,
        ];
      },
      [to, selector],
    );
  return {
    parts,
    bezel: await framed("screen", ".bezel"),
    slot: await framed("printer", ".printer__slot"),
  };
}

test("every machine part sits where it sat before the migration", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const seen: Record<string, Record<string, Shot>> = {};
  for (const [name, url] of Object.entries(PAGES)) {
    seen[name] = {};
    for (const [width, height] of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      seen[name][`${width}x${height}`] = await shoot(page);
      await page.close();
    }
  }
  if (process.env.PAWL_GEOMETRY_WRITE === "1") {
    writeFileSync(FIXTURE, `${JSON.stringify(seen, null, 2)}\n`);
    return;
  }
  const before = JSON.parse(readFileSync(FIXTURE, "utf8")) as typeof seen;
  for (const [name, sizes] of Object.entries(before)) {
    for (const [size, shot] of Object.entries(sizes)) {
      const now = seen[name]![size]!;
      for (const [part, box] of Object.entries(shot.parts)) {
        box.forEach((value, index) =>
          expect(
            Math.abs(now.parts[part]![index]! - value),
            `${name} ${size} ${part}[${index}]`,
          ).toBeLessThanOrEqual(1),
        );
      }
      for (const key of ["bezel", "slot"] as const) {
        shot[key].forEach((value, index) =>
          expect(
            Math.abs(now[key][index]! - value),
            `${name} ${size} ${key}[${index}]`,
          ).toBeLessThanOrEqual(1),
        );
      }
    }
  }
});
