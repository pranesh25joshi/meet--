import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, LogOut, MessageSquare,
  Users, Settings, Volume2, ChevronUp, Monitor, Shield
} from 'lucide-react';
import useWebRTC from '../hooks/useWebRTC';
import useAudioLevel from '../hooks/useAudioLevel';
import VideoGrid from '../components/VideoGrid';

const Room = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // ── State ───────────────────────────────────────────────────────────
  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('AUDIO');
  const [clock, setClock] = useState('');

  // ── Refs ─────────────────────────────────────────────────────────────
  const localVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const streamRef = useRef(null);
  const settingsRef = useRef(null);

  // ── WebRTC ──────────────────────────────────────────────────────────
  const { peers, messages, sendMessage } = useWebRTC(joined ? id : null, localStream);
  const localAudioLevel = useAudioLevel(localStream, isMicOn);

  // ── Live clock ──────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // ── Enumerate devices ──────────────────────────────────────────────
  const enumerateDevices = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    setCameras(all.filter(d => d.kind === 'videoinput'));
    setMics(all.filter(d => d.kind === 'audioinput'));
    setSpeakers(all.filter(d => d.kind === 'audiooutput'));
  }, []);

  // ── 1. Init media ────────────────────────────────────────────────────
  const initMedia = useCallback(async () => {
    setDeviceError('');

    // Check if mediaDevices API exists (missing on HTTP in mobile browsers)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setDeviceError('HTTPS_REQUIRED: This site must be loaded over HTTPS for camera/mic access on mobile. Check your URL starts with https://');
      return;
    }

    // Try video+audio, then audio-only, then give up gracefully
    const attempts = [
      { video: true, audio: true },
      { video: false, audio: true },
    ];

    for (const constraints of attempts) {
      try {
        const tmp = await navigator.mediaDevices.getUserMedia(constraints);
        await enumerateDevices();
        const all = await navigator.mediaDevices.enumerateDevices();
        setSelectedCamera(all.find(d => d.kind === 'videoinput')?.deviceId || '');
        setSelectedMic(all.find(d => d.kind === 'audioinput')?.deviceId || '');
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = tmp;
        setLocalStream(tmp);
        setDeviceError(!constraints.video ? 'WARN: Camera unavailable — audio-only mode.' : '');
        return;
      } catch (err) {
        console.warn('getUserMedia failed:', constraints, err.name, err.message);
      }
    }

    // Detect the specific issue for better messaging
    let msg = 'BLOCKED: Camera/mic access denied.';
    try {
      const camPerm = await navigator.permissions.query({ name: 'camera' });
      const micPerm = await navigator.permissions.query({ name: 'microphone' });
      if (camPerm.state === 'denied' || micPerm.state === 'denied') {
        msg = 'DENIED: You previously blocked camera/mic for this site. To fix:\n1. Tap the lock/info icon in the URL bar\n2. Find Camera & Microphone → set to Allow\n3. Tap the RETRY button below';
      } else if (camPerm.state === 'prompt') {
        msg = 'NOT_GRANTED: Browser did not show the permission prompt. Try the RETRY button below.';
      }
    } catch {
      // permissions.query not supported (Firefox/some mobile) — use generic message
    }
    setDeviceError(msg);
  }, [enumerateDevices]);

  useEffect(() => {
    initMedia();
    return () => {};
  }, [initMedia]);

  // ── 2. Switch devices ───────────────────────────────────────────────
  const initialDeviceSet = useRef(false);
  useEffect(() => {
    if (!selectedCamera && !selectedMic) return;
    if (!initialDeviceSet.current) { initialDeviceSet.current = true; return; }
    let alive = true;
    const open = async () => {
      const tries = [
        { video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true, audio: selectedMic ? { deviceId: { exact: selectedMic } } : true },
        { video: true, audio: true },
      ];
      for (const c of tries) {
        try {
          const s = await navigator.mediaDevices.getUserMedia(c);
          if (!alive) { s.getTracks().forEach(t => t.stop()); return; }
          if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = s;
          setLocalStream(s);
          setDeviceError('');
          return;
        } catch { /* noop */ }
      }
      setDeviceError('SWITCH_FAILED: Could not change device.');
    };
    open();
    return () => { alive = false; };
  }, [selectedCamera, selectedMic]);

  // ── 3. Bind video ───────────────────────────────────────────────────
  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  // ── 4. Auto-scroll chat ─────────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── 5. Sync tracks ──────────────────────────────────────────────────
  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => { t.enabled = isMicOn; });
    localStream.getVideoTracks().forEach(t => { t.enabled = isVideoOn; });
  }, [localStream, isMicOn, isVideoOn]);

  // ── 6. Cleanup ──────────────────────────────────────────────────────
  useEffect(() => () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); }, []);

  // ── 7. Close settings on outside click ──────────────────────────────
  useEffect(() => {
    const h = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setIsSettingsOpen(false); };
    if (isSettingsOpen) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [isSettingsOpen]);

  // ── 8. Speaker output ──────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSpeaker) return;
    document.querySelectorAll('video, audio').forEach(el => { if (el.setSinkId) el.setSinkId(selectedSpeaker).catch(() => {}); });
  }, [selectedSpeaker, peers]);

  const toggleMic = () => setIsMicOn(p => !p);
  const toggleVideo = () => setIsVideoOn(p => !p);
  const handleLeave = () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); navigate('/'); };

  const selectStyle = {
    padding: '0.5rem 0.7rem', fontSize: '0.78rem', width: '100%',
    background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-neon)',
    borderRadius: '4px', color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', outline: 'none',
    appearance: 'none',
  };

  // ══════════════════════════════════════════════════════════════════════
  // ── PRE-JOIN SCREEN ──────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════
  if (!joined) {
    return (
      <div className="grid-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div className="ambient-glow" />

        {/* Status bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.5rem 1.2rem', borderBottom: '1px solid var(--border-neon)',
          background: 'rgba(0,0,0,0.4)', fontSize: '0.68rem', color: 'var(--text-dim)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--neon-cyan)', fontWeight: 600 }}>MEET++ DEV</span>
          </div>
          <span>{clock}</span>
        </div>

        {/* Main */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem', gap: '1.5rem', flexWrap: 'wrap',
        }}>

          {deviceError && (
            <div style={{
              position: 'fixed', top: '3.5rem', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.3)',
              borderRadius: '8px', padding: '0.8rem 1.2rem', color: '#ff6b6b',
              fontSize: '0.75rem', zIndex: 100, fontFamily: 'var(--font-mono)',
              maxWidth: '92%', width: '420px',
            }}>
              <div style={{ whiteSpace: 'pre-line', marginBottom: '0.6rem' }}>⚠ {deviceError}</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={initMedia}
                  style={{
                    background: 'rgba(0,240,255,0.15)', border: '1px solid var(--neon-cyan)',
                    color: 'var(--neon-cyan)', borderRadius: '4px', padding: '0.35rem 0.8rem',
                    fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                  }}>
                  ↻ RETRY
                </button>
                <button onClick={() => setDeviceError('')}
                  style={{
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-dim)', borderRadius: '4px', padding: '0.35rem 0.8rem',
                    fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                  }}>
                  DISMISS
                </button>
              </div>
            </div>
          )}

          {/* ── Left panel: Camera preview ── */}
          <div className="neon-panel" style={{
            width: '480px', maxWidth: '100%', position: 'relative', zIndex: 1,
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'relative', width: '100%', aspectRatio: '16/9',
              background: '#000', borderRadius: '10px 10px 0 0', overflow: 'hidden',
            }}>
              <video ref={localVideoRef} autoPlay muted playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />

              {!isVideoOn && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: '#08080e', flexDirection: 'column', gap: '0.4rem',
                }}>
                  <VideoOff size={36} style={{ opacity: 0.3 }} />
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>CAM_OFFLINE</span>
                </div>
              )}

              {/* Scanline */}
              <div className="scanline-overlay" />

              {/* Tech overlay */}
              <div style={{
                position: 'absolute', top: '0.5rem', left: '0.6rem',
                fontSize: '0.62rem', color: 'var(--neon-green)', opacity: 0.6,
                display: 'flex', flexDirection: 'column', gap: '0.15rem',
              }}>
                <span>FPS: 60</span>
                <span>STATUS: {isVideoOn ? 'ONLINE' : 'OFFLINE'}</span>
              </div>

              {/* Audio level bar */}
              {isMicOn && (
                <div style={{
                  position: 'absolute', bottom: '3rem', left: '50%', transform: 'translateX(-50%)',
                  width: '100px', height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${localAudioLevel * 100}%`,
                    background: 'linear-gradient(90deg, var(--neon-cyan), var(--neon-green))',
                    borderRadius: '2px', transition: 'width 0.1s ease',
                  }} />
                </div>
              )}

              {/* Controls on preview */}
              <div style={{
                position: 'absolute', bottom: '0.6rem', left: '50%', transform: 'translateX(-50%)',
                display: 'flex', gap: '0.5rem',
              }}>
                <button onClick={toggleMic} className={`btn ${isMicOn ? 'btn-secondary' : 'btn-danger'}`}
                  style={{ borderRadius: '6px', padding: '0.45rem' }}>
                  {isMicOn ? <Mic size={16} /> : <MicOff size={16} />}
                </button>
                <button onClick={toggleVideo} className={`btn ${isVideoOn ? 'btn-secondary' : 'btn-danger'}`}
                  style={{ borderRadius: '6px', padding: '0.45rem' }}>
                  {isVideoOn ? <VideoIcon size={16} /> : <VideoOff size={16} />}
                </button>
              </div>
            </div>

            {/* Device selectors */}
            <div style={{ padding: '0.8rem', display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.3)' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginBottom: '0.2rem', display: 'block' }}>INPUT: MIC</label>
                <select className="input-glass" value={selectedMic} onChange={e => setSelectedMic(e.target.value)}
                  style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}>
                  {mics.map(m => <option key={m.deviceId} value={m.deviceId} style={{ background: '#0a0a0f' }}>{m.label || `MIC_${m.deviceId.slice(0,6)}`}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginBottom: '0.2rem', display: 'block' }}>CAM: DEVICE</label>
                <select className="input-glass" value={selectedCamera} onChange={e => setSelectedCamera(e.target.value)}
                  style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}>
                  {cameras.map(c => <option key={c.deviceId} value={c.deviceId} style={{ background: '#0a0a0f' }}>{c.label || `CAM_${c.deviceId.slice(0,6)}`}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Right panel: Session info ── */}
          <div className="neon-panel" style={{
            width: '320px', maxWidth: '100%', padding: '1.5rem',
            display: 'flex', flexDirection: 'column', gap: '1.2rem',
            position: 'relative', zIndex: 1,
          }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', color: 'var(--neon-cyan)', marginBottom: '0.2rem' }}>
                Session_{id.replace(/-/g, '_')}.exe
              </h2>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                Status: <span style={{ color: 'var(--neon-green)' }}>Ready to initialize</span>
              </div>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ color: 'var(--text-dim)' }}>room_id:</span>
                <span style={{ color: 'var(--neon-cyan)' }}>{id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>protocol:</span>
                <span style={{ color: 'var(--neon-green)' }}>SECURE_V2</span>
              </div>
            </div>

            <button onClick={() => setJoined(true)}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.85rem', borderRadius: '6px' }}>
              --&gt; EXECUTE JOIN
            </button>

            <button onClick={() => navigate('/')} className="btn btn-secondary"
              style={{ width: '100%', fontSize: '0.78rem', borderRadius: '6px' }}>
              &lt;-- ABORT
            </button>

            {/* Hash footer */}
            <div style={{
              fontSize: '0.6rem', color: 'var(--text-dim)', opacity: 0.5,
              borderTop: '1px solid var(--border-glass)', paddingTop: '0.6rem',
              fontFamily: 'var(--font-mono)', wordBreak: 'break-all',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                <Shield size={10} /> PROTOCOL: SECURE_V2
              </div>
              sha256: {Array.from({length: 40}, () => '0123456789abcdef'[Math.floor(Math.random()*16)]).join('')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── ROOM SCREEN ──────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════
  const peerCount = Object.keys(peers).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* ── Header ── */}
      <header style={{
        padding: '0.4rem 1rem', borderBottom: '1px solid var(--border-neon)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(8,8,14,0.95)', backdropFilter: 'blur(12px)', flexShrink: 0,
        fontSize: '0.72rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span className="pulse-dot" style={{ width: '6px', height: '6px' }} />
          <span style={{ color: 'var(--neon-cyan)', fontWeight: 600 }}>MEET++</span>
          <span style={{ color: 'var(--text-dim)' }}>{'// '}{id}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: 'var(--text-dim)' }}>
            <Users size={12} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
            {1 + peerCount} connected
          </span>
          <span style={{ color: 'var(--neon-cyan)', opacity: 0.6 }}>{clock}</span>
        </div>
      </header>

      {/* ── Main ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <main style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#06060a' }}>
          <VideoGrid localStream={localStream} peers={peers} />
        </main>

        {/* ── Chat sidebar: TERMINAL_LOG ── */}
        {isChatOpen && (
          <aside style={{
            width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderLeft: '1px solid var(--border-neon)', background: 'rgba(8,8,14,0.98)',
          }}>
            <div style={{
              padding: '0.6rem 0.8rem', borderBottom: '1px solid var(--border-neon)', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}>
              <span style={{ color: 'var(--neon-green)', fontSize: '0.72rem' }}>&gt;</span>
              <h3 style={{ margin: 0, fontSize: '0.8rem', color: 'var(--neon-cyan)' }}>TERMINAL_LOG</h3>
            </div>

            <div style={{
              flex: 1, overflowY: 'auto', padding: '0.6rem', display: 'flex',
              flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem',
            }}>
              {messages.length === 0 && (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.72rem', textAlign: 'center', marginTop: '2rem' }}>
                  {'// messages broadcast to all peers'}
                </p>
              )}
              {messages.map(msg => (
                <div key={msg.id} style={{
                  padding: '0.35rem 0.5rem', borderRadius: '4px',
                  background: msg.isLocal ? 'rgba(0,240,255,0.06)' : 'rgba(255,255,255,0.02)',
                  borderLeft: msg.isLocal ? '2px solid var(--neon-cyan)' : '2px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.1rem' }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                      [{new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false })}]
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: msg.isLocal ? 'var(--neon-cyan)' : 'var(--neon-green)' }}>
                      {msg.senderName}:
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', wordBreak: 'break-word', lineHeight: 1.4, color: 'var(--text-primary)' }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={e => { e.preventDefault(); if (chatInput.trim()) { sendMessage(chatInput.trim()); setChatInput(''); } }}
              style={{
                padding: '0.5rem', borderTop: '1px solid var(--border-neon)',
                display: 'flex', gap: '0.4rem', flexShrink: 0,
              }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--neon-green)', fontSize: '0.78rem', pointerEvents: 'none',
                }}>&gt;</span>
                <input type="text" className="input-glass" value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Enter command..."
                  style={{ padding: '0.5rem 0.6rem 0.5rem 1.4rem', borderRadius: '4px', fontSize: '0.78rem' }} />
              </div>
              <button type="submit" className="btn btn-primary"
                style={{ borderRadius: '4px', padding: '0.5rem 0.7rem', fontSize: '0.72rem' }}>
                SEND
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* ── Controls footer ── */}
      <footer style={{
        padding: '0.45rem 1rem', borderTop: '1px solid var(--border-neon)',
        display: 'flex', justifyContent: 'center', gap: '0.35rem', alignItems: 'center',
        background: 'rgba(8,8,14,0.97)', backdropFilter: 'blur(12px)', flexShrink: 0,
        position: 'relative',
      }}>
        {/* Mic with audio ring */}
        <div style={{ position: 'relative' }}>
          {isMicOn && (
            <div style={{
              position: 'absolute', inset: '-2px', borderRadius: '6px',
              border: `1.5px solid rgba(0,240,255,${localAudioLevel > 0.1 ? 0.3 + localAudioLevel * 0.7 : 0})`,
              transition: 'border-color 0.15s', pointerEvents: 'none',
            }} />
          )}
          <button onClick={toggleMic} className={`btn ${isMicOn ? 'btn-secondary' : 'btn-danger'}`}
            style={{ borderRadius: '6px', padding: '0.55rem' }}>
            {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
        </div>

        <button onClick={toggleVideo} className={`btn ${isVideoOn ? 'btn-secondary' : 'btn-danger'}`}
          style={{ borderRadius: '6px', padding: '0.55rem' }}>
          {isVideoOn ? <VideoIcon size={18} /> : <VideoOff size={18} />}
        </button>

        <button onClick={() => setIsChatOpen(c => !c)}
          className={`btn ${isChatOpen ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '6px', padding: '0.55rem', position: 'relative' }}>
          <MessageSquare size={18} />
          {messages.length > 0 && !isChatOpen && (
            <span style={{
              position: 'absolute', top: '4px', right: '4px', width: '6px', height: '6px',
              background: 'var(--neon-cyan)', borderRadius: '50%',
              boxShadow: '0 0 6px var(--neon-cyan)',
            }} />
          )}
        </button>

        {/* Settings */}
        <div style={{ position: 'relative' }} ref={settingsRef}>
          <button onClick={() => { enumerateDevices(); setIsSettingsOpen(s => !s); }}
            className={`btn ${isSettingsOpen ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '6px', padding: '0.55rem' }}>
            <Settings size={18} />
          </button>

          {isSettingsOpen && (
            <div style={{
              position: 'absolute', bottom: '52px', left: '50%', transform: 'translateX(-50%)',
              width: '380px', background: 'rgba(10,10,16,0.98)', border: '1px solid var(--border-neon)',
              borderRadius: '10px', backdropFilter: 'blur(20px)',
              boxShadow: '0 0 30px rgba(0,240,255,0.1), 0 10px 40px rgba(0,0,0,0.6)', zIndex: 100,
              display: 'flex', overflow: 'hidden',
            }}>
              {/* Tabs */}
              <div style={{
                width: '90px', borderRight: '1px solid var(--border-neon)', padding: '0.5rem 0',
                display: 'flex', flexDirection: 'column', gap: '0.15rem', flexShrink: 0,
              }}>
                {['AUDIO', 'VIDEO', 'GENERAL'].map(tab => (
                  <button key={tab} onClick={() => setSettingsTab(tab)}
                    style={{
                      background: settingsTab === tab ? 'rgba(0,240,255,0.08)' : 'transparent',
                      border: 'none', borderLeft: settingsTab === tab ? '2px solid var(--neon-cyan)' : '2px solid transparent',
                      color: settingsTab === tab ? 'var(--neon-cyan)' : 'var(--text-dim)',
                      padding: '0.5rem 0.6rem', fontSize: '0.65rem', fontFamily: 'var(--font-mono)',
                      cursor: 'pointer', textAlign: 'left', fontWeight: settingsTab === tab ? 600 : 400,
                    }}>
                    {tab}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div style={{ flex: 1, padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '0.8rem', color: 'var(--neon-cyan)' }}>{settingsTab}_CONFIG</h4>
                  <ChevronUp size={14} style={{ color: 'var(--text-dim)' }} />
                </div>

                {settingsTab === 'AUDIO' && (
                  <>
                    <div>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.2rem', marginBottom: '0.25rem' }}>
                        <Mic size={11} /> INPUT_SOURCE
                      </label>
                      <select value={selectedMic} onChange={e => setSelectedMic(e.target.value)} style={selectStyle}>
                        {mics.map(m => <option key={m.deviceId} value={m.deviceId} style={{ background: '#0a0a0f' }}>{m.label || `MIC_${m.deviceId.slice(0,6)}`}</option>)}
                      </select>
                      {isMicOn && (
                        <div style={{ marginTop: '0.4rem' }}>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginBottom: '0.15rem' }}>SIGNAL_LEVEL</div>
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${localAudioLevel * 100}%`, background: 'linear-gradient(90deg, var(--neon-green), var(--neon-cyan))', borderRadius: '2px', transition: 'width 0.1s' }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.2rem', marginBottom: '0.25rem' }}>
                        <Volume2 size={11} /> OUTPUT_DEVICE
                      </label>
                      {speakers.length > 0 ? (
                        <select value={selectedSpeaker} onChange={e => setSelectedSpeaker(e.target.value)} style={selectStyle}>
                          {speakers.map(s => <option key={s.deviceId} value={s.deviceId} style={{ background: '#0a0a0f' }}>{s.label || `SPK_${s.deviceId.slice(0,6)}`}</option>)}
                        </select>
                      ) : (
                        <p style={{ fontSize: '0.68rem', color: 'var(--text-dim)', margin: 0 }}>{'// not supported in this browser'}</p>
                      )}
                    </div>
                    {/* System stats */}
                    <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.5rem', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Audio stream:</span><span style={{ color: 'var(--neon-green)' }}>OK</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Latency:</span><span style={{ color: 'var(--neon-cyan)' }}>~12ms</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Packet loss:</span><span style={{ color: 'var(--neon-green)' }}>0%</span>
                      </div>
                    </div>
                  </>
                )}

                {settingsTab === 'VIDEO' && (
                  <div>
                    <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.2rem', marginBottom: '0.25rem' }}>
                      <Monitor size={11} /> CAM_SOURCE
                    </label>
                    <select value={selectedCamera} onChange={e => setSelectedCamera(e.target.value)} style={selectStyle}>
                      {cameras.map(c => <option key={c.deviceId} value={c.deviceId} style={{ background: '#0a0a0f' }}>{c.label || `CAM_${c.deviceId.slice(0,6)}`}</option>)}
                    </select>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Resolution:</span><span style={{ color: 'var(--neon-cyan)' }}>720p</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Framerate:</span><span style={{ color: 'var(--neon-cyan)' }}>30fps</span>
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === 'GENERAL' && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span>Protocol:</span><span style={{ color: 'var(--neon-green)' }}>WebRTC_v3</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span>Encryption:</span><span style={{ color: 'var(--neon-green)' }}>DTLS-SRTP</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span>Signaling:</span><span style={{ color: 'var(--neon-cyan)' }}>Socket.IO</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Build:</span><span style={{ color: 'var(--text-dim)' }}>v1.2.a_build</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ width: '1px', height: '28px', background: 'var(--border-neon)', margin: '0 0.3rem' }} />

        <button onClick={handleLeave} className="btn btn-danger"
          style={{ borderRadius: '6px', padding: '0.55rem 0.9rem', fontSize: '0.72rem' }}>
          <LogOut size={16} /> DISCONNECT
        </button>
      </footer>
    </div>
  );
};

export default Room;
