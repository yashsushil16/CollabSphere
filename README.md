# CollabSphere — Autonomous Real-Time WebRTC Audio/Video Meeting Platform

CollabSphere is an autonomous real-time WebRTC audio/video meeting and classroom platform featuring background AI sub-agents for live speech-to-text transcription, semantic transcript retrieval (RAG), automated hallucination auditing, and post-session analytics.

---

## 🌟 Tech Stack & Infrastructure

- **Frontend**: React 18 + Vite + TailwindCSS + PeerJS + Socket.IO Client + Recharts + Lucide Icons
- **Backend Control Plane**: Node.js + Express + Socket.IO + Multer + PDF Parse
- **Speech-To-Text (STT)**: Groq API (`whisper-large-v3-turbo`) (with built-in simulated audio stream fallback)
- **L1 Query Cache**: Upstash Redis (with in-memory LRU fallback)
- **L2 Vector Database**: Qdrant Cloud (with local 384-dim cosine similarity fallback)
- **Fact-Checker Agent**: Google Gemini 1.5 Flash API (15-second background audit worker)
- **Fast LLM Agent**: Groq API (`llama-3.1-8b-instant` & `llama-3.3-70b-versatile`)

---

## 🚀 Quick Start Guide

### 1. Install Dependencies

```bash
# Server Dependencies
cd server
npm install

# Client Dependencies
cd ../client
npm install
```

### 2. Configure Environment Variables (Optional)

Create `.env` inside `server/`:

```env
PORT=5000
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
QDRANT_URL=https://your-cluster.qdrant.tech
QDRANT_API_KEY=your_qdrant_api_key
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token
```

> **Note**: If API keys are omitted, CollabSphere automatically uses intelligent in-memory fallback providers so all features can be tested out of the box immediately!

### 3. Run Development Servers

```bash
# Start Backend Control Plane (Port 5000)
cd server
npm run dev

# In a new terminal, start Frontend Client (Port 5173)
cd client
npm run dev
```

---

## 💡 Sub-Agent Specifications

1. **Real-Time Speech-to-Text Pipeline**: Microphones capture audio in 3-second slices, sending binary chunks via Socket.IO to Groq Whisper v3 turbo.
2. **In-Session RAG Agent (`@bot`)**: Semantic retrieval querying Upstash Redis L1 cache (<10ms hit) or Qdrant vector store top-k chunks, answered via Groq Llama 3.1 8B.
3. **15-Second Hallucination Auditor**: Background worker auditing transcript claims against uploaded domain documents using Gemini 1.5 Flash.
4. **Post-Session Analytics**: End-of-room trigger generating executive Markdown summary, topic timeline, talk-time pie chart, and action item checklist via Groq Llama 3.3 70B.
