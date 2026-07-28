const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Config ──────────────────────────────────────────────
const CONFIG = {
  adminUser: process.env.ADMIN_USERNAME || 'admin',
  adminPass: process.env.ADMIN_PASSWORD || 'admin',
  siteName: process.env.SITE_NAME || 'Lens',
  uploadDir: process.env.UPLOAD_DIR || '/app/uploads',
  dataDir: process.env.DATA_DIR || '/app/data',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 20971520,
  thumbWidth: parseInt(process.env.THUMB_WIDTH) || 600,
  fullWidth: parseInt(process.env.FULL_WIDTH) || 1920,
};

// ── Ensure directories exist ───────────────────────────
for (const dir of [CONFIG.uploadDir, CONFIG.dataDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Data layer ─────────────────────────────────────────
const DATA_FILE = path.join(CONFIG.dataDir, 'site.json');

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  }
  const defaults = { siteName: CONFIG.siteName, theme: 'dark', typeface: 'system', heading: 'Albums', subheading: '', headingAlignment: 'center', albums: [] };
  saveData(defaults);
  return defaults;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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
// Public routes
app.get('/', (req, res) => {
  const data = loadData();
  const albums = (data.albums || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  res.render('index', {
    siteName: data.siteName,
    heading: data.heading || 'Albums',
    subheading: data.subheading || '',
    headingAlignment: data.headingAlignment || 'center',
    albums,
  });
});

app.get('/album/:id', (req, res) => {
  const data = loadData();
  const album = (data.albums || []).find(a => a.id === req.params.id);
  if (!album) return res.status(404).render('404', { siteName: data.siteName });

  const photos = album.photos || [];
  res.render('album', {
    siteName: data.siteName,
    album,
    photos,
    titlePhoto: photos.find(p => p.id === album.titlePhotoId),
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
    currentHeadingAlignment: data.headingAlignment || 'center',
    logo: data.logo,
    hasLogo: !!(data.logo && fs.existsSync(path.join(CONFIG.uploadDir, data.logo))),
  });
});

app.post('/admin/settings', requireAdmin, (req, res) => {
  const data = loadData();
  data.siteName = req.body.siteName || CONFIG.siteName;
  data.theme = req.body.theme || 'dark';
  data.typeface = req.body.typeface || 'system';
  data.heading = req.body.heading || 'Albums';
  data.subheading = req.body.subheading || '';
  data.headingAlignment = req.body.headingAlignment || 'center';
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

app.get('/admin/album/:id', requireAdmin, (req, res) => {
  const data = loadData();
  const album = (data.albums || []).find(a => a.id === req.params.id);
  if (!album) return res.status(404).send('Album not found');
  res.render('admin/album', { siteName: data.siteName, album });
});

app.post('/admin/album/create', requireAdmin, async (req, res) => {
  const data = loadData();
  const id = `album_${Date.now()}`;
  data.albums.push({
    id,
    title: req.body.title || 'Untitled',
    subtitle: req.body.subtitle || '',
    description: req.body.description || '',
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
    const origPath = path.join(CONFIG.uploadDir, photo.filename);
    const thumbPath = path.join(CONFIG.uploadDir, photo.thumbFilename);
    const fullPath = path.join(CONFIG.uploadDir, photo.fullFilename);
    for (const p of [origPath, thumbPath, fullPath]) {
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
      const ext = path.extname(file.filename);
      const thumbName = `${photoId}_thumb${ext}`;
      const fullName = `${photoId}_full${ext}`;

      // Generate thumbnail and full-size versions
      await sharp(file.path)
        .resize(CONFIG.thumbWidth, null, { fit: 'inside' })
        .toFile(path.join(CONFIG.uploadDir, thumbName));

      await sharp(file.path)
        .resize(CONFIG.fullWidth, null, { fit: 'inside' })
        .toFile(path.join(CONFIG.uploadDir, fullName));

      album.photos.push({
        id: photoId,
        filename: file.filename,
        thumbFilename: thumbName,
        fullFilename: fullName,
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

  for (const fname of [photo.filename, photo.thumbFilename, photo.fullFilename]) {
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

// ── Bulk photo delete ──────────────────────────────────
app.post('/admin/album/:albumId/photos/bulk-delete', requireAdmin, (req, res) => {
  const data = loadData();
  const album = data.albums.find(a => a.id === req.params.albumId);
  if (!album) return res.status(404).send('Album not found');

  const photoIds = req.body.photoIds || [];
  for (const photoId of photoIds) {
    const photo = album.photos.find(p => p.id === photoId);
    if (!photo) continue;
    for (const fname of [photo.filename, photo.thumbFilename, photo.fullFilename]) {
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

// ── Logo upload (special multer for single file) ──────
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONFIG.uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo_${Date.now()}${ext}`);
  },
});
const logoUpload = multer({ storage: logoStorage, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/admin/settings/logo', requireAdmin, logoUpload.single('logo'), (req, res) => {
  const data = loadData();
  // Remove old logo
  if (data.logo) {
    const oldPath = path.join(CONFIG.uploadDir, data.logo);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  data.logo = req.file ? req.file.filename : null;
  saveData(data);
  res.redirect('/admin/settings');
});

// ── 404 handler ────────────────────────────────────────
app.use((req, res) => {
  const data = loadData();
  res.status(404).render('404', { siteName: data.siteName });
});

// ── Start ──────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Portfolio running on http://0.0.0.0:${PORT}`);
});
