const express = require("express");
const crypto = require("crypto");
const path = require("path");
const app = express();

const port = process.env.PORT || 8080;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let urls = {};

// Landing page
app.get("/", (req, res) => {
    res.render("index");
});

// Shorten a URL
app.post("/main", (req, res) => {
    let { longUrl } = req.body;
    const shortId = crypto.randomBytes(3).toString("hex");
    urls[shortId] = { shortId, longUrl, clicks: 0 };
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.render("show", { url: urls[shortId], baseUrl });
});

// Stats page — must be before /:shortId to avoid being swallowed
app.get("/stats/:shortId", (req, res) => {
    const shortId = req.params.shortId;
    const entry = urls[shortId];
    if (!entry) return res.send("Invalid short URL");
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.render("show", { url: entry, baseUrl });
});

// Redirect short URL
app.get("/:shortId", (req, res) => {
    const shortId = req.params.shortId;
    const entry = urls[shortId];
    if (!entry) return res.send("Invalid short URL");
    entry.clicks++;
    res.redirect(entry.longUrl);
});

// Only start the server when run directly (local dev)
// When imported by Netlify Functions, we just export the app
if (require.main === module) {
    app.listen(port, () => {
        console.log(`App is listening on port ${port}`);
    });
}

module.exports = app;
