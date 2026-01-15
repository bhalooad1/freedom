// UI Version Toggle
// Set VITE_UI_VERSION=v1 or VITE_UI_VERSION=v2 in your .env file
const UI_VERSION = import.meta.env.VITE_UI_VERSION || 'v1';

// Log UI version for debugging
console.log(`%c[UI] Version: ${UI_VERSION}`, 'color: #00ff00; font-weight: bold');

// Dynamic import based on version
import AppV1 from './ui-v1/App';
import AppV2 from './ui-v2/App';

export default function App() {
  if (UI_VERSION === 'v2') {
    return <AppV2 />;
  }
  return <AppV1 />;
}
