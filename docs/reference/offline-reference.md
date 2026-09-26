# Offline software reference (for the UI/UX + workflow redesign)

Notes taken while the product owner walks through their existing offline
(desktop) OPD/IPD software, tier by tier. **Study only -- no development
starts until the owner says everything has been submitted.**

Each screen: what the offline app does → how the current web app compares →
open questions.

---

## Tier 1 (OPD)

### T1-1. App shell + Dashboard (landing page)

**Offline app**
- Left sidebar, always visible: clinic logo + name ("Demo Clinic (Tier 1 -
  OPD)", subtitle "OPD Suite Reference Build"); nav items with icons:
  Dashboard, New Patient, Appointments, Find Patient, Doctor's Catalogue,
  Reports, Staff accounts, Settings. Active item is a filled blue pill.
- Sidebar footer: logged-in user (initials avatar, name, role "Admin") with
  a log-out icon; vendor credit + support contact below.
- Dashboard header: greeting ("Good day, Doctor") + subtitle, and a primary
  **+ New Patient** button top-right.
- **Global patient search** bar right under the header: "Search by name,
  mobile number, or Patient ID".
- Three stat cards with coloured icons: **Total patients**, **Registered
  today**, **Appointments today**.
- Two charts: **Appointments this month** (per day) and **Revenue collected
  this month** (per day bars).
- **Recently registered** list: avatar initial, name, Patient ID chip
  (`PT000001`), mobile number.
- Visual style: light grey background, white rounded cards with soft
  borders, blue primary, generous spacing.

**Current web app**
- Top navbar (+ mobile ☰ menu), not a sidebar. Admin home = "Admin
  Overview": three buttons (Manage Doctors, Billing, Register Walk-in), a
  date picker and today's appointment table (token, time, patient, doctor,
  type).
- No global patient search on the dashboard, no stat cards, no charts, no
  "recently registered".
- No human-readable Patient ID (internal UUIDs only).

**Take from offline:** persistent sidebar nav, global search (name / mobile
/ Patient ID) as the first thing on the home screen, stat cards, month
charts, recently registered, prominent "+ New Patient".
**Keep from web:** today's appointment/token queue on the home screen (the
offline dashboard doesn't show today's queue at a glance), role-specific
home screens, mobile layout.

### T1-2. Register new patient (form, sections top to bottom)

Subtitle: "A Patient ID and a local record folder are created automatically
on save." One long page of card sections:

1. **Identity** -- First name*, Middle name, Last name, Gender (select),
   Date of birth (dd-mm-yyyy picker), Age ("If DOB isn't known"), Blood
   group (select), Marital status (select), Nationality (default "Indian").
2. **Contact** -- "Mobile number is used for fast lookup." Mobile number*,
   Alternate mobile, Email, Emergency contact ("Name & number"),
   Occupation, Referred by.
3. **Address** -- Address (multi-line), City, State, Pincode.
4. **Medical background** -- "Baseline info doctors reference every visit."
   Height (cm), Weight (kg), Known allergies, Chronic diseases, Past
   surgeries, Family history (all multi-line).
5. **Additional** -- Insurance details (multi-line), TPA (insurance
   administrator, e.g. MediAssist, Paramount), Doctor notes.
6. Form ends after **Additional**: bottom actions are **Save patient**
   (primary, check-circle icon) and **Cancel** (text link). No other
   sections (no visit/appointment/fee step on this page).

Registration is standalone -- saving creates the patient only; booking or
billing a visit is a separate step (TBC as later screens arrive).

Only two required fields: **first name** and **mobile number**.

**Current web app**
- Patient = a login `User`: name, email, phone, password. Two ways in:
  patient self-signup (name, email, phone, password) or front-desk walk-in
  (name + phone only, placeholder email, random password).
- None of: split name, gender, DOB/age, blood group, marital status,
  nationality, alternate mobile, emergency contact, occupation, referred
  by, address, height/weight, allergies, chronic diseases, past surgeries,
  family history, insurance/TPA, doctor notes, Patient ID.
- Mobile is already unique per clinic (fast lookup works).

**Gap:** the web app has no real patient record/profile. This is the
biggest data-model gap so far -- a proper Patient profile (separate from
login accounts) with a Patient ID.

**Ideas to weigh later:** keep the long form but make registration fast for
a busy desk -- required minimum up top (name, mobile, gender, age/DOB),
the rest collapsible or fillable later; DOB ↔ age auto-calculation; mobile
duplicate check as you type ("already registered -- open record?");
allergies surfaced prominently in the doctor's consultation view.

### Open questions (Tier 1 so far)
- Patient ID format: `PT` + 6 digits, per clinic, sequential? Can it be
  customised per clinic (prefix)?
- "Local record folder" -- is that for scanned documents per patient?
- Is "Doctor notes" at registration a standing note shown on every visit?
- Are Appointments and Revenue charts per clinic or per doctor?
- Who uses the registration form -- reception only, or doctors too?
- After **Save patient**, where does it go -- the new patient's profile,
  back to the dashboard, or straight into booking/billing a visit?

