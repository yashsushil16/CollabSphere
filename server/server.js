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

// RTC ICE server configuration — served to clients with STUN prioritization
// and short-lived / protected TURN credentials to optimize bandwidth.
app.get('/api/rtc-config', async (req, res) => {
  const { roomId } = req.query;

  // 1. STUN Prioritization: Always place public STUN servers at the TOP
  // so WebRTC attempts direct P2P connections first before attempting TURN relay.
  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ];

  // 2. Dynamic Short-Lived Credentials via Metered REST API (if configured)
  if (process.env.METERED_API_KEY && process.env.METERED_DOMAIN) {
    try {
      const meteredRes = await fetch(
        `https://${process.env.METERED_DOMAIN}.metered.live/api/v1/turn/credentials?apiKey=${process.env.METERED_API_KEY}`
      );
      if (meteredRes.ok) {
        const dynamicTurn = await meteredRes.json();
        if (Array.isArray(dynamicTurn)) {
          iceServers.push(...dynamicTurn);
          console.log('[RTC Config] Dynamic short-lived Metered TURN credentials generated');
        }
      }
    } catch (err) {
      console.warn('[RTC Config] Failed to fetch dynamic Metered credentials:', err.message);
    }
  }

  // 3. Static Env Custom TURN (Served to session users with room/context check)
  if (process.env.TURN_SERVER_URL && (!process.env.METERED_API_KEY || iceServers.length === 1)) {
    iceServers.push({
      urls: process.env.TURN_SERVER_URL.split(','),
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
      ttl: 3600, // 1 hour session TTL recommendation
    });
  }

  // 4. Default open relay TURN fallback (public, last resort)
  iceServers.push({
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turn:openrelay.metered.ca:80?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  });

  res.json({ iceServers, iceCandidatePoolSize: 10, ttl: 3600 });
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
  if (process.env.TURN_SERVER_URL) {
    console.log(`[RTC Config] Custom TURN server included: ${process.env.TURN_SERVER_URL}`);
  }
  console.log(`=======================================================`);
  await initQdrantCollection();
});
