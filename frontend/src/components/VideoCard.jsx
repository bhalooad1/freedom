import { Link } from 'react-router-dom';
import { getThumbnailUrl, getProxyImageUrl } from '../api';

export default function VideoCard({ video, compact = false }) {
  const thumbnailUrl = video.thumbnail?.startsWith('http')
    ? getProxyImageUrl(video.thumbnail)
    : getThumbnailUrl(video.id);

  if (compact) {
    return (
      <Link
        to={`/watch?v=${video.id}`}
        className="flex gap-3 group"
      >
        <div className="relative w-40 flex-shrink-0">
          <div className="aspect-video bg-freedom-surface">
            <img
              src={thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          {video.duration && (
            <span className="absolute bottom-1 right-1 px-1 text-xs bg-freedom-red text-white font-medium">
              {video.duration}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium leading-tight line-clamp-2 group-hover:underline text-white">
            {video.title}
          </h3>
          <p className="mt-1 text-xs text-freedom-muted">{video.channel}</p>
          <p className="text-xs text-freedom-muted">{video.views}</p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/watch?v=${video.id}`}
      className="block group"
    >
      <div className="relative aspect-video bg-freedom-surface border border-freedom-border">
        <img
          src={thumbnailUrl}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {video.duration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs bg-freedom-red text-white font-medium">
            {video.duration}
          </span>
        )}
      </div>
      <div className="mt-3">
        <h3 className="text-sm font-medium leading-tight line-clamp-2 group-hover:underline text-white">
          {video.title}
        </h3>
        <p className="mt-1 text-xs text-freedom-muted">{video.channel}</p>
        <div className="flex items-center gap-1 text-xs text-freedom-muted">
          <span>{video.views}</span>
          {video.uploaded && (
            <>
              <span>·</span>
              <span>{video.uploaded}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
