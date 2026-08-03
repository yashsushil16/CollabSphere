import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { registerRoomHandlers } from './sockets/roomHandler.js';
import { initQdrantCollection, addVectorRecord } from './services/vectorService.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e7, // 10MB audio/payload buffer
});

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    platform: 'CollabSphere Control Plane',
    timestamp: new Date().toISOString(),
    services: {
      groq: Boolean(process.env.GROQ_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      qdrant: Boolean(process.env.QDRANT_URL),
      redis: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    },
  });
});

// Domain Knowledge Document Ingestion Endpoint (PDF or TXT)
app.post('/api/knowledge/upload', upload.single('file'), async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!req.file || !roomId) {
      return res.status(400).json({ error: 'Missing file or roomId' });
    }

    let extractedText = '';
    const filename = req.file.originalname;

    if (filename.endsWith('.pdf')) {
      const pdfData = await pdfParse(req.file.buffer);
      extractedText = pdfData.text;
    } else {
      extractedText = req.file.buffer.toString('utf-8');
    }

    if (!extractedText.trim()) {
      return res.status(400).json({ error: 'Uploaded document contains no readable text.' });
    }

    // Index document chunks into vector store
    const chunks = extractedText.match(/[\s\S]{1,500}/g) || [extractedText];
    for (let i = 0; i < chunks.length; i++) {
      await addVectorRecord(roomId, {
        id: `doc_${Date.now()}_${i}`,
        type: 'domain_doc',
        text: chunks[i],
        speakerName: `Knowledge Base (${filename})`,
        timestamp: Date.now(),
        metadata: { filename, chunkIndex: i },
      });
    }

    console.log(`[Knowledge Base Upload] Room ${roomId}: Ingested ${filename} (${chunks.length} chunks)`);
    res.json({ success: true, filename, chunksCount: chunks.length });
  } catch (err) {
    console.error('[Knowledge Upload Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// Register Socket.IO connection event
io.on('connection', (socket) => {
  registerRoomHandlers(io, socket);
});

// Start Server & Initialize Vector Collection
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 CollabSphere Server active on port ${PORT}`);
  console.log(`   Real-Time STT | Qdrant RAG | Gemini Audit Agent`);
  console.log(`=======================================================`);
  await initQdrantCollection();
});
