/**
 * WebSocket Client
 * Handles all real-time communication with the server
 */

class WebSocketManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.userId = null;
    this.username = null;
    this.userColor = null;
    this.latency = 0;
    this.lastPingTime = null;
    
    this.connect();
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    // Connect to Socket.io server
    this.socket = io();

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.isConnected = true;
      this.startLatencyMonitoring();
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.isConnected = false;
    });

    // Receive user info
    this.socket.on('user-info', (data) => {
      this.userId = data.userId;
      this.username = data.username;
      this.userColor = data.color;
      
      if (this.onUserInfo) {
        this.onUserInfo(data);
      }
    });

    // Receive initial canvas state
    this.socket.on('canvas-state', (strokes) => {
      if (this.onCanvasState) {
        this.onCanvasState(strokes);
      }
    });

    // Receive draw events
    this.socket.on('draw-start', (data) => {
      if (this.onDrawStart) {
        this.onDrawStart(data);
      }
    });

    this.socket.on('draw-move', (data) => {
      if (this.onDrawMove) {
        this.onDrawMove(data);
      }
    });

    this.socket.on('draw-end', (data) => {
      if (this.onDrawEnd) {
        this.onDrawEnd(data);
      }
    });

    // Receive erase events
    this.socket.on('erase', (data) => {
      if (this.onErase) {
        this.onErase(data);
      }
    });

    // Receive cursor movements
    this.socket.on('cursor-move', (data) => {
      if (this.onCursorMove) {
        this.onCursorMove(data);
      }
    });

    // Receive undo/redo events
    this.socket.on('undo', (data) => {
      if (this.onUndo) {
        this.onUndo(data);
      }
    });

    this.socket.on('redo', (data) => {
      if (this.onRedo) {
        this.onRedo(data);
      }
    });

    // Receive clear event
    this.socket.on('clear', () => {
      if (this.onClear) {
        this.onClear();
      }
    });

    // Receive users list
    this.socket.on('users-list', (users) => {
      if (this.onUsersList) {
        this.onUsersList(users);
      }
    });

    // Receive rooms list
    this.socket.on('rooms-list', (rooms) => {
      if (this.onRoomsList) {
        this.onRoomsList(rooms);
      }
    });

    // Receive saved canvas
    this.socket.on('canvas-saved', (state) => {
      if (this.onCanvasSaved) {
        this.onCanvasSaved(state);
      }
    });
  }

  /**
   * Emit draw start event
   */
  emitDrawStart(data) {
    if (this.isConnected) {
      this.socket.emit('draw-start', data);
    }
  }

  /**
   * Emit draw move event
   */
  emitDrawMove(data) {
    if (this.isConnected) {
      this.socket.emit('draw-move', data);
    }
  }

  /**
   * Emit draw end event
   */
  emitDrawEnd(data) {
    if (this.isConnected) {
      this.socket.emit('draw-end', data);
    }
  }

  /**
   * Emit erase event
   */
  emitErase(data) {
    if (this.isConnected) {
      this.socket.emit('erase', data);
    }
  }

  /**
   * Emit cursor move event
   */
  emitCursorMove(data) {
    if (this.isConnected) {
      this.socket.emit('cursor-move', data);
    }
  }

  /**
   * Emit undo event
   */
  emitUndo() {
    if (this.isConnected) {
      this.socket.emit('undo');
    }
  }

  /**
   * Emit redo event
   */
  emitRedo() {
    if (this.isConnected) {
      this.socket.emit('redo');
    }
  }

  /**
   * Emit clear event
   */
  emitClear() {
    if (this.isConnected) {
      this.socket.emit('clear');
    }
  }

  /**
   * Emit join room event
   */
  emitJoinRoom(roomId) {
    if (this.isConnected) {
      this.socket.emit('join-room', roomId);
    }
  }

  /**
   * Request rooms list
   */
  requestRooms() {
    if (this.isConnected) {
      this.socket.emit('get-rooms');
    }
  }

  /**
   * Save canvas
   */
  saveCanvas() {
    if (this.isConnected) {
      this.socket.emit('save-canvas');
    }
  }

  /**
   * Load canvas
   */
  loadCanvas(state) {
    if (this.isConnected) {
      this.socket.emit('load-canvas', state);
    }
  }

  /**
   * Start latency monitoring
   */
  startLatencyMonitoring() {
    setInterval(() => {
      if (this.isConnected) {
        this.lastPingTime = Date.now();
        this.socket.emit('ping', this.lastPingTime);
      }
    }, 1000);

    // Handle pong
    this.socket.on('pong', (timestamp) => {
      if (this.lastPingTime) {
        this.latency = Date.now() - this.lastPingTime;
      }
    });
  }

  /**
   * Get current latency
   */
  getLatency() {
    return this.latency;
  }

  /**
   * Get user info
   */
  getUserInfo() {
    return {
      id: this.userId,
      username: this.username,
      color: this.userColor
    };
  }
}