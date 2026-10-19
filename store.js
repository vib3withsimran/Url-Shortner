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

function getBlobs() {
  if (blobs) return blobs;
  try {
    // Throws MissingBlobsEnvironmentError outside the Netlify runtime.
    const { getStore } = require("@netlify/blobs");
    blobs = getStore({ name: "shortly", consistency: "strong" });
    return blobs;
  } catch {
    return null;
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
  if (store) {
    const raw = await store.get(name);
    return raw ? JSON.parse(raw) : {};
  }
  return localRead()[name] || {};
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
