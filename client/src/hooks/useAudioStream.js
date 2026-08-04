import { useEffect, useRef, useState } from 'react';

/**
 * useAudioStream
 *
 * KEY DESIGN DECISIONS:
 *
 * 1. Audio-only getUserMedia — separate from WebRTC camera stream so MediaRecorder
 *    never captures video frames into Whisper audio chunks.
 *
 * 2. SINGLE continuous MediaRecorder using timeslice — never calls stop()/start()
 *    in a loop. This eliminates the mic indicator clicking on/off mid-sentence
 *    that the user hears on mobile.
 *
 * 3. WebSpeech API with interimResults:true — keeps the recognition session alive
 *    longer. Only final results are emitted to the server.
 *
 * 4. All volatile props (socket, roomId, isMicOn) read via refs — the pipeline
 *    never restarts due to state changes. Only restarts on room join/leave.
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
    let mediaRecorder = null;
    let chunkBuffer = [];
    let chunkTimer = null;
    let speechFrames = 0;
    let lastSentText = '';

    const start = async () => {
      // ── 1. Get dedicated audio-only mic stream ──────────────────────────────
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        console.log('[Audio] Mic acquired for STT');
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
      const src = audioContext.createMediaStreamSource(micStream);
      src.connect(analyserNode);
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
          // interimResults:true keeps the session alive longer — the browser
          // is less likely to stop recognition mid-sentence on pauses
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          recognition.maxAlternatives = 1;

          recognition.onresult = (event) => {
            if (!mountedRef.current) return;
            const sock = socketRef.current;
            const rid = roomIdRef.current;
            if (!sock || !rid || !isMicOnRef.current) return;

            for (let i = event.resultIndex; i < event.results.length; i++) {
              // Only process final results — interim ones are for keeping session alive
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

          // onend fires when browser naturally ends the session (timeout, error)
          // Immediately restart to keep the pipeline seamless
          recognition.onend = () => {
            if (!mountedRef.current) return;
            // Small delay avoids a rapid-fire restart loop on some browsers
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
        console.warn('[Audio] WebSpeech API not supported in this browser');
      }

      // ── 4. Groq Whisper fallback ────────────────────────────────────────────
      // Use a SINGLE continuous MediaRecorder with timeslice chunking.
      // NEVER call stop() in a loop — that causes the mic-indicator click on mobile.
      // Instead, use timeslice so ondataavailable fires periodically while recording.

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      try {
        mediaRecorder = new MediaRecorder(micStream, { mimeType });

        // Collect audio chunks into buffer
        mediaRecorder.ondataavailable = (e) => {
          if (e.data?.size > 0) chunkBuffer.push(e.data);
        };

        // Start recording with 1-second timeslice — gets data every second,
        // but the recorder KEEPS RUNNING (no stop/start cycling)
        mediaRecorder.start(1000);
        console.log('[Audio] Continuous MediaRecorder started');
      } catch (e) {
        console.warn('[Audio] MediaRecorder failed to start:', e.message);
      }

      // Every 8 seconds, ship accumulated audio buffer to Whisper IF speech detected
      const SHIP_INTERVAL = 8000;
      const SPEECH_THRESHOLD = 8;

      chunkTimer = setInterval(async () => {
        if (!mountedRef.current) return;

        const sock = socketRef.current;
        const rid = roomIdRef.current;
        const frames = speechFrames;
        speechFrames = 0;

        if (!sock || !rid || !isMicOnRef.current) {
          chunkBuffer = [];
          return;
        }

        if (frames < SPEECH_THRESHOLD || chunkBuffer.length === 0) {
          console.log(`[Audio] Whisper skip — ${frames} speech frames, ${chunkBuffer.length} chunks`);
          chunkBuffer = [];
          return;
        }

        const snapshot = [...chunkBuffer];
        chunkBuffer = [];

        const blob = new Blob(snapshot, { type: mimeType });
        console.log(`[Audio] Shipping Whisper chunk: ${blob.size} bytes, ${frames} speech frames`);

        if (blob.size > 2000) {
          const buffer = await blob.arrayBuffer();
          sock.emit('AUDIO_STREAM_CHUNK', {
            roomId: rid,
            speakerId: speakerIdRef.current,
            speakerName: speakerNameRef.current,
            audioBlob: buffer,
            timestamp: Date.now(),
          });
        }
      }, SHIP_INTERVAL);
    };

    start();

    return () => {
      mountedRef.current = false;

      if (recognition) {
        try { recognition.stop(); } catch (_) {}
      }
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (chunkTimer) clearInterval(chunkTimer);

      // Stop the continuous recorder ONCE on cleanup — no repeated start/stop
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch (_) {}
      }

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
