import { useEffect, useRef, useState } from 'react';

/**
 * useAudioStream
 *
 * KEY DESIGN DECISIONS:
 *
 * 1. Audio-only getUserMedia — separate from WebRTC camera stream so MediaRecorder
 *    never captures video frames.
 *
 * 2. Per-cycle fresh MediaRecorder — NEVER use a long-running MediaRecorder with
 *    timeslice for Whisper. Each timeslice chunk after the first is a headerless
 *    WebM fragment; Groq rejects them with 400 "invalid media file". Instead, a
 *    new MediaRecorder is created each cycle: it gets its own WebM header and
 *    produces a complete valid file. The MIC STREAM is never stopped → no clicking.
 *
 * 3. WebSpeech interimResults:true — keeps the session alive during speech pauses.
 *    Only final results are emitted to the server.
 *
 * 4. All volatile props read via refs — pipeline never restarts due to state changes.
 *    Only restarts on room join/leave.
 */
export const useAudioStream = (socket, roomId, speakerId, speakerName, isMicOn) => {
  const [audioLevel, setAudioLevel] = useState(0);

  const socketRef = useRef(null);
  const roomIdRef = useRef(null);
  const speakerIdRef = useRef(speakerId);
  const speakerNameRef = useRef(speakerName);
  const isMicOnRef = useRef(isMicOn);
  const mountedRef = useRef(false);

  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { speakerIdRef.current = speakerId; }, [speakerId]);
  useEffect(() => { speakerNameRef.current = speakerName; }, [speakerName]);
  useEffect(() => { isMicOnRef.current = isMicOn; }, [isMicOn]);

  // ─── Pipeline: starts when joining a room, cleans up on leave ─────────────
  useEffect(() => {
    if (!roomId || !socket) return;

    mountedRef.current = true;

    let micStream = null;
    let audioContext = null;
    let analyserNode = null;
    let animFrameId = null;
    let recognition = null;
    let whisperTimer = null;
    let speechFrames = 0;
    let lastSentText = '';

    const start = async () => {
      // ── 1. Dedicated audio-only mic stream ─────────────────────────────────
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        console.log('[Audio] Mic acquired');
      } catch (err) {
        console.error('[Audio] Mic access denied:', err.message);
        return;
      }

      if (!mountedRef.current) {
        micStream.getTracks().forEach((t) => t.stop());
        return;
      }

      // ── 2. AudioContext VAD meter ───────────────────────────────────────────
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') {
        await audioContext.resume().catch(() => {});
      }

      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.4;
      audioContext.createMediaStreamSource(micStream).connect(analyserNode);
      const data = new Uint8Array(analyserNode.frequencyBinCount);

      const tick = () => {
        if (!mountedRef.current) return;
        if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
        analyserNode.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const level = Math.min(100, Math.round((avg / 255) * 100));
        setAudioLevel(level);
        if (isMicOnRef.current && level > 5) speechFrames++;
        animFrameId = requestAnimationFrame(tick);
      };
      tick();

      // ── 3. WebSpeech — primary real-time STT ───────────────────────────────
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        try {
          recognition = new SR();
          recognition.continuous = true;
          recognition.interimResults = true; // keeps session alive during pauses
          recognition.lang = 'en-US';
          recognition.maxAlternatives = 1;

          recognition.onresult = (event) => {
            if (!mountedRef.current) return;
            const sock = socketRef.current;
            const rid = roomIdRef.current;
            if (!sock || !rid || !isMicOnRef.current) return;

            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                const text = event.results[i][0].transcript.trim();
                if (text.length >= 3 && text.toLowerCase() !== lastSentText.toLowerCase()) {
                  lastSentText = text;
                  console.log('[STT WebSpeech]:', text);
                  sock.emit('TRANSCRIPT_TEXT', {
                    roomId: rid,
                    speakerId: speakerIdRef.current,
                    speakerName: speakerNameRef.current,
                    text,
                    timestamp: Date.now(),
                  });
                }
              }
            }
          };

          recognition.onerror = (e) => {
            if (e.error !== 'no-speech' && e.error !== 'audio-capture') {
              console.warn('[Audio] WebSpeech error:', e.error);
            }
          };

          recognition.onend = () => {
            if (!mountedRef.current) return;
            setTimeout(() => {
              if (!mountedRef.current) return;
              try { recognition.start(); } catch (_) {}
            }, 150);
          };

          recognition.start();
          console.log('[Audio] WebSpeech started');
        } catch (e) {
          console.warn('[Audio] WebSpeech unavailable:', e.message);
        }
      } else {
        console.warn('[Audio] WebSpeech not supported in this browser');
      }

      // ── 4. Groq Whisper fallback — fresh MediaRecorder per cycle ───────────
      //
      // WHY fresh per cycle:
      // A long-running timeslice MediaRecorder produces headerless WebM fragments
      // after the first chunk. Groq rejects these with 400 "invalid media file".
      // A fresh MediaRecorder starts with a complete WebM header every time.
      //
      // WHY no mic clicking:
      // We never stop the MIC STREAM — only the recorder object stops.
      // The browser mic indicator stays on the whole session.

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      console.log('[Audio] Whisper mimeType:', mimeType);

      const RECORD_DURATION = 7000; // record 7s per chunk
      const CYCLE_INTERVAL  = 8000; // check every 8s
      const SPEECH_THRESHOLD = 6;   // min VAD frames needed

      const runWhisperCycle = () => {
        if (!mountedRef.current) return;

        const sock = socketRef.current;
        const rid  = roomIdRef.current;
        const frames = speechFrames;
        speechFrames = 0;

        if (!sock || !rid || !isMicOnRef.current) return;
        if (frames < SPEECH_THRESHOLD) {
          console.log(`[Audio] Whisper skip — ${frames} speech frames (need ${SPEECH_THRESHOLD})`);
          return;
        }

        console.log(`[Audio] Starting Whisper recording (${frames} speech frames)`);

        // Fresh recorder → fresh WebM header → valid complete file for Groq
        let mr;
        const chunks = [];

        try {
          mr = new MediaRecorder(micStream, { mimeType });
        } catch (e) {
          console.warn('[Audio] MediaRecorder create failed:', e.message);
          return;
        }

        mr.ondataavailable = (e) => {
          if (e.data?.size > 0) chunks.push(e.data);
        };

        mr.onstop = async () => {
          const blob = new Blob(chunks, { type: mimeType });
          console.log(`[Audio] Whisper blob ready: ${blob.size} bytes`);
          if (blob.size < 2000) return;

          const currentSock = socketRef.current;
          const currentRid  = roomIdRef.current;
          if (!currentSock || !currentRid) return;

          try {
            const buffer = await blob.arrayBuffer();
            currentSock.emit('AUDIO_STREAM_CHUNK', {
              roomId: currentRid,
              speakerId: speakerIdRef.current,
              speakerName: speakerNameRef.current,
              audioBlob: buffer,
              timestamp: Date.now(),
            });
            console.log('[Audio] Whisper chunk emitted');
          } catch (e) {
            console.warn('[Audio] Emit error:', e.message);
          }
        };

        try {
          mr.start();
          setTimeout(() => {
            if (mr && mr.state === 'recording') mr.stop();
          }, RECORD_DURATION);
        } catch (e) {
          console.warn('[Audio] MediaRecorder start failed:', e.message);
        }
      };

      whisperTimer = setInterval(runWhisperCycle, CYCLE_INTERVAL);
    };

    start();

    return () => {
      mountedRef.current = false;
      if (recognition) { try { recognition.stop(); } catch (_) {} }
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (whisperTimer) clearInterval(whisperTimer);
      if (analyserNode) { try { analyserNode.disconnect(); } catch (_) {} }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
        console.log('[Audio] Mic stream released');
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, socket]);

  return { audioLevel };
};
