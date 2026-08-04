import { useEffect, useRef, useState } from 'react';

export const useAudioStream = (socket, roomId, speakerId, speakerName, isMicOn = true) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const isComponentMounted = useRef(true);
  const speechSamplesCountRef = useRef(0);
  const recentSentTextRef = useRef('');

  useEffect(() => {
    isComponentMounted.current = true;
    let stream;
    let audioContext;
    let analyser;
    let recordInterval;
    let animationFrameId;
    let recognition;

    const startAudioProcessing = async () => {
      if (!isMicOn || !socket || !roomId) {
        setIsRecording(false);
        setAudioLevel(0);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // 1. Setup WebSpeech API (Native Browser Speech Recognition for instant 0-latency STT)
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          try {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = (event) => {
              if (!isMicOn || !isComponentMounted.current || !socket) return;
              for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                  const transcriptText = event.results[i][0].transcript.trim();
                  if (transcriptText.length >= 2 && transcriptText.toLowerCase() !== recentSentTextRef.current.toLowerCase()) {
                    recentSentTextRef.current = transcriptText;
                    speechSamplesCountRef.current += 5;

                    console.log('[WebSpeech STT Recognized]:', transcriptText);
                    socket.emit('TRANSCRIPT_TEXT', {
                      roomId,
                      speakerId,
                      speakerName,
                      text: transcriptText,
                      timestamp: Date.now(),
                    });
                  }
                }
              }
            };

            recognition.onerror = (err) => {
              console.warn('[WebSpeech API Warning]:', err.error);
            };

            recognition.onend = () => {
              if (isMicOn && isComponentMounted.current) {
                try { recognition.start(); } catch (e) {}
              }
            };

            recognition.start();
          } catch (e) {
            console.warn('[WebSpeech API Init Notice]:', e.message);
          }
        }

        // 2. Audio Context + Analyser for VAD & Volume Meter
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 64;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateAudioLevel = () => {
          if (!analyser || !isComponentMounted.current) return;
          analyser.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((acc, val) => acc + val, 0);
          const avg = sum / dataArray.length;
          const currentLevel = Math.min(100, Math.round((avg / 255) * 100));
          
          setAudioLevel(currentLevel);

          // Voice Activity Threshold (> 10 is speech energy)
          if (currentLevel > 10) {
            speechSamplesCountRef.current += 1;
          }

          animationFrameId = requestAnimationFrame(updateAudioLevel);
        };
        updateAudioLevel();

        // 3. Audio chunk recorder for Groq Whisper fallback
        const recordChunk = () => {
          if (!stream || !isMicOn || !isComponentMounted.current || !socket) return;

          // Send chunk if speech activity was detected in this 3-second window
          const speechDetectedInWindow = speechSamplesCountRef.current >= 2;
          speechSamplesCountRef.current = 0;

          if (!speechDetectedInWindow) {
            return;
          }

          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/mp4';

          const mediaRecorder = new MediaRecorder(stream, { mimeType });
          const chunks = [];

          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              chunks.push(e.data);
            }
          };

          mediaRecorder.onstop = async () => {
            if (chunks.length > 0 && socket && isComponentMounted.current) {
              const audioBlob = new Blob(chunks, { type: mimeType });
              if (audioBlob.size > 1500) {
                const buffer = await audioBlob.arrayBuffer();
                socket.emit('AUDIO_STREAM_CHUNK', {
                  roomId,
                  speakerId,
                  speakerName,
                  audioBlob: buffer,
                  timestamp: Date.now(),
                });
              }
            }
          };

          mediaRecorder.start();
          setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
          }, 3000);
        };

        recordInterval = setInterval(recordChunk, 3200);
        setIsRecording(true);
      } catch (err) {
        console.warn('Audio mic stream access error:', err.message);
        setIsRecording(false);
      }
    };

    if (socket && roomId) {
      startAudioProcessing();
    }

    return () => {
      isComponentMounted.current = false;
      if (recognition) {
        try { recognition.stop(); } catch (e) {}
      }
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (recordInterval) clearInterval(recordInterval);
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (audioContext) audioContext.close();
    };
  }, [socket, roomId, speakerId, speakerName, isMicOn]);

  return {
    isRecording,
    audioLevel,
  };
};
