# Wanjala Solutions

A Node.js + Express + MySQL + EJS + Bootstrap 5 website for presenting services, receiving enquiries, managing a portfolio and administering service listings.

## Requirements

- Node.js 20 or newer
- MySQL 8+ or MariaDB
- npm

## 1. Install

```bash
npm install
```

## 2. Create the database

Start MySQL (XAMPP is fine), then import `database/schema.sql` using phpMyAdmin or the MySQL command line.

Command line:

```bash
mysql -u root -p < database/schema.sql
```

If your local MySQL root account has no password, press Enter when prompted.

## 3. Configure environment

Copy `.env.example` to `.env`, then edit the values.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```bash
cp .env.example .env
```

Set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` and a long random `SESSION_SECRET`. Add your real phone, WhatsApp number and business email. WhatsApp number must use international digits, e.g. `2547XXXXXXXX` (no plus sign or spaces).

## 4. Create the first administrator

```bash
npm run create-admin
```

Use a strong password of at least 12 characters. This command stores a bcrypt password hash in MySQL.

## 5. Run locally

```bash
npm run dev
```

Open:

- Website: http://localhost:3000
- Admin: http://localhost:3000/admin/login
- Health check: http://localhost:3000/health

## 6. Email notifications (optional)

Enquiries are saved in MySQL even if SMTP is not configured. To receive an email notification when a customer submits a form, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` and `ENQUIRY_TO` in `.env`.

For Gmail, use Google's supported app-password flow where eligible; do not put your normal Gmail password in `.env`.

## 7. Main functionality

- Public pages: Home, About, Services, Service Details, Portfolio, Contact and Request a Service.
- Customer enquiries are stored in MySQL.
- Optional email notification through SMTP.
- WhatsApp click-to-chat links.
- Admin dashboard with enquiry status management.
- Admin can add/hide services and add/delete portfolio projects.
- Portfolio images accept JPG, PNG and WEBP, limited by `MAX_UPLOAD_MB`.

## Important production notes

1. Set `NODE_ENV=production` and use HTTPS.
2. Set a unique, long `SESSION_SECRET`.
3. Use a dedicated MySQL user with only the required database permissions; do not use the MySQL root user in production.
4. **Portfolio image storage:** Vercel uses Cloudinary for durable portfolio uploads. Create a Cloudinary account, then add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` to the Vercel project's Environment Variables for Production (and Preview if required). Redeploy after adding them. The values are available in the Cloudinary dashboard. Do not commit these credentials. Local development continues to store images in `public/uploads`; that folder is ignored by Git.
5. Configure SMTP and verify email delivery.
6. Add CSRF protection before accepting public production traffic, and consider CAPTCHA or an anti-bot service for public forms.
7. Keep `.env`, customer enquiries and uploaded private documents out of Git. This starter site does not ask customers to upload identity documents.
8. Official government portals make the final decisions on applications. Wanjala Solutions is an independent assistance provider, not a government agency.
9. Back up MySQL regularly and use a managed database if the hosting provider does not offer persistent MySQL.

## Portfolio image storage

- In production, uploaded portfolio images are sent to Cloudinary and the returned secure HTTPS URL is stored in the existing `portfolio.image` column.
- In local development, images are stored under `public/uploads` and served by Express.
- Vercel does not provide durable local filesystem storage for user uploads. Do not remove the Cloudinary environment variables once portfolio images have been uploaded.
- Portfolio image files uploaded before this change to Vercel's temporary `/tmp` directory may already be unavailable. Those older broken images need to be uploaded again from the admin portfolio page; existing portfolio records are not automatically deleted.

## Notes about free hosting

Free hosting availability and database limits change. Choose a Node.js host that supports persistent environment variables and a managed MySQL-compatible database. Do not assume a free web host also provides persistent MySQL storage.
