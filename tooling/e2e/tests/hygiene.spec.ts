import { expect, test } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";

const GATEWAY = localWorkerOrigin("gateway", "localhost");

test("a keyboard TAKE DELIVERY rings nothing while the paper prints, then hands the keys to the paper", async ({
  page,
}) => {
  await page.goto(`${GATEWAY}/`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-cartridge='7']")!.dataset.href =
      "#stay";
  });
  await page.keyboard.press("7");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "7");
  await page.locator("[data-tray-action]").focus();
  const seen: { stage: string; framed: boolean }[] = [];
  await page.exposeFunction("note", (stage: string, framed: boolean) =>
    seen.push({ stage, framed }),
  );
  await page.evaluate(() => {
    const watch = (): void => {
      const sheet = document.querySelector<HTMLElement>("[data-receipt-sheet]");
      const stage = sheet?.dataset.stage ?? "none";
      const framed =
        document.activeElement?.matches("[data-receipt-frame]") ?? false;
      void (
        window as unknown as { note: (s: string, f: boolean) => void }
      ).note(stage, framed);
      if (stage !== "hand") requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-receipt-sheet]")).toHaveAttribute(
    "data-stage",
    "hand",
    { timeout: 10_000 },
  );
  const printing = seen.filter((frame) =>
    ["slot", "feed", "jerk", "rip"].includes(frame.stage),
  );
  expect(printing.length).toBeGreaterThan(0);
  expect(printing.filter((frame) => frame.framed)).toEqual([]);
  await expect(page.locator("article[data-receipt]")).toBeFocused();
});

const PASS = localWorkerOrigin("pass", "localhost");

test("Pawl's own pages carry the same safe headers on both hosts and stay compressible", async ({
  request,
}) => {
  for (const url of [
    `${GATEWAY}/`,
    `${GATEWAY}/privacy.html`,
    `${GATEWAY}/no/such/bay`,
    `${GATEWAY}/health`,
    `${PASS}/`,
    `${PASS}/health`,
  ]) {
    const response = await request.get(url, {
      headers: { accept: "text/html" },
      maxRedirects: 0,
    });
    const headers = response.headers();
    expect(headers["strict-transport-security"], url).toBe("max-age=31536000");
    expect(headers["x-content-type-options"], url).toBe("nosniff");
    expect(headers["referrer-policy"], url).toBe("same-origin");
    expect(headers["x-frame-options"], url).toBe("DENY");
    expect(headers["permissions-policy"], url).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(headers["cache-control"] ?? "", url).not.toContain("no-transform");
  }
});

test("security.txt names the contact on both hosts", async ({ request }) => {
  for (const origin of [GATEWAY, PASS]) {
    const response = await request.get(`${origin}/.well-known/security.txt`);
    expect(response.status(), origin).toBe(200);
    const text = await response.text();
    expect(text, origin).toMatch(/^Contact: mailto:privacy@/m);
    expect(text, origin).toMatch(
      /^Expires: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/m,
    );
    expect(text, origin).toContain(
      `Canonical: ${origin}/.well-known/security.txt`,
    );
  }
});
