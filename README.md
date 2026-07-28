# Photography Portfolio

A lightweight photography portfolio website built with Express.js, EJS templates, and Sharp for image processing. Runs in Docker, stores data on disk — no database required.

## Features

- **Albums** — Create albums with title, subtitle, description, and date
- **Photo Gallery** — Masonry-style layout handling portrait and landscape photos
- **Lightbox** — Full-screen photo viewer with keyboard navigation
- **Admin Panel** — Create/edit/delete albums, batch photo upload with drag-and-drop, photo reordering
- **Site Settings** — Customize site name, logo, and theme (dark/light)
- **Image Processing** — Automatic thumbnail and full-size generation with Sharp
- **Responsive** — Works on desktop and mobile

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
```

All `.env` options:

| Variable | Default | Description |
|---|---|---|
| `ADMIN_USERNAME` | `admin` | Admin panel login username |
| `ADMIN_PASSWORD` | `changeme` | Admin panel login password |
| `SITE_NAME` | `Lens` | Display name shown in the site header |
| `SITE_LOGO` | *(empty)* | Filename of logo image (upload via admin settings) |
| `PORT` | `3000` | HTTP port the server listens on |
| `HOST` | `0.0.0.0` | Bind address |
| `MAX_FILE_SIZE` | `20971520` | Max upload size in bytes (20 MB) |
| `THUMB_WIDTH` | `600` | Thumbnail width in pixels |
| `FULL_WIDTH` | `1920` | Full-size resize width in pixels |

### 3. Build and start

```bash
sudo docker compose up -d --build
```

The site is available at `http://localhost:3000`. Log in at `/admin` with the credentials from `.env`.

---

## Persistent Storage

The `docker-compose.yml` uses **bind mounts** — files are stored in directories alongside the repo:

| Mount | Host Path | Container Path | Purpose |
|---|---|---|---|
| uploads | `./uploads/` | `/app/uploads` | Photo files (originals, thumbnails, full-size) |
| data | `./data/` | `/app/data` | Album metadata (`albums.json`) |

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

## Admin Panel

Access at `http://localhost:3000/admin` (requires login).

### Albums
- **Create** new albums with title, subtitle, description, and date
- **Edit** album details
- **Delete** albums (removes associated photos)
- **Set title photo** — choose a cover image for the album

### Photo Management
- **Batch upload** — drag and drop multiple photos at once
- **Reorder** — use ▲/▼ buttons to control photo order
- **Delete** individual photos

### Site Settings
- Change the **site name**
- Upload/remove a **logo** image
- Toggle **dark/light theme**

---

## Deployment

For production deployment, set up a GitHub Actions workflow that pulls the repo and runs `docker compose up -d --build` on your target VM.

Ensure the VM has:
- Docker + Docker Compose installed
- A `.env` file with production credentials
- `./uploads` and `./data` directories for persistent storage

---

## Tech Stack

- **Node.js 20** (Alpine)
- **Express.js** — HTTP server and routing
- **EJS** — server-side templating
- **Sharp** — image resizing and format conversion
- **multer** — file upload handling
- **Docker** — containerized deployment
