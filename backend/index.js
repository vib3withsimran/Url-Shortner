const express = require("express");
const crypto = require("crypto");
const app = express();

const port = 8080;

const path = require("path");
app.set("view engine", "ejs");

app.set("views", path.join(__dirname, "/views"));
app.use(express.static(path.join(__dirname, "/public")));

app.use(express.urlencoded({extended: true}));
app.use(express.json());

let urls={};

app.post("/main", (req, res) => {
    let { longUrl } = req.body;

    const shortId = crypto.randomBytes(3).toString("hex");

    urls[shortId] = {
        shortId,
        longUrl,
        clicks: 0
    };

    res.render("show", { url: urls[shortId] });
});

app.get("/:shortId", (req, res) => {
    const shortId = req.params.shortId;

    const entry = urls[shortId];
    if (!entry) return res.send("Invalid short URL");

    entry.clicks++;

    res.redirect(entry.longUrl);
});

app.get("/stats/:shortId", (req, res) => {
    const shortId = req.params.shortId;
    const entry = urls[shortId];

    if (!entry) return res.send("Invalid short URL");

    res.render("show", { url: entry });
});


app.listen(port, ()=>{
    console.log(`app is listening on ${port}`);
})