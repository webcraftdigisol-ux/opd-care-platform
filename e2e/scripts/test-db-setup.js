// Runs before the e2e suite (see "pretest" in package.json). Loads .env.e2e
// so `prisma migrate deploy` targets the dedicated e2e database -- never the
// dev or Jest test database -- then applies any pending migrations to it.
// Uses the server workspace's schema since e2e has no Prisma setup of its own.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.e2e') });
const { execSync } = require('child_process');

const schemaPath = path.join(__dirname, '..', '..', 'server', 'prisma', 'schema.prisma');
execSync(`npx prisma migrate deploy --schema=${schemaPath}`, { stdio: 'inherit', env: process.env });
