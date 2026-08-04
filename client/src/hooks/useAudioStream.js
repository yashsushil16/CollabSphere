import { useEffect, useRef, useState } from 'react';

/**
 * useAudioStream
 *
 * CRITICAL DESIGN DECISIONS (fixes for all bugs):
 *
 * 1. The mic stream is acquired from the SHARED localStream passed in from useWebRTC.
 *    We do NOT call getUserMedia() here again — that was causing the mic click sound
 *    on mobile (double mic acquisition + release cycles).
 *
 * 2. `isMicOn` is NOT in the useEffect dependency array. Instead, it is read via a
 *    ref inside the effect. This prevents the entire audio pipeline from tearing down
 *    and restarting every time the user toggles the mic.
 *
 * 3. WebSpeech is started ONCE and kept alive. It restarts on 'onend' only if
 *    the component is still mounted and joined to a room.
 *
 * 4. Audio chunks are only emitted when voice activity is detected (VAD gate).
 *    This prevents silence audio from being sent to the STT server.
 *
 * 5. The socket and roomId are read via refs inside the effect — so socket
 *    changes (e.g., reconnects) do NOT cause the audio pipeline to restart.
 */
export const useAudioStream = (socket, roomId, speakerId, speakerName, isMicOn, localStream) => {
  const [audioLevel, setAudioLevel] = useState(0);

  // Stable refs — prevent effect re-runs on value changes
  const socketRef = useRef(socket);
  const roomIdRef = useRef(roomId);
  const speakerIdRef = useRef(speakerId);
  const speakerNameRef = useRef(speakerName);
  const isMicOnRef = useRef(isMicOn);
  const mountedRef = useRef(true);

  // Keep refs in sync with latest props without triggering re-runs
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { speakerIdRef.current = speakerId; }, [speakerId]);
  useEffect(() => { speakerNameRef.current = speakerName; }, [speakerName]);
  useEffect(() => { isMicOnRef.current = isMicOn; }, [isMicOn]);

  // ─── Main audio pipeline — runs ONCE when localStream is available ─────────
  useEffect(() => {
    mountedRef.current = true;

    if (!localStream) return;

    let audioContext;
    let analyserNode;
    let animationFrameId;
    let recognition;
    let recordInterval;
    let speechWindowCount = 0;
    const recentTextRef = { current: '' };

    const init = async () => {
      try {
        // ── 1. Audio level meter (VAD) ────────────────────────────────────────
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 128;

        const source = audioContext.createMediaStreamSource(localStream);
        source.connect(analyserNode);

        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

        const tick = () => {
          if (!mountedRef.current) return;
          analyserNode.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
          const level = Math.min(100, Math.round((avg / 255) * 100));
          setAudioLevel(level);

          // Voice activity detection — count frames where mic is live and loud enough
          if (isMicOnRef.current && level > 8) {
            speechWindowCount++;
          }

          animationFrameId = requestAnimationFrame(tick);
        };
        tick();

        // ── 2. WebSpeech API — primary STT (0-latency, no silence hallucinations) ──
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = false;
          recognition.lang = 'en-US';
          recognition.maxAlternatives = 1;

          recognition.onresult = (event) => {
            // Only emit if mic is on and we're in a room
            if (!isMicOnRef.current || !socketRef.current || !roomIdRef.current) return;
            if (!mountedRef.current) return;

            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                const text = event.results[i][0].transcript.trim();
                if (text.length >= 3 && text.toLowerCase() !== recentTextRef.current.toLowerCase()) {
                  recentTextRef.current = text;
                  console.log('[STT WebSpeech]:', text);
                  socketRef.current.emit('TRANSCRIPT_TEXT', {
                    roomId: roomIdRef.current,
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
            // 'no-speech' and 'audio-capture' are non-fatal
            if (e.error !== 'no-speech' && e.error !== 'audio-capture') {
              console.warn('[STT WebSpeech error]:', e.error);
            }
          };

          recognition.onend = () => {
            // Auto-restart only if still mounted and in a room
            if (mountedRef.current && roomIdRef.current) {
              try { recognition.start(); } catch (_) {}
            }
          };

          try {
            recognition.start();
          } catch (e) {
            console.warn('[STT WebSpeech start error]:', e.message);
          }
        }

        // ── 3. Groq Whisper fallback (fires every 5 seconds only when speech detected) ──
        const CHUNK_INTERVAL_MS = 5000;
        const CHUNK_DURATION_MS = 4500;
        const MIN_SPEECH_FRAMES = 10; // ~10 frames of voice activity needed

        recordInterval = setInterval(() => {
          if (!mountedRef.current || !isMicOnRef.current) return;
          if (!socketRef.current || !roomIdRef.current) return;
          if (speechWindowCount < MIN_SPEECH_FRAMES) {
            speechWindowCount = 0;
            return;
          }
          speechWindowCount = 0;

          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/mp4';

          let mr;
          try {
            mr = new MediaRecorder(localStream, { mimeType });
          } catch (e) {
            console.warn('[STT Whisper] MediaRecorder init error:', e.message);
            return;
          }

          const chunks = [];
          mr.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
          mr.onstop = async () => {
            if (!mountedRef.current || !socketRef.current || !roomIdRef.current) return;
            const blob = new Blob(chunks, { type: mimeType });
            if (blob.size > 3000) {
              const buffer = await blob.arrayBuffer();
              socketRef.current.emit('AUDIO_STREAM_CHUNK', {
                roomId: roomIdRef.current,
                speakerId: speakerIdRef.current,
                speakerName: speakerNameRef.current,
                audioBlob: buffer,
                timestamp: Date.now(),
              });
            }
          };

          mr.start();
          setTimeout(() => {
            if (mr.state === 'recording') mr.stop();
          }, CHUNK_DURATION_MS);
        }, CHUNK_INTERVAL_MS);

      } catch (err) {
        console.error('[useAudioStream] init error:', err.message);
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      if (recognition) {
        try { recognition.stop(); } catch (_) {}
      }
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (recordInterval) clearInterval(recordInterval);
      if (analyserNode) {
        try { analyserNode.disconnect(); } catch (_) {}
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
    };
    // INTENTIONALLY only depends on localStream — everything else is read via refs.
    // This is the key fix for mic clicking: the pipeline starts ONCE when localStream
    // is available and NEVER restarts due to socket/roomId/isMicOn changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream]);

  return { audioLevel };
};
