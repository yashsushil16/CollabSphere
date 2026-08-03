import qdrantClient from '../config/qdrant.js';
import crypto from 'crypto';

// In-Memory fallback vector store for room transcripts & uploaded domain knowledge
// Schema: { id, roomId, type: 'transcript'|'domain_doc', text, speakerName, timestamp, metadata }
const localVectorStore = [];

/**
 * Initialize Qdrant Collection if client is present
 */
export async function initQdrantCollection() {
  if (!qdrantClient) return;

  const collectionName = 'collabsphere_transcripts';
  try {
    const result = await qdrantClient.getCollections();
    const exists = result.collections.some((c) => c.name === collectionName);

    if (!exists) {
      await qdrantClient.createCollection(collectionName, {
        vectors: {
          size: 384,
          distance: 'Cosine',
        },
      });
      console.log(`[Qdrant] Collection '${collectionName}' created successfully.`);
    }
  } catch (err) {
    console.warn('[Qdrant Init Collection Error]:', err.message);
  }
}

/**
 * Generate a 384-dimensional vector embedding for text
 */
export async function generateEmbedding(text) {
  const words = text.toLowerCase().split(/\s+/);
  const vector = new Array(384).fill(0);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const index = (charCode * (j + 1) + i * 13) % 384;
      vector[index] += (charCode / 255.0) * 0.1;
    }
  }
  
  // Normalize vector to unit length
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
  return vector.map((val) => val / magnitude);
}

/**
 * Store a transcript chunk or uploaded document in Qdrant & local store
 */
export async function addVectorRecord(roomId, record) {
  const embedding = await generateEmbedding(record.text);
  // Qdrant requires IDs to be UUIDs or unsigned 64-bit integers
  const pointId = crypto.randomUUID();

  const recordPayload = {
    id: pointId,
    roomId,
    type: record.type || 'transcript',
    text: record.text,
    speakerName: record.speakerName || 'System',
    timestamp: record.timestamp || Date.now(),
    metadata: record.metadata || {},
  };

  // Push to local store
  localVectorStore.push({ ...recordPayload, vector: embedding });

  // Push to Qdrant if available
  if (qdrantClient) {
    try {
      await qdrantClient.upsert('collabsphere_transcripts', {
        wait: false,
        points: [
          {
            id: pointId,
            vector: embedding,
            payload: recordPayload,
          },
        ],
      });
    } catch (err) {
      console.warn('[Qdrant Upsert Error]:', err.message);
    }
  }
}

/**
 * Query top-K semantic vector search for room transcripts & knowledge base
 */
export async function searchVectorStore(roomId, queryText, limit = 5) {
  const queryEmbedding = await generateEmbedding(queryText);

  // 1. Try Qdrant search
  if (qdrantClient) {
    try {
      const searchResult = await qdrantClient.search('collabsphere_transcripts', {
        vector: queryEmbedding,
        limit,
        filter: {
          must: [{ key: 'roomId', match: { value: roomId } }],
        },
      });

      if (searchResult && searchResult.length > 0) {
        return searchResult.map((res) => ({
          text: res.payload.text,
          speakerName: res.payload.speakerName,
          timestamp: res.payload.timestamp,
          score: res.score,
        }));
      }
    } catch (err) {
      console.warn('[Qdrant Search Error]:', err.message);
    }
  }

  // 2. Fallback to Local Cosine Similarity Search
  const roomRecords = localVectorStore.filter((r) => r.roomId === roomId);
  if (roomRecords.length === 0) return [];

  const scored = roomRecords.map((rec) => {
    const similarity = cosineSimilarity(queryEmbedding, rec.vector);
    return {
      text: rec.text,
      speakerName: rec.speakerName,
      timestamp: rec.timestamp,
      score: similarity,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Retrieve all domain context documents uploaded for a room
 */
export function getDomainKnowledgeContext(roomId) {
  return localVectorStore
    .filter((r) => r.roomId === roomId && r.type === 'domain_doc')
    .map((r) => r.text)
    .join('\n---\n');
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
