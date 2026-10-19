// Verifies the Netlify-function wrapping layer: serverless-http(app) must
// accept Lambda/Netlify-style events and drive the Express 5 app correctly,
// including async handlers and redirects.
// Run with: node --test test/

const { test, after } = require("node:test");
const assert = require("node:assert");
const serverless = require("serverless-http");
const app = require("../index.js");

const handler = serverless(app);

// Minimal Netlify/AWS event shape accepted by serverless-http v4.
function invoke(method, path, bodyParams) {
  return handler({
    path,
    httpMethod: method,
    headers: bodyParams
      ? { host: "shortly.test", "content-type": "application/x-www-form-urlencoded" }
      : { host: "shortly.test" },
    body: bodyParams ? new URLSearchParams(bodyParams).toString() : undefined,
    isBase64Encoded: false,
  });
}

let shortId; // created once, reused across redirect tests

test("POST /main through the serverless wrapper shortens a URL", async (t) => {
  const res = await invoke("POST", "/main", {
    longUrl: `https://example.com/lambda-wrapped/${Date.now()}`,
  });
  assert.strictEqual(res.statusCode, 200);
  const match = String(res.body).match(/\/stats\/([0-9a-f]{6})/);
  assert.ok(match, "response includes a stats link with the short id");
  shortId = match[1];
});

test("GET /:shortId through the wrapper redirects to the long URL", async (t) => {
  assert.ok(shortId, "short link created by the previous test");
  const res = await invoke("GET", `/${shortId}`);
  assert.strictEqual(res.statusCode, 302);
  assert.match(String(res.headers.location), /^https:\/\/example\.com\/lambda-wrapped\//);
});

test("GET /stats/:shortId through the wrapper renders the stats page", async (t) => {
  const res = await invoke("GET", `/stats/${shortId}`);
  assert.strictEqual(res.statusCode, 200);
  assert.match(String(res.body), /Total Clicks: 1/);
});

test("GET / unknown id through the wrapper renders 404", async (t) => {
  const res = await invoke("GET", "/zzzzzz");
  assert.strictEqual(res.statusCode, 404);
});

test("POST /main through the wrapper rejects invalid URL with 400", async (t) => {
  const res = await invoke("POST", "/main", { longUrl: "javascript:alert(1)" });
  assert.strictEqual(res.statusCode, 400);
});

// Keep the process from hanging on the wrapper's internal listener.
after(() => {
  app.close?.();
  if (app._server) app._server.close?.();
});
