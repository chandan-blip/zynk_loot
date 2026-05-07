// Maps a 2Factor.in session_id to the phone number we sent OTP to.
// Binding the phone server-side prevents the client from registering with a
// different phone than the one that received the OTP.
const sessions = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutes — 2Factor OTPs expire well before this.

function cleanup() {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (v.expiresAt < now) sessions.delete(k);
  }
}

function set(sessionId, phone) {
  cleanup();
  sessions.set(sessionId, { phone, expiresAt: Date.now() + TTL_MS });
}

function get(sessionId) {
  cleanup();
  return sessions.get(sessionId) || null;
}

function consume(sessionId) {
  const v = get(sessionId);
  sessions.delete(sessionId);
  return v;
}

module.exports = { set, get, consume };
