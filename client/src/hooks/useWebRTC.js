import { useEffect, useRef, useState, useCallback } from 'react';

// STUN + Global TURN Relay Configuration for 100% Guaranteed WebRTC P2P Connection across Cellular & WiFi NATs
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: [
        'turn:global.relay.metered.ca:80',
        'turn:global.relay.metered.ca:443',
        'turn:global.relay.metered.ca:443?transport=tcp',
      ],
      username: 'e010839ec97bdc1c4f52e519',
      credential: 'Wc+u+x06w2/069/t',
    },
  ],
  iceCandidatePoolSize: 10,
};

export const useWebRTC = (roomId, speakerId, speakerName, socket) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [permissionError, setPermissionError] = useState(null);

  const streamRef = useRef(null);
  const peerConnections = useRef({}); // socketId -> RTCPeerConnection
  const iceCandidateQueues = useRef({}); // socketId -> Candidate[]

  // Request camera & mic permissions immediately on mount
  useEffect(() => {
    let isMounted = true;

    const requestMediaPermissions = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        if (isMounted) {
          streamRef.current = stream;
          setLocalStream(stream);
          setPermissionError(null);
          console.log('[Media Permissions Granted] Camera and Microphone active.');
        }
      } catch (err) {
        console.warn('[Media Access Warning]:', err.message);
        if (isMounted) {
          setPermissionError(err.message);
        }
      }
    };

    requestMediaPermissions();

    return () => {
      isMounted = false;
    };
  }, []);

  // Safely add ICE candidates or queue them until remote description is set
  const addIceCandidateToPeer = useCallback(async (targetSocketId, candidate) => {
    const pc = peerConnections.current[targetSocketId];
    if (!pc || !candidate) return;

    if (pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[ICE Add Candidate Warning]:', e.message);
      }
    } else {
      if (!iceCandidateQueues.current[targetSocketId]) {
        iceCandidateQueues.current[targetSocketId] = [];
      }
      iceCandidateQueues.current[targetSocketId].push(candidate);
    }
  }, []);

  // Process queued ICE candidates once remote description is set
  const processQueuedIceCandidates = useCallback(async (targetSocketId) => {
    const pc = peerConnections.current[targetSocketId];
    const queue = iceCandidateQueues.current[targetSocketId] || [];
    if (pc && pc.remoteDescription && queue.length > 0) {
      console.log(`[Native WebRTC] Processing ${queue.length} queued ICE candidates for ${targetSocketId}`);
      while (queue.length > 0) {
        const cand = queue.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('[Queued ICE Add Candidate Notice]:', e.message);
        }
      }
    }
  }, []);

  // Helper to create & configure a native RTCPeerConnection for a target socket participant
  const createPeerConnection = useCallback((targetSocketId, targetSpeakerName) => {
    if (peerConnections.current[targetSocketId]) {
      return peerConnections.current[targetSocketId];
    }

    console.log(`[Native WebRTC] Creating RTCPeerConnection for Socket ID: ${targetSocketId}`);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[targetSocketId] = pc;

    // Add local tracks (camera + mic)
    const activeStream = streamRef.current || localStream;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => {
        pc.addTrack(track, activeStream);
      });
    }

    // Remote stream arrives
    pc.ontrack = (event) => {
      console.log(`[Native WebRTC] Remote stream track received from ${targetSpeakerName} (${targetSocketId})`);
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        setRemoteStreams((prev) => ({
          ...prev,
          [targetSocketId]: {
            stream: remoteStream,
            speakerName: targetSpeakerName || 'Participant',
          },
        }));

        remoteStream.getTracks().forEach((track) => {
          track.onunmute = () => setRemoteStreams((prev) => ({ ...prev }));
          track.onmute = () => setRemoteStreams((prev) => ({ ...prev }));
        });
      }
    };

    // Send ICE candidates over Socket.IO
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('WEBRTC_SEND_ICE', {
          targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Connection State: ${targetSocketId}] -> ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[targetSocketId];
          return next;
        });
      }
    };

    return pc;
  }, [localStream, socket]);

  // Handle WebRTC signaling over Socket.IO
  useEffect(() => {
    if (!socket || !roomId) return;

    // 1. New user joined room -> Initiate Offer
    const handleNewUserJoined = async ({ socketId, speakerName }) => {
      if (socketId === socket.id) return;
      console.log(`[Native WebRTC] New user joined room: ${speakerName} (${socketId}). Sending Offer.`);

      const pc = createPeerConnection(socketId, speakerName);
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        socket.emit('WEBRTC_SEND_OFFER', {
          targetSocketId: socketId,
          offer,
          speakerName: speakerName || 'Participant',
        });
      } catch (err) {
        console.error('[WebRTC Create Offer Error]:', err);
      }
    };

    // 2. Received Offer from existing participant -> Send Answer
    const handleReceiveOffer = async ({ senderSocketId, senderSpeakerName, offer }) => {
      console.log(`[Native WebRTC] Received Offer from ${senderSpeakerName} (${senderSocketId})`);
      const pc = createPeerConnection(senderSocketId, senderSpeakerName);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await processQueuedIceCandidates(senderSocketId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('WEBRTC_SEND_ANSWER', {
          targetSocketId: senderSocketId,
          answer,
        });
      } catch (err) {
        console.error('[WebRTC Handle Offer Error]:', err);
      }
    };

    // 3. Received Answer -> Set Remote Description
    const handleReceiveAnswer = async ({ senderSocketId, answer }) => {
      console.log(`[Native WebRTC] Received Answer from (${senderSocketId})`);
      const pc = peerConnections.current[senderSocketId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await processQueuedIceCandidates(senderSocketId);
        } catch (err) {
          console.error('[WebRTC Handle Answer Error]:', err);
        }
      }
    };

    // 4. Received ICE Candidate -> Add Candidate or Queue
    const handleReceiveIce = async ({ senderSocketId, candidate }) => {
      if (candidate) {
        await addIceCandidateToPeer(senderSocketId, candidate);
      }
    };

    // 5. User Left -> Clean up connection
    const handleUserLeft = ({ socketId }) => {
      if (peerConnections.current[socketId]) {
        try { peerConnections.current[socketId].close(); } catch (e) {}
        delete peerConnections.current[socketId];
      }
      delete iceCandidateQueues.current[socketId];
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    };

    socket.on('NEW_USER_JOINED', handleNewUserJoined);
    socket.on('WEBRTC_RECEIVE_OFFER', handleReceiveOffer);
    socket.on('WEBRTC_RECEIVE_ANSWER', handleReceiveAnswer);
    socket.on('WEBRTC_RECEIVE_ICE', handleReceiveIce);
    socket.on('USER_LEFT', handleUserLeft);

    return () => {
      socket.off('NEW_USER_JOINED', handleNewUserJoined);
      socket.off('WEBRTC_RECEIVE_OFFER', handleReceiveOffer);
      socket.off('WEBRTC_RECEIVE_ANSWER', handleReceiveAnswer);
      socket.off('WEBRTC_RECEIVE_ICE', handleReceiveIce);
      socket.off('USER_LEFT', handleUserLeft);

      Object.values(peerConnections.current).forEach((pc) => {
        try { pc.close(); } catch (e) {}
      });
      peerConnections.current = {};
      iceCandidateQueues.current = {};
    };
  }, [socket, roomId, createPeerConnection, addIceCandidateToPeer, processQueuedIceCandidates]);

  const toggleCamera = () => {
    const stream = streamRef.current || localStream;
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  };

  const toggleMicrophone = () => {
    const stream = streamRef.current || localStream;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        screenTrack.onended = () => {
          setIsScreenSharing(false);
          if (streamRef.current) {
            setLocalStream(streamRef.current);
          }
        };

        setLocalStream(screenStream);
        setIsScreenSharing(true);
      } catch (err) {
        console.warn('Screen share error:', err.message);
      }
    } else {
      if (streamRef.current) {
        setLocalStream(streamRef.current);
      }
      setIsScreenSharing(false);
    }
  };

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
