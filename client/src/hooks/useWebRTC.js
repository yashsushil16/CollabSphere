import { useEffect, useRef, useState, useCallback } from 'react';

// ── ICE Config — fetched from server so TURN credentials are configurable ─────
const FALLBACK_ICE_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turn:openrelay.metered.ca:80?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

let cachedIceConfig = null;

async function getIceConfig(roomId) {
  if (cachedIceConfig) return cachedIceConfig;
  try {
    const serverUrl = import.meta.env.VITE_SERVER_URL || '';
    const query = roomId ? `?roomId=${encodeURIComponent(roomId)}` : '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${serverUrl}/api/rtc-config${query}`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      cachedIceConfig = data;
      console.log('[WebRTC] ICE config loaded from server, servers:', data.iceServers?.length);
      return cachedIceConfig;
    }
  } catch (e) {
    console.warn('[WebRTC] ICE config fetch failed, using fallback:', e.message);
  }
  cachedIceConfig = FALLBACK_ICE_CONFIG;
  return cachedIceConfig;
}

// Warm up ICE config cache on module load (non-blocking)
getIceConfig().catch(() => {});

// ── Wait for local stream to be ready ────────────────────────────────────────
function waitForStream(streamRef, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (streamRef.current) { resolve(streamRef.current); return; }
    const start = Date.now();
    const interval = setInterval(() => {
      if (streamRef.current) {
        clearInterval(interval);
        resolve(streamRef.current);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        console.warn('[WebRTC] waitForStream timed out');
        resolve(null);
      }
    }, 50);
  });
}

export const useWebRTC = (roomId, speakerId, speakerName, socket) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [permissionError, setPermissionError] = useState(null);

  const streamRef = useRef(null);
  const pcsRef = useRef({});
  const queuesRef = useRef({});
  const socketRef = useRef(null);
  const speakerNameRef = useRef(speakerName);

  useEffect(() => { speakerNameRef.current = speakerName; }, [speakerName]);
  useEffect(() => { socketRef.current = socket; }, [socket]);

  // Fetch ICE config with roomId context when room is specified
  useEffect(() => {
    if (roomId) {
      getIceConfig(roomId).catch(() => {});
    }
  }, [roomId]);

  // ── Acquire media ONCE on mount ────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640, max: 640 },
        height: { ideal: 480, max: 480 },
        frameRate: { ideal: 15, max: 20 },
        facingMode: 'user',
      },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    .then((stream) => {
      if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      setLocalStream(stream);
      console.log('[WebRTC] Media acquired:', stream.getTracks().map((t) => t.kind));

      // Retroactively add tracks to any PCs created before media was ready
      Object.entries(pcsRef.current).forEach(([sid, pc]) => {
        if (pc.getSenders().filter((s) => s.track).length === 0) {
          console.log(`[WebRTC] Retroactively adding tracks to PC for ${sid}`);
          stream.getTracks().forEach((track) => { try { pc.addTrack(track, stream); } catch (e) {} });
        }
      });
    })
    .catch((err) => {
      console.error('[WebRTC] Media error:', err.message);
      if (mounted) setPermissionError(err.message);
    });

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup peer connections when leaving room ──────────────────────────────
  useEffect(() => {
    if (!roomId) {
      Object.values(pcsRef.current).forEach((pc) => { try { pc.close(); } catch (_) {} });
      pcsRef.current = {};
      queuesRef.current = {};
      setRemoteStreams({});
    }
  }, [roomId]);

  // ── Create RTCPeerConnection — SYNCHRONOUS wrapper, async ICE fetch inside ──
  // NOTE: createPC is synchronous so callers don't need to await it.
  //       It sets up the PC immediately using cached config, or falls back.
  //       getIceConfig() was pre-warmed on module load so it's usually instant.
  const createPC = useCallback((remoteSocketId, remoteSpeakerName) => {
    if (pcsRef.current[remoteSocketId]) return pcsRef.current[remoteSocketId];

    // Use cached config synchronously (was pre-warmed above), or fallback if not yet ready
    const iceConfig = cachedIceConfig || FALLBACK_ICE_CONFIG;
    console.log(`[WebRTC] Creating PC for ${remoteSpeakerName} (${remoteSocketId}) — ${iceConfig.iceServers?.length} ICE servers`);

    const pc = new RTCPeerConnection(iceConfig);
    pcsRef.current[remoteSocketId] = pc;
    queuesRef.current[remoteSocketId] = [];

    // Add local tracks if already available
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        console.log(`[WebRTC] Adding local ${track.kind} track to PC ${remoteSocketId}`);
        pc.addTrack(track, stream);
      });
    } else {
      console.warn(`[WebRTC] Stream not ready for ${remoteSocketId} — will add retroactively`);
    }

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      console.log(`[WebRTC] ontrack from ${remoteSocketId}:`, event.track.kind, 'streams:', event.streams.length);
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        setRemoteStreams((prev) => ({
          ...prev,
          [remoteSocketId]: { stream: remoteStream, speakerName: remoteSpeakerName || 'Participant' },
        }));
      } else {
        setRemoteStreams((prev) => {
          const existing = prev[remoteSocketId];
          const remoteStream = (existing && existing.stream) || new MediaStream();
          remoteStream.addTrack(event.track);
          return { ...prev, [remoteSocketId]: { stream: remoteStream, speakerName: remoteSpeakerName || 'Participant' } };
        });
      }
    };

    // ICE signaling
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('WEBRTC_SEND_ICE', { targetSocketId: remoteSocketId, candidate: event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE (${remoteSocketId}): ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE failed for ${remoteSocketId} — restarting`);
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Conn (${remoteSocketId}): ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        setRemoteStreams((prev) => { const n = { ...prev }; delete n[remoteSocketId]; return n; });
      }
    };

    return pc;
  }, []); // STABLE

  // ── Drain queued ICE candidates ─────────────────────────────────────────────
  const drainIceQueue = useCallback(async (remoteSocketId) => {
    const pc = pcsRef.current[remoteSocketId];
    const queue = queuesRef.current[remoteSocketId] || [];
    if (!pc?.remoteDescription?.type || queue.length === 0) return;

    console.log(`[WebRTC] Draining ${queue.length} queued ICE candidates for ${remoteSocketId}`);
    queuesRef.current[remoteSocketId] = [];
    for (const cand of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(cand)); }
      catch (e) { console.warn('[WebRTC] ICE drain error:', e.message); }
    }
  }, []); // STABLE

  // ── Signaling handlers ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !roomId) return;
    console.log('[WebRTC] Binding signaling handlers — socket:', socket.id);

    const onNewUserJoined = async ({ socketId, speakerName: remoteName }) => {
      if (socketId === socket.id) return;
      console.log(`[WebRTC] NEW_USER_JOINED: ${remoteName} (${socketId})`);

      // Wait for local stream so tracks are always included in the offer
      const stream = await waitForStream(streamRef);
      const pc = createPC(socketId, remoteName); // synchronous

      if (stream && pc.getSenders().filter((s) => s.track).length === 0) {
        stream.getTracks().forEach((track) => { try { pc.addTrack(track, stream); } catch (e) {} });
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('WEBRTC_SEND_OFFER', { targetSocketId: socketId, offer, speakerName: speakerNameRef.current });
        console.log(`[WebRTC] Offer sent to ${socketId}`);
      } catch (err) {
        console.error('[WebRTC] createOffer error:', err);
      }
    };

    const onReceiveOffer = async ({ senderSocketId, senderSpeakerName, offer }) => {
      console.log(`[WebRTC] Received offer from ${senderSpeakerName} (${senderSocketId})`);

      const stream = await waitForStream(streamRef);
      const pc = createPC(senderSocketId, senderSpeakerName); // synchronous

      if (stream && pc.getSenders().filter((s) => s.track).length === 0) {
        console.log(`[WebRTC] Adding tracks before answering offer from ${senderSocketId}`);
        stream.getTracks().forEach((track) => { try { pc.addTrack(track, stream); } catch (e) {} });
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await drainIceQueue(senderSocketId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('WEBRTC_SEND_ANSWER', { targetSocketId: senderSocketId, answer });
        console.log(`[WebRTC] Answer sent to ${senderSocketId}`);
      } catch (err) {
        console.error('[WebRTC] handleOffer error:', err);
      }
    };

    const onReceiveAnswer = async ({ senderSocketId, answer }) => {
      console.log(`[WebRTC] Received answer from ${senderSocketId}`);
      const pc = pcsRef.current[senderSocketId];
      if (!pc) { console.warn('[WebRTC] No PC for answer:', senderSocketId); return; }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await drainIceQueue(senderSocketId);
      } catch (err) {
        console.error('[WebRTC] handleAnswer error:', err);
      }
    };

    const onReceiveIce = async ({ senderSocketId, candidate }) => {
      if (!candidate) return;
      const pc = pcsRef.current[senderSocketId];
      if (!pc) {
        if (!queuesRef.current[senderSocketId]) queuesRef.current[senderSocketId] = [];
        queuesRef.current[senderSocketId].push(candidate);
        return;
      }
      if (pc.remoteDescription?.type) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { console.warn('[WebRTC] addIceCandidate error:', e.message); }
      } else {
        queuesRef.current[senderSocketId].push(candidate);
      }
    };

    const onUserLeft = ({ socketId }) => {
      console.log(`[WebRTC] USER_LEFT: ${socketId}`);
      const pc = pcsRef.current[socketId];
      if (pc) { try { pc.close(); } catch (_) {} delete pcsRef.current[socketId]; }
      delete queuesRef.current[socketId];
      setRemoteStreams((prev) => { const n = { ...prev }; delete n[socketId]; return n; });
    };

    socket.on('NEW_USER_JOINED', onNewUserJoined);
    socket.on('WEBRTC_RECEIVE_OFFER', onReceiveOffer);
    socket.on('WEBRTC_RECEIVE_ANSWER', onReceiveAnswer);
    socket.on('WEBRTC_RECEIVE_ICE', onReceiveIce);
    socket.on('USER_LEFT', onUserLeft);

    return () => {
      socket.off('NEW_USER_JOINED', onNewUserJoined);
      socket.off('WEBRTC_RECEIVE_OFFER', onReceiveOffer);
      socket.off('WEBRTC_RECEIVE_ANSWER', onReceiveAnswer);
      socket.off('WEBRTC_RECEIVE_ICE', onReceiveIce);
      socket.off('USER_LEFT', onUserLeft);
    };
  }, [socket, roomId, createPC, drainIceQueue]);

  // ── Controls ────────────────────────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsCameraOn(track.enabled); }
  }, []);

  const toggleMicrophone = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMicOn(track.enabled); }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          const camTrack = streamRef.current?.getVideoTracks()[0];
          if (camTrack) {
            Object.values(pcsRef.current).forEach((pc) => {
              const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
              if (sender) sender.replaceTrack(camTrack).catch(() => {});
            });
          }
          setLocalStream(streamRef.current);
        };
        Object.values(pcsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack).catch(() => {});
        });
        setLocalStream(screenStream);
        setIsScreenSharing(true);
      } catch (err) {
        console.warn('[WebRTC] Screen share error:', err.message);
      }
    } else {
      const camTrack = streamRef.current?.getVideoTracks()[0];
      if (camTrack) {
        Object.values(pcsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(camTrack).catch(() => {});
        });
      }
      setLocalStream(streamRef.current);
      setIsScreenSharing(false);
    }
  }, [isScreenSharing]);

  return { localStream, remoteStreams, isCameraOn, isMicOn, isScreenSharing, permissionError, toggleCamera, toggleMicrophone, toggleScreenShare };
};
