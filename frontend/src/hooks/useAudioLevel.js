import { useState, useEffect, useRef } from 'react';

/**
 * useAudioLevel — monitors the volume level of a MediaStream
 * Returns a number 0–1 representing the current audio intensity.
 * Used to show "speaking" indicators like Google Meet's blue ring.
 */
const useAudioLevel = (stream, enabled = true) => {
  const [level, setLevel] = useState(0);
  const contextRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!stream || !enabled) {
      setLevel(0);
      return;
    }

    // Check if stream has audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setLevel(0);
      return;
    }

    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      contextRef.current = ctx;
    } catch (e) {
      console.warn('[AudioLevel] Could not create AudioContext:', e);
      return;
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    analyserRef.current = analyser;

    let source;
    try {
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch (e) {
      console.warn('[AudioLevel] Could not connect stream to analyser:', e);
      return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);
      // Calculate RMS (root mean square) for a smooth average
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      // Normalize to 0–1 range (255 max byte value)
      const normalized = Math.min(rms / 100, 1);
      setLevel(normalized);
      rafRef.current = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { source.disconnect(); } catch (_) {}
      try { ctx.close(); } catch (_) {}
      setLevel(0);
    };
  }, [stream, enabled]);

  return level;
};

export default useAudioLevel;
