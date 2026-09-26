import { Router } from 'express';
import { prisma } from '../prisma';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { loadVisitSummary, renderVisitSummaryPdf, verifySummaryToken, visitSummaryFileName } from '../utils/visitSummary';

// No login: what's reachable here is only what a signed, expiring link
// grants (see createSummaryToken) -- the link a patient receives on WhatsApp.
export const publicRouter = Router();

publicRouter.get(
  '/visit-summary/:token',
  asyncHandler(async (req, res) => {
    const appointmentId = verifySummaryToken(req.params.token);
    if (!appointmentId) throw new HttpError(404, 'This link has expired or is not valid');
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { clinicId: true } });
    if (!appointment) throw new HttpError(404, 'This link has expired or is not valid');
    const summary = await loadVisitSummary(appointment.clinicId, appointmentId);
    const pdf = await renderVisitSummaryPdf(summary);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${visitSummaryFileName(summary)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  }),
);
