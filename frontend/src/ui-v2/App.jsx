import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Watch from './pages/Watch';
import Results from './pages/Results';
import About from './pages/About';

export default function AppV2() {
  return (
    <div className="min-h-screen bg-black">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watch" element={<Watch />} />
        <Route path="/results" element={<Results />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </div>
  );
}
