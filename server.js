const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Config ──────────────────────────────────────────────
const CONFIG = {
  adminUser: process.env.ADMIN_USERNAME || 'admin',
  adminPass: process.env.ADMIN_PASSWORD || 'admin',
  siteName: process.env.SITE_NAME || 'Lens',
  siteUrl: process.env.SITE_URL || 'http://localhost:3000',
  uploadDir: process.env.UPLOAD_DIR || '/app/uploads',
  dataDir: process.env.DATA_DIR || '/app/data',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 20971520,
  thumbWidth: parseInt(process.env.THUMB_WIDTH) || 600,
  fullWidth: parseInt(process.env.FULL_WIDTH) || 1920,
  placeholderWidth: parseInt(process.env.PLACEHOLDER_WIDTH) || 60,
};

// ── Ensure directories exist ───────────────────────────
for (const dir of [CONFIG.uploadDir, CONFIG.dataDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Data layer ─────────────────────────────────────────
const DATA_FILE = path.join(CONFIG.dataDir, 'site.json');

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    // Migrate: assign positions to photos missing them
    for (const album of data.albums || []) {
      if (!album.photos || !album.photos.length) continue;
      const hasPositions = album.photos.some(p => p.position !== undefined);
      if (!hasPositions) {
        album.photos.forEach((p, i) => { p.position = i; });
        saveData(data);
      }
    }
    return data;
  }
  const defaults = { siteName: CONFIG.siteName, theme: 'dark', typeface: 'system', heading: 'Albums', subheading: '', description: '', headingAlignment: 'center', metaDescription: '', faviconFilename: '', appleTouchIconFilename: '', albums: [] };
  saveData(defaults);
  return defaults;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Migration system ───────────────────────────────────
const MIGRATIONS_FILE = path.join(CONFIG.dataDir, 'migrations.json');

function loadMigrations() {
  if (fs.existsSync(MIGRATIONS_FILE)) {
    return JSON.parse(fs.readFileSync(MIGRATIONS_FILE, 'utf-8'));
  }
  const defaults = { completed: [] };
  saveMigrations(defaults);
  return defaults;
}

function saveMigrations(state) {
  fs.writeFileSync(MIGRATIONS_FILE, JSON.stringify(state, null, 2));
}

// Migration registry — add new migrations here
const MIGRATIONS = [
  {
    id: 'generate_webp_placeholders',
    name: 'Generate WebP placeholders',
    description: 'Create 60px placeholder thumbnails for existing photos that lack them (enables blur-up loading).',
    async run(progress) {
      const sharp = require('sharp');
      const data = loadData();
      let total = 0;
      let done = 0;

      // Count total photos needing placeholders
      for (const album of data.albums || []) {
        for (const photo of album.photos || []) {
          if (!photo.placeholderFilename) total++;
        }
      }

      if (total === 0) {
        progress({ message: 'No photos need placeholders', pct: 100 });
        return { ok: true, generated: 0 };
      }

      for (const album of data.albums || []) {
        for (const photo of album.photos || []) {
          if (photo.placeholderFilename) continue;

          const thumbPath = path.join(CONFIG.uploadDir, photo.thumbFilename);
          if (!fs.existsSync(thumbPath)) {
            done++;
            progress({ message: `Skipping ${photo.id} (thumb missing)`, pct: Math.round((done / total) * 100) });
            continue;
          }

          const placeholderName = `${photo.id}_placeholder.webp`;
          try {
            await sharp(thumbPath)
              .resize(CONFIG.placeholderWidth, null, { fit: 'inside' })
              .webp({ quality: 60 })
              .toFile(path.join(CONFIG.uploadDir, placeholderName));
            photo.placeholderFilename = placeholderName;
          } catch (err) {
            console.error(`Migration error for ${photo.id}:`, err.message);
          }

          done++;
          progress({ message: `Generated placeholder for ${photo.id}`, pct: Math.round((done / total) * 100) });
        }
      }

      saveData(data);
      return { ok: true, generated: done };
    },
  },
  {
    id: 'photo-dimensions',
    name: 'Photo Dimensions',
    description: 'Capture thumbnail width/height for all existing photos (CLS fix)',
    async run(progress) {
      const sharp = require('sharp');
      const data = loadData();
      let total = 0;
      let done = 0;
      for (const album of data.albums || []) {
        for (const photo of album.photos || []) {
          if (!photo.thumbWidth) total++;
        }
      }
      if (total === 0) {
        progress({ message: 'All photos have dimensions', pct: 100 });
        return { ok: true, updated: 0 };
      }
      for (const album of data.albums || []) {
        for (const photo of album.photos || []) {
          if (photo.thumbWidth) continue;
          const thumbPath = path.join(CONFIG.uploadDir, photo.thumbFilename);
          if (!fs.existsSync(thumbPath)) {
            done++;
            progress({ message: `Skipping ${photo.id} (thumb missing)`, pct: Math.round((done / total) * 100) });
            continue;
          }
          try {
            const meta = await sharp(thumbPath).metadata();
            photo.thumbWidth = meta.width;
            photo.thumbHeight = meta.height;
          } catch (err) {
            console.error(`Dimension read error for ${photo.id}:`, err.message);
          }
          done++;
          progress({ message: `Read dimensions for ${photo.id}`, pct: Math.round((done / total) * 100) });
        }
      }
      saveData(data);
      return { ok: true, updated: done };
    },
  },
];

function getPendingMigrations() {
  const state = loadMigrations();
  return MIGRATIONS.filter(m => !state.completed.includes(m.id));
}

// ── Middleware ─────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(CONFIG.uploadDir));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session for admin auth
app.use(session({
  secret: process.env.SESSION_SECRET || 'photography-portfolio-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
}));

// Make site config available in all templates
app.use((req, res, next) => {
  try {
    const data = loadData();
    res.locals.logo = data.logo || null;
    res.locals.theme = data.theme || 'dark';
    res.locals.typeface = data.typeface || 'system';
  } catch {
    res.locals.logo = null;
    res.locals.theme = 'dark';
    res.locals.typeface = 'system';
  }
  next();
});

// Rate limit for admin routes
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many attempts. Try again later.' },
});

// Auth middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

// ── Routes ─────────────────────────────────────────────
// robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${CONFIG.siteUrl}/sitemap.xml\n`);
});

// sitemap (XML)
app.get('/sitemap.xml', (req, res) => {
  const data = loadData();
  const albums = data.albums || [];
  const now = new Date().toISOString().split('T')[0];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${CONFIG.siteUrl}/</loc>\n    <lastmod>${now}</lastmod>\n    <priority>1.0</priority>\n  </url>\n`;
  for (const album of albums) {
    // Use actual file modification time for lastmod, fallback to album date
    const lastMod = album.date || now;
    xml += `  <url>\n    <loc>${CONFIG.siteUrl}/album/${album.id}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <priority>0.8</priority>\n  </url>\n`;
  }
  xml += `</urlset>`;
  res.type('application/xml').send(xml);
});

// Public routes
app.get('/', (req, res) => {
  const data = loadData();
  const albums = (data.albums || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  // Default meta description: use explicit field, fall back to subheading + description combined (truncated)
  let metaDesc = data.metaDescription || '';
  if (!metaDesc) {
    const parts = [data.subheading || '', data.description?.split('\n')[0]?.trim() || ''].filter(Boolean);
    metaDesc = parts.join(' ').trim().slice(0, 160);
  }
  // OG image: logo if available
  const ogImage = data.logo ? `${CONFIG.siteUrl}/uploads/${data.logo}` : '';
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  const baseUrl = `${protocol}://${host}`;
  res.render('index', {
    siteName: data.siteName,
    heading: data.heading || 'Albums',
    subheading: data.subheading || '',
    description: data.description || '',
    headingAlignment: data.headingAlignment || 'center',
    metaDescription: metaDesc,
    albums,
    ogImage,
    ogUrl: baseUrl,
    siteUrl: CONFIG.siteUrl,
    logo: data.logo,
    faviconFilename: data.faviconFilename || '',
    appleTouchIconFilename: data.appleTouchIconFilename || '',
  });
});

app.get('/album/:id', (req, res) => {
  const data = loadData();
  const album = (data.albums || []).find(a => a.id === req.params.id);
  if (!album) return res.status(404).render('404', { siteName: data.siteName });

  const photos = (album.photos || []).sort((a, b) => (a.position || 0) - (b.position || 0));
  // Default meta description: use explicit field, fall back to description + subtitle combined (truncated)
  let metaDesc = album.metaDescription || '';
  if (!metaDesc) {
    const parts = [album.description?.split('\n')[0]?.trim() || '', album.subtitle || ''].filter(Boolean);
    metaDesc = parts.join(' ').trim().slice(0, 160);
  }
  // OG image: title photo
  const titlePhoto = photos.find(p => p.id === album.titlePhotoId);
  const ogImage = titlePhoto ? `${CONFIG.siteUrl}/uploads/${titlePhoto.fullFilename}` : '';
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  const baseUrl = `${protocol}://${host}`;
  const ogUrl = `${baseUrl}/album/${album.id}`;

  res.render('album', {
    siteName: data.siteName,
    album,
    photos,
    metaDescription: metaDesc,
    titlePhoto: photos.find(p => p.id === album.titlePhotoId),
    ogImage,
    ogUrl,
    siteUrl: CONFIG.siteUrl,
    faviconFilename: data.faviconFilename || '',
    appleTouchIconFilename: data.appleTouchIconFilename || '',
  });
});

// ── Admin routes ───────────────────────────────────────
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

app.post('/admin/login', adminLimiter, (req, res) => {
  const { username, password } = req.body;
  if (username === CONFIG.adminUser && password === CONFIG.adminPass) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Invalid credentials' });
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

app.get('/admin', requireAdmin, (req, res) => {
  const data = loadData();
  res.render('admin/index', { siteName: data.siteName, albums: data.albums || [] });
});

app.get('/admin/settings', requireAdmin, (req, res) => {
  const data = loadData();
  res.render('admin/settings', {
    siteName: data.siteName,
    currentName: data.siteName || CONFIG.siteName,
    currentTheme: data.theme || 'dark',
    currentTypeface: data.typeface || 'system',
    currentHeading: data.heading || 'Albums',
    currentSubheading: data.subheading || '',
    currentDescription: data.description || '',
    currentHeadingAlignment: data.headingAlignment || 'center',
    currentMetaDescription: (() => { const p = [data.subheading || '', data.description?.split('\n')[0]?.trim() || ''].filter(Boolean); return p.join(' ').trim().slice(0, 160); })(),
    logo: data.logo,
    hasLogo: !!(data.logo && fs.existsSync(path.join(CONFIG.uploadDir, data.logo))),
    faviconFilename: data.faviconFilename || '',
    appleTouchIconFilename: data.appleTouchIconFilename || '',
    hasFavicon: !!(data.faviconFilename && fs.existsSync(path.join(CONFIG.uploadDir, data.faviconFilename))),
    hasAppleTouch: !!(data.appleTouchIconFilename && fs.existsSync(path.join(CONFIG.uploadDir, data.appleTouchIconFilename))),
  });
});

app.post('/admin/settings', requireAdmin, (req, res) => {
  const data = loadData();
  data.siteName = req.body.siteName || CONFIG.siteName;
  data.theme = req.body.theme || 'dark';
  data.typeface = req.body.typeface || 'system';
  data.heading = req.body.heading || 'Albums';
  data.subheading = req.body.subheading || '';
  data.description = req.body.description || '';
  data.headingAlignment = req.body.headingAlignment || 'center';
  data.metaDescription = req.body.metaDescription || '';
  if (req.body.removeLogo === 'true') {
    if (data.logo) {
      const logoPath = path.join(CONFIG.uploadDir, data.logo);
      if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
      data.logo = null;
    }
  }
  saveData(data);
  res.redirect('/admin/settings');
});

// ── Migrations ──────────────────────────────────────────
app.get('/admin/migrations', requireAdmin, (req, res) => {
  const state = loadMigrations();
  const data = loadData();
  const all = MIGRATIONS.map(m => ({
    ...m,
    completed: state.completed.includes(m.id),
  }));
  res.render('admin/migrations', { siteName: data.siteName, migrations: all });
});

app.post('/admin/migrations/:id/run', requireAdmin, async (req, res) => {
  const migration = MIGRATIONS.find(m => m.id === req.params.id);
  if (!migration) return res.status(404).send('Migration not found');

  const state = loadMigrations();
  if (state.completed.includes(migration.id)) {
    return res.status(400).send('Migration already completed');
  }

  try {
    const result = await migration.run((msg) => {
      console.log(`[migration:${migration.id}]`, msg.message);
    });
    state.completed.push(migration.id);
    saveMigrations(state);
    res.redirect('/admin/migrations');
  } catch (err) {
    console.error(`[migration:${migration.id}] FAILED:`, err);
    res.status(500).send(`Migration failed: ${err.message}`);
  }
});

app.get('/admin/album/:id', requireAdmin, (req, res) => {
  const data = loadData();
  const album = (data.albums || []).find(a => a.id === req.params.id);
  if (!album) return res.status(404).send('Album not found');
  res.render('admin/album', { siteName: data.siteName, album, albumMetaDescription: (() => { const p = [album.description?.split('\n')[0]?.trim() || '', album.subtitle || ''].filter(Boolean); return p.join(' ').trim().slice(0, 160); })() });
});

app.post('/admin/album/create', requireAdmin, async (req, res) => {
  const data = loadData();
  const id = `album_${Date.now()}`;
  data.albums.push({
    id,
    title: req.body.title || 'Untitled',
    subtitle: req.body.subtitle || '',
    description: req.body.description || '',
    metaDescription: req.body.metaDescription || '',
    date: req.body.date || new Date().toISOString().split('T')[0],
    photos: [],
    titlePhotoId: null,
  });
  saveData(data);
  res.redirect(`/admin/album/${id}`);
});

app.post('/admin/album/:id/update', requireAdmin, (req, res) => {
  const data = loadData();
  const album = data.albums.find(a => a.id === req.params.id);
  if (!album) return res.status(404).send('Album not found');
  album.title = req.body.title;
  album.subtitle = req.body.subtitle || '';
  album.description = req.body.description || '';
  album.metaDescription = req.body.metaDescription || '';
  album.date = req.body.date;
  if (req.body.titlePhotoId) album.titlePhotoId = req.body.titlePhotoId;
  saveData(data);
  res.redirect(`/admin/album/${req.params.id}`);
});

app.post('/admin/album/:id/delete', requireAdmin, (req, res) => {
  const data = loadData();
  const album = data.albums.find(a => a.id === req.params.id);
  if (!album) return res.status(404).send('Album not found');

  // Delete photos
  for (const photo of album.photos || []) {
    for (const fname of [photo.filename, photo.thumbFilename, photo.fullFilename, photo.placeholderFilename]) {
      if (!fname) continue;
      const p = path.join(CONFIG.uploadDir, fname);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }
  data.albums = data.albums.filter(a => a.id !== req.params.id);
  saveData(data);
  res.redirect('/admin');
});

// ── Photo upload routes ────────────────────────────────
const sharp = require('sharp');
const multer = require('multer');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONFIG.uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: CONFIG.maxFileSize },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

app.post('/admin/album/:id/photos', requireAdmin, upload.array('photos', 50), async (req, res) => {
  try {
    const data = loadData();
    const album = data.albums.find(a => a.id === req.params.id);
    if (!album) return res.status(404).send('Album not found');

    if (!album.photos) album.photos = [];

    for (const file of req.files) {
      const photoId = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const webpExt = '.webp';
      const thumbName = `${photoId}_thumb${webpExt}`;
      const fullName = `${photoId}_full${webpExt}`;
      const placeholderName = `${photoId}_placeholder${webpExt}`;

      // Generate placeholder (tiny, for blur-up effect)
      await sharp(file.path)
        .resize(CONFIG.placeholderWidth, null, { fit: 'inside' })
        .webp({ quality: 60 })
        .toFile(path.join(CONFIG.uploadDir, placeholderName));

      // Generate thumbnail — capture dimensions for CLS prevention
      const thumbMeta = await sharp(file.path)
        .resize(CONFIG.thumbWidth, null, { fit: 'inside' })
        .webp({ quality: 80 })
        .toFile(path.join(CONFIG.uploadDir, thumbName));

      // Generate full-size
      await sharp(file.path)
        .resize(CONFIG.fullWidth, null, { fit: 'inside' })
        .webp({ quality: 85 })
        .toFile(path.join(CONFIG.uploadDir, fullName));

      // Delete original upload (we only need WebP versions)
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

      album.photos.push({
        id: photoId,
        filename: file.filename,
        thumbFilename: thumbName,
        fullFilename: fullName,
        placeholderFilename: placeholderName,
        thumbWidth: thumbMeta.width,
        thumbHeight: thumbMeta.height,
        position: album.photos.length,
      });
    }

    // Set first uploaded photo as title photo if none set
    if (!album.titlePhotoId && album.photos.length > 0) {
      album.titlePhotoId = album.photos[0].id;
    }

    saveData(data);
    res.redirect(`/admin/album/${req.params.id}`);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).send('Upload failed');
  }
});

app.post('/admin/album/:albumId/photo/:photoId/delete', requireAdmin, (req, res) => {
  const data = loadData();
  const album = data.albums.find(a => a.id === req.params.albumId);
  if (!album) return res.status(404).send('Album not found');

  const photo = album.photos.find(p => p.id === req.params.photoId);
  if (!photo) return res.status(404).send('Photo not found');

  for (const fname of [photo.filename, photo.thumbFilename, photo.fullFilename, photo.placeholderFilename]) {
    if (!fname) continue;
    const p = path.join(CONFIG.uploadDir, fname);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  album.photos = album.photos.filter(p => p.id !== req.params.photoId);
  if (album.titlePhotoId === req.params.photoId) {
    album.titlePhotoId = album.photos.length ? album.photos[0].id : null;
  }
  saveData(data);
  res.redirect(`/admin/album/${req.params.albumId}`);
});

app.post('/admin/album/:albumId/photo/:photoId/title', requireAdmin, (req, res) => {
  const data = loadData();
  const album = data.albums.find(a => a.id === req.params.albumId);
  if (!album) return res.status(404).send('Album not found');
  album.titlePhotoId = req.params.photoId;
  saveData(data);
  res.redirect(`/admin/album/${req.params.albumId}`);
});

// ── Photo reorder ──────────────────────────────────────
app.post('/admin/album/:albumId/photo/reorder', requireAdmin, (req, res) => {
  const data = loadData();
  const album = data.albums.find(a => a.id === req.params.albumId);
  if (!album) return res.status(404).send('Album not found');

  const photoId = req.body.photoId;
  const direction = req.body.direction; // 'up' or 'down'

  // Sort by position to find current order
  const sorted = [...album.photos].sort((a, b) => (a.position || 0) - (b.position || 0));
  const idx = sorted.findIndex(p => p.id === photoId);
  if (idx === -1) return res.status(404).send('Photo not found');

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return res.redirect(`/admin/album/${req.params.albumId}`);

  // Swap positions
  const temp = sorted[idx].position;
  sorted[idx].position = sorted[swapIdx].position;
  sorted[swapIdx].position = temp;

  // Rebuild photos array with swapped positions
  const posMap = new Map(sorted.map(p => [p.id, p.position]));
  album.photos.forEach(p => { p.position = posMap.get(p.id) ?? p.position; });

  saveData(data);
  res.redirect(`/admin/album/${req.params.albumId}`);
});

// ── Bulk photo delete ──────────────────────────────────
app.post('/admin/album/:albumId/photos/bulk-delete', requireAdmin, (req, res) => {
  const data = loadData();
  const album = data.albums.find(a => a.id === req.params.albumId);
  if (!album) return res.status(404).send('Album not found');

  const photoIds = req.body.photoIds || [];
  for (const photoId of photoIds) {
    const photo = album.photos.find(p => p.id === photoId);
    if (!photo) continue;
    for (const fname of [photo.filename, photo.thumbFilename, photo.fullFilename, photo.placeholderFilename]) {
      if (!fname) continue;
      const p = path.join(CONFIG.uploadDir, fname);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }
  album.photos = album.photos.filter(p => !photoIds.includes(p.id));
  if (!album.photos.find(p => p.id === album.titlePhotoId)) {
    album.titlePhotoId = album.photos.length ? album.photos[0].id : null;
  }
  saveData(data);
  res.redirect(`/admin/album/${req.params.albumId}`);
});

// ── Favicon generation from logo ──────────────────────
async function generateFaviconsFromLogo(logoPath) {
  try {
    const sharp = require('sharp');
    // Remove old auto-generated favicons
    for (const name of ['favicon_32.png', 'favicon_180.png']) {
      const old = path.join(CONFIG.uploadDir, name);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    await sharp(logoPath)
      .resize(32, 32, { fit: 'cover', position: 'center' })
      .png()
      .toFile(path.join(CONFIG.uploadDir, 'favicon_32.png'));
    await sharp(logoPath)
      .resize(180, 180, { fit: 'cover', position: 'center' })
      .png()
      .toFile(path.join(CONFIG.uploadDir, 'favicon_180.png'));
    return { favicon: 'favicon_32.png', appleTouch: 'favicon_180.png' };
  } catch (err) {
    console.error('Favicon generation failed:', err.message);
    return null;
  }
}

// ── Logo upload (special multer for single file) ──────
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONFIG.uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo_${Date.now()}${ext}`);
  },
});
const logoUpload = multer({ storage: logoStorage, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/admin/settings/logo', requireAdmin, logoUpload.single('logo'), async (req, res) => {
  const data = loadData();
  // Remove old logo
  if (data.logo) {
    const oldPath = path.join(CONFIG.uploadDir, data.logo);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  data.logo = req.file ? req.file.filename : null;
  // Auto-generate favicons from new logo
  if (data.logo) {
    const logoPath = path.join(CONFIG.uploadDir, data.logo);
    const favicons = await generateFaviconsFromLogo(logoPath);
    if (favicons) {
      // Only auto-set if no custom override exists
      if (!data.faviconFilename || !data.faviconFilename.includes('custom')) {
        data.faviconFilename = favicons.favicon;
      }
      if (!data.appleTouchIconFilename || !data.appleTouchIconFilename.includes('custom')) {
        data.appleTouchIconFilename = favicons.appleTouch;
      }
    }
  } else {
    data.faviconFilename = '';
    data.appleTouchIconFilename = '';
  }
  saveData(data);
  res.redirect('/admin/settings');
});

// ── Favicon custom upload ─────────────────────────────
const faviconStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONFIG.uploadDir),
  filename: (req, file, cb) => cb(null, `favicon_custom_${Date.now()}.png`),
});
const faviconUpload = multer({
  storage: faviconStorage,
  limits: { fileSize: 512 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

app.post('/admin/settings/favicon', requireAdmin, faviconUpload.single('favicon'), async (req, res) => {
  const data = loadData();
  if (req.file) {
    const sharp = require('sharp');
    const outName = `favicon_custom_${Date.now()}.png`;
    await sharp(req.file.path)
      .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(CONFIG.uploadDir, outName));
    fs.unlinkSync(req.file.path);
    // Remove old auto-generated favicon
    if (data.faviconFilename && !data.faviconFilename.includes('custom')) {
      const old = path.join(CONFIG.uploadDir, data.faviconFilename);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    data.faviconFilename = outName;
  }
  saveData(data);
  res.redirect('/admin/settings');
});

app.post('/admin/settings/apple-touch-icon', requireAdmin, faviconUpload.single('appleTouchIcon'), async (req, res) => {
  const data = loadData();
  if (req.file) {
    const sharp = require('sharp');
    const outName = `apple_touch_custom_${Date.now()}.png`;
    await sharp(req.file.path)
      .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(CONFIG.uploadDir, outName));
    fs.unlinkSync(req.file.path);
    if (data.appleTouchIconFilename && !data.appleTouchIconFilename.includes('custom')) {
      const old = path.join(CONFIG.uploadDir, data.appleTouchIconFilename);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    data.appleTouchIconFilename = outName;
  }
  saveData(data);
  res.redirect('/admin/settings');
});

// Regenerate favicons from current logo (clears custom overrides)
app.post('/admin/settings/regenerate-favicons', requireAdmin, async (req, res) => {
  const data = loadData();
  if (data.logo) {
    const logoPath = path.join(CONFIG.uploadDir, data.logo);
    if (fs.existsSync(logoPath)) {
      for (const field of ['faviconFilename', 'appleTouchIconFilename']) {
        const old = data[field];
        if (old && old.includes('custom')) {
          const oldPath = path.join(CONFIG.uploadDir, old);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }
      const favicons = await generateFaviconsFromLogo(logoPath);
      if (favicons) {
        data.faviconFilename = favicons.favicon;
        data.appleTouchIconFilename = favicons.appleTouch;
      }
    }
  }
  saveData(data);
  res.redirect('/admin/settings');
});

// Remove favicons
app.post('/admin/settings/remove-favicons', requireAdmin, (req, res) => {
  const data = loadData();
  for (const field of ['faviconFilename', 'appleTouchIconFilename']) {
    const old = data[field];
    if (old) {
      const oldPath = path.join(CONFIG.uploadDir, old);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      data[field] = '';
    }
  }
  saveData(data);
  res.redirect('/admin/settings');
});

// ── SEO routes ──────────────────────────────────────────
// robots.txt and sitemap are defined above with CONFIG.siteUrl

// ── 404 handler ────────────────────────────────────────
app.use((req, res) => {
  const data = loadData();
  res.status(404).render('404', { siteName: data.siteName });
});

// ── Start ──────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Portfolio running on http://0.0.0.0:${PORT}`);
  const pending = getPendingMigrations();
  if (pending.length) {
    console.log(`\n⚠  ${pending.length} pending migration(s):`);
    pending.forEach(m => console.log(`   • ${m.id} — ${m.description}`));
    console.log('  Visit /admin/migrations to run them.\n');
  }
  // Auto-generate favicons from logo if missing
  try {
    const data = loadData();
    if (data.logo && !data.faviconFilename) {
      const logoPath = path.join(CONFIG.uploadDir, data.logo);
      if (fs.existsSync(logoPath)) {
        const favicons = await generateFaviconsFromLogo(logoPath);
        if (favicons) {
          data.faviconFilename = favicons.favicon;
          data.appleTouchIconFilename = favicons.appleTouch;
          saveData(data);
          console.log('Auto-generated favicons from logo.');
        }
      }
    }
  } catch (err) {
    console.error('Startup favicon generation failed:', err.message);
  }
});
