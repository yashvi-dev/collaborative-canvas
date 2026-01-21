/**
 * WebSocket Server
 * Handles real-time communication for collaborative drawing
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Room management
const roomManager = new RoomManager();

// User management
const users = new Map(); // socketId -> user info

// Generate unique user ID
function generateUserId() {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generate random color for user
function generateUserColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Initialize user
  const userId = generateUserId();
  const userColor = generateUserColor();
  const username = `User ${userId.slice(-6)}`;
  
  users.set(socket.id, {
    id: userId,
    username,
    color: userColor,
    socketId: socket.id
  });

  // Join default room
  roomManager.joinRoom(socket.id, 'default');

  // Send user info to client
  socket.emit('user-info', {
    userId,
    username,
    color: userColor
  });

  // Send current canvas state
  const roomId = roomManager.getRoomId(socket.id);
  const drawingState = roomManager.getRoomState(roomId);
  if (drawingState) {
    socket.emit('canvas-state', drawingState.getState());
  }

  // Send list of online users
  broadcastUserList(roomId);

  // Handle drawing events
  socket.on('draw-start', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomId = roomManager.getRoomId(socket.id);
    const drawingState = roomManager.getRoomState(roomId);
    
    if (!drawingState) return;

    // Create new stroke
    const strokeId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const operation = {
      type: 'draw',
      userId: user.id,
      strokeId,
      tool: data.tool || 'brush',
      color: data.color || user.color,
      lineWidth: data.lineWidth || 5,
      point: data.point
    };

    const operationId = drawingState.addOperation(operation);

    // Broadcast to other users in room
    socket.to(roomId).emit('draw-start', {
      ...operation,
      operationId,
      userId: user.id,
      userColor: user.color
    });
  });

  socket.on('draw-move', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomId = roomManager.getRoomId(socket.id);
    const drawingState = roomManager.getRoomState(roomId);
    
    if (!drawingState) return;

    const operation = {
      type: 'draw',
      userId: user.id,
      strokeId: data.strokeId,
      tool: data.tool || 'brush',
      color: data.color || user.color,
      lineWidth: data.lineWidth || 5,
      point: data.point
    };

    drawingState.addOperation(operation);

    // Broadcast immediately to other users in room (no delay)
    socket.to(roomId).emit('draw-move', {
      ...operation,
      userId: user.id,
      userColor: user.color
    });
  });

  socket.on('draw-end', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomId = roomManager.getRoomId(socket.id);
    
    // Broadcast to other users in room
    socket.to(roomId).emit('draw-end', {
      userId: user.id,
      strokeId: data.strokeId
    });
  });

  socket.on('erase', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomId = roomManager.getRoomId(socket.id);
    const drawingState = roomManager.getRoomState(roomId);
    
    if (!drawingState) return;

    const operation = {
      type: 'erase',
      userId: user.id,
      point: data.point,
      radius: data.radius || 20
    };

    drawingState.addOperation(operation);

    // Broadcast to other users in room
    socket.to(roomId).emit('erase', {
      ...operation,
      userId: user.id
    });
  });

  socket.on('cursor-move', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomId = roomManager.getRoomId(socket.id);
    
    // Broadcast cursor position to other users
    socket.to(roomId).emit('cursor-move', {
      userId: user.id,
      username: user.username,
      color: user.color,
      x: data.x,
      y: data.y
    });
  });

  socket.on('undo', () => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomId = roomManager.getRoomId(socket.id);
    const drawingState = roomManager.getRoomState(roomId);
    
    if (!drawingState) return;

    const undoneOperation = drawingState.undo(user.id);

    if (undoneOperation) {
      // Broadcast undo to all users in room (including sender)
      io.to(roomId).emit('canvas-state', drawingState.getState());
      io.to(roomId).emit('undo', {
        userId: user.id,
        operationId: undoneOperation.id
      });
    }
  });

  socket.on('redo', () => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomId = roomManager.getRoomId(socket.id);
    const drawingState = roomManager.getRoomState(roomId);
    
    if (!drawingState) return;

    const redoneOperation = drawingState.redo(user.id);

    if (redoneOperation) {
      // Broadcast redo to all users in room (including sender)
      io.to(roomId).emit('canvas-state', drawingState.getState());
      io.to(roomId).emit('redo', {
        userId: user.id,
        operationId: redoneOperation.id
      });
    }
  });

  socket.on('clear', () => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomId = roomManager.getRoomId(socket.id);
    const drawingState = roomManager.getRoomState(roomId);
    
    if (!drawingState) return;

    const operation = {
      type: 'clear',
      userId: user.id
    };

    drawingState.addOperation(operation);
    drawingState.clear();

    // Broadcast clear to all users in room
    io.to(roomId).emit('clear');
    io.to(roomId).emit('canvas-state', drawingState.getState());
  });

  // Room management
  socket.on('join-room', (roomId) => {
    const oldRoomId = roomManager.getRoomId(socket.id);
    roomManager.joinRoom(socket.id, roomId);
    
    // Leave old room
    socket.leave(oldRoomId);
    socket.join(roomId);
    
    // Send new room state
    const drawingState = roomManager.getRoomState(roomId);
    if (drawingState) {
      socket.emit('canvas-state', drawingState.getState());
    }
    
    broadcastUserList(roomId);
    broadcastUserList(oldRoomId);
  });

  socket.on('get-rooms', () => {
    const rooms = roomManager.getAllRooms().map(roomId => 
      roomManager.getRoomInfo(roomId)
    );
    socket.emit('rooms-list', rooms);
  });

  // Save/Load
  socket.on('save-canvas', () => {
    const roomId = roomManager.getRoomId(socket.id);
    const drawingState = roomManager.getRoomState(roomId);
    
    if (drawingState) {
      const savedState = drawingState.exportState();
      socket.emit('canvas-saved', savedState);
    }
  });

  socket.on('load-canvas', (state) => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomId = roomManager.getRoomId(socket.id);
    const drawingState = roomManager.getRoomState(roomId);
    
    if (!drawingState) return;

    const operation = {
      type: 'load',
      userId: user.id
    };

    drawingState.addOperation(operation);
    drawingState.importState(state);

    // Broadcast loaded state to all users in room
    io.to(roomId).emit('canvas-state', drawingState.getState());
  });

  // Handle ping/pong for latency monitoring
  socket.on('ping', (timestamp) => {
    socket.emit('pong', timestamp);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    const roomId = roomManager.getRoomId(socket.id);
    roomManager.leaveRoom(socket.id);
    users.delete(socket.id);
    
    broadcastUserList(roomId);
  });

  /**
   * Broadcast user list to all users in a room
   */
  function broadcastUserList(roomId) {
    if (!roomId) return;
    
    const socketIds = roomManager.getRoomUsers(roomId);
    const userList = socketIds
      .map(sid => users.get(sid))
      .filter(user => user !== undefined)
      .map(user => ({
        id: user.id,
        username: user.username,
        color: user.color
      }));

    io.to(roomId).emit('users-list', userList);
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});