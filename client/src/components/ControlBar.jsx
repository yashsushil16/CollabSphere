import React from 'react';
import { motion } from 'framer-motion';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Hand,
  MessageSquare,
  PhoneOff,
  Sun,
  Moon,
  BookOpen,
  Copy,
  Check,
} from 'lucide-react';

export default function ControlBar({
  isMicOn,
  isCameraOn,
  isScreenSharing,
  isDarkMode,
  audioLevel = 0,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleTheme,
  onToggleDrawer,
  onOpenKnowledgeModal,
  onEndRoom,
  isDrawerOpen,
}) {
  const isSpeaking = isMicOn && audioLevel > 15;
  const [copied, setCopied] = React.useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 select-none">
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-lg">
        {/* Mic */}
        <ControlButton
          onClick={onToggleMic}
          active={isMicOn}
          activeColor="bg-[var(--surface-hover)]"
          inactiveColor="bg-accent-red/12"
          title={isMicOn ? 'Mute' : 'Unmute'}
        >
          {isMicOn ? (
            <span className="flex items-center gap-1.5">
              <Mic className="w-[18px] h-[18px] text-[var(--text-1)]" />
              {/* Inline audio bars when speaking */}
              {isSpeaking && (
                <span className="flex items-end gap-[2px] h-3.5">
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-1" />
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-2" />
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-3" />
                </span>
              )}
            </span>
          ) : (
            <MicOff className="w-[18px] h-[18px] text-accent-red" />
          )}
        </ControlButton>

        {/* Cam */}
        <ControlButton
          onClick={onToggleCamera}
          active={isCameraOn}
          activeColor="bg-[var(--surface-hover)]"
          inactiveColor="bg-accent-red/12"
          title={isCameraOn ? 'Stop Video' : 'Start Video'}
        >
          {isCameraOn ? (
            <Video className="w-[18px] h-[18px] text-[var(--text-1)]" />
          ) : (
            <VideoOff className="w-[18px] h-[18px] text-accent-red" />
          )}
        </ControlButton>

        {/* Screen Share */}
        <ControlButton
          onClick={onToggleScreenShare}
          active={!isScreenSharing}
          activeColor="bg-[var(--surface-hover)]"
          inactiveColor="bg-accent-blue/12"
          title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
        >
          <Monitor className={`w-[18px] h-[18px] ${isScreenSharing ? 'text-accent-blue' : 'text-[var(--text-1)]'}`} />
        </ControlButton>

        <Divider />

        {/* Knowledge Base */}
        <ControlButton onClick={onOpenKnowledgeModal} title="Upload Documents">
          <BookOpen className="w-[18px] h-[18px] text-[var(--text-1)]" />
        </ControlButton>

        {/* Copy invite */}
        <ControlButton onClick={copyLink} title="Copy Invite Link">
          {copied ? (
            <Check className="w-[18px] h-[18px] text-accent-green" />
          ) : (
            <Copy className="w-[18px] h-[18px] text-[var(--text-1)]" />
          )}
        </ControlButton>

        {/* Toggle side drawer */}
        <ControlButton
          onClick={onToggleDrawer}
          active={!isDrawerOpen}
          activeColor="bg-[var(--surface-hover)]"
          inactiveColor="bg-accent-blue/12"
          title="Toggle Panel"
        >
          <MessageSquare className={`w-[18px] h-[18px] ${isDrawerOpen ? 'text-accent-blue' : 'text-[var(--text-1)]'}`} />
        </ControlButton>

        {/* Theme */}
        <ControlButton onClick={onToggleTheme} title="Toggle Theme">
          {isDarkMode ? (
            <Sun className="w-[18px] h-[18px] text-[var(--text-1)]" />
          ) : (
            <Moon className="w-[18px] h-[18px] text-[var(--text-1)]" />
          )}
        </ControlButton>

        <Divider />

        {/* End Call */}
        <motion.button
          onClick={onEndRoom}
          whileTap={{ scale: 0.94 }}
          className="px-5 py-2 rounded-pill bg-accent-red hover:bg-red-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors duration-100"
        >
          <PhoneOff className="w-4 h-4" />
          <span>Leave</span>
        </motion.button>
      </div>
    </div>
  );
}

function ControlButton({ children, onClick, active, activeColor, inactiveColor, title }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.94 }}
      title={title}
      className={`p-2.5 rounded-xl transition-colors duration-100 ${
        active === false && inactiveColor
          ? inactiveColor
          : activeColor || 'hover:bg-[var(--surface-hover)]'
      }`}
    >
      {children}
    </motion.button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-[var(--border)] mx-1" />;
}
