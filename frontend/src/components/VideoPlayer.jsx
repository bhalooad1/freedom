import { useEffect, useRef, useState } from 'react';
import { getStreamUrl } from '../api';

export default function VideoPlayer({ videoId }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const retryCountRef = useRef(0);
  const maxRetries = 4;

  useEffect(() => {
    if (!videoRef.current || !videoId) return;

    setError(null);
    setLoading(true);
    retryCountRef.current = 0;

    const video = videoRef.current;

    // Warm up the server first, then load video
    const streamUrl = getStreamUrl(videoId);
    console.log('[VideoPlayer] Warming up server...');

    fetch(streamUrl, { method: 'HEAD' })
      .catch(() => {}) // Ignore errors, just warming up
      .finally(() => {
        console.log('[VideoPlayer] Loading video...');
        video.src = streamUrl;
      });

    const onCanPlay = () => setLoading(false);
    const onError = () => {
      // Retry with increasing delays for cold starts
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        const delay = retryCountRef.current * 1500; // 1.5s, 3s, 4.5s, 6s
        console.log(`[VideoPlayer] Retry ${retryCountRef.current}/${maxRetries} in ${delay}ms...`);
        setTimeout(() => {
          video.src = getStreamUrl(videoId) + '?retry=' + Date.now();
        }, delay);
      } else {
        setLoading(false);
        setError('Failed to load video. Please refresh the page.');
      }
    };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
    };
  }, [videoId]);

  return (
    <div className="relative w-full bg-black aspect-video border border-freedom-border">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black">
          <div className="w-10 h-10 border-2 border-freedom-red border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/80">
          <svg className="w-12 h-12 text-freedom-red mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-white text-sm">{error}</p>
        </div>
      )}
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        className="w-full h-full"
      />
    </div>
  );
}
