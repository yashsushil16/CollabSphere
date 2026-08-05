import React, { useEffect, useRef, useState, useCallback } from 'react';
import { User, MicOff, Loader2, Volume2 } from 'lucide-react';

// ── Shared AudioContext for PCM playback ─────────────────────────────────────
// One shared context for all remote audio playback to avoid creating too many.
let sharedPlaybackCtx = null;
function getPlaybackCtx() {
  if (!sharedPlaybackCtx || sharedPlaybackCtx.state === 'closed') {
    sharedPlaybackCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  }
  return sharedPlaybackCtx;
}

// Per-speaker playback state: tracks the next scheduled play time for gapless audio
const speakerPlayTimes = {};

/**
 * Play a PCM_RELAY_CHUNK received from another participant.
 * Int16 ArrayBuffer → Float32 → AudioContext BufferSource → scheduled playback
 */
function playPcmChunk(speakerId, pcmBuffer) {
  try {
    const ctx = getPlaybackCtx();

    // Resume AudioContext if suspended (mobile browsers require user gesture first)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      return; // Will catch up on next chunk once resumed
    }

    const int16 = new Int16Array(pcmBuffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    const buffer = ctx.createBuffer(1, float32.length, 16000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    // Schedule for seamless gapless playback
    const now = ctx.currentTime;
    if (!speakerPlayTimes[speakerId] || speakerPlayTimes[speakerId] < now) {
      // First chunk or gap — add 60ms buffer to catch up
      speakerPlayTimes[speakerId] = now + 0.06;
    }
    source.start(speakerPlayTimes[speakerId]);
    speakerPlayTimes[speakerId] += buffer.duration;
  } catch (e) {
    // Ignore errors — next chunk will retry
  }
}

export default function VideoGrid({
  localStream,
  remoteStreams = {},
  participants = [],
  socketId,
  speakerName,
  isCameraOn,
  isMicOn,
  audioLevel = 0,
  socket, // needed for PCM relay playback
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

  // ── PCM relay playback — listen for remote audio on the socket ──────────────
  // This plays the Socket.IO audio relay regardless of WebRTC state.
  useEffect(() => {
    if (!socket) return;

    const onPcmChunk = ({ pcm, speakerId: senderSpeakerId }) => {
      if (senderSpeakerId === socketId) return; // Don't play own audio
      playPcmChunk(senderSpeakerId, pcm);
    };

    socket.on('PCM_RELAY_CHUNK', onPcmChunk);

    // Resume AudioContext on any user interaction (mobile autoplay policy)
    const resumeCtx = () => {
      try {
        const ctx = getPlaybackCtx();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      } catch (_) {}
    };
    document.addEventListener('click', resumeCtx, { once: true });
    document.addEventListener('touchstart', resumeCtx, { once: true });

    return () => {
      socket.off('PCM_RELAY_CHUNK', onPcmChunk);
      document.removeEventListener('click', resumeCtx);
      document.removeEventListener('touchstart', resumeCtx);
    };
  }, [socket, socketId]);

  // Merge both sources so a tile always shows
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
        {/* ── Local tile ────────────────────────────────────────────────────── */}
        <div
          className={`relative w-full aspect-video sm:aspect-auto sm:h-full min-h-[160px] sm:min-h-[220px] bg-[var(--surface)] rounded-xl overflow-hidden border transition-colors duration-150 flex items-center justify-center shadow-sm ${
            isSpeaking ? 'border-accent-blue' : 'border-[var(--border)]'
          }`}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 transition-opacity duration-300 ${isCameraOn && localStream ? 'opacity-100' : 'opacity-0'}`}
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

        {/* ── Remote tiles ──────────────────────────────────────────────────── */}
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
  const [hasVideo, setHasVideo] = useState(false);

  const stream = remoteObj?.stream;
  const displayName = speakerName || remoteObj?.speakerName || 'Participant';

  // Attach video stream (audio is handled by PCM relay above)
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!stream || !videoEl) { setHasVideo(false); return; }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) { setHasVideo(false); return; }

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
      videoEl.muted = true; // Audio via PCM relay
    }

    // Show video as soon as any track is live — don't hide based on play() result
    const checkTracks = () => {
      const anyLive = videoTracks.some((t) => t.readyState === 'live' && t.enabled);
      setHasVideo(anyLive);
    };

    checkTracks();

    videoEl.play().catch(() => {
      // play() may fail due to autoplay policy but track is still live
      // Re-check track state — video element may still display even without play()
      checkTracks();
    });

    videoEl.onloadedmetadata = () => { checkTracks(); videoEl.play().catch(() => {}); };
    videoEl.onplaying = () => setHasVideo(true);

    videoTracks.forEach((t) => {
      t.onmute = () => setHasVideo(false);
      t.onunmute = checkTracks;
      t.onended = () => setHasVideo(false);
    });

    // Poll track state every 2s as a safety net
    const poll = setInterval(checkTracks, 2000);

    return () => {
      clearInterval(poll);
      videoTracks.forEach((t) => { t.onmute = null; t.onunmute = null; t.onended = null; });
      if (videoEl) { videoEl.onloadedmetadata = null; videoEl.onplaying = null; }
    };
  }, [stream]);


  // Tap tile to resume AudioContext if suspended on mobile
  const handleTap = useCallback(() => {
    try {
      const ctx = getPlaybackCtx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (_) {}
  }, []);

  return (
    <div
      className="relative w-full aspect-video sm:aspect-auto sm:h-full min-h-[160px] sm:min-h-[220px] bg-[var(--surface)] rounded-xl overflow-hidden border border-[var(--border)] flex items-center justify-center shadow-sm cursor-pointer"
      onClick={handleTap}
    >
      {/* Video — muted (audio via PCM relay), absolute inset-0 guarantees fixed tile dimensions */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${hasVideo ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Avatar when no video */}
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 bg-[var(--surface)]">
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
            <p className="text-[10px] text-[var(--text-3)] flex items-center justify-center gap-1">
              {!stream ? (
                <><span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-ping" />Connecting…</>
              ) : 'Camera off'}
            </p>
          </div>
        </div>
      )}

      {/* Name tag */}
      <div className="absolute bottom-2 left-2 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded bg-black/75 text-[10px] sm:text-[11px] font-medium text-white backdrop-blur-sm z-10 flex items-center gap-1.5">
        {stream && <Volume2 className="w-3 h-3 text-green-400" />}
        {displayName}
      </div>
    </div>
  );
}
