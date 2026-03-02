import { useEffect, useRef } from 'react';
import useAudioLevel from '../hooks/useAudioLevel';

const StreamVideo = ({ stream, isLocal, label }) => {
  const videoRef = useRef(null);
  const audioLevel = useAudioLevel(stream, !isLocal); // Don't monitor local (muted)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Speaking glow: blue border like Google Meet
  const isSpeaking = audioLevel > 0.15;
  const borderColor = isSpeaking
    ? `rgba(59, 130, 246, ${0.5 + audioLevel * 0.5})`
    : 'rgba(255,255,255,0.06)';

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
      border: `2px solid ${borderColor}`,
      transition: 'border-color 0.2s ease',
      boxShadow: isSpeaking ? '0 0 16px rgba(59,130,246,0.3)' : 'none',
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
          borderRadius: '14px',
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
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
      }}>
        {/* Audio activity dot */}
        {!isLocal && (
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: isSpeaking ? '#3b82f6' : 'rgba(255,255,255,0.3)',
            transition: 'background 0.2s ease',
            flexShrink: 0,
          }} />
        )}
        {label || (isLocal ? 'You' : 'Peer')}
      </div>
    </div>
  );
};

const VideoGrid = ({ localStream, peers }) => {
  const peerEntries = Object.entries(peers);
  const totalCount = (localStream ? 1 : 0) + peerEntries.length;

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
      {localStream && <StreamVideo stream={localStream} isLocal={true} label="You" />}
      {peerEntries.map(([peerId, stream]) => (
        <StreamVideo key={peerId} stream={stream} isLocal={false} label={`Peer-${peerId.substring(0, 4)}`} />
      ))}
    </div>
  );
};

export default VideoGrid;
