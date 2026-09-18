import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@opdcare.test' },
    update: {},
    create: {
      name: 'Front Desk Admin',
      email: 'admin@opdcare.test',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  const doctorPassword = await bcrypt.hash('doctor123', 10);
  const doctorUser = await prisma.user.upsert({
    where: { email: 'doctor@opdcare.test' },
    update: {},
    create: {
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
      data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        doctorId: doctorProfile.id,
        dayOfWeek,
        startTime: '09:00',
        endTime: '13:00',
      })),
    });
  }

  const patientPassword = await bcrypt.hash('patient123', 10);
  await prisma.user.upsert({
    where: { email: 'patient@opdcare.test' },
    update: {},
    create: {
      name: 'Ravi Kumar',
      email: 'patient@opdcare.test',
      phone: '9999900000',
      password: patientPassword,
      role: 'PATIENT',
    },
  });

  console.log('Seed data ready:');
  console.log('  Admin:   admin@opdcare.test / admin123');
  console.log('  Doctor:  doctor@opdcare.test / doctor123');
  console.log('  Patient: patient@opdcare.test / patient123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
