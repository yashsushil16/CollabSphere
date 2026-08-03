import React, { useEffect, useRef } from 'react';
import { User, MicOff } from 'lucide-react';

export default function VideoGrid({
  localStream,
  remoteStreams = {},
  speakerName,
  isCameraOn,
  isMicOn,
  audioLevel = 0,
}) {
  const localVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const remotePeerIds = Object.keys(remoteStreams);
  const isSpeaking = audioLevel > 15;

  return (
    <div className="flex-1 p-2 sm:p-4 flex items-center justify-center overflow-hidden select-none">
      <div
        className={`w-full h-full grid gap-2 sm:gap-3 ${
          remotePeerIds.length === 0
            ? 'grid-cols-1 max-w-4xl'
            : remotePeerIds.length === 1
            ? 'grid-cols-1 sm:grid-cols-2 max-w-6xl'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl'
        }`}
      >
        {/* Local tile */}
        <div
          className={`relative bg-[var(--surface)] rounded-lg overflow-hidden border transition-colors duration-150 flex items-center justify-center ${
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
              className="w-full h-full object-cover transform -scale-x-100 min-h-[180px] sm:min-h-[240px]"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 sm:gap-3 min-h-[180px] sm:min-h-[240px] p-4">
              <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-[var(--surface-hover)] flex items-center justify-center">
                <User className="w-7 h-7 sm:w-10 sm:h-10 text-[var(--text-3)]" />
              </div>
              <p className="text-xs sm:text-sm font-medium text-[var(--text-2)]">{speakerName}</p>
            </div>
          )}

          {/* Name chip */}
          <div className="absolute bottom-2 left-2 flex items-center gap-2">
            <div className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded bg-black/70 text-[10px] sm:text-[11px] font-medium text-white flex items-center gap-1.5 backdrop-blur-sm">
              {/* Audio wave bars */}
              {isMicOn && isSpeaking && (
                <span className="flex items-end gap-[2px] h-3">
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-1" />
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-2" />
                  <span className="w-[2px] rounded-full bg-accent-green animate-wave-3" />
                </span>
              )}
              <span>{speakerName} (You)</span>
              {!isMicOn && <MicOff className="w-3 h-3 text-red-400" />}
            </div>
          </div>
        </div>

        {/* Remote tiles */}
        {remotePeerIds.map((peerId) => (
          <RemoteTile key={peerId} remoteObj={remoteStreams[peerId]} />
        ))}
      </div>
    </div>
  );
}

function RemoteTile({ remoteObj }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && remoteObj?.stream) {
      videoRef.current.srcObject = remoteObj.stream;
    }
  }, [remoteObj]);

  return (
    <div className="relative bg-[var(--surface)] rounded-lg overflow-hidden border border-[var(--border)] flex items-center justify-center">
      {remoteObj?.stream ? (
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover min-h-[180px] sm:min-h-[240px]" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 sm:gap-3 min-h-[180px] sm:min-h-[240px] p-4">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-[var(--surface-hover)] flex items-center justify-center">
            <User className="w-7 h-7 sm:w-10 sm:h-10 text-[var(--text-3)]" />
          </div>
          <p className="text-xs sm:text-sm font-medium text-[var(--text-2)]">{remoteObj?.speakerName || 'Participant'}</p>
        </div>
      )}
      <div className="absolute bottom-2 left-2 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded bg-black/70 text-[10px] sm:text-[11px] font-medium text-white backdrop-blur-sm">
        {remoteObj?.speakerName || 'Participant'}
      </div>
    </div>
  );
}
