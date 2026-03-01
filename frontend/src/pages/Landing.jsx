import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Keyboard, Plus } from 'lucide-react';

const Landing = () => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    // Generate a random 9-character room ID (e.g. abc-def-ghi)
    const generateId = () => Math.random().toString(36).substring(2, 5) + '-' + 
                           Math.random().toString(36).substring(2, 5) + '-' + 
                           Math.random().toString(36).substring(2, 5);
    navigate(`/room/${generateId()}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim().length > 0) {
      navigate(`/room/${roomId.trim()}`);
    }
  };

  return (
    <div className="landing-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
      <div className="glass-panel" style={{ maxWidth: '48rem', width: '100%', padding: '3rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ background: 'var(--accent)', padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
              <Video size={32} color="white" />
            </div>
            <h1 style={{ fontSize: '2.5rem' }}>Meet++</h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.25rem' }}>
            Premium, secure video conferencing for everyone.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', justifyContent: 'space-between', marginTop: '1rem' }}>
          
          {/* Create Room Section */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Start a meeting</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Create a new secure room instantly and invite others to join.
            </p>
            <button onClick={handleCreateRoom} className="btn btn-primary" style={{ width: '100%', padding: '1rem' }}>
              <Plus size={20} />
              New Meeting
            </button>
          </div>

          {/* Join Room Section */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Join a meeting</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Got an invite? Enter the meeting code below to join in.
            </p>
            <form onSubmit={handleJoinRoom} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ position: 'relative' }}>
                <Keyboard size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  className="input-glass" 
                  placeholder="Enter a code or link" 
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  style={{ paddingLeft: '3rem' }}
                />
              </div>
              <button disabled={!roomId.trim()} type="submit" className="btn btn-secondary" style={{ width: '100%', padding: '1rem' }}>
                Join
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
};

export default Landing;
