const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Track which room each socket is in
const socketRoomMap = new Map();

io.on('connection', (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

  // ── Join a room ──────────────────────────────────────────────────────────
  socket.on('join-room', (roomId) => {
    // Leave any previous room first
    const prevRoom = socketRoomMap.get(socket.id);
    if (prevRoom) {
      socket.leave(prevRoom);
      socket.to(prevRoom).emit('user-disconnected', socket.id);
    }

    socket.join(roomId);
    socketRoomMap.set(socket.id, roomId);
    console.log(`[Server] ${socket.id} joined room ${roomId}`);

    // Tell all OTHER users already in the room that a new peer arrived
    socket.to(roomId).emit('user-connected', socket.id);

    // Give the joining user a list of all existing peers in the room
    const room = io.sockets.adapter.rooms.get(roomId);
    const existingPeers = room
      ? [...room].filter((id) => id !== socket.id)
      : [];
    socket.emit('existing-peers', existingPeers);
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

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomId = socketRoomMap.get(socket.id);
    if (roomId) {
      console.log(`[Server] ${socket.id} disconnected from room ${roomId}`);
      socket.to(roomId).emit('user-disconnected', socket.id);
      socketRoomMap.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`[Server] Signaling server running on port ${PORT}`);
});
