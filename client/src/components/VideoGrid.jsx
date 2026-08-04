import React, { useEffect, useRef, useState } from 'react';
import { User, MicOff, Loader2 } from 'lucide-react';

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

  // Build the complete set of remote peers to display tiles for.
  // We merge BOTH the server's participant list AND any remoteStreams keys
  // so a tile always appears whether the participant entry or the stream arrives first.
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
        {/* ── Local user tile ─────────────────────────────────────────────── */}
        <div
          className={`relative w-full h-full min-h-[160px] sm:min-h-[220px] bg-[var(--surface)] rounded-lg overflow-hidden border transition-colors duration-150 flex items-center justify-center shadow-sm ${
            isSpeaking ? 'border-accent-blue' : 'border-[var(--border)]'
          }`}
        >
          {localStream ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transform -scale-x-100 ${isCameraOn ? 'opacity-100' : 'opacity-0'}`}
            />
          ) : null}

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

        {/* ── Remote participant tiles ─────────────────────────────────────── */}
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
  const [isPlaying, setIsPlaying] = useState(false);

  const stream = remoteObj?.stream;
  const displayName = speakerName || remoteObj?.speakerName || 'Participant';

  // Attach stream to video element via useEffect — reliable and React-safe
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) {
      setIsPlaying(false);
      return;
    }

    if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.muted = false;
      el.volume = 1.0;
    }

    const tryPlay = () => {
      el.play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          // Browsers block autoplay with sound — retry muted then unmute
          if (err.name === 'NotAllowedError') {
            el.muted = true;
            el.play()
              .then(() => {
                el.muted = false;
                setIsPlaying(true);
              })
              .catch(() => {});
          }
        });
    };

    tryPlay();

    el.onplaying = () => setIsPlaying(true);
    el.onpause = () => setIsPlaying(false);
    el.onwaiting = () => setIsPlaying(false);

    return () => {
      el.onplaying = null;
      el.onpause = null;
      el.onwaiting = null;
    };
  }, [stream]);

  return (
    <div className="relative w-full h-full min-h-[160px] sm:min-h-[220px] bg-[var(--surface)] rounded-lg overflow-hidden border border-[var(--border)] flex items-center justify-center shadow-sm">
      {/* Video element — always mounted so srcObject can be set */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover transition-opacity duration-300 ${isPlaying ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Avatar overlay — shown until video is playing */}
      {!isPlaying && (
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
                'Camera is off'
              )}
            </p>
          </div>
        </div>
      )}

      {/* Name tag */}
      <div className="absolute bottom-2 left-2 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded bg-black/75 text-[10px] sm:text-[11px] font-medium text-white backdrop-blur-sm z-10">
        {displayName}
      </div>
    </div>
  );
}
