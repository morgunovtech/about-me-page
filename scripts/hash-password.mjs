#!/usr/bin/env node
// Generate ADMIN_PASSWORD_HASH for the /admin login.
// Usage:  node scripts/hash-password.mjs '<your password>'
// Output format matches functions/_lib/auth.js verifyPassword (PBKDF2-HMAC-SHA256).
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const password = process.argv[2];
// Piped into `wrangler pages secret put`, the hash must not end with a newline.
if (!password) {
  console.error("usage: node scripts/hash-password.mjs '<password>'");
  process.exit(1);
}

// The ceiling of Cloudflare Workers: their Web Crypto refuses PBKDF2 above
// 100 000 iterations («Pbkdf2 failed: iteration counts above 100000 are not
// supported»), so a hash made with more can never verify on the site — the 600 000
// this script used from v0.24 (OWASP 2023) locked the owner out on 2026-11-25.
// Local `wrangler dev` does not enforce the cap; production does. verifyPassword
// reads the count from the stored hash and refuses anything above this ceiling.
const iterations = 100000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const stored = `pbkdf2$sha256$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`;

process.stdout.write(stored + (process.stdout.isTTY ? '\n' : ''));
console.error('\nSet it as a secret:');
console.error('  npx wrangler pages secret put ADMIN_PASSWORD_HASH');
console.error('  (paste the line above when prompted)');
