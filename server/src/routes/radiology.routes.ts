import { prisma } from '../prisma';
import { testDepartmentRouter } from '../utils/testDepartment';

export const radiologyRouter = testDepartmentRouter({
  label: 'Radiology',
  role: 'RADIOLOGY_TECHNICIAN',
  starterKind: 'RADIOLOGY',
  ordersRelation: 'radiologyOrdered',
  catalog: prisma.radiologyCatalog,
  order: prisma.radiologyTestOrder,
  invoice: prisma.radiologyInvoice,
  resultItem: prisma.radiologyResultItem,
});
