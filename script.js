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
    ".reveal-target, .gif-card, .video-card, .project-hero, .gallery-card, .project-copy, .project-nav, .about-me-content, .contact-form"
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

function youtubeEmbedUrl(idOrUrl) {
  if (!idOrUrl) {
    return "";
  }

  try {
    const url = new URL(idOrUrl);
    if (url.hostname.includes("youtu.be")) {
      return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`;
    }

    const paramsId = url.searchParams.get("v");
    if (paramsId) {
      return `https://www.youtube-nocookie.com/embed/${paramsId}`;
    }
  } catch {
    return `https://www.youtube-nocookie.com/embed/${idOrUrl}`;
  }

  return `https://www.youtube-nocookie.com/embed/${idOrUrl}`;
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
  const grid = document.querySelector("#project-grid");
  if (!grid) {
    return;
  }

  grid.innerHTML = projects
    .map(
      (project, index) => `
        <a class="gif-card ${index % 4 === 3 ? "accent-ink" : index % 4 === 2 ? "accent-olive" : index % 4 === 1 ? "accent-cream" : "accent-red"}" href="${buildProjectUrl(project.slug)}">
          <img src="${project.cover_gif}" alt="${project.title} animated preview" loading="lazy" />
        </a>
      `
    )
    .join("");
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
          .map(
            (item) => `
              <article class="gallery-card">
                <img src="${item.src}" alt="${item.alt || project.title}" loading="lazy" />
                ${item.caption ? `<p class="gallery-caption">${item.caption}</p>` : ""}
              </article>
            `
          )
          .join("")
      : `
        <article class="gallery-card">
          <img src="${project.cover_gif}" alt="${project.title} animated preview" loading="lazy" />
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

  target.innerHTML = projects
    .map(
      (project, index) => `
        <div class="video-card ${index % 3 === 2 ? "accent-ink" : index % 3 === 1 ? "accent-olive" : "accent-cream"}" id="${project.slug}">
          <iframe
            src="${youtubeEmbedUrl(project.youtube_url)}"
            title="${project.title}"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          ></iframe>
        </div>
      `
    )
    .join("");
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

    bindReveal();
  } catch (error) {
    console.error(error);
  }
}

init();
