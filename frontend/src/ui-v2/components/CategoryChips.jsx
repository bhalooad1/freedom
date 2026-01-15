import { useRef, useState, useEffect } from 'react';

const categories = [
  { id: 'all', label: 'All' },
  { id: 'news', label: 'News' },
  { id: 'music', label: 'Music' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'sports', label: 'Sports' },
  { id: 'tech', label: 'Technology' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'education', label: 'Education' },
  { id: 'science', label: 'Science' },
  { id: 'comedy', label: 'Comedy' },
];

export default function CategoryChips({ selected = 'all', onSelect }) {
  const scrollRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const checkArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftArrow(el.scrollLeft > 0);
    setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  };

  useEffect(() => {
    checkArrows();
    window.addEventListener('resize', checkArrows);
    return () => window.removeEventListener('resize', checkArrows);
  }, []);

  const scroll = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = direction === 'left' ? -200 : 200;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      {/* Left arrow */}
      {showLeftArrow && (
        <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center bg-gradient-to-r from-black via-black to-transparent pr-4">
          <button
            onClick={() => scroll('left')}
            className="p-1.5 rounded-full bg-freedom-surface hover:bg-freedom-border transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>
        </div>
      )}

      {/* Chips container */}
      <div
        ref={scrollRef}
        onScroll={checkArrows}
        className="flex gap-3 overflow-x-auto scrollbar-hide py-3 px-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect?.(cat.id)}
            className={`
              flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${selected === cat.id
                ? 'bg-white text-black'
                : 'bg-freedom-surface text-white hover:bg-freedom-border'
              }
            `}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Right arrow */}
      {showRightArrow && (
        <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center bg-gradient-to-l from-black via-black to-transparent pl-4">
          <button
            onClick={() => scroll('right')}
            className="p-1.5 rounded-full bg-freedom-surface hover:bg-freedom-border transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
