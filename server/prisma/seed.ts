import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const clinic = await prisma.clinic.upsert({
    where: { slug: 'demo-clinic' },
    update: { tier: 3 },
    create: {
      name: 'Demo Clinic',
      slug: 'demo-clinic',
      tier: 3,
      taxPercent: 5,
    },
  });

  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { clinicId_email: { clinicId: clinic.id, email: 'admin@opdcare.test' } },
    update: {},
    create: {
      clinicId: clinic.id,
      name: 'Front Desk Admin',
      email: 'admin@opdcare.test',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  const doctorPassword = await bcrypt.hash('doctor123', 10);
  const doctorUser = await prisma.user.upsert({
    where: { clinicId_email: { clinicId: clinic.id, email: 'doctor@opdcare.test' } },
    update: {},
    create: {
      clinicId: clinic.id,
      name: 'Dr. Asha Rao',
      email: 'doctor@opdcare.test',
      password: doctorPassword,
      role: 'DOCTOR',
    },
  });

  const doctorProfile = await prisma.doctorProfile.upsert({
    where: { userId: doctorUser.id },
    update: {},
    create: {
      userId: doctorUser.id,
      specialization: 'General Medicine',
      department: 'OPD',
      slotMinutes: 15,
    },
  });

  const existingSchedule = await prisma.schedule.findFirst({ where: { doctorId: doctorProfile.id } });
  if (!existingSchedule) {
    await prisma.schedule.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        doctorId: doctorProfile.id,
        dayOfWeek,
        startTime: '09:00',
        endTime: '18:00',
      })),
    });
  }

  const patientPassword = await bcrypt.hash('patient123', 10);
  await prisma.user.upsert({
    where: { clinicId_email: { clinicId: clinic.id, email: 'patient@opdcare.test' } },
    update: {},
    create: {
      clinicId: clinic.id,
      name: 'Ravi Kumar',
      email: 'patient@opdcare.test',
      phone: '9999900000',
      password: patientPassword,
      role: 'PATIENT',
    },
  });

  const pharmacistPassword = await bcrypt.hash('pharmacist123', 10);
  await prisma.user.upsert({
    where: { clinicId_email: { clinicId: clinic.id, email: 'pharmacist@opdcare.test' } },
    update: {},
    create: {
      clinicId: clinic.id,
      name: 'Meera Pillai',
      email: 'pharmacist@opdcare.test',
      password: pharmacistPassword,
      role: 'PHARMACIST',
    },
  });

  const labTechPassword = await bcrypt.hash('labtech123', 10);
  await prisma.user.upsert({
    where: { clinicId_email: { clinicId: clinic.id, email: 'labtech@opdcare.test' } },
    update: {},
    create: {
      clinicId: clinic.id,
      name: 'Sanjay Iyer',
      email: 'labtech@opdcare.test',
      password: labTechPassword,
      role: 'LAB_TECHNICIAN',
    },
  });

  const pharmacyItems: { name: string; unitsPerStrip: number | null; pricePerUnit: number; costPricePerUnit: number; stockUnits: number }[] = [
    { name: 'Paracetamol 500mg', unitsPerStrip: 10, pricePerUnit: 2, costPricePerUnit: 1, stockUnits: 500 },
    { name: 'Amoxicillin 250mg', unitsPerStrip: 10, pricePerUnit: 5, costPricePerUnit: 3, stockUnits: 300 },
    { name: 'Cetirizine 10mg', unitsPerStrip: 10, pricePerUnit: 1.5, costPricePerUnit: 0.8, stockUnits: 400 },
    { name: 'Cough Syrup 100ml', unitsPerStrip: null, pricePerUnit: 60, costPricePerUnit: 40, stockUnits: 50 },
  ];
  for (const item of pharmacyItems) {
    const existing = await prisma.pharmacyItem.findFirst({ where: { clinicId: clinic.id, name: item.name } });
    if (!existing) {
      await prisma.pharmacyItem.create({ data: { ...item, clinicId: clinic.id } });
    }
  }

  const labTests: { name: string; price: number }[] = [
    { name: 'Complete Blood Count', price: 300 },
    { name: 'Blood Sugar (Fasting)', price: 100 },
    { name: 'Urine Routine', price: 150 },
    { name: 'Lipid Profile', price: 500 },
  ];
  for (const test of labTests) {
    const existing = await prisma.labTestCatalog.findFirst({ where: { clinicId: clinic.id, name: test.name } });
    if (!existing) {
      await prisma.labTestCatalog.create({ data: { ...test, clinicId: clinic.id } });
    }
  }

  const generalWard = await prisma.ward.findFirst({ where: { clinicId: clinic.id, name: 'General Ward' } });
  const generalWardId =
    generalWard?.id ?? (await prisma.ward.create({ data: { clinicId: clinic.id, name: 'General Ward' } })).id;
  const existingGeneralBeds = await prisma.bed.count({ where: { wardId: generalWardId } });
  if (existingGeneralBeds === 0) {
    await prisma.bed.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        wardId: generalWardId,
        label: `G-${i + 1}`,
        dailyRate: 1200,
      })),
    });
  }

  const icuWard = await prisma.ward.findFirst({ where: { clinicId: clinic.id, name: 'ICU' } });
  const icuWardId = icuWard?.id ?? (await prisma.ward.create({ data: { clinicId: clinic.id, name: 'ICU' } })).id;
  const existingIcuBeds = await prisma.bed.count({ where: { wardId: icuWardId } });
  if (existingIcuBeds === 0) {
    await prisma.bed.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        wardId: icuWardId,
        label: `ICU-${i + 1}`,
        dailyRate: 4500,
      })),
    });
  }

  console.log('Seed data ready. Clinic code: demo-clinic');
  console.log('  Admin:      admin@opdcare.test / admin123');
  console.log('  Doctor:     doctor@opdcare.test / doctor123');
  console.log('  Patient:    patient@opdcare.test / patient123');
  console.log('  Pharmacist: pharmacist@opdcare.test / pharmacist123');
  console.log('  Lab tech:   labtech@opdcare.test / labtech123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
