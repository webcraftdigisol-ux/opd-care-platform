# OPD Care Platform

A web application and mobile application for managing an Outpatient Department (OPD): appointment booking, live queue/token tracking, doctor consultations, admin scheduling, walk-in registration, and patient medical records.

## Structure

This is an npm-workspaces monorepo:

```
shared/   TypeScript types shared by server, web, and mobile (the API contract)
server/   Express + Prisma + PostgreSQL REST API
web/      React (Vite) + Tailwind web app — patients, doctors, admin/reception
mobile/   Expo (React Native) app — patient booking, queue status, records
```

## Roles

- **Patient** — register/login, book appointments, see live queue position (token number), view visit history & prescriptions. Web + mobile.
- **Doctor** — see today's queue ordered by token, check patients in, record vitals/diagnosis/notes/prescriptions. Web.
- **Admin / reception** — add doctors, set weekly doctor availability, register walk-in patients, view all appointments for a day. Web.

## Prerequisites

- Node.js 20+
- PostgreSQL (or use the provided `docker-compose.yml`)
- Expo Go app (or an emulator) for the mobile app

## Setup

```bash
# 1. Install all workspace dependencies
npm install

# 2. Start PostgreSQL (or point DATABASE_URL at your own instance)
docker compose up -d

# 3. Configure the server
cp server/.env.example server/.env
# edit server/.env if needed (DATABASE_URL, JWT_SECRET)

# 4. Create the database schema and seed demo data
npm run build:shared
npx prisma migrate dev --schema server/prisma/schema.prisma
npm run prisma:seed -w server

# 5. Configure the web app
cp web/.env.example web/.env

# 6. Configure the mobile app
cp mobile/.env.example mobile/.env
# on a physical device/emulator, point EXPO_PUBLIC_API_URL at your machine's LAN IP, not localhost
```

## Running in development

```bash
npm run dev:server   # http://localhost:4000
npm run dev:web      # http://localhost:5173

cd mobile && npm start   # Expo dev server
```

## Seed accounts

| Role    | Email                  | Password  |
|---------|-------------------------|-----------|
| Admin   | admin@opdcare.test      | admin123  |
| Doctor  | doctor@opdcare.test     | doctor123 |
| Patient | patient@opdcare.test    | patient123|

## API contract

All request/response shapes live in `shared/src/index.ts` — it's the single source of truth consumed by both the web and mobile clients. See `server/src/routes/*.ts` for the corresponding Express endpoints (all under `/api`, JWT bearer auth via `Authorization: Bearer <token>`).

## What's not built yet

This is an MVP scaffold covering the core OPD workflow end-to-end. Follow-ups worth planning next:
- Automated tests (unit/integration/e2e)
- SMS/email/push notifications (booking confirmations, queue alerts)
- Billing/payments
- File uploads (lab reports, scanned documents)
- CI/CD pipeline and production deployment config
- Fixed time-slot booking (currently token/queue-based per day, not per time slot)
