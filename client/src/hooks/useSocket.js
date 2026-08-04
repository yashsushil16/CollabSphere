import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * useSocket
 *
 * CRITICAL DESIGN DECISIONS:
 *
 * 1. Returns `socket` as a stable REF value exposed via a state wrapper ONLY on
 *    first successful connect — so child hooks don't receive null on first render.
 *
 * 2. Socket is created ONCE per roomId session. Reconnect is handled by Socket.IO
 *    internally — we never destroy and recreate the socket on re-renders.
 */
export const useSocket = (roomId, speakerId, speakerName) => {
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);       // Exposed stable socket object
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [transcripts, setTranscripts] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [factCheckFlags, setFactCheckFlags] = useState([]);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);

  useEffect(() => {
    if (!roomId) {
      // Clear everything when not in a room
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const SERVER_URL = import.meta.env.VITE_SERVER_URL || '/';
    const sock = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    socketRef.current = sock;

    sock.on('connect', () => {
      console.log('[Socket] Connected:', sock.id);
      setIsConnected(true);
      // Expose the connected socket instance to child hooks
      setSocket(sock);
      sock.emit('JOIN_ROOM', { roomId, speakerId, speakerName });
    });

    sock.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    sock.on('reconnect', () => {
      console.log('[Socket] Reconnected:', sock.id);
      setIsConnected(true);
      sock.emit('JOIN_ROOM', { roomId, speakerId, speakerName });
    });

    sock.on('PARTICIPANT_LIST_UPDATED', (list) => {
      setParticipants(list || []);
    });

    sock.on('TRANSCRIPT_CHUNK', (data) => {
      if (data?.payload) {
        setTranscripts((prev) => [...prev, data.payload]);
      }
    });

    sock.on('CHAT_MESSAGE_ADDED', (msg) => {
      if (msg) setChatMessages((prev) => [...prev, msg]);
    });

    sock.on('BOT_TYPING', ({ isTyping }) => {
      setIsBotTyping(Boolean(isTyping));
    });

    sock.on('FACT_CHECK_FLAG', (data) => {
      if (data?.payload) setFactCheckFlags((prev) => [data.payload, ...prev]);
    });

    sock.on('ROOM_ANALYTICS_READY', (data) => {
      if (data?.payload) setAnalyticsData(data.payload);
    });

    return () => {
      sock.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [roomId, speakerId, speakerName]);

  const sendChatMessage = (messageText) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('SEND_CHAT_MESSAGE', { roomId, messageText, speakerName });
    }
  };

  const endRoomSession = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('END_ROOM_SESSION', { roomId });
    }
  };

  return {
    socket,
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
