import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import HeaderNav from './components/HeaderNav';
import VideoGrid from './components/VideoGrid';
import ControlBar from './components/ControlBar';
import LiveChat from './components/LiveChat';
import TranscriptPanel from './components/TranscriptPanel';
import FactCheckFeed from './components/FactCheckFeed';
import KnowledgeBaseModal from './components/KnowledgeBaseModal';
import AnalyticsModal from './components/AnalyticsModal';
import { useSocket } from './hooks/useSocket';
import { useAudioStream } from './hooks/useAudioStream';
import { useWebRTC } from './hooks/useWebRTC';
import {
  FileText,
  MessageSquare,
  ShieldAlert,
  ArrowRight,
  Sun,
  Moon,
  Camera,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';

const TABS = [
  { id: 'transcript', label: 'Transcript', Icon: FileText },
  { id: 'factcheck', label: 'Fact-Check', Icon: ShieldAlert },
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
];

export default function App() {
  const [roomId, setRoomId] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const [joinedRoom, setJoinedRoom] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); // Closed on mobile by default so video grid is 100% visible
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const previewVideoRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.classList.toggle('light', !isDarkMode);
  }, [isDarkMode]);

  // Open drawer by default on desktop (>= 768px)
  useEffect(() => {
    if (window.innerWidth >= 768) {
      setIsDrawerOpen(true);
    }
  }, []);

  const speakerId = useMemo(() => `usr_${Math.random().toString(36).substring(7)}`, []);

  // Request permissions immediately on site mount
  const {
    localStream, remoteStreams, isCameraOn, isMicOn, isScreenSharing, permissionError,
    toggleCamera, toggleMicrophone, toggleScreenShare,
  } = useWebRTC(joinedRoom ? roomId : null, speakerId, speakerName);

  const {
    socket, isConnected, participants, transcripts, chatMessages,
    factCheckFlags, isBotTyping, analyticsData, sendChatMessage, endRoomSession,
  } = useSocket(joinedRoom ? roomId : null, speakerId, speakerName);

  const { audioLevel } = useAudioStream(socket, joinedRoom ? roomId : null, speakerId, speakerName, isMicOn);

  // Attach local stream to preview video when on landing page
  useEffect(() => {
    if (!joinedRoom && previewVideoRef.current && localStream) {
      previewVideoRef.current.srcObject = localStream;
    }
  }, [joinedRoom, localStream]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId.trim() && speakerName.trim()) setJoinedRoom(true);
  };

  const handleEnd = () => {
    endRoomSession();
    setIsAnalyticsModalOpen(true);
  };

  useEffect(() => {
    if (analyticsData) setIsAnalyticsModalOpen(true);
  }, [analyticsData]);

  /* ========================================================
     LANDING — Mobile-optimized Join Form + Camera Preview
     ======================================================== */
  if (!joinedRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 select-none overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 sm:p-6 space-y-4 sm:space-y-5 shadow-lg my-auto"
        >
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold text-[var(--text-1)]">CollabSphere</h1>
            <button
              onClick={() => setIsDarkMode((p) => !p)}
              className="p-2 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-2)] transition-colors"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          {/* Camera Preview / Permission Box */}
          <div className="relative rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--canvas)] h-40 sm:h-48 flex items-center justify-center">
            {localStream && isCameraOn ? (
              <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : permissionError ? (
              <div className="p-4 text-center space-y-2">
                <AlertCircle className="w-7 h-7 text-accent-red mx-auto" />
                <p className="text-xs text-accent-red font-medium">Camera/Microphone Permission Denied</p>
                <p className="text-[11px] text-[var(--text-3)]">Please allow media permissions in your browser address bar to join calls.</p>
              </div>
            ) : (
              <div className="p-4 text-center space-y-2">
                <Camera className="w-7 h-7 text-[var(--text-3)] mx-auto animate-pulse" />
                <p className="text-xs text-[var(--text-2)] font-medium">Requesting camera & microphone permissions...</p>
              </div>
            )}

            {/* Permissions Status Pill */}
            <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded bg-black/70 text-[10px] font-medium text-white flex items-center gap-1.5 backdrop-blur-sm">
              {localStream ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-accent-green" />
                  <span>Camera & Mic Ready</span>
                </>
              ) : (
                <span>Permission Pending</span>
              )}
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1.5">Display Name</label>
              <input
                type="text"
                required
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
                placeholder="Enter your display name"
                className="w-full px-3 py-3 rounded-lg bg-[var(--canvas)] border border-[var(--border)] focus:border-accent-blue text-xs text-[var(--text-1)] placeholder-[var(--text-3)] outline-none transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-medium text-[var(--text-2)]">Room ID</label>
                <button type="button" onClick={() => setRoomId('architecture-review')} className="text-[10px] text-accent-blue hover:underline">
                  Use default
                </button>
              </div>
              <input
                type="text"
                required
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="e.g. architecture-review"
                className="w-full px-3 py-3 rounded-lg bg-[var(--canvas)] border border-[var(--border)] focus:border-accent-blue font-mono text-xs text-[var(--text-1)] placeholder-[var(--text-3)] outline-none transition-colors"
              />
            </div>

            <motion.button
              type="submit"
              whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-lg bg-accent-blue hover:bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors touch-manipulation shadow-sm"
            >
              Join Meeting <ArrowRight className="w-3.5 h-3.5" />
            </motion.button>
          </form>
        </motion.div>
      </div>
    );
  }

  /* ========================================================
     MEETING ROOM — Always Visible Video Grid + Elevated Controls
     ======================================================== */
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden select-none relative">
      {/* Top header bar */}
      <HeaderNav
        roomId={roomId}
        participantCount={participants.length || 1}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative pb-16 md:pb-0">
        {/* Video Stage — ALWAYS VISIBLE on stage */}
        <div className="flex-1 flex flex-col overflow-hidden relative w-full h-full min-h-0">
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            speakerName={speakerName}
            isCameraOn={isCameraOn}
            isMicOn={isMicOn}
            audioLevel={audioLevel}
          />
        </div>

        {/* Drawer Panel:
            - On Mobile (<768px): Bottom Sheet Overlay (h-[48vh] bottom-0 left-0 right-0) so Top Video remains visible!
            - On Desktop (>=768px): Side-by-Side Panel (w-80 lg:w-96)
        */}
        <AnimatePresence>
          {isDrawerOpen && (
            <motion.aside
              initial={{ y: '100%', mdX: '100%', opacity: 0 }}
              animate={{ y: 0, mdX: 0, opacity: 1 }}
              exit={{ y: '100%', mdX: '100%', opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="fixed md:relative bottom-0 left-0 right-0 md:inset-auto z-40 md:z-auto h-[48vh] md:h-full w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-[var(--border)] bg-[var(--surface)] md:bg-[var(--canvas)] flex flex-col overflow-hidden shrink-0 shadow-2xl md:shadow-none rounded-t-2xl md:rounded-none"
            >
              {/* Drawer Header with Close Button */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)]">
                <span className="text-xs font-semibold text-[var(--text-1)]">Workspace Panel</span>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-2)] transition-colors"
                  title="Close Panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tab Bar with Sliding Pill */}
              <div className="relative flex p-1 mx-3 mt-3 rounded-lg bg-[var(--canvas)] md:bg-[var(--surface)] border border-[var(--border)]">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex-1 py-2 md:py-1.5 rounded-md text-xs md:text-[11px] font-semibold flex items-center justify-center gap-1.5 z-10 transition-colors duration-150 touch-manipulation ${
                      activeTab === tab.id
                        ? 'text-[var(--text-1)]'
                        : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                    }`}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="tab-pill"
                        className="absolute inset-0 rounded-md bg-[var(--surface-hover)] border border-[var(--border)]"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <tab.Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden mt-1 pb-16 md:pb-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="h-full"
                  >
                    {activeTab === 'chat' && (
                      <LiveChat chatMessages={chatMessages} isBotTyping={isBotTyping} onSendMessage={sendChatMessage} />
                    )}
                    {activeTab === 'transcript' && (
                      <TranscriptPanel transcripts={transcripts} />
                    )}
                    {activeTab === 'factcheck' && (
                      <FactCheckFeed factCheckFlags={factCheckFlags} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom floating control bar */}
      <ControlBar
        isMicOn={isMicOn}
        isCameraOn={isCameraOn}
        isScreenSharing={isScreenSharing}
        isDarkMode={isDarkMode}
        audioLevel={audioLevel}
        isDrawerOpen={isDrawerOpen}
        onToggleMic={toggleMicrophone}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onToggleTheme={() => setIsDarkMode((p) => !p)}
        onToggleDrawer={() => setIsDrawerOpen((p) => !p)}
        onOpenKnowledgeModal={() => setIsKnowledgeModalOpen(true)}
        onEndRoom={handleEnd}
      />

      {/* Modals */}
      <KnowledgeBaseModal roomId={roomId} isOpen={isKnowledgeModalOpen} onClose={() => setIsKnowledgeModalOpen(false)} />
      <AnalyticsModal analyticsData={analyticsData} isOpen={isAnalyticsModalOpen} onClose={() => setIsAnalyticsModalOpen(false)} />
    </div>
  );
}
