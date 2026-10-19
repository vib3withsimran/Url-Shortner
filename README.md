# 🔗 Shortly – URL Shortener

A clean and fast **URL Shortening service** built with **Node.js, Express, and EJS** — converts long URLs into short, shareable links with built-in click analytics.

🔗 **Live Demo**: *(coming soon)*  
📁 **Repo**: [github.com/vib3withsimran/Url-Shortner](https://github.com/vib3withsimran/Url-Shortner)

---

## ✨ Features

- 🔀 **URL Shortening** — Converts long URLs into unique 6-character short links
- ⚡ **Fast Redirection** — Instantly redirects visitors to the original URL
- 📊 **Click Analytics** — Tracks how many times each short link was visited
- 🔐 **Crypto-based IDs** — Secure unique ID generation via Node.js `crypto` module
- 🎨 **Clean UI** — Minimal, responsive frontend served directly by Express
- 🚄 **Serverless-ready** — Deploys to Netlify with persistent storage via Netlify Blobs

---

## 🛠 Tech Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Node.js v18+ |
| **Framework** | Express.js v5.1 |
| **Templating** | EJS v3.1 |
| **ID Generation** | Node.js `crypto` module |
| **Storage** | Netlify Blobs (prod) / local JSON file (dev) |
| **Hosting** | Netlify Functions + static CDN |
| **Frontend** | HTML5, CSS3, Vanilla JS |

---

## 📂 Project Structure

```
Shortly/
├── index.js               # Express app + all routes
├── store.js               # Storage layer: Netlify Blobs (prod) / JSON file (dev)
├── package.json
├── netlify.toml           # Netlify build + redirect config
├── netlify/
│   └── functions/
│       └── api.js         # serverless-http wrapper around the app
├── test/                  # node --test suite (app + serverless wrapper)
├── views/
│   ├── index.ejs          # Landing page (URL input form)
│   ├── show.ejs           # Result page (short link + analytics)
│   ├── 404.ejs            # Not-found page
│   └── 500.ejs            # Error page
└── public/
    ├── style.css          # Shared stylesheet
    ├── logo.jpeg          # App logo
    └── bgg.jpg            # Background image
```

---

## 📦 Prerequisites

- **Node.js** v18 or higher
- **npm** (comes with Node.js)

---

## 🚀 Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/vib3withsimran/Url-Shortner.git
cd Url-Shortner

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

> For development with auto-reload: `npm run dev` (requires nodemon)
>
> Run the test suite: `npm test`

---

## 💻 Usage

1. **Shorten a URL** — Paste any long URL into the form and click **Shorten URL**
2. **Share the link** — Copy the generated short link (e.g. `https://your-domain.com/a1b2c3`)
3. **Track clicks** — Click **Refresh Click Count** to see how many times your link was visited

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Landing page with the URL form |
| `POST` | `/main` | Creates a shortened URL |
| `GET` | `/:shortId` | Redirects to original URL + increments click count |
| `GET` | `/stats/:shortId` | Shows click analytics for a short link |

---

## 🔍 How It Works

```
1. User submits a long URL via the form (validated; only http/https)
2. Server generates a unique 6-char ID (retried on collision):
       crypto.randomBytes(3).toString("hex")  →  "a1b2c3"
3. Short URL + original URL persisted in the store (Blobs or JSON file)
4. Visiting /:shortId → redirect to original URL + click count++
5. Visiting /stats/:shortId → view click count
6. POST /main is rate-limited to 5 submissions per minute per client
```

---

## 🧯 Troubleshooting deploys

- **`MissingBlobsEnvironmentError`** — Netlify Blobs cannot auto-configure
  while functions run in **Lambda compatibility mode** (`serverless-http`).
  This is already handled: `netlify/functions/api.js` calls
  `connectLambda(event)` before routing to Express. If you ever see this
  error, make sure `@netlify/blobs` is in `package.json` and that the
  `connectLambda` call is still present in the wrapper.
- **`ENOENT mkdir /var/task/data`** — a previous version silently fell back
  to the local JSON store in production (the Lambda filesystem is
  read-only). Current code fails loudly with an actionable message instead.

---

## 📝 Notes

- **Storage** — In production the app persists links in Netlify Blobs
  (survives cold starts and deploys, shared by every function instance).
  Locally it falls back to `data/urls.json` (gitignored) so dev matches prod.
- **Rate limiting** — Per-client, in-memory. Exact locally; best-effort
  across serverless instances (a shared store like Upstash Redis would
  make it a hard global cap).
- **Security** — Helmet security headers with a CSP allowing only the
  CDNs the views actually use. Submitted URLs must parse as http(s).

---

## 🚀 Deploying

1. Commit and push this repo to GitHub.
2. app.netlify.com → **Add new site → Import an existing project** → pick the repo.
3. Leave build settings at defaults — `netlify.toml` configures everything.
4. Done: `@netlify/blobs` in `package.json` is picked up automatically;
   the live site works 24/7 from any device.

---

## 🔮 Future Improvements

- [ ] 🛢 Persist URLs in MongoDB / PostgreSQL
- [ ] 🔐 User accounts + login
- [ ] ⏳ Link expiry / TTL
- [ ] 👤 Personal dashboard with analytics
- [ ] 🛠 Global rate limiting via a shared store (e.g. Upstash Redis)

---

## 👤 Author

**Simran**  
🔗 [LinkedIn](https://www.linkedin.com/in/mssimran/) · 🐙 [GitHub](https://github.com/vib3withsimran)

---

## 📄 License

ISC License — feel free to use, modify, and share.

---

*Last updated: May 2026 · v1.0.0*