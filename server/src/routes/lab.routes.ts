import { prisma } from '../prisma';
import { testDepartmentRouter } from '../utils/testDepartment';

export const labRouter = testDepartmentRouter({
  label: 'Lab',
  role: 'LAB_TECHNICIAN',
  starterKind: 'LAB_TEST',
  ordersRelation: 'labTestsOrdered',
  catalog: prisma.labTestCatalog,
  order: prisma.labTestOrder,
  invoice: prisma.labInvoice,
  resultItem: prisma.labResultItem,
});
