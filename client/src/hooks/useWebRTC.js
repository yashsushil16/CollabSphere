import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * ICE server config - multiple STUN + free open TURN servers for NAT traversal.
 * Using metered.ca open TURN which is reliable for cross-network P2P.
 */
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Open TURN relay for symmetric NAT / mobile cellular networks
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

/**
 * useWebRTC
 *
 * Manages native RTCPeerConnection P2P mesh over Socket.IO signaling.
 *
 * CRITICAL DESIGN DECISIONS (fixes for all bugs):
 *
 * 1. Media stream is acquired ONCE on mount and stored in a ref (streamRef).
 *    It is never acquired again. The React state `localStream` is set once.
 *    This prevents mic toggling noise.
 *
 * 2. `peerConnections` and `iceCandidateQueues` are refs (not state).
 *    `createPeerConnection` is a stable ref-based function, not a useCallback
 *    with changing dependencies. This prevents peer connection teardown loops.
 *
 * 3. The signaling useEffect only depends on [socket, roomId]. When socket
 *    becomes available, we bind listeners ONCE and never re-bind.
 *
 * 4. ICE candidates are queued if they arrive before setRemoteDescription
 *    completes. They are drained once remote description is set.
 */
export const useWebRTC = (roomId, speakerId, speakerName, socket) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [permissionError, setPermissionError] = useState(null);

  // Stable refs — never cause re-renders or effect re-runs
  const streamRef = useRef(null);
  const pcsRef = useRef({});          // socketId -> RTCPeerConnection
  const queuesRef = useRef({});       // socketId -> RTCIceCandidate[]
  const socketRef = useRef(null);     // Stable reference to current socket
  const roomIdRef = useRef(null);
  const speakerNameRef = useRef(speakerName);

  // Keep speakerName ref in sync without causing re-renders
  useEffect(() => {
    speakerNameRef.current = speakerName;
  }, [speakerName]);

  // Keep socketRef and roomIdRef in sync
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // ─── STEP 1: Acquire media ONCE on component mount ───────────────────────
  useEffect(() => {
    let mounted = true;

    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((stream) => {
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setLocalStream(stream);
        console.log('[WebRTC] Local media acquired:', stream.getTracks().map(t => t.kind));
      })
      .catch((err) => {
        console.error('[WebRTC] Media permission error:', err.message);
        if (mounted) setPermissionError(err.message);
      });

    return () => {
      mounted = false;
    };
    // Intentionally empty deps — run ONCE on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── STEP 2: Cleanup all peer connections when leaving room ──────────────
  useEffect(() => {
    if (!roomId) {
      // Leaving room — close all peer connections
      Object.values(pcsRef.current).forEach((pc) => {
        try { pc.close(); } catch (_) {}
      });
      pcsRef.current = {};
      queuesRef.current = {};
      setRemoteStreams({});
    }
  }, [roomId]);

  // ─── STABLE HELPER: Create a peer connection for a remote participant ─────
  // Uses refs only — this function is STABLE and never changes reference.
  const createPC = useCallback((remoteSocketId, remoteSpeakerName) => {
    if (pcsRef.current[remoteSocketId]) {
      return pcsRef.current[remoteSocketId];
    }

    console.log(`[WebRTC] Creating RTCPeerConnection for ${remoteSpeakerName} (${remoteSocketId})`);
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcsRef.current[remoteSocketId] = pc;
    queuesRef.current[remoteSocketId] = [];

    // Add our local tracks to this peer connection
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        console.log(`[WebRTC] Adding local ${track.kind} track to PC for ${remoteSocketId}`);
        pc.addTrack(track, stream);
      });
    } else {
      console.warn('[WebRTC] No local stream available when creating PC — tracks not added');
    }

    // Handle remote tracks arriving
    pc.ontrack = (event) => {
      console.log(`[WebRTC] ontrack from ${remoteSocketId}:`, event.streams.length, 'streams');
      const [remoteStream] = event.streams;
      if (remoteStream) {
        setRemoteStreams((prev) => ({
          ...prev,
          [remoteSocketId]: {
            stream: remoteStream,
            speakerName: remoteSpeakerName || 'Participant',
          },
        }));
      }
    };

    // Send ICE candidates to the remote peer via our signaling channel
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('WEBRTC_SEND_ICE', {
          targetSocketId: remoteSocketId,
          candidate: event.candidate,
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state for ${remoteSocketId}: ${pc.iceConnectionState}`);
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state for ${remoteSocketId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        // Attempt ICE restart on failure
        console.warn(`[WebRTC] Connection failed for ${remoteSocketId}, attempting restart`);
        pc.restartIce();
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[remoteSocketId];
          return next;
        });
      }
    };

    return pc;
  }, []); // STABLE - no deps, uses refs only

  // ─── STABLE HELPER: Drain queued ICE candidates ──────────────────────────
  const drainIceQueue = useCallback(async (remoteSocketId) => {
    const pc = pcsRef.current[remoteSocketId];
    const queue = queuesRef.current[remoteSocketId] || [];

    if (!pc || !pc.remoteDescription || queue.length === 0) return;

    console.log(`[WebRTC] Draining ${queue.length} queued ICE candidates for ${remoteSocketId}`);
    queuesRef.current[remoteSocketId] = [];

    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[WebRTC] ICE candidate drain error:', err.message);
      }
    }
  }, []); // STABLE

  // ─── STEP 3: Bind socket signaling handlers ONCE when socket is ready ─────
  useEffect(() => {
    if (!socket || !roomId) return;

    console.log('[WebRTC] Binding signaling handlers to socket', socket.id);

    const onNewUserJoined = async ({ socketId, speakerName: remoteName }) => {
      if (socketId === socket.id) return;
      console.log(`[WebRTC] NEW_USER_JOINED: ${remoteName} (${socketId}) — sending offer`);

      const pc = createPC(socketId, remoteName);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('WEBRTC_SEND_OFFER', {
          targetSocketId: socketId,
          offer,
          speakerName: speakerNameRef.current,
        });
        console.log(`[WebRTC] Offer sent to ${socketId}`);
      } catch (err) {
        console.error('[WebRTC] createOffer error:', err);
      }
    };

    const onReceiveOffer = async ({ senderSocketId, senderSpeakerName, offer }) => {
      console.log(`[WebRTC] WEBRTC_RECEIVE_OFFER from ${senderSpeakerName} (${senderSocketId})`);

      const pc = createPC(senderSocketId, senderSpeakerName);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await drainIceQueue(senderSocketId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('WEBRTC_SEND_ANSWER', {
          targetSocketId: senderSocketId,
          answer,
        });
        console.log(`[WebRTC] Answer sent to ${senderSocketId}`);
      } catch (err) {
        console.error('[WebRTC] handleOffer error:', err);
      }
    };

    const onReceiveAnswer = async ({ senderSocketId, answer }) => {
      console.log(`[WebRTC] WEBRTC_RECEIVE_ANSWER from ${senderSocketId}`);
      const pc = pcsRef.current[senderSocketId];
      if (!pc) {
        console.warn('[WebRTC] No PC found for senderSocketId:', senderSocketId);
        return;
      }
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
        // Store for when PC is created
        if (!queuesRef.current[senderSocketId]) queuesRef.current[senderSocketId] = [];
        queuesRef.current[senderSocketId].push(candidate);
        return;
      }

      if (pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('[WebRTC] addIceCandidate error:', err.message);
        }
      } else {
        // Queue until remote description is set
        queuesRef.current[senderSocketId].push(candidate);
      }
    };

    const onUserLeft = ({ socketId }) => {
      console.log(`[WebRTC] USER_LEFT: ${socketId}`);
      const pc = pcsRef.current[socketId];
      if (pc) {
        try { pc.close(); } catch (_) {}
        delete pcsRef.current[socketId];
        delete queuesRef.current[socketId];
      }
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
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

  // ─── Camera toggle ────────────────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsCameraOn(track.enabled);
    }
  }, []);

  // ─── Microphone toggle ────────────────────────────────────────────────────
  const toggleMicrophone = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMicOn(track.enabled);
    }
  }, []);

  // ─── Screen share ─────────────────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        screenTrack.onended = () => {
          setIsScreenSharing(false);
          // Restore camera track in all peer connections
          const cameraTrack = streamRef.current?.getVideoTracks()[0];
          if (cameraTrack) {
            Object.values(pcsRef.current).forEach((pc) => {
              const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
              if (sender) sender.replaceTrack(cameraTrack).catch(() => {});
            });
          }
          setLocalStream(streamRef.current);
        };

        // Replace video track in all active peer connections
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
      const cameraTrack = streamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        Object.values(pcsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(cameraTrack).catch(() => {});
        });
      }
      setLocalStream(streamRef.current);
      setIsScreenSharing(false);
    }
  }, [isScreenSharing]);

  return {
    localStream,
    remoteStreams,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    permissionError,
    toggleCamera,
    toggleMicrophone,
    toggleScreenShare,
  };
};
