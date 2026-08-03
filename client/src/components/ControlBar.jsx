import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MessageSquare,
  PhoneOff,
  Sun,
  Moon,
  BookOpen,
  Copy,
  Check,
} from 'lucide-react';

export default function ControlBar({
  roomId,
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
  const [copied, setCopied] = useState(false);

  const copyMeetingCodeAndLink = () => {
    const code = roomId || 'architecture-review';
    const fullUrl = `${window.location.origin}/?room=${code}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed bottom-6 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 select-none max-w-[95vw] sm:max-w-none">
      <div className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl backdrop-blur-lg">
        {/* Mic */}
        <ControlButton
          onClick={onToggleMic}
          active={isMicOn}
          activeColor="bg-[var(--surface-hover)]"
          inactiveColor="bg-accent-red/15"
          title={isMicOn ? 'Mute' : 'Unmute'}
        >
          {isMicOn ? (
            <span className="flex items-center gap-1">
              <Mic className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[var(--text-1)]" />
              {/* Inline audio bars when speaking */}
              {isSpeaking && (
                <span className="flex items-end gap-[2px] h-3">
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-1" />
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-2" />
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-3" />
                </span>
              )}
            </span>
          ) : (
            <MicOff className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-accent-red" />
          )}
        </ControlButton>

        {/* Cam */}
        <ControlButton
          onClick={onToggleCamera}
          active={isCameraOn}
          activeColor="bg-[var(--surface-hover)]"
          inactiveColor="bg-accent-red/15"
          title={isCameraOn ? 'Stop Video' : 'Start Video'}
        >
          {isCameraOn ? (
            <Video className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[var(--text-1)]" />
          ) : (
            <VideoOff className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-accent-red" />
          )}
        </ControlButton>

        {/* Screen Share */}
        <div className="hidden sm:block">
          <ControlButton
            onClick={onToggleScreenShare}
            active={!isScreenSharing}
            activeColor="bg-[var(--surface-hover)]"
            inactiveColor="bg-accent-blue/15"
            title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
          >
            <Monitor className={`w-4 h-4 sm:w-[18px] sm:h-[18px] ${isScreenSharing ? 'text-accent-blue' : 'text-[var(--text-1)]'}`} />
          </ControlButton>
        </div>

        <Divider />

        {/* Knowledge Base */}
        <ControlButton onClick={onOpenKnowledgeModal} title="Upload Documents">
          <BookOpen className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[var(--text-1)]" />
        </ControlButton>

        {/* Copy Meeting Code & Invite Link */}
        <ControlButton onClick={copyMeetingCodeAndLink} title="Copy Meeting Code & Share Link">
          {copied ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-accent-green">
              <Check className="w-4 h-4 text-accent-green" />
              <span className="hidden sm:inline">Copied</span>
            </span>
          ) : (
            <Copy className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[var(--text-1)]" />
          )}
        </ControlButton>

        {/* Toggle side drawer */}
        <ControlButton
          onClick={onToggleDrawer}
          active={!isDrawerOpen}
          activeColor="bg-[var(--surface-hover)]"
          inactiveColor="bg-accent-blue/15"
          title="Toggle Workspace Panel"
        >
          <MessageSquare className={`w-4 h-4 sm:w-[18px] sm:h-[18px] ${isDrawerOpen ? 'text-accent-blue' : 'text-[var(--text-1)]'}`} />
        </ControlButton>

        {/* Theme */}
        <ControlButton onClick={onToggleTheme} title="Toggle Theme">
          {isDarkMode ? (
            <Sun className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[var(--text-1)]" />
          ) : (
            <Moon className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[var(--text-1)]" />
          )}
        </ControlButton>

        <Divider />

        {/* End Call */}
        <motion.button
          onClick={onEndRoom}
          whileTap={{ scale: 0.94 }}
          className="px-3 sm:px-4 py-2 rounded-xl bg-accent-red hover:bg-red-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors duration-100 touch-manipulation shadow-sm"
        >
          <PhoneOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="text-[11px] sm:text-xs">Leave</span>
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
      className={`p-2 sm:p-2.5 rounded-xl transition-colors duration-100 touch-manipulation ${
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
  return <div className="w-px h-5 sm:h-6 bg-[var(--border)] mx-0.5 sm:mx-1" />;
}
