#!/usr/bin/env node
// Generate ADMIN_PASSWORD_HASH for the /admin login.
// Usage:  node scripts/hash-password.mjs '<your password>'
// Output format matches functions/_lib/auth.js verifyPassword (PBKDF2-HMAC-SHA256).
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error("usage: node scripts/hash-password.mjs '<password>'");
  process.exit(1);
}

// OWASP 2023 guidance for PBKDF2-HMAC-SHA256. verifyPassword reads the iteration
// count from the stored hash, so raising this is backward-compatible — existing
// hashes keep verifying; re-run this script to upgrade to the new work factor.
const iterations = 600000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const stored = `pbkdf2$sha256$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`;

console.log(stored);
console.error('\nSet it as a secret:');
console.error('  npx wrangler pages secret put ADMIN_PASSWORD_HASH');
console.error('  (paste the line above when prompted)');
