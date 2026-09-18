import path from 'path';
import dotenv from 'dotenv';

// Runs before any test file is required, so the Prisma client (constructed
// at module load time from process.env.DATABASE_URL) points at the test
// database rather than the dev/demo one.
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });
