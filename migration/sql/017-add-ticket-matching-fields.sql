-- Migration: Add ticket matching and cash-out fields to numbers table
-- Implements arc.md TODO items 1-6, 12-14

-- Add matched_digits to track sequential digit matches
ALTER TABLE numbers
ADD COLUMN matched_digits INT NOT NULL DEFAULT 0
COMMENT 'Number of sequential digits matched from index 0';

-- Add current_return calculated field
ALTER TABLE numbers
ADD COLUMN current_return DECIMAL(15,2) NOT NULL DEFAULT 0
COMMENT 'Current payout value = buy_amount * multiplier';

-- Add ticket_status for state management
ALTER TABLE numbers
ADD COLUMN ticket_status ENUM('active', 'matching', 'lost', 'won', 'cashed_out', 'sold') DEFAULT 'active'
COMMENT 'Ticket lifecycle status';

-- Add locked_at for concurrency control
ALTER TABLE numbers
ADD COLUMN locked_at TIMESTAMP NULL
COMMENT 'Lock timestamp for atomic operations';

-- Add buy_amount to track original purchase price
ALTER TABLE numbers
ADD COLUMN buy_amount DECIMAL(10,2) NULL
COMMENT 'Amount paid when ticket was purchased';

-- Add cash-out tracking fields
ALTER TABLE numbers
ADD COLUMN cashed_out_at TIMESTAMP NULL
COMMENT 'When the ticket was cashed out';

ALTER TABLE numbers
ADD COLUMN cashout_matched_digits INT NULL
COMMENT 'Matched digits at time of cash-out';

ALTER TABLE numbers
ADD COLUMN cashout_multiplier DECIMAL(5,2) NULL
COMMENT 'Multiplier applied at cash-out';

ALTER TABLE numbers
ADD COLUMN cashout_payout DECIMAL(15,2) NULL
COMMENT 'Final payout amount at cash-out';

-- Add draw_id to track which draw this ticket is participating in
ALTER TABLE numbers
ADD COLUMN draw_id INT NULL
COMMENT 'Current draw participation';

-- Add last_reveal_index to track which reveal was last processed
ALTER TABLE numbers
ADD COLUMN last_reveal_index INT NOT NULL DEFAULT 0
COMMENT 'Last processed reveal index for idempotency';

-- Add indexes for efficient queries
ALTER TABLE numbers
ADD INDEX idx_ticket_status (ticket_status);

ALTER TABLE numbers
ADD INDEX idx_draw_id (draw_id);

ALTER TABLE numbers
ADD INDEX idx_locked (locked_at);
