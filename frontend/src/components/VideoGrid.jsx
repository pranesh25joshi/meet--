import { useEffect, useRef, useState } from 'react';
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
    ? `rgba(59,130,246,${0.5 + audioLevel * 0.5})`
    : isPinned ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.06)';

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
      background: '#111', borderRadius: compact ? '10px' : '14px',
      border: `2px solid ${borderColor}`, transition: 'border-color 0.2s',
      boxShadow: isSpeaking ? '0 0 14px rgba(59,130,246,0.25)' : 'none',
      minHeight: 0,
    }}>
      <video ref={videoRef} autoPlay playsInline muted={isLocal}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          borderRadius: compact ? '8px' : '12px',
          transform: isLocal ? 'scaleX(-1)' : 'none',
        }}
      />

      {/* Label + speaking dot */}
      <div style={{
        position: 'absolute', bottom: compact ? '0.4rem' : '0.6rem',
        left: compact ? '0.4rem' : '0.6rem',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        padding: compact ? '0.1rem 0.4rem' : '0.12rem 0.5rem',
        borderRadius: '6px', fontSize: compact ? '0.7rem' : '0.78rem',
        fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.3rem',
      }}>
        {!isLocal && (
          <span style={{
            width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
            background: isSpeaking ? '#3b82f6' : 'rgba(255,255,255,0.3)',
            transition: 'background 0.2s',
          }} />
        )}
        {label || (isLocal ? 'You' : 'Peer')}
      </div>

      {/* Pin button */}
      {onPin && (
        <button onClick={(e) => { e.stopPropagation(); onPin(); }}
          style={{
            position: 'absolute', top: compact ? '0.3rem' : '0.5rem',
            right: compact ? '0.3rem' : '0.5rem',
            background: isPinned ? 'rgba(59,130,246,0.6)' : 'rgba(0,0,0,0.5)',
            border: 'none', borderRadius: '8px', padding: compact ? '0.25rem' : '0.35rem',
            cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center',
            backdropFilter: 'blur(4px)', opacity: isPinned ? 1 : 0,
            transition: 'opacity 0.2s',
          }}
          className="pin-btn">
          {isPinned ? <PinOff size={compact ? 12 : 14} /> : <Pin size={compact ? 12 : 14} />}
        </button>
      )}
    </div>
  );
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

  // Build participant list: local + peers
  const allParticipants = [];
  if (localStream) allParticipants.push({ id: '__local__', stream: localStream, isLocal: true, label: 'You' });
  Object.entries(peers).forEach(([id, stream]) => {
    allParticipants.push({ id, stream, isLocal: false, label: `Peer-${id.substring(0, 4)}` });
  });

  // Clean up pin if pinned participant left
  const pinned = pinnedId ? allParticipants.find(p => p.id === pinnedId) : null;

  const togglePin = (id) => setPinnedId(prev => prev === id ? null : id);

  const TILES_PER_PAGE = 4;
  const totalPages = Math.ceil(allParticipants.length / TILES_PER_PAGE);

  // Reset page if it's out of bounds
  useEffect(() => {
    if (page >= totalPages && totalPages > 0) setPage(totalPages - 1);
  }, [totalPages, page]);

  // ── PINNED / SPOTLIGHT MODE ────────────────────────────────────────
  if (pinned) {
    const others = allParticipants.filter(p => p.id !== pinnedId);
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '0.4rem', gap: '0.4rem', overflow: 'hidden' }}>
        {/* Spotlight */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <StreamVideo
            stream={pinned.stream} isLocal={pinned.isLocal} label={pinned.label}
            isPinned onPin={() => togglePin(pinned.id)}
          />
        </div>

        {/* Filmstrip of others */}
        {others.length > 0 && (
          <div style={{
            display: 'flex', gap: '0.35rem', height: isMobile ? '80px' : '120px',
            overflowX: 'auto', overflowY: 'hidden', flexShrink: 0,
            scrollSnapType: 'x mandatory', paddingBottom: '2px',
          }}>
            {others.map(p => (
              <div key={p.id} style={{
                flex: `0 0 ${isMobile ? '110px' : '170px'}`, height: '100%',
                scrollSnapAlign: 'start',
              }}>
                <StreamVideo
                  stream={p.stream} isLocal={p.isLocal} label={p.label}
                  isPinned={false} onPin={() => togglePin(p.id)} compact
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── PAGINATED GRID MODE ────────────────────────────────────────────
  const visibleParticipants = allParticipants.slice(page * TILES_PER_PAGE, (page + 1) * TILES_PER_PAGE);
  const count = visibleParticipants.length;

  // Grid layout for current visible page
  let cols = '1fr';
  let rows = '1fr';
  if (count === 2) { cols = isMobile ? '1fr' : 'repeat(2, 1fr)'; rows = isMobile ? 'repeat(2, 1fr)' : '1fr'; }
  else if (count >= 3) { cols = 'repeat(2, 1fr)'; rows = 'repeat(2, 1fr)'; }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '0.4rem', gap: '0.3rem', overflow: 'hidden' }}>

      {/* Video grid */}
      <div style={{
        flex: 1, minHeight: 0, display: 'grid', gap: isMobile ? '0.3rem' : '0.5rem',
        gridTemplateColumns: cols, gridTemplateRows: rows,
      }}>
        {visibleParticipants.map(p => (
          <StreamVideo
            key={p.id} stream={p.stream} isLocal={p.isLocal} label={p.label}
            isPinned={false} onPin={() => togglePin(p.id)} compact={isMobile}
          />
        ))}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: '0.75rem', padding: '0.3rem 0', flexShrink: 0,
        }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{
              background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%',
              padding: '0.3rem', cursor: page === 0 ? 'not-allowed' : 'pointer',
              color: '#fff', opacity: page === 0 ? 0.3 : 0.8, display: 'flex',
            }}>
            <ChevronLeft size={16} />
          </button>

          {/* Page dots */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                style={{
                  width: page === i ? '16px' : '6px', height: '6px', borderRadius: '3px',
                  border: 'none', cursor: 'pointer',
                  background: page === i ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                  transition: 'all 0.2s',
                }}
              />
            ))}
          </div>

          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
            style={{
              background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%',
              padding: '0.3rem', cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer',
              color: '#fff', opacity: page === totalPages - 1 ? 0.3 : 0.8, display: 'flex',
            }}>
            <ChevronRight size={16} />
          </button>

          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Users size={12} /> {allParticipants.length}
          </span>
        </div>
      )}
    </div>
  );
};

export default VideoGrid;
