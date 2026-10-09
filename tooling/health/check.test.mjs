import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

test("passes when Pawl's own two Workers are healthy, asking no app", async (context) => {
  const server = createServer((request, response) => {
    const path = request.url;

    if (path === "/gateway/health") {
      return json(response, { service: "gateway", status: "ok" });
    }
    if (path === "/pass/ready") {
      return json(response, { service: "pass", status: "ready" });
    }
    if (path === "/pass/api/oauth/providers") {
      return json(response, { google: false, github: false });
    }
    response.writeHead(404);
    return response.end();
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const child = spawn(process.execPath, ["check.mjs"], {
    cwd: import.meta.dirname,
    env: {
      ...process.env,
      APP_ROOT_DOMAIN: "example.com",
      GATEWAY_ORIGIN: `${origin}/gateway`,
      PASS_ORIGIN: `${origin}/pass`,
      HEALTH_ATTEMPTS: "1",
      HEALTH_DELAY_MS: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const [exitCode] = await once(child, "exit");
  assert.equal(exitCode, 0, `${stdout}\n${stderr}`);
  assert.match(stdout, /All services passed\./);
});

function json(response, value) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
