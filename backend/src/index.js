import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import invoicesRouter from './routes/invoices.js';
import reinvoiceRouter from './routes/reinvoice.js';
import mockRouter from './routes/mock.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.use('/api/invoices', invoicesRouter);
app.use('/api/reinvoice', reinvoiceRouter);
app.use('/api/mock', mockRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'REINVOICE' }));

app.listen(PORT, () => {
  console.log(`REINVOICE backend running on http://localhost:${PORT}`);
});
