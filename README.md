# OPD Care Platform

A multi-tenant clinic/hospital management platform (web + mobile): appointment
booking, live queue/token tracking, doctor consultations, pharmacy, lab,
admin scheduling, walk-in registration, and patient medical records.

One hosted deployment serves many clinics ("tenants"), each with isolated
data and its own subscription tier:

| | Tier 1 — OPD | Tier 2 — + Pharmacy + Lab + Radiology | Tier 3 — + In-Patient (IPD) |
|---|---|---|---|
| Patients, consultations, prescriptions, lab/radiology orders | ✅ | ✅ | ✅ |
| Pharmacy (priced inventory, dispensing, receipts) | ❌ | ✅ | ✅ |
| Lab (priced catalog, results, receipts) | ❌ | ✅ | ✅ |
| Radiology (priced catalog, results, receipts) | ❌ | ✅ | ✅ |
| In-patient: wards/beds, admission, transfers, discharge billing | ❌ | ❌ | ✅ |

Front-desk and ward-nursing roles (Receptionist, Nurse, Head Nurse) layer on
top of this tier table rather than gating it — see **Roles** below.

## Structure

This is an npm-workspaces monorepo:

```
shared/   TypeScript types shared by server, web, and mobile (the API contract)
server/   Express + Prisma + PostgreSQL REST API
web/      React (Vite) + Tailwind web app — patients, doctors, admin/reception, pharmacy, lab
mobile/   Expo (React Native) app — patient booking, queue status, records
```

## Roles

- **Patient** — register/login under their clinic, book appointments, see live queue position (token number), view visit history, prescriptions, pharmacy purchases & lab results. Web + mobile.
- **Doctor** — see today's queue ordered by token, check patients in, record vitals/diagnosis/notes/prescriptions/lab test orders. Web.
- **Admin** — full staff/doctor management, all front-desk and in-patient actions, manages pharmacy inventory & lab/radiology catalogs, sees every report. Web.
- **Receptionist** — the front-desk subset of Admin: register walk-in patients and view/check in the day's appointments (`/reception`). Cannot manage doctors, staff, catalogs, or see any clinical/financial data — deliberately excluded from patient records for privacy, since front desk only needs appointment/demographic info, not diagnoses or results.
- **Pharmacist** (Tier 2+) — counter workflow: search patient → see prescriptions from their visits, auto-matched to inventory with quantity/price pre-filled → confirm or edit → receipt, with stock decremented automatically. Web.
- **Lab Technician** (Tier 2+) — same pattern for doctor-ordered lab tests: auto-matched to the priced catalog, record results, receipt. Web.
- **Radiology Technician** (Tier 2+) — same pattern again for doctor-ordered radiology/imaging tests (X-Ray, ultrasound, CT, MRI, etc.): auto-matched to the priced catalog, record results, receipt. Web.
- **Nurse** (Tier 3+) — ward-floor clinical logging on an admission: vitals, medications given. Can view admissions/patient records for clinical continuity, but cannot admit, discharge, transfer beds, or see any billing figure — the admission detail page hides those sections and the server independently rejects the underlying requests.
- **Head Nurse** (Tier 3+) — everything a Nurse can do, plus bed/ward management: transfer a patient between beds, mark a bed under maintenance, and view (read-only) the bill preview and final bill. Admission and discharge — the two actions with real financial/legal weight — stay Admin/Doctor only even for Head Nurse.

Admins (and doctors, for the follow-ups view and in-patient management) also get:
- A **Reports** page: a financial report covering Pharmacy, Lab, and
  Radiology (Actual vs. Total ordered — Tier 2+), a daily OPD activity report, and a follow-ups-due
  dashboard (overdue / due today / due this week) with a "mark contacted"
  action, driven by an optional follow-up date doctors can set on a
  consultation.
- **In-Patient / IPD** (Tier 3+): set up wards and bulk-add beds at a daily
  rate, admit a patient to a vacant bed with a deposit, log doctor visits,
  procedures (with a consent-signed flag), medications given (clinic-supplied
  and billed, or the patient's own and not billed), periodic vitals with an
  inline trend chart, room transfers (billed per bed/day segment at each
  bed's own rate), ad-hoc charges, and quick in-patient pharmacy/lab/radiology
  charges. Discharge computes a final bill from every charge source and nets
  out the deposit — the result can be a refund owed, not just an amount due,
  and the UI presents that as a normal outcome rather than an error state.

## Multi-tenancy

Every clinic ("tenant") is a `Clinic` row with its own `slug` (used to sign
in), `tier`, and tax rate. All data — users, appointments, pharmacy
inventory, lab catalog, sales, invoices — is scoped by `clinicId`, enforced
server-side on every query (never trust a client-supplied clinic ID). A new
clinic self-registers at `/register-clinic` in the web app, which creates
the `Clinic` plus its first `ADMIN` user. Login and patient self-registration
both require the clinic's `slug` alongside email/password.

Tier-gated routes (`/api/pharmacy/*`, `/api/lab/*`, `/api/radiology/*`) check
the clinic's current tier fresh on every request, not at login — so
upgrading a clinic's tier takes effect immediately without forcing a
re-login.

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

## Seed data

The seed script creates a demo clinic (`demo-clinic`) with sample pharmacy
inventory, a lab test catalog, and a radiology test catalog:

| Role       | Email                       | Password         |
|------------|------------------------------|------------------|
| Admin      | admin@opdcare.test           | admin123         |
| Doctor     | doctor@opdcare.test          | doctor123        |
| Patient    | patient@opdcare.test         | patient123       |
| Pharmacist | pharmacist@opdcare.test      | pharmacist123    |
| Lab Tech   | labtech@opdcare.test         | labtech123       |
| Radiology  | radiologytech@opdcare.test   | radiologytech123 |
| Receptionist | receptionist@opdcare.test  | receptionist123  |
| Nurse      | nurse@opdcare.test          | nurse123         |
| Head Nurse | headnurse@opdcare.test      | headnurse123     |

`demo-clinic` is seeded at **Tier 3**, with a General Ward (6 beds, ₹1200/day)
and an ICU (3 beds, ₹4500/day). Sign in with clinic code **`demo-clinic`**.
Use `/register-clinic` in the web app to spin up an additional lower-tier
clinic to see tenant isolation and tier gating in action.

## Automated tests

An integration test suite for the server (Jest + Supertest against a real,
dedicated test Postgres database — `opd_care_test`, never the dev/demo
database) locks in the invariants that were previously only verified by hand
each round: multi-tenancy isolation, tier gating (including a live
upgrade/downgrade taking effect on an already-issued token, no re-login), the
full Receptionist/Nurse/Head-Nurse/Pharmacist/Lab-Tech/Radiology-Tech role
boundary matrix, the strip-vs-per-unit pricing math, the "own recorded
charge never re-derived from a changed catalog price" invariant (Pharmacy
Reports and IPD radiology charges), per-occupied-bed-segment room billing,
and deposit-refund-as-normal-outcome. Plus fast unit tests for the pure
utility functions (`findBestNameMatch`, `suggestPharmacyQuantity`,
`computeRoomCharges`) that don't need a database at all.

```bash
# One-time: create the test database (skip if it already exists)
psql "postgresql://opd:opd@localhost:5432/postgres" -c "CREATE DATABASE opd_care_test OWNER opd"

# Run the suite (applies pending migrations to opd_care_test automatically, via "pretest")
npm run test:server
```

`server/tests/unit/` holds the DB-free unit tests; everything else in
`server/tests/` spins up the real Express app (`server/src/app.ts`, split out
from `index.ts` precisely so tests can import it without binding a port) via
Supertest, backed by the real Prisma client pointed at `opd_care_test`
(`server/.env.test`). Each test creates its own clinic(s) with random
slugs/emails, so test files are independent of each other and safe to run in
parallel in CI even though this sandbox runs them serially (`--runInBand`)
for reliability. There is currently no web/mobile UI test layer (Playwright
e2e, component tests) — see **What's not built yet**.

## CI/CD

`.github/workflows/ci.yml` runs on every push and pull request to `main`: a
Postgres 16 service container, `npm ci`, `prisma generate`, then the full
build sweep (shared/server/web, mobile typecheck) and the server test suite
against that service's `opd_care_test` database — the exact same commands
and `server/.env.test` connection string used locally, so a green run
locally and a green run in CI mean the same thing. There's no deploy step
yet (see **What's not built yet**); it's build+test verification only.

## API contract

All request/response shapes live in `shared/src/index.ts` — it's the single
source of truth consumed by both the web and mobile clients. See
`server/src/routes/*.ts` for the corresponding Express endpoints (all under
`/api`, JWT bearer auth via `Authorization: Bearer <token>`; the JWT carries
the user's `clinicId` and every route scopes its queries by it).

## Design notes carried over from the reference build

- **Catalog auto-match with a free-text escape hatch.** Pharmacy/Lab counter
  screens match a doctor's free-text order to the priced catalog by name,
  pre-fill quantity/price, and default to one-click confirm — but every line
  stays editable and a non-matching name is never blocked.
- **Strip vs. per-unit pricing.** `PharmacyItem.pricePerUnit` and
  `stockUnits` are always normalized to a single base unit (a tablet/piece);
  `unitsPerStrip` is display/suggestion metadata only. Every quantity × price
  calculation multiplies `quantityInUnits × pricePerUnit`, so there's no
  strip-vs-tablet ambiguity to get wrong.
- **Dispensed/resulted lines record their own charge.** A `PharmacySaleItem`
  / `LabResultItem` / `RadiologyResultItem` stores its own
  `medicineName`/`testName` and price at the time of sale, rather than
  re-deriving it from the current catalog. The Reports "Actual vs. Total
  ordered" numbers rely on exactly this: once a prescription/lab/radiology
  order has a linked sale/result item, its contribution to "Total ordered" is
  that item's own recorded charge, forever — even if the catalog price
  changes afterward. Verified directly for Radiology: billing an MRI at its
  ₹6,000 catalog price, then bumping the catalog price to ₹7,000/₹8,000/₹9,000
  across further bookings, left every already-billed item's contribution to
  the financial report at its own originally recorded price — the report's
  total was an exact sum of each item's own stored price, never the live
  catalog price. The same invariant carries into IPD: an admission's
  `radiologyCharges` is the linked invoice's own stored total, and does not
  shift when the catalog price changes after that invoice was created.
- **Deposits net against the final bill, and the result can be negative.**
  IPD discharge billing computes `total - depositAmount`; when the deposit
  was larger, `amountDue` is negative and the UI labels it "Refund Owed"
  rather than treating it as an error. Verified directly: admitting with a
  ₹20,000 deposit against a ₹1,260 bill produces `amountDue: -18740`.
- **Room charges are computed per occupied-bed segment, not one rate for the
  whole stay.** A room transfer splits the stay into segments at each bed's
  own daily rate — verified directly: a stay split between a ₹1200/day
  general ward bed and a ₹4500/day ICU bed billed as two one-day segments
  (₹5700 total), not the general ward's rate applied throughout.
- **UI role-hiding is a convenience, never the access boundary.** Every
  Nurse/Head-Nurse/Receptionist restriction (no admit/discharge, no billing
  visibility for Nurse, no clinical records for Receptionist, etc.) is a
  `requireRole(...)` check on the Express route itself, independent of
  whichever buttons the web app happens to render for that role. Verified
  directly with raw API calls bypassing the UI entirely: a Nurse's token
  gets 403 on `POST /ipd/admissions/:id/transfer`, `POST .../discharge`, and
  `GET .../bill-preview` even though nothing stops a browser from sending
  those requests; a Head Nurse's token gets 200 on transfer/bill-preview but
  still 403 on admission and discharge.
- **A clean install must regenerate the Prisma Client — this isn't
  optional.** `@prisma/client`'s generated code is written to `node_modules`
  (hoisted to the repo root under npm workspaces) by `prisma generate`, and
  a fresh `npm ci` does not run that automatically. Locally this stays
  invisible for months because `node_modules` already has a generated
  client from the last `prisma generate` you ran by hand — it only breaks on
  a genuinely clean checkout, which is exactly what CI does on every run.
  Caught directly while building the CI workflow: `npm run build:server`
  failed with dozens of `Module '"@prisma/client"' has no exported member`
  errors after a clean `npm ci`, even though the exact same command had been
  passing locally all along. Fixed with a `postinstall: "prisma generate"`
  script on the server workspace (so any install regenerates it, dev or CI)
  plus an explicit generate step in the workflow as a second line of
  defense.

## What's not built yet

Built so far: Tier 1 OPD core, Tier 2 Pharmacy/Lab/Radiology, Tier 3 IPD,
Reporting (financial Actual-vs-Total across all three revenue modules, daily
activity, follow-ups due), granular front-desk/nursing staff roles
(Receptionist, Nurse, Head Nurse), a server integration test suite, and a
CI workflow that runs it on every push/PR, on a multi-tenant hosted
architecture. Deliberately deferred:
- DICOM worklist / ultrasound integration (deferred — assumes a LAN-attached
  device and an offline/on-prem deployment model, which this hosted
  architecture doesn't provide)
- Web/mobile UI test layer (Playwright e2e, component tests) — only the
  server has automated tests so far
- SMS/email/push notifications, billing/payments, file uploads
- CD: no deploy step yet — CI currently only builds and tests, it doesn't
  ship anywhere
- Fixed time-slot booking (currently token/queue-based per day, not per time slot)
