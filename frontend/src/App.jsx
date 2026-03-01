import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Room from './pages/Room';

function App() {
  return (
    <>
      <div className="ambient-glow"></div>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/room/:id" element={<Room />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
