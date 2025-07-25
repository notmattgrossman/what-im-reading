# Reading Archive

A minimal, elegant web application for organizing and managing your reading materials. Built with vanilla JavaScript and a clean Material Design interface.

![Reading Archive Interface](https://img.shields.io/badge/interface-Material%20Design-blue)
![Technology](https://img.shields.io/badge/tech-Vanilla%20JS-yellow)
![Backend](https://img.shields.io/badge/backend-Python-green)

## Features

### 📚 Article Management
- **Add Articles**: Click the + button to add new articles with title, URL, date, and personal notes
- **Inline Editing**: Click any article to edit directly in place
- **Personal Reviews**: Add your thoughts and notes for each article
- **Favorites**: Mark important articles with a star
- **Auto-save**: Changes are automatically saved as you type

### 🏷️ Advanced Tagging & Filtering
- **Dynamic Tags**: Add multiple tags to categorize articles
- **Multi-tag Filtering**: Filter by multiple tags simultaneously (AND logic)
- **Interactive Filtering**: Click tags to add/remove filters
- **Visual Feedback**: Active filters are highlighted in orange
- **Quick Clear**: Remove individual tags or clear all filters

### 🎨 User Interface
- **Material Design 3**: Clean, modern interface following Google's design principles
- **Minimal Aesthetic**: Distraction-free reading experience
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Hover Effects**: Intuitive visual feedback
- **Keyboard Shortcuts**: Save with Ctrl+S/Cmd+S, Cancel with Escape

## Quick Start

### Prerequisites
- Python 3.6+ (for the backend server)
- Modern web browser

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd reading-archive
   ```

2. **Start the server**
   ```bash
   python3 server.py
   ```

3. **Open in browser**
   Navigate to `http://localhost:8000`

That's it! No additional dependencies or build steps required.

## Usage

### Adding Articles
1. Click the **+** button (bottom right)
2. Enter the article URL and title
3. Add tags, reviews, and mark as favorite if desired
4. Changes save automatically

### Organizing with Tags
- Add tags while editing any article
- Click any tag to filter articles
- Add multiple tags for precise filtering
- Use "Clear All" to remove all filters

### Editing Articles
- Click any article to enter edit mode
- All fields are editable: title, URL, date, review, tags, favorite status
- Save with **Ctrl+S** (Cmd+S on Mac) or click outside
- Cancel with **Escape** key

## Technical Architecture

### Frontend
- **Framework**: Vanilla JavaScript (no dependencies)
- **UI Components**: Material Design Web Components
- **Styling**: CSS3 with Material Design 3 tokens
- **Data Format**: CSV for human-readable storage

### Backend
- **Server**: Python 3 HTTP server
- **API**: RESTful endpoint for data persistence
- **Storage**: CSV file (`articles.csv`)
- **CORS**: Full cross-origin support

### Data Structure
Each article contains:
```javascript
{
    title: "Article Title",
    url: "https://example.com",
    date: "2025-01-24",
    favorite: true,
    review: "Your personal notes",
    tags: ["design", "technology"],
    domain: "example.com"
}
```

## Files Overview

- **`index.html`** - Main application entry point
- **`script.js`** - Core application logic and functionality
- **`styles.css`** - Material Design styling
- **`server.py`** - Python backend server
- **`articles.csv`** - Data storage (CSV format)

## Contributing

This project uses vanilla web technologies to maintain simplicity and performance. When contributing:

1. Maintain the minimal, dependency-free approach
2. Follow Material Design principles
3. Ensure accessibility and responsive design
4. Test across modern browsers

## License

[Add your license here]

## Roadmap

- [ ] Import/export functionality
- [ ] Search within articles and reviews
- [ ] Dark mode support
- [ ] Backup and sync options
- [ ] Browser extension for quick saves

---

**Made with ❤️ for readers who love organization** 