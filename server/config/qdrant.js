import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
dotenv.config();

let qdrantClient = null;

const qdrantUrl = process.env.QDRANT_URL ? process.env.QDRANT_URL.trim() : '';
const qdrantKey = process.env.QDRANT_API_KEY ? process.env.QDRANT_API_KEY.trim() : '';

if (qdrantUrl && qdrantUrl !== 'https://your-cluster.qdrant.tech') {
  try {
    qdrantClient = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantKey || undefined,
    });
    console.log('[Qdrant SDK] Qdrant Cloud client initialized successfully.');
  } catch (err) {
    console.warn('[Qdrant SDK] Connection failed:', err.message);
  }
} else {
  console.log('[Qdrant SDK] Qdrant URL not configured. Local vector store fallback active.');
}

export default qdrantClient;
