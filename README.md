# CollabSphere — Autonomous Real-Time WebRTC Workspace

**CollabSphere** is an autonomous real-time WebRTC audio/video meeting and collaboration workspace. It features background AI sub-agents for live speech-to-text transcription, sub-10ms semantic transcript retrieval (RAG), automated document hallucination auditing, and post-session executive analytics.

---

## ✨ Key Features & Highlights

- ⚡ **Interactive Animated Landing Page**: High-performance landing page featuring Framer Motion scroll dynamics, double-bezel hardware container architecture, an interactive HTML5 Canvas meeting node mesh, and a low-bitrate background network animation loop.
- 🔑 **5-Letter Simple Room Codes**: Simple, clean 5-letter lowercase room keys (e.g. `kxpyz`) for friction-free instant meeting link sharing.
- 🎯 **Fixed Uniform Mobile & Desktop Video Grid**: Video tiles enforce a constant `aspect-video` ratio with `absolute inset-0` rendering, ensuring camera feeds never alter tile dimensions regardless of device orientation or camera resolution.
- 📡 **WebRTC Bandwidth & TURN Quota Optimization**:
  - Outgoing video streams constrained to `640x480` @ 15–20 fps max to minimize bandwidth.
  - Prioritized STUN candidate discovery (`stun:stun.l.google.com:19302`) before TURN relays to maximize P2P connections.
  - REST API endpoint (`/api/rtc-config`) delivering dynamic TURN credentials from Metered.ca.
  - Real-time connection report logging (`WEBRTC_CONNECTION_REPORT`) tracking P2P vs. TURN relay usage on the control plane.
- 🔊 **Dual-Layer Audio Infrastructure**: Native WebRTC audio stream paired with a raw Int16 PCM Socket.IO audio relay (`PCM_RELAY_CHUNK`) and Web Audio API gapless buffer playback for 100% voice connectivity under all network conditions.
- 📄 **Instant Knowledge Ingestion**: Drag & drop domain PDFs or TXT documents into the live meeting. AI sub-agents index text chunks into vector memory for real-time claim verification and query answering.

---

## 🤖 Autonomous AI Sub-Agents

| Sub-Agent | Tech Stack | Execution Model | Performance Target |
| :--- | :--- | :--- | :--- |
| **1. Speech-to-Text (STT)** | Groq Whisper Large v3 Turbo | 3-second PCM audio slices sent via Socket.IO | Real-time streaming |
| **2. In-Session RAG (`@bot`)** | Upstash Redis (L1) + Qdrant Vector (L2) + Groq Llama 3.1 8B | Instant semantic search on transcript history when `@bot` is typed in chat | **< 10ms** L1 cache hit |
| **3. Hallucination Auditor** | Google Gemini 1.5 Flash | 15-second background audit worker scanning spoken claims against domain PDFs | 15-sec loop |
| **4. Post-Session Analytics** | Groq Llama 3.3 70B + Recharts | End-of-meeting trigger generating Markdown summary, action items, & talk-time pie chart | On room termination |

---

## 🛠️ Tech Stack & Infrastructure

### Frontend Client
- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS + Custom 3D & Doppelrand Glassmorphism
- **Animations**: Framer Motion 12 + GPU Canvas Particle Mesh
- **Icons & Charts**: Lucide React + Recharts + React Markdown + Canvas Confetti
- **Communication**: Socket.IO Client + PeerJS + Web Audio API

### Backend Control Plane
- **Server**: Node.js + Express
- **Signaling & Audio Relay**: Socket.IO (Binary PCM Int16 buffer streaming)
- **Document Processing**: Multer + PDF-Parse
- **ICE Configuration**: REST API endpoint providing STUN & dynamic TURN credentials

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

### 2. Configure Environment Variables

Create a `.env` file inside the `server/` directory:

```env
PORT=5000

# AI Provider API Keys
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key

# Vector Database & L1 Cache
QDRANT_URL=https://your-cluster.qdrant.tech
QDRANT_API_KEY=your_qdrant_api_key
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token

# Metered TURN Credentials (Optional)
METERED_API_KEY=your_metered_api_key
METERED_DOMAIN=your_metered_domain.metered.live
```

> **Note**: If external API keys are omitted, CollabSphere seamlessly falls back to intelligent in-memory mock providers so all features remain functional out of the box!

### 3. Run Development Servers

```bash
# Start Backend Control Plane (Port 5000)
cd server
npm run dev

# In a new terminal, start Frontend Client (Port 5173)
cd client
npm run dev
```

Visit `http://localhost:5173` in your browser to launch the landing page and start an intelligent workspace room!

---

## 📂 Repository Layout

```
CollabSphere/
├── client/                     # Frontend Vite + React Application
│   ├── src/
│   │   ├── components/
│   │   │   ├── LandingPage.jsx  # Interactive scroll-animated landing page
│   │   │   ├── VideoGrid.jsx    # Fixed-tile WebRTC video grid
│   │   │   ├── ControlBar.jsx   # Media toggles & end call controls
│   │   │   ├── HeaderNav.jsx    # Room header & knowledge modal trigger
│   │   │   ├── LiveChat.jsx     # Live chat with @bot RAG support
│   │   │   ├── TranscriptPanel.jsx # Live Whisper transcript feed
│   │   │   └── FactCheckFeed.jsx   # Gemini 1.5 Flash hallucination audit feed
│   │   ├── hooks/
│   │   │   ├── useWebRTC.js     # Native P2P mesh & STUN/TURN connection stats
│   │   │   ├── useSocket.js     # Socket.IO signaling & PCM audio listener
│   │   │   └── useAudioStream.js# Audio level meter & PCM slice processor
│   │   ├── App.jsx              # Main entry point & room state router
│   │   └── index.css            # Global CSS tokens & natural scroll rules
│   └── package.json
└── server/                     # Control Plane Node.js Express Application
    ├── sockets/
    │   ├── roomHandler.js       # Socket.IO signaling & PCM audio relay
    │   └── aiAgents.js          # Sub-agents orchestration & L1/L2 memory
    ├── server.js                # Express app & /api/rtc-config STUN/TURN endpoint
    └── package.json
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more details.
