# Photography Portfolio

A lightweight photography portfolio website built with Express.js, EJS templates, and Sharp for image processing. Runs in Docker with nginx reverse proxy, stores data on disk — no database required.

## Features

- **Albums** — Create albums with title, subtitle, description, and date
- **Photo Gallery** — Masonry-style layout handling portrait and landscape photos
- **Blur-up loading** — Tiny placeholders load instantly, then sharpen to full thumbnails
- **WebP images** — All uploads converted to WebP for smaller file sizes
- **Lightbox** — Full-screen photo viewer with keyboard navigation
- **Admin Panel** — Create/edit/delete albums, batch photo upload with drag-and-drop, photo reordering
- **Site Settings** — Customize site name, logo, theme (dark/light), typeface, heading alignment
- **Responsive** — Works on desktop and mobile

## SEO Suite

Built-in SEO features, all configurable via admin panel:

- **Meta descriptions** — Editable per-site and per-album (max 160 chars), auto-fills from subheading/description if left empty
- **Open Graph + Twitter Cards** — Social sharing previews with title, description, and image for every page
- **Canonical URLs** — Prevents duplicate content issues
- **Structured data (JSON-LD)** — Schema.org markup: Organization + WebPage on homepage, ImageGallery with ImageObject entries on album pages
- **robots.txt** — Dynamic, allows all crawlers, points to sitemap
- **sitemap.xml** — Dynamic, lists homepage + all album URLs with last-modified dates
- **Favicon** — Auto-generated from site logo (32px favicon + 180px Apple touch icon), or upload custom ones
- **HTTP compression** — gzip via nginx for all text/JSON/XML types
- **Cache headers** — 30 days for static assets, 7 days for uploads, no-cache for HTML
- **Security headers** — X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- **Font loading optimization** — Non-blocking Google Fonts preload pattern

## Admin Panel

Access at `http://localhost:3000/admin` (requires login).

### Albums
- **Create** new albums with title, subtitle, description, date, and meta description
- **Edit** album details
- **Delete** albums (removes associated photos)
- **Set title photo** — choose a cover image for the album

### Photo Management
- **Batch upload** — drag and drop multiple photos at once
- **Reorder** — use ▲/▼ buttons to control photo order
- **Delete** individual photos

### Site Settings
- Change the **site name**
- Upload/remove a **logo** image (auto-generates favicons)
- Toggle **dark/light theme**
- Choose **typeface** (system, Inter, Playfair Display, DM Sans, Space Grotesk, Lora, Montserrat, Merriweather, Roboto Slab, Work Sans)
- Set **heading text, subheading, and description** for the homepage
- Configure **heading alignment** (left, center, right)
- Edit **meta description** for SEO (max 160 chars)
- Upload custom **favicon** and **Apple touch icon** (or regenerate from logo)

### Migration Scripts

The app includes a built-in migration system for one-time data operations (e.g., backfilling image dimensions, adding new fields). Migrations are tracked in `data/migrations.json` and run automatically on first request if no admin has logged in yet.

**View and run migrations:**
1. Log in at `/admin`
2. Navigate to `/admin/migrations`
3. Click **Run** on any pending migration
4. Progress updates appear in real-time

**How it works:**
- Each migration has a unique ID, name, and description
- Completed migrations are recorded in `data/migrations.json` and never run again
- New migrations appear as pending until executed
- Migrations run sequentially with progress callbacks

---

## Prerequisites

- Docker + Docker Compose (v2+)
- Git

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/fr3qu3ncy/photography-portfolio.git
cd photography-portfolio
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and at minimum change the admin credentials:

```env
# Admin Authentication (CHANGE THESE)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme

# Site Settings
SITE_NAME=Lens
SITE_LOGO=

# Server
PORT=3000
HOST=0.0.0.0

# Production URL (for SEO: robots.txt, sitemap.xml, Open Graph)
SITE_URL=https://yourdomain.com
```

All `.env` options:

Variable | Default | Description
---|---|---
`ADMIN_USERNAME` | `admin` | Admin panel login username
`ADMIN_PASSWORD` | `changeme` | Admin panel login password
`SITE_NAME` | `Lens` | Display name shown in the site header
`SITE_LOGO` | *(empty)* | Filename of logo image (upload via admin settings)
`PORT` | `3000` | HTTP port the server listens on
`HOST` | `0.0.0.0` | Bind address
`SITE_URL` | `http://localhost:3000` | Production URL for SEO (robots.txt, sitemap, OG tags)
`MAX_FILE_SIZE` | `20971520` | Max upload size in bytes (20 MB)
`THUMB_WIDTH` | `600` | Thumbnail width in pixels
`FULL_WIDTH` | `1920` | Full-size resize width in pixels
`PLACEHOLDER_WIDTH` | `60` | Blur-up placeholder width in pixels

### 3. Build and start

```bash
sudo docker compose up -d --build
```

The site is available at `http://localhost:3000`. Log in at `/admin` with the credentials from `.env`.

---

## Architecture

- **Express.js** server-rendered (EJS templates), no SPA
- **nginx** reverse proxy on port 3000 → Express on port 3001 (handles gzip, cache headers, security headers, static file serving)
- **Sharp** for image resizing — WebP pipeline: placeholder (60px), thumbnail (600px), full (1920px). Original files NOT stored.
- **JSON file** (`data/site.json`) for all persistent data — no database

---

## Persistent Storage

The `docker-compose.yml` uses **bind mounts** — files are stored in directories alongside the repo:

Mount | Host Path | Container Path | Purpose
---|---|---|---
uploads | `./uploads/` | `/app/uploads` | Photo files (originals, thumbnails, full-size)
data | `./data/` | `/app/data` | Site metadata (`site.json`)

These directories are created automatically on first run. To back up your portfolio, copy `./uploads` and `./data`.

### Custom mount paths

To store data elsewhere, edit `docker-compose.yml`:

```yaml
volumes:
  - /srv/portfolio/uploads:/app/uploads
  - /srv/portfolio/data:/app/data
```

---

## Upgrading

### Pull latest changes and rebuild

```bash
cd photography-portfolio
git pull
sudo docker compose up -d --build
```

### Full reinstall (preserves data)

```bash
cd photography-portfolio
sudo docker compose down
git pull
sudo docker compose up -d --build
```

> **Note:** Your photos and album data are stored in `./uploads` and `./data` on the host filesystem — they survive container rebuilds and Docker image updates.

---

## Deployment

For production deployment, set up a GitHub Actions workflow that pulls the repo and runs `docker compose up -d --build` on your target VM.

Ensure the VM has:
- Docker + Docker Compose installed
- A `.env` file with production credentials
- `SITE_URL` set to your production domain (required for SEO features)
- `./uploads` and `./data` directories for persistent storage

---

## Tech Stack

- **Node.js 20** (Alpine)
- **Express.js** — HTTP server and routing
- **EJS** — server-side templating
- **Sharp** — image resizing and format conversion
- **multer** — file upload handling
- **nginx** — reverse proxy with gzip, caching, and security headers
- **Docker** — containerized deployment
