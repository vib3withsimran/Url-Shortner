// Persistent storage for short URLs.
//
// In production (Netlify Functions) we use Netlify Blobs — key/value storage
// that survives cold starts and is shared by every Lambda instance.
//
// Locally (`npm start`), Blobs is unavailable (it requires the Netlify
// runtime), so we fall back to a JSON file in ./data so dev behaviour
// matches prod.
//
// Layout:
//   entries are sharded across maps named by the first 2 chars of the
//   shortId, so no single document grows unbounded.
//   dedup index: map "byUrl" keyed by a hash of the longUrl, holding the
//   shortId that already serves that URL.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "urls.json");

let blobs = null;
let localCache = null;

// True inside Netlify Functions (also true for most AWS Lambda runtimes).
const IS_NETLIFY_RUNTIME = Boolean(
  process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME
);

function getBlobs() {
  if (blobs) return blobs;
  if (!IS_NETLIFY_RUNTIME) return null; // local dev → use the JSON fallback
  const { getStore: getStoreFn } = require("@netlify/blobs");
  try {
    // Automatic mode: needs env context bound by connectLambda(event).
    blobs = getStoreFn({ name: "shortly", consistency: "strong" });
    return blobs;
  } catch (err) {
    // Manual API-access fallback: does not rely on the runtime having
    // injected the event context. Configure in Netlify UI:
    //   NETLIFY_SITE_ID, NETLIFY_API_TOKEN (env vars)
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;
    if (siteID && token) {
      blobs = getStoreFn({ name: "shortly", siteID, token, consistency: "strong" });
      console.log("[store] Blobs initialized in API-access mode (manual env vars)");
      return blobs;
    }
    // Never silently fall back to the local-file store in production: the
    // Lambda filesystem is read-only and /var/task/data cannot exist.
    console.error("[store] Netlify Blobs failed to initialize:", err && err.message, "\n", err && err.stack);
    throw new Error(
      "Storage is unavailable: Netlify Blobs failed to initialize (" +
        (err && err.name) + "). " +
        "Fix: make sure @netlify/blobs is in package.json and, to work around " +
        "Lambda compatibility mode, set NETLIFY_SITE_ID and NETLIFY_API_TOKEN " +
        "as site environment variables in the Netlify dashboard, then redeploy."
    );
  }
}

function localRead() {
  if (localCache) return localCache;
  try {
    localCache = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    localCache = {};
  }
  return localCache;
}

function localWrite(map) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(map, null, 2));
  localCache = map;
}

// Netlify Blobs stores one JSON document per map key; the local fallback
// keeps it all in one object keyed the same way, so the rest of the code
// is storage-agnostic.
async function readMap(name) {
  const store = getBlobs();
  if (store) return JSON.parse((await store.get(name)) || "null") || {}; // happy path
  return localRead()[name] || {}; // local dev only (see getBlobs)
}

async function writeMap(name, map) {
  const store = getBlobs();
  if (store) {
    await store.setJSON(name, map);
    return;
  }
  const all = localRead();
  all[name] = map;
  localWrite(all);
}

function hashLongUrl(longUrl) {
  return `u${crypto.createHash("sha1").update(longUrl).digest("hex").slice(0, 12)}`;
}

async function putMap(name, key, record) {
  const map = await readMap(name);
  map[key] = record;
  await writeMap(name, map);
}

// ---- Public API ---------------------------------------------------------

// Returns the entry ({ shortId, longUrl, clicks }) for a shortId, or null.
async function get(shortId) {
  const map = await readMap(shortId.slice(0, 2));
  return map[shortId] || null;
}

async function put(entry) {
  await putMap(entry.shortId.slice(0, 2), entry.shortId, entry);
}

// Returns an entry serving the same longUrl (dedup), or null.
async function findByLongUrl(longUrl) {
  const name = "byUrl";
  const key = hashLongUrl(longUrl);
  const map = await readMap(name);
  const ref = map[key];
  return ref ? get(ref.shortId) : null;
}

// Saves a new entry { shortId, longUrl, clicks: 0 } and indexes it for dedup.
async function register(entry) {
  await put(entry);
  const name = "byUrl";
  const key = hashLongUrl(entry.longUrl);
  await putMap(name, key, { shortId: entry.shortId });
}

// Records a redirect click (read-modify-write; fine at this scale).
// Returns the updated entry, or null if the link vanished.
async function incrementClicks(shortId) {
  const entry = await get(shortId);
  if (!entry) return null;
  entry.clicks += 1;
  await put(entry);
  return entry;
}

module.exports = { get, findByLongUrl, put, register, incrementClicks };
