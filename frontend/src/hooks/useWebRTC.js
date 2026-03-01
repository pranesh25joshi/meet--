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

const useWebRTC = (roomId, localStream) => {
  const [peers, setPeers] = useState({});       // { socketId: MediaStream }
  const [messages, setMessages] = useState([]);

  // Stable refs — these never change between renders
  const socketRef = useRef(null);
  const pcsRef = useRef({});                    // { socketId: RTCPeerConnection }
  const localStreamRef = useRef(null);          // always up-to-date stream
  const pendingCandidatesRef = useRef({});      // queued ICE candidates per peer

  // Keep localStreamRef in sync so closures always see the latest stream
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // ── Helpers ────────────────────────────────────────────────────────────

  const addPendingCandidates = async (peerId, pc) => {
    const queue = pendingCandidatesRef.current[peerId] || [];
    for (const candidate of queue) {
      try { await pc.addIceCandidate(candidate); } catch (_) {}
    }
    pendingCandidatesRef.current[peerId] = [];
  };

  const createPeerConnection = useCallback((peerId, socket) => {
    if (pcsRef.current[peerId]) {
      pcsRef.current[peerId].close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current[peerId] = pc;

    // Add our local tracks
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    // Send ICE candidates to peer via server
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('signal', { to: peerId, signal: { candidate } });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with ${peerId}: ${pc.iceConnectionState}`);
    };

    // Receive remote stream
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Got track from ${peerId}: ${event.track.kind}`);
      setPeers((prev) => {
        const existing = prev[peerId];
        if (existing) {
          // Prevent adding duplicate tracks
          if (!existing.getTrackById(event.track.id)) {
            existing.addTrack(event.track);
          }
          return { ...prev };
        }
        // First track — prefer the streams array, fallback to manual
        const remote = (event.streams && event.streams[0])
          ? event.streams[0]
          : new MediaStream([event.track]);
        return { ...prev, [peerId]: remote };
      });
    };

    return pc;
  }, []);

  // ── Main effect: runs once when roomId becomes non-null ───────────────
  useEffect(() => {
    if (!roomId) return;

    // Connect socket
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    console.log('[WebRTC] Connecting socket for room:', roomId);

    // ── Initiate call to a peer (we are the existing user) ────────────
    const initCall = async (peerId) => {
      console.log('[WebRTC] Initiating call to', peerId);
      const pc = createPeerConnection(peerId, socket);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // Send localDescription directly — it has { type, sdp } as plain strings
      socket.emit('signal', { to: peerId, signal: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    };

    const joinRoom = () => {
      socket.emit('join-room', roomId);
    };

    socket.on('connect', () => {
      console.log('[WebRTC] Socket connected:', socket.id);
      joinRoom();
    });

    // ── New peer joined: we call them ─────────────────────────────────
    socket.on('user-connected', (peerId) => {
      console.log('[WebRTC] user-connected:', peerId);
      initCall(peerId);
    });

    // ── Server sends us the list of peers already in the room ─────────
    socket.on('existing-peers', (peerIds) => {
      console.log('[WebRTC] existing-peers:', peerIds);
      peerIds.forEach((peerId) => initCall(peerId));
    });

    // ── Handle all incoming signals ───────────────────────────────────
    socket.on('signal', async ({ from, signal }) => {
      console.log(`[WebRTC] Signal from ${from}:`, signal.type || (signal.candidate ? 'candidate' : '?'));

      if (signal.type === 'offer') {
        const pc = createPeerConnection(from, socket);
        await pc.setRemoteDescription(new RTCSessionDescription({ type: signal.type, sdp: signal.sdp }));
        await addPendingCandidates(from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: from, signal: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });

      } else if (signal.type === 'answer') {
        const pc = pcsRef.current[from];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: signal.type, sdp: signal.sdp }));
          await addPendingCandidates(from, pc);
        }

      } else if (signal.candidate) {
        const pc = pcsRef.current[from];
        const candidate = new RTCIceCandidate(signal.candidate);
        if (pc && pc.remoteDescription) {
          try { await pc.addIceCandidate(candidate); } catch (_) {}
        } else {
          // Queue until remote description is set
          if (!pendingCandidatesRef.current[from]) {
            pendingCandidatesRef.current[from] = [];
          }
          pendingCandidatesRef.current[from].push(candidate);
        }
      }
    });

    // ── Peer disconnected ─────────────────────────────────────────────
    socket.on('user-disconnected', (peerId) => {
      console.log('[WebRTC] user-disconnected:', peerId);
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

    // ── Chat messages ─────────────────────────────────────────────────
    socket.on('receive-chat-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    // ── Cleanup on unmount ────────────────────────────────────────────
    return () => {
      console.log('[WebRTC] Cleaning up socket & peer connections');
      socket.disconnect();
      Object.values(pcsRef.current).forEach((pc) => pc.close());
      pcsRef.current = {};
      pendingCandidatesRef.current = {};
      setPeers({});
    };
  }, [roomId]); // ← ONLY depends on roomId, not localStream

  // ── Send chat message ─────────────────────────────────────────────────
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
