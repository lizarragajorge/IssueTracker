import express from 'express';
import chatRouter from './routes/chat.js';
import documentsRouter from './routes/documents.js';
import { config } from './config.js';

const app = express();

app.use(express.json());

app.use('/api', chatRouter);
app.use('/api', documentsRouter);

app.listen(config.port, () => {
  console.log(`Email RAG server listening on http://localhost:${config.port}`);
});
