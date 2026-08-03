import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';

export const useWebRTC = (roomId, speakerId, speakerName) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [peerId, setPeerId] = useState('');
  const [isPeerOpen, setIsPeerOpen] = useState(false);
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

  // Initiate a WebRTC call to another participant in the room with auto-retry
  const connectToPeer = useCallback((targetSpeakerId, targetSpeakerName) => {
    if (!peerRef.current || !targetSpeakerId || targetSpeakerId === speakerId) return;

    // If call already active with live remote stream, skip duplicate call
    if (peersRef.current[targetSpeakerId] && remoteStreams[targetSpeakerId]?.stream) {
      return;
    }

    const activeStream = streamRef.current || localStream;
    if (!activeStream) return;

    // Ensure local video tracks are enabled before calling
    activeStream.getVideoTracks().forEach((track) => {
      track.enabled = true;
    });

    console.log(`[WebRTC Initiating Call to Peer]: ${targetSpeakerId} (${targetSpeakerName})`);
    try {
      // Close previous failed call if any
      if (peersRef.current[targetSpeakerId]) {
        try { peersRef.current[targetSpeakerId].close(); } catch (e) {}
        delete peersRef.current[targetSpeakerId];
      }

      const call = peerRef.current.call(targetSpeakerId, activeStream, {
        metadata: { speakerName },
      });

      if (call) {
        peersRef.current[targetSpeakerId] = call;

        const handleRemoteStream = (remoteStream) => {
          console.log(`[WebRTC Call Connected] Stream received from ${targetSpeakerName}`, remoteStream.getTracks());
          setRemoteStreams((prev) => ({
            ...prev,
            [targetSpeakerId]: { stream: remoteStream, speakerName: targetSpeakerName || 'Participant' },
          }));

          // Attach track event listeners for dynamic mute/unmute status updates
          remoteStream.getTracks().forEach((track) => {
            track.onunmute = () => {
              setRemoteStreams((prev) => ({ ...prev }));
            };
            track.onmute = () => {
              setRemoteStreams((prev) => ({ ...prev }));
            };
          });
        };

        call.on('stream', handleRemoteStream);

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
  }, [speakerId, speakerName, localStream, remoteStreams]);

  // Initialize PeerJS room connection with Google & Twilio public STUN iceServers
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
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });
      peerRef.current = peer;

      peer.on('open', (id) => {
        setPeerId(id);
        setIsPeerOpen(true);
        console.log('[PeerJS Initialized & Open] My Peer ID:', id);
      });

      // Handle incoming WebRTC calls from other participants
      peer.on('call', async (call) => {
        console.log('[WebRTC Incoming Call] Answering call from:', call.peer);
        let streamToAnswer = streamRef.current || activeStream;

        if (!streamToAnswer) {
          try {
            streamToAnswer = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: true,
            });
            streamRef.current = streamToAnswer;
            setLocalStream(streamToAnswer);
          } catch (e) {
            console.warn('Could not acquire media stream to answer call:', e.message);
          }
        }

        // Ensure video tracks are enabled
        if (streamToAnswer) {
          streamToAnswer.getVideoTracks().forEach((track) => {
            track.enabled = true;
          });
        }

        call.answer(streamToAnswer);

        call.on('stream', (remoteStream) => {
          console.log('[WebRTC Stream Received] Remote stream connected from:', call.peer, remoteStream.getTracks());
          setRemoteStreams((prev) => ({
            ...prev,
            [call.peer]: { stream: remoteStream, speakerName: call.metadata?.speakerName || 'Participant' },
          }));

          remoteStream.getTracks().forEach((track) => {
            track.onunmute = () => {
              setRemoteStreams((prev) => ({ ...prev }));
            };
            track.onmute = () => {
              setRemoteStreams((prev) => ({ ...prev }));
            };
          });
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
      setIsPeerOpen(false);
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
    isPeerOpen,
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
