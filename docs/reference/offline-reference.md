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

### T1-3. Patient profile (opens right after "Save patient")

**Header card** (always on top of every profile tab): initials avatar,
full name, Patient ID chip, then one line of key facts with icons --
gender, age (derived from DOB), blood group, mobile, email, city/state --
and the patient's record folder path (`Patients/<PatientID>_<First>_<Last>/`).

**Tabs:** Summary · Consultations · Vitals · Reports · Images · Billing.

**Summary tab** -- "Edit details" link top-right, then read-only cards in a
two-column grid:
- Personal: DOB, marital status, occupation, nationality, referred by,
  **registration date**.
- Contact: mobile, alternate mobile, email, emergency contact
  ("Name (number)").
- Address: address, city, state, pincode.
- Vitals baseline: height, weight, blood group.
- Medical history (full width): known allergies, chronic diseases, past
  surgeries, family history.
- Additional (full width): insurance details, TPA, doctor notes.

**Consultations tab** -- "Consultation history" heading, **+ New
consultation** button, empty state "No visits recorded yet. Start the first
consultation to build this patient's timeline."

**Current web app:** there is no patient profile page at all. Staff can't
open "a patient" -- only an appointment. The closest things are the
patient's own My Records page and the Patient History panel on the doctor's
consultation screen.

**Take from offline:** a patient-centric profile as the hub (header + tabs),
reached from search, registration, the queue, anywhere a patient name
appears. This should become the centre of the redesign.

### T1-4. Record consultation (from the profile's "+ New consultation")

Page title "Record consultation", subtitle "Patient <PatientID>". Card
sections:
1. **Visit details** -- Visit date* (defaults to today), Visit time
   (defaults to now), Doctor (select), Consultation fee (₹).
2. **Vitals** -- "Height and weight auto-calculate BMI." Temperature (°F),
   Pulse (bpm), BP systolic, BP diastolic, Respiratory rate, SpO2 (%),
   Height (cm), Weight (kg), Blood sugar.
3. **Clinical notes** -- Chief complaint, History of present illness,
   Relevant history (multi-line); Diagnosis, Differential diagnosis
   (single-line, side by side).
4. **Prescription** -- empty state "No medicines added yet." + **Add
   medicine** (row fields: to see in the next snaps).
5. **Lab tests ordered** -- "No tests ordered for this visit." + **Add test**.
6. **Radiology work prescribed** -- "No radiology work prescribed for this
   visit." + **Add radiology work**.
7. **Advice & follow-up** -- Advice (multi-line), Ultrasound / imaging
   advice (optional, single line; placeholder "USG Pelvis recommended to
   confirm intrauterine pregnancy"), Follow-up date, Doctor notes.
8. Bottom actions: **Save consultation** (primary) · **Cancel**.

**Filled example (dummy data):** choosing the doctor ("Dr. Demo — General
Physician", name + speciality in the dropdown) showed a fee of ₹1000 --
looks pre-filled from the doctor (to confirm). Vitals entered: temp 98 °F,
pulse 98, BP systolic 80 / diastolic 120, RR 78, SpO2 99, height 160,
weight 93, blood sugar 210. Chief complaint "Fever", HPI "Travel",
relevant history "NA", diagnosis "Viral Fever", differential "NA".
*(continues -- prescription etc. in the next snaps)*

**Observations**
- **Lab tests and radiology can be ordered in Tier 1** in the offline app.
  The web app hides lab/radiology ordering below Tier 2 -- in the offline
  model Tier 2 seems to add the in-house lab/radiology *departments*, not
  the ability to *order* tests (a Tier 1 doctor still sends patients to an
  outside lab). To confirm with the Tier 2 walkthrough.
- **No vitals validation**: the example saved BP 80/120 (systolic below
  diastolic) and RR 78 (normal adult 12-20). The web version should keep
  entry fast but flag implausible values inline (soft warning, not a
  block), e.g. systolic < diastolic, SpO2 > 100, RR outside ~6-60.
- **Blood sugar has no type/unit** (fasting / post-prandial / random,
  mg/dL). Worth a small selector.
- **"Ultrasound / imaging advice"** is separate from "Radiology work
  prescribed" -- the example is obstetric, suggesting gynaecology/ANC
  clinics are a key audience. Ask which specialities matter most.
- Web app today: Diet plan and prescription-scan upload live on the
  consultation page too (offline doesn't show them here) -- keep, but
  collapsible/secondary.

**How the visit starts:** a consultation is created directly from the
patient's profile, with the date/time/doctor/fee chosen on the form -- no
appointment or token needed first. (The web app is the opposite: a
consultation only exists for an appointment/walk-in token, and the fee is
set at booking from the doctor's profile.)

**Current web app vitals:** BP sys/dia, pulse, temp **°C**, weight, height,
SpO2. Missing: respiratory rate, blood sugar, BMI. Clinical notes are just
Diagnosis + Notes -- no chief complaint, history of present illness,
relevant history or differential diagnosis.

**Notes for the redesign:**
- Temperature unit: offline uses °F; web uses °C. Indian clinics commonly
  record °F -- make it a clinic setting or default to °F.
- The consultation page only shows the Patient ID, not the name, age or
  allergies -- the web version should keep a compact patient banner
  (name, age/sex, allergies, chronic conditions) pinned on the consultation
  screen, plus the history panel we already have.
- Both flows are needed: consult from the queue (token) and consult
  directly from the profile (e.g. a quick review with no appointment).

### Open questions (Tier 1 so far)
- Patient ID format: `PT` + 6 digits, per clinic, sequential? Can it be
  customised per clinic (prefix)?
- "Local record folder" -- is that for scanned documents per patient?
- Is "Doctor notes" at registration a standing note shown on every visit?
- Are Appointments and Revenue charts per clinic or per doctor?
- Who uses the registration form -- reception only, or doctors too?
- ~~After Save patient, where does it go?~~ → the new patient's profile.
- Is the consultation fee pre-filled from the chosen doctor (looks like
  it -- ₹1000 appeared) and editable per visit (discount, free follow-up)?
- Does a visit's height/weight update the patient's baseline on the
  profile (baseline said 92 kg, the visit recorded 93)?
- Which specialities are the main customers (the imaging example is
  obstetric -- gynaecology/ANC, general physician, paediatrics …)?
- Can the same form be saved as a draft and completed later (e.g. vitals
  by an assistant, notes by the doctor)?

