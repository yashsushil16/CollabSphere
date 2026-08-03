import React, { useEffect, useRef, useState } from 'react';
import { User, MicOff, Loader2 } from 'lucide-react';

export default function VideoGrid({
  localStream,
  remoteStreams = {},
  participants = [],
  speakerId,
  speakerName,
  isCameraOn,
  isMicOn,
  audioLevel = 0,
}) {
  const localVideoRef = useRef(null);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch((err) => {
        console.warn('Local video playback notice:', err.message);
      });
    }
  }, [localStream, isCameraOn]);

  // Combine remoteStreams + participants list for instant 0-delay grid tiling on join
  const otherParticipants = (participants || []).filter((p) => p.speakerId && p.speakerId !== speakerId);
  const totalOtherCount = Math.max(Object.keys(remoteStreams).length, otherParticipants.length);

  const isSpeaking = audioLevel > 15;

  return (
    <div className="flex-1 w-full h-full p-2 sm:p-4 flex items-center justify-center overflow-hidden select-none min-h-0">
      <div
        className={`w-full h-full grid gap-2 sm:gap-3 items-center justify-center ${
          totalOtherCount === 0
            ? 'grid-cols-1 max-w-4xl'
            : totalOtherCount === 1
            ? 'grid-cols-1 sm:grid-cols-2 max-w-6xl'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl'
        }`}
      >
        {/* Local user camera tile */}
        <div
          className={`relative w-full h-full min-h-[160px] sm:min-h-[220px] bg-[var(--surface)] rounded-lg overflow-hidden border transition-colors duration-150 flex items-center justify-center shadow-sm ${
            isSpeaking
              ? 'border-accent-blue'
              : 'border-[var(--border)]'
          }`}
        >
          {isCameraOn && localStream ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 sm:gap-3 p-4">
              <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-[var(--surface-hover)] flex items-center justify-center">
                <User className="w-7 h-7 sm:w-10 sm:h-10 text-[var(--text-3)]" />
              </div>
              <p className="text-xs sm:text-sm font-medium text-[var(--text-2)]">{speakerName || 'You'}</p>
            </div>
          )}

          {/* Name tag chip */}
          <div className="absolute bottom-2 left-2 flex items-center gap-2 z-10">
            <div className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded bg-black/75 text-[10px] sm:text-[11px] font-medium text-white flex items-center gap-1.5 backdrop-blur-sm">
              {/* Audio wave bars */}
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

        {/* Instant Remote Tiles: Render immediately on participant join */}
        {otherParticipants.length > 0
          ? otherParticipants.map((participant) => (
              <RemoteTile
                key={participant.speakerId}
                speakerName={participant.speakerName}
                remoteObj={remoteStreams[participant.speakerId]}
              />
            ))
          : Object.keys(remoteStreams).map((peerId) => (
              <RemoteTile
                key={peerId}
                speakerName={remoteStreams[peerId]?.speakerName}
                remoteObj={remoteStreams[peerId]}
              />
            ))}
      </div>
    </div>
  );
}

function RemoteTile({ speakerName, remoteObj }) {
  const [hasLiveVideo, setHasLiveVideo] = useState(false);

  useEffect(() => {
    if (!remoteObj?.stream) {
      setHasLiveVideo(false);
      return;
    }

    const stream = remoteObj.stream;
    const checkVideoTracks = () => {
      const videoTracks = stream.getVideoTracks();
      const isLive = videoTracks.length > 0 && videoTracks.some((t) => t.enabled && t.readyState === 'live');
      setHasLiveVideo(isLive);
    };

    checkVideoTracks();

    stream.onaddtrack = checkVideoTracks;
    stream.onremovetrack = checkVideoTracks;

    const interval = setInterval(checkVideoTracks, 1000);
    return () => clearInterval(interval);
  }, [remoteObj]);

  const nameToDisplay = speakerName || remoteObj?.speakerName || 'Participant';

  return (
    <div className="relative w-full h-full min-h-[160px] sm:min-h-[220px] bg-[var(--surface)] rounded-lg overflow-hidden border border-[var(--border)] flex items-center justify-center shadow-sm">
      {hasLiveVideo && remoteObj?.stream ? (
        <video
          ref={(el) => {
            if (el && remoteObj?.stream && el.srcObject !== remoteObj.stream) {
              el.srcObject = remoteObj.stream;
              el.muted = false;
              el.volume = 1.0;
              el.play().catch((err) => console.warn('Remote video play error:', err.message));
            }
          }}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 sm:gap-3 p-4">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-[var(--surface-hover)] flex items-center justify-center relative">
            <User className="w-7 h-7 sm:w-10 sm:h-10 text-[var(--text-3)]" />
            {!remoteObj?.stream && (
              <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-accent-blue/15 text-accent-blue animate-spin">
                <Loader2 className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
          <p className="text-xs sm:text-sm font-medium text-[var(--text-2)]">{nameToDisplay}</p>
          <span className="text-[10px] text-[var(--text-3)] font-mono">
            {remoteObj?.stream ? 'Camera is Off' : 'Connecting video...'}
          </span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded bg-black/75 text-[10px] sm:text-[11px] font-medium text-white backdrop-blur-sm z-10">
        {nameToDisplay}
      </div>
    </div>
  );
}
