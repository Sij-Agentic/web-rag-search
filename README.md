# Web Content RAG Search

A browser extension that indexes web content and provides semantic search using vector embeddings.

## New Architecture

This project now uses a client-server architecture:

1. **Browser Extension**: A lightweight client that captures web content and provides the user interface for search
2. **FastAPI Server**: A backend service that handles vectorization and indexing using Ollama and FAISS

This separation of concerns provides several benefits:
- Smaller, more maintainable browser extension
- Better vector search performance using FAISS
- High-quality embeddings using Ollama models
- Centralized index that can be shared across browsers/devices

## Components

### Browser Extension

The extension allows users to:
- Index the content of web pages they visit
- Search through indexed content using natural language queries
- View and manage their indexed pages

### FastAPI Server

The server handles:
- Generating embeddings for text chunks using Ollama
- Storing and searching vectors efficiently with FAISS
- Persistent storage of the index

## Setup

### 1. Set up the FastAPI server

See [API README](api/README.md) for detailed instructions.

### 2. Install the browser extension

1. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select this directory

## Usage

1. Start the FastAPI server
2. Open the extension popup
3. Index web pages you want to search later
4. Use the search tab to find content across your indexed pages

## Development

- The extension is built with vanilla JavaScript
- The API server uses FastAPI, FAISS, and Ollama

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 