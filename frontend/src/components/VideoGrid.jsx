import { useEffect, useRef } from 'react';

const StreamVideo = ({ stream, isLocal }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#111',
      borderRadius: '16px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: '16px',
          transform: isLocal ? 'scaleX(-1)' : 'none',
        }}
      />
      <div style={{
        position: 'absolute',
        bottom: '0.75rem',
        left: '0.75rem',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        padding: '0.15rem 0.55rem',
        borderRadius: '8px',
        fontSize: '0.8rem',
        fontWeight: 500,
      }}>
        {isLocal ? 'You' : 'Peer'}
      </div>
    </div>
  );
};

const VideoGrid = ({ localStream, peers }) => {
  const peerEntries = Object.entries(peers);
  const totalCount = (localStream ? 1 : 0) + peerEntries.length;

  // Google Meet-style layout:
  //  1 person  → single centered tile
  //  2 people  → side by side
  //  3-4       → 2x2 grid
  //  5+        → auto-fit grid
  let gridTemplateColumns = '1fr';
  let gridTemplateRows = '1fr';

  if (totalCount === 2) {
    gridTemplateColumns = 'repeat(2, 1fr)';
    gridTemplateRows = '1fr';
  } else if (totalCount >= 3 && totalCount <= 4) {
    gridTemplateColumns = 'repeat(2, 1fr)';
    gridTemplateRows = 'repeat(2, 1fr)';
  } else if (totalCount > 4) {
    gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
    gridTemplateRows = 'auto';
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'grid',
      gap: '0.5rem',
      gridTemplateColumns,
      gridTemplateRows,
      padding: '0.5rem',
      overflow: 'hidden',
    }}>
      {localStream && <StreamVideo stream={localStream} isLocal={true} />}
      {peerEntries.map(([peerId, stream]) => (
        <StreamVideo key={peerId} stream={stream} isLocal={false} />
      ))}
    </div>
  );
};

export default VideoGrid;
