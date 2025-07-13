# Hand Tracking Drawing Application

A web-based drawing application that uses MediaPipe hand tracking to allow users to draw using hand gestures. Users can draw, rotate, resize, and manipulate objects using natural hand movements.

## Features

### Drawing Tools
- **Line Tool**: Draw straight lines between two points
- **Draw Tool**: Free-hand drawing with path tracking
- **Rectangle Tool**: Draw rectangles by defining corners
- **Drag Tool**: Move existing objects around the canvas
- **Rotate Tool**: Rotate objects by twisting your hand
- **Resize Tool**: Scale objects by spreading/closing fingers

### Interaction Methods
- **Hand Gestures**: Use pinch gestures (thumb + index finger) to draw
- **Mouse Support**: Full mouse support as fallback
- **Multi-hand Support**: Track up to 2 hands simultaneously

### Additional Features
- **Color Palette**: 5 predefined colors (cyan, magenta, yellow, black, white)
- **Brush Sizes**: 3 different brush sizes (small, medium, large)
- **Undo/Redo**: Complete command history with undo/redo functionality
- **Save Drawings**: Export drawings as PNG images
- **Real-time Feedback**: Visual feedback for hand tracking and gestures

## File Structure

```
hand-tracking-drawing/
├── index.html          # Main HTML structure
├── styles.css          # All CSS styles and responsive design
├── app.js              # Main application logic and MediaPipe integration
└── README.md           # This documentation file
```

## How to Use

### Setup
1. Clone or download the project files
2. Serve the files using a local HTTP server (required for camera access)
3. Open in a modern web browser with camera permissions

### Basic Usage
1. **Allow camera access** when prompted
2. **Select a tool** from the toolbar at the bottom
3. **Choose a color** and brush size
4. **Start drawing** by pinching your thumb and index finger together
5. **Move your hand** while pinching to draw

### Advanced Gestures
- **Rotate Objects**: Use the Rotate tool, pinch to select an object, then twist your hand
- **Resize Objects**: Use the Resize tool, pinch to select an object, then spread or close your other fingers
- **Drag Objects**: Use the Drag tool to move objects around the canvas

### Keyboard Shortcuts
- Mouse can be used as a fallback for all drawing operations
- All tools work with both hand gestures and mouse input

## Technical Details

### Dependencies
- **MediaPipe Hands**: For hand tracking and landmark detection
- **MediaPipe Camera Utils**: For camera management
- **Modern Web Browser**: With WebRTC and Canvas API support

### Architecture
The application is organized into several key modules:

- **Constants & Configuration**: Landmark indices, thresholds, and settings
- **Canvas & Drawing Functions**: Rendering and visual feedback
- **Object Manipulation**: Hit detection, transformation, and object management
- **Gesture Recognition**: Pinch detection, hand rotation, and finger spread calculation
- **Command System**: Undo/redo functionality with command history
- **MediaPipe Integration**: Hand tracking and camera initialization

### Performance Optimizations
- **Smoothing System**: Moving average filter for stable hand tracking
- **Confidence Filtering**: Only process hands with sufficient tracking confidence
- **Efficient Rendering**: Canvas transformations for object scaling and rotation
- **Memory Management**: Cleanup of unused hand states and position history

## Browser Compatibility

### Supported Browsers
- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

### Requirements
- Camera access permissions
- WebRTC support
- Canvas API support
- ES6+ JavaScript support

## Development

### Running Locally
```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx http-server

# Using PHP
php -S localhost:8000
```

### Code Structure
The JavaScript code is organized into clear sections:
- **Constants and Configuration**: All configurable values
- **Global Variables**: Application state management
- **Utility Functions**: Helper functions for calculations
- **Canvas and Drawing Functions**: Rendering logic
- **Object Manipulation**: Object transformation and hit detection
- **Gesture Recognition**: Hand tracking and gesture detection
- **Command System**: Undo/redo functionality
- **UI Management**: Tool selection and status updates
- **MediaPipe Integration**: Camera and hand tracking setup

### Customization
- **Colors**: Modify the color palette in the HTML and event listeners
- **Brush Sizes**: Adjust size values in the HTML data attributes
- **Gesture Thresholds**: Modify constants at the top of `app.js`
- **Confidence Levels**: Adjust `MIN_DETECTION_CONFIDENCE` and `MIN_TRACKING_CONFIDENCE`

## Troubleshooting

### Common Issues
1. **Camera not working**: Ensure HTTPS or localhost, check browser permissions
2. **Hand tracking unstable**: Ensure good lighting and clear hand visibility
3. **Gestures not detected**: Check hand is within camera view and well-lit
4. **Performance issues**: Close other applications using the camera

### Performance Tips
- Use good lighting for better hand detection
- Keep hands clearly visible in camera view
- Avoid rapid hand movements for better tracking
- Use a stable camera position

## Future Enhancements

### Potential Features
- **More Drawing Tools**: Circle, polygon, text tools
- **Layer System**: Multiple drawing layers
- **Collaborative Drawing**: Multi-user support
- **Voice Commands**: Voice-activated tool switching
- **Gesture Customization**: User-defined gestures
- **Mobile Support**: Touch-based interaction for mobile devices

### Technical Improvements
- **WebGL Rendering**: Better performance for complex drawings
- **Web Workers**: Background processing for hand tracking
- **Progressive Web App**: Offline support and app-like experience
- **Cloud Storage**: Save and sync drawings across devices

## License

This project is open source and available under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## Credits

- **MediaPipe**: Google's MediaPipe framework for hand tracking
- **Canvas API**: HTML5 Canvas for rendering
- **WebRTC**: For camera access and streaming 