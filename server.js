const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const session = require("express-session");
const Database = require("better-sqlite3");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!SESSION_SECRET || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error("Missing required environment variables: SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD");
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.set("trust proxy", 1);

// ─── Session ───
app.use(session({
  secret: SESSION_SECRET,
  proxy: true,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000
  } // 1 day
}));

// ─── Auth middleware ───
function isAuthenticated(req) {
  return Boolean(req.session && req.session.authenticated);
}

function requireAdminPage(req, res, next) {
  if (isAuthenticated(req)) {
    return next();
  }
  return res.redirect("/admin/login");
}

function requireAuthApi(req, res, next) {
  if (isAuthenticated(req)) {
    return next();
  }
  return res.status(401).json({ error: "Authentication required" });
}

// Apply auth to admin routes (except login page)
app.use("/admin", function(req, res, next) {
  if (req.path === "/login") {
    return next();
  }
  return requireAdminPage(req, res, next);
});

// ─── Login ───
app.post("/api/login", function(req, res) {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    req.session.username = username;
    return res.json({ success: true });
  }
  res.status(401).json({ error: "Invalid credentials" });
});

app.post("/api/logout", function(req, res) {
  req.session.destroy();
  res.json({ success: true });
});

app.get("/api/me", function(req, res) {
  if (req.session && req.session.authenticated) {
    return res.json({ authenticated: true, username: req.session.username });
  }
  res.json({ authenticated: false });
});

// ─── File Upload ───

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Preserve original extension, add timestamp to avoid conflicts
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .substring(0, 40);
    cb(null, name + "-" + Date.now() + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: function (req, file, cb) {
    const allowed = [".gif", ".png", ".jpg", ".jpeg", ".webp", ".mp4", ".webm"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only GIF, PNG, JPG, WEBP, MP4, WEBM files are allowed"));
    }
  }
});

// POST /api/upload — upload a single file
app.post("/api/upload", requireAuthApi, upload.single("file"), function (req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const fileUrl = "/uploads/" + req.file.filename;
  res.json({ url: fileUrl, filename: req.file.filename });
});

// Error handler for multer
app.use(function (err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large. Max 50MB." });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// Database
const db = new Database(path.join(__dirname, "data.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    cover_gif TEXT DEFAULT '',
    gallery_gifs TEXT DEFAULT '[]',
    short_description TEXT DEFAULT '',
    project_text TEXT DEFAULT '',
    youtube_url TEXT DEFAULT '',
    poster_image TEXT DEFAULT '',
    featured INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS site_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    display_name TEXT NOT NULL DEFAULT '',
    brand_subtitle TEXT NOT NULL DEFAULT '',
    role_title TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    avatar_image TEXT NOT NULL DEFAULT '',
    about_bio TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    telegram_url TEXT NOT NULL DEFAULT '',
    telegram_label TEXT NOT NULL DEFAULT '',
    instagram_url TEXT NOT NULL DEFAULT '',
    instagram_label TEXT NOT NULL DEFAULT '',
    behance_url TEXT NOT NULL DEFAULT '',
    behance_label TEXT NOT NULL DEFAULT '',
    contact_eyebrow TEXT NOT NULL DEFAULT '',
    contact_title_line1 TEXT NOT NULL DEFAULT '',
    contact_title_line2 TEXT NOT NULL DEFAULT '',
    contact_title_accent TEXT NOT NULL DEFAULT '',
    contact_description TEXT NOT NULL DEFAULT '',
    contact_form_eyebrow TEXT NOT NULL DEFAULT '',
    contact_form_title TEXT NOT NULL DEFAULT '',
    contact_success_title TEXT NOT NULL DEFAULT '',
    contact_success_message TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

const defaultProfile = {
  id: 1,
  display_name: "RudiGetih",
  brand_subtitle: "collage art studio",
  role_title: "Collage & Motion Artist",
  location: "Bandung, Indonesia",
  avatar_image: "./uploads/gatsby.webp",
  about_bio: "Visual creator specializing in GIF-first collage art, mixed media video treatments, and experimental motion design. Tearing up the rules of digital polish, embracing rough edges, analog dust, and paper-cut textures.",
  contact_email: "rudi@getih.com",
  telegram_url: "https://t.me/rudigetih",
  telegram_label: "@rudigetih",
  instagram_url: "https://instagram.com/rudigetih",
  instagram_label: "@rudigetih",
  behance_url: "https://behance.net/rudigetih",
  behance_label: "Behance",
  contact_eyebrow: "Visual Alchemist",
  contact_title_line1: "Let's Build",
  contact_title_line2: "Something",
  contact_title_accent: "Loud.",
  contact_description: "Kirim pesan untuk kolaborasi visual, mixed media treatment, atau proyek kolase. Kita bikin sesuatu yang nyata.",
  contact_form_eyebrow: "Get in Touch",
  contact_form_title: "Send a Treatment Inquiry",
  contact_success_title: "Nuhun Bos!",
  contact_success_message: "Pesan anjeun parantos dikintun. Kuring bakal ngawaler sacepatna!"
};

db.prepare(`
  INSERT OR IGNORE INTO site_profile (
    id, display_name, brand_subtitle, role_title, location, avatar_image, about_bio,
    contact_email, telegram_url, telegram_label, instagram_url, instagram_label,
    behance_url, behance_label, contact_eyebrow, contact_title_line1,
    contact_title_line2, contact_title_accent, contact_description,
    contact_form_eyebrow, contact_form_title, contact_success_title,
    contact_success_message
  ) VALUES (
    @id, @display_name, @brand_subtitle, @role_title, @location, @avatar_image, @about_bio,
    @contact_email, @telegram_url, @telegram_label, @instagram_url, @instagram_label,
    @behance_url, @behance_label, @contact_eyebrow, @contact_title_line1,
    @contact_title_line2, @contact_title_accent, @contact_description,
    @contact_form_eyebrow, @contact_form_title, @contact_success_title,
    @contact_success_message
  )
`).run(defaultProfile);

// Seed
const count = db.prepare("SELECT COUNT(*) as count FROM projects").get();
if (count.count === 0) {
  try {
    const dataPath = path.join(__dirname, "content", "projects.json");
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, "utf-8");
      const parsed = JSON.parse(raw);
      const projects = Array.isArray(parsed) ? parsed : parsed.projects || [];

      const insert = db.prepare(
        "INSERT OR IGNORE INTO projects (title, category, slug, cover_gif, gallery_gifs, short_description, project_text, youtube_url, poster_image, featured) VALUES (@title, @category, @slug, @cover_gif, @gallery_gifs, @short_description, @project_text, @youtube_url, @poster_image, @featured)"
      );

      const tx = db.transaction((items) => {
        for (const item of items) {
          insert.run({
            title: item.title || "",
            category: item.category || "",
            slug: item.slug || "",
            cover_gif: item.cover_gif || "",
            gallery_gifs: JSON.stringify(item.gallery_gifs || []),
            short_description: item.short_description || "",
            project_text: item.project_text || "",
            youtube_url: item.youtube_url || "",
            poster_image: item.poster_image || "",
            featured: item.featured || 1,
          });
        }
      });

      tx(projects);
      console.log("Seeded " + projects.length + " projects");
    }
  } catch (err) {
    console.error("Seed error:", err.message);
  }
}

// ─── API ───

app.get("/api/projects", (req, res) => {
  try {
    const projects = db.prepare("SELECT * FROM projects ORDER BY featured ASC, created_at DESC").all();
    res.json(projects.map(function(p) {
      p.gallery_gifs = JSON.parse(p.gallery_gifs || "[]");
      return p;
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/profile", (req, res) => {
  try {
    const profile = db.prepare("SELECT * FROM site_profile WHERE id = 1").get();
    res.json(profile || defaultProfile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/projects/:slug", (req, res) => {
  try {
    const param = req.params.slug;
    let p;
    // If the param is a number, look up by numeric id, otherwise by slug string
    if (/^\d+$/.test(param)) {
      p = db.prepare("SELECT * FROM projects WHERE id = ?").get(Number(param));
    } else {
      p = db.prepare("SELECT * FROM projects WHERE slug = ?").get(param);
    }

    if (!p) return res.status(404).json({ error: "Not found" });
    p.gallery_gifs = JSON.parse(p.gallery_gifs || "[]");
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/projects", requireAuthApi, (req, res) => {
  try {
    const b = req.body;
    if (!b.title || !b.slug) return res.status(400).json({ error: "Title and slug required" });

    const r = db.prepare(
      "INSERT INTO projects (title, category, slug, cover_gif, gallery_gifs, short_description, project_text, youtube_url, poster_image, featured) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).run(b.title, b.category || "", b.slug, b.cover_gif || "", JSON.stringify(b.gallery_gifs || []), b.short_description || "", b.project_text || "", b.youtube_url || "", b.poster_image || "", b.featured || 1);

    const p = db.prepare("SELECT * FROM projects WHERE id = ?").get(r.lastInsertRowid);
    p.gallery_gifs = JSON.parse(p.gallery_gifs || "[]");
    res.status(201).json(p);
  } catch (err) {
    if (err.message.includes("UNIQUE")) return res.status(400).json({ error: "Slug already exists" });
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/projects/:id", requireAuthApi, (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const b = req.body;
    db.prepare(
      "UPDATE projects SET title=?, category=?, slug=?, cover_gif=?, gallery_gifs=?, short_description=?, project_text=?, youtube_url=?, poster_image=?, featured=?, updated_at=datetime('now') WHERE id=?"
    ).run(
      b.title || existing.title,
      b.category !== undefined ? b.category : existing.category,
      b.slug || existing.slug,
      b.cover_gif !== undefined ? b.cover_gif : existing.cover_gif,
      JSON.stringify(b.gallery_gifs || JSON.parse(existing.gallery_gifs || "[]")),
      b.short_description !== undefined ? b.short_description : existing.short_description,
      b.project_text !== undefined ? b.project_text : existing.project_text,
      b.youtube_url !== undefined ? b.youtube_url : existing.youtube_url,
      b.poster_image !== undefined ? b.poster_image : existing.poster_image,
      b.featured !== undefined ? b.featured : existing.featured,
      req.params.id
    );

    const p = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    p.gallery_gifs = JSON.parse(p.gallery_gifs || "[]");
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/projects/:id", requireAuthApi, (req, res) => {
  try {
    const r = db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/profile", requireAuthApi, (req, res) => {
  try {
    const b = req.body || {};
    const existing = db.prepare("SELECT * FROM site_profile WHERE id = 1").get() || defaultProfile;
    db.prepare(`
      UPDATE site_profile SET
        display_name = ?,
        brand_subtitle = ?,
        role_title = ?,
        location = ?,
        avatar_image = ?,
        about_bio = ?,
        contact_email = ?,
        telegram_url = ?,
        telegram_label = ?,
        instagram_url = ?,
        instagram_label = ?,
        behance_url = ?,
        behance_label = ?,
        contact_eyebrow = ?,
        contact_title_line1 = ?,
        contact_title_line2 = ?,
        contact_title_accent = ?,
        contact_description = ?,
        contact_form_eyebrow = ?,
        contact_form_title = ?,
        contact_success_title = ?,
        contact_success_message = ?,
        updated_at = datetime('now')
      WHERE id = 1
    `).run(
      b.display_name !== undefined ? b.display_name : existing.display_name,
      b.brand_subtitle !== undefined ? b.brand_subtitle : existing.brand_subtitle,
      b.role_title !== undefined ? b.role_title : existing.role_title,
      b.location !== undefined ? b.location : existing.location,
      b.avatar_image !== undefined ? b.avatar_image : existing.avatar_image,
      b.about_bio !== undefined ? b.about_bio : existing.about_bio,
      b.contact_email !== undefined ? b.contact_email : existing.contact_email,
      b.telegram_url !== undefined ? b.telegram_url : existing.telegram_url,
      b.telegram_label !== undefined ? b.telegram_label : existing.telegram_label,
      b.instagram_url !== undefined ? b.instagram_url : existing.instagram_url,
      b.instagram_label !== undefined ? b.instagram_label : existing.instagram_label,
      b.behance_url !== undefined ? b.behance_url : existing.behance_url,
      b.behance_label !== undefined ? b.behance_label : existing.behance_label,
      b.contact_eyebrow !== undefined ? b.contact_eyebrow : existing.contact_eyebrow,
      b.contact_title_line1 !== undefined ? b.contact_title_line1 : existing.contact_title_line1,
      b.contact_title_line2 !== undefined ? b.contact_title_line2 : existing.contact_title_line2,
      b.contact_title_accent !== undefined ? b.contact_title_accent : existing.contact_title_accent,
      b.contact_description !== undefined ? b.contact_description : existing.contact_description,
      b.contact_form_eyebrow !== undefined ? b.contact_form_eyebrow : existing.contact_form_eyebrow,
      b.contact_form_title !== undefined ? b.contact_form_title : existing.contact_form_title,
      b.contact_success_title !== undefined ? b.contact_success_title : existing.contact_success_title,
      b.contact_success_message !== undefined ? b.contact_success_message : existing.contact_success_message
    );

    const updated = db.prepare("SELECT * FROM site_profile WHERE id = 1").get();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve admin HTML files ───

app.get("/admin/login", function(req, res) {
  res.sendFile(path.join(__dirname, "admin", "login.html"));
});

app.get("/admin", function(req, res) {
  res.sendFile(path.join(__dirname, "admin", "dashboard.html"));
});

app.get("/admin/new", function(req, res) {
  res.sendFile(path.join(__dirname, "admin", "form.html"));
});

app.get("/admin/edit", function(req, res) {
  res.sendFile(path.join(__dirname, "admin", "form.html"));
});

app.get("/admin/profile", function(req, res) {
  res.sendFile(path.join(__dirname, "admin", "profile.html"));
});

// ─── Start ───

app.listen(PORT, function() {
  console.log("Server: http://localhost:" + PORT);
  console.log("Admin:  http://localhost:" + PORT + "/admin");
  console.log("API:    http://localhost:" + PORT + "/api/projects");
});
