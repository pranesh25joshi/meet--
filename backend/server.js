require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
// For production, you should restrict the origin to your frontend's URL
// for better security, e.g., origin: 'https://your-frontend.vercel.app'
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

// Track which room each socket is in
const socketRoomMap = new Map();
// Track who is host per room (first joiner, re-assigned on disconnect)
const roomHostMap = new Map();

const getRoomMembers = (roomId) => {
  const room = io.sockets.adapter.rooms.get(roomId);
  return room ? [...room] : [];
};

const emitRoomState = (roomId) => {
  const members = getRoomMembers(roomId);
  const hostId = roomHostMap.get(roomId) || null;
  io.to(roomId).emit('room-state', { roomId, members, hostId });
};

io.on('connection', (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

  // ── Join a room ──────────────────────────────────────────────────────────
  socket.on('join-room', (roomId) => {
    // Leave any previous room first
    const prevRoom = socketRoomMap.get(socket.id);
    if (prevRoom) {
      socket.leave(prevRoom);
      socket.to(prevRoom).emit('user-disconnected', socket.id);
      const prevMembers = getRoomMembers(prevRoom);
      if (roomHostMap.get(prevRoom) === socket.id) {
        const nextHost = prevMembers[0] || null;
        if (nextHost) roomHostMap.set(prevRoom, nextHost);
        else roomHostMap.delete(prevRoom);
      }
      emitRoomState(prevRoom);
    }

    socket.join(roomId);
    socketRoomMap.set(socket.id, roomId);
    console.log(`[Server] ${socket.id} joined room ${roomId}`);

    // Assign host if none exists yet
    if (!roomHostMap.has(roomId)) {
      roomHostMap.set(roomId, socket.id);
    }

    // Tell all OTHER users already in the room that a new peer arrived
    socket.to(roomId).emit('user-connected', socket.id);

    // Give the joining user a list of all existing peers in the room
    const room = io.sockets.adapter.rooms.get(roomId);
    const existingPeers = room
      ? [...room].filter((id) => id !== socket.id)
      : [];
    socket.emit('existing-peers', existingPeers);

    emitRoomState(roomId);
  });

  // ── WebRTC Signaling ─────────────────────────────────────────────────────
  // Relay signal directly to the intended peer
  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { from: socket.id, signal });
  });

  // ── Chat ─────────────────────────────────────────────────────────────────
  socket.on('send-chat-message', (roomId, messageData) => {
    socket.to(roomId).emit('receive-chat-message', messageData);
  });

  // ── Moderation (host-controlled) ─────────────────────────────────────────
  socket.on('moderation-action', ({ roomId, to, action }) => {
    const hostId = roomHostMap.get(roomId);
    if (!hostId || hostId !== socket.id) return;

    if (to === 'all') {
      io.to(roomId).emit('moderation-action', { from: socket.id, action });
      return;
    }
    if (typeof to === 'string' && to.length > 0) {
      io.to(to).emit('moderation-action', { from: socket.id, action, roomId });
    }
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomId = socketRoomMap.get(socket.id);
    if (roomId) {
      console.log(`[Server] ${socket.id} disconnected from room ${roomId}`);
      socket.to(roomId).emit('user-disconnected', socket.id);
      socketRoomMap.delete(socket.id);

      const members = getRoomMembers(roomId).filter((id) => id !== socket.id);
      if (roomHostMap.get(roomId) === socket.id) {
        const nextHost = members[0] || null;
        if (nextHost) roomHostMap.set(roomId, nextHost);
        else roomHostMap.delete(roomId);
      }
      emitRoomState(roomId);
    }
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`[Server] Signaling server running on port ${PORT}`);
});
