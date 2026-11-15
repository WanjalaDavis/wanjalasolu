
require('dotenv').config({ path: '.env.production.local' });

const bcrypt = require('bcryptjs');
const db = require('../config/database');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (question) =>
  new Promise(resolve => rl.question(question, resolve));

(async () => {
  try {
    // Verify that production credentials are available.
    const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

    for (const key of required) {
      const value = process.env[key];

      if (!value || value === '[SENSITIVE]') {
        throw new Error(
          `${key} is missing or contains a placeholder. Check .env.production.local.`
        );
      }
    }

    console.log('Connecting to the hosted database...');

    await db.query('SELECT 1');

    console.log('Database connection successful.');

    const name = (await ask('Admin full name: ')).trim();
    const email = (await ask('Admin email: ')).trim().toLowerCase();
    const password = await ask('Admin password (minimum 12 characters): ');

    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
      throw new Error('Enter a valid name, email and password of at least 12 characters.');
    }

    const [existing] = await db.execute(
      'SELECT id FROM admins WHERE email = ? LIMIT 1',
      [email]
    );

    if (existing.length > 0) {
      throw new Error('An administrator with this email already exists.');
    }

    const hash = await bcrypt.hash(password, 12);

    await db.execute(
      'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, hash]
    );

    console.log('Administrator created successfully!');
    console.log('You can now log in through your website admin login page.');

  } catch (error) {
    console.error('\nCould not create administrator.');
    console.error('Error:', error.message || 'Unknown database error');
    if (error.code) console.error('Error code:', error.code);
  } finally {
    rl.close();
    await db.end();
  }
})();
