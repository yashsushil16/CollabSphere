import { useEffect, useRef, useState } from 'react';
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

  // Initialize PeerJS room connection once joinedRoom / roomId is active
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
      });
      peerRef.current = peer;

      peer.on('open', (id) => {
        setPeerId(id);
        console.log('[PeerJS Initialized] Peer ID:', id);
      });

      peer.on('call', (call) => {
        if (activeStream) {
          call.answer(activeStream);
        }
        call.on('stream', (remoteStream) => {
          setRemoteStreams((prev) => ({
            ...prev,
            [call.peer]: { stream: remoteStream, speakerName: call.metadata?.speakerName || 'Participant' },
          }));
        });
      });
    };

    initPeer();

    return () => {
      if (peerRef.current) peerRef.current.destroy();
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
    toggleCamera,
    toggleMicrophone,
    toggleScreenShare,
  };
};
