import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Terminal, Zap, Grid3X3, Calendar } from 'lucide-react';

const Landing = () => {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [clock, setClock] = useState('');

  // Live clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const createNewRoom = () => {
    const id = Math.random().toString(36).substring(2, 5) + '-' +
               Math.random().toString(36).substring(2, 5) + '-' +
               Math.random().toString(36).substring(2, 5);
    navigate(`/room/${id}`);
  };

  const joinRoom = () => {
    if (joinCode.trim()) navigate(`/room/${joinCode.trim()}`);
  };

  return (
    <div className="grid-bg" style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="ambient-glow" />

      {/* ── System Status Bar ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border-neon)',
        background: 'rgba(0,0,0,0.4)', fontSize: '0.72rem', color: 'var(--text-dim)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="pulse-dot" />
          <span style={{ color: 'var(--neon-green)', fontWeight: 600 }}>SYSTEM ONLINE</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <span>PROTOCOL: <span style={{ color: 'var(--neon-cyan)' }}>WebRTC_v3</span></span>
          <span>UPTIME: <span style={{ color: 'var(--neon-cyan)' }}>{clock}</span></span>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{
        maxWidth: '1100px', margin: '0 auto', padding: '3rem 1.5rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3rem',
      }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: 'center', maxWidth: '700px' }}>
          <h1 style={{
            fontSize: 'clamp(1.6rem, 4vw, 2.5rem)', marginBottom: '0.75rem',
            fontWeight: 700,
          }}>
            <span style={{ color: 'var(--text-dim)' }}>&lt;</span>
            <span style={{ color: 'var(--neon-cyan)' }}>VideoCalls</span>
            <span style={{ color: 'var(--text-dim)' }}> mode=</span>
            <span style={{ color: 'var(--neon-green)' }}>"premium"</span>
            <span style={{ color: 'var(--text-dim)' }}> /&gt;</span>
          </h1>
          <p style={{ color: 'var(--text-comment)', fontSize: '0.88rem', lineHeight: 1.7 }}>
            <span style={{ color: 'var(--text-dim)' }}>// </span>
            Optimized for developers. We re-engineered the kernel for high-fidelity
            peer-to-peer communication. Now open-source for everyone.
          </p>
        </div>

        {/* ── Action Panel ── */}
        <div className="neon-panel" style={{
          padding: '2rem', width: '100%', maxWidth: '560px',
          display: 'flex', flexDirection: 'column', gap: '1rem',
          position: 'relative', zIndex: 1,
        }}>
          <button onClick={createNewRoom} className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', fontSize: '0.9rem', borderRadius: 'var(--radius-sm)' }}>
            <Terminal size={16} /> init_meeting()
          </button>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: 'var(--text-dim)', fontSize: '0.75rem',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-neon)' }} />
            <span>OR ENTER ACCESS TOKEN</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-neon)' }} />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="input-glass"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="xxx-xxx-xxx"
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              style={{ flex: 1 }}
            />
            <button onClick={joinRoom} className="btn btn-secondary"
              disabled={!joinCode.trim()}
              style={{ whiteSpace: 'nowrap' }}>
              join()
            </button>
          </div>
        </div>

        {/* ── Feature Grid ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem', width: '100%', maxWidth: '900px',
        }}>
          {/* Feature 1 */}
          <div className="neon-panel" style={{ padding: '1.5rem', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <Zap size={16} style={{ color: 'var(--neon-cyan)' }} />
              <h3 style={{ fontSize: '0.9rem', color: 'var(--neon-cyan)' }}>&gt; Generate_Link()</h3>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Execute <span style={{ color: 'var(--neon-green)' }}>init_meeting()</span> to
              generate a shareable URL token. No dependency installation required.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="neon-panel" style={{ padding: '1.5rem', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <Grid3X3 size={16} style={{ color: 'var(--neon-cyan)' }} />
              <h3 style={{ fontSize: '0.9rem', color: 'var(--neon-cyan)' }}>&gt; View.Grid(49)</h3>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Render up to <span style={{ color: 'var(--neon-green)' }}>49 peers</span> simultaneously.
              Toggle layout modes via the config panel.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="neon-panel" style={{ padding: '1.5rem', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <Calendar size={16} style={{ color: 'var(--neon-cyan)' }} />
              <h3 style={{ fontSize: '0.9rem', color: 'var(--neon-cyan)' }}>&gt; Cron.Schedule()</h3>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Integrate with <span style={{ color: 'var(--neon-green)' }}>Calendar API</span> to
              schedule syncs. Automate invite dispatch to all team members.
            </p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', gap: '1.5rem', fontSize: '0.72rem', color: 'var(--text-dim)',
          flexWrap: 'wrap', justifyContent: 'center', paddingTop: '1rem',
          borderTop: '1px solid var(--border-glass)', width: '100%', maxWidth: '500px',
        }}>
          <span style={{ cursor: 'pointer' }}>./privacy.md</span>
          <span style={{ cursor: 'pointer' }}>./terms.txt</span>
          <span style={{ cursor: 'pointer' }}>./about.json</span>
          <span style={{ color: 'var(--text-dim)' }}>v1.2.a_build</span>
        </div>
      </div>
    </div>
  );
};

export default Landing;
