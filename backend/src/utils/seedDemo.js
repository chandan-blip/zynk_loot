const bcrypt = require('bcryptjs');
const db = require('../config/database');

const seedDemo = async () => {
  try {
    // Seed essential settings
    const essentialSettings = [
      // Exchange rate
      ['zynk_to_usd', '0.10', 'Zynk to USD exchange rate (1 Z = X USD)'],
      ['number_base_price', '10', 'Base price for buying a number'],
      ['vote_cost', '1', 'Cost per vote'],

      // Cron configuration
      ['total_digits', '7', 'Total number of digits in winning number'],
      ['timezone', 'Asia/Kolkata', 'Timezone for scheduling draws (IANA format)'],
      ['cron_enabled', 'true', 'Master switch to enable/disable all cron jobs'],
      ['auto_reveal_enabled', 'true', 'Enable/disable automatic digit reveal'],

      // Prize multipliers
      ['exact_match_multiplier', '0.4', 'Prize multiplier for exact match (40% of pool)'],
      ['near_match_multiplier', '0.1', 'Prize multiplier for near match shared pool (10% of pool)'],
      ['vote_reward', '10', 'Z reward for voters who predicted winning number'],

      // Session 1: Morning (8 AM - 3 PM)
      ['session_1_generate_hour', '8', 'Hour to generate Session 1 draw (24h format)'],
      ['session_1_reveal_start_hour', '9', 'Hour to start revealing digits for Session 1'],
      ['session_1_reveal_end_hour', '15', 'Hour when all digits are revealed for Session 1'],

      // Session 2: Evening (3 PM - 11 PM)
      ['session_2_generate_hour', '15', 'Hour to generate Session 2 draw (24h format)'],
      ['session_2_reveal_start_hour', '17', 'Hour to start revealing digits for Session 2'],
      ['session_2_reveal_end_hour', '23', 'Hour when all digits are revealed for Session 2'],

      // Session 3: Night (11 PM - 6 AM)
      ['session_3_generate_hour', '23', 'Hour to generate Session 3 draw (24h format)'],
      ['session_3_reveal_start_hour', '0', 'Hour to start revealing digits for Session 3'],
      ['session_3_reveal_end_hour', '6', 'Hour when all digits are revealed for Session 3'],

      // Current period placeholder
      ['current_period_id', '', 'Current active draw period ID']
    ];

    for (const [key, value, description] of essentialSettings) {
      await db.pool.query(
        `INSERT INTO settings (setting_key, setting_value, description)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE description = VALUES(description)`,
        [key, value, description]
      );
    }
    console.log('[SEED] Configuration settings seeded');

    // Check if test user already exists
    const [existingUser] = await db.pool.query(
      'SELECT id FROM users WHERE email = ?',
      ['test@loot.com']
    );

    if (existingUser.length === 0) {
      // Create one test user
      const passwordHash = await bcrypt.hash('test123', 10);
      await db.pool.query(
        `INSERT INTO users (username, email, password_hash, balance, total_spent, total_earned)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['test_user', 'test@loot.com', passwordHash, 100, 0, 0]
      );
      console.log('[SEED] Test user created: test@loot.com / test123');
    }

  } catch (error) {
    console.error('[SEED] Error seeding data:', error);
  }
};

module.exports = seedDemo;
