# OPD Care Platform

A multi-tenant clinic/hospital management platform (web + mobile): appointment
booking, live queue/token tracking, doctor consultations, pharmacy, lab,
admin scheduling, walk-in registration, and patient medical records.

One hosted deployment serves many clinics ("tenants"), each with isolated
data and its own subscription tier:

| | Tier 1 — OPD | Tier 2 — + Pharmacy + Lab | Tier 3 — + In-Patient (IPD) |
|---|---|---|---|
| Patients, consultations, prescriptions, lab orders | ✅ | ✅ | ✅ |
| Pharmacy (priced inventory, dispensing, receipts) | ❌ | ✅ | ✅ |
| Lab (priced catalog, results, receipts) | ❌ | ✅ | ✅ |
| In-patient: wards/beds, admission, transfers, discharge billing | ❌ | ❌ | ✅ |

Radiology and granular staff roles beyond Pharmacist/Lab Technician are
planned follow-ups — see **What's not built yet** below.

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
- **Admin / reception** — add doctors & pharmacy/lab staff, set weekly doctor availability, register walk-in patients, manage pharmacy inventory & lab catalog, view all appointments for a day. Web.
- **Pharmacist** (Tier 2+) — counter workflow: search patient → see prescriptions from their visits, auto-matched to inventory with quantity/price pre-filled → confirm or edit → receipt, with stock decremented automatically. Web.
- **Lab Technician** (Tier 2+) — same pattern for doctor-ordered lab tests: auto-matched to the priced catalog, record results, receipt. Web.

Admins (and doctors, for the follow-ups view and in-patient management) also get:
- A **Reports** page: a Pharmacy/Lab financial report (Actual vs. Total
  ordered — Tier 2+), a daily OPD activity report, and a follow-ups-due
  dashboard (overdue / due today / due this week) with a "mark contacted"
  action, driven by an optional follow-up date doctors can set on a
  consultation.
- **In-Patient / IPD** (Tier 3+): set up wards and bulk-add beds at a daily
  rate, admit a patient to a vacant bed with a deposit, log doctor visits,
  procedures (with a consent-signed flag), medications given (clinic-supplied
  and billed, or the patient's own and not billed), periodic vitals with an
  inline trend chart, room transfers (billed per bed/day segment at each
  bed's own rate), ad-hoc charges, and quick in-patient pharmacy/lab charges.
  Discharge computes a final bill from every charge source and nets out the
  deposit — the result can be a refund owed, not just an amount due, and the
  UI presents that as a normal outcome rather than an error state.

## Multi-tenancy

Every clinic ("tenant") is a `Clinic` row with its own `slug` (used to sign
in), `tier`, and tax rate. All data — users, appointments, pharmacy
inventory, lab catalog, sales, invoices — is scoped by `clinicId`, enforced
server-side on every query (never trust a client-supplied clinic ID). A new
clinic self-registers at `/register-clinic` in the web app, which creates
the `Clinic` plus its first `ADMIN` user. Login and patient self-registration
both require the clinic's `slug` alongside email/password.

Tier-gated routes (`/api/pharmacy/*`, `/api/lab/*`) check the clinic's
current tier fresh on every request, not at login — so upgrading a clinic's
tier takes effect immediately without forcing a re-login.

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

The seed script creates one Tier 2 demo clinic (`demo-clinic`) with sample
pharmacy inventory and a lab test catalog:

| Role       | Email                     | Password      |
|------------|----------------------------|---------------|
| Admin      | admin@opdcare.test         | admin123      |
| Doctor     | doctor@opdcare.test        | doctor123     |
| Patient    | patient@opdcare.test       | patient123    |
| Pharmacist | pharmacist@opdcare.test    | pharmacist123 |
| Lab Tech   | labtech@opdcare.test       | labtech123    |

`demo-clinic` is seeded at **Tier 3**, with a General Ward (6 beds, ₹1200/day)
and an ICU (3 beds, ₹4500/day). Sign in with clinic code **`demo-clinic`**.
Use `/register-clinic` in the web app to spin up an additional lower-tier
clinic to see tenant isolation and tier gating in action.

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
  / `LabResultItem` stores its own `medicineName`/`testName` and price at the
  time of sale, rather than re-deriving it from the current catalog. The
  Reports "Actual vs. Total ordered" numbers rely on exactly this: once a
  prescription/lab order has a linked sale/result item, its contribution to
  "Total ordered" is that item's own recorded charge, forever — even if the
  catalog price changes afterward. Verified directly: dispensing an item at a
  price different from its catalog price, then changing the catalog price
  again, leaves both Actual and Total ordered unchanged at the original
  billed amount.
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

## What's not built yet

Built so far: Tier 1 OPD core, Tier 2 Pharmacy/Lab, Tier 3 IPD, and Reporting
(financial Actual-vs-Total, daily activity, follow-ups due), on a
multi-tenant hosted architecture. Deliberately deferred:
- **Radiology**: a priced module mirroring Lab
- **Granular staff roles**: receptionist/nurse/head-nurse distinctions
  beyond today's Admin/Pharmacist/Lab-Technician split
- DICOM worklist / ultrasound integration (deferred — assumes a LAN-attached
  device and an offline/on-prem deployment model, which this hosted
  architecture doesn't provide)
- Automated tests (unit/integration/e2e)
- SMS/email/push notifications, billing/payments, file uploads
- CI/CD pipeline and production deployment config
- Fixed time-slot booking (currently token/queue-based per day, not per time slot)
