# Collaborative Drawing Canvas

A real-time multi-user drawing application where multiple people can draw simultaneously on the same canvas with live synchronization.

## Quick Start
**Production Ready – Deployed Live**

🔗 Live Demo: https://collaborative-canvas-ok02.onrender.com

[Watch the demo](https://www.loom.com/share/872f00a5ca2a49e8930fe28456942ca0)]
(https://www.loom.com/share/872f00a5ca2a49e8930fe28456942ca0)

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone or download this repository
2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

The application will automatically start and you can begin drawing!

##  Testing with Multiple Users

### Method 1: Multiple Browser Windows/Tabs
1. Start the server: `npm start`
2. Open `http://localhost:3000` in multiple browser windows/tabs
3. Each window will be treated as a separate user
4. Draw in one window and watch it appear in real-time in others

### Method 2: Multiple Devices on Same Network
1. Start the server: `npm start`
2. Find your local IP address:
   - Mac/Linux: `ifconfig | grep "inet "`
   - Windows: `ipconfig`
3. On other devices, open `http://YOUR_IP:3000` in a browser
4. All devices will see each other's drawings in real-time

### Method 3: Deploy to Cloud (Recommended for Testing)
1. Deploy to Heroku, Vercel, or similar platform
2. Share the URL with multiple people
3. Everyone can draw simultaneously

##  Features

### Core Features
-  **Drawing Tools**: Brush, eraser, rectangle, circle, line, and text
-  **Real-time Synchronization**: See other users' drawings as they draw
-  **User Indicators**: See where other users are currently drawing with cursor positions
-  **Conflict Resolution**: Handles simultaneous drawing gracefully
-  **Global Undo/Redo**: Undo/redo works across all users (each user can undo their own actions)
-  **User Management**: See who's online and their assigned colors

### Bonus Features
-  **Mobile Touch Support**: Full touch support for drawing on mobile devices
-  **Room System**: Create and join multiple isolated drawing canvases
-  **Drawing Persistence**: Save and load canvas drawings as JSON files
-  **Performance Metrics**: Real-time FPS counter, latency display, and stroke count
-  **Creative Tools**: Shapes (rectangle, circle, line) and text tool

## 🎮 Usage

### Drawing Tools
- **Brush**: Click and drag to draw freeform lines
- **Eraser**: Click and drag to erase parts of the drawing
- **Rectangle**: Click and drag to draw rectangles
- **Circle**: Click and drag to draw circles (radius from starting point)
- **Line**: Click and drag to draw straight lines
- **Text**: Click on canvas, enter text in modal, click "Add Text"

### Color Selection
- Use the color picker to choose any color
- Click preset color swatches for quick selection
- Each user gets a unique color assigned automatically

### Brush Size
- Adjust the slider to change brush/eraser size (1-50px)

### Actions
- **Undo**: Undo your last drawing action (only your own actions)
- **Redo**: Redo your last undone action
- **Clear**: Clear the entire canvas (affects all users)

### Save/Load
- **Save**: Download the current canvas as a JSON file
- **Load**: Upload a previously saved canvas JSON file

### Rooms
- Select a room from the dropdown to join
- Click "+ New Room" to create a new isolated canvas
- Each room has its own drawing state

## Technical Details

### Technologies Used
- **Frontend**: Vanilla JavaScript, HTML5 Canvas API
- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.io (WebSocket library)
- **State Management**: Custom operation history system

### Key Implementation Details

1. **Path Optimization**: Drawing points are throttled to reduce network traffic while maintaining smooth drawing
2. **Layer Management**: Multiple canvas layers used for drawing, cursors, and temporary shapes
3. **Operation History**: All drawing operations are stored with unique IDs for undo/redo
4. **Conflict Resolution**: Server-side state management ensures consistency across clients
5. **Efficient Redrawing**: Canvas state is rebuilt from operation history when needed



## 📝 License

MIT License - feel free to use this project for learning or personal projects.
