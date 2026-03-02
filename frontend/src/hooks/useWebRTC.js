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
  const [peers, setPeers] = useState({});
  const [messages, setMessages] = useState([]);

  const socketRef = useRef(null);
  const pcsRef = useRef({});
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef({});

  // Keep localStreamRef in sync so closures always see the latest stream
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // ── Helper: drain queued ICE candidates ─────────────────────────────
  const addPendingCandidates = async (peerId, pc) => {
    const queue = pendingCandidatesRef.current[peerId] || [];
    for (const c of queue) {
      try { await pc.addIceCandidate(c); } catch (e) { console.warn('[WebRTC] ICE add error:', e); }
    }
    pendingCandidatesRef.current[peerId] = [];
  };

  // ── Helper: create a new RTCPeerConnection ──────────────────────────
  const createPeerConnection = useCallback((peerId, socket) => {
    // If there's already a connection for this peer, close it first
    if (pcsRef.current[peerId]) {
      pcsRef.current[peerId].close();
      delete pcsRef.current[peerId];
    }

    console.log(`[WebRTC] Creating PeerConnection for ${peerId}`);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current[peerId] = pc;

    // Add our local tracks to the connection
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        console.log(`[WebRTC] Adding local ${track.kind} track to PC for ${peerId}`);
        pc.addTrack(track, stream);
      });
    } else {
      console.warn('[WebRTC] No local stream available when creating PC for', peerId);
    }

    // Forward ICE candidates to remote peer via signaling server
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('signal', { to: peerId, signal: { candidate } });
      }
    };

    // Log connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state ${peerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        console.warn(`[WebRTC] Connection to ${peerId} failed`);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state ${peerId}: ${pc.iceConnectionState}`);
    };

    // Receive remote media tracks
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received ${event.track.kind} track from ${peerId}`);
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

  // ── Main effect: socket connection + WebRTC signaling ─────────────────
  useEffect(() => {
    if (!roomId) return;

    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    console.log('[WebRTC] Connecting to signaling server for room:', roomId);

    // ── Helper: create offer and send to a peer ─────────────────────
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
        console.error('[WebRTC] Error creating offer:', err);
      }
    };

    // ── Socket connected → join room ────────────────────────────────
    socket.on('connect', () => {
      console.log('[WebRTC] Socket connected:', socket.id);
      socket.emit('join-room', roomId);
    });

    // ── A NEW peer joined the room ──────────────────────────────────
    // WE are already in the room, so WE initiate the call (send offer).
    socket.on('user-connected', (peerId) => {
      console.log(`[WebRTC] New user joined: ${peerId} → we send offer`);
      sendOfferTo(peerId);
    });

    // ── Server tells us who is already in the room ──────────────────
    // We are the NEW joiner. We do NOT send offers.
    // The existing peers will send us offers via 'user-connected'.
    // We just log this for awareness.
    socket.on('existing-peers', (peerIds) => {
      console.log(`[WebRTC] ${peerIds.length} peer(s) already in room:`, peerIds);
      // Do NOT call sendOfferTo here! The existing peers will call us.
    });

    // ── Handle incoming signals (offer / answer / ICE candidate) ────
    socket.on('signal', async ({ from, signal }) => {
      console.log(`[WebRTC] Signal from ${from}:`, signal.type || (signal.candidate ? 'ice-candidate' : '?'));

      if (signal.type === 'offer') {
        // Someone sent us an offer — create PC and reply with answer
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
          console.log(`[WebRTC] Sent answer to ${from}`);
        } catch (err) {
          console.error('[WebRTC] Error handling offer from', from, err);
        }

      } else if (signal.type === 'answer') {
        // Our offer was accepted — set remote description
        const pc = pcsRef.current[from];
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
            await addPendingCandidates(from, pc);
            console.log(`[WebRTC] Set answer from ${from}`);
          } catch (err) {
            console.error('[WebRTC] Error handling answer from', from, err);
          }
        } else {
          console.warn('[WebRTC] Got answer but no PC for', from);
        }

      } else if (signal.candidate) {
        // ICE candidate
        const pc = pcsRef.current[from];
        const candidate = new RTCIceCandidate(signal.candidate);
        if (pc && pc.remoteDescription) {
          try { await pc.addIceCandidate(candidate); } catch (e) { console.warn('[WebRTC] ICE error:', e); }
        } else {
          if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = [];
          pendingCandidatesRef.current[from].push(candidate);
        }
      }
    });

    // ── Peer disconnected ───────────────────────────────────────────
    socket.on('user-disconnected', (peerId) => {
      console.log('[WebRTC] User disconnected:', peerId);
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

    // ── Chat ────────────────────────────────────────────────────────
    socket.on('receive-chat-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    // ── Cleanup ─────────────────────────────────────────────────────
    return () => {
      console.log('[WebRTC] Cleaning up');
      socket.disconnect();
      Object.values(pcsRef.current).forEach((pc) => pc.close());
      pcsRef.current = {};
      pendingCandidatesRef.current = {};
      setPeers({});
    };
  }, [roomId]);

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
