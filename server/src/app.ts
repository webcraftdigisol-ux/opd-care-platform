import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.routes';
import { clinicsRouter } from './routes/clinics.routes';
import { doctorsRouter } from './routes/doctors.routes';
import { appointmentsRouter } from './routes/appointments.routes';
import { consultationsRouter } from './routes/consultations.routes';
import { patientsRouter } from './routes/patients.routes';
import { catalogueRouter } from './routes/catalogue.routes';
import { publicRouter } from './routes/public.routes';
import { adminRouter } from './routes/admin.routes';
import { pharmacyRouter } from './routes/pharmacy.routes';
import { labRouter } from './routes/lab.routes';
import { radiologyRouter } from './routes/radiology.routes';
import { reportsRouter } from './routes/reports.routes';
import { ipdRouter } from './routes/ipd.routes';
import { paymentsRouter, razorpayWebhookHandler } from './routes/payments.routes';
import { attachmentsRouter } from './routes/attachments.routes';
import { platformRouter } from './routes/platform.routes';
import { dietPlansRouter } from './routes/dietplans.routes';
import { asyncHandler, errorHandler } from './middleware/errorHandler';

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }));

// Razorpay's webhook signature is computed over the exact raw request
// bytes, so this route needs the unparsed body -- it's registered with its
// own raw-body parser before the global express.json() below, which would
// otherwise consume and re-serialize the body (breaking the signature) for
// every route, this one included.
app.post('/api/payments/razorpay/webhook', express.raw({ type: 'application/json' }), asyncHandler(razorpayWebhookHandler));

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/clinics', clinicsRouter);
app.use('/api/doctors', doctorsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/consultations', consultationsRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/catalogue', catalogueRouter);
app.use('/api/public', publicRouter);
app.use('/api/admin', adminRouter);
app.use('/api/pharmacy', pharmacyRouter);
app.use('/api/lab', labRouter);
app.use('/api/radiology', radiologyRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/ipd', ipdRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/attachments', attachmentsRouter);
app.use('/api/platform', platformRouter);
app.use('/api/diet-plans', dietPlansRouter);

app.use(errorHandler);
