import { expect, test } from "@playwright/test";

import { signedInAs } from "./pass-account";

const GATEWAY = "http://127.0.0.1:8786";

test("an app's proxy prefix reaches it on its internal host", async ({
  request,
}) => {
  const answer = await (await request.get(`${GATEWAY}/api/notes/ping`)).json();
  expect(answer).toEqual({
    app: "notes",
    host: "notes.internal",
    path: "/api/notes/ping",
  });
});

test("an apex slug is resolved by the apex app, with the public host forwarded", async ({
  request,
}) => {
  const response = await request.get(`${GATEWAY}/fixture-slug`, {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(302);
  expect(response.headers()["location"]).toBe(
    "http://127.0.0.1:8790/landed?via=127.0.0.1",
  );
});

test("an unknown apex slug falls through to the static site's 404", async ({
  request,
}) => {
  const response = await request.get(`${GATEWAY}/nobody-made-this`, {
    headers: { accept: "text/html" },
  });
  expect(response.status()).toBe(404);
});

test("a file slug the resolver does not know is served by the apex app as a page", async ({
  request,
}) => {
  expect(await (await request.get(`${GATEWAY}/n_abc123`)).text()).toBe(
    "file page n_abc123",
  );
});

test("a purge endpoint is not reachable on a public host", async ({
  request,
}) => {
  const response = await request.post(
    "http://127.0.0.1:8790/.well-known/pawl/purge-user?id=x",
  );
  expect(response.status()).toBe(404);
});

test("the estate names the fixture's count and never zero for a tool it could not read", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const account = await signedInAs(page, "probeestate", "ADMIN");
  await page.goto("http://localhost:8786/");
  await expect(page.locator("[data-account-name]")).toHaveText(account.user, {
    timeout: 20_000,
  });
  const estate = (await (
    await page.request.get("http://localhost:8786/api/estate")
  ).json()) as {
    tools: Record<string, unknown>;
    attention: { title: string }[];
  };
  expect(estate.tools.notes).toEqual({ count: 7, severity: "warn" });
  expect(estate.tools).not.toHaveProperty("docs");
  expect(estate.attention.map((item) => item.title)).toContain("fixture item");
});
