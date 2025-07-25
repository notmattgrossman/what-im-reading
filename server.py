#!/usr/bin/env python3
"""
Simple HTTP server for the Reading Archive application.
Handles both static file serving and CSV updates.
"""

import http.server
import socketserver
import json
import urllib.parse
from pathlib import Path
import os

class ReadingArchiveHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler for the reading archive application."""
    
    def do_POST(self):
        """Handle POST requests for saving CSV data."""
        if self.path == '/api/save-csv':
            self.handle_save_csv()
        else:
            self.send_error(404, "Not Found")
    
    def handle_save_csv(self):
        """Handle CSV save requests."""
        try:
            # Get content length
            content_length = int(self.headers.get('Content-Length', 0))
            
            # Read the CSV content
            csv_content = self.rfile.read(content_length).decode('utf-8')
            
            # Write to articles.csv file
            with open('articles.csv', 'w', encoding='utf-8') as f:
                f.write(csv_content)
            
            # Send success response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            
            response = json.dumps({'status': 'success', 'message': 'CSV saved successfully'})
            self.wfile.write(response.encode('utf-8'))
            
            print(f"CSV file saved successfully")
            
        except Exception as e:
            print(f"Error saving CSV: {e}")
            self.send_error(500, f"Internal Server Error: {e}")
    
    def do_OPTIONS(self):
        """Handle OPTIONS requests for CORS preflight."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def end_headers(self):
        """Add CORS headers to all responses."""
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def run_server(port=8000):
    """Run the server on the specified port."""
    with socketserver.TCPServer(("", port), ReadingArchiveHandler) as httpd:
        print(f"Server running at http://localhost:{port}/")
        print("Press Ctrl+C to stop the server")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == "__main__":
    run_server() 