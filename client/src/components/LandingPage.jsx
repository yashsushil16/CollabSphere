import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'framer-motion';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ArrowRight,
  ShieldCheck,
  Zap,
  Sparkles,
  Cpu,
  Bot,
  FileText,
  Activity,
  CheckCircle2,
  Lock,
  Globe,
  Database,
  Search,
  MessageSquare,
  BarChart3,
  Check,
  Copy,
  RefreshCw,
  Play,
  Volume2,
  Users,
  ChevronRight,
  Sparkle,
} from 'lucide-react';

// Custom spring curves
const SPRING_TRANSITION = { type: 'spring', stiffness: 260, damping: 20 };
const EASE_CUSTOM = [0.23, 1, 0.32, 1];

export default function LandingPage({
  roomId,
  speakerName,
  setSpeakerName,
  setRoomId,
  onJoin,
  localStream,
  isCameraOn,
  isMicOn,
  onToggleCamera,
  onToggleMicrophone,
  handleCreateNewCode,
  isDarkMode,
  onToggleTheme,
}) {
  const [startMode, setStartMode] = useState('create'); // 'create' | 'join'
  const [activeDemoTab, setActiveDemoTab] = useState('stt'); // 'stt' | 'rag' | 'audit' | 'analytics'
  const [copiedLink, setCopiedLink] = useState(false);
  const [simulatedQuery, setSimulatedQuery] = useState('');
  const [queryAnswer, setQueryAnswer] = useState(null);
  const [isQuerying, setIsQuerying] = useState(false);

  const previewVideoRef = useRef(null);
  const containerRef = useRef(null);

  const { scrollYProgress } = useScroll({ target: containerRef });
  const heroY = useTransform(scrollYProgress, [0, 0.25], [0, -60]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0.85]);
  const cardScale = useTransform(scrollYProgress, [0, 0.3], [1, 0.96]);

  // Attach local stream to landing video preview
  useEffect(() => {
    if (previewVideoRef.current && localStream) {
      previewVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isCameraOn]);

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSimulatedBotQuery = (prompt, answer) => {
    setIsQuerying(true);
    setSimulatedQuery(prompt);
    setQueryAnswer(null);
    setTimeout(() => {
      setIsQuerying(false);
      setQueryAnswer(answer);
    }, 400);
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#121316] text-[#F3F4F6] font-sans overflow-x-hidden selection:bg-blue-500/30 relative"
    >
      {/* Fixed Low-Bitrate Looping Abstract Network Mesh Video Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-20 mix-blend-screen">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover filter brightness-90 contrast-110"
        >
          <source
            src="https://assets.mixkit.co/videos/preview/mixkit-abstract-technology-network-mesh-loop-31824-large.mp4"
            type="video/mp4"
          />
        </video>
      </div>

      {/* Dynamic Background Mesh Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-blue-600/15 via-emerald-500/10 to-transparent blur-[140px] rounded-full" />
        <div className="absolute top-[40%] -left-[10%] w-[600px] h-[600px] bg-blue-500/10 blur-[150px] rounded-full" />
        <div className="absolute top-[65%] -right-[10%] w-[600px] h-[600px] bg-emerald-500/10 blur-[150px] rounded-full" />
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(#2A2D34_1px,transparent_1px)] [background-size:32px_32px] opacity-25" />
      </div>

      {/* ── STICKY FLOATING GLASS NAVBAR ──────────────────────────────────── */}
      <header className="fixed top-4 inset-x-0 z-50 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto backdrop-blur-xl bg-[#1A1C20]/80 border border-[#2A2D34] rounded-full px-5 py-2.5 flex items-center justify-between shadow-2xl shadow-black/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-emerald-400 p-[1px] flex items-center justify-center shadow-lg shadow-blue-500/20">
              <div className="w-full h-full bg-[#121316] rounded-full flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>
            </div>
            <span className="font-bold text-sm sm:text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">
              CollabSphere
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AI Sub-Agents Active
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="#features"
              className="hidden md:inline-block text-xs font-medium text-gray-400 hover:text-white transition-colors px-3 py-1.5"
            >
              Features
            </a>
            <a
              href="#sub-agents"
              className="hidden md:inline-block text-xs font-medium text-gray-400 hover:text-white transition-colors px-3 py-1.5"
            >
              Sub-Agents
            </a>
            <a
              href="#quick-launch"
              className="group relative inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all active:scale-[0.97]"
            >
              <span>Launch Room</span>
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                <ArrowRight className="w-3 h-3" />
              </span>
            </a>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ─────────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-20 sm:pt-44 sm:pb-28 px-4 sm:px-6 max-w-6xl mx-auto z-10">
        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="text-center max-w-4xl mx-auto">
          {/* Slogan / Eyebrow Text */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_CUSTOM }}
            className="inline-flex items-center gap-2 text-blue-400 text-xs sm:text-sm font-semibold tracking-widest uppercase mb-4"
          >
            <Activity className="w-4 h-4 text-blue-400 animate-pulse" />
            <span>Project meetings made useful.</span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE_CUSTOM }}
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.08] mb-6"
          >
            Stop hosting meetings.{' '}
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-300">
              Start running intelligent workspaces.
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: EASE_CUSTOM }}
            className="text-base sm:text-lg md:text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed mb-10"
          >
            Real-time WebRTC audio/video powered by autonomous AI sub-agents that transcribe, fact-check live speech,
            and answer transcript queries in under <span className="text-emerald-400 font-semibold">10ms</span>.
          </motion.p>
        </motion.div>

        {/* ── INTERACTIVE DOUBLE-BEZEL ROOM LAUNCH & PREVIEW CARD ────────── */}
        <motion.div
          id="quick-launch"
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.3, ease: EASE_CUSTOM }}
          className="max-w-4xl mx-auto"
        >
          {/* Outer Shell (Double-Bezel Architecture) */}
          <div className="p-2 sm:p-3 rounded-[2.5rem] bg-[#1A1C20]/90 border border-[#2A2D34] shadow-2xl shadow-black/80 backdrop-blur-2xl relative overflow-hidden group">
            {/* Ambient inner glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Inner Core */}
            <div className="rounded-[calc(2.5rem-0.75rem)] bg-[#121316] border border-[#23262D] p-5 sm:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                {/* Left Column: Form & Room Control */}
                <div className="lg:col-span-7 space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 bg-[#1A1C20] p-1 rounded-full border border-[#2A2D34]">
                      <button
                        type="button"
                        onClick={() => setStartMode('create')}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${startMode === 'create'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-gray-400 hover:text-white'
                          }`}
                      >
                        Create Room
                      </button>
                      <button
                        type="button"
                        onClick={() => setStartMode('join')}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${startMode === 'join'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-gray-400 hover:text-white'
                          }`}
                      >
                        Join Room
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onToggleMicrophone}
                        className={`p-2 rounded-full border transition-all ${isMicOn
                            ? 'bg-[#1A1C20] border-[#2A2D34] text-emerald-400 hover:bg-[#22252A]'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                          }`}
                        title={isMicOn ? 'Microphone On' : 'Microphone Muted'}
                      >
                        {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={onToggleCamera}
                        className={`p-2 rounded-full border transition-all ${isCameraOn
                            ? 'bg-[#1A1C20] border-[#2A2D34] text-emerald-400 hover:bg-[#22252A]'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                          }`}
                        title={isCameraOn ? 'Camera On' : 'Camera Off'}
                      >
                        {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <form onSubmit={onJoin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Your Speaker Name</label>
                      <input
                        type="text"
                        required
                        value={speakerName}
                        onChange={(e) => setSpeakerName(e.target.value)}
                        placeholder="e.g. Alex Rivera"
                        className="w-full px-4 py-3 rounded-xl bg-[#1A1C20] border border-[#2A2D34] focus:border-blue-500 text-sm text-white placeholder-gray-500 outline-none transition-colors"
                      />
                    </div>

                    {startMode === 'create' ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-400">Generated Room Code</label>
                          <button
                            type="button"
                            onClick={handleCreateNewCode}
                            className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 font-medium"
                          >
                            <RefreshCw className="w-3 h-3" /> New 5-Letter Code
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 px-4 py-3 rounded-xl bg-[#1A1C20] border border-[#2A2D34] font-mono text-sm font-bold text-white flex items-center justify-between tracking-widest">
                            <span className="uppercase text-blue-400">{roomId}</span>
                            <span className="text-[10px] text-gray-500 font-sans tracking-normal font-normal">5-letter code</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyLink}
                            title="Copy Shareable Room Link"
                            className="p-3 rounded-xl bg-[#1A1C20] border border-[#2A2D34] hover:bg-[#22252A] text-gray-300 transition-colors"
                          >
                            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Enter 5-Letter Room Code or Link</label>
                        <input
                          type="text"
                          required
                          value={roomId}
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase();
                            if (val.includes('room=')) {
                              const match = val.match(/room=([^&]+)/);
                              setRoomId(match ? match[1] : val);
                            } else {
                              setRoomId(val);
                            }
                          }}
                          placeholder="e.g. kxpyz"
                          className="w-full px-4 py-3 rounded-xl bg-[#1A1C20] border border-[#2A2D34] focus:border-blue-500 font-mono text-sm text-white placeholder-gray-500 outline-none transition-colors"
                        />
                      </div>
                    )}

                    {/* Main CTA Button with Button-in-Button Arrow Pill */}
                    <motion.button
                      type="submit"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full py-4 px-6 rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-emerald-500 text-white font-semibold text-sm shadow-xl shadow-blue-600/30 flex items-center justify-between transition-all group"
                    >
                      <span className="tracking-wide">Launch Free Room Now</span>
                      <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-1 transition-transform">
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    </motion.button>
                  </form>
                </div>

                {/* Right Column: Live Camera / Simulated Sub-Agent Preview */}
                <div className="lg:col-span-5">
                  <div className="relative rounded-2xl bg-[#1A1C20] border border-[#2A2D34] overflow-hidden aspect-video lg:aspect-square flex flex-col justify-between p-4 shadow-inner">
                    {isCameraOn && localStream ? (
                      <video
                        ref={previewVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#1A1C20] to-[#121316] p-6 text-center">
                        <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3">
                          <Bot className="w-8 h-8 text-blue-400 animate-bounce" />
                        </div>
                        <p className="text-xs font-semibold text-gray-300">Live AI Sub-Agent Mesh Ready</p>
                        <p className="text-[11px] text-gray-500 mt-1">Turn on camera to preview video tile</p>
                      </div>
                    )}

                    {/* Floating Overlay Pill 1: Live Status */}
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="backdrop-blur-md bg-black/60 px-3 py-1 rounded-full border border-white/10 text-[10px] font-medium text-emerald-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>Live STT & Fact-Check Ready</span>
                      </div>
                    </div>

                    {/* Floating Overlay Pill 2: Simulated Live Speech Bubble */}
                    <div className="relative z-10 backdrop-blur-md bg-black/75 border border-white/10 p-3 rounded-xl shadow-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Live Transcript</span>
                        <span className="text-[9px] text-gray-400 font-mono">10ms L1 Hit</span>
                      </div>
                      <p className="text-xs text-gray-200 font-mono truncate">
                        "{speakerName || 'Speaker'}: We are shipping the sub-agent pipeline today."
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── METRIC HIGHLIGHT STRIP ────────────────────────────────────────── */}
      <section className="py-12 border-y border-[#2A2D34] bg-[#1A1C20]/40 backdrop-blur-md relative z-10">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="space-y-1">
            <h3 className="text-3xl font-extrabold text-white font-mono">&lt; 10ms</h3>
            <p className="text-xs text-gray-400 font-medium">L1 Redis Transcript Retrieval</p>
          </div>
          <div className="space-y-1">
            <h3 className="text-3xl font-extrabold text-emerald-400 font-mono">15 sec</h3>
            <p className="text-xs text-gray-400 font-medium">Gemini Fact-Check Audit Loop</p>
          </div>
          <div className="space-y-1">
            <h3 className="text-3xl font-extrabold text-blue-400 font-mono">384-Dim</h3>
            <p className="text-xs text-gray-400 font-medium">Qdrant Vector Embeddings</p>
          </div>
          <div className="space-y-1">
            <h3 className="text-3xl font-extrabold text-amber-400 font-mono">100% P2P</h3>
            <p className="text-xs text-gray-400 font-medium">WebRTC Encrypted Video Mesh</p>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE SUB-AGENT SHOWCASE (BENTO ARCHITECTURE) ───────────── */}
      <section id="sub-agents" className="py-24 px-4 sm:px-6 max-w-6xl mx-auto relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Autonomous Pipeline
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white mt-4 tracking-tight">
            4 Autonomous Sub-Agents Running in the Background
          </h2>
          <p className="text-sm sm:text-base text-gray-400 mt-3">
            Every audio slice and text query is processed in parallel without disturbing your call.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Card 1: Real-Time STT (Col 7) */}
          <motion.div
            whileHover={{ y: -4 }}
            className="md:col-span-7 rounded-3xl bg-[#1A1C20] border border-[#2A2D34] p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between shadow-xl"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Mic className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-white">1. Real-Time Speech-to-Text Sub-Agent</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Microphones capture audio in 3-second slices, sending binary chunks via Socket.IO directly to Groq Whisper Large v3 Turbo.
              </p>
            </div>

            {/* Simulated Live Audio Wave */}
            <div className="mt-8 p-4 rounded-2xl bg-[#121316] border border-[#23262D] space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                  Streaming Audio (Whisper v3 Turbo)
                </span>
                <span className="font-mono text-[10px] text-gray-500">Chunk #142</span>
              </div>
              <div className="flex items-center gap-1.5 h-8">
                {[40, 70, 30, 90, 50, 80, 60, 100, 45, 75, 35, 85, 95, 50, 65, 40].map((h, i) => (
                  <motion.div
                    key={i}
                    animate={{ height: [`${h}%`, `${100 - h}%`, `${h}%`] }}
                    transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.08 }}
                    className="flex-1 bg-gradient-to-t from-blue-600 to-emerald-400 rounded-full"
                  />
                ))}
              </div>
            </div>
          </motion.div>

          {/* Card 2: 15-Sec Fact Checker (Col 5) */}
          <motion.div
            whileHover={{ y: -4 }}
            className="md:col-span-5 rounded-3xl bg-[#1A1C20] border border-[#2A2D34] p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between shadow-xl"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-xl font-bold text-white">2. 15-Second Hallucination Auditor</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Background worker auditing spoken claims against uploaded domain PDFs & docs using Gemini 1.5 Flash.
              </p>
            </div>

            {/* Audit Simulation Badge */}
            <div className="mt-8 p-4 rounded-2xl bg-[#121316] border border-[#23262D] space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-amber-400">Fact-Check Audit Result</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px]">VERIFIED</span>
              </div>
              <p className="text-xs text-gray-300 italic">
                "Statement matches uploaded Q3 PDF Specs page 14."
              </p>
            </div>
          </motion.div>

          {/* Card 3: Sub-10ms RAG Query Engine (Col 6) */}
          <motion.div
            whileHover={{ y: -4 }}
            className="md:col-span-6 rounded-3xl bg-[#1A1C20] border border-[#2A2D34] p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between shadow-xl"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-white">3. Sub-10ms In-Session RAG (`@bot`)</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Type `@bot` in chat to trigger semantic retrieval querying Upstash Redis L1 cache (&lt;10ms hit) or Qdrant vector store.
              </p>
            </div>

            {/* Interactive Query Simulator */}
            <div className="mt-6 space-y-2">
              <p className="text-[11px] font-semibold text-gray-400">Try an example question:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleSimulatedBotQuery(
                      '@bot What did Alex say about the deployment deadline?',
                      'Alex stated deployment is locked for Thursday 5 PM.'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#121316] border border-[#2A2D34] hover:border-blue-500 text-xs text-gray-300 transition-colors"
                >
                  "What did Alex say about deadlines?"
                </button>
              </div>

              {isQuerying && (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 font-mono animate-pulse">
                  Querying L1 Cache & Qdrant Top-K...
                </div>
              )}

              {queryAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-[#121316] border border-emerald-500/30 space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] text-emerald-400 font-mono">
                    <span>CollabSphere Bot</span>
                    <span>L1 Cache Hit (4.2ms)</span>
                  </div>
                  <p className="text-xs text-gray-200">{queryAnswer}</p>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Card 4: Post-Session Analytics (Col 6) */}
          <motion.div
            whileHover={{ y: -4 }}
            className="md:col-span-6 rounded-3xl bg-[#1A1C20] border border-[#2A2D34] p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between shadow-xl"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white">4. Post-Session Executive Analytics</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                End-of-room trigger generating executive Markdown summary, topic timeline, talk-time pie chart, and action item checklist via Llama 3.3 70B.
              </p>
            </div>

            {/* Talk-Time Visual Preview */}
            <div className="mt-6 p-4 rounded-2xl bg-[#121316] border border-[#23262D] space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Talk-Time Distribution</span>
                <span className="font-mono text-purple-400 text-[10px]">Llama 3.3 70B</span>
              </div>
              <div className="h-3 rounded-full bg-[#1A1C20] overflow-hidden flex">
                <div className="h-full bg-blue-500 w-[55%]" title="Alex (55%)" />
                <div className="h-full bg-emerald-500 w-[30%]" title="Sam (30%)" />
                <div className="h-full bg-amber-500 w-[15%]" title="Jordan (15%)" />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 font-mono pt-1">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Alex 55%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Sam 30%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Jordan 15%</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── HIGH-END FEATURE CARDS GRID ──────────────────────────────────── */}
      <section id="features" className="py-20 px-4 sm:px-6 max-w-6xl mx-auto relative z-10 border-t border-[#2A2D34]">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Engineered for Modern Engineering Teams
          </h2>
          <p className="text-sm text-gray-400 mt-3">
            Zero bloat, instant zero-setup rooms, and seamless browser compatibility.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: Database,
              title: 'L1 & L2 Dual Vector Memory',
              desc: 'Upstash Redis L1 cache for sub-10ms answers combined with Qdrant vector database for long-term transcript storage.',
              color: 'text-blue-400',
            },
            {
              icon: Lock,
              title: 'Guaranteed PCM Audio Fallback',
              desc: 'Dual-layer audio architecture using native WebRTC stream + raw PCM Int16 Socket.IO relay for 100% voice connectivity.',
              color: 'text-emerald-400',
            },
            {
              icon: FileText,
              title: 'Instant Document Ingestion',
              desc: 'Drag & drop domain PDFs or text files into the meeting. AI sub-agents index text chunks instantly for live retrieval.',
              color: 'text-purple-400',
            },
            {
              icon: ShieldCheck,
              title: '100% P2P WebRTC Video Grid',
              desc: 'Direct encrypted P2P mesh network with dedicated Metered TURN relay servers for cross-network reliability.',
              color: 'text-amber-400',
            },
            {
              icon: Globe,
              title: 'Short 5-Letter Room Codes',
              desc: 'Simple lowercase 5-letter room keys (e.g. kxpyz) make sharing meeting links Effortless.',
              color: 'text-sky-400',
            },
            {
              icon: Activity,
              title: 'Zero Account Requirement',
              desc: 'No credit cards, no passwords, no downloads. Enter your name and launch an AI-powered room in seconds.',
              color: 'text-pink-400',
            },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              whileHover={{ y: -5, scale: 1.01 }}
              className="p-6 rounded-2xl bg-[#1A1C20] border border-[#2A2D34] hover:border-blue-500/40 transition-all shadow-lg flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#121316] border border-[#23262D] flex items-center justify-center">
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <h4 className="text-base font-bold text-white">{item.title}</h4>
                <p className="text-xs text-gray-400 leading-relaxed">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── FOOTER CALL TO ACTION ────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 max-w-4xl mx-auto text-center relative z-10">
        <div className="p-8 sm:p-12 rounded-[2.5rem] bg-gradient-to-b from-[#1A1C20] to-[#121316] border border-[#2A2D34] shadow-2xl relative overflow-hidden space-y-6">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">
            Instant Start
          </span>

          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Ready to upgrade your meeting workspace?
          </h2>

          <p className="text-sm sm:text-base text-gray-300 max-w-xl mx-auto">
            Experience real-time AI transcription, live fact-checking, and sub-10ms transcript search today.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#quick-launch"
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 text-white font-semibold text-sm shadow-xl shadow-blue-600/30 hover:opacity-95 transition-all"
            >
              Launch Free Room Now
            </a>
          </div>
        </div>

        <footer className="mt-16 text-center text-xs text-gray-500">
          <p>© 2026 CollabSphere Control Plane. Powered by Groq, Gemini 1.5 Flash, Qdrant & Upstash Redis.</p>
        </footer>
      </section>
    </div>
  );
}
