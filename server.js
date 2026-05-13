const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

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
app.post("/api/upload", upload.single("file"), function (req, res) {
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

app.get("/api/projects/:slug", (req, res) => {
  try {
    const p = db.prepare("SELECT * FROM projects WHERE slug = ?").get(req.params.slug);
    if (!p) return res.status(404).json({ error: "Not found" });
    p.gallery_gifs = JSON.parse(p.gallery_gifs || "[]");
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/projects", (req, res) => {
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

app.put("/api/projects/:id", (req, res) => {
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

app.delete("/api/projects/:id", (req, res) => {
  try {
    const r = db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve admin HTML files ───

app.get("/admin", function(req, res) {
  res.sendFile(path.join(__dirname, "admin", "dashboard.html"));
});

app.get("/admin/new", function(req, res) {
  res.sendFile(path.join(__dirname, "admin", "form.html"));
});

app.get("/admin/edit", function(req, res) {
  res.sendFile(path.join(__dirname, "admin", "form.html"));
});

// ─── Start ───

app.listen(PORT, function() {
  console.log("Server: http://localhost:" + PORT);
  console.log("Admin:  http://localhost:" + PORT + "/admin");
  console.log("API:    http://localhost:" + PORT + "/api/projects");
});
