import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video as VideoIcon, VideoOff, LogOut, MessageSquare, Users, Settings, Volume2, ChevronUp } from 'lucide-react';
import useWebRTC from '../hooks/useWebRTC';
import useAudioLevel from '../hooks/useAudioLevel';
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
  const [speakers, setSpeakers] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');
  const [deviceError, setDeviceError] = useState('');

  // ── UI State ────────────────────────────────────────────────────────
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────
  const localVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const streamRef = useRef(null);
  const settingsRef = useRef(null);

  // ── WebRTC ──────────────────────────────────────────────────────────
  const { peers, messages, sendMessage } = useWebRTC(joined ? id : null, localStream);

  // ── Audio level for local mic indicator ─────────────────────────────
  const localAudioLevel = useAudioLevel(localStream, isMicOn);

  // ── Enumerate devices ──────────────────────────────────────────────
  const enumerateDevices = async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    setCameras(all.filter(d => d.kind === 'videoinput'));
    setMics(all.filter(d => d.kind === 'audioinput'));
    setSpeakers(all.filter(d => d.kind === 'audiooutput'));
  };

  // ── 1. On mount: get permissions & enumerate devices ──────────────
  useEffect(() => {
    let alive = true;
    const init = async () => {
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!alive) { tmp.getTracks().forEach(t => t.stop()); return; }

        await enumerateDevices();
        const all = await navigator.mediaDevices.enumerateDevices();
        const vids = all.filter(d => d.kind === 'videoinput');
        const auds = all.filter(d => d.kind === 'audioinput');

        setSelectedCamera(vids[0]?.deviceId || '');
        setSelectedMic(auds[0]?.deviceId || '');

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
  const initialDeviceSet = useRef(false);
  useEffect(() => {
    if (!selectedCamera && !selectedMic) return;
    if (!initialDeviceSet.current) {
      initialDeviceSet.current = true;
      return;
    }
    let alive = true;

    const open = async () => {
      const tryConstraints = [
        {
          video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
        },
        { video: true, audio: true },
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
          return;
        } catch (err) {
          console.warn('getUserMedia failed:', err);
        }
      }
      setDeviceError('Could not switch camera/mic.');
    };

    open();
    return () => { alive = false; };
  }, [selectedCamera, selectedMic]);

  // ── 3. Bind local stream to preview video ─────────────────────────
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ── 4. Auto-scroll chat ───────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── 5. Sync mic/video mute state ──────────────────────────────────
  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => { t.enabled = isMicOn; });
    localStream.getVideoTracks().forEach(t => { t.enabled = isVideoOn; });
  }, [localStream, isMicOn, isVideoOn]);

  // ── 6. Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── 7. Close settings panel on outside click ──────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setIsSettingsOpen(false);
      }
    };
    if (isSettingsOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isSettingsOpen]);

  // ── 8. Set speaker output (setSinkId) ─────────────────────────────
  useEffect(() => {
    if (!selectedSpeaker) return;
    // setSinkId is available on video/audio elements
    document.querySelectorAll('video, audio').forEach(el => {
      if (el.setSinkId) {
        el.setSinkId(selectedSpeaker).catch(() => {});
      }
    });
  }, [selectedSpeaker, peers]);

  const toggleMic = () => setIsMicOn(p => !p);
  const toggleVideo = () => setIsVideoOn(p => !p);
  const handleLeave = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    navigate('/');
  };

  // ── Shared device selector style ──────────────────────────────────
  const selectStyle = {
    padding: '0.45rem 0.6rem', fontSize: '0.85rem', width: '100%',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#fff', outline: 'none',
  };
  const optionStyle = { background: '#1a1a1b' };

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
          {/* Video Preview */}
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

            {/* Audio level bar on preview */}
            {isMicOn && (
              <div style={{
                position: 'absolute', bottom: '3.5rem', left: '50%', transform: 'translateX(-50%)',
                width: '120px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${localAudioLevel * 100}%`,
                  background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                  borderRadius: '2px', transition: 'width 0.1s ease',
                }} />
              </div>
            )}

            {/* Toggle buttons */}
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

          {/* Settings & Join */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', justifyContent: 'center', minWidth: '220px', flex: 1 }}>
            <div>
              <h2 style={{ marginBottom: '0.25rem' }}>Room</h2>
              <code style={{ color: 'var(--accent)', fontSize: '1.1rem', letterSpacing: '0.05em' }}>{id}</code>
            </div>

            {/* Device selectors */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Camera</label>
                <select className="input-glass" value={selectedCamera}
                  onChange={e => setSelectedCamera(e.target.value)}
                  style={{ padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}>
                  {cameras.map(c => (
                    <option key={c.deviceId} value={c.deviceId} style={optionStyle}>
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
                    <option key={m.deviceId} value={m.deviceId} style={optionStyle}>
                      {m.label || `Mic ${m.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button onClick={() => setJoined(true)} disabled={!localStream}
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
        padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-glass)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(10,10,11,0.9)', backdropFilter: 'blur(10px)', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Meet++</h3>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>| {id}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <Users size={14} /> {1 + peerCount}
          </span>
        </div>
      </header>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {messages.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', marginTop: '2rem' }}>
                  Messages are visible to everyone in the call
                </p>
              )}
              {messages.map(msg => (
                <div key={msg.id} style={{
                  alignSelf: msg.isLocal ? 'flex-end' : 'flex-start', maxWidth: '88%',
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
            <form
              onSubmit={e => { e.preventDefault(); if (chatInput.trim()) { sendMessage(chatInput.trim()); setChatInput(''); } }}
              style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-glass)', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <input type="text" className="input-glass" value={chatInput}
                onChange={e => setChatInput(e.target.value)} placeholder="Send a message…"
                style={{ padding: '0.6rem 0.9rem', flex: 1, borderRadius: '9999px', fontSize: '0.9rem' }} />
              <button type="submit" className="btn btn-primary" style={{ borderRadius: '9999px', padding: '0.6rem 1rem', fontSize: '0.85rem' }}>
                Send
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* Controls footer */}
      <footer style={{
        padding: '0.55rem 1rem', borderTop: '1px solid var(--border-glass)',
        display: 'flex', justifyContent: 'center', gap: '0.4rem', alignItems: 'center',
        background: 'rgba(10,10,11,0.95)', backdropFilter: 'blur(10px)', flexShrink: 0,
        position: 'relative',
      }}>

        {/* ── Mic button with audio level ring ── */}
        <div style={{ position: 'relative' }}>
          {/* Audio level ring behind the button */}
          {isMicOn && (
            <div style={{
              position: 'absolute', inset: '-3px', borderRadius: '9999px',
              border: `2px solid rgba(59, 130, 246, ${localAudioLevel > 0.1 ? 0.3 + localAudioLevel * 0.7 : 0})`,
              transition: 'border-color 0.15s ease',
              pointerEvents: 'none',
            }} />
          )}
          <button onClick={toggleMic}
            className={`btn ${isMicOn ? 'btn-secondary' : 'btn-danger'}`}
            title={isMicOn ? 'Mute' : 'Unmute'}
            style={{ borderRadius: '9999px', padding: '0.7rem' }}>
            {isMicOn ? <Mic size={22} /> : <MicOff size={22} />}
          </button>
        </div>

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

        {/* ── Settings button ── */}
        <div style={{ position: 'relative' }} ref={settingsRef}>
          <button onClick={() => { enumerateDevices(); setIsSettingsOpen(s => !s); }}
            className={`btn ${isSettingsOpen ? 'btn-primary' : 'btn-secondary'}`}
            title="Audio & Video Settings"
            style={{ borderRadius: '9999px', padding: '0.7rem' }}>
            <Settings size={22} />
          </button>

          {/* ── Settings popup ── */}
          {isSettingsOpen && (
            <div style={{
              position: 'absolute', bottom: '60px', left: '50%', transform: 'translateX(-50%)',
              width: '320px', background: 'rgba(20,20,22,0.98)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px', padding: '1.25rem', backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 100,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Device Settings</h4>
                <ChevronUp size={16} style={{ opacity: 0.5 }} />
              </div>

              {/* Camera */}
              <div style={{ marginBottom: '0.9rem' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
                  <VideoIcon size={13} /> Camera
                </label>
                <select value={selectedCamera} onChange={e => setSelectedCamera(e.target.value)} style={selectStyle}>
                  {cameras.map(c => (
                    <option key={c.deviceId} value={c.deviceId} style={optionStyle}>
                      {c.label || `Camera ${c.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Microphone */}
              <div style={{ marginBottom: '0.9rem' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
                  <Mic size={13} /> Microphone
                </label>
                <select value={selectedMic} onChange={e => setSelectedMic(e.target.value)} style={selectStyle}>
                  {mics.map(m => (
                    <option key={m.deviceId} value={m.deviceId} style={optionStyle}>
                      {m.label || `Mic ${m.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
                {/* Mic level bar */}
                {isMicOn && (
                  <div style={{ marginTop: '0.5rem', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${localAudioLevel * 100}%`,
                      background: 'linear-gradient(90deg, #22c55e, #4ade80)',
                      borderRadius: '2px', transition: 'width 0.1s ease',
                    }} />
                  </div>
                )}
              </div>

              {/* Speaker (output) */}
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
                  <Volume2 size={13} /> Speaker
                </label>
                {speakers.length > 0 ? (
                  <select value={selectedSpeaker} onChange={e => setSelectedSpeaker(e.target.value)} style={selectStyle}>
                    {speakers.map(s => (
                      <option key={s.deviceId} value={s.deviceId} style={optionStyle}>
                        {s.label || `Speaker ${s.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Speaker selection not supported in this browser
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ width: '1px', height: '36px', background: 'var(--border-glass)', margin: '0 0.5rem' }} />

        <button onClick={handleLeave} className="btn btn-danger" title="Leave call"
          style={{ borderRadius: '9999px', padding: '0.9rem', minWidth: '52px' }}>
          <LogOut size={22} />
        </button>
      </footer>
    </div>
  );
};

export default Room;
