import { useState } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';

export default function Layout({ children, showSearch = true, searchQuery = '' }) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    // On mobile, toggle overlay
    if (window.innerWidth < 1024) {
      setMobileSidebarOpen(!mobileSidebarOpen);
    } else {
      // On desktop, toggle expanded/collapsed
      setSidebarExpanded(!sidebarExpanded);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <Header
        onMenuClick={toggleSidebar}
        showSearch={showSearch}
        searchQuery={searchQuery}
      />

      <div className="flex">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block flex-shrink-0">
          <div className="sticky top-14 h-[calc(100vh-56px)]">
            <Sidebar expanded={sidebarExpanded} />
          </div>
        </div>

        {/* Mobile Sidebar Overlay */}
        {mobileSidebarOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="fixed left-0 top-14 bottom-0 z-50 lg:hidden">
              <Sidebar expanded={true} onClose={() => setMobileSidebarOpen(false)} />
            </div>
          </>
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
