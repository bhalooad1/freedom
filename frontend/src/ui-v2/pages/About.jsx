import { useNavigate } from 'react-router-dom';

export default function About() {
  const navigate = useNavigate();

  const handleClose = () => {
    // Go back if there's history, otherwise go home
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-y-auto">
      {/* Close Button */}
      <button
        onClick={handleClose}
        className="fixed top-6 right-6 z-50 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors group"
        aria-label="Close"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-6 h-6 text-white group-hover:text-freedom-red transition-colors"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Content */}
      <div className="min-h-screen">
        {/* Hero Section */}
        <section className="relative py-24 lg:py-32 px-6 overflow-hidden">
          {/* Background flag - subtle */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
            <img
              src="/usflag.svg"
              alt=""
              className="w-[800px] h-auto"
            />
          </div>

          <div className="relative max-w-4xl mx-auto text-center">
            <p className="text-xs font-medium tracking-[0.3em] uppercase text-freedom-muted mb-8">
              United States Department of Digital Freedom
            </p>

            <h1
              className="text-5xl sm:text-6xl lg:text-7xl text-white leading-[1.1] mb-8"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Information wants to be free
            </h1>

            <div className="flex justify-center mb-12">
              <img
                src="/usflag.svg"
                alt="United States Flag"
                className="w-16 h-auto"
              />
            </div>

            <p className="text-xl sm:text-2xl text-white/80 leading-relaxed max-w-3xl mx-auto" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              An official project of the United States Government, built to ensure that every person on Earth has access to information without interference.
            </p>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Mission Section */}
        <section className="py-24 px-6">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-medium tracking-[0.3em] uppercase text-freedom-muted mb-12 text-center">
              Our Mission
            </p>

            <div className="space-y-8 text-lg text-white/70 leading-relaxed">
              <p>
                Freedom is not a privilege granted by governments—it is an inherent right of every human being. Yet across the world, authoritarian regimes and overreaching bureaucracies have decided that they, not the individual, should determine what information their citizens can access.
              </p>

              <p>
                The European Union, through its Digital Services Act and countless content regulations, has built one of the most sophisticated censorship apparatuses in the Western world. What they call "platform safety," we recognize for what it is: the systematic suppression of ideas that challenge the status quo. Journalists silenced. Dissidents deplatformed. Entire categories of political speech labeled as "disinformation" and erased.
              </p>

              <p>
                The United States was founded on a different principle. The First Amendment does not grant Americans the right to free speech—it recognizes that this right exists naturally and prohibits the government from infringing upon it. We believe this right extends to every person, regardless of where they were born.
              </p>

              <p className="text-white text-xl" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Freedom was built to put that belief into action.
              </p>

              <p>
                This platform provides unrestricted access to video content for users worldwide. No content moderation based on political viewpoint. No algorithmic suppression. No compliance with foreign censorship orders. Just information, freely available to anyone with an internet connection.
              </p>

              <p>
                We do not track you. We do not profile you. We do not sell your attention to advertisers or your data to third parties. The relationship between you and the content you choose to consume is yours alone.
              </p>
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Principles Section */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <p className="text-xs font-medium tracking-[0.3em] uppercase text-freedom-muted mb-16 text-center">
              Founding Principles
            </p>

            <div className="grid md:grid-cols-3 gap-12 md:gap-8">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-6 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-10 h-10 text-freedom-red" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-3">Unrestricted Access</h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  No content is blocked based on geographic location or political classification. If it exists, you can watch it.
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-6 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-10 h-10 text-freedom-red" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-3">Zero Surveillance</h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  No tracking, no profiling, no data collection. Your viewing habits are not our business—or anyone else's.
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-6 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-10 h-10 text-freedom-red" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-3">American Protection</h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  Hosted under United States jurisdiction and protected by the First Amendment. Foreign censorship orders have no authority here.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Closing Statement */}
        <section className="py-24 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <blockquote
              className="text-3xl sm:text-4xl text-white leading-snug mb-8"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              "The freedom of speech and of the press, which are secured by the First Amendment against abridgment by the United States, are among the fundamental personal rights and liberties which are secured to all persons."
            </blockquote>
            <cite className="text-xs font-medium tracking-[0.2em] uppercase text-white/40">
              — United States Supreme Court
            </cite>
          </div>
        </section>

        {/* Bottom Banner */}
        <section className="border-t border-white/10 py-12 px-6">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <img src="/usflag.svg" alt="U.S. Flag" className="w-10 h-auto" />
              <div>
                <p className="text-sm font-medium text-white">An Official U.S. Government Project</p>
                <p className="text-xs text-white/40">Department of Digital Freedom • Est. 2026</p>
              </div>
            </div>
            <p className="text-xs tracking-[0.15em] uppercase text-white/30">
              Design by the National Design Studio
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
