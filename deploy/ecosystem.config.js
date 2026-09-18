// PM2 process manager config for the production backend.
//
// Run from the repo root on the server:
//   pm2 startOrReload deploy/ecosystem.config.js
//   pm2 save                 # persist across reboots (after `pm2 startup` once)
//
// Requires server/.env to already exist on the box with production values
// (DATABASE_URL, JWT_SECRET, CORS_ORIGIN, SMTP_*) -- server/src/index.ts
// loads it via `import 'dotenv/config'`, so PM2 itself needs no env
// handling. server/.env is never committed to git; create it once by hand
// on the server (see deploy/README.md).
module.exports = {
  apps: [
    {
      name: 'opd-care-server',
      cwd: 'server',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
      autorestart: true,
      watch: false,
    },
  ],
};
