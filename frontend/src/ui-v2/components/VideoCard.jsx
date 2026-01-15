import { Link } from 'react-router-dom';
import { getThumbnailUrl, getProxyImageUrl } from '../../api';

export default function VideoCard({ video, compact = false }) {
  const thumbnailUrl = video.thumbnail?.startsWith('http')
    ? getProxyImageUrl(video.thumbnail)
    : getThumbnailUrl(video.id);

  // Compact mode for sidebar/related videos
  if (compact) {
    return (
      <Link
        to={`/watch?v=${video.id}`}
        className="flex gap-2 group"
      >
        <div className="relative w-40 flex-shrink-0">
          <div className="aspect-video bg-freedom-surface rounded-lg overflow-hidden">
            <img
              src={thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          {video.duration && (
            <span className="absolute bottom-1 right-1 px-1 py-0.5 text-[11px] bg-black/80 text-white font-medium rounded">
              {video.duration}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 py-0.5">
          <h3 className="text-sm font-medium leading-tight line-clamp-2 text-white group-hover:text-freedom-muted transition-colors">
            {video.title}
          </h3>
          <p className="mt-1 text-xs text-freedom-muted">{video.channel}</p>
          <p className="text-xs text-freedom-muted">{video.views}</p>
        </div>
      </Link>
    );
  }

  // Grid mode for home/search
  return (
    <Link
      to={`/watch?v=${video.id}`}
      className="block group"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-freedom-surface rounded-xl overflow-hidden">
        <img
          src={thumbnailUrl}
          alt=""
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
        />
        {video.duration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs bg-black/80 text-white font-medium rounded">
            {video.duration}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="mt-3 flex gap-3">
        {/* Channel avatar placeholder */}
        <div className="w-9 h-9 rounded-full bg-freedom-surface flex-shrink-0 flex items-center justify-center">
          <span className="text-sm font-medium text-white">
            {video.channel?.charAt(0)?.toUpperCase() || '?'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium leading-tight line-clamp-2 text-white">
            {video.title}
          </h3>
          <p className="mt-1 text-[13px] text-freedom-muted hover:text-white transition-colors">
            {video.channel}
          </p>
          <div className="flex items-center gap-1 text-[13px] text-freedom-muted">
            <span>{video.views}</span>
            {video.uploaded && (
              <>
                <span>•</span>
                <span>{video.uploaded}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
