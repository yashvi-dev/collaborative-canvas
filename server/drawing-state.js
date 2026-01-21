/**
 * Drawing State Management
 * Handles canvas state, operation history, and conflict resolution
 */

class DrawingState {
  constructor() {
    // Store all drawing operations for undo/redo
    this.operationHistory = [];
    this.currentHistoryIndex = -1;
    
    // Current canvas state (strokes)
    this.strokes = [];
    
    // Map of user IDs to their operations (for conflict resolution)
    this.userOperations = new Map();
    
    // Operation ID counter for unique identification
    this.operationIdCounter = 0;
  }

  /**
   * Generate unique operation ID
   */
  generateOperationId() {
    return `op_${Date.now()}_${++this.operationIdCounter}`;
  }

  /**
   * Add a drawing operation to the history
   * @param {Object} operation - The drawing operation to add
   * @returns {string} - The operation ID
   */
  addOperation(operation) {
    // Remove any operations after current index (when undoing then drawing)
    if (this.currentHistoryIndex < this.operationHistory.length - 1) {
      this.operationHistory = this.operationHistory.slice(0, this.currentHistoryIndex + 1);
    }

    const operationId = this.generateOperationId();
    const operationWithId = {
      id: operationId,
      ...operation,
      timestamp: Date.now()
    };

    this.operationHistory.push(operationWithId);
    this.currentHistoryIndex++;

    // Apply operation to current state
    this.applyOperation(operationWithId);

    // Track user operations
    if (operation.userId) {
      if (!this.userOperations.has(operation.userId)) {
        this.userOperations.set(operation.userId, []);
      }
      this.userOperations.get(operation.userId).push(operationId);
    }

    return operationId;
  }

  /**
   * Apply an operation to the canvas state
   * @param {Object} operation - The operation to apply
   */
  applyOperation(operation) {
    if (operation.type === 'draw') {
      // Find or create stroke
      let stroke = this.strokes.find(s => s.id === operation.strokeId);
      if (!stroke) {
        stroke = {
          id: operation.strokeId,
          userId: operation.userId,
          tool: operation.tool,
          color: operation.color,
          lineWidth: operation.lineWidth,
          points: []
        };
        this.strokes.push(stroke);
      }
      
      // Add point to stroke
      if (operation.point) {
        stroke.points.push(operation.point);
      }
    } else if (operation.type === 'erase') {
      // Remove strokes or parts of strokes that intersect with erase area
      const erasePoint = operation.point;
      const eraseRadius = operation.radius || 20;
      
      this.strokes = this.strokes.map(stroke => {
        if (stroke.tool === 'eraser') return stroke;
        
        // Filter out points within erase radius
        const filteredPoints = stroke.points.filter(point => {
          const distance = Math.sqrt(
            Math.pow(point.x - erasePoint.x, 2) + 
            Math.pow(point.y - erasePoint.y, 2)
          );
          return distance > eraseRadius;
        });
        
        // If all points removed, mark stroke as deleted
        if (filteredPoints.length === 0) {
          return null;
        }
        
        return { ...stroke, points: filteredPoints };
      }).filter(stroke => stroke !== null);
    } else if (operation.type === 'clear') {
      this.strokes = [];
    }
  }

  /**
   * Undo the last operation
   * @param {string} userId - The user requesting undo
   * @returns {Object|null} - The operation that was undone, or null
   */
  undo(userId) {
    // Find the last operation by this user
    const userOps = this.userOperations.get(userId) || [];
    if (userOps.length === 0) return null;

    // Find the most recent operation by this user in history
    let operationToUndo = null;
    let operationIndex = -1;

    for (let i = this.operationHistory.length - 1; i >= 0; i--) {
      const op = this.operationHistory[i];
      if (userOps.includes(op.id) && !op.undone) {
        operationToUndo = op;
        operationIndex = i;
        break;
      }
    }

    if (!operationToUndo) return null;

    // Mark as undone
    operationToUndo.undone = true;
    operationToUndo.undoneBy = userId;
    operationToUndo.undoneAt = Date.now();

    // Rebuild state from scratch (apply all non-undone operations)
    this.rebuildState();

    return operationToUndo;
  }

  /**
   * Redo the last undone operation by a user
   * @param {string} userId - The user requesting redo
   * @returns {Object|null} - The operation that was redone, or null
   */
  redo(userId) {
    // Find the most recently undone operation by this user
    let operationToRedo = null;
    let operationIndex = -1;

    for (let i = this.operationHistory.length - 1; i >= 0; i--) {
      const op = this.operationHistory[i];
      if (op.undone && op.userId === userId && op.undoneBy === userId) {
        operationToRedo = op;
        operationIndex = i;
        break;
      }
    }

    if (!operationToRedo) return null;

    // Unmark as undone
    delete operationToRedo.undone;
    delete operationToRedo.undoneBy;
    delete operationToRedo.undoneAt;

    // Rebuild state
    this.rebuildState();

    return operationToRedo;
  }

  /**
   * Rebuild canvas state by applying all non-undone operations
   */
  rebuildState() {
    this.strokes = [];
    this.userOperations.clear();

    for (const operation of this.operationHistory) {
      if (!operation.undone) {
        this.applyOperation(operation);
      }
    }
  }

  /**
   * Get current canvas state (all strokes)
   * @returns {Array} - Array of stroke objects
   */
  getState() {
    return this.strokes;
  }

  /**
   * Get full operation history
   * @returns {Array} - Array of all operations
   */
  getHistory() {
    return this.operationHistory;
  }

  /**
   * Get all operations by a specific user
   * @param {string} userId - The user ID
   * @returns {Array} - Array of operations
   */
  getUserOperations(userId) {
    const opIds = this.userOperations.get(userId) || [];
    return this.operationHistory.filter(op => opIds.includes(op.id));
  }

  /**
   * Clear all canvas state
   */
  clear() {
    this.strokes = [];
    this.operationHistory = [];
    this.currentHistoryIndex = -1;
    this.userOperations.clear();
  }

  /**
   * Export state for persistence
   * @returns {Object} - Serialized state
   */
  exportState() {
    return {
      strokes: this.strokes,
      operationHistory: this.operationHistory,
      timestamp: Date.now()
    };
  }

  /**
   * Import state from persistence
   * @param {Object} state - Serialized state
   */
  importState(state) {
    this.strokes = state.strokes || [];
    this.operationHistory = state.operationHistory || [];
    this.currentHistoryIndex = this.operationHistory.length - 1;
    
    // Rebuild user operations map
    this.userOperations.clear();
    for (const operation of this.operationHistory) {
      if (operation.userId && !operation.undone) {
        if (!this.userOperations.has(operation.userId)) {
          this.userOperations.set(operation.userId, []);
        }
        this.userOperations.get(operation.userId).push(operation.id);
      }
    }
  }
}

module.exports = DrawingState;