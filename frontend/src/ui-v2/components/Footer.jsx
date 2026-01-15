export default function Footer() {
  return (
    <footer className="mt-16 bg-black border-t border-white/20">
      {/* Main footer content */}
      <div className="text-center py-20 px-6">
        <p className="text-xs font-medium tracking-[0.3em] uppercase text-white/50 mb-6">
          Protecting Free Speech
        </p>
        <h2 className="text-7xl sm:text-8xl lg:text-9xl text-white" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          Freedom
        </h2>
      </div>

      {/* Bottom banner */}
      <div className="border-t border-white/20 py-6 px-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-0">
          <span className="text-[11px] font-medium tracking-[0.2em] uppercase text-white/40">
            Uncensored Video Platform
          </span>
          <span className="text-[11px] font-medium tracking-[0.2em] uppercase text-white/40">
            No Ads • No Tracking
          </span>
          <span className="text-[11px] font-medium tracking-[0.2em] uppercase text-white/40">
            National Design Studio
          </span>
        </div>
      </div>
    </footer>
  );
}
