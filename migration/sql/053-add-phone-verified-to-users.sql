-- Track whether the user's phone number has been verified via OTP (Firebase Phone Auth).
-- Existing rows default to 0 (unverified) so legacy users are grandfathered without disruption.
ALTER TABLE users
  ADD COLUMN phone_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER phone;
