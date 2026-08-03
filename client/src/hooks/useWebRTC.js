import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
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
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('WEBRTC_SEND_OFFER', {
          targetSocketId: socketId,
          offer,
          speakerName,
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
        } catch (err) {
          console.error('[WebRTC Handle Answer Error]:', err);
        }
      }
    };

    // 4. Received ICE Candidate -> Add Candidate
    const handleReceiveIce = async ({ senderSocketId, candidate }) => {
      const pc = peerConnections.current[senderSocketId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC Add ICE Candidate Error]:', err);
        }
      }
    };

    // 5. User Left -> Clean up connection
    const handleUserLeft = ({ socketId }) => {
      if (peerConnections.current[socketId]) {
        try { peerConnections.current[socketId].close(); } catch (e) {}
        delete peerConnections.current[socketId];
      }
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
    };
  }, [socket, roomId, createPeerConnection]);

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
