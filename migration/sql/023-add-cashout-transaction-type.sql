ALTER TABLE transactions
MODIFY COLUMN type ENUM('deposit', 'withdrawal', 'purchase', 'sale', 'vote', 'prize', 'refund', 'transfer_out', 'transfer_in', 'cashout') NOT NULL;
