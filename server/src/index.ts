import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.routes';
import { clinicsRouter } from './routes/clinics.routes';
import { doctorsRouter } from './routes/doctors.routes';
import { appointmentsRouter } from './routes/appointments.routes';
import { consultationsRouter } from './routes/consultations.routes';
import { patientsRouter } from './routes/patients.routes';
import { adminRouter } from './routes/admin.routes';
import { pharmacyRouter } from './routes/pharmacy.routes';
import { labRouter } from './routes/lab.routes';
import { reportsRouter } from './routes/reports.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/clinics', clinicsRouter);
app.use('/api/doctors', doctorsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/consultations', consultationsRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/pharmacy', pharmacyRouter);
app.use('/api/lab', labRouter);
app.use('/api/reports', reportsRouter);

app.use(errorHandler);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`OPD Care API listening on port ${port}`);
});
