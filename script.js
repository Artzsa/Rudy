const page = document.body.dataset.page;
const contentPath = document.body.dataset.contentPath || "/api/projects";
const projectBase = document.body.dataset.projectBase || "./project/";
const homePath = document.body.dataset.homePath || "./index.html";
const videosPath = document.body.dataset.videosPath || "./videos.html";

const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");

if (menuToggle && siteNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("open");
    document.body.classList.toggle("menu-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      siteNav.classList.remove("open");
      document.body.classList.remove("menu-open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const revealTargets = () =>
  document.querySelectorAll(
    ".reveal-target, .gif-card, .video-card, .project-hero, .gallery-card, .project-copy, .project-nav, .about-me-content, .contact-form, .category-card, .filter-tab"
  );

function bindReveal() {
  const targets = revealTargets();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  targets.forEach((element) => {
    element.classList.add("reveal");
    observer.observe(element);
  });
}

function buildProjectUrl(slug) {
  return `${projectBase}?slug=${encodeURIComponent(slug)}`;
}

function buildVideoAnchor(slug) {
  return `${videosPath}#${encodeURIComponent(slug)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeMediaUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    return "";
  }

  return "";
}

function sanitizeId(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function youtubeEmbedUrl(idOrUrl) {
  if (!idOrUrl) {
    return "";
  }

  try {
    const url = new URL(idOrUrl);
    if (url.hostname.includes("youtu.be")) {
      const shortId = url.pathname.slice(1).match(/^[a-zA-Z0-9_-]{6,}$/);
      return shortId ? `https://www.youtube-nocookie.com/embed/${shortId[0]}` : "";
    }

    const paramsId = url.searchParams.get("v");
    if (paramsId && /^[a-zA-Z0-9_-]{6,}$/.test(paramsId)) {
      return `https://www.youtube-nocookie.com/embed/${paramsId}`;
    }
  } catch {
    if (/^[a-zA-Z0-9_-]{6,}$/.test(idOrUrl)) {
      return `https://www.youtube-nocookie.com/embed/${idOrUrl}`;
    }
    return "";
  }

  return "";
}

async function loadProjects() {
  const response = await fetch(contentPath);
  if (!response.ok) {
    throw new Error("Failed to load project content.");
  }

  const data = await response.json();
  const projects = Array.isArray(data) ? data : data.projects || [];
  return [...projects].sort((a, b) => (a.featured ?? 999) - (b.featured ?? 999));
}

function renderHome(projects) {
  const grid = document.querySelector("#category-grid");
  if (!grid) {
    return;
  }

  grid.innerHTML = "";

  let currentIndex = 0;
  const itemsPerPage = 6;

  const trigger = document.createElement("div");
  trigger.id = "load-more-trigger";
  trigger.style.height = "20px";
  trigger.style.width = "100%";
  trigger.style.gridColumn = "1 / -1";
  grid.appendChild(trigger);

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        renderBatch();
      }
    },
    { rootMargin: "300px" }
  );

  function renderBatch() {
    const nextBatch = projects.slice(currentIndex, currentIndex + itemsPerPage);
    if (nextBatch.length === 0) {
      return;
    }

    const cardsHTML = nextBatch
      .map((project) => {
        const title = escapeHtml(project.title);
        const category = escapeHtml(project.category);
        const coverUrl = sanitizeMediaUrl(project.cover_gif);
        return `
          <a class="category-card reveal-target" href="./videos.html?category=${encodeURIComponent(project.category)}">
            <div class="category-cover-wrapper">
              <img class="category-cover" src="${coverUrl}" alt="${title} cover" loading="lazy" />
              <div class="category-overlay">
                <div class="behance-overlay-content">
                  <h3 class="behance-overlay-title">${title}</h3>
                  <span class="behance-overlay-category">${category}</span>
                </div>
              </div>
            </div>
          </a>
        `;
      })
      .join("");

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = cardsHTML;
    while (tempDiv.firstChild) {
      grid.insertBefore(tempDiv.firstChild, trigger);
    }

    setTimeout(() => {
      bindReveal();
    }, 50);

    currentIndex += itemsPerPage;

    if (currentIndex >= projects.length) {
      observer.disconnect();
      trigger.remove();
    }
  }

  renderBatch();

  if (currentIndex < projects.length) {
    observer.observe(trigger);
  }
}

function renderProject(project) {
  const target = document.querySelector("#project-page");
  if (!target) {
    return;
  }

  const galleryItems = Array.isArray(project.gallery_gifs) ? project.gallery_gifs : [];
  const galleryMarkup =
    galleryItems.length > 0
      ? galleryItems
          .map((item) => {
            const imageUrl = sanitizeMediaUrl(item.src);
            const imageAlt = escapeHtml(item.alt || project.title);
            const caption = item.caption ? `<p class="gallery-caption">${escapeHtml(item.caption)}</p>` : "";
            return `
              <article class="gallery-card">
                <img src="${imageUrl}" alt="${imageAlt}" loading="lazy" />
                ${caption}
              </article>
            `;
          })
          .join("")
      : `
        <article class="gallery-card">
          <img src="${sanitizeMediaUrl(project.cover_gif)}" alt="${escapeHtml(project.title)} animated preview" loading="lazy" />
        </article>
      `;

  target.innerHTML = `
    <div class="project-nav reveal-target">
      <a class="back-link" href="${homePath}#work">Back to portfolio</a>
      <a class="back-link" href="${buildVideoAnchor(project.slug)}">Jump to full video</a>
    </div>
    <section class="project-gallery-section">
      <div class="project-gallery">${galleryMarkup}</div>
    </section>
  `;
}

function renderVideoHub(projects) {
  const target = document.querySelector("#video-hub");
  if (!target) {
    return;
  }

  const sidebar = document.querySelector(".behance-sidebar");
  const defaultSidebarHTML = sidebar ? sidebar.innerHTML : "";
  const urlParams = new URLSearchParams(window.location.search);
  let activeCategory = urlParams.get("category") || "All";
  const categories = ["All", ...new Set(projects.map((p) => p.category).filter(Boolean))];

  function draw() {
    const tabsMarkup = `
      <div class="filter-tabs-container">
        ${categories
          .map(
            (cat) => `
            <button class="filter-tab ${cat === activeCategory ? "active" : ""}" data-category="${cat}" type="button">
              ${escapeHtml(cat)}
            </button>
          `
          )
          .join("")}
      </div>
    `;

    const filteredProjects =
      activeCategory === "All"
        ? projects
        : projects.filter((p) => p.category === activeCategory);

    const videosMarkup =
      filteredProjects.length > 0
        ? `
        <div class="video-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 2rem; width: 100%;">
          ${filteredProjects
            .map((project) => {
              const title = escapeHtml(project.title);
              const category = escapeHtml(project.category);
              const description = project.short_description
                ? `<p class="video-hub-desc">${escapeHtml(project.short_description)}</p>`
                : "";
              const embedUrl = youtubeEmbedUrl(project.youtube_url);
              const safeId = sanitizeId(project.slug);
              return `
              <div class="video-hub-card reveal-target" id="${safeId}">
                <div class="video-hub-embed">
                  <iframe
                    src="${embedUrl}"
                    title="${title}"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowfullscreen
                    style="width: 100%; aspect-ratio: 16/9; display: block; border: 0;"
                  ></iframe>
                </div>
                <div class="video-hub-info">
                  <span class="video-hub-cat">${category}</span>
                  <h3 class="video-hub-title">${title}</h3>
                  ${description}
                  <a class="video-hub-link" href="${buildProjectUrl(project.slug)}">Case Study →</a>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      `
        : `
        <div style="grid-column: 1 / -1; text-align: center; padding: 5rem 0; width: 100%;">
          <p class="eyebrow">No Content</p>
          <h2 style="font-family: 'Fraunces', serif; font-size: 2rem;">Belum ada video untuk kategori ini.</h2>
        </div>
      `;

    if (sidebar && defaultSidebarHTML) {
      if (activeCategory === "All") {
        sidebar.innerHTML = defaultSidebarHTML;
      } else {
        const catProjects = projects.filter((p) => p.category === activeCategory);

        if (catProjects.length > 0) {
          const p1 = catProjects[0];
          const img1 = sanitizeMediaUrl(p1 ? p1.cover_gif : "./uploads/gatsby.webp");

          let img2 = sanitizeMediaUrl("./uploads/gatsby.webp");
          if (catProjects[1]) {
            img2 = sanitizeMediaUrl(catProjects[1].cover_gif);
          } else if (p1 && Array.isArray(p1.gallery_gifs) && p1.gallery_gifs[0]) {
            img2 = sanitizeMediaUrl(p1.gallery_gifs[0].src);
          } else if (p1 && Array.isArray(p1.gallery_gifs) && p1.gallery_gifs[1]) {
            img2 = sanitizeMediaUrl(p1.gallery_gifs[1].src);
          }

          let categoryTitle = `${activeCategory}: Behind The Lens`;
          let categoryEyebrow = "Audio Visual Reconstruction";
          let categoryDesc = `This collection represents an experimental visual treatment exploring the boundaries of mixed media and raw frame pacing. Through textured cuts, analog noise, and deliberate contrast shifts, each project in ${activeCategory} strips away digital polish to unveil the beauty of rough edges.`;
          let styleVal = "Mixed Media, Cut-Out, Raw Frame Rate";
          let conceptVal = "Visual Static & Frame Pace";

          if (activeCategory === "Kicau") {
            categoryTitle = "Kicau: The Sound of Cage & Culture";
            categoryEyebrow = "Audio Visual Reconstruction";
            categoryDesc =
              "Kicau is an experimental visual treatment project capturing the delicate yet heavy nature of bird-keeping culture in Indonesia. Through harsh cuts, high-contrast monochrome frames, and paper textures, we strip away the passive nature of nature, turning chirps into mechanical rhythm and static into visual weight.";
            styleVal = "Mixed Media, Cut-Out, Halftone";
            conceptVal = "Cultural Soundscapes & Static Noise";
          } else if (activeCategory === "Music Video") {
            categoryTitle = "Sound & Color Motion Treatments";
            categoryEyebrow = "Visual Rhythms";
            categoryDesc =
              "Music videos crafted with raw analog textures, high-energy edits, and dynamic frame manipulations. Aligning audio frequencies with visual grit to deliver an immersive sensory experience.";
            styleVal = "VCR Static, Paper Cuts, Film Damage";
            conceptVal = "Audio-Visual Synchronization";
          }

          const safeActiveCategory = escapeHtml(activeCategory);
          const safeCategoryEyebrow = escapeHtml(categoryEyebrow);
          const safeCategoryTitle = escapeHtml(categoryTitle);
          const safeCategoryDesc = escapeHtml(categoryDesc);
          const safeStyleVal = escapeHtml(styleVal);
          const safeConceptVal = escapeHtml(conceptVal);

          sidebar.innerHTML = `
            <div class="kicau-collage-visual" style="position: relative; height: 320px; background: rgba(24, 22, 26, 0.03); border: 1px solid rgba(24, 22, 26, 0.08); overflow: hidden; border-radius: 8px; box-shadow: var(--shadow); width: 100%; margin-bottom: 2rem;">
              <div class="paper-noise" style="opacity: 0.15; z-index: 1;"></div>
              <img src="${img1}" alt="${safeActiveCategory} visual 1" style="position: absolute; width: 65%; height: 75%; object-fit: cover; left: 10%; top: 10%; transform: rotate(-3deg); border: 8px solid #fff9ef; box-shadow: 0 8px 24px rgba(0,0,0,0.15); z-index: 2;" class="hover-collage-img1" />
              <div style="position: absolute; right: 8%; bottom: 12%; width: 45%; height: 50%; border: 6px solid #fff9ef; box-shadow: 0 10px 30px rgba(194,74,54,0.3); transform: rotate(5deg); z-index: 3; display: flex; align-items: center; justify-content: center; overflow: hidden;" class="hover-collage-img2">
                <img src="${img2}" alt="${safeActiveCategory} visual 2" style="width: 100%; height: 100%; object-fit: cover; position: absolute; z-index: 1;" />
                <div style="position: absolute; width: 100%; height: 100%; background: rgba(194,74,54,0.4); z-index: 2;"></div>
                <span style="font-family: 'Bebas Neue', sans-serif; font-size: 1.8rem; color: #fff9ef; transform: rotate(-5deg); letter-spacing: 0.05em; position: relative; z-index: 3; text-shadow: 0 2px 8px rgba(0,0,0,0.5);">${safeActiveCategory.toUpperCase()}</span>
              </div>
              <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; border: 12px solid transparent; border-image: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22><rect x=%225%22 y=%225%22 width=%2290%22 height=%2290%22 fill=%22none%22 stroke=%22%23c24a36%22 stroke-width=%222%22 stroke-dasharray=%2210 5%22/></svg>') 12; pointer-events: none; z-index: 4;"></div>
            </div>

            <div class="kicau-collage-text" style="display: flex; flex-direction: column; gap: 1.2rem; padding: 0.5rem 0; text-align: left;">
              <p class="eyebrow" style="color: var(--red); margin: 0; font-size: 0.72rem;">${safeCategoryEyebrow}</p>
              <h2 style="font-family: 'Fraunces', serif; font-size: 2rem; font-weight: 600; line-height: 1.1; margin: 0; color: var(--ink);">
                ${safeCategoryTitle}
              </h2>
              <p style="font-size: 0.95rem; line-height: 1.6; color: var(--ink-soft); text-align: justify; margin: 0;">
                ${safeCategoryDesc}
              </p>
              <div style="display: flex; flex-direction: column; gap: 1rem; border-left: 3px solid var(--red); padding-left: 1rem; margin-top: 0.5rem; width: 100%;">
                <div>
                  <h4 style="font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem; text-transform: uppercase; margin: 0 0 0.15rem; color: var(--ink);">Collage Style</h4>
                  <p style="margin: 0; font-size: 0.88rem; color: var(--ink-soft);">${safeStyleVal}</p>
                </div>
                <div>
                  <h4 style="font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem; text-transform: uppercase; margin: 0 0 0.15rem; color: var(--ink);">Concept</h4>
                  <p style="margin: 0; font-size: 0.88rem; color: var(--ink-soft);">${safeConceptVal}</p>
                </div>
              </div>
            </div>
          `;
        }
      }
    }

    target.innerHTML = tabsMarkup + videosMarkup;

    target.querySelectorAll(".filter-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCategory = btn.getAttribute("data-category");

        const newUrl = new URL(window.location.href);
        if (activeCategory === "All") {
          newUrl.searchParams.delete("category");
        } else {
          newUrl.searchParams.set("category", activeCategory);
        }
        window.history.pushState({}, "", newUrl);

        draw();
        bindReveal();
      });
    });
  }

  draw();
}

function renderMissingProject(state) {
  const target = document.querySelector("#project-page");
  if (!target) {
    return;
  }

  const isMissingSlug = state === "missing-slug";
  target.innerHTML = `
    <div class="project-nav reveal-target">
      <a class="back-link" href="${homePath}#work">Back to portfolio</a>
    </div>
    <section class="missing-state reveal-target">
      <p class="eyebrow">${isMissingSlug ? "No project selected" : "Project slug not found"}</p>
      <h1>${isMissingSlug ? "Open a project from the portfolio first." : "This project slug is not in the CMS content."}</h1>
      <p class="hero-text">${isMissingSlug ? "Use a project card from the homepage so the slug is passed in the URL." : "Check the slug in the URL or update the matching entry in the CMS content."}</p>
    </section>
  `;
}

async function init() {
  try {
    const projects = await loadProjects();

    if (page === "home") {
      renderHome(projects);
    }

    if (page === "project") {
      const slug = new URLSearchParams(window.location.search).get("slug");

      if (!slug) {
        renderMissingProject("missing-slug");
      } else {
        const project = projects.find((entry) => entry.slug === slug);
        if (project) {
          renderProject(project);
        } else {
          renderMissingProject("unknown-slug");
        }
      }
    }

    if (page === "videos") {
      renderVideoHub(projects);
    }

    if (page === "contact") {
      const contactForm = document.querySelector("#contact-form");
      const successBlock = document.querySelector("#contact-success");
      const resetBtn = document.querySelector("#btn-reset-form");

      if (contactForm && successBlock && resetBtn) {
        contactForm.addEventListener("submit", (e) => {
          e.preventDefault();
          contactForm.style.display = "none";
          successBlock.style.display = "block";
          contactForm.reset();
        });

        resetBtn.addEventListener("click", () => {
          successBlock.style.display = "none";
          contactForm.style.display = "block";
        });
      }
    }

    bindReveal();
  } catch (error) {
    console.error(error);
  }
}

init();
