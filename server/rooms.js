/**
 * Room Management
 * Handles multiple isolated drawing canvases (rooms)
 */

const DrawingState = require('./drawing-state');

class RoomManager {
  constructor() {
    // Map of room ID to DrawingState instance
    this.rooms = new Map();
    
    // Map of socket ID to room ID
    this.socketToRoom = new Map();
    
    // Map of room ID to set of socket IDs (users in room)
    this.roomUsers = new Map();
    
    // Default room ID
    this.defaultRoomId = 'default';
    
    // Initialize default room
    this.createRoom(this.defaultRoomId);
  }

  /**
   * Create a new room
   * @param {string} roomId - Unique room identifier
   * @returns {boolean} - Success status
   */
  createRoom(roomId) {
    if (this.rooms.has(roomId)) {
      return false; // Room already exists
    }

    this.rooms.set(roomId, new DrawingState());
    this.roomUsers.set(roomId, new Set());
    return true;
  }

  /**
   * Join a room
   * @param {string} socketId - Socket ID of the user
   * @param {string} roomId - Room ID to join
   * @returns {boolean} - Success status
   */
  joinRoom(socketId, roomId) {
    // Leave current room if any
    this.leaveRoom(socketId);

    // Create room if it doesn't exist
    if (!this.rooms.has(roomId)) {
      this.createRoom(roomId);
    }

    // Join room
    this.socketToRoom.set(socketId, roomId);
    const users = this.roomUsers.get(roomId);
    if (users) {
      users.add(socketId);
    }

    return true;
  }

  /**
   * Leave current room
   * @param {string} socketId - Socket ID of the user
   */
  leaveRoom(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    if (roomId) {
      const users = this.roomUsers.get(roomId);
      if (users) {
        users.delete(socketId);
      }
      this.socketToRoom.delete(socketId);
    }
  }

  /**
   * Get room ID for a socket
   * @param {string} socketId - Socket ID
   * @returns {string|null} - Room ID or null
   */
  getRoomId(socketId) {
    return this.socketToRoom.get(socketId) || this.defaultRoomId;
  }

  /**
   * Get drawing state for a room
   * @param {string} roomId - Room ID
   * @returns {DrawingState|null} - Drawing state instance or null
   */
  getRoomState(roomId) {
    return this.rooms.get(roomId) || null;
  }

  /**
   * Get users in a room
   * @param {string} roomId - Room ID
   * @returns {Array} - Array of socket IDs
   */
  getRoomUsers(roomId) {
    const users = this.roomUsers.get(roomId);
    return users ? Array.from(users) : [];
  }

  /**
   * Get all rooms
   * @returns {Array} - Array of room IDs
   */
  getAllRooms() {
    return Array.from(this.rooms.keys());
  }

  /**
   * Delete a room (if empty)
   * @param {string} roomId - Room ID
   * @returns {boolean} - Success status
   */
  deleteRoom(roomId) {
    // Don't delete default room
    if (roomId === this.defaultRoomId) {
      return false;
    }

    const users = this.roomUsers.get(roomId);
    if (users && users.size === 0) {
      this.rooms.delete(roomId);
      this.roomUsers.delete(roomId);
      return true;
    }

    return false;
  }

  /**
   * Get room info
   * @param {string} roomId - Room ID
   * @returns {Object|null} - Room info or null
   */
  getRoomInfo(roomId) {
    if (!this.rooms.has(roomId)) {
      return null;
    }

    return {
      id: roomId,
      userCount: this.getRoomUsers(roomId).length,
      strokeCount: this.rooms.get(roomId).strokes.length
    };
  }
}

module.exports = RoomManager;