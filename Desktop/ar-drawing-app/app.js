/**
 * Hand Tracking Drawing Application
 * A web application that allows drawing using hand gestures via MediaPipe
 */

// =============================================================================
// CONSTANTS AND CONFIGURATION
// =============================================================================

// Fingertip landmark indices (MediaPipe hand model)
const FINGERTIP_INDICES = {
    THUMB_TIP: 4,
    INDEX_FINGER_TIP: 8,
    MIDDLE_FINGER_TIP: 12,
    RING_FINGER_TIP: 16,
    PINKY_TIP: 20
};

// Additional landmark indices for rotation detection
const LANDMARK_INDICES = {
    WRIST: 0,
    MIDDLE_FINGER_MCP: 9, // Middle finger base joint
    ...FINGERTIP_INDICES
};

// Detection and tracking settings
const PINCH_THRESHOLD = 0.05;
const UNPINCH_DELAY = 200; // 200ms delay before allowing unpinch
const SMOOTHING_FRAMES = 5; // Number of frames to average for smoothing
const MIN_DETECTION_CONFIDENCE = 0.7;
const MIN_TRACKING_CONFIDENCE = 0.6;

// Command types for undo/redo functionality
const COMMAND_TYPES = {
    DRAW: 'draw',
    ERASE_ALL: 'erase_all',
    MOVE: 'move',
    ROTATE: 'rotate',
    RESIZE: 'resize'
};

// =============================================================================
// GLOBAL VARIABLES
// =============================================================================

// DOM elements
let video, canvas, ctx, statusDiv;

// MediaPipe instances
let hands, camera;

// Application state
let currentTool = null;
let currentColor = '#00ffff'; // Default to cyan
let currentBrushSize = 4; // Default to medium brush size
let currentOpacity = 1.0; // Default to full opacity

// Shape tool state
let currentShape = 'rectangle'; // Default shape
let currentFillMode = 'outline'; // 'outline' or 'filled'

// Background state
let backgroundMode = 'camera'; // 'camera' or 'solid'
let backgroundColor = '#ffffff'; // Default background color

// Drawing data
let drawnObjects = [];
let activeDrawing = new Map();
let commandHistory = [];
let redoHistory = [];

// Interaction state
let selectedObject = null;
let dragOffset = { x: 0, y: 0 };
let isDragging = false;
let dragStartPos = null;
let isRotating = false;
let rotationStartAngle = null;
let rotationStartObjectAngle = null;
let isResizing = false;
let resizeStartSpread = null;
let resizeStartScale = null;

// Hand tracking state
let handPinchStates = new Map();
let handPositionHistory = new Map();

// Crazy mode state
let crazyModeActive = false;
let crazyModeDrawings = new Map(); // Map of handIndex -> Map of fingertipIndex -> drawing data

// Mouse simulation state
let mouseState = {
    isPressed: false,
    position: { x: 0, y: 0 },
    handIndex: 999 // Use a high number to distinguish from real hands
};

// Object ID counter for unique identification
let objectIdCounter = 0;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate unique ID for drawn objects
 */
function generateObjectId() {
    return `obj_${objectIdCounter++}`;
}

/**
 * Calculate distance between two landmarks
 */
function calculateDistance(landmark1, landmark2) {
    const dx = landmark1.x - landmark2.x;
    const dy = landmark1.y - landmark2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate hand rotation angle using wrist and middle finger
 */
function calculateHandRotation(landmarks) {
    const wrist = landmarks[LANDMARK_INDICES.WRIST];
    const middleMcp = landmarks[LANDMARK_INDICES.MIDDLE_FINGER_MCP];
    
    const deltaX = middleMcp.x - wrist.x;
    const deltaY = middleMcp.y - wrist.y;
    
    return Math.atan2(deltaY, deltaX);
}

/**
 * Calculate finger spread for resize detection
 */
function calculateFingerSpread(landmarks) {
    const fingertips = [
        landmarks[FINGERTIP_INDICES.THUMB_TIP],
        landmarks[FINGERTIP_INDICES.INDEX_FINGER_TIP],
        landmarks[FINGERTIP_INDICES.MIDDLE_FINGER_TIP],
        landmarks[FINGERTIP_INDICES.RING_FINGER_TIP],
        landmarks[FINGERTIP_INDICES.PINKY_TIP]
    ];
    
    const centerX = fingertips.reduce((sum, tip) => sum + tip.x, 0) / fingertips.length;
    const centerY = fingertips.reduce((sum, tip) => sum + tip.y, 0) / fingertips.length;
    
    const totalDistance = fingertips.reduce((sum, tip) => {
        const dx = tip.x - centerX;
        const dy = tip.y - centerY;
        return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0);
    
    return totalDistance / fingertips.length;
}

/**
 * Calculate distance from point to line segment
 */
function distanceToLine(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) {
        param = dot / lenSq;
    }
    
    let xx, yy;
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }
    
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

// =============================================================================
// CANVAS AND DRAWING FUNCTIONS
// =============================================================================

/**
 * Clear canvas with appropriate background
 */
function clearCanvas() {
    if (backgroundMode === 'solid') {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

/**
 * Set canvas dimensions to match viewport
 */
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

/**
 * Get current pinch position for a hand
 */
function getPinchPosition(landmarks) {
    const thumbTip = landmarks[FINGERTIP_INDICES.THUMB_TIP];
    const indexTip = landmarks[FINGERTIP_INDICES.INDEX_FINGER_TIP];
    return {
        x: ((thumbTip.x + indexTip.x) / 2) * canvas.width,
        y: ((thumbTip.y + indexTip.y) / 2) * canvas.height
    };
}

/**
 * Get smoothed pinch position for a hand
 */
function getSmoothedPinchPosition(handIndex) {
    const smoothedPos = getSmoothedPosition(handIndex);
    if (!smoothedPos) {
        return null;
    }
    return {
        x: smoothedPos.x * canvas.width,
        y: smoothedPos.y * canvas.height
    };
}

/**
 * Draw all objects on canvas
 */
function drawObjects() {
    // Draw completed objects
    drawnObjects.forEach(obj => {
        const isSelected = selectedObject && selectedObject.id === obj.id;
        const strokeColor = isSelected ? '#ff6b6b' : obj.color;
        const lineWidth = isSelected ? obj.width + 2 : obj.width;
        
        // Apply transformations if object has them
        ctx.save();
        
        // Apply scaling if object has scale
        if (obj.scale && obj.scale !== 1.0 && obj.scaleCenter) {
            ctx.translate(obj.scaleCenter.x, obj.scaleCenter.y);
            ctx.scale(obj.scale, obj.scale);
            ctx.translate(-obj.scaleCenter.x, -obj.scaleCenter.y);
        }
        
        // Apply rotation if object has rotation
        if (obj.rotation && obj.rotationCenter) {
            ctx.translate(obj.rotationCenter.x, obj.rotationCenter.y);
            ctx.rotate(obj.rotation);
            ctx.translate(-obj.rotationCenter.x, -obj.rotationCenter.y);
        }
        
        drawSingleObject(obj, strokeColor, lineWidth);
        ctx.restore();
    });

    // Draw active drawings (these don't have transformations yet)
    activeDrawing.forEach(obj => {
        drawSingleObject(obj, obj.color, obj.width);
    });
    
    // Draw crazy mode drawings
    if (crazyModeActive) {
        crazyModeDrawings.forEach((handDrawings, handIndex) => {
            handDrawings.forEach((drawing, fingertipIndex) => {
                if (drawing.points && drawing.points.length > 1) {
                    drawSingleObject(drawing, drawing.color, drawing.width);
                }
            });
        });
    }
}

/**
 * Draw a single object with given style
 */
function drawSingleObject(obj, color, width) {
    // Apply opacity if object has it, otherwise use current opacity
    const opacity = obj.opacity !== undefined ? obj.opacity : currentOpacity;
    ctx.globalAlpha = opacity;
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    
    if (obj.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(obj.startX, obj.startY);
        ctx.lineTo(obj.endX, obj.endY);
        ctx.stroke();
    } else if (obj.type === 'path') {
        ctx.beginPath();
        ctx.moveTo(obj.points[0].x, obj.points[0].y);
        for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
        }
        ctx.stroke();
    } else if (obj.type === 'shape') {
        const centerX = (obj.startX + obj.endX) / 2;
        const centerY = (obj.startY + obj.endY) / 2;
        const width = Math.abs(obj.endX - obj.startX);
        const height = Math.abs(obj.endY - obj.startY);
        
        ctx.beginPath();
        
        if (obj.shape === 'rectangle') {
            ctx.rect(obj.startX, obj.startY, obj.endX - obj.startX, obj.endY - obj.startY);
        } else if (obj.shape === 'circle') {
            const radius = Math.min(width, height) / 2;
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        } else if (obj.shape === 'oval') {
            ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, 2 * Math.PI);
        } else if (obj.shape === 'star') {
            drawStar(ctx, centerX, centerY, 5, Math.min(width, height) / 2, Math.min(width, height) / 4);
        }
        
        if (obj.fillMode === 'filled') {
            ctx.fill();
        } else {
            ctx.stroke();
        }
    } else if (obj.type === 'rectangle') {
        // Legacy rectangle support
        ctx.strokeRect(obj.startX, obj.startY, obj.endX - obj.startX, obj.endY - obj.startY);
    }
    
    // Reset opacity to default
    ctx.globalAlpha = 1.0;
}

/**
 * Helper function to draw a star shape
 */
function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
}

/**
 * Draw white dots on fingertips with pinch gesture handling
 */
function drawFingertips(landmarks, isPinchingGesture) {
    const thumbTip = landmarks[FINGERTIP_INDICES.THUMB_TIP];
    const indexTip = landmarks[FINGERTIP_INDICES.INDEX_FINGER_TIP];
    
    if (isPinchingGesture) {
        // When pinching, draw a combined dot between thumb and index finger
        const combinedX = ((thumbTip.x + indexTip.x) / 2) * canvas.width;
        const combinedY = ((thumbTip.y + indexTip.y) / 2) * canvas.height;
        
        ctx.beginPath();
        ctx.arc(combinedX, combinedY, 10, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff6b6b';
        ctx.fill();
        
        ctx.shadowColor = '#ff6b6b';
        ctx.shadowBlur = 25;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Draw the other fingertips normally
        [FINGERTIP_INDICES.MIDDLE_FINGER_TIP, FINGERTIP_INDICES.RING_FINGER_TIP, FINGERTIP_INDICES.PINKY_TIP].forEach(index => {
            const landmark = landmarks[index];
            const x = landmark.x * canvas.width;
            const y = landmark.y * canvas.height;

            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = 'white';
            ctx.fill();
            
            ctx.shadowColor = 'white';
            ctx.shadowBlur = 15;
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    } else {
        // Normal mode - draw all fingertips separately
        Object.values(FINGERTIP_INDICES).forEach(index => {
            const landmark = landmarks[index];
            const x = landmark.x * canvas.width;
            const y = landmark.y * canvas.height;

            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = 'white';
            ctx.fill();
            
            ctx.shadowColor = 'white';
            ctx.shadowBlur = 15;
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    }
}

/**
 * Draw mouse cursor indicator
 */
function drawMouseCursor(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#ff6b6b';
    ctx.fill();
    
    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
}

/**
 * Redraw canvas for mouse interactions
 */
function redrawForMouse() {
    if (currentTool !== null) {
        clearCanvas();
        drawObjects();
        if (mouseState.isPressed) {
            drawMouseCursor(mouseState.position.x, mouseState.position.y);
        }
    }
}

// =============================================================================
// OBJECT MANIPULATION FUNCTIONS
// =============================================================================

/**
 * Get object center for rotation/scaling
 */
function getObjectCenter(obj) {
    if (obj.type === 'line') {
        return {
            x: (obj.startX + obj.endX) / 2,
            y: (obj.startY + obj.endY) / 2
        };
    } else if (obj.type === 'rectangle' || obj.type === 'shape') {
        return {
            x: (obj.startX + obj.endX) / 2,
            y: (obj.startY + obj.endY) / 2
        };
    } else if (obj.type === 'path') {
        let sumX = 0, sumY = 0;
        obj.points.forEach(point => {
            sumX += point.x;
            sumY += point.y;
        });
        return {
            x: sumX / obj.points.length,
            y: sumY / obj.points.length
        };
    }
    return { x: 0, y: 0 };
}

/**
 * Check if point is inside/near an object
 */
function isPointInObject(x, y, obj) {
    const tolerance = 15;
    
    if (obj.type === 'line') {
        return distanceToLine(x, y, obj.startX, obj.startY, obj.endX, obj.endY) <= tolerance;
    } else if (obj.type === 'rectangle') {
        // Legacy rectangle support
        const minX = Math.min(obj.startX, obj.endX) - tolerance;
        const maxX = Math.max(obj.startX, obj.endX) + tolerance;
        const minY = Math.min(obj.startY, obj.endY) - tolerance;
        const maxY = Math.max(obj.startY, obj.endY) + tolerance;
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    } else if (obj.type === 'shape') {
        const centerX = (obj.startX + obj.endX) / 2;
        const centerY = (obj.startY + obj.endY) / 2;
        const width = Math.abs(obj.endX - obj.startX);
        const height = Math.abs(obj.endY - obj.startY);
        
        if (obj.shape === 'rectangle') {
            const minX = Math.min(obj.startX, obj.endX) - tolerance;
            const maxX = Math.max(obj.startX, obj.endX) + tolerance;
            const minY = Math.min(obj.startY, obj.endY) - tolerance;
            const maxY = Math.max(obj.startY, obj.endY) + tolerance;
            return x >= minX && x <= maxX && y >= minY && y <= maxY;
        } else if (obj.shape === 'circle') {
            const radius = Math.min(width, height) / 2 + tolerance;
            const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            return distance <= radius;
        } else if (obj.shape === 'oval') {
            // Simplified ellipse hit detection using bounding box
            const minX = Math.min(obj.startX, obj.endX) - tolerance;
            const maxX = Math.max(obj.startX, obj.endX) + tolerance;
            const minY = Math.min(obj.startY, obj.endY) - tolerance;
            const maxY = Math.max(obj.startY, obj.endY) + tolerance;
            return x >= minX && x <= maxX && y >= minY && y <= maxY;
        } else if (obj.shape === 'star') {
            // Simplified star hit detection using bounding box
            const minX = Math.min(obj.startX, obj.endX) - tolerance;
            const maxX = Math.max(obj.startX, obj.endX) + tolerance;
            const minY = Math.min(obj.startY, obj.endY) - tolerance;
            const maxY = Math.max(obj.startY, obj.endY) + tolerance;
            return x >= minX && x <= maxX && y >= minY && y <= maxY;
        }
    } else if (obj.type === 'path') {
        for (let i = 0; i < obj.points.length - 1; i++) {
            const p1 = obj.points[i];
            const p2 = obj.points[i + 1];
            if (distanceToLine(x, y, p1.x, p1.y, p2.x, p2.y) <= tolerance) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Find object at position (returns topmost object)
 */
function findObjectAtPosition(x, y) {
    for (let i = drawnObjects.length - 1; i >= 0; i--) {
        if (isPointInObject(x, y, drawnObjects[i])) {
            return drawnObjects[i];
        }
    }
    return null;
}

/**
 * Move object by offset
 */
function moveObject(obj, deltaX, deltaY) {
    if (obj.type === 'line') {
        obj.startX += deltaX;
        obj.startY += deltaY;
        obj.endX += deltaX;
        obj.endY += deltaY;
    } else if (obj.type === 'rectangle' || obj.type === 'shape') {
        obj.startX += deltaX;
        obj.startY += deltaY;
        obj.endX += deltaX;
        obj.endY += deltaY;
    } else if (obj.type === 'path') {
        obj.points.forEach(point => {
            point.x += deltaX;
            point.y += deltaY;
        });
    }
}

/**
 * Add rotation to object
 */
function rotateObject(obj, angle, centerX, centerY) {
    if (!obj.rotation) {
        obj.rotation = 0;
    }
    obj.rotation = angle;
    
    if (!obj.rotationCenter) {
        obj.rotationCenter = { x: centerX, y: centerY };
    }
}

/**
 * Add resize to object
 */
function resizeObject(obj, scale, centerX, centerY) {
    if (!obj.scale) {
        obj.scale = 1.0;
    }
    obj.scale = Math.max(0.1, Math.min(5.0, scale)); // Clamp between 0.1x and 5x
    
    if (!obj.scaleCenter) {
        obj.scaleCenter = { x: centerX, y: centerY };
    }
}

// =============================================================================
// SMOOTHING AND POSITION TRACKING
// =============================================================================

/**
 * Add position to smoothing history
 */
function addToPositionHistory(handIndex, position) {
    if (!handPositionHistory.has(handIndex)) {
        handPositionHistory.set(handIndex, []);
    }
    
    const history = handPositionHistory.get(handIndex);
    history.push(position);
    
    if (history.length > SMOOTHING_FRAMES) {
        history.shift();
    }
}

/**
 * Get smoothed position using moving average
 */
function getSmoothedPosition(handIndex) {
    if (!handPositionHistory.has(handIndex)) {
        return null;
    }
    
    const history = handPositionHistory.get(handIndex);
    if (history.length === 0) {
        return null;
    }
    
    const avgX = history.reduce((sum, pos) => sum + pos.x, 0) / history.length;
    const avgY = history.reduce((sum, pos) => sum + pos.y, 0) / history.length;
    
    return { x: avgX, y: avgY };
}

/**
 * Clean up position history for removed hands
 */
function cleanupPositionHistory(currentHandIndices) {
    for (const [handIndex] of handPositionHistory) {
        if (!currentHandIndices.has(handIndex)) {
            handPositionHistory.delete(handIndex);
        }
    }
}

// =============================================================================
// PINCH DETECTION AND GESTURE RECOGNITION
// =============================================================================

/**
 * Check if thumb and index finger are pinching (raw detection)
 */
function isRawPinching(landmarks) {
    const thumbTip = landmarks[FINGERTIP_INDICES.THUMB_TIP];
    const indexTip = landmarks[FINGERTIP_INDICES.INDEX_FINGER_TIP];
    const distance = calculateDistance(thumbTip, indexTip);
    return distance < PINCH_THRESHOLD;
}

/**
 * Get or create pinch state for a hand
 */
function getHandPinchState(handIndex) {
    if (!handPinchStates.has(handIndex)) {
        handPinchStates.set(handIndex, {
            isPinched: false,
            lastUnpinchTime: 0,
            separationStartTime: null
        });
    }
    return handPinchStates.get(handIndex);
}

/**
 * Update pinch state with debouncing logic
 */
function updatePinchState(handIndex, rawPinching) {
    const state = getHandPinchState(handIndex);
    const currentTime = Date.now();

    if (rawPinching) {
        if (!state.isPinched) {
            state.isPinched = true;
            state.separationStartTime = null;
        }
    } else {
        if (state.isPinched) {
            if (state.separationStartTime === null) {
                state.separationStartTime = currentTime;
            } else if (currentTime - state.separationStartTime >= UNPINCH_DELAY) {
                state.isPinched = false;
                state.separationStartTime = null;
                state.lastUnpinchTime = currentTime;
            }
        } else {
            state.separationStartTime = null;
        }
    }

    return state.isPinched;
}

// =============================================================================
// COMMAND HISTORY AND UNDO/REDO SYSTEM
// =============================================================================

/**
 * Add command to history
 */
function addCommand(command) {
    commandHistory.push(command);
    redoHistory = [];
}

/**
 * Undo the last command
 */
function undoLastCommand() {
    if (commandHistory.length === 0) {
        statusDiv.textContent = 'Nothing to undo!';
        statusDiv.className = 'status loading';
        setTimeout(() => {
            updateToolStatus();
        }, 1500);
        return;
    }
    
    const lastCommand = commandHistory.pop();
    redoHistory.push(lastCommand);
    
    if (lastCommand.type === COMMAND_TYPES.DRAW) {
        const objectIndex = drawnObjects.findIndex(obj => obj.id === lastCommand.objectId);
        if (objectIndex !== -1) {
            drawnObjects.splice(objectIndex, 1);
        }
    } else if (lastCommand.type === COMMAND_TYPES.ERASE_ALL) {
        drawnObjects = [...lastCommand.previousObjects];
    } else if (lastCommand.type === COMMAND_TYPES.MOVE) {
        const obj = drawnObjects.find(obj => obj.id === lastCommand.objectId);
        if (obj) {
            moveObject(obj, -lastCommand.deltaX, -lastCommand.deltaY);
        }
    } else if (lastCommand.type === COMMAND_TYPES.ROTATE) {
        const obj = drawnObjects.find(obj => obj.id === lastCommand.objectId);
        if (obj) {
            obj.rotation = lastCommand.previousRotation;
            if (lastCommand.previousRotationCenter) {
                obj.rotationCenter = lastCommand.previousRotationCenter;
            }
        }
    } else if (lastCommand.type === COMMAND_TYPES.RESIZE) {
        const obj = drawnObjects.find(obj => obj.id === lastCommand.objectId);
        if (obj) {
            obj.scale = lastCommand.previousScale;
            if (lastCommand.previousScaleCenter) {
                obj.scaleCenter = lastCommand.previousScaleCenter;
            }
        }
    }
    
    clearCanvas();
    drawObjects();
    
    const actionName = lastCommand.type === COMMAND_TYPES.DRAW ? 'drawing' : 
                      lastCommand.type === COMMAND_TYPES.ERASE_ALL ? 'erase all' : 
                      lastCommand.type === COMMAND_TYPES.MOVE ? 'move' : 
                      lastCommand.type === COMMAND_TYPES.ROTATE ? 'rotation' : 'resize';
    statusDiv.textContent = `Undid ${actionName}!`;
    statusDiv.className = 'status ready';
    setTimeout(() => {
        updateToolStatus();
    }, 1500);
}

/**
 * Redo the last undone command
 */
function redoLastCommand() {
    if (redoHistory.length === 0) {
        statusDiv.textContent = 'Nothing to redo!';
        statusDiv.className = 'status loading';
        setTimeout(() => {
            updateToolStatus();
        }, 1500);
        return;
    }
    
    const commandToRedo = redoHistory.pop();
    commandHistory.push(commandToRedo);
    
    if (commandToRedo.type === COMMAND_TYPES.DRAW) {
        drawnObjects.push(commandToRedo.drawingData);
    } else if (commandToRedo.type === COMMAND_TYPES.ERASE_ALL) {
        drawnObjects = [];
        activeDrawing.clear();
    } else if (commandToRedo.type === COMMAND_TYPES.MOVE) {
        const obj = drawnObjects.find(obj => obj.id === commandToRedo.objectId);
        if (obj) {
            moveObject(obj, commandToRedo.deltaX, commandToRedo.deltaY);
        }
    } else if (commandToRedo.type === COMMAND_TYPES.ROTATE) {
        const obj = drawnObjects.find(obj => obj.id === commandToRedo.objectId);
        if (obj) {
            obj.rotation = commandToRedo.newRotation;
            if (commandToRedo.newRotationCenter) {
                obj.rotationCenter = commandToRedo.newRotationCenter;
            }
        }
    } else if (commandToRedo.type === COMMAND_TYPES.RESIZE) {
        const obj = drawnObjects.find(obj => obj.id === commandToRedo.objectId);
        if (obj) {
            obj.scale = commandToRedo.newScale;
            if (commandToRedo.newScaleCenter) {
                obj.scaleCenter = commandToRedo.newScaleCenter;
            }
        }
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawObjects();
    
    const actionName = commandToRedo.type === COMMAND_TYPES.DRAW ? 'drawing' : 
                      commandToRedo.type === COMMAND_TYPES.ERASE_ALL ? 'erase all' : 
                      commandToRedo.type === COMMAND_TYPES.MOVE ? 'move' : 
                      commandToRedo.type === COMMAND_TYPES.ROTATE ? 'rotation' : 'resize';
    statusDiv.textContent = `Redid ${actionName}!`;
    statusDiv.className = 'status ready';
    setTimeout(() => {
        updateToolStatus();
    }, 1500);
}

// =============================================================================
// DRAWING LOGIC
// =============================================================================

/**
 * Handle crazy mode drawing - all fingertips draw continuously
 */
function handleCrazyModeDrawing(handIndex, landmarks) {
    if (!crazyModeActive || currentTool !== 'crazy') {
        return;
    }
    
    // Initialize crazy mode drawings for this hand if not exists
    if (!crazyModeDrawings.has(handIndex)) {
        crazyModeDrawings.set(handIndex, new Map());
    }
    
    const handDrawings = crazyModeDrawings.get(handIndex);
    
    // Process each fingertip
    Object.entries(FINGERTIP_INDICES).forEach(([fingerName, fingertipIndex]) => {
        const fingertip = landmarks[fingertipIndex];
        const currentPos = {
            x: fingertip.x * canvas.width,
            y: fingertip.y * canvas.height
        };
        
        // Create unique drawing ID for this fingertip
        const drawingId = `${handIndex}_${fingertipIndex}`;
        
        if (!handDrawings.has(fingertipIndex)) {
            // Start new drawing for this fingertip
            handDrawings.set(fingertipIndex, {
                type: 'path',
                points: [currentPos],
                color: currentColor,
                width: currentBrushSize,
                opacity: currentOpacity,
                id: generateObjectId()
            });
        } else {
            // Continue existing drawing
            const drawing = handDrawings.get(fingertipIndex);
            drawing.points.push(currentPos);
        }
    });
}

/**
 * Handle drawing based on pinch state changes
 */
function handleDrawing(handIndex, landmarks, isPinched, wasPinched) {
    if (currentTool === null) {
        return;
    }
    
    const rawPosition = {
        x: (landmarks[FINGERTIP_INDICES.THUMB_TIP].x + landmarks[FINGERTIP_INDICES.INDEX_FINGER_TIP].x) / 2,
        y: (landmarks[FINGERTIP_INDICES.THUMB_TIP].y + landmarks[FINGERTIP_INDICES.INDEX_FINGER_TIP].y) / 2
    };
    addToPositionHistory(handIndex, rawPosition);
    
    const currentPos = getSmoothedPinchPosition(handIndex);
    if (!currentPos) {
        return;
    }
    
    const currentHandRotation = calculateHandRotation(landmarks);
    const currentFingerSpread = calculateFingerSpread(landmarks);
    
    handleDrawingLogic(handIndex, currentPos, isPinched, wasPinched, currentHandRotation, currentFingerSpread);
}

/**
 * Handle mouse drawing (simulating pinch gestures)
 */
function handleMouseDrawing(mouseX, mouseY, isPressed, wasPressed) {
    if (currentTool === null) {
        return;
    }
    
    const rawPosition = {
        x: mouseX / canvas.width,
        y: mouseY / canvas.height
    };
    addToPositionHistory(mouseState.handIndex, rawPosition);
    
    let currentPos = getSmoothedPinchPosition(mouseState.handIndex);
    if (!currentPos) {
        currentPos = { x: mouseX, y: mouseY };
    }
    
    handleDrawingLogic(mouseState.handIndex, currentPos, isPressed, wasPressed, 0, 0);
}

/**
 * Common drawing logic for both pinch and mouse
 */
function handleDrawingLogic(handIndex, currentPos, isPressed, wasPressed, handRotation = 0, fingerSpread = 0) {
    // Handle resize mode
    if (currentTool === 'resize') {
        if (isPressed && !wasPressed) {
            const obj = findObjectAtPosition(currentPos.x, currentPos.y);
            if (obj) {
                selectedObject = obj;
                isResizing = true;
                resizeStartSpread = fingerSpread;
                resizeStartScale = obj.scale || 1.0;
                
                if (!obj.scaleCenter) {
                    obj.scaleCenter = getObjectCenter(obj);
                }
            }
        } else if (isPressed && wasPressed && selectedObject && isResizing) {
            const spreadRatio = fingerSpread / resizeStartSpread;
            const newScale = resizeStartScale * spreadRatio;
            resizeObject(selectedObject, newScale, selectedObject.scaleCenter.x, selectedObject.scaleCenter.y);
        } else if (!isPressed && wasPressed && selectedObject && isResizing) {
            const finalSpreadRatio = fingerSpread / resizeStartSpread;
            const finalScale = resizeStartScale * finalSpreadRatio;
            
            if (Math.abs(finalScale - resizeStartScale) > 0.05) {
                addCommand({
                    type: COMMAND_TYPES.RESIZE,
                    objectId: selectedObject.id,
                    previousScale: resizeStartScale,
                    newScale: finalScale,
                    previousScaleCenter: selectedObject.scaleCenter,
                    newScaleCenter: selectedObject.scaleCenter,
                    timestamp: Date.now()
                });
            }
            
            selectedObject = null;
            isResizing = false;
            resizeStartSpread = null;
            resizeStartScale = null;
        }
        return;
    }
    
    // Handle rotation mode
    if (currentTool === 'rotate') {
        if (isPressed && !wasPressed) {
            const obj = findObjectAtPosition(currentPos.x, currentPos.y);
            if (obj) {
                selectedObject = obj;
                isRotating = true;
                rotationStartAngle = handRotation;
                rotationStartObjectAngle = obj.rotation || 0;
                
                if (!obj.rotationCenter) {
                    obj.rotationCenter = getObjectCenter(obj);
                }
            }
        } else if (isPressed && wasPressed && selectedObject && isRotating) {
            const rotationDelta = handRotation - rotationStartAngle;
            const newRotation = rotationStartObjectAngle + rotationDelta;
            rotateObject(selectedObject, newRotation, selectedObject.rotationCenter.x, selectedObject.rotationCenter.y);
        } else if (!isPressed && wasPressed && selectedObject && isRotating) {
            const finalRotationDelta = handRotation - rotationStartAngle;
            const finalRotation = rotationStartObjectAngle + finalRotationDelta;
            
            if (Math.abs(finalRotationDelta) > 0.1) {
                addCommand({
                    type: COMMAND_TYPES.ROTATE,
                    objectId: selectedObject.id,
                    previousRotation: rotationStartObjectAngle,
                    newRotation: finalRotation,
                    previousRotationCenter: selectedObject.rotationCenter,
                    newRotationCenter: selectedObject.rotationCenter,
                    timestamp: Date.now()
                });
            }
            
            selectedObject = null;
            isRotating = false;
            rotationStartAngle = null;
            rotationStartObjectAngle = null;
        }
        return;
    }
    
    // Handle drag mode
    if (currentTool === 'drag') {
        if (isPressed && !wasPressed) {
            const obj = findObjectAtPosition(currentPos.x, currentPos.y);
            if (obj) {
                selectedObject = obj;
                isDragging = true;
                dragStartPos = { x: currentPos.x, y: currentPos.y };
                
                if (obj.type === 'line') {
                    dragStartPos.objStartX = obj.startX;
                    dragStartPos.objStartY = obj.startY;
                    dragStartPos.objEndX = obj.endX;
                    dragStartPos.objEndY = obj.endY;
                } else if (obj.type === 'rectangle') {
                    dragStartPos.objStartX = obj.startX;
                    dragStartPos.objStartY = obj.startY;
                    dragStartPos.objEndX = obj.endX;
                    dragStartPos.objEndY = obj.endY;
                } else if (obj.type === 'path') {
                    dragStartPos.objPoints = obj.points.map(p => ({ x: p.x, y: p.y }));
                }
            }
        } else if (isPressed && wasPressed && selectedObject) {
            const deltaX = currentPos.x - dragStartPos.x;
            const deltaY = currentPos.y - dragStartPos.y;
            
            if (selectedObject.type === 'line') {
                selectedObject.startX = dragStartPos.objStartX;
                selectedObject.startY = dragStartPos.objStartY;
                selectedObject.endX = dragStartPos.objEndX;
                selectedObject.endY = dragStartPos.objEndY;
            } else if (selectedObject.type === 'rectangle') {
                selectedObject.startX = dragStartPos.objStartX;
                selectedObject.startY = dragStartPos.objStartY;
                selectedObject.endX = dragStartPos.objEndX;
                selectedObject.endY = dragStartPos.objEndY;
            } else if (selectedObject.type === 'path') {
                selectedObject.points = dragStartPos.objPoints.map(p => ({ x: p.x, y: p.y }));
            }
            
            moveObject(selectedObject, deltaX, deltaY);
        } else if (!isPressed && wasPressed && selectedObject) {
            const deltaX = currentPos.x - dragStartPos.x;
            const deltaY = currentPos.y - dragStartPos.y;
            
            if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
                addCommand({
                    type: COMMAND_TYPES.MOVE,
                    objectId: selectedObject.id,
                    deltaX: deltaX,
                    deltaY: deltaY,
                    timestamp: Date.now()
                });
            }
            
            selectedObject = null;
            isDragging = false;
            dragStartPos = null;
        }
        return;
    }
    
    // Handle drawing modes
    if (isPressed && !wasPressed) {
        if (currentTool === 'line') {
            activeDrawing.set(handIndex, {
                type: 'line',
                startX: currentPos.x,
                startY: currentPos.y,
                endX: currentPos.x,
                endY: currentPos.y,
                color: currentColor,
                width: currentBrushSize,
                opacity: currentOpacity,
                id: generateObjectId()
            });
        } else if (currentTool === 'draw') {
            activeDrawing.set(handIndex, {
                type: 'path',
                points: [{x: currentPos.x, y: currentPos.y}],
                color: currentColor,
                width: currentBrushSize,
                opacity: currentOpacity,
                id: generateObjectId()
            });
        } else if (currentTool === 'shapes') {
            activeDrawing.set(handIndex, {
                type: 'shape',
                shape: currentShape,
                fillMode: currentFillMode,
                startX: currentPos.x,
                startY: currentPos.y,
                endX: currentPos.x,
                endY: currentPos.y,
                color: currentColor,
                width: currentBrushSize,
                opacity: currentOpacity,
                id: generateObjectId()
            });
        } else if (currentTool === 'rectangle') {
            // Legacy rectangle support
            activeDrawing.set(handIndex, {
                type: 'rectangle',
                startX: currentPos.x,
                startY: currentPos.y,
                endX: currentPos.x,
                endY: currentPos.y,
                color: currentColor,
                width: currentBrushSize,
                opacity: currentOpacity,
                id: generateObjectId()
            });
        }
    } else if (isPressed && wasPressed) {
        if (activeDrawing.has(handIndex)) {
            const drawing = activeDrawing.get(handIndex);
            if (drawing.type === 'line') {
                drawing.endX = currentPos.x;
                drawing.endY = currentPos.y;
            } else if (drawing.type === 'path') {
                drawing.points.push({x: currentPos.x, y: currentPos.y});
            } else if (drawing.type === 'rectangle' || drawing.type === 'shape') {
                drawing.endX = currentPos.x;
                drawing.endY = currentPos.y;
            }
        }
    } else if (!isPressed && wasPressed) {
        if (activeDrawing.has(handIndex)) {
            const drawing = activeDrawing.get(handIndex);
            drawnObjects.push({...drawing});
            
            addCommand({
                type: COMMAND_TYPES.DRAW,
                objectId: drawing.id,
                drawingData: {...drawing},
                timestamp: Date.now()
            });
            
            activeDrawing.delete(handIndex);
        }
    }
}

// =============================================================================
// UI AND TOOL MANAGEMENT
// =============================================================================

/**
 * Tool selection with toggle behavior
 */
function selectTool(toolName) {
    if (currentTool === toolName) {
        currentTool = null;
        document.getElementById(`${toolName}-tool`).classList.remove('active');
        
        // Deactivate crazy mode
        if (toolName === 'crazy') {
            crazyModeActive = false;
            crazyModeDrawings.clear();
        }
        
        // Hide shapes palette when shapes tool is deactivated
        if (toolName === 'shapes') {
            document.querySelector('.shape-controls').classList.remove('show');
        }
    } else {
        currentTool = toolName;
        
        document.querySelectorAll('.tool-button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        document.getElementById(`${toolName}-tool`).classList.add('active');
        
        // Show/hide shapes palette based on tool selection
        const shapesToolActive = toolName === 'shapes';
        const shapeControls = document.querySelector('.shape-controls');
        
        if (shapesToolActive) {
            shapeControls.classList.add('show');
        } else {
            shapeControls.classList.remove('show');
        }
        
        // Activate crazy mode
        if (toolName === 'crazy') {
            crazyModeActive = true;
            crazyModeDrawings.clear(); // Clear any previous crazy mode drawings
        } else {
            crazyModeActive = false;
        }
    }
    
    updateToolStatus();
}

/**
 * Select shape for shapes tool
 */
function selectShape(shape) {
    currentShape = shape;
    
    // Update button states
    document.querySelectorAll('.shape-button').forEach(button => {
        button.classList.remove('active');
    });
    document.getElementById(`${shape}-shape`).classList.add('active');
    
    updateToolStatus();
}

/**
 * Select fill mode for shapes tool
 */
function selectFillMode(mode) {
    currentFillMode = mode;
    
    // Update button states
    document.querySelectorAll('.fill-button').forEach(button => {
        button.classList.remove('active');
    });
    document.getElementById(`${mode}-mode`).classList.add('active');
    
    updateToolStatus();
}

/**
 * Color selection function
 */
function selectColor(color) {
    currentColor = color;
    
    document.querySelectorAll('.color-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelector(`[data-color="${color}"]`).classList.add('active');
}

/**
 * Brush size selection function
 */
function selectBrushSize(size) {
    currentBrushSize = size;
    
    document.querySelectorAll('.size-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelector(`[data-size="${size}"]`).classList.add('active');
}

/**
 * Opacity selection function
 */
function selectOpacity(opacity) {
    currentOpacity = opacity;
    
    document.querySelectorAll('.opacity-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelector(`[data-opacity="${opacity}"]`).classList.add('active');
}

/**
 * Background mode selection function
 */
function selectBackgroundMode(mode) {
    backgroundMode = mode;
    
    document.querySelectorAll('.background-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (mode === 'camera') {
        document.getElementById('camera-bg').classList.add('active');
        document.getElementById('bg-color-picker').disabled = true;
    } else if (mode === 'solid') {
        document.getElementById('solid-bg').classList.add('active');
        document.getElementById('bg-color-picker').disabled = false;
    }
}

/**
 * Background color selection function
 */
function selectBackgroundColor(color) {
    backgroundColor = color;
    document.getElementById('bg-color-picker').value = color;
}

/**
 * Update status message based on current tool
 */
function updateToolStatus() {
    if (currentTool === null) {
        statusDiv.textContent = 'No tool selected - click a tool to start drawing';
        statusDiv.className = 'status loading';
    } else if (currentTool === 'shapes') {
        statusDiv.textContent = `Shapes tool selected - ${currentShape} (${currentFillMode}) - pinch or click to draw`;
        statusDiv.className = 'status ready';
    } else if (currentTool === 'crazy') {
        statusDiv.textContent = '🔥 CRAZY MODE ACTIVE - All 10 fingertips are drawing continuously!';
        statusDiv.className = 'status ready';
    } else {
        statusDiv.textContent = `${currentTool.charAt(0).toUpperCase() + currentTool.slice(1)} tool selected - pinch or click to draw`;
        statusDiv.className = 'status ready';
    }
}

/**
 * Save drawing as image
 */
function saveDrawing() {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    drawnObjects.forEach(obj => {
        tempCtx.save();
        
        if (obj.scale && obj.scale !== 1.0 && obj.scaleCenter) {
            tempCtx.translate(obj.scaleCenter.x, obj.scaleCenter.y);
            tempCtx.scale(obj.scale, obj.scale);
            tempCtx.translate(-obj.scaleCenter.x, -obj.scaleCenter.y);
        }
        
        if (obj.rotation && obj.rotationCenter) {
            tempCtx.translate(obj.rotationCenter.x, obj.rotationCenter.y);
            tempCtx.rotate(obj.rotation);
            tempCtx.translate(-obj.rotationCenter.x, -obj.rotationCenter.y);
        }
        
        drawSingleObject(obj, obj.color, obj.width);
        tempCtx.restore();
    });
    
    const link = document.createElement('a');
    link.download = `hand-drawing-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
    
    statusDiv.textContent = 'Drawing saved successfully!';
    statusDiv.className = 'status ready';
    setTimeout(() => {
        updateToolStatus();
    }, 2000);
}

// =============================================================================
// MEDIAPIPE AND CAMERA INITIALIZATION
// =============================================================================

/**
 * Initialize MediaPipe Hands
 */
function initializeHands() {
    statusDiv.textContent = 'Initializing hand tracking...';
    statusDiv.className = 'status loading';

    try {
        hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: MIN_DETECTION_CONFIDENCE,
            minTrackingConfidence: MIN_TRACKING_CONFIDENCE
        });

        hands.onResults(onHandsResults);
        
        statusDiv.textContent = 'Hand tracking initialized - starting camera...';
        return true;
    } catch (error) {
        console.error('Error initializing MediaPipe Hands:', error);
        statusDiv.textContent = 'Error: Failed to initialize hand tracking. Please refresh the page.';
        statusDiv.className = 'status error';
        return false;
    }
}

/**
 * Initialize camera
 */
async function initializeCamera() {
    try {
        statusDiv.textContent = 'Accessing camera...';
        statusDiv.className = 'status loading';

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: 'user'
            }
        });

        video.srcObject = stream;
        
        await new Promise((resolve) => {
            video.onloadedmetadata = resolve;
        });

        statusDiv.textContent = 'Camera ready - initializing MediaPipe...';

        camera = new Camera(video, {
            onFrame: async () => {
                if (hands) {
                    await hands.send({ image: video });
                }
            },
            width: 1920,
            height: 1080
        });

        await camera.start();

        statusDiv.textContent = 'Ready! Show your hands to the camera';
        statusDiv.className = 'status ready';

    } catch (error) {
        console.error('Error accessing camera:', error);
        statusDiv.textContent = 'Error: Could not access camera. Please allow camera permissions and refresh.';
        statusDiv.className = 'status error';
    }
}

/**
 * Handle hand tracking results
 */
function onHandsResults(results) {
    clearCanvas();

    // Collect fingertip data to draw after objects
    let fingertipData = [];

    if (results.multiHandLandmarks) {
        let totalPinches = 0;
        let validHands = 0;
        
        results.multiHandLandmarks.forEach((landmarks, handIndex) => {
            let handConfidence = 1.0;
            
            if (results.multiHandedness && results.multiHandedness[handIndex]) {
                handConfidence = results.multiHandedness[handIndex].score;
            }
            
            if (handConfidence >= MIN_TRACKING_CONFIDENCE) {
                validHands++;
                
                const rawPinching = isRawPinching(landmarks);
                const wasPinched = getHandPinchState(handIndex).isPinched;
                const isPinched = updatePinchState(handIndex, rawPinching);
                
                handleDrawing(handIndex, landmarks, isPinched, wasPinched);
                handleCrazyModeDrawing(handIndex, landmarks); // Add this line for crazy mode
                
                if (isPinched) {
                    totalPinches++;
                }
                
                // Store fingertip data for later drawing
                fingertipData.push({
                    landmarks: landmarks,
                    isPinched: isPinched
                });
            }
        });

        const currentHandIndices = new Set();
        if (results.multiHandLandmarks) {
            results.multiHandLandmarks.forEach((landmarks, handIndex) => {
                let handConfidence = 1.0;
                if (results.multiHandedness && results.multiHandedness[handIndex]) {
                    handConfidence = results.multiHandedness[handIndex].score;
                }
                if (handConfidence >= MIN_TRACKING_CONFIDENCE) {
                    currentHandIndices.add(handIndex);
                }
            });
        }

        for (const [handIndex] of handPinchStates) {
            if (!currentHandIndices.has(handIndex)) {
                handPinchStates.delete(handIndex);
                activeDrawing.delete(handIndex);
                
                // Finalize crazy mode drawings for removed hands
                if (crazyModeActive && crazyModeDrawings.has(handIndex)) {
                    const handDrawings = crazyModeDrawings.get(handIndex);
                    handDrawings.forEach((drawing, fingertipIndex) => {
                        if (drawing.points && drawing.points.length > 1) {
                            drawnObjects.push({...drawing});
                            addCommand({
                                type: COMMAND_TYPES.DRAW,
                                objectId: drawing.id,
                                drawingData: {...drawing},
                                timestamp: Date.now()
                            });
                        }
                    });
                    crazyModeDrawings.delete(handIndex);
                }
            }
        }
        
        cleanupPositionHistory(currentHandIndices);

        let statusText = `Tracking ${validHands} valid hand${validHands !== 1 ? 's' : ''}`;
        if (results.multiHandLandmarks.length > validHands) {
            const lowConfidenceHands = results.multiHandLandmarks.length - validHands;
            statusText += ` (${lowConfidenceHands} low confidence)`;
        }
        
        if (mouseState.isPressed && currentTool !== null) {
            statusText += ` - Mouse drawing active`;
        } else if (totalPinches > 0 && currentTool !== null) {
            statusText += ` - ${totalPinches} pinch${totalPinches !== 1 ? 'es' : ''} detected!`;
        } else if (totalPinches > 0 && currentTool === null) {
            statusText += ` - select a tool to draw`;
        } else if (currentTool !== null) {
            statusText += ` - ${currentTool} tool ready`;
        }
        
        statusDiv.textContent = statusText;
        statusDiv.className = 'status ready';
    } else {
        handPinchStates.clear();
        activeDrawing.delete(mouseState.handIndex);
        handPositionHistory.clear();
        
        // Finalize all crazy mode drawings when no hands detected
        if (crazyModeActive && crazyModeDrawings.size > 0) {
            crazyModeDrawings.forEach((handDrawings, handIndex) => {
                handDrawings.forEach((drawing, fingertipIndex) => {
                    if (drawing.points && drawing.points.length > 1) {
                        drawnObjects.push({...drawing});
                        addCommand({
                            type: COMMAND_TYPES.DRAW,
                            objectId: drawing.id,
                            drawingData: {...drawing},
                            timestamp: Date.now()
                        });
                    }
                });
            });
            crazyModeDrawings.clear();
        }
        
        if (mouseState.isPressed && currentTool !== null) {
            statusDiv.textContent = 'Mouse drawing active - No hands detected';
            statusDiv.className = 'status ready';
        } else {
            statusDiv.textContent = 'No hands detected - show your hands to the camera or use your mouse to draw';
            statusDiv.className = 'status loading';
        }
    }

    // Draw objects first
    drawObjects();
    
    // Draw mouse cursor if active
    if (mouseState.isPressed && currentTool !== null) {
        drawMouseCursor(mouseState.position.x, mouseState.position.y);
    }
    
    // Draw fingertips on top of everything
    fingertipData.forEach(data => {
        drawFingertips(data.landmarks, data.isPinched);
    });
}

// =============================================================================
// EVENT LISTENERS AND INITIALIZATION
// =============================================================================

/**
 * Initialize the application
 */
async function init() {
    try {
        if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
            statusDiv.textContent = 'Error: MediaPipe libraries failed to load. Please refresh the page.';
            statusDiv.className = 'status error';
            return;
        }

        const handsInitialized = initializeHands();
        if (!handsInitialized) {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        await initializeCamera();

    } catch (error) {
        console.error('Initialization error:', error);
        statusDiv.textContent = 'Error: Failed to initialize application. Please refresh the page.';
        statusDiv.className = 'status error';
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Tool selection
    document.getElementById('line-tool').addEventListener('click', () => selectTool('line'));
    document.getElementById('draw-tool').addEventListener('click', () => selectTool('draw'));
    document.getElementById('shapes-tool').addEventListener('click', () => selectTool('shapes'));
    document.getElementById('drag-tool').addEventListener('click', () => selectTool('drag'));
    document.getElementById('rotate-tool').addEventListener('click', () => selectTool('rotate'));
    document.getElementById('resize-tool').addEventListener('click', () => selectTool('resize'));
    document.getElementById('crazy-tool').addEventListener('click', () => selectTool('crazy'));

    // Shape selection
    document.getElementById('rectangle-shape').addEventListener('click', () => selectShape('rectangle'));
    document.getElementById('circle-shape').addEventListener('click', () => selectShape('circle'));
    document.getElementById('oval-shape').addEventListener('click', () => selectShape('oval'));
    document.getElementById('star-shape').addEventListener('click', () => selectShape('star'));

    // Fill mode selection
    document.getElementById('outline-mode').addEventListener('click', () => selectFillMode('outline'));
    document.getElementById('filled-mode').addEventListener('click', () => selectFillMode('filled'));

    // Erase all
    document.getElementById('erase-tool').addEventListener('click', () => {
        const previousObjects = [...drawnObjects];
        
        drawnObjects = [];
        activeDrawing.clear();
        
        if (previousObjects.length > 0) {
            addCommand({
                type: COMMAND_TYPES.ERASE_ALL,
                previousObjects: previousObjects,
                timestamp: Date.now()
            });
        }
        
        clearCanvas();
        drawObjects();
        
        statusDiv.textContent = 'All drawings erased!';
        statusDiv.className = 'status ready';
        
        setTimeout(() => {
            if (statusDiv.textContent === 'All drawings erased!') {
                updateToolStatus();
            }
        }, 2000);
    });
    
    // Undo/Redo
    document.getElementById('undo-tool').addEventListener('click', undoLastCommand);
    document.getElementById('redo-tool').addEventListener('click', redoLastCommand);

    // Info modal
    document.getElementById('info-tool').addEventListener('click', () => {
        document.getElementById('info-modal').style.display = 'block';
    });

    document.getElementById('close-info').addEventListener('click', () => {
        document.getElementById('info-modal').style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        const modal = document.getElementById('info-modal');
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    });
    
    // Color selection
    document.getElementById('cyan-color').addEventListener('click', () => selectColor('#00ffff'));
    document.getElementById('magenta-color').addEventListener('click', () => selectColor('#ff00ff'));
    document.getElementById('yellow-color').addEventListener('click', () => selectColor('#ffff00'));
    document.getElementById('black-color').addEventListener('click', () => selectColor('#000000'));
    document.getElementById('white-color').addEventListener('click', () => selectColor('#ffffff'));

    // Brush size selection
    document.getElementById('small-size').addEventListener('click', () => selectBrushSize(2));
    document.getElementById('medium-size').addEventListener('click', () => selectBrushSize(4));
    document.getElementById('large-size').addEventListener('click', () => selectBrushSize(8));
    
    // Opacity selection
    document.getElementById('low-opacity').addEventListener('click', () => selectOpacity(0.3));
    document.getElementById('medium-opacity').addEventListener('click', () => selectOpacity(0.6));
    document.getElementById('high-opacity').addEventListener('click', () => selectOpacity(1.0));

    // Background mode selection
    document.getElementById('camera-bg').addEventListener('click', () => selectBackgroundMode('camera'));
    document.getElementById('solid-bg').addEventListener('click', () => selectBackgroundMode('solid'));
    document.getElementById('bg-color-picker').addEventListener('input', (e) => selectBackgroundColor(e.target.value));

    // Save functionality
    document.getElementById('save-tool').addEventListener('click', saveDrawing);
    
    // Mouse events
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const rawMouseX = e.clientX - rect.left;
        const rawMouseY = e.clientY - rect.top;
        
        const mouseX = canvas.width - rawMouseX;
        const mouseY = rawMouseY;
        
        const wasPressed = mouseState.isPressed;
        mouseState.isPressed = true;
        mouseState.position = { x: mouseX, y: mouseY };
        
        handleMouseDrawing(mouseX, mouseY, true, wasPressed);
        redrawForMouse();
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (mouseState.isPressed) {
            const rect = canvas.getBoundingClientRect();
            const rawMouseX = e.clientX - rect.left;
            const rawMouseY = e.clientY - rect.top;
            
            const mouseX = canvas.width - rawMouseX;
            const mouseY = rawMouseY;
            
            mouseState.position = { x: mouseX, y: mouseY };
            handleMouseDrawing(mouseX, mouseY, true, true);
            redrawForMouse();
        }
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (mouseState.isPressed) {
            const rect = canvas.getBoundingClientRect();
            const rawMouseX = e.clientX - rect.left;
            const rawMouseY = e.clientY - rect.top;
            
            const mouseX = canvas.width - rawMouseX;
            const mouseY = rawMouseY;
            
            mouseState.position = { x: mouseX, y: mouseY };
            handleMouseDrawing(mouseX, mouseY, false, true);
            mouseState.isPressed = false;
            redrawForMouse();
        }
    });
    
    canvas.addEventListener('mouseleave', (e) => {
        if (mouseState.isPressed) {
            const rect = canvas.getBoundingClientRect();
            const rawMouseX = e.clientX - rect.left;
            const rawMouseY = e.clientY - rect.top;
            
            const mouseX = canvas.width - rawMouseX;
            const mouseY = rawMouseY;
            
            mouseState.position = { x: mouseX, y: mouseY };
            handleMouseDrawing(mouseX, mouseY, false, true);
            mouseState.isPressed = false;
            redrawForMouse();
        }
    });

    // Window events
    window.addEventListener('resize', resizeCanvas);
    
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (camera) {
                camera.stop();
            }
        } else {
            if (camera) {
                camera.start();
            }
        }
    });

    window.addEventListener('beforeunload', () => {
        if (camera) {
            camera.stop();
        }
    });

    window.addEventListener('error', (event) => {
        console.error('Application error:', event.error);
        statusDiv.textContent = 'Error: Something went wrong. Please refresh the page.';
        statusDiv.className = 'status error';
    });
}

// =============================================================================
// APPLICATION STARTUP
// =============================================================================

window.addEventListener('load', () => {
    // Get DOM elements
    video = document.getElementById('video');
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    statusDiv = document.getElementById('status');

    // Initialize canvas
    resizeCanvas();
    
    // Setup event listeners
    setupEventListeners();
    
    // Set initial tool status
    updateToolStatus();
    
    // Initialize background controls
    selectBackgroundMode('camera');
    selectBackgroundColor('#ffffff');
    
    // Start the application
    setTimeout(init, 100);
}); 