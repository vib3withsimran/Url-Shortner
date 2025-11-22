# 🔗 Shortly – URL Shortener (Node.js + Express + EJS)

Shortly is a **minimal SaaS-style URL Shortening service** built with **Node.js, Express, and EJS**.  
It converts long messy URLs into **short, shareable links**, tracks link **click analytics**, and performs **fast redirection**.

---

## 🚀 Features

- ✨ Shorten long URLs into unique short IDs  
- 🔁 Redirect to original URL on click  
- 📊 Click-based analytics (counts number of visits)  
- 🧠 Unique ID generation using Crypto  
- 🗂️ Clean MVC-style code structure  
- 🎨 Simple modern frontend using HTML, CSS, EJS  

---

## 🏗️ What I Used (Tech Stack)

| Tech | Usage |
|------|-------|
| **Node.js** | Backend runtime |
| **Express.js** | Server + routing |
| **EJS** | Dynamic templating |
| **Crypto Module** | Short-ID generation |
| **CSS + HTML** | Frontend UI |

---

## 🧠 How Shortening Works (Logic)

1. User submits a long URL through a form  
2. Backend generates a unique short ID using:

`js: 
const shortId = crypto.randomBytes(3).toString("hex");
3. The short ID + long URL is stored in an in-memory store (array/object)

4. When a user visits http://localhost:8080/<shortId>:

Click counter increases

User is redirected to their original long URL

# 📎 Future Improvements (To Do)

🔐 Add User Accounts + Login

🛢 Save URLs in MongoDB instead of memory

⏳ Add expiry time for links

📁 Create Admin dashboard for analytics

--- 

# 👩‍💻 Made By
Simran
