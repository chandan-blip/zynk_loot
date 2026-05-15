const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Lifetime completed-deposit threshold (in INR) below which withdrawals are
// blocked. Backend-only gate — the frontend has no UI for it; the user only
// learns about it via the toast when they try to withdraw.
const MIN_DEPOSIT_INR_FOR_WITHDRAWAL = 2000;

// All routes below require authentication
router.use(authenticateToken);

// Get wallet balance
router.get('/balance', async (req, res) => {
  try {
    const [users] = await db.pool.query(
      'SELECT balance, total_spent, total_earned FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        balance: parseFloat(users[0].balance),
        totalSpent: parseFloat(users[0].total_spent || 0),
        totalEarned: parseFloat(users[0].total_earned || 0)
      }
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ success: false, message: 'Failed to get balance' });
  }
});

// ============ PAYMENT METHODS ============

// Get all payment methods for user
router.get('/payment-methods', async (req, res) => {
  try {
    const [methods] = await db.pool.query(
      `SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_primary DESC, created_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, data: methods });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ success: false, message: 'Failed to get payment methods' });
  }
});

// Add UPI payment method
router.post('/payment-methods/upi', [
  body('upi_id').notEmpty().matches(/^[\w.-]+@[\w]+$/i).withMessage('Invalid UPI ID format'),
  body('label').optional().isString().isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { upi_id, label } = req.body;

    // Check if this UPI already exists for user
    const [existing] = await db.pool.query(
      'SELECT id FROM payment_methods WHERE user_id = ? AND type = ? AND upi_id = ?',
      [req.user.id, 'upi', upi_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'This UPI ID is already added' });
    }

    // Check if user has any payment method, make this primary if first
    const [count] = await db.pool.query(
      'SELECT COUNT(*) as total FROM payment_methods WHERE user_id = ?',
      [req.user.id]
    );
    const isPrimary = count[0].total === 0;

    const [result] = await db.pool.query(
      `INSERT INTO payment_methods (user_id, type, upi_id, label, is_primary) VALUES (?, 'upi', ?, ?, ?)`,
      [req.user.id, upi_id, label || `UPI - ${upi_id}`, isPrimary]
    );

    res.json({
      success: true,
      message: 'UPI added successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Add UPI error:', error);
    res.status(500).json({ success: false, message: 'Failed to add UPI' });
  }
});

// Add Crypto wallet
router.post('/payment-methods/crypto', [
  body('wallet_address').notEmpty().isLength({ min: 10, max: 255 }),
  body('wallet_type').notEmpty().isIn(['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'OTHER']),
  body('label').optional().isString().isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { wallet_address, wallet_type, label } = req.body;

    // Check if this wallet already exists for user
    const [existing] = await db.pool.query(
      'SELECT id FROM payment_methods WHERE user_id = ? AND type = ? AND wallet_address = ?',
      [req.user.id, 'crypto', wallet_address]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'This wallet is already added' });
    }

    const [count] = await db.pool.query(
      'SELECT COUNT(*) as total FROM payment_methods WHERE user_id = ?',
      [req.user.id]
    );
    const isPrimary = count[0].total === 0;

    const [result] = await db.pool.query(
      `INSERT INTO payment_methods (user_id, type, wallet_address, wallet_type, label, is_primary) VALUES (?, 'crypto', ?, ?, ?, ?)`,
      [req.user.id, wallet_address, wallet_type, label || `${wallet_type} Wallet`, isPrimary]
    );

    res.json({
      success: true,
      message: 'Crypto wallet added successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Add crypto wallet error:', error);
    res.status(500).json({ success: false, message: 'Failed to add crypto wallet' });
  }
});

// Add Bank account
router.post('/payment-methods/bank', [
  body('bank_name').notEmpty().isLength({ max: 100 }),
  body('account_number').notEmpty().isLength({ min: 8, max: 20 }),
  body('ifsc_code').notEmpty().matches(/^[A-Z]{4}0[A-Z0-9]{6}$/i).withMessage('Invalid IFSC code'),
  body('account_holder').notEmpty().isLength({ max: 100 }),
  body('label').optional().isString().isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { bank_name, account_number, ifsc_code, account_holder, label } = req.body;

    // Check if this account already exists for user
    const [existing] = await db.pool.query(
      'SELECT id FROM payment_methods WHERE user_id = ? AND type = ? AND account_number = ?',
      [req.user.id, 'bank', account_number]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'This bank account is already added' });
    }

    const [count] = await db.pool.query(
      'SELECT COUNT(*) as total FROM payment_methods WHERE user_id = ?',
      [req.user.id]
    );
    const isPrimary = count[0].total === 0;

    const [result] = await db.pool.query(
      `INSERT INTO payment_methods (user_id, type, bank_name, account_number, ifsc_code, account_holder, label, is_primary)
       VALUES (?, 'bank', ?, ?, ?, ?, ?, ?)`,
      [req.user.id, bank_name, account_number, ifsc_code.toUpperCase(), account_holder, label || `${bank_name} Account`, isPrimary]
    );

    res.json({
      success: true,
      message: 'Bank account added successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Add bank account error:', error);
    res.status(500).json({ success: false, message: 'Failed to add bank account' });
  }
});

// Set primary payment method
router.put('/payment-methods/:id/primary', async (req, res) => {
  try {
    // Verify ownership
    const [methods] = await db.pool.query(
      'SELECT id FROM payment_methods WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (methods.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }

    // Remove primary from all other methods
    await db.pool.query(
      'UPDATE payment_methods SET is_primary = FALSE WHERE user_id = ?',
      [req.user.id]
    );

    // Set this one as primary
    await db.pool.query(
      'UPDATE payment_methods SET is_primary = TRUE WHERE id = ?',
      [req.params.id]
    );

    res.json({ success: true, message: 'Primary payment method updated' });
  } catch (error) {
    console.error('Set primary error:', error);
    res.status(500).json({ success: false, message: 'Failed to update primary method' });
  }
});

// Delete payment method
router.delete('/payment-methods/:id', async (req, res) => {
  try {
    // Verify ownership
    const [methods] = await db.pool.query(
      'SELECT id, is_primary FROM payment_methods WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (methods.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }

    // Check if there are pending withdrawals using this method
    const [pending] = await db.pool.query(
      'SELECT id FROM withdrawals WHERE payment_method_id = ? AND status = ?',
      [req.params.id, 'pending']
    );

    if (pending.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete: this method has pending withdrawals'
      });
    }

    await db.pool.query('DELETE FROM payment_methods WHERE id = ?', [req.params.id]);

    // If deleted method was primary, make another one primary
    if (methods[0].is_primary) {
      await db.pool.query(
        'UPDATE payment_methods SET is_primary = TRUE WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );
    }

    res.json({ success: true, message: 'Payment method deleted' });
  } catch (error) {
    console.error('Delete payment method error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete payment method' });
  }
});

// ============ ZYNK PACKAGES & CHECKOUT ============

// Get available packages
router.get('/packages', async (req, res) => {
  try {
    const [packages] = await db.pool.query(
      'SELECT * FROM zynk_packages WHERE is_active = TRUE ORDER BY price ASC'
    );
    res.json({ success: true, data: packages });
  } catch (error) {
    console.error('Get packages error:', error);
    res.status(500).json({ success: false, message: 'Failed to get packages' });
  }
});

// Get payment settings (randomly select from active payment accounts)
router.get('/payment-settings', async (req, res) => {
  try {
    // Get all active payment accounts grouped by type
    const [accounts] = await db.pool.query(
      `SELECT * FROM payment_accounts
       WHERE is_active = TRUE
       AND (daily_limit IS NULL OR daily_used < daily_limit)
       ORDER BY type, priority DESC`
    );

    // Helper function to select account based on priority (weighted random)
    const selectAccount = (typeAccounts) => {
      if (typeAccounts.length === 0) return null;
      if (typeAccounts.length === 1) return typeAccounts[0];

      // Calculate total priority weight
      const totalWeight = typeAccounts.reduce((sum, acc) => sum + (acc.priority || 1), 0);
      let random = Math.random() * totalWeight;

      for (const acc of typeAccounts) {
        random -= (acc.priority || 1);
        if (random <= 0) return acc;
      }
      return typeAccounts[0]; // Fallback
    };

    // Group accounts by type
    const grouped = {
      upi: accounts.filter(a => a.type === 'upi'),
      bank: accounts.filter(a => a.type === 'bank'),
      crypto_btc: accounts.filter(a => a.type === 'crypto_btc'),
      crypto_eth: accounts.filter(a => a.type === 'crypto_eth'),
      crypto_usdt: accounts.filter(a => a.type === 'crypto_usdt')
    };

    // Select one account per type
    const selectedUpi = selectAccount(grouped.upi);
    const selectedBank = selectAccount(grouped.bank);
    const selectedBtc = selectAccount(grouped.crypto_btc);
    const selectedEth = selectAccount(grouped.crypto_eth);
    const selectedUsdt = selectAccount(grouped.crypto_usdt);

    res.json({
      success: true,
      data: {
        upi: selectedUpi ? {
          id: selectedUpi.upi_id || '',
          name: selectedUpi.upi_name || selectedUpi.label || 'Loot Lottery',
          accountId: selectedUpi.id
        } : { id: '', name: '', accountId: null },
        bank: selectedBank ? {
          name: selectedBank.bank_name || '',
          account: selectedBank.bank_account || '',
          ifsc: selectedBank.bank_ifsc || '',
          holder: selectedBank.bank_holder || '',
          accountId: selectedBank.id
        } : { name: '', account: '', ifsc: '', holder: '', accountId: null },
        crypto: {
          btc: selectedBtc ? { address: selectedBtc.wallet_address || '', network: selectedBtc.wallet_network || 'BTC', accountId: selectedBtc.id } : { address: '', network: '', accountId: null },
          eth: selectedEth ? { address: selectedEth.wallet_address || '', network: selectedEth.wallet_network || 'ERC20', accountId: selectedEth.id } : { address: '', network: '', accountId: null },
          usdt: selectedUsdt ? { address: selectedUsdt.wallet_address || '', network: selectedUsdt.wallet_network || 'TRC20', accountId: selectedUsdt.id } : { address: '', network: '', accountId: null }
        },
        // Include available types for UI
        availableTypes: {
          upi: grouped.upi.length > 0,
          bank: grouped.bank.length > 0,
          crypto_btc: grouped.crypto_btc.length > 0,
          crypto_eth: grouped.crypto_eth.length > 0,
          crypto_usdt: grouped.crypto_usdt.length > 0
        }
      }
    });
  } catch (error) {
    console.error('Get payment settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to get payment settings' });
  }
});

// Create checkout order (with payment proof - requires admin approval)
router.post('/checkout', [
  body('package_id').isInt({ min: 1 }),
  body('payment_method').isIn(['upi', 'bank', 'crypto_btc', 'crypto_eth', 'crypto_usdt']),
  body('payment_account_id').optional().isInt({ min: 1 }),
  body('payment_reference').optional().isString().isLength({ max: 100 }),
  body('payment_note').optional().isString().isLength({ max: 500 })
], async (req, res) => {
  const connection = await db.getConnection();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { package_id, payment_method, payment_account_id, payment_reference, payment_note } = req.body;

    await connection.beginTransaction();

    // Get package details
    const [packages] = await connection.execute(
      'SELECT * FROM zynk_packages WHERE id = ? AND is_active = TRUE',
      [package_id]
    );

    if (packages.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    const pkg = packages[0];
    const bonusAmount = Math.floor(pkg.zynk_amount * pkg.bonus_percent / 100);
    const totalZynk = pkg.zynk_amount + bonusAmount;

    // Check for existing pending order for same package
    const [existingOrders] = await connection.execute(
      `SELECT id FROM zynk_orders
       WHERE user_id = ? AND package_id = ? AND status IN ('pending', 'awaiting_approval')
       AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [req.user.id, package_id]
    );

    if (existingOrders.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'You already have a pending order for this package. Please wait for it to be processed.'
      });
    }

    // Update payment account usage if provided
    if (payment_account_id) {
      await connection.execute(
        `UPDATE payment_accounts
         SET usage_count = usage_count + 1, daily_used = daily_used + ?, last_used_at = NOW()
         WHERE id = ?`,
        [pkg.price, payment_account_id]
      );
    }

    // Create order awaiting approval. payment_currency is always INR now and
    // payment_amount mirrors the package price, so we just hardcode them so
    // existing DB columns keep getting populated without a migration.
    const [orderResult] = await connection.execute(
      `INSERT INTO zynk_orders
       (user_id, package_id, zynk_amount, bonus_amount, price, payment_currency, payment_amount, payment_method, payment_account_id, payment_reference, payment_note, status)
       VALUES (?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, 'awaiting_approval')`,
      [req.user.id, package_id, pkg.zynk_amount, bonusAmount, pkg.price, pkg.price, payment_method, payment_account_id || null, payment_reference || null, payment_note || null]
    );

    await connection.commit();

    // Fetch username for notification
    const [userRows] = await db.pool.query('SELECT username FROM users WHERE id = ?', [req.user.id]);
    const username = userRows[0]?.username || 'Unknown';

    // Notify admin via socket
    const io = req.app.get('io');
    if (io) {
      io.to('order:admin').emit('order:new', {
        id: orderResult.insertId,
        userId: req.user.id,
        username,
        package: pkg.name,
        zynkAmount: pkg.zynk_amount,
        bonusAmount,
        totalZynk,
        price: parseFloat(pkg.price),
        paymentMethod: payment_method,
        paymentCurrency: 'INR',
        paymentAmount: pkg.price,
        paymentReference: payment_reference || null,
        status: 'awaiting_approval',
        createdAt: new Date().toISOString(),
      });
    }

    // Dashboard channel notification — fire-and-forget. Fires at request
    // create time, NOT on admin approval/rejection.
    const telegramDashService = req.app.get('telegramDashService');
    if (telegramDashService) {
      db.pool.query('SELECT id, username, email, phone FROM users WHERE id = ?', [req.user.id])
        .then(([rows]) => {
          if (rows[0]) {
            telegramDashService.notifyDeposit({
              user: rows[0],
              amount: pkg.zynk_amount,
              bonusAmount,
              packageName: pkg.name,
              priceLabel: `${parseFloat(pkg.price)} INR`,
              paymentMethod: payment_method,
              paymentCurrency: 'INR',
              paymentAmount: pkg.price,
              paymentReference: payment_reference || null,
              orderId: orderResult.insertId,
              source: '/wallet/checkout',
              status: 'awaiting_approval',
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    res.json({
      success: true,
      message: 'Order submitted! Your order is awaiting admin approval.',
      data: {
        orderId: orderResult.insertId,
        package: pkg.name,
        zynkAmount: pkg.zynk_amount,
        bonusAmount,
        totalZynk,
        price: parseFloat(pkg.price),
        status: 'awaiting_approval'
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Checkout error:', error);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  } finally {
    connection.release();
  }
});

// Get user's orders
router.get('/orders', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const [orders] = await db.pool.query(
      `SELECT o.*, p.name as package_name
       FROM zynk_orders o
       LEFT JOIN zynk_packages p ON o.package_id = p.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );

    const [[{ total }]] = await db.pool.query(
      'SELECT COUNT(*) as total FROM zynk_orders WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to get orders' });
  }
});

// Cancel pending order (user can cancel before admin processes)
router.post('/orders/:orderId/cancel', async (req, res) => {
  try {
    const [orders] = await db.pool.query(
      `SELECT * FROM zynk_orders WHERE id = ? AND user_id = ? AND status IN ('pending', 'awaiting_approval')`,
      [req.params.orderId, req.user.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found or cannot be cancelled' });
    }

    await db.pool.query(
      `UPDATE zynk_orders SET status = 'failed', admin_note = 'Cancelled by user' WHERE id = ?`,
      [req.params.orderId]
    );

    res.json({ success: true, message: 'Order cancelled' });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
});

// Legacy: Buy Zynk package (kept for backwards compatibility - creates pending order)
router.post('/buy-zynk', [
  body('package_id').isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { package_id } = req.body;

    const [packages] = await db.pool.query(
      'SELECT * FROM zynk_packages WHERE id = ? AND is_active = TRUE',
      [package_id]
    );

    if (packages.length === 0) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    const pkg = packages[0];
    const bonusAmount = Math.floor(pkg.zynk_amount * pkg.bonus_percent / 100);

    const [orderResult] = await db.pool.query(
      `INSERT INTO zynk_orders (user_id, package_id, zynk_amount, bonus_amount, price, payment_method, status)
       VALUES (?, ?, ?, ?, ?, 'pending', 'pending')`,
      [req.user.id, package_id, pkg.zynk_amount, bonusAmount, pkg.price]
    );

    // Dashboard channel notification — fire-and-forget. Fires at order
    // create time, NOT on admin approval/rejection.
    const telegramDashService = req.app.get('telegramDashService');
    if (telegramDashService) {
      db.pool.query('SELECT id, username, email, phone FROM users WHERE id = ?', [req.user.id])
        .then(([rows]) => {
          if (rows[0]) {
            telegramDashService.notifyDeposit({
              user: rows[0],
              amount: pkg.zynk_amount,
              bonusAmount,
              packageName: pkg.name,
              priceLabel: `${parseFloat(pkg.price)} INR`,
              paymentMethod: 'pending',
              orderId: orderResult.insertId,
              source: '/wallet/buy-zynk',
              status: 'pending',
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    res.json({
      success: true,
      message: 'Order created - please complete payment',
      data: {
        orderId: orderResult.insertId,
        package: pkg.name,
        zynkAmount: pkg.zynk_amount + bonusAmount,
        price: parseFloat(pkg.price)
      }
    });
  } catch (error) {
    console.error('Buy zynk error:', error);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

// Legacy: Complete purchase (for backwards compatibility)
router.post('/complete-purchase/:orderId', async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [orders] = await connection.execute(
      'SELECT * FROM zynk_orders WHERE id = ? AND user_id = ? AND status IN (?, ?) FOR UPDATE',
      [req.params.orderId, req.user.id, 'pending', 'approved']
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Order not found or already processed' });
    }

    const order = orders[0];
    const totalZynk = order.zynk_amount + (order.bonus_amount || 0);

    const [users] = await connection.execute(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE',
      [req.user.id]
    );

    const currentBalance = parseFloat(users[0].balance);
    const newBalance = currentBalance + totalZynk;

    await connection.execute(
      'UPDATE users SET balance = ? WHERE id = ?',
      [newBalance, req.user.id]
    );

    await connection.execute(
      'UPDATE zynk_orders SET status = ?, completed_at = NOW() WHERE id = ?',
      ['completed', order.id]
    );

    const [txnResult] = await connection.execute(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
       VALUES (?, 'deposit', ?, ?, ?, 'admin', ?, ?)`,
      [req.user.id, order.zynk_amount, currentBalance, newBalance, order.id, `Purchased ${order.zynk_amount} Zynk`]
    );

    await connection.commit();

    // Process referral commission
    const referralService = req.app.get('referralService');
    if (referralService) {
      referralService.processReferralCommission(req.user.id, txnResult.insertId, 'deposit', order.zynk_amount);
    }

    // Credit first-deposit bonus (idempotent — only fires the first time).
    // Runs outside the deposit transaction; failures shouldn't roll back
    // the deposit itself.
    const bonusService = req.app.get('bonusService');
    if (bonusService) {
      bonusService.creditFirstDepositBonus(req.user.id, order.zynk_amount).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Purchase completed successfully',
      data: {
        zynkAdded: order.zynk_amount,
        newBalance
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Complete purchase error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete purchase' });
  } finally {
    connection.release();
  }
});

// ============ WITHDRAWALS ============

// Get user's withdrawals
router.get('/withdrawals', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const [withdrawals] = await db.pool.query(
      `SELECT w.*, pm.type as payment_type, pm.label as payment_label,
              pm.upi_id, pm.wallet_address, pm.wallet_type, pm.bank_name, pm.account_number
       FROM withdrawals w
       JOIN payment_methods pm ON w.payment_method_id = pm.id
       WHERE w.user_id = ?
       ORDER BY w.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, parseInt(limit), parseInt(offset)]
    );

    const [countResult] = await db.pool.query(
      'SELECT COUNT(*) as total FROM withdrawals WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        withdrawals,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ success: false, message: 'Failed to get withdrawals' });
  }
});

// Request withdrawal
router.post('/withdraw-request', [
  body('amount').isFloat({ min: 10 }),
  body('payment_method_id').isInt({ min: 1 })
], async (req, res) => {
  const connection = await db.getConnection();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { amount, payment_method_id } = req.body;

    await connection.beginTransaction();

    // Verify payment method belongs to user
    const [methods] = await connection.execute(
      'SELECT id, type, label FROM payment_methods WHERE id = ? AND user_id = ?',
      [payment_method_id, req.user.id]
    );

    if (methods.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }

    // Gate: total lifetime completed deposits must reach the INR threshold
    // before the user can withdraw anything. Backend-only check — frontend
    // surfaces this purely via the error toast on the request response.
    const [depositSum] = await connection.execute(
      `SELECT COUNT(*) AS deposit_count, COALESCE(SUM(price), 0) AS total_inr
         FROM zynk_orders
        WHERE user_id = ? AND status = 'completed'`,
      [req.user.id]
    );
    const depositCount = parseInt(depositSum[0]?.deposit_count, 10) || 0;
    const totalDepositedInr = parseFloat(depositSum[0]?.total_inr) || 0;
    if (depositCount === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `You haven't made any deposits yet. Add funds first to unlock withdrawals.`,
      });
    }
    if (totalDepositedInr < MIN_DEPOSIT_INR_FOR_WITHDRAWAL) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Withdrawals unlock after you've deposited at least ₹${MIN_DEPOSIT_INR_FOR_WITHDRAWAL}. You've deposited ₹${Math.floor(totalDepositedInr)} so far.`,
      });
    }

    // Check balance
    const [users] = await connection.execute(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE',
      [req.user.id]
    );

    const currentBalance = parseFloat(users[0].balance);

    if (currentBalance < amount) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    // Deduct balance (held until approved/rejected)
    const newBalance = currentBalance - amount;
    await connection.execute(
      'UPDATE users SET balance = ? WHERE id = ?',
      [newBalance, req.user.id]
    );

    // Create withdrawal request
    const [result] = await connection.execute(
      'INSERT INTO withdrawals (user_id, payment_method_id, amount, status) VALUES (?, ?, ?, ?)',
      [req.user.id, payment_method_id, amount, 'pending']
    );

    // Create transaction record
    const [txnResult] = await connection.execute(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
       VALUES (?, 'withdrawal', ?, ?, ?, 'admin', ?, ?)`,
      [req.user.id, amount, currentBalance, newBalance, result.insertId, `Withdrawal request - ${methods[0].label}`]
    );

    await connection.commit();

    // Process referral commission
    const referralService = req.app.get('referralService');
    if (referralService) {
      referralService.processReferralCommission(req.user.id, txnResult.insertId, 'withdrawal', amount);
    }

    res.json({
      success: true,
      message: 'Withdrawal request submitted. Awaiting admin approval.',
      data: {
        withdrawalId: result.insertId,
        amount,
        newBalance
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Withdrawal request error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit withdrawal request' });
  } finally {
    connection.release();
  }
});

// Get transaction history
router.get('/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const [transactions] = await db.pool.query(
      `SELECT * FROM transactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, parseInt(limit), parseInt(offset)]
    );

    const [countResult] = await db.pool.query(
      'SELECT COUNT(*) as total FROM transactions WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get transactions' });
  }
});

// ============ USER TRANSFERS (P2P) ============

// Transfer ZYNK to another user
router.post('/transfer', [
  body('recipient_id').isInt({ min: 1 }),
  body('amount').isFloat({ min: 1 }),
  body('note').optional().isString().isLength({ max: 200 })
], async (req, res) => {
  const connection = await db.getConnection();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { recipient_id, amount, note } = req.body;

    // Cannot transfer to self
    if (recipient_id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot transfer to yourself' });
    }

    await connection.beginTransaction();

    // Get sender's current balance
    const [senders] = await connection.execute(
      'SELECT id, username, balance FROM users WHERE id = ? FOR UPDATE',
      [req.user.id]
    );

    if (senders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Sender not found' });
    }

    const sender = senders[0];
    const senderBalance = parseFloat(sender.balance);

    if (senderBalance < amount) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    // Get recipient
    const [recipients] = await connection.execute(
      'SELECT id, username, balance FROM users WHERE id = ? AND role = ? FOR UPDATE',
      [recipient_id, 'user']
    );

    if (recipients.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Recipient not found' });
    }

    const recipient = recipients[0];
    const recipientBalance = parseFloat(recipient.balance);

    // Calculate new balances
    const newSenderBalance = senderBalance - amount;
    const newRecipientBalance = recipientBalance + amount;

    // Update sender balance
    await connection.execute(
      'UPDATE users SET balance = ?, total_spent = total_spent + ? WHERE id = ?',
      [newSenderBalance, amount, req.user.id]
    );

    // Update recipient balance
    await connection.execute(
      'UPDATE users SET balance = ?, total_earned = total_earned + ? WHERE id = ?',
      [newRecipientBalance, amount, recipient_id]
    );

    // Create transfer record
    const [transferResult] = await connection.execute(
      `INSERT INTO transfers (sender_id, recipient_id, amount, note, status)
       VALUES (?, ?, ?, ?, 'completed')`,
      [req.user.id, recipient_id, amount, note || null]
    );

    const transferId = transferResult.insertId;

    // Create transaction record for sender
    const [senderTxn] = await connection.execute(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
       VALUES (?, 'transfer_out', ?, ?, ?, 'transfer', ?, ?)`,
      [req.user.id, amount, senderBalance, newSenderBalance, transferId, `Transfer to ${recipient.username}${note ? ': ' + note : ''}`]
    );

    // Create transaction record for recipient
    const [recipientTxn] = await connection.execute(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
       VALUES (?, 'transfer_in', ?, ?, ?, 'transfer', ?, ?)`,
      [recipient_id, amount, recipientBalance, newRecipientBalance, transferId, `Transfer from ${sender.username}${note ? ': ' + note : ''}`]
    );

    await connection.commit();

    // Process referral commissions for both parties
    const referralService = req.app.get('referralService');
    if (referralService) {
      referralService.processReferralCommission(req.user.id, senderTxn.insertId, 'transfer_out', amount);
      referralService.processReferralCommission(recipient_id, recipientTxn.insertId, 'transfer_in', amount);
    }

    res.json({
      success: true,
      message: `Successfully transferred ${amount} ZYNK to ${recipient.username}`,
      data: {
        transferId,
        amount,
        recipient: recipient.username,
        newBalance: newSenderBalance
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Transfer error:', error);
    res.status(500).json({ success: false, message: 'Transfer failed' });
  } finally {
    connection.release();
  }
});

// Get transfer history
router.get('/transfers', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const type = req.query.type; // 'sent', 'received', or empty for all

    let whereClause = '(t.sender_id = ? OR t.recipient_id = ?)';
    let params = [req.user.id, req.user.id];

    if (type === 'sent') {
      whereClause = 't.sender_id = ?';
      params = [req.user.id];
    } else if (type === 'received') {
      whereClause = 't.recipient_id = ?';
      params = [req.user.id];
    }

    const [transfers] = await db.pool.query(
      `SELECT t.*,
              sender.username as sender_username,
              recipient.username as recipient_username,
              CASE WHEN t.sender_id = ? THEN 'sent' ELSE 'received' END as direction
       FROM transfers t
       JOIN users sender ON t.sender_id = sender.id
       JOIN users recipient ON t.recipient_id = recipient.id
       WHERE ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, ...params, parseInt(limit), parseInt(offset)]
    );

    const [countResult] = await db.pool.query(
      `SELECT COUNT(*) as total FROM transfers t WHERE ${whereClause}`,
      params
    );

    // Format transfers for frontend
    const formattedTransfers = transfers.map(t => ({
      id: t.id,
      amount: parseFloat(t.amount),
      note: t.note,
      status: t.status,
      direction: t.direction,
      sender: t.sender_username,
      recipient: t.recipient_username,
      created_at: t.created_at
    }));

    res.json({
      success: true,
      data: {
        transfers: formattedTransfers,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get transfers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get transfers' });
  }
});

// Add funds (for demo - in production would integrate payment gateway)
router.post('/deposit', [
  body('amount').isFloat({ min: 1 })
], async (req, res) => {
  const connection = await db.getConnection();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { amount } = req.body;

    await connection.beginTransaction();

    // Get current balance
    const [users] = await connection.execute(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE',
      [req.user.id]
    );

    const currentBalance = parseFloat(users[0].balance);
    const newBalance = currentBalance + amount;

    // Update balance
    await connection.execute(
      'UPDATE users SET balance = ? WHERE id = ?',
      [newBalance, req.user.id]
    );

    // Record transaction
    const [txnResult] = await connection.execute(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, description)
       VALUES (?, 'deposit', ?, ?, ?, 'admin', ?)`,
      [req.user.id, amount, currentBalance, newBalance, `Deposit of ${amount} coins`]
    );

    await connection.commit();

    // Process referral commission
    const referralService = req.app.get('referralService');
    if (referralService) {
      referralService.processReferralCommission(req.user.id, txnResult.insertId, 'deposit', amount);
    }

    res.json({
      success: true,
      message: 'Deposit successful',
      data: {
        amount,
        newBalance
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Deposit error:', error);
    res.status(500).json({ success: false, message: 'Deposit failed' });
  } finally {
    connection.release();
  }
});

// Withdraw funds (for demo)
router.post('/withdraw', [
  body('amount').isFloat({ min: 1 })
], async (req, res) => {
  const connection = await db.getConnection();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { amount } = req.body;

    await connection.beginTransaction();

    // Same deposit-gate as /withdraw-request.
    const [depositSum] = await connection.execute(
      `SELECT COUNT(*) AS deposit_count, COALESCE(SUM(price), 0) AS total_inr
         FROM zynk_orders
        WHERE user_id = ? AND status = 'completed'`,
      [req.user.id]
    );
    const depositCount = parseInt(depositSum[0]?.deposit_count, 10) || 0;
    const totalDepositedInr = parseFloat(depositSum[0]?.total_inr) || 0;
    if (depositCount === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `You haven't made any deposits yet. Add funds first to unlock withdrawals.`,
      });
    }
    if (totalDepositedInr < MIN_DEPOSIT_INR_FOR_WITHDRAWAL) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Withdrawals unlock after you've deposited at least ₹${MIN_DEPOSIT_INR_FOR_WITHDRAWAL}. You've deposited ₹${Math.floor(totalDepositedInr)} so far.`,
      });
    }

    // Get current balance
    const [users] = await connection.execute(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE',
      [req.user.id]
    );

    const currentBalance = parseFloat(users[0].balance);

    if (currentBalance < amount) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const newBalance = currentBalance - amount;

    // Update balance
    await connection.execute(
      'UPDATE users SET balance = ? WHERE id = ?',
      [newBalance, req.user.id]
    );

    // Record transaction
    const [txnResult] = await connection.execute(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, description)
       VALUES (?, 'withdrawal', ?, ?, ?, 'admin', ?)`,
      [req.user.id, amount, currentBalance, newBalance, `Withdrawal of ${amount} coins`]
    );

    await connection.commit();

    // Process referral commission
    const referralService = req.app.get('referralService');
    if (referralService) {
      referralService.processReferralCommission(req.user.id, txnResult.insertId, 'withdrawal', amount);
    }

    res.json({
      success: true,
      message: 'Withdrawal initiated',
      data: {
        amount,
        newBalance
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Withdraw error:', error);
    res.status(500).json({ success: false, message: 'Withdrawal failed' });
  } finally {
    connection.release();
  }
});

module.exports = router;
