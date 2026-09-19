import 'dotenv/config';
import { app } from './app';
import { startReminderScheduler } from './utils/scheduler';

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`OPD Care API listening on port ${port}`);
});
startReminderScheduler();
