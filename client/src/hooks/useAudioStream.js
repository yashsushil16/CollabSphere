import { useEffect, useRef, useState } from 'react';

/**
 * useAudioStream
 *
 * Handles three audio paths:
 *
 * 1. WebSpeech API — real-time STT → emits TRANSCRIPT_TEXT via socket
 * 2. Groq Whisper  — periodic full-file recording → emits AUDIO_STREAM_CHUNK
 * 3. PCM relay     — raw PCM Int16 every 32ms → emits PCM_RELAY_CHUNK
 *                    This is the GUARANTEED audio path. It uses the Socket.IO
 *                    connection (not WebRTC) so works on ANY network regardless
 *                    of NAT/firewall/TURN availability.
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

  useEffect(() => {
    if (!roomId || !socket) return;

    mountedRef.current = true;

    let micStream = null;
    let vadContext = null;
    let analyserNode = null;
    let animFrameId = null;
    let recognition = null;
    let whisperTimer = null;
    let relayContext = null;
    let relayProcessor = null;
    let relaySource = null;
    let speechFrames = 0;
    let lastSentText = '';

    const start = async () => {
      // ── 1. Get mic stream ───────────────────────────────────────────────────
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        console.log('[Audio] Mic acquired');
      } catch (err) {
        console.error('[Audio] Mic denied:', err.message);
        return;
      }
      if (!mountedRef.current) { micStream.getTracks().forEach((t) => t.stop()); return; }

      // ── 2. VAD meter AudioContext ────────────────────────────────────────────
      vadContext = new (window.AudioContext || window.webkitAudioContext)();
      if (vadContext.state === 'suspended') await vadContext.resume().catch(() => {});

      analyserNode = vadContext.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.4;
      vadContext.createMediaStreamSource(micStream).connect(analyserNode);
      const data = new Uint8Array(analyserNode.frequencyBinCount);

      const tick = () => {
        if (!mountedRef.current) return;
        analyserNode.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const level = Math.min(100, Math.round((avg / 255) * 100));
        setAudioLevel(level);
        if (isMicOnRef.current && level > 5) speechFrames++;
        animFrameId = requestAnimationFrame(tick);
      };
      tick();

      // ── 3. WebSpeech STT ─────────────────────────────────────────────────────
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        try {
          recognition = new SR();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

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
            if (e.error !== 'no-speech' && e.error !== 'audio-capture') console.warn('[Audio] SR error:', e.error);
          };
          recognition.onend = () => {
            if (!mountedRef.current) return;
            setTimeout(() => { if (!mountedRef.current) return; try { recognition.start(); } catch (_) {} }, 150);
          };
          recognition.start();
          console.log('[Audio] WebSpeech started');
        } catch (e) {
          console.warn('[Audio] WebSpeech unavailable:', e.message);
        }
      }

      // ── 4. Groq Whisper — fresh MediaRecorder per cycle ─────────────────────
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

      const runWhisperCycle = () => {
        if (!mountedRef.current) return;
        const sock = socketRef.current;
        const rid = roomIdRef.current;
        const frames = speechFrames;
        speechFrames = 0;
        if (!sock || !rid || !isMicOnRef.current || frames < 6) return;

        const chunks = [];
        let mr;
        try { mr = new MediaRecorder(micStream, { mimeType }); } catch (e) { return; }

        mr.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
        mr.onstop = async () => {
          const blob = new Blob(chunks, { type: mimeType });
          if (blob.size < 2000) return;
          const currentSock = socketRef.current;
          const currentRid = roomIdRef.current;
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
          } catch (e) { console.warn('[Audio] Whisper emit error:', e.message); }
        };
        try {
          mr.start();
          setTimeout(() => { if (mr && mr.state === 'recording') mr.stop(); }, 7000);
        } catch (e) { console.warn('[Audio] MR start error:', e.message); }
      };
      whisperTimer = setInterval(runWhisperCycle, 8000);

      // ── 5. PCM Audio Relay via Socket.IO ────────────────────────────────────
      //
      // GUARANTEED audio path — uses Socket.IO (not WebRTC), so works on any
      // network regardless of NAT/TURN. Captures raw PCM at 16kHz using
      // ScriptProcessorNode, converts Float32→Int16 (halves bandwidth), and
      // relays to all other room participants through the server.
      //
      // Bandwidth: 16000 samples/s * 2 bytes * (512/16000)s = 1KB per chunk
      //            = ~31 chunks/s = ~32KB/s = ~256kbps per sender
      //            Acceptable for a meeting server.

      const PCM_SAMPLE_RATE = 16000;
      const PCM_BUFFER_SIZE = 512; // ~32ms per chunk

      try {
        relayContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
        if (relayContext.state === 'suspended') await relayContext.resume().catch(() => {});

        relaySource = relayContext.createMediaStreamSource(micStream);
        // eslint-disable-next-line no-undef
        relayProcessor = relayContext.createScriptProcessor(PCM_BUFFER_SIZE, 1, 1);

        relayProcessor.onaudioprocess = (e) => {
          if (!mountedRef.current) return;
          const sock = socketRef.current;
          const rid = roomIdRef.current;
          if (!sock || !rid || !isMicOnRef.current) return;

          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32768)));
          }

          sock.emit('PCM_RELAY_CHUNK', {
            roomId: rid,
            pcm: int16.buffer, // ArrayBuffer
            speakerId: speakerIdRef.current,
          });
        };

        // Connect source → processor → silent gain → destination
        // (Chrome requires processor to be connected to destination to fire onaudioprocess)
        const silentGain = relayContext.createGain();
        silentGain.gain.value = 0; // Silent — prevent local echo
        relaySource.connect(relayProcessor);
        relayProcessor.connect(silentGain);
        silentGain.connect(relayContext.destination);

        console.log('[Audio] PCM relay started at', PCM_SAMPLE_RATE, 'Hz,', PCM_BUFFER_SIZE, 'samples/chunk');
      } catch (e) {
        console.warn('[Audio] PCM relay setup failed:', e.message);
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      if (recognition) { try { recognition.stop(); } catch (_) {} }
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (whisperTimer) clearInterval(whisperTimer);
      if (relayProcessor) { try { relayProcessor.disconnect(); } catch (_) {} }
      if (relaySource) { try { relaySource.disconnect(); } catch (_) {} }
      if (relayContext && relayContext.state !== 'closed') { relayContext.close().catch(() => {}); }
      if (analyserNode) { try { analyserNode.disconnect(); } catch (_) {} }
      if (vadContext && vadContext.state !== 'closed') { vadContext.close().catch(() => {}); }
      if (micStream) { micStream.getTracks().forEach((t) => t.stop()); console.log('[Audio] Mic released'); }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, socket]);

  return { audioLevel };
};
