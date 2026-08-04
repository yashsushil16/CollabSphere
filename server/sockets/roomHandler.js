import { transcribeAudioChunk } from '../services/sttService.js';
import { addVectorRecord, searchVectorStore } from '../services/vectorService.js';
import { getCachedQuery, setCachedQuery } from '../services/cacheService.js';
import { auditStatement } from '../services/auditAgent.js';
import { generatePostSessionAnalytics } from '../services/summaryService.js';
import groqClient from '../config/groq.js';
import { geminiModel } from '../config/gemini.js';

// In-Memory active room states
// roomStateMap: roomId -> { participants: Map, transcriptLogs: [], pendingAuditLogs: [], speakerTalkTime: {}, domainDocs: [] }
const roomStateMap = new Map();

function getOrCreateRoom(roomId) {
  if (!roomStateMap.has(roomId)) {
    roomStateMap.set(roomId, {
      roomId,
      participants: new Map(),
      transcriptLogs: [],
      pendingAuditLogs: [],
      speakerTalkTime: {},
      auditTimer: null,
      createdAt: Date.now(),
    });
  }
  return roomStateMap.get(roomId);
}

/**
 * Process, deduplicate (8-sec window), and broadcast transcript lines
 */
async function processAndBroadcastTranscript(io, room, roomId, speakerId, speakerName, text, timestamp) {
  const normalizedText = (text || '').trim();
  if (normalizedText.length < 3) return;

  // Suppress duplicate transcript lines within 8 seconds for the same room
  const lastLog = room.transcriptLogs[room.transcriptLogs.length - 1];
  if (
    lastLog &&
    lastLog.text.toLowerCase().trim() === normalizedText.toLowerCase() &&
    Date.now() - lastLog.timestamp < 8000
  ) {
    console.log(`[Room ${roomId}] Suppressed duplicate transcript line: "${normalizedText}"`);
    return;
  }

  const chunkId = `chk_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const transcriptPayload = {
    chunkId,
    speakerId: speakerId || 'usr_unknown',
    speakerName: speakerName || 'Participant',
    timestamp: timestamp || Date.now(),
    text: normalizedText,
    isFinal: true,
  };

  room.transcriptLogs.push(transcriptPayload);
  room.pendingAuditLogs.push(transcriptPayload);

  await addVectorRecord(roomId, {
    id: chunkId,
    type: 'transcript',
    text: normalizedText,
    speakerName: transcriptPayload.speakerName,
    timestamp: transcriptPayload.timestamp,
  });

  io.to(roomId).emit('TRANSCRIPT_CHUNK', {
    event: 'TRANSCRIPT_CHUNK',
    roomId,
    payload: transcriptPayload,
  });
}

export function registerRoomHandlers(io, socket) {
  console.log(`[Socket Connected]: ${socket.id}`);

  // 1. JOIN ROOM
  socket.on('JOIN_ROOM', ({ roomId, speakerId, speakerName }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.speakerId = speakerId;
    socket.speakerName = speakerName;

    const room = getOrCreateRoom(roomId);
    const participantInfo = { socketId: socket.id, speakerId, speakerName, joinedAt: Date.now() };
    room.participants.set(socket.id, participantInfo);
    if (!room.speakerTalkTime[speakerName]) {
      room.speakerTalkTime[speakerName] = 0;
    }

    console.log(`[Room ${roomId}] Participant joined: ${speakerName} (Socket: ${socket.id}, Speaker: ${speakerId})`);

    // Notify room participants
    const participantsList = Array.from(room.participants.values());
    io.to(roomId).emit('PARTICIPANT_LIST_UPDATED', participantsList);

    // Notify existing participants of the new user to initiate WebRTC P2P mesh
    socket.to(roomId).emit('NEW_USER_JOINED', participantInfo);

    // Start 90-second Async Fact-Check Auditor loop if not already running.
    // 90s interval + max 2 items per batch keeps us well under Groq's free tier limits.
    if (!room.auditTimer) {
      room.auditTimer = setInterval(() => {
        runAsyncHallucinationAudit(io, roomId);
      }, 90000);
    }
  });

  // 1B. NATIVE WEBRTC SIGNALING RELAYS (Socket.IO P2P Handshake)
  socket.on('WEBRTC_SEND_OFFER', ({ targetSocketId, offer, speakerName }) => {
    console.log(`[WebRTC Relay] Offer from ${socket.id} -> ${targetSocketId}`);
    io.to(targetSocketId).emit('WEBRTC_RECEIVE_OFFER', {
      senderSocketId: socket.id,
      senderSpeakerId: socket.speakerId,
      senderSpeakerName: speakerName || socket.speakerName || 'Participant',
      offer,
    });
  });

  socket.on('WEBRTC_SEND_ANSWER', ({ targetSocketId, answer }) => {
    console.log(`[WebRTC Relay] Answer from ${socket.id} -> ${targetSocketId}`);
    io.to(targetSocketId).emit('WEBRTC_RECEIVE_ANSWER', {
      senderSocketId: socket.id,
      answer,
    });
  });

  socket.on('WEBRTC_SEND_ICE', ({ targetSocketId, candidate }) => {
    if (candidate) {
      io.to(targetSocketId).emit('WEBRTC_RECEIVE_ICE', {
        senderSocketId: socket.id,
        candidate,
      });
    }
  });

  // 1C. PCM AUDIO RELAY — Guaranteed audio path via Socket.IO (bypasses WebRTC/TURN)
  // Receives raw PCM Int16 audio from a speaker and relays to all other room participants.
  // This works on any network because it uses the existing Socket.IO connection.
  socket.on('PCM_RELAY_CHUNK', ({ roomId, pcm, speakerId }) => {
    if (!roomStateMap.has(roomId)) return;
    // Relay ONLY to others in the same room, not back to sender
    socket.to(roomId).emit('PCM_RELAY_CHUNK', { pcm, speakerId });
  });


  // 2A. DIRECT TEXT TRANSCRIPT FROM BROWSER WEBSPEECH API
  socket.on('TRANSCRIPT_TEXT', async (data) => {
    const { roomId, speakerId, speakerName, text, timestamp } = data;
    const room = getOrCreateRoom(roomId);
    await processAndBroadcastTranscript(io, room, roomId, speakerId, speakerName, text, timestamp);
  });

  // 2B. AUDIO STREAM CHUNK PROCESSING (Groq Whisper)
  socket.on('AUDIO_STREAM_CHUNK', async (data) => {
    const { roomId, speakerId, speakerName, audioBlob, timestamp } = data;
    const room = getOrCreateRoom(roomId);

    // Track speaker talk time
    room.speakerTalkTime[speakerName] = (room.speakerTalkTime[speakerName] || 0) + 3;

    try {
      const transcribedText = await transcribeAudioChunk(audioBlob, speakerName);
      if (transcribedText) {
        await processAndBroadcastTranscript(io, room, roomId, speakerId, speakerName, transcribedText, timestamp);
      }
    } catch (err) {
      console.error('[Audio Stream Processing Error]:', err);
    }
  });

  // 3. CHAT MESSAGE & AI BOT ASSISTANT INTERCEPTION
  socket.on('SEND_CHAT_MESSAGE', async ({ roomId, messageText, speakerName }) => {
    const room = getOrCreateRoom(roomId);
    const msgId = `msg_${Date.now()}`;
    const userMsg = {
      id: msgId,
      speakerName: speakerName || socket.speakerName || 'User',
      text: messageText,
      timestamp: Date.now(),
      isBot: false,
    };

    // Broadcast user chat message immediately
    io.to(roomId).emit('CHAT_MESSAGE_ADDED', userMsg);

    // Queue user text for fact checking audit
    room.pendingAuditLogs.push({
      speakerName: userMsg.speakerName,
      text: messageText,
      timestamp: userMsg.timestamp,
    });

    const lowerMsg = messageText.toLowerCase().trim();
    const isBotTrigger =
      lowerMsg.includes('@bot') ||
      lowerMsg.startsWith('bot') ||
      messageText.includes('?') ||
      /^(what|who|when|where|why|how|summarize|tell|explain|can|is|are|did|does|do|was|were)\b/i.test(lowerMsg);

    if (isBotTrigger) {
      const queryPrompt = messageText.replace(/@bot/gi, '').trim();

      // Emit typing indicator
      io.to(roomId).emit('BOT_TYPING', { isTyping: true });

      try {
        const cachedAnswer = await getCachedQuery(roomId, queryPrompt);
        if (cachedAnswer) {
          io.to(roomId).emit('BOT_TYPING', { isTyping: false });
          io.to(roomId).emit('CHAT_MESSAGE_ADDED', {
            id: `bot_${Date.now()}`,
            speakerName: 'CollabSphere AI Bot',
            text: cachedAnswer.text + ' *(Cached <10ms)*',
            timestamp: Date.now(),
            isBot: true,
            isCached: true,
          });
          return;
        }

        const recentTranscripts = (room.transcriptLogs || [])
          .slice(-15)
          .map((c) => `[${c.speakerName}]: "${c.text}"`)
          .join('\n');

        const topVectorChunks = await searchVectorStore(roomId, queryPrompt, 5);
        const vectorContextText = topVectorChunks
          .map((c) => `[${c.speakerName}]: "${c.text}"`)
          .join('\n');

        const fullContext = `--- RECENT MEETING TRANSCRIPTS (LAST FEW MINUTES) ---
${recentTranscripts || 'No live transcript records yet.'}

--- SEMANTIC KNOWLEDGE CONTEXT ---
${vectorContextText || 'None.'}`;

        let botReplyText = '';

        if (groqClient) {
          const completion = await groqClient.chat.completions.create({
            messages: [
              {
                role: 'system',
                content: `You are CollabSphere In-Session AI Assistant. Answer the meeting participant's question directly, clearly, and accurately based on the live meeting transcripts below. If asked about what a specific participant said, quote or summarize their recent statements. Keep response concise (2-4 sentences max).

${fullContext}`,
              },
              { role: 'user', content: queryPrompt },
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.2,
          });
          botReplyText = completion.choices[0].message.content;
        } else if (geminiModel) {
          const result = await geminiModel.generateContent(`Answer based on context:\n${fullContext}\n\nQuestion: ${queryPrompt}`);
          botReplyText = result.response.text();
        } else {
          const lastLog = room.transcriptLogs[room.transcriptLogs.length - 1];
          botReplyText = lastLog
            ? `Recent transcript from ${lastLog.speakerName}: "${lastLog.text}"`
            : `I checked the room transcripts for "${queryPrompt}". No speech recorded yet.`;
        }

        const botMsg = {
          id: `bot_${Date.now()}`,
          speakerName: 'CollabSphere AI Bot',
          text: botReplyText,
          timestamp: Date.now(),
          isBot: true,
        };

        await setCachedQuery(roomId, queryPrompt, botMsg, 300);

        io.to(roomId).emit('BOT_TYPING', { isTyping: false });
        io.to(roomId).emit('CHAT_MESSAGE_ADDED', botMsg);
      } catch (err) {
        console.error('[Bot Interception Error]:', err);
        io.to(roomId).emit('BOT_TYPING', { isTyping: false });
      }
    }
  });

  // 4. END ROOM SESSION & TRIGGER ANALYTICS
  socket.on('END_ROOM_SESSION', async ({ roomId }) => {
    const room = roomStateMap.get(roomId);
    if (!room) return;

    console.log(`[Room ${roomId}] End room session triggered.`);

    if (room.auditTimer) {
      clearInterval(room.auditTimer);
      room.auditTimer = null;
    }

    try {
      const analyticsReport = await generatePostSessionAnalytics(
        room.transcriptLogs,
        room.speakerTalkTime
      );

      io.to(roomId).emit('ROOM_ANALYTICS_READY', {
        event: 'ROOM_ANALYTICS_READY',
        roomId,
        payload: analyticsReport,
      });
    } catch (err) {
      console.error('[End Room Analytics Error]:', err);
    }
  });

  // 5. DISCONNECT
  socket.on('disconnect', () => {
    if (socket.roomId && roomStateMap.has(socket.roomId)) {
      const room = roomStateMap.get(socket.roomId);
      room.participants.delete(socket.id);
      io.to(socket.roomId).emit('PARTICIPANT_LIST_UPDATED', Array.from(room.participants.values()));
      io.to(socket.roomId).emit('USER_LEFT', { socketId: socket.id });

      if (room.participants.size === 0) {
        console.log(`[Room ${socket.roomId}] All participants left.`);
      }
    }
  });
}

/**
 * 15-second Periodic Async Hallucination Auditor Worker
 */
async function runAsyncHallucinationAudit(io, roomId) {
  const room = roomStateMap.get(roomId);
  if (!room || room.pendingAuditLogs.length === 0) return;

  // Process max 2 items per batch to stay within free-tier API rate limits
  const logsToAudit = room.pendingAuditLogs.splice(0, 2);

  for (const item of logsToAudit) {
    try {
      const auditResult = await auditStatement(item.text, item.speakerName, roomId);
      if (auditResult.isFlagged || auditResult.verdict === 'FALSE') {
        const flagPayload = {
          event: 'FACT_CHECK_FLAG',
          roomId,
          payload: {
            flagId: auditResult.flagId,
            speakerName: auditResult.speakerName,
            statement: auditResult.statement,
            verdict: auditResult.verdict,
            correction: auditResult.correction,
            confidence: auditResult.confidence,
            timestamp: auditResult.timestamp,
          },
        };

        console.log(`[Hallucination Audit Flagged] Room: ${roomId}, Speaker: ${auditResult.speakerName}`);
        io.to(roomId).emit('FACT_CHECK_FLAG', flagPayload);
      }
    } catch (err) {
      console.warn('[Async Audit Loop Error]:', err.message);
    }
  }
}
