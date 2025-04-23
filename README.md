# Web RAG Search

A powerful browser extension and API server for semantic search across web content using vector embeddings.

## Overview

Web RAG Search lets you index web content and search it using natural language queries. It uses a client-server architecture:

1. **Browser Extension**: Extracts and indexes web content, provides a user interface for search
2. **FastAPI Server**: Generates embeddings via Ollama and performs vector search using FAISS

This separation of concerns provides several benefits:
- Lightweight browser extension with minimal client-side computing
- High-quality embeddings using Ollama models
- Efficient similarity search with FAISS
- Persistent storage of the vector index
- Shared index that can be used across multiple browsers/devices

![Architecture Diagram](images/architecture.png)

## Features

- **Content Indexing**: Extract and index content from any web page
- **Semantic Search**: Use natural language to search across all indexed content
- **Highlighting**: Highlight search results on the original web pages
- **Index Management**: View and delete indexed pages
- **Search History**: Keep track of previous searches
- **API Status Indicator**: Real-time indication of API connectivity

## Setup Instructions

### 1. FastAPI Server Setup

The server handles vectorization and similarity search using Ollama and FAISS.

#### Prerequisites

- Python 3.8 or higher
- [Ollama](https://ollama.ai/) installed and running

#### Installation

1. Navigate to the API directory:
   ```
   cd api
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Create a `.env` file in the `api` directory (or set environment variables):
   ```
   # Ollama configuration
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=nomic-embed-text  # or another embedding model

   # API configuration 
   PORT=8000
   HOST=0.0.0.0

   # Storage configuration
   INDEX_PATH=./data/index_data.json
   ```

4. Create the data directory:
   ```
   mkdir -p data
   ```

5. Make sure Ollama is running with an embedding model:
   ```
   ollama run nomic-embed-text
   ```
   You can substitute any other embedding model compatible with Ollama.

#### Running the API Server

Start the server with:

```
python main.py
```

Or for more control:

```
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at http://localhost:8000. You can verify it's running by visiting http://localhost:8000/health which should return `{"status": "ok"}`.

### 2. Browser Extension Setup

#### Installation

1. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in the top-right)
   - Click "Load unpacked" and select the root directory of this project

2. Verify installation:
   - The Web RAG Search icon should appear in your browser toolbar
   - Click the icon to open the extension popup
   - The API status indicator should show "API Connected" if the FastAPI server is running

## Usage

### Indexing Web Pages

1. Navigate to a web page you want to index
2. Click the Web RAG Search extension icon
3. Go to the "Index" tab
4. Click "Index Current Page"
5. Wait for the indexing to complete (indicated by a success message)

### Searching Content

1. Click the Web RAG Search extension icon
2. Enter your search query in the search box
3. Click "Search" or press Enter
4. View the search results, ranked by relevance
5. Click "View & Highlight" on any result to open the page with the relevant text highlighted

### Managing Indexed Content

1. Click the Web RAG Search extension icon
2. Go to the "Index" tab
3. View the list of indexed pages
4. Use the "Delete" button to remove individual pages from the index
5. Use "Clear All Data" to remove all pages from the index

### Search History

1. Click the Web RAG Search extension icon
2. Go to the "History" tab
3. View your previous searches
4. Click "Search Again" on any entry to repeat the search
5. Use "Clear History" to remove all search history

## Technical Architecture

### FastAPI Server

The API server provides these endpoints:

- `GET /health`: Health check endpoint
- `POST /index`: Index webpage content chunks
- `POST /search`: Search indexed content by semantic similarity
- `DELETE /delete`: Delete a URL from the index
- `POST /clear`: Clear all indexed data

Key components:

- **FAISS Index**: Stores vector embeddings for efficient similarity search
- **Ollama Integration**: Generates embeddings for text chunks and queries
- **Persistent Storage**: Saves the index to disk for durability

### Browser Extension

The extension consists of several JavaScript files:

- **popup.js/html**: The UI for search, indexing, and history
- **content.js**: Content script that extracts text from web pages and handles highlighting
- **background.js**: Background script that communicates with the API server
- **highlight.js**: Script that highlights text on web pages

## Troubleshooting

### API Connection Issues

- Ensure the FastAPI server is running
- Check that the API URL in the extension matches where the server is running
- Look for CORS issues in the browser console
- Verify that Ollama is running with the correct embedding model

### Content Extraction Issues

- Some websites may block content scripts
- Highly dynamic websites might not have content loaded when extraction occurs
- Check the browser console for specific error messages
- Try reloading the page before indexing

### Highlighting Issues

- Highlighting works best with exact text matches
- Dynamically generated content may change between indexing and viewing
- Some complex layouts or shadow DOM elements may interfere with highlighting
- The extension now attempts fallback strategies like sentence-by-sentence matching

## API Reference

### `POST /index`

Indexes webpage content chunks.

Request body:
```json
{
  "url": "https://example.com/page",
  "title": "Page Title",
  "chunks": ["Text chunk 1", "Text chunk 2", "..."]
}
```

Response:
```json
{
  "success": true,
  "url": "https://example.com/page",
  "chunks_indexed": 2
}
```

### `POST /search`

Searches for content using vector similarity.

Request body:
```json
{
  "query": "Your search query here"
}
```

Response:
```json
{
  "results": [
    {
      "url": "https://example.com/page1",
      "text": "Matching text chunk",
      "score": 0.85
    },
    ...
  ]
}
```

## Contributing

Contributions are welcome! Areas for improvement include:

- Better text chunking algorithms
- Support for more embedding models
- Authentication for the API
- UI improvements
- Performance optimizations
- Additional browser support

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [FAISS](https://github.com/facebookresearch/faiss) for efficient similarity search
- [Ollama](https://ollama.ai/) for local embedding generation
- [FastAPI](https://fastapi.tiangolo.com/) for the API framework 