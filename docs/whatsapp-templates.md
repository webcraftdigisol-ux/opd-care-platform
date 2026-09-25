# WhatsApp message templates

Every WhatsApp message this app sends is a pre-approved **template**: the
business starts the conversation, and WhatsApp only allows that through
templates Meta has approved. Submit each template below in **WhatsApp
Manager → Message templates** (or Twilio Console → Content Template Builder)
with exactly this **name**, **category**, **language** and placeholder order.
The code in `server/src/utils/whatsapp.ts` sends the values positionally.

- **Language:** submit them all as English (`en`). If you choose `en_US` or
  another language instead, set `META_WHATSAPP_TEMPLATE_LANG` to match.
- **Clinic name:** `{{1}}` is always the clinic's name, added automatically.
  Every clinic sends from one shared number, so the name is how patients
  tell messages apart.
- **Meta's rules on parameters:** a template body can't start or end with a
  placeholder, which is why every one opens with "Message from {{1}}".
  Parameter values can't contain line breaks, so the code joins multi-line
  text such as a prescription list with " | ".
- **Sample values:** Meta asks for them when you submit. Use realistic ones,
  like the examples below.

## 1. `appointment_reminder`

Category: **Utility**. Sent automatically the day before a booked appointment.

```
Message from {{1}}: Hi {{2}}, this is a reminder of your appointment with Dr. {{3}} tomorrow, {{4}}, at {{5}}. Your token number is {{6}}.
```

| # | Value | Example |
|---|---|---|
| 1 | Clinic name | Anandi |
| 2 | Patient name | Ramesh Patil |
| 3 | Doctor name | Pallavi Joshi |
| 4 | Date | 2026-10-02 |
| 5 | Time (or "—" for walk-in style bookings) | 10:30 |
| 6 | Token | #4 |

## 2. `prescription_shared`

Category: **Utility**. Sent when the doctor taps "Send via WhatsApp" on a
consultation.

```
Message from {{1}}: Hi {{2}}, here is your prescription from Dr. {{3}}: {{4}}. Please take your medicines as advised and contact the clinic if you have any questions.
```

| # | Value | Example |
|---|---|---|
| 1 | Clinic name | Anandi |
| 2 | Patient name | Ramesh Patil |
| 3 | Doctor name | Pallavi Joshi |
| 4 | Medicines, one per item joined by " \| " | Amlodipine 5mg — 1 tab, Once daily, 30 days \| Paracetamol 500mg — 1 tab, SOS, 3 days |

## 3. `diet_plan_shared`

Category: **Utility**. Sent when the doctor sends a diet plan.

```
Message from {{1}}: Hi {{2}}, here is your diet plan from Dr. {{3}}: {{4}}. Contact the clinic if you have any questions.
```

| # | Value | Example |
|---|---|---|
| 1 | Clinic name | Anandi |
| 2 | Patient name | Ramesh Patil |
| 3 | Doctor name | Pallavi Joshi |
| 4 | Plan text | Low-salt meals, 2 fruits a day, avoid fried snacks |

## 4. `followup_reminder`

Category: **Utility**. Sent automatically the day before a follow-up is due,
unless staff already marked the patient contacted or the patient already
booked. Staff can also send it from Reports → Follow-ups.

```
Message from {{1}}: Hi {{2}}, this is a reminder for your follow-up with Dr. {{3}}, due on {{4}}. Please call the clinic to schedule your visit.
```

| # | Value | Example |
|---|---|---|
| 1 | Clinic name | Anandi |
| 2 | Patient name | Ramesh Patil |
| 3 | Doctor name | Pallavi Joshi |
| 4 | Due date | 2026-10-02 |

## 5. `password_reset_otp`

Category: **Authentication**. Sent when someone uses "Forgot password?".

Authentication templates use Meta's fixed wording, so you don't write the
text. When creating it, choose:
- **Code delivery:** *Copy code* button.
- **Security recommendation:** on ("For your security, do not share this code.").
- **Code expiration:** 10 minutes.

`{{1}}` is the 6-digit code. The code sends it again as the button's
parameter, which Meta requires.

**On Twilio:** create the equivalent Authentication template in the Content
Template Builder, with variable `1` as the code.

## After approval

- **Meta Cloud API:** the template names above are all the code needs.
- **Twilio:** also set `TWILIO_CONTENT_SIDS`, a JSON map from template name to
  Twilio's ContentSid, e.g. `{"appointment_reminder":"HX…","prescription_shared":"HX…", …}`.
