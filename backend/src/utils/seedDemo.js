const bcrypt = require('bcryptjs');
const db = require('../config/database');

const seedDemo = async () => {
  try {
    // Seed Zynk to USD exchange rate setting (1 Z = $0.10)
    await db.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES ('zynk_to_usd', '0.10', 'Zynk to USD exchange rate (1 Z = X USD)')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`
    );
    console.log('  Set zynk_to_usd rate: 1 Z = $0.10');

    // Check if demo data already exists
    const [existingUsers] = await db.query(
      'SELECT COUNT(*) as count FROM users WHERE email LIKE ?',
      ['demo%@loot.com']
    );

    if (existingUsers[0].count >= 10) {
      console.log('Demo data already seeded');
      return;
    }

    console.log('Seeding demo data...');

    // 1. Create 10 demo users
    const passwordHash = await bcrypt.hash('demo123', 10);
    const users = [
      { username: 'john_lucky', email: 'demo1@loot.com', balance: 1500.00 },
      { username: 'sarah_winner', email: 'demo2@loot.com', balance: 2340.50 },
      { username: 'mike_player', email: 'demo3@loot.com', balance: 890.25 },
      { username: 'emma_jackpot', email: 'demo4@loot.com', balance: 5200.00 },
      { username: 'david_seven', email: 'demo5@loot.com', balance: 150.75 },
      { username: 'lisa_fortune', email: 'demo6@loot.com', balance: 3100.00 },
      { username: 'alex_numbers', email: 'demo7@loot.com', balance: 720.50 },
      { username: 'nina_star', email: 'demo8@loot.com', balance: 1890.00 },
      { username: 'chris_bet', email: 'demo9@loot.com', balance: 450.25 },
      { username: 'olivia_prime', email: 'demo10@loot.com', balance: 2750.00 }
    ];

    const userIds = [];
    for (const user of users) {
      const [result] = await db.query(
        `INSERT INTO users (username, email, password_hash, balance, total_spent, total_earned)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
        [user.username, user.email, passwordHash, user.balance,
         Math.floor(Math.random() * 500) + 100,
         Math.floor(Math.random() * 1000) + 200]
      );
      userIds.push(result.insertId);
    }
    console.log(`  Created ${users.length} demo users`);

    // 2. Determine current session based on time
    const now = new Date();
    const currentHour = now.getHours();
    let sessionNumber;
    if (currentHour >= 8 && currentHour < 15) {
      sessionNumber = 1; // Morning: 8 AM - 3 PM
    } else if (currentHour >= 15 && currentHour < 23) {
      sessionNumber = 2; // Evening: 3 PM - 11 PM
    } else {
      sessionNumber = 3; // Night: 11 PM - 6 AM
    }

    // 3. Create one active draw with session_number
    const today = now;
    const todayStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const totalPool = 10; // Each number costs 1 zynk, 10 numbers
    const activeDraw = {
      periodId: `${todayStr}00${sessionNumber}`,
      drawDate: today.toISOString().split('T')[0],
      winningNumber: String(Math.floor(Math.random() * 10000000)).padStart(7, '0'),
      status: 'revealing',
      sessionNumber,
      totalPool
    };

    const [drawResult] = await db.query(
      `INSERT INTO daily_draws (period_id, draw_date, session_number, winning_number, status, total_pool, revealed_digits)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [activeDraw.periodId, activeDraw.drawDate, activeDraw.sessionNumber, activeDraw.winningNumber, activeDraw.status, activeDraw.totalPool, 0]
    );
    const drawId = drawResult.insertId;
    console.log(`  Created Session ${sessionNumber} draw (pool: ${totalPool} Z)`);

    // 4. Create numbers with new ticket fields (enrolled in current draw)
    const numbers = [
      { number: '7777777', ownerId: userIds[3], price: 10, totalVotes: 15420, trend: 25.5, timesWon: 3 },
      { number: '1234567', ownerId: userIds[1], price: 10, totalVotes: 8930, trend: 12.3, timesWon: 1 },
      { number: '0000001', ownerId: userIds[0], price: 10, totalVotes: 5670, trend: -5.2, timesWon: 0 },
      { number: '9999999', ownerId: userIds[5], price: 10, totalVotes: 7210, trend: 18.7, timesWon: 2 },
      { number: '8888888', ownerId: userIds[7], price: 10, totalVotes: 6340, trend: -2.4, timesWon: 1 },
      { number: '0123456', ownerId: userIds[2], price: 10, totalVotes: 2890, trend: 15.2, timesWon: 0 },
      { number: '7654321', ownerId: userIds[4], price: 10, totalVotes: 4100, trend: 22.1, timesWon: 1 },
      { number: '1357913', ownerId: userIds[6], price: 10, totalVotes: 890, trend: -1.2, timesWon: 0 },
      { number: '0007007', ownerId: userIds[9], price: 10, totalVotes: 5670, trend: 30.2, timesWon: 2 },
      { number: '2718281', ownerId: userIds[8], price: 10, totalVotes: 1780, trend: 4.5, timesWon: 0 }
    ];

    const numberIds = {};
    for (const num of numbers) {
      const [result] = await db.query(
        `INSERT INTO numbers (
          number, owner_id, price, total_votes, vote_trend, times_won,
          matched_digits, current_return, ticket_status, buy_amount, draw_id, last_reveal_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
        [
          num.number, num.ownerId, num.price, num.totalVotes, num.trend, num.timesWon,
          0, // matched_digits
          0, // current_return
          'active', // ticket_status
          num.price, // buy_amount
          drawId, // draw_id (enrolled in current draw)
          0 // last_reveal_index
        ]
      );
      numberIds[num.number] = result.insertId;
    }
    console.log(`  Created ${numbers.length} demo tickets (enrolled in Session ${sessionNumber})`);

    // 5. Create votes for numbers
    const voteEntries = [];
    for (const userId of userIds) {
      const numVotes = Math.floor(Math.random() * 4) + 2;
      const votedNumbers = Object.keys(numberIds)
        .sort(() => Math.random() - 0.5)
        .slice(0, numVotes);

      for (const numStr of votedNumbers) {
        voteEntries.push({
          userId,
          numberId: numberIds[numStr],
          drawId,
          voteCount: Math.floor(Math.random() * 5) + 1
        });
      }
    }

    for (const vote of voteEntries) {
      await db.query(
        `INSERT IGNORE INTO votes (user_id, number_id, draw_id, vote_count)
         VALUES (?, ?, ?, ?)`,
        [vote.userId, vote.numberId, vote.drawId, vote.voteCount]
      ).catch(() => {}); // Ignore duplicates
    }
    console.log(`  Created demo votes`);

    // 6. Create transactions (including cashout type)
    const transactionTypes = ['deposit', 'withdrawal', 'purchase', 'sale', 'vote', 'prize', 'cashout'];
    for (const userId of userIds) {
      const numTransactions = Math.floor(Math.random() * 10) + 5;
      let balance = 100;

      for (let i = 0; i < numTransactions; i++) {
        const type = transactionTypes[Math.floor(Math.random() * transactionTypes.length)];
        let amount;

        switch (type) {
          case 'deposit': amount = Math.floor(Math.random() * 500) + 50; break;
          case 'withdrawal': amount = -Math.floor(Math.random() * 100) - 10; break;
          case 'purchase': amount = -Math.floor(Math.random() * 50) - 10; break;
          case 'sale': amount = Math.floor(Math.random() * 200) + 20; break;
          case 'vote': amount = -Math.floor(Math.random() * 10) - 1; break;
          case 'prize': amount = Math.floor(Math.random() * 1000) + 100; break;
          case 'cashout': amount = Math.floor(Math.random() * 500) + 50; break;
          default: amount = 0;
        }

        const balanceBefore = balance;
        balance = Math.max(0, balance + amount);

        await db.query(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, type, Math.abs(amount), balanceBefore, balance,
           `Demo ${type} transaction`,
           new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)]
        ).catch(() => {});
      }
    }
    console.log(`  Created demo transactions`);

    // 7. Update settings with current period
    await db.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES ('current_period_id', ?, 'Current active draw period ID')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [activeDraw.periodId]
    );

    console.log('Demo data seeded successfully!');
    console.log('');
    console.log('Demo Users (password: demo123):');
    users.forEach((u) => console.log(`  ${u.email} - ${u.username} - Balance: ${u.balance} Z`));
    console.log('');
    console.log(`Current Session: ${sessionNumber} (${sessionNumber === 1 ? 'Morning' : sessionNumber === 2 ? 'Evening' : 'Night'})`);
    console.log(`Active Draw: ${activeDraw.periodId}`);

  } catch (error) {
    console.error('Error seeding demo data:', error);
  }
};

module.exports = seedDemo;
