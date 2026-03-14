-- Migration: Create instant games bet records

CREATE TABLE IF NOT EXISTS game_bets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    game_type ENUM('coin_flip', 'dice_roll', 'lucky_spin') NOT NULL,
    bet_amount DECIMAL(15,2) NOT NULL,
    win_amount DECIMAL(15,2) DEFAULT 0,
    multiplier DECIMAL(10,2) DEFAULT 0,
    result VARCHAR(50) NOT NULL,
    is_win BOOLEAN NOT NULL DEFAULT FALSE,
    details JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_game (user_id, game_type),
    INDEX idx_user_created (user_id, created_at),
    INDEX idx_game_created (game_type, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add game_bet transaction types
ALTER TABLE transactions
  MODIFY COLUMN type ENUM('deposit', 'withdrawal', 'purchase', 'sale', 'vote', 'prize', 'refund', 'transfer_out', 'transfer_in', 'cashout', 'referral_commission', 'invest', 'invest_return', 'invest_withdraw', 'game_bet', 'game_win') NOT NULL;
