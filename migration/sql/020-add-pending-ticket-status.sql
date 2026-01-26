-- Migration: Add 'pending' status to ticket_status ENUM for upcoming session purchases

ALTER TABLE numbers
MODIFY COLUMN ticket_status ENUM('pending', 'active', 'matching', 'lost', 'won', 'cashed_out', 'sold') DEFAULT 'active'
COMMENT 'Ticket lifecycle status - pending for upcoming session purchases';
