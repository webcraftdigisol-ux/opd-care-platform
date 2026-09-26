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

### T1-5. Prescription, lab and radiology rows (inside Record consultation)

Clicking a section's add link adds a row (each row has a red **Remove**).

**Prescription row**
- Medicine name -- **type-ahead from the Doctor's Catalogue**: typing "p"
  lists "Paracetamol (250)", "Paracetamol (500)" (name + strength); picking
  one fills name and strength.
- Strength (e.g. 250), Days (e.g. 10), Food timing (select: Before / After
  food …).
- Timing checkboxes **Morning · Afternoon · Night** (the Indian 1-0-1
  pattern as ticks).
- Instructions (optional, free text).
- Live line under the row: **"Total to dispense: 20 × Paracetamol"**
  (ticked times per day × days).

**Lab tests ordered row** -- Test name (type-ahead from catalogue; free
text allowed -- the example saved "CDC") + Notes (e.g. "Before food").
**Radiology work prescribed row** -- Test (type-ahead, e.g. "X-Ray") +
Notes.

**Current web app:** prescription rows are medicine (autocomplete from the
clinic's medicine catalogue), free-text dosage, free-text frequency, days,
notes; a "suggested quantity" is computed only at the pharmacy counter.
Lab/radiology rows are name + notes, Tier 2+ only.

**Take from offline:** tick-box M/A/N timing and food-timing select (much
faster than typing "1-0-1 after food"), picking name+strength in one go,
"total to dispense" shown right on the row.
**Improve on both:** dose per time (1 tab / ½ tab / 5 ml), form (tab,
syrup, drops, injection…), an "SOS / as needed" and "once a week" option,
strength with unit (250 **mg**), bedtime; one-click "repeat last
prescription"; saved prescription templates per diagnosis (e.g. "Viral
fever" → 3 medicines); keyboard-only entry for speed.

### T1-6. After "Save consultation" → profile, Consultations tab

Timeline of visits, newest first. Each visit is a collapsible card:
- Header: stethoscope icon, **"Visit 1"**, date · time, diagnosis as
  subtitle, chevron.
- Left column: Chief complaint, Present illness, History, Diagnosis,
  Differential diagnosis, Advice, Follow-up (date), Fee (₹), Notes.
- Right column: **VITALS** as chips (98°F · 98 bpm · 80/120 mmHg · SpO2
  99% · 93 kg · **BMI 36.3**), **PRESCRIPTION** cards ("Paracetamol · 250",
  "Morning, Night · 10 · After food"), **LAB TESTS ORDERED** ("CDC · Before
  food"), **RADIOLOGY WORK PRESCRIBED** ("X-Ray").
- Actions: **Edit this visit** · **Print summary**.

**Observations**
- BMI is auto-computed (93 kg / 1.60 m² = 36.3 ✓).
- **Respiratory rate (78) and blood sugar (210) were entered but are not
  shown** in the visit's vitals chips -- looks like an offline bug; the web
  version should show every vital recorded.
- Visits are numbered per patient ("Visit 1") -- nice touch to keep.
- The follow-up date entered here is what drives follow-up reminders in the
  web app (already built: Reports → Follow-ups + automatic WhatsApp/email).

**Current web app:** the doctor's consultation page shows past visits in
the new Patient History panel; there's no per-patient visit timeline for
reception/admin, no "Edit this visit" from history, and no printable
visit summary / prescription.

### T1-7. Print summary (the patient's printout)

Opened from a visit's "Print summary". Top bar: ← Back to patient ·
**language selector ("English ▾")** · **Print / Save as PDF**.

Page content (A4-style card):
- Header: clinic name (left); "**Visit Summary**", "Visit 1 · 26 Sept 2026 ·
  07:59" (right).
- Patient block: Patient name, Patient ID, Age / Sex, Doctor.
- **SYMPTOMS** (chief complaint + present illness, one per line).
- **DIAGNOSIS**.
- **VITALS** as chips: Temp, Pulse, BP, SpO2, Weight, BMI, Sugar.
- **PRESCRIPTION** table: Medicine (strength) · When to take ("Morning,
  Night, after food") · Duration ("10 day(s)") · Instructions · **Total**.
- **INVESTIGATIONS / LAB TESTS ADVISED** (bullets, with notes).
- **RADIOLOGY WORK PRESCRIBED** (bullets).
- **DOCTOR'S ADVICE**.
- Footer: **Follow-up: <date>** (left); signature line, "Doctor's
  signature", doctor name (right).

Deliberately **not** printed: differential diagnosis, relevant history, fee,
private "Doctor notes" (so doctor notes are internal).

**Owner's requirements (web):**
1. **Send this summary to the patient on WhatsApp** (as a PDF) from the
   visit.
2. **Follow-up reminders: one the day before AND one on the follow-up
   date** itself. (Web today sends only the day-before reminder.)

**Observations / improve on offline**
- Language selector → the printout is multilingual (to learn which
  languages: Marathi/Hindi?). Medicine timing words, headings and advice
  would need translating; medicine names stay as-is.
- No clinic letterhead details (address, phone, doctor's qualification and
  registration number, logo) -- Indian prescriptions normally carry these
  (registration number is expected on a prescription). Needs a clinic/
  doctor settings page.
- Respiratory rate is missing from the printed vitals too.

### T1-8. Profile: Vitals tab

One chart card per vital across visits (x = visit date): Weight (kg), BMI,
Pulse (bpm), Temperature (°F), SpO2 (%), Blood sugar, … (BP probably
further down). Two cards per row.

**Web today:** small sparkline trends inside the doctor's Patient History
panel (BP systolic, pulse, weight, SpO2), and on IPD admissions; no
per-patient vitals tab.

### T1-9. Profile: Reports and Images tabs

Both: "Stored directly in this patient's own folder — nothing here depends
on the database." + **Upload report** / **Upload image**; empty states "No
reports / images uploaded yet." Owner: kept for future reference.

**Web equivalent:** file attachments now live in S3 (secure, backed up) but
are tied to a lab invoice, radiology invoice or consultation -- there's no
"upload any report/image to the patient" at profile level (e.g. outside
reports the patient brings). Worth adding as patient-level documents.

### T1-10. Profile: Billing tab

"1 billing record" · **Total: ₹1,000**; list rows: icon, "**OPD consultation
— Visit 1**", date, amount, chevron to open. The bill is created
automatically from the visit's consultation fee when the consultation is
saved.

Owner: **Tier 1 and Tier 2 bill OPD only; Tier 3 bills OPD and IPD.**

**Web today:** consultation fee is recorded at booking/walk-in, payments
are recorded per bill (cash/card/UPI/Razorpay), and pharmacy/lab/radiology
bills exist in Tier 2+. There's no per-patient billing history view for
staff.

### T1-11. Appointments

**Page:** title "Appointments", subtitle "Book and track patient
appointments.", **+ Schedule appointment** (top-right). A **day navigator**
bar: ◀ · "Today · Saturday 26 Sept, 2026" · date picker · ▶. Below, that
day's appointments (empty state "No appointments scheduled for this day.").

**Schedule appointment (modal)**
1. Search box: "Search patient by name, mobile, or Patient ID". Results as
   you type -- name on the first line, "PatientID · mobile" underneath.
   Link below: **"Not registered yet? Book by name and mobile instead"**
   (book without registering first).
2. After picking: the patient shown as a chip (name + Patient ID) with
   **Change**; **Date*** (defaults to today), **Time** (optional, any time
   -- no slot grid), **Doctor** (a free-text box, placeholder "Dr. Sanap"),
   **Reason (optional)** ("Follow-up, new consultation…"); button
   **Schedule appointment**.

**Day list row:** time chip (15:00), patient name (link to profile), doctor
name, status pill **Scheduled**; actions **✓ Completed · No-show · Cancel**.

**Important finding -- shared mobile numbers:** searching "79" returned
**two different patients with the same mobile number** (PT000001 and
PT000002). In Indian clinics a family often shares one mobile, so **mobile
must NOT be unique per patient**. The web app currently enforces a unique
phone per clinic (and walk-in registration *reuses* the existing patient
for a known phone -- which would merge family members into one record).
The redesign needs: patient identity = Patient ID; mobile = lookup key
that can match several patients ("which family member?" picker).
(The web's phone sign-in/OTP already treats an ambiguous phone as no match,
falling back to email -- that needs rethinking with family numbers.)

**Current web app:** patient self-booking picks a doctor, date and a fixed
**time slot** from the doctor's schedule; the admin/reception side has a
walk-in form (doctor, name, phone, reason) that issues a **token number**
and marks the patient checked-in; statuses Booked → Checked-in → In
consultation → Completed / Cancelled / No-show; the doctor's dashboard is a
queue and "Consult" opens the consultation for that appointment.

**Best of both for the redesign**
- Offline: one modal that starts with patient search, "book without
  registering", optional time, a simple day navigator, one-click
  Completed / No-show / Cancel.
- Web: a real doctor list (not free text -- the doctor drives fee,
  schedule and the doctor's own queue), token numbers for walk-ins, slots
  when a doctor works by appointment, the live queue with statuses, and
  **start the consultation straight from the appointment row** (so
  "Completed" happens automatically when the visit is saved).
- Add: filter by doctor, week view, search within the day, reschedule.

### T1-12. Booking someone not registered yet

"Not registered yet? Book by name and mobile instead" switches the modal to
"Booking for someone not registered yet · **Search instead**": **Name***,
**Mobile (optional)**, Date*, Time, Doctor, Reason (optional); the button
stays disabled until the required fields are filled.

In the day list an unregistered booking shows the name as **plain text**
(not a profile link) with a phone icon + number; registered patients' names
are links to their profile. So an unregistered booking is not a patient
record until someone registers them.

**Redesign:** keep "book without registering" (phone bookings), and on
arrival offer **"Register & start visit"** from the appointment row that
pre-fills name + mobile, so it becomes a real patient with a Patient ID
before the consultation (and gets matched to an existing patient if the
mobile already belongs to the family -- see shared mobiles).

### T1-13. Find Patient (owner's requirements; screenshot to follow)

- Search by **name or mobile number** (and Patient ID, as elsewhere).
- **Not case-sensitive.**
- **Suggestions appear as you type**; picking one opens that patient's
  **profile** (T1-3).

**Redesign:** one search component used everywhere (dashboard, Find
Patient, Schedule appointment, the top bar): matches anywhere in the name
("kulk" finds Kulkarni), mobile digits in any format, Patient ID with or
without the prefix; each result shows name, age/sex, Patient ID, mobile and
last visit so the right family member is obvious; keyboard ↑/↓/Enter.

### T1-14. Doctor's Catalogue (Tier 1)

Page intro: "Simple name lists so the consultation screen can suggest
medicines, lab tests, and radiology work as you type — this clinic doesn't
have separate Pharmacy, Laboratory, or Radiology modules, so these are
yours to maintain."

Tabs: **Medicines · Lab Tests · Radiology**.
- Medicines: add form **Medicine name*** + **Strength (optional)**
  (placeholder "650mg") + **Add**; list rows: pill icon, name, strength,
  delete (bin). E.g. "Paracetamol 250", "Paracetamol 500".
- Lab Tests: **Add test*** ("e.g. CBC, Blood Sugar") + Add; list rows with
  delete. E.g. "Blood Sugar", "CDC".
- Radiology: same pattern (screenshot not yet shown).
- No edit, no search, no import visible -- add and delete only.

**Confirms the tier model:** Tier 1 doctors *prescribe/order* from their own
simple lists; Tier 2 adds the Pharmacy / Laboratory / Radiology
*departments* (stock, prices, billing).

**Current web app:** the only catalogues are the Tier 2 department ones
(PharmacyItem with price/stock, lab and radiology catalogues with prices),
and the API blocks them below Tier 2 -- so **a Tier 1 doctor in the web app
gets no autocomplete at all**. The redesign needs a Tier 1 "Doctor's
Catalogue" (names + strength, no prices/stock) that carries over into the
department catalogues when a clinic upgrades to Tier 2.

**Improve on offline:** search/filter the list, edit an entry, bulk import
(CSV), and **ship a ready-made starter list** (common Indian generics with
strengths, common lab panels, common imaging) so a new clinic isn't typing
everything by hand; strength with unit; medicine form (tab/syrup/…).

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
- ~~What does Print summary print?~~ → a patient-facing Visit Summary
  (see T1-7).
- Which languages does the print's language selector offer?
- Should the printout carry a letterhead (clinic address/phone/logo,
  doctor's qualification and registration number)?
- Billing: is a consultation bill marked paid/unpaid, and is the payment
  mode (cash/UPI/card) recorded? Can a receipt be printed?
- Can a visit be edited any time later, or only the same day? Is there a
  record of who changed what?
- Is **Time** optional on purpose (walk-in style) -- do any clinics use
  fixed time slots or token numbers?
- Is the Doctor field free text on purpose (visiting doctors not set up in
  the system), or would a doctor list be fine?
- Does marking an appointment **Completed** do anything else (open a
  consultation, create a bill)?
- When an unregistered booking arrives, how does it become a patient --
  does reception register them from the appointment?
- Find Patient screenshot (snap 28) didn't come through -- please resend.
- Doctor's Catalogue: is it shared by all doctors in the clinic, or does
  each doctor keep their own list?
- Which specialities are the main customers (the imaging example is
  obstetric -- gynaecology/ANC, general physician, paediatrics …)?
- Can the same form be saved as a draft and completed later (e.g. vitals
  by an assistant, notes by the doctor)?

