const crypto = require("crypto");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const store = require("./store");

const app = express();
const port = process.env.PORT || 8080;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Security headers. CSP explicitly allows the CDN/font assets used by the
// views and inline scripts (the copy button), which neither breaks the UI
// nor weakens XSS protection for template data.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---- Rate limiting (POST /main only) ----
// In-memory, per process. Local dev: exact. Serverless: best effort — each
// Lambda instance has its own count, so this slows hammering but is not a
// hard global cap. A shared store (e.g. Upstash Redis) would close that gap.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const rateHits = new Map();

function pruneRateHits(now) {
  for (const [ip, rec] of rateHits) {
    if (now - rec.start > RATE_WINDOW_MS) rateHits.delete(ip);
  }
}

function rateLimit(req, res, next) {
  const now = Date.now();
  if (rateHits.size > 1000) pruneRateHits(now);
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  let rec = rateHits.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW_MS) {
    rec = { start: now, count: 0 };
    rateHits.set(ip, rec);
  }
  rec.count += 1;
  if (rec.count > RATE_MAX) {
    return res
      .status(429)
      .send("Too many requests — please wait a minute before shortening more links.");
  }
  next();
}

// Same message everywhere; never echo user input into it.
const INVALID_URL_MSG =
  "That doesn't look like a valid URL. Please use a full link starting with http:// or https://";

// Validates and normalizes a submitted URL.
// Returns the normalized URL string, or null if invalid.
function parseUrl(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  // Only web schemes; rejects javascript:, data:, mailto:, etc.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

// Landing page
app.get("/", (req, res) => {
  res.render("index");
});

// Shorten a URL
app.post("/main", rateLimit, async (req, res) => {
  const longUrl = parseUrl(req.body.longUrl);
  if (!longUrl) {
    return res.status(400).render("index", { error: INVALID_URL_MSG });
  }

  // Dedup: same long URL reuses the existing short link.
  const existing = await store.findByLongUrl(longUrl);
  if (existing) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return res.render("show", { url: existing, baseUrl });
  }

  // Generate an ID, retrying on the (rare) collision with an existing link.
  let shortId = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = crypto.randomBytes(3).toString("hex");
    if (!await store.get(candidate)) {
      shortId = candidate;
      break;
    }
  }
  if (!shortId) {
    // ~16.7M ids exhausted — practically unreachable, but don't overwrite.
    return res
      .status(503)
      .send("We're out of capacity for new links right now. Please try again later.");
  }

  const entry = { shortId, longUrl, clicks: 0 };
  await store.register(entry);
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.render("show", { url: entry, baseUrl });
});

// Stats page — must be before /:shortId to avoid being swallowed
app.get("/stats/:shortId", async (req, res) => {
  const entry = await store.get(req.params.shortId);
  if (!entry) return notFound(res);
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.render("show", { url: entry, baseUrl });
});

// Redirect short URL
app.get("/:shortId", async (req, res) => {
  const entry = await store.get(req.params.shortId);
  if (!entry) return notFound(res);
  await store.incrementClicks(req.params.shortId);
  res.redirect(entry.longUrl);
});

function notFound(res) {
  res.status(404).render("404");
}

// Anything not matched above
app.use((req, res) => notFound(res));

// Errors from async route handlers reach this in Express 5
app.use((err, req, res, next) => {
  if (!res.headersSent) {
    console.error("Request failed:", err);
    res.status(500).render("500");
  }
});

// Only start the server when run directly (local dev)
// When imported by Netlify Functions, we just export the app
if (require.main === module) {
  app.listen(port, () => {
    console.log(`App is listening on port ${port}`);
    console.log("Storage: " + (process.env.NETLIFY ? "Netlify Blobs" : "local JSON file (./data)"));
  });
}

module.exports = app;
