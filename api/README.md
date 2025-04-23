# Web RAG Search API

This FastAPI application handles vectorization and indexing for the Web RAG Search browser extension.

## Overview

The API uses:
- **FastAPI**: For the REST API endpoints
- **FAISS**: For efficient vector similarity search
- **Ollama**: For generating embeddings

## Setup

1. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Create a `.env` file (or set environment variables):
   ```
   # Ollama configuration
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=nomic-embed-text

   # API configuration
   PORT=8000
   HOST=0.0.0.0

   # Storage configuration
   INDEX_PATH=./data/index_data.json
   ```

3. Make sure Ollama is running with the embedding model:
   ```
   ollama run nomic-embed-text
   ```

## Running the API

Start the API server:
```
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Or simply run:
```
python main.py
```

## API Endpoints

- `GET /health`: Health check endpoint
- `POST /index`: Index webpage content
- `POST /search`: Search indexed content by semantic similarity
- `DELETE /delete`: Delete a URL and its content from the index
- `POST /clear`: Clear all indexed data

## Browser Extension Integration

The browser extension will use this API for:
1. Generating embeddings for web content
2. Searching through indexed content
3. Managing the index (adding, removing content)

The extension itself no longer handles vectorization or similarity search calculations, making it more lightweight and maintainable. 