import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';

export const useWebRTC = (roomId, speakerId, speakerName) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [peerId, setPeerId] = useState('');
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [permissionError, setPermissionError] = useState(null);

  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef({});

  // Request camera and microphone permissions IMMEDIATELY when the site opens
  useEffect(() => {
    let isMounted = true;

    const requestInitialMediaPermissions = async () => {
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

    requestInitialMediaPermissions();

    return () => {
      isMounted = false;
    };
  }, []);

  // Initiate an immediate WebRTC call to another participant in the room
  const connectToPeer = useCallback((targetSpeakerId, targetSpeakerName) => {
    if (!peerRef.current || !targetSpeakerId || targetSpeakerId === speakerId) return;
    if (peersRef.current[targetSpeakerId]) return; // Call already in progress or connected

    const activeStream = streamRef.current || localStream;
    if (!activeStream) return;

    console.log(`[WebRTC Calling Peer]: ${targetSpeakerId} (${targetSpeakerName})`);
    try {
      const call = peerRef.current.call(targetSpeakerId, activeStream, {
        metadata: { speakerName },
      });

      if (call) {
        peersRef.current[targetSpeakerId] = call;

        call.on('stream', (remoteStream) => {
          console.log(`[WebRTC Connected] Received remote stream from ${targetSpeakerName}`);
          setRemoteStreams((prev) => ({
            ...prev,
            [targetSpeakerId]: { stream: remoteStream, speakerName: targetSpeakerName || 'Participant' },
          }));
        });

        call.on('close', () => {
          delete peersRef.current[targetSpeakerId];
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[targetSpeakerId];
            return next;
          });
        });

        call.on('error', (err) => {
          console.warn('[WebRTC Peer Call Error]:', err);
          delete peersRef.current[targetSpeakerId];
        });
      }
    } catch (err) {
      console.warn('Error calling target peer:', err.message);
    }
  }, [speakerId, speakerName, localStream]);

  // Initialize PeerJS room connection with Google's fast public STUN iceServers
  useEffect(() => {
    if (!roomId) return;

    const initPeer = async () => {
      let activeStream = streamRef.current;
      if (!activeStream) {
        try {
          activeStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true,
          });
          streamRef.current = activeStream;
          setLocalStream(activeStream);
        } catch (e) {
          console.warn('Could not acquire media stream for peer call:', e.message);
        }
      }

      const peer = new Peer(speakerId || `usr_${Math.random().toString(36).substring(7)}`, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
          ],
        },
      });
      peerRef.current = peer;

      peer.on('open', (id) => {
        setPeerId(id);
        console.log('[PeerJS Initialized] My Peer ID:', id);
      });

      // Handle incoming WebRTC calls from other participants
      peer.on('call', (call) => {
        console.log('[WebRTC Incoming Call] Answering call from:', call.peer);
        if (activeStream) {
          call.answer(activeStream);
        }
        call.on('stream', (remoteStream) => {
          setRemoteStreams((prev) => ({
            ...prev,
            [call.peer]: { stream: remoteStream, speakerName: call.metadata?.speakerName || 'Participant' },
          }));
        });
        call.on('close', () => {
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[call.peer];
            return next;
          });
        });
      });
    };

    initPeer();

    return () => {
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      peersRef.current = {};
    };
  }, [roomId, speakerId]);

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
    peerId,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    permissionError,
    connectToPeer,
    toggleCamera,
    toggleMicrophone,
    toggleScreenShare,
  };
};
