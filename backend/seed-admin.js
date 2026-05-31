const bcrypt = require('bcryptjs');
const { pool, initDB } = require('./db');
require('dotenv').config();

async function seedAdmin() {
  await initDB();

  const username = 'admin';
  const email = 'admin@vibeconnect.com';
  const password = 'Admin@1234';

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email=$1 OR username=$2', [email, username]);
    if (existing.rows.length > 0) {
      await pool.query("UPDATE users SET role='admin', is_active=true WHERE email=$1", [email]);
      console.log(`✅ Existing user promoted to admin.`);
    } else {
      const hashed = await bcrypt.hash(password, 12);
      await pool.query(
        "INSERT INTO users (username, email, password, role) VALUES ($1,$2,$3,'admin')",
        [username, email, hashed]
      );
      console.log(`✅ Admin account created.`);
    }

    console.log('─────────────────────────────');
    console.log(`  Email   : ${email}`);
    console.log(`  Password: ${password}`);
    console.log('─────────────────────────────');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

seedAdmin();
