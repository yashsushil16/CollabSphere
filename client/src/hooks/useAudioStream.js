import { useEffect, useRef, useState } from 'react';

/**
 * useAudioStream
 *
 * DESIGN:
 * - Acquires its own audio-only stream (separate from the WebRTC camera stream).
 *   This avoids MediaRecorder recording video frames into Whisper audio chunks.
 * - Starts ONLY when inside a room (roomId is set) to ensure socket + roomId
 *   are both available when WebSpeech results fire.
 * - isMicOn, socket, roomId, speakerId, speakerName are all read via stable refs
 *   so they can change without restarting the audio pipeline.
 * - AudioContext is resumed immediately after creation to fix Chrome's autoplay
 *   policy that leaves it in 'suspended' state.
 * - WebSpeech recognition restarts on 'onend' as long as component is mounted.
 */
export const useAudioStream = (socket, roomId, speakerId, speakerName, isMicOn) => {
  const [audioLevel, setAudioLevel] = useState(0);

  // Stable refs — updated on every render but don't cause pipeline restarts
  const socketRef = useRef(null);
  const roomIdRef = useRef(null);
  const speakerIdRef = useRef(speakerId);
  const speakerNameRef = useRef(speakerName);
  const isMicOnRef = useRef(isMicOn);
  const mountedRef = useRef(false);

  // Sync all changing props into refs
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { speakerIdRef.current = speakerId; }, [speakerId]);
  useEffect(() => { speakerNameRef.current = speakerName; }, [speakerName]);
  useEffect(() => { isMicOnRef.current = isMicOn; }, [isMicOn]);

  // ─── Audio pipeline — starts when user enters a room, stops when they leave ───
  useEffect(() => {
    // Only run when we have an active room AND an active socket connection
    if (!roomId || !socket) return;

    mountedRef.current = true;

    let micStream = null;
    let audioContext = null;
    let analyserNode = null;
    let animationFrameId = null;
    let recognition = null;
    let whisperInterval = null;
    let speechFrameCount = 0;
    let lastSentText = '';

    const start = async () => {
      // ── Step 1: Get audio-only mic stream ────────────────────────────────────
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
          },
          video: false,
        });
        console.log('[Audio] Mic stream acquired for STT');
      } catch (err) {
        console.error('[Audio] Could not get mic for STT:', err.message);
        return;
      }

      if (!mountedRef.current) {
        micStream.getTracks().forEach((t) => t.stop());
        return;
      }

      // ── Step 2: AudioContext + Analyser for VAD meter ────────────────────────
      audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Chrome starts AudioContext in 'suspended' — must resume manually
      if (audioContext.state === 'suspended') {
        try { await audioContext.resume(); } catch (_) {}
      }

      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.3;

      const source = audioContext.createMediaStreamSource(micStream);
      source.connect(analyserNode);

      const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

      const tick = () => {
        if (!mountedRef.current) return;
        analyserNode.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
        const level = Math.min(100, Math.round((avg / 255) * 100));
        setAudioLevel(level);

        // Count frames with audible speech energy (threshold > 5 to be sensitive)
        if (isMicOnRef.current && level > 5) {
          speechFrameCount++;
        }

        animationFrameId = requestAnimationFrame(tick);
      };

      // Resume AudioContext on first tick in case it's still suspended
      audioContext.resume().then(() => tick()).catch(() => tick());

      // ── Step 3: WebSpeech API — instant low-latency STT ──────────────────────
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = false;
          recognition.lang = 'en-US';
          recognition.maxAlternatives = 1;

          recognition.onresult = (event) => {
            if (!mountedRef.current) return;
            // Read latest values from refs — these are always current
            const currentSocket = socketRef.current;
            const currentRoomId = roomIdRef.current;
            const currentMicOn = isMicOnRef.current;

            if (!currentMicOn || !currentSocket || !currentRoomId) {
              console.log('[Audio] WebSpeech result skipped — mic off or not in room');
              return;
            }

            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                const text = event.results[i][0].transcript.trim();
                if (text.length >= 3 && text.toLowerCase() !== lastSentText.toLowerCase()) {
                  lastSentText = text;
                  console.log('[STT WebSpeech]:', text);
                  currentSocket.emit('TRANSCRIPT_TEXT', {
                    roomId: currentRoomId,
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

          // Always restart recognition — it naturally times out after ~60s on some browsers
          recognition.onend = () => {
            if (!mountedRef.current) return;
            try { recognition.start(); } catch (_) {}
          };

          recognition.start();
          console.log('[Audio] WebSpeech recognition started');
        } catch (e) {
          console.warn('[Audio] WebSpeech init failed:', e.message);
        }
      } else {
        console.warn('[Audio] WebSpeech API not available in this browser');
      }

      // ── Step 4: Groq Whisper fallback — 5s audio chunks sent when speech detected ─
      const INTERVAL = 5000;
      const DURATION = 4500;
      const SPEECH_THRESHOLD = 5; // Require at least 5 frames of audio activity

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      whisperInterval = setInterval(() => {
        if (!mountedRef.current) return;

        const currentSocket = socketRef.current;
        const currentRoomId = roomIdRef.current;
        const currentMicOn = isMicOnRef.current;
        const frames = speechFrameCount;
        speechFrameCount = 0;

        // Skip if not in room, mic off, or no speech detected
        if (!currentSocket || !currentRoomId || !currentMicOn) return;
        if (frames < SPEECH_THRESHOLD) {
          console.log(`[Audio] Whisper chunk skipped — only ${frames} speech frames (need ${SPEECH_THRESHOLD})`);
          return;
        }

        console.log(`[Audio] Recording Whisper chunk (${frames} speech frames detected)`);

        let mr;
        try {
          mr = new MediaRecorder(micStream, { mimeType });
        } catch (e) {
          console.warn('[Audio] MediaRecorder create error:', e.message);
          return;
        }

        const chunks = [];
        mr.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
        mr.onstop = async () => {
          if (!mountedRef.current) return;
          const blob = new Blob(chunks, { type: mimeType });
          console.log(`[Audio] Whisper chunk size: ${blob.size} bytes`);
          if (blob.size > 2000 && socketRef.current && roomIdRef.current) {
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

        try {
          mr.start();
          setTimeout(() => {
            if (mr.state === 'recording') mr.stop();
          }, DURATION);
        } catch (e) {
          console.warn('[Audio] MediaRecorder start error:', e.message);
        }
      }, INTERVAL);
    };

    start();

    return () => {
      mountedRef.current = false;
      if (recognition) {
        try { recognition.stop(); } catch (_) {}
      }
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (whisperInterval) clearInterval(whisperInterval);
      if (analyserNode) { try { analyserNode.disconnect(); } catch (_) {} }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
        console.log('[Audio] Mic stream released on room exit');
      }
    };

    // Re-run ONLY when the user actually joins/leaves a room or socket changes.
    // isMicOn / speakerName / speakerId changes are handled via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, socket]);

  return { audioLevel };
};
