/**
 * Canvas Drawing Logic
 * Handles all canvas drawing operations, path optimization, and rendering
 */

class CanvasManager {
  constructor(drawingCanvas, cursorCanvas, tempCanvas) {
    this.drawingCanvas = drawingCanvas;
    this.cursorCanvas = cursorCanvas;
    this.tempCanvas = tempCanvas;
    
    this.drawingCtx = drawingCanvas.getContext('2d');
    this.cursorCtx = cursorCanvas.getContext('2d');
    this.tempCtx = tempCanvas.getContext('2d');
    
    // CRITICAL: Verify context is not null
    if (!this.drawingCtx || !this.cursorCtx || !this.tempCtx) {
      console.error('Canvas context is null! Canvas elements may not be in DOM yet.');
      return;
    }
    
    // CRITICAL: Initialize all properties used by redrawAll() BEFORE calling resizeCanvas()
    // Store all strokes locally for undo/redo (used in redrawAll at line 577)
    this.localStrokes = new Map(); // strokeId -> stroke object
    
    // Cursor positions of other users
    this.remoteCursors = new Map(); // userId -> {x, y, color, username}
    
    // Drawing state
    this.isDrawing = false;
    this.currentTool = 'brush';
    this.currentColor = '#000000';
    this.currentLineWidth = 5;
    this.currentStrokeId = null;
    
    // Current stroke points
    this.currentStroke = null;
    
    // Shape drawing state
    this.shapeStart = null;
    this.shapeEnd = null;
    
    // Text state
    this.textMode = false;
    this.textPosition = null;
    
    // Path optimization - only send every N points to server (but draw locally always)
    this.pointThrottle = 3; // Send every 3rd point to reduce network traffic
    this.pointCounter = 0;
    this.lastSentPointIndex = -1;
    
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Performance monitoring
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fps = 60;
    
    // Initialize canvas settings
    this.setupCanvas();
    
    // Start FPS monitoring
    this.monitorPerformance();
  }

  /**
   * Resize canvas to fit container
   */
  resizeCanvas() {
    const container = this.drawingCanvas.parentElement;
    if (!container) return; // Container not ready yet
    
    const rect = container.getBoundingClientRect();
    
    // CRITICAL: If container has zero size, canvas will be 0x0 and nothing will render
    if (rect.width === 0 || rect.height === 0) {
      // Try again on next frame when layout is complete
      requestAnimationFrame(() => this.resizeCanvas());
      return;
    }
    
    [this.drawingCanvas, this.cursorCanvas, this.tempCanvas].forEach(canvas => {
      canvas.width = rect.width;
      canvas.height = rect.height;
    });
    
    this.setupCanvas();
    this.redrawAll();
    
    // MANDATORY TEST: Draw a hardcoded red dot at (100,100) after resize
    // If this doesn't appear, canvas initialization has failed
    if (this.drawingCanvas.width > 0 && this.drawingCanvas.height > 0) {
      this.drawingCtx.fillStyle = "red";
      this.drawingCtx.beginPath();
      this.drawingCtx.arc(100, 100, 5, 0, Math.PI * 2);
      this.drawingCtx.fill();
      console.log('Test dot drawn at (100,100) - canvas size:', this.drawingCanvas.width, 'x', this.drawingCanvas.height);
    } else {
      console.error('Canvas is 0x0! Cannot draw. Container size may be 0.');
    }
  }

  /**
   * Setup canvas rendering context
   */
  setupCanvas() {
    // CRITICAL: Verify context exists before using
    if (!this.drawingCtx || !this.cursorCtx || !this.tempCtx) {
      console.error('Canvas context is null in setupCanvas!');
      return;
    }
    
    // Enable image smoothing for better quality
    [this.drawingCtx, this.tempCtx].forEach(ctx => {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'source-over';
    });
    
    this.cursorCtx.imageSmoothingEnabled = true;
    this.cursorCtx.imageSmoothingQuality = 'high';
  }

  /**
   * Set drawing tool
   */
  setTool(tool) {
    this.currentTool = tool;
    if (tool === 'text') {
      this.textMode = true;
    } else {
      this.textMode = false;
    }
  }

  /**
   * Set drawing color
   */
  setColor(color) {
    this.currentColor = color;
  }

  /**
   * Set line width
   */
  setLineWidth(width) {
    this.currentLineWidth = width;
  }

  /**
   * Start drawing
   */
  startDrawing(x, y, emitCallback) {
    if (this.textMode && this.currentTool === 'text') {
      this.textPosition = { x, y };
      emitCallback('text-start', { x, y });
      return;
    }

    this.isDrawing = true;
    this.currentStrokeId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const point = this.getCanvasCoordinates(x, y);
    
    if (['rectangle', 'circle', 'line'].includes(this.currentTool)) {
      this.shapeStart = point;
      this.shapeEnd = point;
      return;
    }

    this.currentStroke = {
      id: this.currentStrokeId,
      tool: this.currentTool,
      color: this.currentColor,
      lineWidth: this.currentLineWidth,
      points: [point]
    };

    this.localStrokes.set(this.currentStrokeId, this.currentStroke);

    // Draw first point immediately (as a dot for better visual feedback)
    this.drawFirstPoint(point, this.currentStroke);

    // Reset counter for throttling
    this.pointCounter = 0;
    this.lastSentPointIndex = 0;

    // Emit draw start immediately
    emitCallback('draw-start', {
      strokeId: this.currentStrokeId,
      tool: this.currentTool,
      color: this.currentColor,
      lineWidth: this.currentLineWidth,
      point: point
    });
  }

  /**
   * Continue drawing
   */
  continueDrawing(x, y, emitCallback) {
    if (!this.isDrawing) return;

    const point = this.getCanvasCoordinates(x, y);

    if (['rectangle', 'circle', 'line'].includes(this.currentTool)) {
      this.shapeEnd = point;
      this.drawTempShape();
      return;
    }

    if (!this.currentStroke) return;

    // Always add point and draw locally for smooth visual feedback
    const previousPoint = this.currentStroke.points.length > 0 
      ? this.currentStroke.points[this.currentStroke.points.length - 1]
      : null;
    
    this.currentStroke.points.push(point);
    
    // Draw immediately locally (no waiting for server)
    if (previousPoint) {
      this.drawPoint(previousPoint, point, this.currentStroke);
    } else {
      // Fallback: draw first point as dot
      this.drawFirstPoint(point, this.currentStroke);
    }

    // Throttle network sends (but keep drawing smooth locally)
    this.pointCounter++;
    if (this.pointCounter % this.pointThrottle === 0 || 
        this.currentStroke.points.length === 2) { // Always send 2nd point for smoother start
      // Emit draw move to server (only throttled sends)
      emitCallback('draw-move', {
        strokeId: this.currentStrokeId,
        tool: this.currentTool,
        color: this.currentColor,
        lineWidth: this.currentLineWidth,
        point: point
      });
      this.lastSentPointIndex = this.currentStroke.points.length - 1;
    }
  }

  /**
   * End drawing
   */
  endDrawing(emitCallback) {
    if (!this.isDrawing) return;

    if (['rectangle', 'circle', 'line'].includes(this.currentTool) && this.shapeStart && this.shapeEnd) {
      // Complete shape drawing
      this.finalizeShape(emitCallback);
      this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
      this.shapeStart = null;
      this.shapeEnd = null;
    } else if (this.currentStroke) {
      // Emit draw end
      emitCallback('draw-end', {
        strokeId: this.currentStrokeId
      });
    }

    this.isDrawing = false;
    this.currentStroke = null;
    this.currentStrokeId = null;
    this.pointCounter = 0;
    this.lastSentPointIndex = -1;
  }

  /**
   * Draw a point (line segment)
   */
  drawPoint(fromPoint, toPoint, stroke) {
    // CRITICAL: Verify canvas is ready
    if (!this.drawingCtx || this.drawingCanvas.width === 0 || this.drawingCanvas.height === 0) {
      console.error('Cannot draw: canvas context is null or canvas is 0x0');
      return;
    }
    
    if (!fromPoint) {
      fromPoint = toPoint;
    }

    this.drawingCtx.strokeStyle = stroke.color;
    this.drawingCtx.lineWidth = stroke.lineWidth;
    this.drawingCtx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';

    this.drawingCtx.beginPath();
    this.drawingCtx.moveTo(fromPoint.x, fromPoint.y);
    this.drawingCtx.lineTo(toPoint.x, toPoint.y);
    this.drawingCtx.stroke();
    
    // Reset composite operation
    this.drawingCtx.globalCompositeOperation = 'source-over';
  }

  /**
   * Draw first point as a dot (for better visual feedback)
   */
  drawFirstPoint(point, stroke) {
    // CRITICAL: Verify canvas is ready
    if (!this.drawingCtx || this.drawingCanvas.width === 0 || this.drawingCanvas.height === 0) {
      console.error('Cannot draw: canvas context is null or canvas is 0x0');
      return;
    }
    
    this.drawingCtx.strokeStyle = stroke.color;
    this.drawingCtx.lineWidth = stroke.lineWidth;
    this.drawingCtx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    this.drawingCtx.fillStyle = stroke.color;
    
    this.drawingCtx.beginPath();
    this.drawingCtx.arc(point.x, point.y, stroke.lineWidth / 2, 0, Math.PI * 2);
    this.drawingCtx.fill();
    
    // Reset composite operation
    this.drawingCtx.globalCompositeOperation = 'source-over';
  }

  /**
   * Draw temporary shape while dragging
   */
  drawTempShape() {
    if (!this.shapeStart || !this.shapeEnd) return;

    this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    this.tempCtx.strokeStyle = this.currentColor;
    this.tempCtx.lineWidth = this.currentLineWidth;
    this.tempCtx.setLineDash([]);

    const startX = this.shapeStart.x;
    const startY = this.shapeStart.y;
    const endX = this.shapeEnd.x;
    const endY = this.shapeEnd.y;

    this.tempCtx.beginPath();

    switch (this.currentTool) {
      case 'rectangle':
        const width = endX - startX;
        const height = endY - startY;
        this.tempCtx.rect(startX, startY, width, height);
        break;
      case 'circle':
        const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        this.tempCtx.arc(startX, startY, radius, 0, Math.PI * 2);
        break;
      case 'line':
        this.tempCtx.moveTo(startX, startY);
        this.tempCtx.lineTo(endX, endY);
        break;
    }

    this.tempCtx.stroke();
  }

  /**
   * Finalize shape drawing
   */
  finalizeShape(emitCallback) {
    if (!this.shapeStart || !this.shapeEnd) return;

    const shapeId = `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Draw shape to main canvas
    this.drawingCtx.strokeStyle = this.currentColor;
    this.drawingCtx.lineWidth = this.currentLineWidth;
    this.drawingCtx.setLineDash([]);

    const startX = this.shapeStart.x;
    const startY = this.shapeStart.y;
    const endX = this.shapeEnd.x;
    const endY = this.shapeEnd.y;

    this.drawingCtx.beginPath();

    switch (this.currentTool) {
      case 'rectangle':
        const width = endX - startX;
        const height = endY - startY;
        this.drawingCtx.rect(startX, startY, width, height);
        break;
      case 'circle':
        const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        this.drawingCtx.arc(startX, startY, radius, 0, Math.PI * 2);
        break;
      case 'line':
        this.drawingCtx.moveTo(startX, startY);
        this.drawingCtx.lineTo(endX, endY);
        break;
    }

    this.drawingCtx.stroke();

    // Store shape as stroke
    const shapeStroke = {
      id: shapeId,
      tool: this.currentTool,
      color: this.currentColor,
      lineWidth: this.currentLineWidth,
      shape: {
        type: this.currentTool,
        start: this.shapeStart,
        end: this.shapeEnd
      }
    };

    this.localStrokes.set(shapeId, shapeStroke);

    // Emit shape creation (simplified - server will handle it)
    emitCallback('draw-start', {
      strokeId: shapeId,
      tool: this.currentTool,
      color: this.currentColor,
      lineWidth: this.currentLineWidth,
      point: this.shapeStart,
      shape: {
        type: this.currentTool,
        start: this.shapeStart,
        end: this.shapeEnd
      }
    });
  }

  /**
   * Handle eraser
   */
  erase(x, y, radius, emitCallback) {
    const point = this.getCanvasCoordinates(x, y);
    
    // Draw erase on canvas
    this.drawingCtx.globalCompositeOperation = 'destination-out';
    this.drawingCtx.beginPath();
    this.drawingCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.drawingCtx.fill();
    this.drawingCtx.globalCompositeOperation = 'source-over';

    // Emit erase
    emitCallback('erase', {
      point: point,
      radius: radius
    });
  }

  /**
   * Handle text input
   */
  drawText(x, y, text, color, size) {
    const point = this.getCanvasCoordinates(x, y);
    
    this.drawingCtx.fillStyle = color || this.currentColor;
    this.drawingCtx.font = `${size || this.currentLineWidth * 3}px Arial`;
    this.drawingCtx.fillText(text, point.x, point.y);
  }

  /**
   * Handle remote draw start
   */
  handleRemoteDrawStart(data) {
    const stroke = {
      id: data.strokeId,
      tool: data.tool,
      color: data.color || data.userColor,
      lineWidth: data.lineWidth,
      points: [data.point],
      userId: data.userId
    };

    this.localStrokes.set(data.strokeId, stroke);
    
    // Draw first point immediately
    this.drawFirstPoint(data.point, stroke);
  }

  /**
   * Handle remote draw move
   */
  handleRemoteDrawMove(data) {
    const stroke = this.localStrokes.get(data.strokeId);
    if (!stroke) return;

    const previousPoint = stroke.points.length > 0 
      ? stroke.points[stroke.points.length - 1]
      : null;
    
    stroke.points.push(data.point);
    
    // Draw the new point immediately as it arrives
    if (previousPoint) {
      this.drawPoint(previousPoint, data.point, stroke);
    } else {
      // Draw first point as dot if needed
      this.drawFirstPoint(data.point, stroke);
    }
  }

  /**
   * Handle remote draw end
   */
  handleRemoteDrawEnd(data) {
    // Stroke is complete, no additional action needed
  }

  /**
   * Handle remote erase
   */
  handleRemoteErase(data) {
    const point = data.point;
    const radius = data.radius || 20;

    this.drawingCtx.globalCompositeOperation = 'destination-out';
    this.drawingCtx.beginPath();
    this.drawingCtx.arc(point.x, point.y, radius, 20, 0, Math.PI * 2);
    this.drawingCtx.fill();
    this.drawingCtx.globalCompositeOperation = 'source-over';
  }

  /**
   * Handle remote cursor move
   */
  handleRemoteCursorMove(data) {
    const canvasPoint = this.getCanvasCoordinates(data.x, data.y);
    this.remoteCursors.set(data.userId, {
      x: canvasPoint.x,
      y: canvasPoint.y,
      color: data.color,
      username: data.username
    });
    this.drawRemoteCursors();
  }

  /**
   * Draw remote cursors
   */
  drawRemoteCursors() {
    this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);

    this.remoteCursors.forEach((cursor, userId) => {
      this.cursorCtx.fillStyle = cursor.color;
      this.cursorCtx.strokeStyle = cursor.color;
      this.cursorCtx.lineWidth = 2;

      // Draw cursor circle
      this.cursorCtx.beginPath();
      this.cursorCtx.arc(cursor.x, cursor.y, 10, 0, Math.PI * 2);
      this.cursorCtx.fill();
      this.cursorCtx.stroke();

      // Draw username label
      this.cursorCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      this.cursorCtx.font = '12px Arial';
      const textWidth = this.cursorCtx.measureText(cursor.username).width;
      this.cursorCtx.fillRect(cursor.x - textWidth / 2 - 4, cursor.y + 15, textWidth + 8, 18);
      this.cursorCtx.fillStyle = 'white';
      this.cursorCtx.fillText(cursor.username, cursor.x - textWidth / 2, cursor.y + 28);
    });
  }

  /**
   * Update cursor position (for local user)
   */
  updateCursor(x, y, emitCallback) {
    emitCallback('cursor-move', { x, y });
  }

  /**
   * Redraw all strokes
   */
  redrawAll() {
    // CRITICAL: Defensive guard - ensure localStrokes is initialized
    if (!this.localStrokes) {
      this.localStrokes = new Map();
      return; // Nothing to redraw yet
    }
    
    // Clear canvas
    this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);

    // Redraw all strokes
    this.localStrokes.forEach(stroke => {
      if (stroke.points && stroke.points.length > 0) {
        this.drawingCtx.strokeStyle = stroke.color;
        this.drawingCtx.lineWidth = stroke.lineWidth;
        this.drawingCtx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
        this.drawingCtx.lineCap = 'round';
        this.drawingCtx.lineJoin = 'round';

        this.drawingCtx.beginPath();
        this.drawingCtx.moveTo(stroke.points[0].x, stroke.points[0].y);

        for (let i = 1; i < stroke.points.length; i++) {
          this.drawingCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }

        this.drawingCtx.stroke();
        this.drawingCtx.globalCompositeOperation = 'source-over';
      }

      // Handle shapes
      if (stroke.shape) {
        this.drawingCtx.strokeStyle = stroke.color;
        this.drawingCtx.lineWidth = stroke.lineWidth;
        this.drawingCtx.setLineDash([]);
        this.drawingCtx.globalCompositeOperation = 'source-over';

        const { start, end } = stroke.shape;

        this.drawingCtx.beginPath();
        switch (stroke.shape.type) {
          case 'rectangle':
            this.drawingCtx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
            break;
          case 'circle':
            const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            this.drawingCtx.arc(start.x, start.y, radius, 0, Math.PI * 2);
            break;
          case 'line':
            this.drawingCtx.moveTo(start.x, start.y);
            this.drawingCtx.lineTo(end.x, end.y);
            break;
        }
        this.drawingCtx.stroke();
      }
    });

    this.drawingCtx.globalCompositeOperation = 'source-over';
  }

  /**
   * Load canvas state
   */
  loadCanvasState(strokes) {
    this.localStrokes.clear();
    
    strokes.forEach(stroke => {
      this.localStrokes.set(stroke.id, stroke);
    });

    this.redrawAll();
  }

  /**
   * Clear canvas
   */
  clearCanvas() {
    this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
    this.localStrokes.clear();
  }

  /**
   * Get canvas coordinates from screen coordinates
   */
  getCanvasCoordinates(x, y) {
    const rect = this.drawingCanvas.getBoundingClientRect();
    return {
      x: x - rect.left,
      y: y - rect.top
    };
  }

  /**
   * Get stroke count
   */
  getStrokeCount() {
    return this.localStrokes.size;
  }

  /**
   * Monitor performance (FPS)
   */
  monitorPerformance() {
    const now = performance.now();
    this.frameCount++;

    if (now - this.lastFrameTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = now;
    }

    requestAnimationFrame(() => this.monitorPerformance());
  }

  /**
   * Get current FPS
   */
  getFPS() {
    return this.fps;
  }
}