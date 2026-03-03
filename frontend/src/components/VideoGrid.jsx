import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Pin, PinOff, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import useAudioLevel from '../hooks/useAudioLevel';

/* ── Single video tile ────────────────────────────────────────────────── */
const StreamVideo = ({ stream, isLocal, label, isPinned, onPin, compact }) => {
  const videoRef = useRef(null);
  const audioLevel = useAudioLevel(stream, !isLocal);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  const isSpeaking = audioLevel > 0.15;
  const borderColor = isSpeaking
    ? `rgba(0,240,255,${0.4 + audioLevel * 0.6})`
    : isPinned ? 'rgba(0,240,255,0.3)' : 'rgba(255,255,255,0.04)';

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
      background: '#08080e', borderRadius: compact ? '8px' : '10px',
      border: `1px solid ${borderColor}`, transition: 'border-color 0.2s, box-shadow 0.2s',
      boxShadow: isSpeaking ? '0 0 20px rgba(0,240,255,0.2)' : 'none',
      minHeight: 0,
    }}>
      <video ref={videoRef} autoPlay playsInline muted={isLocal}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          borderRadius: compact ? '7px' : '9px',
          transform: isLocal ? 'scaleX(-1)' : 'none',
        }}
      />

      {/* Scanline overlay */}
      <div className="scanline-overlay" />

      {/* Label bar */}
      <div style={{
        position: 'absolute', bottom: compact ? '0.3rem' : '0.5rem',
        left: compact ? '0.3rem' : '0.5rem', right: compact ? '0.3rem' : '0.5rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          padding: compact ? '0.1rem 0.4rem' : '0.15rem 0.5rem',
          borderRadius: '4px', fontSize: compact ? '0.65rem' : '0.72rem',
          fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.3rem',
          fontFamily: 'var(--font-mono)',
        }}>
          {!isLocal && (
            <span style={{
              width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
              background: isSpeaking ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.2)',
              transition: 'background 0.2s',
              boxShadow: isSpeaking ? '0 0 6px var(--neon-cyan)' : 'none',
            }} />
          )}
          <span style={{ color: 'var(--text-dim)' }}>usr:</span> {label}
        </div>

        {/* Audio level mini-bar */}
        {!isLocal && !compact && (
          <div style={{
            background: 'rgba(0,0,0,0.6)', borderRadius: '4px', padding: '0.15rem 0.35rem',
            display: 'flex', alignItems: 'center', gap: '2px', height: '14px',
          }}>
            {[0.1, 0.25, 0.4, 0.55, 0.7].map((threshold, i) => (
              <div key={i} style={{
                width: '3px', height: `${6 + i * 2}px`, borderRadius: '1px',
                background: audioLevel > threshold ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.1)',
                transition: 'background 0.15s',
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Pin button */}
      {onPin && (
        <button onClick={(e) => { e.stopPropagation(); onPin(); }}
          className="pin-btn"
          style={{
            position: 'absolute', top: compact ? '0.25rem' : '0.4rem',
            right: compact ? '0.25rem' : '0.4rem',
            background: isPinned ? 'rgba(0,240,255,0.5)' : 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(0,240,255,0.2)', borderRadius: '4px',
            padding: compact ? '0.2rem' : '0.3rem',
            cursor: 'pointer', color: '#fff', display: 'flex',
            backdropFilter: 'blur(4px)',
          }}>
          {isPinned ? <PinOff size={compact ? 11 : 13} /> : <Pin size={compact ? 11 : 13} />}
        </button>
      )}
    </div>
  );
};

StreamVideo.propTypes = {
  stream: PropTypes.object,
  isLocal: PropTypes.bool,
  label: PropTypes.string,
  isPinned: PropTypes.bool,
  onPin: PropTypes.func,
  compact: PropTypes.bool,
};

/* ── Main grid ────────────────────────────────────────────────────────── */
const VideoGrid = ({ localStream, peers }) => {
  const [pinnedId, setPinnedId] = useState(null);
  const [page, setPage] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const allParticipants = [];
  if (localStream) allParticipants.push({ id: '__local__', stream: localStream, isLocal: true, label: 'You' });
  Object.entries(peers).forEach(([id, stream]) => {
    allParticipants.push({ id, stream, isLocal: false, label: id.substring(0, 6) });
  });

  const pinned = pinnedId ? allParticipants.find(p => p.id === pinnedId) : null;
  const togglePin = (id) => setPinnedId(prev => prev === id ? null : id);
  const TILES_PER_PAGE = 4;
  const totalPages = Math.ceil(allParticipants.length / TILES_PER_PAGE);

  useEffect(() => {
    if (page >= totalPages && totalPages > 0) setPage(totalPages - 1);
  }, [totalPages, page]);

  // ── PINNED / SPOTLIGHT ──────────────────────────────────────────────
  if (pinned) {
    const others = allParticipants.filter(p => p.id !== pinnedId);
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '0.3rem', gap: '0.3rem', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <StreamVideo stream={pinned.stream} isLocal={pinned.isLocal} label={pinned.label}
            isPinned onPin={() => togglePin(pinned.id)} />
        </div>
        {others.length > 0 && (
          <div style={{
            display: 'flex', gap: '0.3rem', height: isMobile ? '75px' : '110px',
            overflowX: 'auto', overflowY: 'hidden', flexShrink: 0,
            scrollSnapType: 'x mandatory',
          }}>
            {others.map(p => (
              <div key={p.id} style={{ flex: `0 0 ${isMobile ? '100px' : '160px'}`, height: '100%', scrollSnapAlign: 'start' }}>
                <StreamVideo stream={p.stream} isLocal={p.isLocal} label={p.label}
                  isPinned={false} onPin={() => togglePin(p.id)} compact />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── PAGINATED GRID ──────────────────────────────────────────────────
  const visible = allParticipants.slice(page * TILES_PER_PAGE, (page + 1) * TILES_PER_PAGE);
  const count = visible.length;
  let cols = '1fr', rows = '1fr';
  if (count === 2) { cols = isMobile ? '1fr' : 'repeat(2,1fr)'; rows = isMobile ? 'repeat(2,1fr)' : '1fr'; }
  else if (count >= 3) { cols = 'repeat(2,1fr)'; rows = 'repeat(2,1fr)'; }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '0.3rem', gap: '0.25rem', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gap: isMobile ? '0.25rem' : '0.4rem', gridTemplateColumns: cols, gridTemplateRows: rows }}>
        {visible.map(p => (
          <StreamVideo key={p.id} stream={p.stream} isLocal={p.isLocal} label={p.label}
            isPinned={false} onPin={() => togglePin(p.id)} compact={isMobile} />
        ))}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem', padding: '0.2rem 0', flexShrink: 0 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ background: 'rgba(0,240,255,0.06)', border: '1px solid var(--border-neon)', borderRadius: '4px', padding: '0.2rem', cursor: page === 0 ? 'not-allowed' : 'pointer', color: '#fff', opacity: page === 0 ? 0.3 : 0.7, display: 'flex' }}>
            <ChevronLeft size={14} />
          </button>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                style={{ width: page === i ? '14px' : '5px', height: '5px', borderRadius: '2px', border: 'none', cursor: 'pointer', background: page === i ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.15)', transition: 'all 0.2s' }} />
            ))}
          </div>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
            style={{ background: 'rgba(0,240,255,0.06)', border: '1px solid var(--border-neon)', borderRadius: '4px', padding: '0.2rem', cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer', color: '#fff', opacity: page === totalPages - 1 ? 0.3 : 0.7, display: 'flex' }}>
            <ChevronRight size={14} />
          </button>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <Users size={10} /> {allParticipants.length}
          </span>
        </div>
      )}
    </div>
  );
};

VideoGrid.propTypes = {
  localStream: PropTypes.object,
  peers: PropTypes.object,
};

export default VideoGrid;
