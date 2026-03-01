import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video as VideoIcon, VideoOff, LogOut, MessageSquare, Users } from 'lucide-react';
import useWebRTC from '../hooks/useWebRTC';
import VideoGrid from '../components/VideoGrid';

const Room = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // ── Stream & Join State ─────────────────────────────────────────────
  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);

  // ── Device Selection ────────────────────────────────────────────────
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [deviceError, setDeviceError] = useState('');

  // ── UI State ────────────────────────────────────────────────────────
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');

  // ── Refs ────────────────────────────────────────────────────────────
  const localVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const streamRef = useRef(null); // keeps a stable reference to the live stream

  // ── WebRTC (only active after joining) ──────────────────────────────
  const { peers, messages, sendMessage } = useWebRTC(joined ? id : null, localStream);

  // ── 1. On mount: get permissions & enumerate devices ──────────────
  useEffect(() => {
    let alive = true;
    const init = async () => {
      try {
        // Get a temp stream to unlock device labels
        const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!alive) { tmp.getTracks().forEach(t => t.stop()); return; }

        const all = await navigator.mediaDevices.enumerateDevices();
        const vids = all.filter(d => d.kind === 'videoinput');
        const auds = all.filter(d => d.kind === 'audioinput');

        setCameras(vids);
        setMics(auds);

        const camId = vids[0]?.deviceId || '';
        const micId = auds[0]?.deviceId || '';
        setSelectedCamera(camId);
        setSelectedMic(micId);

        // Don't stop the temp stream — use it as the initial stream
        // This avoids re-requesting permissions on mobile
        streamRef.current = tmp;
        setLocalStream(tmp);
      } catch (err) {
        console.error('Device init error:', err);
        if (err.name === 'NotAllowedError') {
          setDeviceError('Camera/mic access denied. Please allow permissions in your browser settings and reload.');
        } else if (err.name === 'NotFoundError') {
          setDeviceError('No camera or microphone found on this device.');
        } else if (err.name === 'NotReadableError') {
          setDeviceError('Camera/mic is in use by another app. Please close it and reload.');
        } else {
          setDeviceError(`Could not access camera/mic: ${err.message}`);
        }
      }
    };
    init();
    return () => { alive = false; };
  }, []);

  // ── 2. Switch stream when device selection changes ────────────────
  // (skipped on first mount since effect #1 already set the stream)
  const initialDeviceSet = useRef(false);
  useEffect(() => {
    if (!selectedCamera && !selectedMic) return;
    // Skip the first trigger — effect #1 already created the stream
    if (!initialDeviceSet.current) {
      initialDeviceSet.current = true;
      return;
    }
    let alive = true;

    const open = async () => {
      // Try exact device IDs first, fall back to basic constraints (important for mobile)
      const tryConstraints = [
        {
          video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
        },
        { video: true, audio: true },  // fallback
      ];

      for (const constraints of tryConstraints) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
          }
          streamRef.current = stream;
          setLocalStream(stream);
          setDeviceError('');
          return; // success
        } catch (err) {
          console.warn('getUserMedia failed with constraints:', constraints, err);
        }
      }
      setDeviceError('Could not switch camera/mic. Using previous device.');
    };

    open();
    return () => { alive = false; };
  }, [selectedCamera, selectedMic]);

  // ── 3. Bind local stream to the preview video element ────────────
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ── 4. Auto-scroll chat ───────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── 5. Sync mic/video mute state to tracks ────────────────────────
  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => { t.enabled = isMicOn; });
    localStream.getVideoTracks().forEach(t => { t.enabled = isVideoOn; });
  }, [localStream, isMicOn, isVideoOn]);

  // ── 6. Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const toggleMic = () => setIsMicOn(p => !p);
  const toggleVideo = () => setIsVideoOn(p => !p);

  const handleLeave = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    navigate('/');
  };

  // ── PRE-JOIN SCREEN ───────────────────────────────────────────────
  if (!joined) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh', padding: '2rem', gap: '2rem'
      }}>
        <h1 style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Ready to join?
        </h1>

        {deviceError && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: '12px', padding: '1rem', color: '#fca5a5', maxWidth: '700px', width: '100%' }}>
            ⚠️ {deviceError}
          </div>
        )}

        <div className="glass-panel" style={{
          padding: '2rem', display: 'flex', gap: '2.5rem',
          flexWrap: 'wrap', justifyContent: 'center', maxWidth: '900px', width: '100%'
        }}>
          {/* ── Video Preview ── */}
          <div style={{
            position: 'relative', width: '460px', height: '260px',
            background: '#000', borderRadius: '16px', overflow: 'hidden', flexShrink: 0
          }}>
            <video ref={localVideoRef} autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
            {!isVideoOn && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: '#111', flexDirection: 'column', gap: '0.5rem'
              }}>
                <VideoOff size={40} opacity={0.4} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Camera is off</span>
              </div>
            )}
            {/* Quick toggle buttons on the preview */}
            <div style={{
              position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: '0.75rem'
            }}>
              <button onClick={toggleMic}
                className={`btn ${isMicOn ? 'btn-secondary' : 'btn-danger'}`}
                style={{ borderRadius: '9999px', padding: '0.65rem' }} title={isMicOn ? 'Mute' : 'Unmute'}>
                {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
              <button onClick={toggleVideo}
                className={`btn ${isVideoOn ? 'btn-secondary' : 'btn-danger'}`}
                style={{ borderRadius: '9999px', padding: '0.65rem' }} title={isVideoOn ? 'Stop Video' : 'Start Video'}>
                {isVideoOn ? <VideoIcon size={18} /> : <VideoOff size={18} />}
              </button>
            </div>
          </div>

          {/* ── Settings & Join ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', justifyContent: 'center', minWidth: '220px', flex: 1 }}>
            <div>
              <h2 style={{ marginBottom: '0.25rem' }}>Room</h2>
              <code style={{ color: 'var(--accent)', fontSize: '1.1rem', letterSpacing: '0.05em' }}>{id}</code>
            </div>

            {/* Horizontal device selectors */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Camera</label>
                <select className="input-glass" value={selectedCamera}
                  onChange={e => setSelectedCamera(e.target.value)}
                  style={{ padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}>
                  {cameras.map(c => (
                    <option key={c.deviceId} value={c.deviceId} style={{ background: '#0a0a0b' }}>
                      {c.label || `Camera ${c.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Microphone</label>
                <select className="input-glass" value={selectedMic}
                  onChange={e => setSelectedMic(e.target.value)}
                  style={{ padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}>
                  {mics.map(m => (
                    <option key={m.deviceId} value={m.deviceId} style={{ background: '#0a0a0b' }}>
                      {m.label || `Microphone ${m.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => setJoined(true)}
              disabled={!localStream}
              className="btn btn-primary"
              style={{ padding: '0.9rem 2rem', fontSize: '1.1rem', borderRadius: '9999px' }}>
              {localStream ? 'Join Now' : 'Opening camera…'}
            </button>
            <button onClick={() => navigate('/')} className="btn btn-secondary" style={{ borderRadius: '9999px' }}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ROOM SCREEN ───────────────────────────────────────────────────────
  const peerCount = Object.keys(peers).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* Header */}
      <header style={{
        padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-glass)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(10,10,11,0.9)', backdropFilter: 'blur(10px)', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Meet++</h3>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>| {id}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            fontSize: '0.85rem', color: 'var(--text-secondary)'
          }}>
            <Users size={16} /> {1 + peerCount} in call
          </span>
        </div>
      </header>

      {/* Main content: video grid + optional chat sidebar */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Video grid */}
        <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <VideoGrid localStream={localStream} peers={peers} />
        </main>

        {/* Chat sidebar */}
        {isChatOpen && (
          <aside style={{
            width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderLeft: '1px solid var(--border-glass)', background: 'rgba(10,10,11,0.95)'
          }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>In-call messages</h3>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {messages.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', marginTop: '2rem' }}>
                  Messages are visible to everyone in the call
                </p>
              )}
              {messages.map(msg => (
                <div key={msg.id} style={{
                  alignSelf: msg.isLocal ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  background: msg.isLocal ? 'var(--accent)' : 'rgba(255,255,255,0.07)',
                  padding: '0.6rem 0.9rem',
                  borderRadius: msg.isLocal ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: msg.isLocal ? 'rgba(255,255,255,.85)' : 'var(--accent)' }}>
                      {msg.senderName}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,.4)' }}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.9rem', wordBreak: 'break-word', lineHeight: 1.4 }}>{msg.text}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={e => { e.preventDefault(); if (chatInput.trim()) { sendMessage(chatInput.trim()); setChatInput(''); } }}
              style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-glass)', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <input
                type="text"
                className="input-glass"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Send a message…"
                style={{ padding: '0.6rem 0.9rem', flex: 1, borderRadius: '9999px', fontSize: '0.9rem' }}
              />
              <button type="submit" className="btn btn-primary"
                style={{ borderRadius: '9999px', padding: '0.6rem 1rem', fontSize: '0.85rem' }}>
                Send
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* Controls footer */}
      <footer style={{
        padding: '1rem 2rem', borderTop: '1px solid var(--border-glass)',
        display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center',
        background: 'rgba(10,10,11,0.95)', backdropFilter: 'blur(10px)', flexShrink: 0
      }}>
        <button onClick={toggleMic}
          className={`btn ${isMicOn ? 'btn-secondary' : 'btn-danger'}`}
          title={isMicOn ? 'Mute' : 'Unmute'}
          style={{ borderRadius: '9999px', padding: '0.9rem' }}>
          {isMicOn ? <Mic size={22} /> : <MicOff size={22} />}
        </button>

        <button onClick={toggleVideo}
          className={`btn ${isVideoOn ? 'btn-secondary' : 'btn-danger'}`}
          title={isVideoOn ? 'Stop Video' : 'Start Video'}
          style={{ borderRadius: '9999px', padding: '0.9rem' }}>
          {isVideoOn ? <VideoIcon size={22} /> : <VideoOff size={22} />}
        </button>

        <button onClick={() => setIsChatOpen(c => !c)}
          className={`btn ${isChatOpen ? 'btn-primary' : 'btn-secondary'}`}
          title="Toggle Chat"
          style={{ borderRadius: '9999px', padding: '0.9rem', position: 'relative' }}>
          <MessageSquare size={22} />
          {messages.length > 0 && !isChatOpen && (
            <span style={{
              position: 'absolute', top: '6px', right: '6px', width: '8px', height: '8px',
              background: 'var(--accent)', borderRadius: '50%'
            }} />
          )}
        </button>

        <div style={{ width: '1px', height: '36px', background: 'var(--border-glass)', margin: '0 0.5rem' }} />

        <button onClick={handleLeave}
          className="btn btn-danger"
          title="Leave call"
          style={{ borderRadius: '9999px', padding: '0.9rem', minWidth: '52px' }}>
          <LogOut size={22} />
        </button>
      </footer>
    </div>
  );
};

export default Room;
