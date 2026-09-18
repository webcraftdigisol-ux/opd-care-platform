// Runs before the test suite (see "pretest" in package.json). Loads .env.test
// so `prisma migrate deploy` targets the dedicated test database -- never the
// dev database -- then applies any pending migrations to it.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });
const { execSync } = require('child_process');

execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
