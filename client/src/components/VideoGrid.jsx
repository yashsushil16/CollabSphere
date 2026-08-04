import React, { useEffect, useRef, useState } from 'react';
import { User, MicOff, Loader2, Volume2, VolumeX } from 'lucide-react';

export default function VideoGrid({
  localStream,
  remoteStreams = {},
  participants = [],
  socketId,
  speakerName,
  isCameraOn,
  isMicOn,
  audioLevel = 0,
}) {
  const localVideoRef = useRef(null);

  // Attach local stream to video element
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localStream) return;
    if (el.srcObject !== localStream) {
      el.srcObject = localStream;
      el.muted = true;
      el.play().catch(() => {});
    }
  }, [localStream]);

  // Merge both sources so a tile always shows regardless of which arrives first
  const remotePeerIds = new Set([
    ...Object.keys(remoteStreams),
    ...participants.filter((p) => p.socketId && p.socketId !== socketId).map((p) => p.socketId),
  ]);

  const displayPeers = Array.from(remotePeerIds).map((id) => {
    const fromParticipants = participants.find((p) => p.socketId === id);
    const fromStreams = remoteStreams[id];
    return {
      socketId: id,
      speakerName: fromParticipants?.speakerName || fromStreams?.speakerName || 'Participant',
    };
  });

  const totalOther = displayPeers.length;
  const isSpeaking = audioLevel > 15;

  return (
    <div className="flex-1 w-full h-full p-2 sm:p-4 flex items-center justify-center overflow-hidden select-none min-h-0">
      <div
        className={`w-full h-full grid gap-2 sm:gap-3 items-center justify-center ${
          totalOther === 0
            ? 'grid-cols-1 max-w-4xl'
            : totalOther === 1
            ? 'grid-cols-1 sm:grid-cols-2 max-w-6xl'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl'
        }`}
      >
        {/* ── Local tile ──────────────────────────────────────────────────── */}
        <div
          className={`relative w-full h-full min-h-[160px] sm:min-h-[220px] bg-[var(--surface)] rounded-lg overflow-hidden border transition-colors duration-150 flex items-center justify-center shadow-sm ${
            isSpeaking ? 'border-accent-blue' : 'border-[var(--border)]'
          }`}
        >
          {/* Video always mounted — srcObject managed via ref */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transform -scale-x-100 absolute inset-0 ${isCameraOn && localStream ? 'opacity-100' : 'opacity-0'}`}
          />

          {(!localStream || !isCameraOn) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 bg-[var(--surface)]">
              <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-[var(--surface-hover)] flex items-center justify-center">
                <User className="w-7 h-7 sm:w-10 sm:h-10 text-[var(--text-3)]" />
              </div>
              <p className="text-xs sm:text-sm font-medium text-[var(--text-2)]">{speakerName || 'You'}</p>
            </div>
          )}

          <div className="absolute bottom-2 left-2 flex items-center gap-2 z-10">
            <div className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded bg-black/75 text-[10px] sm:text-[11px] font-medium text-white flex items-center gap-1.5 backdrop-blur-sm">
              {isMicOn && isSpeaking && (
                <span className="flex items-end gap-[2px] h-3">
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-1" />
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-2" />
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-3" />
                </span>
              )}
              <span>{speakerName || 'You'} (You)</span>
              {!isMicOn && <MicOff className="w-3 h-3 text-red-400" />}
            </div>
          </div>
        </div>

        {/* ── Remote tiles ────────────────────────────────────────────────── */}
        {displayPeers.map((p) => (
          <RemoteTile
            key={p.socketId}
            speakerName={p.speakerName}
            remoteObj={remoteStreams[p.socketId]}
          />
        ))}
      </div>
    </div>
  );
}

function RemoteTile({ speakerName, remoteObj }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const stream = remoteObj?.stream;
  const displayName = speakerName || remoteObj?.speakerName || 'Participant';

  // Attach remote stream to BOTH video and audio elements
  // Using a separate <audio> element ensures audio plays even when
  // the browser blocks video autoplay. Audio autoplay is less restricted.
  useEffect(() => {
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;

    if (!stream) {
      setHasVideo(false);
      return;
    }

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    console.log(`[VideoGrid] Remote stream — video tracks: ${videoTracks.length}, audio tracks: ${audioTracks.length}`);

    // ── Video ────────────────────────────────────────────────────────────────
    if (videoEl && videoTracks.length > 0) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
        videoEl.muted = true; // start muted — audio handled separately below
      }
      videoEl.play().then(() => {
        setHasVideo(true);
      }).catch(() => {
        // Autoplay blocked — still show the element, audio will play via <audio>
        setHasVideo(false);
      });

      const onVideoTrackEnabled = () => setHasVideo(videoTracks.some((t) => t.enabled && !t.muted));
      videoTracks.forEach((t) => {
        t.onmute = () => setHasVideo(false);
        t.onunmute = onVideoTrackEnabled;
        t.onended = () => setHasVideo(false);
      });
    } else {
      setHasVideo(false);
    }

    // ── Audio — dedicated <audio> element, NOT the video element ─────────────
    // This bypasses video autoplay restrictions on mobile. Browsers allow
    // <audio> to play after user interaction more liberally than <video>.
    if (audioEl && audioTracks.length > 0) {
      // Create audio-only stream to avoid the video element playing audio twice
      const audioOnlyStream = new MediaStream(audioTracks);
      if (audioEl.srcObject !== audioOnlyStream) {
        audioEl.srcObject = audioOnlyStream;
        audioEl.volume = 1.0;
        audioEl.muted = false;
      }
      audioEl.play().catch((err) => {
        console.warn('[VideoGrid] Audio autoplay blocked:', err.name);
        // Even if blocked, unmuting on any user interaction usually works
      });
    }

    return () => {
      videoTracks.forEach((t) => {
        t.onmute = null;
        t.onunmute = null;
        t.onended = null;
      });
    };
  }, [stream]);

  // Try to play audio on any user click (mobile autoplay bypass)
  const handleUnmute = () => {
    const audioEl = audioRef.current;
    if (audioEl) {
      audioEl.muted = false;
      audioEl.play().catch(() => {});
      setIsMuted(false);
    }
  };

  return (
    <div
      className="relative w-full h-full min-h-[160px] sm:min-h-[220px] bg-[var(--surface)] rounded-lg overflow-hidden border border-[var(--border)] flex items-center justify-center shadow-sm cursor-pointer"
      onClick={handleUnmute}
    >
      {/* Dedicated audio element — separate from video for reliable playback */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Video element — always in DOM, opacity controlled by track state */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover transition-opacity duration-300 ${hasVideo ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Avatar shown when video is off or no stream yet */}
      {!hasVideo && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 bg-[var(--surface)]">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center relative">
            <User className="w-7 h-7 sm:w-10 sm:h-10 text-[var(--text-3)]" />
            {!stream && (
              <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-accent-blue/20 text-accent-blue">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
            )}
          </div>
          <div className="text-center space-y-1">
            <p className="text-xs sm:text-sm font-semibold text-[var(--text-1)]">{displayName}</p>
            <p className="text-[10px] text-[var(--text-3)] font-mono flex items-center justify-center gap-1">
              {!stream ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-ping" />
                  Connecting…
                </>
              ) : (
                'Camera off'
              )}
            </p>
          </div>
        </div>
      )}

      {/* Tap to unmute hint — shown only if stream exists but audio may be blocked */}
      {stream && isMuted && (
        <button
          className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-black/70 text-yellow-400 backdrop-blur-sm"
          onClick={handleUnmute}
          title="Tap to enable audio"
        >
          <VolumeX className="w-4 h-4" />
        </button>
      )}

      {/* Name tag */}
      <div className="absolute bottom-2 left-2 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded bg-black/75 text-[10px] sm:text-[11px] font-medium text-white backdrop-blur-sm z-10 flex items-center gap-1.5">
        {stream && <Volume2 className="w-3 h-3 text-green-400" />}
        {displayName}
      </div>
    </div>
  );
}
