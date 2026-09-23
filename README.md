# OPD Care Platform

A multi-tenant clinic/hospital management platform (web + mobile): fixed
time-slot appointment booking, live queue/token tracking, doctor
consultations, pharmacy, lab, admin scheduling, walk-in registration,
patient medical records, billing/payment recording, and email notifications.

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

This is an npm-workspaces monorepo (`shared/`, `server/`, `web/`, `mobile/`);
`deploy/` and `e2e/` sit alongside it as plain (non-workspace) directories:

```
shared/   TypeScript types shared by server, web, and mobile (the API contract)
server/   Express + Prisma + PostgreSQL REST API
web/      React (Vite) + Tailwind web app — patients, doctors, admin/reception, pharmacy, lab
mobile/   Expo (React Native) app — patient booking, queue status, records
e2e/      Playwright end-to-end tests, driving the real web app + API
deploy/   PM2/Nginx config + the CD GitHub Actions workflow (see CI/CD below)
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

## Booking

Patient appointments are fixed time slots, not just a same-day token queue.
A doctor's `slotMinutes` (admin-settable, default 15) splits each of their
`Schedule` windows for a given day into a grid; `GET /doctors/:id/slots?date=`
returns that grid with each slot's `available` flag, and the web/mobile
booking screens render it as pickable buttons/chips instead of a bare date
field. Booking `POST /appointments` validates the chosen `startTime` against
that exact same grid (`server/src/utils/availableSlots.ts` is the one
function both endpoints call), so what the UI shows as bookable and what the
API accepts can never drift apart.

A walk-in (`POST /appointments/walk-in`) is deliberately **not** slotted —
`Appointment.startTime` is null for it, and it's queued in as-they-arrive the
same way it always was. Slots exist for scheduled patients; walk-ins fit into
the gaps a real front desk manages by eye. Appointment lists (a doctor's
queue, the admin/reception day view, a patient's own appointments) sort by
`startTime` first so slotted visits show in actual visit order, with
same-day walk-ins falling after them by booking order.

## Billing & Payments

Every doctor has a `consultationFee`, snapshotted onto the `Appointment` at
booking/walk-in time — the same own-recorded-charge discipline as Pharmacy/
Lab/Radiology, so a later change to a doctor's fee never rewrites an
already-booked visit. A single `Payment` ledger (cash/card/UPI/net-banking/
wallet, recorded manually by staff at the counter) tracks amount paid and
balance due against any bill type — consultation, pharmacy sale, lab
invoice, radiology invoice, or an IPD admission's final bill — with access
gated per bill type to exactly the staff who can already see that bill
(Pharmacist for Pharmacy, Lab Technician for Lab, and so on; IPD payments
stay Admin/Doctor-only, matching admit/discharge). A patient can check their
own bill's payment status but not anyone else's. For IPD specifically, the
payable amount is the bill's `amountDue` (total minus deposit already
collected), never the raw bill total — an overpaid deposit correctly shows
₹0 payable through this ledger rather than double-charging the difference.

**Not built**: a live payment gateway (Razorpay, Stripe, etc.) for
patient-initiated online checkout. This is a deliberate scoping decision,
not an oversight — there's no real merchant sandbox credentials available to
test an integration like that against, and shipping an unverified checkout
flow would be worse than not shipping one. The schema reserves
`razorpayOrderId`/`razorpayPaymentId` fields on `Payment` for exactly this,
so a real gateway integration slots in without a schema change once a
clinic has real credentials to test against.

## Notifications

Email notifications (via `nodemailer`, SMTP configured through
`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`) fire on:
appointment booked/walk-in confirmation, payment received (with the
remaining balance if partial), IPD discharge summary, a
manually-triggered follow-up reminder from the Reports → Follow-ups tab,
and an automatic day-before appointment reminder (see below). Every
attempt — sent, failed, or skipped — writes a `Notification` row (visible
to Admins at **Notifications** in the nav), so the whole pipeline is
auditable and fully testable even with no real email provider configured:
`SKIPPED` (no SMTP configured, or no usable recipient — e.g. the synthetic
`walkin-<phone>@opd.local` placeholder used for phone-only walk-ins) is a
normal, expected outcome, not a swallowed error. **Not built**: an SMS
channel — the `NotificationChannel` enum already has `SMS` reserved, but
there's no SMS provider account to send through. A WhatsApp channel
*is* built (scaffolded end-to-end, pending real credentials — see below).

### WhatsApp messaging

Alongside email, the automated day-before appointment reminder also
attempts a WhatsApp send, and a doctor can send a saved prescription or a
diet plan to the patient's WhatsApp on demand
(`POST /consultations/:appointmentId/send-prescription-whatsapp`,
`POST /diet-plans/:id/send-whatsapp`). All three funnel through
`notifyPatientWhatsApp()` (`server/src/utils/whatsapp.ts`), which mirrors
`notifyPatientEmail()`'s exact discipline: it never throws, always writes a
`Notification` row (`channel: 'WHATSAPP'`) recording `SENT`/`FAILED`/
`SKIPPED` plus (on success) the provider's message id in the new
`providerMessageId` column, so a route handler always returns 200 with the
real outcome in the response body rather than surfacing a 500 for what is,
from the caller's point of view, an expected possible non-delivery.

**One platform-level WhatsApp number, not one per clinic.** Every clinic's
messages send from the same WhatsApp Business number, with the clinic's
name embedded in the message text (e.g. "Sunrise Clinic: Reminder — ...")
rather than each clinic having its own verified number. This was a
deliberate simplicity/cost tradeoff: Meta Business verification is a
days-to-weeks process per WhatsApp Business number, which would mean a
newly self-registered clinic (see "A brand-new clinic works immediately"
under Subscription Billing) couldn't send a single WhatsApp message until
that finished — breaking the "works immediately" onboarding this platform
otherwise guarantees. Isolation between clinics is enforced entirely at
the application layer (every send, list, and notification row is scoped by
`clinicId`, same as everything else in this schema), not by sender
identity — the standard pattern for multi-tenant notification platforms,
and the same reason a patient who's visited two clinics on this platform
sees both clinics' messages arrive from the same WhatsApp contact,
distinguished only by the clinic name in the text. The one real tradeoff
worth naming: shared number reputation — one clinic's spam complaints
could in principle affect deliverability for every clinic sharing the
number — which isn't mitigated today (no per-clinic send-rate limiting or
template-quality monitoring) but is a v2 concern, not a launch blocker; if
a large clinic later wants its own branded sender, Meta's "Tech Provider"
program is the documented path to that without restructuring this design.

**Consent is enforced inside the send function, not at each call site.**
Meta's WhatsApp Business policy requires a recipient's opt-in before any
business-initiated template message (a reminder, a prescription, or a diet
plan all qualify — none happen inside a patient-initiated 24-hour session
window). `User.whatsappOptIn` (`Boolean`, default `false`) tracks this,
reusing the existing `phone` field as the WhatsApp number rather than
adding a second, driftable phone field. `notifyPatientWhatsApp()` checks
`optedIn` itself before attempting a send — a caller cannot accidentally
bypass consent by forgetting to check first, because there's nothing to
forget; a non-opted-in patient always resolves to a logged `SKIPPED`
Notification (`error: 'Patient has not opted in to WhatsApp messages'`),
never a silent no-op and never a send. A patient opts in themself from a
toggle on their dashboard (`PUT /api/auth/me/whatsapp-optin`,
self-service only — no staff-facing route sets this on someone else's
behalf, since the opt-in has to be the recipient's own).

**Provider-agnostic adapter, stub by default.** `WhatsAppClient`
(`server/src/utils/whatsapp.ts`) is a one-method interface
(`sendTemplatedMessage`); `getWhatsAppClient()` picks a real
`TwilioWhatsAppClient` (built against Twilio's WhatsApp API via Node's
native `fetch`, no new dependency) when `TWILIO_ACCOUNT_SID`/
`TWILIO_AUTH_TOKEN`/`TWILIO_WHATSAPP_FROM` are set, and otherwise falls
back to `StubWhatsAppClient`, which logs the attempt and returns a fake
`stub-<timestamp>-<random>` message id. **No real WhatsApp Business
account exists in this environment** — every send in this codebase today,
tests included, goes through the stub. Configure the three `TWILIO_*`
env vars (and complete Meta's WhatsApp Business + template-approval
process, since a business-initiated send requires an approved message
template, not free-form text) to go live; nothing else in the send path
needs to change.

### Scheduled reminders

The first background job in this app that isn't triggered by a user action:
`server/src/utils/scheduler.ts` runs an hourly `node-cron` tick that calls
`sendDueAppointmentReminders()` (`server/src/utils/reminders.ts`) — a
system-wide sweep (not scoped to one clinic, unlike every route handler)
that finds every `BOOKED`, non-walk-in appointment dated tomorrow with no
reminder sent yet, fires the same `notifyPatientEmail` pipeline as every
other notification, and marks `Appointment.reminderSentAt` so the next
hourly tick doesn't re-send it. The scheduler is started only from
`index.ts`, never from `app.ts` — `app.ts` is what the test suite imports
directly to drive the Express app through Supertest without binding a
port (see **Automated tests**), and a background timer firing against the
test database on every test run would be pure noise at best and a source
of flaky cross-test interference at worst.

## Diet Plans

A doctor can record a dietary recommendation for a patient
(`DietPlan`: `dietaryPreference` — Vegetarian/Non-vegetarian/Eggetarian/
Vegan — plus free-text `allergies`, `localFoodNotes`, and the actual
`planText`), authored from the same consultation screen as prescriptions,
and optionally (not necessarily) linked to the consultation it came out of
via an optional `consultationId` (`onDelete: SetNull` — deleting the
consultation later doesn't take the diet plan with it). It's linked
directly to `patientId` rather than only reachable through a consultation,
matching how a patient can have diet plans spanning multiple visits.
Authoring is doctor/admin-only (`POST /api/diet-plans`, same write-role
split as a prescription); reading is broader — any clinic staff, plus the
patient themself for their own (`GET /api/diet-plans?patientId=`, visible
on **My Medical Records** on web and the **Records** tab on mobile). This
is deliberately structured-fields-plus-free-text, not AI-generated: the
brief was specific inputs (medical history and complaints via the optional
consultation link, allergies, dietary preference, local food availability)
and a doctor-authored recommendation from them, not an LLM integration —
adding one would have introduced a third unrequested external-credentials
dependency alongside WhatsApp and the payment gateway.

## File Attachments

Lab/radiology report scans and prescription scans attach as real files (PDF,
JPEG, PNG, or WebP), plus a raw DICOM export (`.dcm`) for radiology imaging
(see "DICOM file support" below) — all sharing one 25MB upload ceiling,
stored on local disk under `server/uploads/`
(not committed — see `UPLOADS_ROOT` in `.env.example`) and served only
through an authenticated download route, never as static files. Who can
upload which category mirrors exactly who already produces that content
elsewhere (Lab Technician for lab reports, Radiology Technician for
radiology reports and DICOM images, a doctor for a prescription scan
attached to their own consultation); reading is broader — any clinic
staff member, plus the patient themself for their own files. A
`LabCounterPage`/
`RadiologyCounterPage` upload happens right after confirming that receipt;
a prescription scan attaches to a consultation once it's been saved at
least once (a fresh, never-saved consultation has no id yet to attach to).
Patients see everything attached to them in one place on their **My Medical
Records** page (web) or **Records** tab (mobile) — tapping one on mobile
downloads it via `expo-file-system`'s `downloadAsync` (the one API that
takes an `Authorization` header directly, unlike a bare `<Image>`/fetch)
and hands it to the native share sheet via `expo-sharing`, the same
"let the OS decide how to open it" approach as the web app opening the
blob in a new tab — there's no in-app PDF/image viewer to maintain for
every mime type this could be. This environment has no simulator or device
to watch the actual share sheet open, so `mobile/src/api/attachments.ts`'s
logic (the download URL and auth header it builds, filename sanitization,
what it does when the download fails or sharing isn't available) is
covered directly by `attachments.test.ts` with `expo-file-system`/
`expo-sharing` mocked — real assertions on real logic, not a claim that
the on-device share sheet itself was watched to open correctly.

### DICOM file support

A `RADIOLOGY_DICOM` attachment category lets a Radiology Technician upload
a raw `.dcm` export (distinct from `RADIOLOGY_REPORT`, a written report
scan) and view it in-browser — no PACS, no DICOM viewer software, and no
network integration with the scanning device required. This is
deliberately scoped to the common small-clinic case: a single uncompressed
frame exported straight off a modality, viewed client-side. What it does
**not** cover, and why:
- **DICOM Modality Worklist (MWL) / C-STORE** — the network protocols a
  real PACS uses to push a worklist to a scanner or receive images back —
  need a LAN-attached device or a DICOM conformance simulator, neither of
  which exists in this hosted, no-on-prem-device sandbox. This remains
  fully deferred (see "What's not built yet").
- **Compressed transfer syntaxes, multi-frame series, and 3D volumes** —
  these need a real decoder stack (`cornerstone.js` + its codec bundle),
  a much heavier dependency than a scoped single-image viewer justifies.
  `web/src/utils/dicom.ts`'s `parseDicomFile` explicitly rejects anything
  other than uncompressed Implicit/Explicit VR Little Endian, single-frame,
  single-channel (grayscale) pixel data, with a clear error message rather
  than a silent misrender.
- **A mobile DICOM viewer** — the web viewer's canvas-based rendering
  doesn't port directly to React Native; mobile keeps its existing
  "download and hand off to the OS" pattern for every attachment category,
  DICOM included, rather than gaining a second in-app viewer to maintain.

Parsing (via `dicom-parser`) and rendering (a manual `<canvas>`
pixel-by-pixel loop, not `cornerstone.js`) both happen entirely client-side
in `DicomViewer.tsx` — the server only stores and serves the raw bytes back
through the same authenticated download route every other attachment
category uses; it never looks inside a DICOM file. Windowing (mapping a
raw pixel value to a displayed gray level) uses the file's own
WindowCenter/WindowWidth when present, falling back to a window derived
from the image's actual min/max pixel values when they're absent (both are
optional in the DICOM standard).

Design notes:
- **Extension, not mimetype, decides what's a DICOM file.** Browsers have
  no standard, reliably-reported MIME type for a `.dcm` upload — it
  commonly comes through as `application/octet-stream` or empty, never
  `application/dicom`. `server/src/utils/uploads.ts`'s `isDicomFile` checks
  the `.dcm` extension instead, and the route normalizes the *stored*
  mimetype to `application/dicom` on save so every downstream consumer (the
  download route's `Content-Type` header, the web viewer) can trust one
  consistent value instead of re-deriving it from the filename every time.
- **Category-aware upload validation depends on multer's field order.**
  Both `isDicomFile`'s fileFilter branch and the `.dcm`-forcing filename
  callback read `req.body.category` — populated only because the upload
  clients always send the `category` field before the `file` field in the
  multipart stream (multer parses fields in stream order). If a future
  client ever sent the file first, category-aware validation would
  silently stop applying.
- **One shared 25MB upload ceiling, not a per-category one.** A DICOM
  export commonly runs several MB even for a single uncompressed frame, well
  past the 10MB limit every other attachment category needs. Multer's
  `fileSize` limit is one value per multer instance, not per field, so
  raising it applies to every category sharing this upload route — a second
  multer instance for one route wasn't worth the duplication for a single
  shared ceiling.
- **Tested against real bytes, not a mock of the parser.** Both
  `web/src/utils/dicom.test.ts` and `e2e/helpers/dicom.ts` hand-build an
  actual, minimal, valid DICOM Part 10 file byte-for-byte (128-byte
  preamble, `DICM` magic, an Explicit-VR-LE File Meta group, a real
  dataset) rather than mocking `dicom-parser`'s internals — the parser and
  windowing math run against real DICOM bytes in both the unit suite and
  the browser-level e2e spec, which also reads back actual rendered canvas
  pixel data to confirm real rendering, not just "a canvas exists". The two
  builders are deliberately small and duplicated rather than shared across
  packages, matching this repo's existing test-fixture convention.

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

## Subscription Billing

Clinics use this software on a monthly or annual subscription, priced per
tier (Tier 1 = OPD only, Tier 2 = +Pharmacy/Lab/Radiology, Tier 3 = +IPD —
each tier costs more because it unlocks more). A `Subscription` row (1:1
with `Clinic`) tracks `tier`/`billingCycle`/`status`/`amount`/
`currentPeriodEnd`; a clinic's subscription *is* what grants it that tier's
access, not a separate concern layered on top.

**Auto-suspend on lapse, computed, not cron-driven.** A subscription is
"active" iff `status === 'ACTIVE'` AND `currentPeriodEnd` hasn't passed —
both conditions checked fresh on every request
(`isSubscriptionActive()` in `server/src/middleware/auth.ts`), the same
"fetch fresh, don't trust the JWT" precedent `requireTier` already
established for tier-gating. The moment a renewal period elapses without a
platform admin recording a new payment, `requireAuth` — which every
router in the API goes through — starts 403ing every request for that
clinic, login included, automatically. No background job flips a status;
the date comparison **is** the enforcement, so there's nothing to miss a
tick on. `POST /api/auth/login` and `POST /api/auth/register` (patient
self-registration) check it too, before issuing a token, so the lockout
reason is clear at the point of sign-in rather than surfacing as a
mysterious 403 on the first click afterward. The web app treats this 403
specially (string-matched against `SUBSCRIPTION_INACTIVE_MESSAGE`, a
constant shared between server and client so the two can't drift apart):
`LoginPage` shows a dedicated amber lockout banner instead of the generic
error text, and `apiClient`'s response interceptor catches it mid-session
too — a clinic that gets suspended while someone is actively using the
app is redirected to that same banner on their very next request, not
left showing stale data.

**A brand-new clinic works immediately, on a 30-day grace period.**
`POST /clinics/register` creates an `ACTIVE` `MONTHLY` subscription in the
same transaction as the `Clinic` and its first `ADMIN` user, with
`currentPeriodEnd` 30 days out and no `SubscriptionPayment` recorded yet
(this is a self-serve signup flow — nobody's actually paid at this point).
Nothing blocks the clinic from using the product during that window; it
lapses and locks out automatically after 30 days unless a platform admin
records a real payment before then.

**Managed entirely outside the clinic's own Role/User system, by design.**
Billing a clinic has to keep working even when that clinic is the one
being locked out — so subscription management isn't another clinic
`Role`, it's a wholly separate `PlatformAdmin` identity with its own
login (`POST /api/platform/login`), its own JWT (structurally similar but
carrying `typ: 'platform_admin'` instead of a `role`/`clinicId`, verified
by a completely separate `requirePlatformAdmin` middleware — see
`server/src/utils/jwt.ts` and `server/src/middleware/platformAuth.ts`), and
its own web section (`/platform/login`, `/platform` — no clinic `Navbar`,
a neutral gray palette instead of the clinic teal/gold, and its own
`localStorage` key so a platform-admin browser tab and a clinic-admin
browser tab can never collide). A clinic-scoped token is rejected outright
by any `/api/platform/*` route and vice versa — verified directly in
`subscription.test.ts`, not just assumed from the code shape. No clinic
`ADMIN`, however senior, can see or touch another clinic's billing; only a
`PlatformAdmin` (you) can.

The platform dashboard (`/platform`) lists every clinic with its live
subscription status — **Active** / **Lapsed** (still `ACTIVE` in the DB
but past its date — a real, distinct state from a deliberate suspension,
surfaced separately so it's obvious which clinics need a nudge to renew
vs. which were suspended on purpose) / **Suspended** / **Cancelled** —
and lets you record a renewal (extends `currentPeriodEnd` by one billing
cycle from `max(now, currentPeriodEnd)`, so an early renewal keeps the
time already paid for rather than shortening it, and a lapsed renewal
doesn't get backdated credit for the days it was down), suspend a clinic
outright, or reactivate one (refused with a 400 telling you to use renew
instead, if it's also date-lapsed — reactivating alone wouldn't actually
restore access). Every renewal also writes a permanent `SubscriptionPayment`
row (who recorded it, when, for what period) independent of `Subscription`'s
own single mutable row — same rationale as `Payment` vs. a bill's running
total elsewhere in this schema: a payment record shouldn't change
retroactively just because the subscription's current state moved on.
Pricing (`server/src/utils/subscriptionPricing.ts`) is placeholder INR
figures per tier/cycle, used only as the suggested default — the actual
amount charged is freely editable per renewal, the same "own recorded
charge, not always re-derived from a changed price" discipline used for
`PharmacySaleItem`/`LabResultItem`/`RadiologyResultItem` elsewhere in this
codebase. **Update the placeholder prices to real ones before charging
anyone.**

A seeded `PlatformAdmin` (`owner@opdcare.test` / `platformadmin123` — see
`prisma/seed.ts`) is for local/demo use only; change or replace it before
any real deployment.

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
and an ICU (3 beds, ₹4500/day), and the seeded doctor has a ₹500
consultation fee. Sign in with clinic code **`demo-clinic`**.
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
for reliability, including `tests/unit/slots.test.ts` (the
fixed-time-slot grid math), `tests/booking-slots.test.ts` (booking against
a real schedule, double-booking rejected, a genuine concurrent-request race
settling to exactly one winner, cancelling freeing a slot, walk-ins staying
unaffected), `tests/attachments.test.ts` (per-category upload role
gating, clinic-scoped tenancy, a patient downloading their own file but not
another patient's, any staff role reading regardless of who can write, an
upload that fails validation leaving no orphaned file on disk, and the
`RADIOLOGY_DICOM` category's extension-based validation: a `.dcm` file
accepted and its mimetype normalized to `application/dicom`, a non-`.dcm`
file rejected for that category, a `.dcm` file rejected for the unrelated
`RADIOLOGY_REPORT` category, role gating, and independent per-category
listing on the same invoice), `tests/reminders.test.ts` (calls
`sendDueAppointmentReminders()` directly rather than waiting on a real cron
tick — a due appointment gets reminded, a second pass is idempotent,
cancelled/walk-in/today/day-after-tomorrow appointments are all correctly
excluded, and a due appointment in each of two different clinics both get
reminded in the same pass), and `tests/subscription.test.ts` (registering a
clinic auto-creates an active subscription and access works immediately; a
lapsed subscription — `currentPeriodEnd` in the past, `status` still
`ACTIVE` — blocks login, patient self-registration, and every
already-issued token automatically, with no status flip needed;
`SUSPENDED`/`CANCELLED` block regardless of date; a clinic-scoped JWT is
rejected on every `/api/platform/*` route and a platform JWT is rejected
on every clinic route; renew extends the later of now/`currentPeriodEnd`
— never backdating credit for lapsed time, never shortening an early
renewal — records a `SubscriptionPayment`, and syncs `Clinic.tier`;
suspend/reactivate, including reactivate correctly refusing a
still-date-lapsed subscription). 105 tests total.

### Web/mobile UI tests

**Playwright e2e (`e2e/`)** drives the real web app in a real (headless)
Chromium against the real API — no mocking below the browser boundary — the
same trust level as the server's Supertest suite, one layer up the stack. It
targets a third dedicated database, `opd_care_e2e`, so it never collides with
the Jest suite's `opd_care_test` or the dev database, and each spec creates
its own clinic(s)/doctor(s)/staff via direct HTTP calls to the running API
(`e2e/helpers/api.ts`) rather than driving every setup step through the UI —
only the behavior actually under test happens in the browser. 15 tests
across six specs: login/role-based routing, patient booking (against the
fixed-time-slot picker — the spec clicks a real, live-fetched slot button
rather than just picking a date), admin walk-in registration +
consultation-fee payment recording, a Nurse-role UI-visibility spec that
mirrors `server/tests/role-gating.test.ts` at the DOM level (a Nurse sees
vitals/medication logging but not billing, discharge, transfer, or the
other clinical-entry forms), a lab-report attachment spec that hands a
file's bytes straight to the file input (no on-disk fixture needed) and
checks it shows up both in the counter's own list and on the patient's
records page, and a DICOM attachment spec (`e2e/tests/dicom.spec.ts`) that
hand-builds a real, minimal, valid DICOM Part 10 file byte-for-byte in
`e2e/helpers/dicom.ts` (128-byte preamble, `DICM` magic, an Explicit-VR
File Meta group, an 8×8 8-bit grayscale dataset with a strict
0→252-value gradient), uploads it through the real UI, opens the viewer,
and reads back actual rendered canvas pixel data via `page.evaluate` —
asserting the top-left pixel renders pure black and the bottom-right pure
white under the viewer's default windowing, real parsing-and-rendering
proof rather than just "a canvas exists" — plus a second case asserting a
non-`.dcm` file dropped into the DICOM upload slot is rejected with a
clear on-page error.

```bash
# One-time: create the e2e database (skip if it already exists)
psql "postgresql://opd:opd@localhost:5432/postgres" -c "CREATE DATABASE opd_care_e2e OWNER opd"

npm run test:e2e
```

`playwright.config.ts` starts both the backend (`ts-node-dev`, pointed at
`opd_care_e2e` via `e2e/.env.e2e`) and the Vite web dev server itself as
Playwright `webServer` entries, so `npm run test:e2e` is a single command
from a clean checkout — nothing needs to be running beforehand except
Postgres. `e2e/tests/nurse-role.spec.ts` and `e2e/helpers/session.ts` log a
staff member in via a direct API call and inject the resulting token into
`localStorage` rather than re-driving the login form for every spec (see the
comment in `session.ts`); the login spec itself is the one place that does
drive the actual form, so that flow still gets covered end-to-end.

**Web unit tests (`web/`, Vitest)** cover pure logic that doesn't need a
browser DOM: `src/utils/dicom.ts`'s DICOM parsing and windowing math.
`dicom.test.ts` hand-builds several real DICOM Part 10 byte buffers (the
same technique as the e2e fixture, kept as its own small duplicated helper
rather than a shared package — see "Design notes" below) to exercise
`parseDicomFile` against actual bytes rather than a mock: a successful
parse reading back Rows/Columns/BitsAllocated/patient metadata/pixel data,
explicit WindowCenter/WindowWidth when present, rejecting a compressed
transfer syntax, rejecting a multi-frame file, rejecting a non-grayscale
file, rejecting bytes that aren't DICOM at all, and a 16-bit signed
(Int16) pixel data path. Plus `applyWindowing` (window-center/width
clipping to 0–255, rescale slope/intercept applied first, a zero-width
window not dividing by zero) and `computeDefaultWindow` (deriving a window
from actual pixel min/max, including the flat-image edge case) against
known input/output values. 15 tests.

```bash
npm run test:web
```

**Mobile (`mobile/`)** has no simulator available in this environment, so
instead of Detox/native e2e it gets lightweight `jest-expo` +
`@testing-library/react-native` component tests: pure rendering/logic
coverage for a representative screen (`MyAppointmentsScreen` — empty state,
a fetched appointment's doctor/date/token/status, and the
future-and-still-booked-only "Cancel appointment" rule, and that a slotted
appointment shows its time while a walk-in's meta line omits it), a
trivial unit test on `theme.ts`, and `api/attachments.ts`'s `openAttachment`
with `expo-file-system`/`expo-sharing` mocked (the download URL and auth
header, filename sanitization against an unsafe name, and the two failure
paths — a non-200 download, sharing unavailable — each surfacing an error
rather than failing silently). 10 tests.

```bash
npm run test:mobile
```

## CI/CD

`.github/workflows/ci.yml` runs on every push and pull request to `main`,
as two parallel jobs. `build-and-test`: a Postgres 16 service container,
`npm ci`, `prisma generate`, the full build sweep (shared/server/web, mobile
typecheck), then the server and mobile test suites against that service's
`opd_care_test` database — the exact same commands and `server/.env.test`
connection string used locally, so a green run locally and a green run in CI
mean the same thing. `e2e`: its own Postgres service seeded as
`opd_care_e2e`, `npx playwright install --with-deps chromium` (this sandbox
has Chromium pre-installed at a fixed path so `playwright.config.ts` skips
straight to it when that path exists — see the design note below — but a
stock GitHub Actions runner has no such path, so CI downloads it the normal
way), then `npm test` inside `e2e/` runs the same four specs against real
`ts-node-dev`/Vite dev servers that Playwright starts and tears down itself.

`.github/workflows/deploy.yml` handles the CD half: it fires after CI
succeeds on `main`, and (once configured) SSHes into the production EC2
box to pull/rebuild/migrate/restart the backend under PM2, then builds the
frontend and syncs it to S3 with a CloudFront cache invalidation. It's
scaffolding, not yet active: it checks for a `DEPLOY_HOST` secret first and
no-ops cleanly (green, not red) until real AWS infrastructure exists and
the deploy secrets are set — see **`deploy/README.md`** for the one-time
AWS/DNS setup this depends on (RDS, EC2 + PM2 + Nginx, S3 + CloudFront,
Route 53) and the exact list of GitHub secrets to configure.

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
- **A deposit already collected is not a "total" you can charge again.**
  The first version of IPD payment recording used the raw `IpdBill.total`
  as the payable amount, which double-counts the deposit: a patient who
  deposited ₹20,000 against a ₹1,260 bill (a refund situation) would show
  ₹1,260 still "payable" through the ledger, on top of money already in
  hand. Caught before shipping while wiring the discharge-bill payment UI
  (the same screen already showed "Refund Owed" for this exact scenario)
  and fixed before any web page used it: the payable amount for IPD is
  `Math.max(0, IpdBill.amountDue)` (total minus deposit, floored at zero),
  not the total itself — verified directly for both a
  deposit that exceeds the bill (payable ₹0, nothing to record) and one
  that only partially covers it (payable = the positive remainder).
- **Every notification write doubles as its own test fixture.** Because
  `notifyPatientEmail` always creates a `Notification` row — `SENT`,
  `FAILED`, or `SKIPPED`, never silently nothing — the entire pipeline
  (which trigger fired, who it was addressed to, whether a real send was
  even attempted) is assertable in tests without a real SMTP server, and
  auditable in production without one either. The alternative (a bare
  `try { sendMail() } catch { /* ignore */ }`) would have made "did the
  confirmation email actually get attempted" an unanswerable question from
  both angles.
- **A pinned browser path is a sandbox convenience, not a CI assumption.**
  `e2e/playwright.config.ts` checks `fs.existsSync('/opt/pw-browsers/chromium')`
  before setting `executablePath` — this development sandbox pre-installs
  Chromium there and skips Playwright's own download, but a stock GitHub
  Actions runner has neither, so hardcoding that path would have passed
  every local run and then failed the first real CI run with a missing-binary
  error. `ci.yml`'s `e2e` job runs `playwright install --with-deps chromium`
  instead, which fills Playwright's normal cache and lets the config fall
  through to its default resolution.
- **`getByText` breaks the moment a string appears twice, and `FlatList`'s
  `ListEmptyComponent` guarantees it will.** React Native renders that prop
  both as the element itself *and* as a plain string attribute visible to
  the accessibility tree, so a `ListEmptyComponent={<Text>No appointments
  yet.</Text>}` produces two matches for the same text, not one — a test
  written with `getByText` (which throws on multiple matches) intermittently
  times out inside `waitFor` rather than failing with a clear error. Caught
  by rendering the empty-state case to a debug dump before trusting the
  assertion; fixed by asserting `getAllByText(...).length > 0` for that one
  case instead.
- **`useFocusEffect` needs a `NavigationContainer` ancestor it won't have in
  a bare component test.** Mocking `@react-navigation/native`'s
  `useFocusEffect` down to a plain `useEffect(callback, [])` (see
  `MyAppointmentsScreen.test.tsx`) sidesteps standing up real navigation
  context just to test what a screen renders for a given API response —
  correct for this kind of test, but worth the comment on the mock so a
  future reader doesn't mistake it for testing focus/blur behavior itself.
- **A double-booking guard doesn't have to be a DB constraint to be real.**
  The obvious way to stop two patients booking the same doctor/date/time is
  a unique index. That breaks the moment a booking is cancelled, though —
  Postgres has no partial-unique support through Prisma's schema DSL, so a
  plain `@@unique([doctorId, date, startTime])` would permanently retire a
  slot the instant anyone cancelled into it, since a `CANCELLED` row still
  counts as occupying the index. The fix was to drop the constraint idea
  and reuse the same guard IPD bed admission already relies on
  (`ipd.routes.ts` `admitPatient`): a check against non-cancelled rows
  inside a transaction, immediately before the write. Verified directly for
  the failure mode a unit test can't reach on its own — two real concurrent
  HTTP requests for the same slot (`booking-slots.test.ts`, "under a genuine
  race") — asserting exactly one wins and only one row lands in the DB.
- **One function, not two, decides what's bookable.** `GET
  /doctors/:id/slots` (what the UI shows) and `POST /appointments` (what it
  validates) both call the same `getAvailableSlots()` — schedule windows
  fetched, already-booked start times fetched, `computeDaySlots()` run once.
  Two separate implementations of "is this slot open" would have been an
  invitation for them to quietly disagree the next time either one changed;
  one shared function makes that class of bug impossible rather than merely
  unlikely.
- **Walk-ins were left outside the slot system on purpose.** A walk-in
  patient doesn't have an appointment time to pick — they're standing at the
  front desk right now. Forcing them through slot selection would have
  meant either fabricating a time slot for something that isn't scheduled,
  or querying free/busy state that a same-day walk-in doesn't participate
  in anyway. `Appointment.startTime` stays `null` for a walk-in, and the
  existing token-queue behavior for same-day walk-ins is otherwise
  untouched — this was a scope boundary, not an oversight (see
  `booking-slots.test.ts`'s "a walk-in is not slotted" case).
- **Never trust a client-supplied filename for where a file lands on disk.**
  `uploads.ts`'s multer `filename` callback ignores the browser's original
  filename entirely and generates `crypto.randomUUID() + extension` instead,
  with the extension itself coming from a lookup table keyed on the
  server-validated mime type, not from the client's filename either. The
  original name is kept only as `Attachment.fileName` — display metadata,
  never touched when building a path. This closes off path traversal
  (`../../etc/passwd`) and same-name collisions as a category of bug rather
  than trying to sanitize a string that shouldn't be trusted in that role
  to begin with; `clinicId` in the storage path comes from the verified JWT,
  never from request input, for the same reason.
- **An upload route's own middleware runs before your route handler gets a
  say — clean up after it when you reject.** multer's `upload.single('file')`
  has already written the file to disk by the time `attachments.routes.ts`'s
  handler can check the category/role/entityId are valid; every failure
  path after that point calls `deleteUploadedFile()` before re-throwing, or
  a rejected upload would leave an orphaned file with no DB row pointing at
  it. Verified directly (`attachments.test.ts`'s "leaves no orphaned file on
  disk") rather than assumed, the same "don't just trust it, check it"
  discipline as the IPD deposit-netting and CI-Prisma bugs caught earlier in
  this README.
- **A category's write gate and its read gate don't have to be the same
  gate.** Uploading a lab report stays Lab-Technician/Admin-only (mirrors
  who already records lab results everywhere else in this API), but reading
  one is deliberately wider — any clinic staff member, since a doctor
  reviewing a patient needs to see a lab report a technician uploaded
  without needing lab-technician permissions themself. Tightening reads to
  match writes would have been the easy default and the wrong one; the two
  needed separate rules, not one gate reused for both directions.
- **A background job needs its own "already handled this" guard — a route
  handler doesn't, because the request only happens once.** Every other
  notification trigger in this app fires from a single HTTP request that
  runs exactly once, so nothing has ever needed idempotency protection
  before. An hourly cron tick is different: it runs repeatedly by design,
  so without `Appointment.reminderSentAt` the same reminder would resend
  every single hour until the appointment's date arrived. This is the first
  place in the codebase where "how many times will this code path run"
  stopped being "once" by default — worth naming so the next background
  job doesn't rediscover it the hard way.
- **Don't import a route module and expect its side effects to stay
  contained.** `startReminderScheduler()` is called only from `index.ts`,
  never from `app.ts`, specifically because `app.ts` is what the test
  suite imports to run the whole app through Supertest (see
  `server/tests/helpers.ts`) — every test file that imports it would have
  quietly started a real hourly timer against the test database otherwise.
  Testing `sendDueAppointmentReminders()` directly (`reminders.test.ts`
  calls it as a plain function, not by waiting on a cron tick) sidesteps
  needing fake timers entirely, and keeps the scheduler itself as the one
  piece of this feature that's exercised only by inspection and the live
  verification run, not by the automated suite.

## What's not built yet

Built so far: Tier 1 OPD core with fixed time-slot booking, Tier 2
Pharmacy/Lab/Radiology, Tier 3 IPD, Reporting (financial Actual-vs-Total
across all three revenue modules, daily activity, follow-ups due), granular
front-desk/nursing staff roles (Receptionist, Nurse, Head Nurse),
consultation-fee billing and a cash/card/UPI payment ledger across every
bill type, email notifications including a scheduled day-before appointment
reminder, file attachments (lab/radiology report scans, prescription
scans) with full view/download on both web and mobile, a DICOM file
upload + in-browser viewer for a single uncompressed radiology image (see
"DICOM file support" above), per-tier monthly/annual subscription billing
with platform-admin-managed renew/suspend/reactivate and automatic
access lockout on lapse (see "Subscription Billing" above), WhatsApp
messaging for reminders/prescriptions/diet plans with opt-in consent and a
provider-agnostic adapter (scaffolded end-to-end, pending real Twilio/Meta
credentials — see "WhatsApp messaging" above), doctor-authored diet plans
(see "Diet Plans" above), a server integration test suite, a web unit test
suite (Vitest), a Playwright web e2e suite, mobile component tests, and a
CI workflow that runs all of it on every push/PR, on a multi-tenant hosted
architecture. Deliberately deferred:
- DICOM Modality Worklist (MWL) / C-STORE network integration — the
  protocols a real PACS uses to push a worklist to a scanner or receive
  images back directly, which need a LAN-attached device or DICOM
  conformance simulator that this hosted, no-on-prem-device architecture
  doesn't provide. (Viewing an already-exported `.dcm` file *is* built —
  see "DICOM file support" above.)
- A live online payment gateway (Razorpay/Stripe) — no real merchant
  credentials available to test against, for either patient-facing checkout
  (the `Payment` schema reserves the fields for it) or subscription
  renewals (a platform admin records a renewal manually today, the same
  constraint)
- An SMS notification channel (only email and WhatsApp are wired up) — the
  `NotificationChannel` enum already has `SMS` reserved, but there's no SMS
  provider account to send through
- A live WhatsApp Business account — no real Meta Business verification or
  Twilio credentials available to send through; every WhatsApp send in this
  codebase today, tests included, goes through the stub adapter (see
  "WhatsApp messaging" above)
- CD is scaffolded (`deploy/` + `.github/workflows/deploy.yml`) but
  inactive — it needs real AWS infrastructure provisioned and GitHub
  secrets configured by hand first (see `deploy/README.md`); nothing has
  actually been deployed anywhere yet
