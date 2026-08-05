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
  PlusCircle,
  LogIn,
  RefreshCw,
  Copy,
  Check,
  Mic,
  MicOff,
  Video,
  VideoOff,
} from 'lucide-react';

import LandingPage from './components/LandingPage';

const TABS = [
  { id: 'transcript', label: 'Transcript', Icon: FileText },
  { id: 'factcheck', label: 'Fact-Check', Icon: ShieldAlert },
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
];

const generateRandomRoomCode = () => {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
};

export default function App() {
  const [startMode, setStartMode] = useState('create'); // 'create' or 'join'
  const [roomId, setRoomId] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const [joinedRoom, setJoinedRoom] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); // Closed on mobile by default
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);

  const previewVideoRef = useRef(null);

  // Initialize room code or check URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room') || params.get('code') || params.get('roomId');
    if (roomParam) {
      setRoomId(roomParam.trim());
      setStartMode('join');
    } else {
      setRoomId(generateRandomRoomCode());
    }
  }, []);

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

  // Initialize Socket.IO connection
  const {
    socket, isConnected, participants, transcripts, chatMessages,
    factCheckFlags, isBotTyping, analyticsData, sendChatMessage, endRoomSession,
  } = useSocket(joinedRoom ? roomId : null, speakerId, speakerName);

  // Native WebRTC P2P Mesh over Socket.IO Signaling
  const {
    localStream, remoteStreams, isCameraOn, isMicOn, isScreenSharing, permissionError,
    toggleCamera, toggleMicrophone, toggleScreenShare,
  } = useWebRTC(joinedRoom ? roomId : null, speakerId, speakerName, socket);

  const { audioLevel } = useAudioStream(socket, joinedRoom ? roomId : null, speakerId, speakerName, isMicOn);

  // Attach local stream to preview video when on landing page
  useEffect(() => {
    if (!joinedRoom && previewVideoRef.current && localStream) {
      previewVideoRef.current.srcObject = localStream;
    }
  }, [joinedRoom, localStream, isCameraOn]);

  const handleCreateNewCode = () => {
    const newCode = generateRandomRoomCode();
    setRoomId(newCode);
  };

  const handleCopyCode = () => {
    const fullUrl = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(fullUrl);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId.trim() && speakerName.trim()) setJoinedRoom(true);
  };

  const handleEnd = () => {
    endRoomSession();
    setIsAnalyticsModalOpen(true);
  };

  const handleGoHome = () => {
    setJoinedRoom(false);
    setIsAnalyticsModalOpen(false);
    if (window.history.pushState) {
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.pushState({ path: cleanUrl }, '', cleanUrl);
    }
    setStartMode('create');
    setRoomId(generateRandomRoomCode());
  };

  useEffect(() => {
    if (analyticsData) setIsAnalyticsModalOpen(true);
  }, [analyticsData]);

  /* ========================================================
     LANDING — Two Separate Start Options + Pre-Join Toggles
     ======================================================== */
  if (!joinedRoom) {
    return (
      <LandingPage
        roomId={roomId}
        speakerName={speakerName}
        setSpeakerName={setSpeakerName}
        setRoomId={setRoomId}
        onJoin={handleJoin}
        localStream={localStream}
        isCameraOn={isCameraOn}
        isMicOn={isMicOn}
        onToggleCamera={toggleCamera}
        onToggleMicrophone={toggleMicrophone}
        handleCreateNewCode={handleCreateNewCode}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode((p) => !p)}
      />
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
            participants={participants}
            socketId={socket?.id}
            speakerName={speakerName}
            isCameraOn={isCameraOn}
            isMicOn={isMicOn}
            audioLevel={audioLevel}
            socket={socket}
          />
        </div>

        {/* Workspace Panel Drawer */}
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
        roomId={roomId}
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
      <AnalyticsModal analyticsData={analyticsData} isOpen={isAnalyticsModalOpen} onClose={() => setIsAnalyticsModalOpen(false)} onGoHome={handleGoHome} />
    </div>
  );
}
