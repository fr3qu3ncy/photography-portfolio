# Photography Portfolio

A lightweight photography portfolio website built with Express.js, EJS templates, and Sharp for image processing.

## Features

- **Albums** — Create albums with title, subtitle, and date
- **Photo Gallery** — Masonry-style layout handling portrait and landscape photos
- **Lightbox** — Full-screen photo viewer with keyboard navigation
- **Admin Panel** — Create/edit/delete albums, batch photo upload with drag-and-drop
- **Site Settings** — Customize site name and logo
- **Image Processing** — Automatic thumbnail and full-size generation with Sharp
- **Dark Theme** — Designed to let photos stand out

## Quick Start

```bash
cp .env.example .env
# Edit .env with your admin credentials
docker compose up -d --build
```

Visit `http://localhost:3000` and log in at `/admin`.

## Storage

Photos and metadata are stored in Docker volumes:
- `uploads_data` — Photo files (originals, thumbnails, full-size)
- `data_data` — Album metadata (JSON)

Mount these volumes or bind-mount directories for persistent storage.

## Deployment

Push to `main` and a GitHub Actions workflow will deploy to your target VM.
