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
    <div className="relative w-full bg-black aspect-video">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm z-10">
          {error}
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
