import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

const PORT = Number(process.env.INGEST_API_PORT || 3850);
const HOST = process.env.INGEST_API_HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`Ingestion API listening at http://${HOST}:${PORT}`);
});
