import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MetricsSimulator from './pages/MetricsSimulator';
import NotFound from './pages/NotFound';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MetricsSimulator />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;