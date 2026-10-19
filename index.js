const crypto = require("crypto");
const path = require("path");
const express = require("express");
const store = require("./store");

const app = express();
const port = process.env.PORT || 8080;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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
app.post("/main", async (req, res) => {
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

// Only start the server when run directly (local dev)
// When imported by Netlify Functions, we just export the app
if (require.main === module) {
  app.listen(port, () => {
    console.log(`App is listening on port ${port}`);
    console.log("Storage: " + (process.env.NETLIFY ? "Netlify Blobs" : "local JSON file (./data)"));
  });
}

module.exports = app;
