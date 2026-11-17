
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
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

const db = require('./config/database');
const { requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

const isProduction =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.VERCEL);

// --------------------------------------------------
// DATABASE SSL CONFIGURATION
// --------------------------------------------------

const dbHost = process.env.DB_HOST || 'localhost';

const dbSSL =
  isProduction ||
  process.env.DB_ENABLE_SSL === 'true' ||
  !['localhost', '127.0.0.1'].includes(dbHost)
    ? { minVersion: 'TLSv1.2' }
    : undefined;

// --------------------------------------------------
// SESSION SECURITY
// --------------------------------------------------

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error(
    'SESSION_SECRET must be configured in production.'
  );
}

const sessionSecret =
  process.env.SESSION_SECRET ||
  'development-only-change-this-secret';

// Cloudinary provides durable image storage for Vercel.
// Local development continues to use public/uploads.
const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

// --------------------------------------------------
// UPLOAD DIRECTORY
// --------------------------------------------------

const uploadDir = path.join(__dirname, 'public', 'uploads');

// Only local development writes uploads to the project filesystem.
// Vercel uploads are held in memory and transferred to Cloudinary.
if (!isProduction) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// --------------------------------------------------
// APP CONFIGURATION
// --------------------------------------------------

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

const businessInfo = {
  phone: process.env.BUSINESS_PHONE || '',
  email: process.env.BUSINESS_EMAIL || '',
  whatsapp:
    process.env.WHATSAPP_NUMBER ||
    process.env.BUSINESS_PHONE ||
    '',
  location: process.env.BUSINESS_LOCATION || 'Kenya'
};

// Make business available even when an earlier
// middleware fails.
app.locals.business = businessInfo;

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.urlencoded({
  extended: true,
  limit: '30kb'
}));

app.use(express.json({
  limit: '30kb'
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/uploads', express.static(uploadDir));

// --------------------------------------------------
// DATABASE SESSION STORE
// --------------------------------------------------

// IMPORTANT:
// Reuse the existing database pool from
// config/database.js.
//
// This ensures the session store uses the same
// TiDB TLS configuration as the main application.

const sessionStore = new MySQLStore(
  {
    createDatabaseTable: true,
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 1000 * 60 * 60 * 8
  },
  db
);

app.use(session({
  name: 'wanjala.sid',
  secret: sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8
  }
}));

// --------------------------------------------------
// GLOBAL TEMPLATE VARIABLES
// --------------------------------------------------

app.use((req, res, next) => {
  res.locals.business = businessInfo;
  res.locals.admin = req.session.admin || null;
  res.locals.flash = req.session.flash || null;

  delete req.session.flash;

  next();
});

// --------------------------------------------------
// RATE LIMITING
// --------------------------------------------------

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Too many submissions. Please try again later.'
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again later.'
});

// --------------------------------------------------
// IMAGE UPLOAD CONFIGURATION
// --------------------------------------------------

const allowedMime = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

const localDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },

  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename =
      `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, filename);
  }
});

// Vercel's filesystem is ephemeral. Never save production uploads there.
const portfolioStorage = isProduction
  ? multer.memoryStorage()
  : localDiskStorage;

const upload = multer({
  storage: portfolioStorage,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMime.includes(file.mimetype)) {
      return cb(
        new Error('Only JPG, PNG and WEBP images are allowed.')
      );
    }

    cb(null, true);
  }
});

// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function clean(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function whatsappLink(
  message = 'Hello Wanjala Solutions. I would like to enquire about your services.'
) {
  const number = (
    process.env.WHATSAPP_NUMBER ||
    process.env.BUSINESS_PHONE ||
    ''
  ).replace(/\D/g, '');

  return number
    ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
    : '#';
}

function getMailer() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function notifyEnquiry(enquiry) {
  const mailer = getMailer();

  if (!mailer || !process.env.ENQUIRY_TO) {
    return;
  }

  await mailer.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: process.env.ENQUIRY_TO,
    replyTo: enquiry.email,
    subject: `New website enquiry: ${enquiry.subject}`,
    text: `
Name: ${enquiry.full_name}
Email: ${enquiry.email}
Phone: ${enquiry.phone || 'Not provided'}
Service: ${enquiry.service || 'General'}

${enquiry.message}
`
  });
}

async function savePortfolioImage(file) {
  if (!file) return null;

  if (isProduction) {
    if (!cloudinaryConfigured) {
      const error = new Error(
        'Portfolio image storage is not configured. Add the Cloudinary environment variables in Vercel.'
      );
      error.code = 'CLOUDINARY_NOT_CONFIGURED';
      throw error;
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'wanjala-solutions/portfolio',
          resource_type: 'image',
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          unique_filename: true,
          overwrite: false
        },
        (error, uploaded) => {
          if (error) return reject(error);
          resolve(uploaded);
        }
      );

      stream.end(file.buffer);
    });

    return result.secure_url;
  }

  return `/uploads/${file.filename}`;
}

async function deleteUploadedImage(imageUrl) {
  if (!imageUrl) return;

  // Delete local development uploads safely.
  if (imageUrl.startsWith('/uploads/')) {
    const filename = path.basename(imageUrl);
    const filePath = path.resolve(uploadDir, filename);
    const allowedDirectory = path.resolve(uploadDir) + path.sep;

    if (!filePath.startsWith(allowedDirectory)) return;

    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Local image deletion failed:', error.message);
      }
    }
    return;
  }

  // Delete only assets hosted in this app's configured Cloudinary account.
  if (!cloudinaryConfigured) return;

  try {
    const parsed = new URL(imageUrl);
    const expectedHost = 'res.cloudinary.com';
    const expectedPrefix = `/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`;

    if (parsed.hostname !== expectedHost || !parsed.pathname.startsWith(expectedPrefix)) {
      return;
    }

    let publicId = parsed.pathname.slice(expectedPrefix.length);
    publicId = publicId.split('/').filter(Boolean).filter(part => !/^v\\d+$/.test(part)).join('/');
    publicId = publicId.replace(/\\.(jpe?g|png|webp)$/i, '');

    if (publicId) {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        invalidate: true
      });
    }
  } catch (error) {
    console.error('Cloudinary image deletion failed:', error.message);
  }
}

// --------------------------------------------------
// PUBLIC WEBSITE ROUTES
// --------------------------------------------------

app.get('/', async (_req, res, next) => {
  try {
    const [services] = await db.execute(`
      SELECT *
      FROM services
      WHERE is_active = 1 AND is_featured = 1
      ORDER BY id DESC
      LIMIT 6
    `);

    const [projects] = await db.execute(`
      SELECT *
      FROM portfolio
      ORDER BY created_at DESC
      LIMIT 3
    `);

    res.render('home', {
      services,
      projects,
      whatsappLink
    });
  } catch (e) {
    next(e);
  }
});

app.get('/about', (_req, res) => {
  res.render('about', { whatsappLink });
});

app.get('/services', async (_req, res, next) => {
  try {
    const [services] = await db.execute(`
      SELECT *
      FROM services
      WHERE is_active = 1
      ORDER BY category, title
    `);

    res.render('services', {
      services,
      whatsappLink
    });
  } catch (e) {
    next(e);
  }
});

app.get('/services/:slug', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT *
       FROM services
       WHERE slug = ? AND is_active = 1
       LIMIT 1`,
      [req.params.slug]
    );

    if (!rows.length) {
      return res.status(404).render('404');
    }

    res.render('service-details', {
      service: rows[0],
      whatsappLink
    });
  } catch (e) {
    next(e);
  }
});

app.get('/portfolio', async (_req, res, next) => {
  try {
    const [projects] = await db.execute(`
      SELECT *
      FROM portfolio
      ORDER BY created_at DESC
    `);

    res.render('portfolio', {
      projects,
      whatsappLink
    });
  } catch (e) {
    next(e);
  }
});

app.get('/contact', async (_req, res, next) => {
  try {
    const [services] = await db.execute(`
      SELECT id, title
      FROM services
      WHERE is_active = 1
      ORDER BY title
    `);

    res.render('contact', {
      whatsappLink,
      services
    });
  } catch (e) {
    next(e);
  }
});

app.get('/request', async (req, res, next) => {
  try {
    const [services] = await db.execute(`
      SELECT id, title
      FROM services
      WHERE is_active = 1
      ORDER BY title
    `);

    res.render('request', {
      services,
      whatsappLink,
      selectedService: req.query.service || ''
    });
  } catch (e) {
    next(e);
  }
});

// --------------------------------------------------
// ENQUIRY SUBMISSION
// --------------------------------------------------

app.post('/enquiries', enquiryLimiter, async (req, res, next) => {
  try {
    const full_name = clean(req.body.full_name, 120);
    const email = clean(req.body.email, 190).toLowerCase();
    const phone = clean(req.body.phone, 40);
    const subject = clean(req.body.subject, 180);
    const message = clean(req.body.message, 5000);

    const serviceId = req.body.service_id
      ? Number(req.body.service_id)
      : null;

    if (
      !full_name ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !subject ||
      message.length < 10
    ) {
      req.session.flash = {
        type: 'danger',
        message:
          'Please provide a valid name, email, subject and a message of at least 10 characters.'
      };

      return res.redirect('/request');
    }

    if (
      serviceId !== null &&
      (!Number.isInteger(serviceId) || serviceId <= 0)
    ) {
      req.session.flash = {
        type: 'danger',
        message: 'Please select a valid service.'
      };

      return res.redirect('/request');
    }

    let service = null;

    if (serviceId) {
      const [found] = await db.execute(
        `SELECT id, title
         FROM services
         WHERE id = ? AND is_active = 1`,
        [serviceId]
      );

      if (!found.length) {
        req.session.flash = {
          type: 'danger',
          message: 'Selected service was not found.'
        };

        return res.redirect('/request');
      }

      service = found[0].title;
    }

    const [result] = await db.execute(
      `INSERT INTO enquiries
       (full_name, email, phone, service_id, subject, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        full_name,
        email,
        phone || null,
        serviceId,
        subject,
        message
      ]
    );

    try {
      await notifyEnquiry({
        full_name,
        email,
        phone,
        service,
        subject,
        message
      });
    } catch (mailError) {
      console.error(
        'Enquiry email notification failed:',
        mailError.message
      );
    }

    req.session.flash = {
      type: 'success',
      message:
        `Thank you, ${full_name}. Your request (#${result.insertId}) has been received. We will get back to you.`
    };

    res.redirect('/request');
  } catch (e) {
    next(e);
  }
});

// --------------------------------------------------
// ADMIN AUTHENTICATION
// --------------------------------------------------

app.get('/admin/login', (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin');
  }

  res.render('admin/login');
});

app.post('/admin/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const email = clean(req.body.email, 190).toLowerCase();
    const password = String(req.body.password || '');

    const [rows] = await db.execute(
      'SELECT * FROM admins WHERE email = ? LIMIT 1',
      [email]
    );

    if (
      !rows.length ||
      !(await bcrypt.compare(password, rows[0].password_hash))
    ) {
      req.session.flash = {
        type: 'danger',
        message: 'Invalid email or password.'
      };

      return res.redirect('/admin/login');
    }

    req.session.regenerate(err => {
      if (err) {
        return next(err);
      }

      req.session.admin = {
        id: rows[0].id,
        name: rows[0].name,
        email: rows[0].email
      };

      res.redirect('/admin');
    });
  } catch (e) {
    next(e);
  }
});

app.post('/admin/logout', requireAdmin, (req, res, next) => {
  req.session.destroy(err => {
    if (err) {
      return next(err);
    }

    res.clearCookie('wanjala.sid');
    res.redirect('/admin/login');
  });
});

// --------------------------------------------------
// ADMIN DASHBOARD
// --------------------------------------------------

app.get('/admin', requireAdmin, async (_req, res, next) => {
  try {
    const [[counts]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM enquiries) AS total_enquiries,
        (SELECT COUNT(*) FROM enquiries WHERE status = 'New') AS new_enquiries,
        (SELECT COUNT(*) FROM services WHERE is_active = 1) AS active_services,
        (SELECT COUNT(*) FROM portfolio) AS projects
    `);

    const [recent] = await db.execute(`
      SELECT *
      FROM enquiries
      ORDER BY created_at DESC
      LIMIT 8
    `);

    res.render('admin/dashboard', {
      counts,
      recent
    });
  } catch (e) {
    next(e);
  }
});

// --------------------------------------------------
// ADMIN ENQUIRIES
// --------------------------------------------------

app.get('/admin/enquiries', requireAdmin, async (_req, res, next) => {
  try {
    const [enquiries] = await db.execute(`
      SELECT
        e.*,
        s.title AS service_title
      FROM enquiries e
      LEFT JOIN services s ON e.service_id = s.id
      ORDER BY e.created_at DESC
    `);

    res.render('admin/enquiries', {
      enquiries
    });
  } catch (e) {
    next(e);
  }
});

app.post(
  '/admin/enquiries/:id/status',
  requireAdmin,
  async (req, res, next) => {
    try {
      const allowed = [
        'New',
        'In Progress',
        'Completed',
        'Archived'
      ];

      const status = clean(req.body.status, 30);
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).send('Invalid enquiry ID');
      }

      if (!allowed.includes(status)) {
        return res.status(400).send('Invalid status');
      }

      await db.execute(
        'UPDATE enquiries SET status = ? WHERE id = ?',
        [status, id]
      );

      res.redirect('/admin/enquiries');
    } catch (e) {
      next(e);
    }
  }
);

// --------------------------------------------------
// ADMIN SERVICES
// --------------------------------------------------

app.get('/admin/services', requireAdmin, async (_req, res, next) => {
  try {
    const [services] = await db.execute(`
      SELECT *
      FROM services
      ORDER BY created_at DESC
    `);

    res.render('admin/services', {
      services
    });
  } catch (e) {
    next(e);
  }
});

app.post('/admin/services', requireAdmin, async (req, res, next) => {
  try {
    const title = clean(req.body.title, 160);
    const category = clean(req.body.category, 100);
    const short = clean(req.body.short_description, 255);
    const description = clean(req.body.description, 5000);
    const slug = slugify(title);

    if (!title || !category || !short || !description) {
      req.session.flash = {
        type: 'danger',
        message: 'Complete all service fields.'
      };

      return res.redirect('/admin/services');
    }

    await db.execute(
      `INSERT INTO services
       (title, slug, category, short_description, description, icon, is_featured)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        slug,
        category,
        short,
        description,
        clean(req.body.icon, 80) || 'bi-stars',
        req.body.is_featured === '1' ? 1 : 0
      ]
    );

    req.session.flash = {
      type: 'success',
      message: 'Service added.'
    };

    res.redirect('/admin/services');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      req.session.flash = {
        type: 'danger',
        message: 'A service with a similar name already exists.'
      };

      return res.redirect('/admin/services');
    }

    next(e);
  }
});

app.post(
  '/admin/services/:id/toggle',
  requireAdmin,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).send('Invalid service ID');
      }

      await db.execute(
        'UPDATE services SET is_active = IF(is_active = 1, 0, 1) WHERE id = ?',
        [id]
      );

      res.redirect('/admin/services');
    } catch (e) {
      next(e);
    }
  }
);

// --------------------------------------------------
// ADMIN PORTFOLIO
// --------------------------------------------------

app.get('/admin/portfolio', requireAdmin, async (_req, res, next) => {
  try {
    const [projects] = await db.execute(`
      SELECT *
      FROM portfolio
      ORDER BY created_at DESC
    `);

    res.render('admin/portfolio', {
      projects
    });
  } catch (e) {
    next(e);
  }
});

app.post(
  '/admin/portfolio',
  requireAdmin,
  upload.single('image'),
  async (req, res, next) => {
    try {
      const title = clean(req.body.title, 160);
      const category = clean(req.body.category, 100);
      const description = clean(req.body.description, 3000);
      const projectUrl = clean(req.body.project_url, 500);

      if (!title || !category) {
        req.session.flash = {
          type: 'danger',
          message: 'Project title and category are required.'
        };

        return res.redirect('/admin/portfolio');
      }

      if (
        projectUrl &&
        !/^https?:\/\//i.test(projectUrl)
      ) {
        req.session.flash = {
          type: 'danger',
          message: 'Project URL must start with http:// or https://.'
        };

        return res.redirect('/admin/portfolio');
      }

      if (isProduction && req.file && !cloudinaryConfigured) {
        req.session.flash = {
          type: 'danger',
          message: 'Portfolio image uploads are not configured yet. Please configure Cloudinary in Vercel and try again.'
        };
        return res.redirect('/admin/portfolio');
      }

      let imageUrl = null;

      try {
        imageUrl = await savePortfolioImage(req.file);

        await db.execute(
          `INSERT INTO portfolio
           (title, category, description, image, project_url)
           VALUES (?, ?, ?, ?, ?)`,
          [
            title,
            category,
            description,
            imageUrl,
            projectUrl || null
          ]
        );
      } catch (saveError) {
        // Avoid leaving an orphaned cloud image if the database insert fails.
        if (imageUrl) await deleteUploadedImage(imageUrl);
        throw saveError;
      }

      req.session.flash = {
        type: 'success',
        message: 'Portfolio project added.'
      };

      res.redirect('/admin/portfolio');
    } catch (e) {
      next(e);
    }
  }
);

app.post(
  '/admin/portfolio/:id/delete',
  requireAdmin,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).send('Invalid project ID');
      }

      const [rows] = await db.execute(
        'SELECT image FROM portfolio WHERE id = ?',
        [id]
      );

      await db.execute(
        'DELETE FROM portfolio WHERE id = ?',
        [id]
      );

      if (rows.length && rows[0].image) {
        await deleteUploadedImage(rows[0].image);
      }

      res.redirect('/admin/portfolio');
    } catch (e) {
      next(e);
    }
  }
);

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    application: 'Wanjala Solutions'
  });
});

// --------------------------------------------------
// 404 HANDLER
// --------------------------------------------------

app.use((_req, res) => {
  res.status(404).render('404');
});

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use((err, _req, res, _next) => {
  console.error('Application error:', err);

  if (res.headersSent) {
    return;
  }

  // Give admins a useful message for upload validation/configuration errors.
  const isUploadError =
    err instanceof multer.MulterError ||
    err.code === 'CLOUDINARY_NOT_CONFIGURED' ||
    err.message === 'Only JPG, PNG and WEBP images are allowed.';

  const message = isProduction && !isUploadError
    ? 'Something went wrong. Please try again.'
    : err.message;

  res.status(err instanceof multer.MulterError ? 400 : 500).render('error', {
    message,
    business: businessInfo
  });
});

// --------------------------------------------------
// LOCAL DEVELOPMENT / VERCEL EXPORT
// --------------------------------------------------

if (require.main === module) {
  db.query('SELECT 1')
    .then(() => {
      app.listen(PORT, () => {
        console.log(
          `Wanjala Solutions running at http://localhost:${PORT}`
        );
      });
    })
    .catch(error => {
      console.error(
        'Database connection failed:',
        error.message
      );

      process.exit(1);
    });
}

module.exports = app;
