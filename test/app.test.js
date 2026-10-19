// Integration tests for the Express app.
// Run with: node --test test/

const { test, after } = require("node:test");
const assert = require("node:assert");
const app = require("../index.js");

// Start the app once on an ephemeral port for the whole file.
let server;
let baseUrl;
let readyResolve;
const ready = new Promise((r) => (readyResolve = r));
server = app.listen(0, "127.0.0.1", () => {
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  readyResolve();
});

function postForm(path, fields) {
  return fetch(baseUrl + path, {
    method: "POST",
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

test("GET / renders the landing page with form", async (t) => {
  await ready;
  const res = await fetch(baseUrl + "/");
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.match(html, /action="\/main"/);
  assert.match(html, /name="longUrl"/);
});

test("GET / sends security headers (helmet)", async (t) => {
  await ready;
  const res = await fetch(baseUrl + "/");
  assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(res.headers.get("content-security-policy") || "", /default-src 'self'/);
});

test("POST /main rejects non-URL garbage with 400", async (t) => {
  await ready;
  const res = await postForm("/main", { longUrl: "not a url at all" });
  assert.strictEqual(res.status, 400);
  assert.match(await res.text(), /valid URL/);
});

test("POST /main rejects javascript: scheme with 400", async (t) => {
  await ready;
  const res = await postForm("/main", { longUrl: "javascript:alert(1)" });
  assert.strictEqual(res.status, 400);
});

test("Unknown short id renders a 404", async (t) => {
  await ready;
  const res = await fetch(baseUrl + "/xx_an_unknown_id", { redirect: "manual" });
  assert.strictEqual(res.status, 404);
  assert.match(await res.text(), /Link not found/);
});

test("Full flow: shorten → redirect → click count → dedup", async (t) => {
  await ready;
  const unique = Date.now();
  const longUrl = `https://example.com/${unique}/some/path`;

  // Create
  const createRes = await postForm("/main", { longUrl });
  assert.strictEqual(createRes.status, 200);
  const createHtml = await createRes.text();
  const shortId = (createHtml.match(/\/stats\/([0-9a-f]{6})/) || [])[1];
  assert.ok(shortId, "created page shows a short id");

  // Redirect
  const redir = await fetch(`${baseUrl}/${shortId}`, { redirect: "manual" });
  assert.strictEqual(redir.status, 302);
  assert.strictEqual(redir.headers.get("location"), longUrl);

  // Click counted
  const stats = await fetch(`${baseUrl}/stats/${shortId}`);
  assert.match(await stats.text(), /Total Clicks: 1/);

  // Dedup: same longUrl → same short id
  const dupRes = await postForm("/main", { longUrl });
  assert.ok((await dupRes.text()).includes(shortId));
});

// Rate-limit test: exhaust the budget, confirm 429s, then poll until the
// 60s window expires and the client can shorten again.
test("POST /main rate limits after 5 posts, then recovers", async (t) => {
  await ready;
  const stamp = Date.now();
  const statuses = [];
  for (let i = 0; i < 7; i++) {
    const res = await postForm("/main", { longUrl: `https://example.com/rate/${stamp}/${i}` });
    statuses.push(res.status);
    res.body.cancel();
  }
  assert.strictEqual(statuses.filter((s) => s === 429).length >= 1, true);

  // Poll (1s interval) up to 62s for the window to clear.
  let recovered = false;
  const deadline = Date.now() + 62_000;
  while (Date.now() < deadline) {
    const res = await postForm("/main", { longUrl: `https://example.com/recover/${Date.now()}` });
    if (res.status !== 429) {
      recovered = true;
    }
    res.body.cancel();
    if (recovered) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.strictEqual(recovered, true, "rate limit cleared after the 60s window");
});

// Keep the process from hanging on the open listener once tests finish.
after(() => {
  server.close();
});

