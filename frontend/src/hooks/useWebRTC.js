import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001';

const ensureMediaTransceivers = (pc) => {
  const transceivers = pc.getTransceivers();
  const hasAudio = transceivers.some((t) => t.receiver?.track?.kind === 'audio');
  const hasVideo = transceivers.some((t) => t.receiver?.track?.kind === 'video');

  // Ensure both m-lines exist even if we have no local tracks (or audio-only).
  if (!hasAudio) pc.addTransceiver('audio', { direction: 'sendrecv' });
  if (!hasVideo) pc.addTransceiver('video', { direction: 'sendrecv' });
};

const useWebRTC = (roomId, localStream) => {
  const [peers, setPeers] = useState({});
  const [messages, setMessages] = useState([]);

  const socketRef = useRef(null);
  const pcsRef = useRef({});
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef({});

  // Keep localStreamRef in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // ── When localStream changes mid-call, replace tracks in ALL existing PCs ──
  useEffect(() => {
    if (!localStream) return;
    const pcs = pcsRef.current;
    Object.entries(pcs).forEach(([peerId, pc]) => {
      const transceivers = pc.getTransceivers();
      const findSenderForKind = (kind) => {
        // Prefer the sender associated with the transceiver for that kind,
        // even when sender.track is currently null.
        const t = transceivers.find((x) => x.receiver?.track?.kind === kind);
        return t?.sender || pc.getSenders().find((s) => s.track?.kind === kind) || null;
      };

      localStream.getTracks().forEach((newTrack) => {
        const sender = findSenderForKind(newTrack.kind);
        if (sender) {
          console.log(`[WebRTC] Replacing ${newTrack.kind} track in PC for ${peerId}`);
          sender.replaceTrack(newTrack).catch(err =>
            console.warn('[WebRTC] replaceTrack error:', err)
          );
        } else {
          // No sender for this kind yet — add it
          console.log(`[WebRTC] Adding new ${newTrack.kind} track to PC for ${peerId}`);
          pc.addTrack(newTrack, localStream);
        }
      });
    });
  }, [localStream]);

  // ── Helper: drain queued ICE candidates ──────────────────────────────
  const addPendingCandidates = async (peerId, pc) => {
    const queue = pendingCandidatesRef.current[peerId] || [];
    for (const c of queue) {
      try { await pc.addIceCandidate(c); } catch (e) { console.warn('[WebRTC] ICE add:', e); }
    }
    pendingCandidatesRef.current[peerId] = [];
  };

  // ── Helper: create a new RTCPeerConnection ───────────────────────────
  const createPeerConnection = useCallback((peerId, socket) => {
    if (pcsRef.current[peerId]) {
      pcsRef.current[peerId].close();
      delete pcsRef.current[peerId];
    }

    console.log(`[WebRTC] Creating PC for ${peerId}`);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current[peerId] = pc;

    // Create audio+video m-lines up front so:
    // - audio-only users can still RECEIVE video from others
    // - users who deny devices can still participate and receive media
    ensureMediaTransceivers(pc);

    // Add local tracks
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        console.log(`[WebRTC] Adding local ${track.kind} track for ${peerId}`);
        try {
          pc.addTrack(track, stream);
        } catch (err) {
          console.warn('[WebRTC] addTrack error:', err);
        }
      });
    } else {
      console.warn('[WebRTC] No local stream when creating PC for', peerId);
    }

    // ICE candidates → relay to peer
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('signal', { to: peerId, signal: { candidate } });
      }
    };

    // Connection state logging
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Conn state ${peerId}: ${pc.connectionState}`);
    };
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state ${peerId}: ${pc.iceConnectionState}`);
    };

    // Receive remote tracks
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Got ${event.track.kind} track from ${peerId}`);
      setPeers((prev) => {
        const existing = prev[peerId];
        if (existing) {
          if (!existing.getTrackById(event.track.id)) {
            existing.addTrack(event.track);
          }
          return { ...prev };
        }
        const remote = (event.streams && event.streams[0])
          ? event.streams[0]
          : new MediaStream([event.track]);
        return { ...prev, [peerId]: remote };
      });
    };

    return pc;
  }, []);

  // ── Main effect: socket + signaling (only depends on roomId) ──────────
  useEffect(() => {
    if (!roomId) return;

    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;
    console.log('[WebRTC] Connecting for room:', roomId);
    const offerTimeouts = [];

    // ── Create offer and send ─────────────────────────────────────────
    const sendOfferTo = async (peerId) => {
      console.log(`[WebRTC] Sending offer to ${peerId}`);
      const pc = createPeerConnection(peerId, socket);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', {
          to: peerId,
          signal: { type: 'offer', sdp: pc.localDescription.sdp },
        });
      } catch (err) {
        console.error('[WebRTC] Offer error:', err);
      }
    };

    // ── Socket connected → join room ──────────────────────────────────
    socket.on('connect', () => {
      console.log('[WebRTC] Socket connected:', socket.id);
      socket.emit('join-room', roomId);
    });

    // ── A NEW peer joined → we (existing user) send them an offer ─────
    // Add a small delay to ensure the new joiner has set up their listeners
    socket.on('user-connected', (peerId) => {
      console.log(`[WebRTC] New user: ${peerId} → sending offer in 500ms`);
      const t = setTimeout(() => sendOfferTo(peerId), 500);
      offerTimeouts.push(t);
    });

    // ── Server tells us who is already in the room ────────────────────
    // We are the NEW joiner. Existing peers will call us via user-connected.
    socket.on('existing-peers', (peerIds) => {
      console.log(`[WebRTC] ${peerIds.length} existing peer(s):`, peerIds);
      // Don't initiate — wait for their offers
    });

    // ── Handle incoming signals ───────────────────────────────────────
    socket.on('signal', async ({ from, signal }) => {
      console.log(`[WebRTC] Signal from ${from}:`, signal.type || (signal.candidate ? 'ice' : '?'));

      if (signal.type === 'offer') {
        const pc = createPeerConnection(from, socket);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
          await addPendingCandidates(from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', {
            to: from,
            signal: { type: 'answer', sdp: pc.localDescription.sdp },
          });
          console.log(`[WebRTC] Answered ${from}`);
        } catch (err) {
          console.error('[WebRTC] Offer handler error:', err);
        }

      } else if (signal.type === 'answer') {
        const pc = pcsRef.current[from];
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
            await addPendingCandidates(from, pc);
            console.log(`[WebRTC] Answer from ${from} applied`);
          } catch (err) {
            console.error('[WebRTC] Answer handler error:', err);
          }
        } else {
          console.warn('[WebRTC] Got answer but no PC for', from);
        }

      } else if (signal.candidate) {
        const pc = pcsRef.current[from];
        const candidate = new RTCIceCandidate(signal.candidate);
        if (pc && pc.remoteDescription) {
          try { await pc.addIceCandidate(candidate); } catch (e) { console.warn('[WebRTC] ICE:', e); }
        } else {
          if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = [];
          pendingCandidatesRef.current[from].push(candidate);
        }
      }
    });

    // ── Peer disconnected ─────────────────────────────────────────────
    socket.on('user-disconnected', (peerId) => {
      console.log('[WebRTC] Disconnected:', peerId);
      if (pcsRef.current[peerId]) {
        pcsRef.current[peerId].close();
        delete pcsRef.current[peerId];
      }
      delete pendingCandidatesRef.current[peerId];
      setPeers((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    });

    // ── Chat ──────────────────────────────────────────────────────────
    socket.on('receive-chat-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    // ── Cleanup ───────────────────────────────────────────────────────
    return () => {
      console.log('[WebRTC] Cleanup');
      offerTimeouts.forEach((t) => clearTimeout(t));
      socket.disconnect();
      Object.values(pcsRef.current).forEach((pc) => pc.close());
      pcsRef.current = {};
      pendingCandidatesRef.current = {};
      setPeers({});
    };
  }, [roomId, createPeerConnection]);

  // ── Send chat message ───────────────────────────────────────────────
  const sendMessage = (text) => {
    const socket = socketRef.current;
    if (!socket) return;
    const msg = {
      id: Math.random().toString(36).substr(2, 9),
      text,
      senderName: `Peer-${socket.id.substring(0, 4)}`,
      timestamp: Date.now(),
    };
    socket.emit('send-chat-message', roomId, msg);
    setMessages((prev) => [...prev, { ...msg, senderName: 'You', isLocal: true }]);
  };

  return { peers, messages, sendMessage };
};

export default useWebRTC;
