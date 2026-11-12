require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

(async () => {
  try {
    const name = (await ask('Admin full name: ')).trim();
    const email = (await ask('Admin email: ')).trim().toLowerCase();
    const password = await ask('Admin password (minimum 12 characters): ');
    if (!name || !email || password.length < 12) {
      throw new Error('Name, valid email and a password of at least 12 characters are required.');
    }
    const hash = await bcrypt.hash(password, 12);
    await db.execute(
      'INSERT INTO admins (name,email,password_hash) VALUES (?,?,?)',
      [name, email, hash]
    );
    console.log('Administrator created successfully.');
  } catch (error) {
    console.error('Could not create administrator:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await db.end();
  }
})();
