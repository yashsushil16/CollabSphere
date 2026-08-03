import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export const useSocket = (roomId, speakerId, speakerName) => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [transcripts, setTranscripts] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [factCheckFlags, setFactCheckFlags] = useState([]);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);

  useEffect(() => {
    if (!roomId) return;

    // Connect to Socket.IO backend server URL (VITE_SERVER_URL in production or relative '/' in dev proxy)
    const SERVER_URL = import.meta.env.VITE_SERVER_URL || '/';
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket Connected] ID:', socket.id);
      setIsConnected(true);

      // Join room with participant identity
      socket.emit('JOIN_ROOM', { roomId, speakerId, speakerName });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('PARTICIPANT_LIST_UPDATED', (list) => {
      setParticipants(list);
    });

    socket.on('TRANSCRIPT_CHUNK', (data) => {
      if (data && data.payload) {
        setTranscripts((prev) => [...prev, data.payload]);
      }
    });

    socket.on('CHAT_MESSAGE_ADDED', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    socket.on('BOT_TYPING', ({ isTyping }) => {
      setIsBotTyping(isTyping);
    });

    socket.on('FACT_CHECK_FLAG', (data) => {
      if (data && data.payload) {
        setFactCheckFlags((prev) => [data.payload, ...prev]);
      }
    });

    socket.on('ROOM_ANALYTICS_READY', (data) => {
      if (data && data.payload) {
        setAnalyticsData(data.payload);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, speakerId, speakerName]);

  const sendChatMessage = (messageText) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('SEND_CHAT_MESSAGE', {
        roomId,
        messageText,
        speakerName,
      });
    }
  };

  const endRoomSession = () => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('END_ROOM_SESSION', { roomId });
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    participants,
    transcripts,
    chatMessages,
    factCheckFlags,
    isBotTyping,
    analyticsData,
    sendChatMessage,
    endRoomSession,
  };
};
