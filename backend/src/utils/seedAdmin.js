const bcrypt = require('bcryptjs');
const db = require('../config/database');

const seedAdmin = async () => {
  try {
    // Check if admin exists
    const [existingAdmin] = await db.pool.query(
      'SELECT id FROM users WHERE email = ?',
      ['admin@loot.com']
    );

    if (existingAdmin.length > 0) {
      console.log('Admin user already exists');
      return;
    }

    // Create admin with proper hash
    const passwordHash = await bcrypt.hash('admin123', 10);

    await db.pool.query(
      `INSERT INTO users (username, email, password_hash, balance, is_admin)
       VALUES (?, ?, ?, ?, ?)`,
      ['admin', 'admin@loot.com', passwordHash, 0, true]
    );

    console.log('Admin user created successfully');
    console.log('  Email: admin@loot.com');
    console.log('  Password: admin123');
  } catch (error) {
    // Admin might already exist from SQL init
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('Admin user already exists');
    } else {
      console.error('Error seeding admin:', error);
    }
  }
};

module.exports = seedAdmin;
