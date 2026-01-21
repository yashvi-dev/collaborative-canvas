# Architecture Documentation

## System Overview

The Collaborative Drawing Canvas is a real-time multi-user drawing application built with Node.js, Express, Socket.io, and vanilla JavaScript. The architecture is designed to handle simultaneous drawing operations from multiple clients while maintaining state consistency and providing smooth user experience.

## High-Level Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Client 1  │────────▶│   Server    │◀────────│   Client 2  │
│  (Browser)  │◀────────│  (Node.js)  │────────▶│  (Browser)  │
└─────────────┘         └─────────────┘         └─────────────┘
     │                         │                         │
     │ WebSocket               │                         │
     │ (Socket.io)             │                         │
     │                         │                         │
┌────▼────┐              ┌────▼────┐              ┌────▼────┐
│ Canvas  │              │  Rooms  │              │ Canvas  │
│ Manager │              │ Manager │              │ Manager │
└─────────┘              └─────────┘              └─────────┘
                                │
                         ┌──────▼──────┐
                         │ Drawing     │
                         │ State       │
                         └─────────────┘
```

## Data Flow

### Drawing Event Flow

```
1. User draws on canvas
   ↓
2. Canvas Manager captures mouse/touch events
   ↓
3. Events converted to drawing operations (points, tool, color, etc.)
   ↓
4. WebSocket Manager emits events to server
   ↓
5. Server receives event:
   - Adds operation to Drawing State
   - Broadcasts to all other users in room
   ↓
6. Other clients receive event
   ↓
7. Canvas Manager applies operation to local canvas
   ↓
8. Canvas updates in real-time
```

### State Synchronization Flow

```
Server maintains authoritative state:
- Drawing State (all strokes/operations)
- Operation History (for undo/redo)
- User Operations Map (tracks user actions)

When client connects:
1. Server sends current canvas state
2. Client loads state and redraws canvas

When operation occurs:
1. Server updates state
2. Server broadcasts new state/operation
3. All clients update accordingly
```

## Component Details

### Client-Side Architecture

#### 1. Canvas Manager (`canvas.js`)

**Responsibility**: Handles all canvas drawing operations and rendering.

**Key Features**:
- **Path Optimization**: Throttles point drawing (every N points) to reduce rendering overhead
- **Layer Management**: Uses 3 canvas layers:
  - `drawingCanvas`: Main drawing surface (z-index: 1)
  - `cursorCanvas`: Remote user cursors (z-index: 2)
  - `tempCanvas`: Temporary shapes while dragging (z-index: 3)
- **Efficient Redrawing**: Maintains local stroke map for quick redraws
- **Touch Support**: Full mobile touch event handling

**Data Structures**:
```javascript
localStrokes: Map<strokeId, stroke>  // Local stroke cache
remoteCursors: Map<userId, cursor>   // Remote cursor positions
```

#### 2. WebSocket Manager (`websocket.js`)

**Responsibility**: Manages all real-time communication with server.

**Key Features**:
- Socket.io client connection
- Event emission (draw, erase, undo, etc.)
- Event reception and callback handling
- Latency monitoring (ping/pong)

**Events Emitted**:
- `draw-start`, `draw-move`, `draw-end`
- `erase`
- `cursor-move`
- `undo`, `redo`
- `clear`
- `join-room`, `get-rooms`
- `save-canvas`, `load-canvas`

**Events Received**:
- `user-info`: User's own info
- `canvas-state`: Initial or updated canvas state
- `draw-start`, `draw-move`, `draw-end`: Remote drawing
- `erase`: Remote erase
- `cursor-move`: Remote cursor movement
- `undo`, `redo`: Global undo/redo notifications
- `clear`: Canvas cleared
- `users-list`: Updated user list
- `rooms-list`: Available rooms

#### 3. Main Application (`main.js`)

**Responsibility**: Coordinates all components and handles UI interactions.

**Key Features**:
- Initializes Canvas Manager and WebSocket Manager
- Handles tool selection, color picking, brush size
- Manages user interface updates
- Handles mouse/touch events and routes to appropriate handlers
- Performance metrics display

### Server-Side Architecture

#### 1. Server (`server.js`)

**Responsibility**: Main application server and WebSocket connection handler.

**Key Features**:
- Express server for static file serving
- Socket.io server for WebSocket connections
- User management (user IDs, colors, usernames)
- Room assignment and management
- Event routing and broadcasting

**User Management**:
- Generates unique user IDs: `user_${timestamp}_${random}`
- Assigns random colors from preset palette
- Tracks socket ID to user mapping

#### 2. Room Manager (`rooms.js`)

**Responsibility**: Manages multiple isolated drawing canvases.

**Key Features**:
- Room creation and deletion
- User join/leave handling
- Room state isolation (each room has its own DrawingState)
- Room metadata (user count, stroke count)

**Data Structures**:
```javascript
rooms: Map<roomId, DrawingState>           // Room to state mapping
socketToRoom: Map<socketId, roomId>        // Socket to room mapping
roomUsers: Map<roomId, Set<socketId>>      // Room to users mapping
```

#### 3. Drawing State (`drawing-state.js`)

**Responsibility**: Maintains canvas state and operation history.

**Key Features**:
- **Operation History**: Stores all drawing operations with unique IDs
- **Undo/Redo System**: Tracks undone operations per user
- **State Rebuilding**: Rebuilds canvas state from operation history
- **Conflict Resolution**: Applies operations in order received
- **Import/Export**: Serializes state for persistence

**Data Structures**:
```javascript
operationHistory: Array<Operation>         // All operations
currentHistoryIndex: number                // Current position in history
strokes: Array<Stroke>                     // Current canvas strokes
userOperations: Map<userId, Array<opId>>   // User's operations
```

**Operation Object Structure**:
```javascript
{
  id: "op_timestamp_counter",
  type: "draw" | "erase" | "clear",
  userId: "user_id",
  strokeId: "stroke_id",
  tool: "brush" | "eraser" | ...,
  color: "#000000",
  lineWidth: 5,
  point: {x, y},
  timestamp: Date.now(),
  undone: boolean,      // For undo tracking
  undoneBy: userId,     // Who undone this
  undoneAt: timestamp   // When undone
}
```

## WebSocket Protocol

### Client → Server Messages

#### Drawing Events
```javascript
// Start drawing
socket.emit('draw-start', {
  strokeId: string,
  tool: string,
  color: string,
  lineWidth: number,
  point: {x, y}
});

// Continue drawing
socket.emit('draw-move', {
  strokeId: string,
  tool: string,
  color: string,
  lineWidth: number,
  point: {x, y}
});

// End drawing
socket.emit('draw-end', {
  strokeId: string
});

// Erase
socket.emit('erase', {
  point: {x, y},
  radius: number
});

// Cursor movement
socket.emit('cursor-move', {
  x: number,
  y: number
});
```

#### Action Events
```javascript
// Undo
socket.emit('undo');

// Redo
socket.emit('redo');

// Clear canvas
socket.emit('clear');
```

#### Room Events
```javascript
// Join room
socket.emit('join-room', roomId: string);

// Get rooms list
socket.emit('get-rooms');
```

#### Persistence Events
```javascript
// Save canvas
socket.emit('save-canvas');

// Load canvas
socket.emit('load-canvas', state: Object);
```

### Server → Client Messages

#### State Events
```javascript
// User info
socket.emit('user-info', {
  userId: string,
  username: string,
  color: string
});

// Canvas state (full state)
socket.emit('canvas-state', strokes: Array);

// Drawing events (same structure as client→server)
socket.emit('draw-start', {...});
socket.emit('draw-move', {...});
socket.emit('draw-end', {...});
socket.emit('erase', {...});
socket.emit('cursor-move', {...});
```

#### Action Events
```javascript
// Undo notification
socket.emit('undo', {
  userId: string,
  operationId: string
});

// Redo notification
socket.emit('redo', {
  userId: string,
  operationId: string
});

// Clear notification
socket.emit('clear');
```

#### User/Room Events
```javascript
// Users list
socket.emit('users-list', [
  {
    id: string,
    username: string,
    color: string
  }
]);

// Rooms list
socket.emit('rooms-list', [
  {
    id: string,
    userCount: number,
    strokeCount: number
  }
]);
```

#### Persistence Events
```javascript
// Canvas saved
socket.emit('canvas-saved', state: Object);
```

## Undo/Redo Strategy

### Problem
Global undo/redo is challenging because:
1. User A draws a line
2. User B draws another line
3. User A wants to undo their line
4. Need to maintain consistency across all clients

### Solution

**Operation-Based History**:
- Every drawing operation is stored with unique ID
- Operations are never deleted, only marked as "undone"
- State is rebuilt by applying all non-undone operations

**User-Specific Undo/Redo**:
- Each user can only undo their own operations
- Server tracks which user created each operation
- Undo searches history backwards for user's operations

**State Rebuilding**:
```
1. User requests undo
2. Server finds last non-undone operation by that user
3. Marks operation as undone
4. Rebuilds entire state from scratch:
   - Clear all strokes
   - Apply all operations except undone ones
5. Broadcasts new state to all clients
6. Clients receive state and redraw
```

**Benefits**:
- Guaranteed consistency (server is source of truth)
- Works across all users (everyone sees same state)
- Handles conflicts gracefully (operations ordered by timestamp)
- Can redo undone operations

**Limitations**:
- Rebuilding state is O(n) where n = number of operations
- Very large histories may be slow (mitigated by operation count tracking)
- Text operations aren't fully integrated (drawn directly to canvas)

## Conflict Resolution

### Simultaneous Drawing
**Scenario**: Two users draw at the same time in overlapping areas.

**Solution**:
- Server receives operations in order (determined by network)
- Operations are applied sequentially
- Last operation "wins" visually (paints on top)
- No data loss - both strokes are preserved
- Client-side: local drawing provides immediate feedback

### Network Latency
**Scenario**: User A draws, but network is slow. User B's operation arrives first.

**Solution**:
1. **Client-Side Prediction**: User sees their drawing immediately (optimistic update)
2. **Server Ordering**: Server applies operations in order received
3. **State Sync**: Server broadcasts state updates
4. **Conflict Handling**: If local state differs from server, server state is authoritative

### Concurrent Undo
**Scenario**: User A undoes while User B is still drawing.

**Solution**:
- Undo is applied to operation history immediately
- Server rebuilds state (includes any new operations received)
- All clients receive updated state
- Drawing continues normally (new operations added to history)

## Performance Decisions

### Path Optimization
**Why**: Drawing creates many mouse/touch events (hundreds per second).

**Implementation**: Throttle point drawing - only send every Nth point to server.

**Trade-offs**:
- ✅ Reduces network traffic by ~90%
- ✅ Reduces server processing
- ✅ Smooth drawing still maintained (local drawing immediate)
- ⚠️ Slightly less precision (acceptable for freehand drawing)

### Layer Management
**Why**: Need to show cursors and temporary shapes without affecting main canvas.

**Implementation**: 3 separate canvas layers.

**Trade-offs**:
- ✅ Clean separation of concerns
- ✅ No interference between layers
- ✅ Efficient rendering (only affected layer redraws)
- ⚠️ Slightly more memory usage (minimal)

### Operation History
**Why**: Need undo/redo and state persistence.

**Implementation**: Store all operations in array, mark undone operations.

**Trade-offs**:
- ✅ Complete operation history
- ✅ Undo/redo works perfectly
- ✅ Can export/import state
- ⚠️ Memory grows with history size
- ⚠️ State rebuild is O(n)

**Optimization**: Could implement history compression or limit history size, but current approach prioritizes correctness.

### State Broadcasting Strategy
**Strategy**: Broadcast individual operations for real-time updates, full state for synchronization.

**Why**:
- **Individual Operations**: Low latency, incremental updates
- **Full State**: Ensures consistency after undo/redo/clear

**Trade-offs**:
- ✅ Real-time updates (operations)
- ✅ Consistency (full state)
- ⚠️ Mix of strategies (handled by event types)

## Scalability Considerations

### Current Limitations
- Single server instance (not horizontally scalable)
- In-memory state (lost on server restart)
- No database persistence

### Scaling Strategies

**For 100+ Concurrent Users**:
1. **Horizontal Scaling**: Use Redis for shared state across server instances
2. **Database**: Store room state in database (MongoDB, PostgreSQL)
3. **Load Balancing**: Use load balancer with sticky sessions
4. **Operation Batching**: Batch multiple operations into single message

**For 1000+ Concurrent Users**:
1. **Room Sharding**: Distribute rooms across server instances
2. **CDN**: Serve static assets via CDN
3. **WebSocket Optimization**: Use Socket.io rooms efficiently
4. **Database Optimization**: Index operations by room and timestamp
5. **Caching**: Cache frequently accessed room states

**For 10,000+ Concurrent Users**:
1. **Microservices**: Separate drawing, user management, persistence services
2. **Message Queue**: Use Redis Pub/Sub or RabbitMQ for event distribution
3. **Event Sourcing**: Store operations in event store, rebuild state as needed
4. **Database Sharding**: Shard by room ID
5. **Client Optimization**: Reduce client-side redraws, use WebWorkers

## Security Considerations

### Current State
- No authentication (anyone can join any room)
- No rate limiting
- No input validation beyond basic checks

### Recommended Enhancements
1. **Authentication**: JWT tokens, user accounts
2. **Authorization**: Room-level permissions
3. **Rate Limiting**: Limit operations per user per second
4. **Input Validation**: Sanitize all inputs (coordinates, colors, etc.)
5. **CORS**: Proper CORS configuration for production
6. **HTTPS**: Use HTTPS in production
7. **XSS Protection**: Sanitize user-provided text (usernames, text tool)

## Testing Strategy

### Unit Testing
- Drawing State operations (add, undo, redo)
- Room management (join, leave, create)
- Canvas operations (draw point, erase, shapes)

### Integration Testing
- WebSocket connection and disconnection
- Operation flow from client to server to other clients
- State synchronization across multiple clients

### Load Testing
- Multiple concurrent users drawing simultaneously
- Large number of operations
- Network latency simulation

### Manual Testing Checklist
- ✅ Multiple users drawing simultaneously
- ✅ Real-time synchronization
- ✅ Undo/redo with multiple users
- ✅ Room switching
- ✅ Save/load functionality
- ✅ Mobile touch support
- ✅ Browser compatibility

## Future Enhancements

1. **Image Import**: Allow users to upload background images
2. **Shape Fill**: Add fill option for rectangles and circles
3. **Layers**: Support multiple drawing layers
4. **Collaborative Cursors**: Show what tool other users are using
5. **Chat**: Add text chat to rooms
6. **History Playback**: Replay drawing history
7. **Export Formats**: Export to PNG, SVG, PDF
8. **AI Features**: Shape recognition, auto-smoothing
9. **Permissions**: Admin users, read-only mode
10. **Analytics**: Track drawing statistics