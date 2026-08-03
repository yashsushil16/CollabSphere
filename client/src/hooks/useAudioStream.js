import { useEffect, useRef, useState } from 'react';

export const useAudioStream = (socket, roomId, speakerId, speakerName, isMicOn = true) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const isComponentMounted = useRef(true);
  const speechSamplesCountRef = useRef(0);

  useEffect(() => {
    isComponentMounted.current = true;
    let stream;
    let audioContext;
    let analyser;
    let recordInterval;
    let animationFrameId;

    const startAudioProcessing = async () => {
      if (!isMicOn || !socket || !roomId) {
        setIsRecording(false);
        setAudioLevel(0);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Audio Context + Analyser for VAD (Voice Activity Detection)
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

          // Higher Voice Activity Threshold (> 20 is human speech; background tapping/ambient is < 15)
          if (currentLevel > 20) {
            speechSamplesCountRef.current += 1;
          }

          animationFrameId = requestAnimationFrame(updateAudioLevel);
        };
        updateAudioLevel();

        const recordChunk = () => {
          if (!stream || !isMicOn || !isComponentMounted.current) return;

          // Check speech energy sample count during this interval (at least 4 speech frames)
          const speechDetectedInWindow = speechSamplesCountRef.current >= 4;
          // Reset speech samples counter for next window
          speechSamplesCountRef.current = 0;

          // If no speech was detected in this 3-second window, skip recording & sending silently!
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
              // Only send if buffer contains non-trivial audio size (> 2500 bytes)
              if (audioBlob.size > 2500) {
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
