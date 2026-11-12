require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs');
const db = require('./config/database');
const { requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true, limit: '30kb' }));
app.use(express.json({ limit: '30kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wanjala_solutions',
  createDatabaseTable: true
});

app.use(session({
  name: 'wanjala.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use((req, res, next) => {
  res.locals.business = {
    phone: process.env.BUSINESS_PHONE || '',
    email: process.env.BUSINESS_EMAIL || '',
    whatsapp: process.env.WHATSAPP_NUMBER || process.env.BUSINESS_PHONE || '',
    location: process.env.BUSINESS_LOCATION || 'Kenya'
  };
  res.locals.admin = req.session.admin || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Too many submissions. Please try again later.'
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const allowedMime = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMime.includes(file.mimetype)) return cb(new Error('Only JPG, PNG and WEBP images are allowed.'));
    cb(null, true);
  }
});

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function clean(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}
function whatsappLink(message = 'Hello Wanjala Solutions. I would like to enquire about your services.') {
  const number = (process.env.WHATSAPP_NUMBER || process.env.BUSINESS_PHONE || '').replace(/\D/g, '');
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : '#';
}
function getMailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}
async function notifyEnquiry(enquiry) {
  const mailer = getMailer();
  if (!mailer || !process.env.ENQUIRY_TO) return;
  await mailer.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: process.env.ENQUIRY_TO,
    replyTo: enquiry.email,
    subject: `New website enquiry: ${enquiry.subject}`,
    text: `Name: ${enquiry.full_name}\nEmail: ${enquiry.email}\nPhone: ${enquiry.phone || 'Not provided'}\nService: ${enquiry.service || 'General'}\n\n${enquiry.message}`
  });
}

app.get('/', async (_req, res, next) => {
  try {
    const [services] = await db.execute('SELECT * FROM services WHERE is_active=1 AND is_featured=1 ORDER BY id DESC LIMIT 6');
    const [projects] = await db.execute('SELECT * FROM portfolio ORDER BY created_at DESC LIMIT 3');
    res.render('home', { services, projects, whatsappLink });
  } catch (e) { next(e); }
});

app.get('/about', (_req, res) => res.render('about', { whatsappLink }));

app.get('/services', async (_req, res, next) => {
  try {
    const [services] = await db.execute('SELECT * FROM services WHERE is_active=1 ORDER BY category,title');
    res.render('services', { services, whatsappLink });
  } catch (e) { next(e); }
});

app.get('/services/:slug', async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT * FROM services WHERE slug=? AND is_active=1 LIMIT 1', [req.params.slug]);
    if (!rows.length) return res.status(404).render('404');
    res.render('service-details', { service: rows[0], whatsappLink });
  } catch (e) { next(e); }
});

app.get('/portfolio', async (_req, res, next) => {
  try {
    const [projects] = await db.execute('SELECT * FROM portfolio ORDER BY created_at DESC');
    res.render('portfolio', { projects, whatsappLink });
  } catch (e) { next(e); }
});

app.get('/contact', async (_req, res, next) => {
  try {
    const [services] = await db.execute('SELECT id,title FROM services WHERE is_active=1 ORDER BY title');
    res.render('contact', { whatsappLink, services });
  } catch (e) { next(e); }
});
app.get('/request', async (req, res, next) => {
  try {
    const [services] = await db.execute('SELECT id,title FROM services WHERE is_active=1 ORDER BY title');
    res.render('request', { services, whatsappLink, selectedService: req.query.service || '' });
  } catch (e) { next(e); }
});

app.post('/enquiries', enquiryLimiter, async (req, res, next) => {
  try {
    const full_name = clean(req.body.full_name, 120);
    const email = clean(req.body.email, 190).toLowerCase();
    const phone = clean(req.body.phone, 40);
    const subject = clean(req.body.subject, 180);
    const message = clean(req.body.message, 5000);
    const serviceId = req.body.service_id ? Number(req.body.service_id) : null;

    if (!full_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !subject || message.length < 10) {
      req.session.flash = { type: 'danger', message: 'Please provide a valid name, email, subject and a message of at least 10 characters.' };
      return res.redirect('/request');
    }
    if (serviceId && !Number.isInteger(serviceId)) {
      req.session.flash = { type: 'danger', message: 'Please select a valid service.' };
      return res.redirect('/request');
    }

    let service = null;
    if (serviceId) {
      const [found] = await db.execute('SELECT id,title FROM services WHERE id=? AND is_active=1', [serviceId]);
      if (!found.length) {
        req.session.flash = { type: 'danger', message: 'Selected service was not found.' };
        return res.redirect('/request');
      }
      service = found[0].title;
    }

    const [result] = await db.execute(
      'INSERT INTO enquiries (full_name,email,phone,service_id,subject,message) VALUES (?,?,?,?,?,?)',
      [full_name, email, phone || null, serviceId, subject, message]
    );
    try { await notifyEnquiry({ full_name, email, phone, service, subject, message }); }
    catch (mailError) { console.error('Enquiry email notification failed:', mailError.message); }

    req.session.flash = { type: 'success', message: `Thank you, ${full_name}. Your request (#${result.insertId}) has been received. We will get back to you.` };
    res.redirect('/request');
  } catch (e) { next(e); }
});

app.get('/admin/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login');
});
app.post('/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8 }), async (req, res, next) => {
  try {
    const email = clean(req.body.email, 190).toLowerCase();
    const password = String(req.body.password || '');
    const [rows] = await db.execute('SELECT * FROM admins WHERE email=? LIMIT 1', [email]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      req.session.flash = { type: 'danger', message: 'Invalid email or password.' };
      return res.redirect('/admin/login');
    }
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.admin = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
      res.redirect('/admin');
    });
  } catch (e) { next(e); }
});
app.post('/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin', requireAdmin, async (_req, res, next) => {
  try {
    const [[counts]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM enquiries) AS total_enquiries,
        (SELECT COUNT(*) FROM enquiries WHERE status='New') AS new_enquiries,
        (SELECT COUNT(*) FROM services WHERE is_active=1) AS active_services,
        (SELECT COUNT(*) FROM portfolio) AS projects
    `);
    const [recent] = await db.execute('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 8');
    res.render('admin/dashboard', { counts, recent });
  } catch (e) { next(e); }
});

app.get('/admin/enquiries', requireAdmin, async (_req, res, next) => {
  try {
    const [enquiries] = await db.execute(`
      SELECT e.*, s.title AS service_title FROM enquiries e
      LEFT JOIN services s ON e.service_id=s.id ORDER BY e.created_at DESC
    `);
    res.render('admin/enquiries', { enquiries });
  } catch (e) { next(e); }
});
app.post('/admin/enquiries/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['New', 'In Progress', 'Completed', 'Archived'];
    const status = clean(req.body.status, 30);
    if (!allowed.includes(status)) return res.status(400).send('Invalid status');
    await db.execute('UPDATE enquiries SET status=? WHERE id=?', [status, Number(req.params.id)]);
    res.redirect('/admin/enquiries');
  } catch (e) { next(e); }
});

app.get('/admin/services', requireAdmin, async (_req, res, next) => {
  try {
    const [services] = await db.execute('SELECT * FROM services ORDER BY created_at DESC');
    res.render('admin/services', { services });
  } catch (e) { next(e); }
});
app.post('/admin/services', requireAdmin, async (req, res, next) => {
  try {
    const title = clean(req.body.title, 160);
    const category = clean(req.body.category, 100);
    const short = clean(req.body.short_description, 255);
    const description = clean(req.body.description, 5000);
    const slug = slugify(title);
    if (!title || !category || !short || !description) {
      req.session.flash = { type: 'danger', message: 'Complete all service fields.' };
      return res.redirect('/admin/services');
    }
    await db.execute(
      'INSERT INTO services (title,slug,category,short_description,description,icon,is_featured) VALUES (?,?,?,?,?,?,?)',
      [title, slug, category, short, description, clean(req.body.icon, 80) || 'bi-stars', req.body.is_featured === '1' ? 1 : 0]
    );
    req.session.flash = { type: 'success', message: 'Service added.' };
    res.redirect('/admin/services');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      req.session.flash = { type: 'danger', message: 'A service with a similar name already exists.' };
      return res.redirect('/admin/services');
    }
    next(e);
  }
});
app.post('/admin/services/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    await db.execute('UPDATE services SET is_active=IF(is_active=1,0,1) WHERE id=?', [Number(req.params.id)]);
    res.redirect('/admin/services');
  } catch (e) { next(e); }
});

app.get('/admin/portfolio', requireAdmin, async (_req, res, next) => {
  try {
    const [projects] = await db.execute('SELECT * FROM portfolio ORDER BY created_at DESC');
    res.render('admin/portfolio', { projects });
  } catch (e) { next(e); }
});
app.post('/admin/portfolio', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    const title = clean(req.body.title, 160);
    const category = clean(req.body.category, 100);
    const description = clean(req.body.description, 3000);
    const projectUrl = clean(req.body.project_url, 500);
    if (!title || !category) {
      req.session.flash = { type: 'danger', message: 'Project title and category are required.' };
      return res.redirect('/admin/portfolio');
    }
    if (projectUrl && !/^https?:\/\//i.test(projectUrl)) {
      req.session.flash = { type: 'danger', message: 'Project URL must start with http:// or https://.' };
      return res.redirect('/admin/portfolio');
    }
    await db.execute(
      'INSERT INTO portfolio (title,category,description,image,project_url) VALUES (?,?,?,?,?)',
      [title, category, description, req.file ? `/uploads/${req.file.filename}` : null, projectUrl || null]
    );
    req.session.flash = { type: 'success', message: 'Portfolio project added.' };
    res.redirect('/admin/portfolio');
  } catch (e) { next(e); }
});
app.post('/admin/portfolio/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT image FROM portfolio WHERE id=?', [Number(req.params.id)]);
    await db.execute('DELETE FROM portfolio WHERE id=?', [Number(req.params.id)]);
    if (rows[0]?.image) {
      const localPath = path.join(__dirname, 'public', rows[0].image.replace(/^\//, ''));
      if (localPath.startsWith(uploadDir)) fs.unlink(localPath, () => { });
    }
    res.redirect('/admin/portfolio');
  } catch (e) { next(e); }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use((_req, res) => res.status(404).render('404'));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  const message = process.env.NODE_ENV === 'production'
    ? 'Something went wrong. Please try again.'
    : err.message;
  res.status(500).render('error', { message });
});

db.query('SELECT 1')
  .then(() => {
    app.listen(PORT, () => console.log(`Wanjala Solutions running at http://localhost:${PORT}`));
  })
  .catch(error => {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  });
