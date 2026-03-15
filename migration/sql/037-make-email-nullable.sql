-- Make email nullable so users can register with phone only
ALTER TABLE users MODIFY COLUMN email VARCHAR(100) NULL DEFAULT NULL;
