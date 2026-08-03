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

  // Attach local stream to video element (MUTED so user doesn't hear their own echo)
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch((err) => {
        console.warn('Local video playback notice:', err.message);
      });
    }
  }, [localStream, isCameraOn]);

  const remotePeerIds = Object.keys(remoteStreams);
  const isSpeaking = audioLevel > 15;

  return (
    <div className="flex-1 w-full h-full p-2 sm:p-4 flex items-center justify-center overflow-hidden select-none min-h-0">
      <div
        className={`w-full h-full grid gap-2 sm:gap-3 items-center justify-center ${
          remotePeerIds.length === 0
            ? 'grid-cols-1 max-w-4xl'
            : remotePeerIds.length === 1
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

        {/* Remote participant video tiles */}
        {remotePeerIds.map((peerId) => (
          <RemoteTile key={peerId} remoteObj={remoteStreams[peerId]} />
        ))}
      </div>
    </div>
  );
}

function RemoteTile({ remoteObj }) {
  const videoRef = useRef(null);

  // Attach remote stream to video element — UNMUTED so speaker plays remote participant's voice!
  useEffect(() => {
    if (videoRef.current && remoteObj?.stream) {
      videoRef.current.srcObject = remoteObj.stream;
      videoRef.current.muted = false; // Enable audio so participant voice is heard
      videoRef.current.volume = 1.0;
      videoRef.current.play().catch((err) => {
        console.warn('Remote video playback notice:', err.message);
      });
    }
  }, [remoteObj]);

  return (
    <div className="relative w-full h-full min-h-[160px] sm:min-h-[220px] bg-[var(--surface)] rounded-lg overflow-hidden border border-[var(--border)] flex items-center justify-center shadow-sm">
      {remoteObj?.stream ? (
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 sm:gap-3 p-4">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-[var(--surface-hover)] flex items-center justify-center">
            <User className="w-7 h-7 sm:w-10 sm:h-10 text-[var(--text-3)]" />
          </div>
          <p className="text-xs sm:text-sm font-medium text-[var(--text-2)]">{remoteObj?.speakerName || 'Participant'}</p>
        </div>
      )}
      <div className="absolute bottom-2 left-2 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded bg-black/75 text-[10px] sm:text-[11px] font-medium text-white backdrop-blur-sm z-10">
        {remoteObj?.speakerName || 'Participant'}
      </div>
    </div>
  );
}
