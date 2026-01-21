/**
 * Main Application
 * Coordinates canvas, WebSocket, and UI interactions
 */

// Initialize components
const drawingCanvas = document.getElementById('drawingCanvas');
const cursorCanvas = document.getElementById('cursorCanvas');
const tempCanvas = document.getElementById('tempCanvas');

const canvasManager = new CanvasManager(drawingCanvas, cursorCanvas, tempCanvas);
const wsManager = new WebSocketManager();

// UI Elements
const toolButtons = document.querySelectorAll('.tool-btn');
const colorInput = document.getElementById('colorInput');
const colorPresets = document.querySelectorAll('.color-preset');
const brushSize = document.getElementById('brushSize');
const brushSizeValue = document.getElementById('brushSizeValue');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearBtn = document.getElementById('clearBtn');
const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const loadInput = document.getElementById('loadInput');
const userCount = document.getElementById('userCount');
const usersList = document.getElementById('usersList');
const roomSelect = document.getElementById('roomSelect');
const newRoomBtn = document.getElementById('newRoomBtn');
const fpsDisplay = document.getElementById('fps');
const latencyDisplay = document.getElementById('latency');
const strokeCountDisplay = document.getElementById('strokeCount');
const canvasSizeDisplay = document.getElementById('canvasSize');

// Text input modal
const textModal = document.getElementById('textModal');
const textInput = document.getElementById('textInput');
const textConfirmBtn = document.getElementById('textConfirmBtn');
const textCancelBtn = document.getElementById('textCancelBtn');

// Room modal
const roomModal = document.getElementById('roomModal');
const newRoomName = document.getElementById('newRoomName');
const roomConfirmBtn = document.getElementById('roomConfirmBtn');
const roomCancelBtn = document.getElementById('roomCancelBtn');

// Drawing state
let isMouseDown = false;
let isTouchActive = false;

/**
 * WebSocket Event Handlers
 */
wsManager.onUserInfo = (data) => {
  canvasManager.setColor(data.color);
  colorInput.value = data.color;
  console.log('User info received:', data);
};

wsManager.onCanvasState = (strokes) => {
  // Load state and redraw immediately
  canvasManager.loadCanvasState(strokes);
  updateStrokeCount();
  console.log('Canvas state loaded:', strokes.length, 'strokes');
};

wsManager.onDrawStart = (data) => {
  // Ignore own draw events
  if (data.userId === wsManager.userId) return;
  canvasManager.handleRemoteDrawStart(data);
};

wsManager.onDrawMove = (data) => {
  if (data.userId === wsManager.userId) return;
  canvasManager.handleRemoteDrawMove(data);
};

wsManager.onDrawEnd = (data) => {
  if (data.userId === wsManager.userId) return;
  canvasManager.handleRemoteDrawEnd(data);
};

wsManager.onErase = (data) => {
  if (data.userId === wsManager.userId) return;
  canvasManager.handleRemoteErase(data);
};

wsManager.onCursorMove = (data) => {
  if (data.userId === wsManager.userId) return;
  canvasManager.handleRemoteCursorMove(data);
};

wsManager.onUndo = () => {
  // Server sends new canvas state after undo
  // Just need to update display
};

wsManager.onRedo = () => {
  // Server sends new canvas state after redo
};

wsManager.onClear = () => {
  canvasManager.clearCanvas();
  updateStrokeCount();
};

wsManager.onUsersList = (users) => {
  userCount.textContent = `Users: ${users.length}`;
  
  usersList.innerHTML = '';
  users.forEach(user => {
    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    userItem.innerHTML = `
      <div class="user-color-indicator" style="background-color: ${user.color}"></div>
      <span class="user-name">${user.username}</span>
    `;
    usersList.appendChild(userItem);
  });
};

wsManager.onRoomsList = (rooms) => {
  roomSelect.innerHTML = '';
  rooms.forEach(room => {
    const option = document.createElement('option');
    option.value = room.id;
    option.textContent = `${room.id} (${room.userCount} users)`;
    roomSelect.appendChild(option);
  });
};

wsManager.onCanvasSaved = (state) => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `canvas_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Tool Selection
 */
toolButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    toolButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    canvasManager.setTool(btn.dataset.tool);
  });
});

/**
 * Color Selection
 */
colorInput.addEventListener('input', (e) => {
  canvasManager.setColor(e.target.value);
});

colorPresets.forEach(preset => {
  preset.addEventListener('click', () => {
    const color = preset.dataset.color;
    colorInput.value = color;
    canvasManager.setColor(color);
  });
});

/**
 * Brush Size
 */
brushSize.addEventListener('input', (e) => {
  const size = parseInt(e.target.value);
  brushSizeValue.textContent = size;
  canvasManager.setLineWidth(size);
});

/**
 * Action Buttons
 */
undoBtn.addEventListener('click', () => {
  wsManager.emitUndo();
});

redoBtn.addEventListener('click', () => {
  wsManager.emitRedo();
});

clearBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to clear the canvas?')) {
    wsManager.emitClear();
  }
});

saveBtn.addEventListener('click', () => {
  wsManager.saveCanvas();
});

loadBtn.addEventListener('click', () => {
  loadInput.click();
});

loadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const state = JSON.parse(event.target.result);
        wsManager.loadCanvas(state);
      } catch (error) {
        alert('Error loading canvas: ' + error.message);
      }
    };
    reader.readAsText(file);
  }
});

/**
 * Room Management
 */
roomSelect.addEventListener('change', (e) => {
  wsManager.emitJoinRoom(e.target.value);
});

newRoomBtn.addEventListener('click', () => {
  roomModal.style.display = 'flex';
  newRoomName.value = '';
  newRoomName.focus();
});

roomConfirmBtn.addEventListener('click', () => {
  const roomName = newRoomName.value.trim();
  if (roomName) {
    // Note: In a real app, we'd create the room on the server
    // For now, just switch to it (server will create if needed)
    wsManager.emitJoinRoom(roomName);
    roomModal.style.display = 'none';
  }
});

roomCancelBtn.addEventListener('click', () => {
  roomModal.style.display = 'none';
});

// Request rooms on load
wsManager.requestRooms();

/**
 * Canvas Mouse Events
 */
drawingCanvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // Only left mouse button
  
  isMouseDown = true;
  const tool = canvasManager.currentTool;
  
  if (tool === 'eraser') {
    const point = canvasManager.getCanvasCoordinates(e.clientX, e.clientY);
    const radius = canvasManager.currentLineWidth;
    canvasManager.erase(e.clientX, e.clientY, radius, (event, data) => {
      wsManager.emitErase(data);
    });
  } else {
    canvasManager.startDrawing(e.clientX, e.clientY, (event, data) => {
      if (event === 'text-start') {
        textModal.style.display = 'flex';
        textInput.value = '';
        textInput.focus();
      } else {
        wsManager.emitDrawStart(data);
      }
    });
  }
  
  canvasManager.updateCursor(e.clientX, e.clientY, (event, data) => {
    wsManager.emitCursorMove(data);
  });
});

drawingCanvas.addEventListener('mousemove', (e) => {
  canvasManager.updateCursor(e.clientX, e.clientY, (event, data) => {
    wsManager.emitCursorMove(data);
  });

  if (isMouseDown) {
    const tool = canvasManager.currentTool;
    
    if (tool === 'eraser') {
      const radius = canvasManager.currentLineWidth;
      canvasManager.erase(e.clientX, e.clientY, radius, (event, data) => {
        wsManager.emitErase(data);
      });
    } else {
      canvasManager.continueDrawing(e.clientX, e.clientY, (event, data) => {
        wsManager.emitDrawMove(data);
      });
    }
  }
});

drawingCanvas.addEventListener('mouseup', (e) => {
  if (isMouseDown) {
    isMouseDown = false;
    canvasManager.endDrawing((event, data) => {
      if (event === 'draw-end') {
        wsManager.emitDrawEnd(data);
      }
    });
  }
});

drawingCanvas.addEventListener('mouseleave', () => {
  if (isMouseDown) {
    isMouseDown = false;
    canvasManager.endDrawing((event, data) => {
      if (event === 'draw-end') {
        wsManager.emitDrawEnd(data);
      }
    });
  }
});

/**
 * Canvas Touch Events (Mobile Support)
 */
drawingCanvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isTouchActive = true;
  
  const touch = e.touches[0];
  const tool = canvasManager.currentTool;
  
  if (tool === 'eraser') {
    const radius = canvasManager.currentLineWidth;
    canvasManager.erase(touch.clientX, touch.clientY, radius, (event, data) => {
      wsManager.emitErase(data);
    });
  } else {
    canvasManager.startDrawing(touch.clientX, touch.clientY, (event, data) => {
      if (event === 'text-start') {
        textModal.style.display = 'flex';
        textInput.value = '';
        textInput.focus();
      } else {
        wsManager.emitDrawStart(data);
      }
    });
  }
  
  canvasManager.updateCursor(touch.clientX, touch.clientY, (event, data) => {
    wsManager.emitCursorMove(data);
  });
});

drawingCanvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  
  const touch = e.touches[0];
  canvasManager.updateCursor(touch.clientX, touch.clientY, (event, data) => {
    wsManager.emitCursorMove(data);
  });

  if (isTouchActive) {
    const tool = canvasManager.currentTool;
    
    if (tool === 'eraser') {
      const radius = canvasManager.currentLineWidth;
      canvasManager.erase(touch.clientX, touch.clientY, radius, (event, data) => {
        wsManager.emitErase(data);
      });
    } else {
      canvasManager.continueDrawing(touch.clientX, touch.clientY, (event, data) => {
        wsManager.emitDrawMove(data);
      });
    }
  }
});

drawingCanvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (isTouchActive) {
    isTouchActive = false;
    canvasManager.endDrawing((event, data) => {
      if (event === 'draw-end') {
        wsManager.emitDrawEnd(data);
      }
    });
  }
});

drawingCanvas.addEventListener('touchcancel', () => {
  if (isTouchActive) {
    isTouchActive = false;
    canvasManager.endDrawing((event, data) => {
      if (event === 'draw-end') {
        wsManager.emitDrawEnd(data);
      }
    });
  }
});

/**
 * Text Input Modal
 */
textConfirmBtn.addEventListener('click', () => {
  const text = textInput.value.trim();
  if (text && canvasManager.textPosition) {
    const point = canvasManager.textPosition;
    canvasManager.drawText(point.x, point.y, text, canvasManager.currentColor, canvasManager.currentLineWidth * 3);
    textModal.style.display = 'none';
    canvasManager.textPosition = null;
  }
});

textCancelBtn.addEventListener('click', () => {
  textModal.style.display = 'none';
  canvasManager.textPosition = null;
});

textInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    textConfirmBtn.click();
  }
});

/**
 * Update Performance Metrics
 */
function updateMetrics() {
  fpsDisplay.textContent = canvasManager.getFPS();
  latencyDisplay.textContent = wsManager.getLatency();
  updateStrokeCount();
  
  const rect = drawingCanvas.getBoundingClientRect();
  canvasSizeDisplay.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
}

function updateStrokeCount() {
  strokeCountDisplay.textContent = canvasManager.getStrokeCount();
}

setInterval(updateMetrics, 100);

// Prevent context menu on canvas
drawingCanvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});