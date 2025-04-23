import os
import json
import numpy as np
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import faiss
import httpx
import uvicorn
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "mxbai-embed-large")
INDEX_PATH = os.environ.get("INDEX_PATH", "index_data.json")
VECTOR_DIM = 1024  # Dimension of embeddings from the model

app = FastAPI(title="Web RAG Search API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development. In production, specify your extension's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data models
class IndexItem(BaseModel):
    url: str
    title: str
    chunks: List[str]

class SearchQuery(BaseModel):
    query: str

class DeleteQuery(BaseModel):
    url: str

class SearchResult(BaseModel):
    url: str
    text: str
    score: float

class SearchResponse(BaseModel):
    results: List[SearchResult]

# In-memory store
url_to_ids = {}  # Maps URLs to their chunk IDs in the index
id_to_data = {}  # Maps IDs to metadata (URL, text)
next_id = 0      # Next available ID for indexing

# Initialize FAISS index
index = None

def init_index():
    """Initialize or load the FAISS index"""
    global index, url_to_ids, id_to_data, next_id
    
    # Create a new FAISS index using L2 distance
    index = faiss.IndexFlatL2(VECTOR_DIM)
    
    # Try to load existing data if available
    if os.path.exists(INDEX_PATH):
        try:
            with open(INDEX_PATH, 'r') as f:
                saved_data = json.load(f)
                url_to_ids = saved_data.get('url_to_ids', {})
                id_to_data = saved_data.get('id_to_data', {})
                next_id = saved_data.get('next_id', 0)
                
                # Convert string keys to integers in id_to_data
                id_to_data = {int(k): v for k, v in id_to_data.items()}
                
                # Load vectors into index
                vectors = saved_data.get('vectors', [])
                if vectors:
                    vectors_np = np.array(vectors).astype('float32')
                    index.add(vectors_np)
                    print(f"Loaded index with {len(vectors)} vectors")
        except Exception as e:
            print(f"Error loading index: {e}")
            # Initialize empty data structures if load fails
            url_to_ids = {}
            id_to_data = {}
            next_id = 0
    
    print(f"Index initialized with {index.ntotal} vectors")

async def generate_embedding(text: str) -> List[float]:
    """Generate embedding using Ollama"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/embeddings",
                json={"model": OLLAMA_MODEL, "prompt": text}
            )
            
            if response.status_code != 200:
                print(f"Error from Ollama API: {response.text}")
                raise HTTPException(status_code=500, detail="Failed to generate embedding")
                
            data = response.json()
            embedding = data.get("embedding")
            
            if not embedding:
                raise HTTPException(status_code=500, detail="No embedding returned from model")
                
            return embedding
    except Exception as e:
        print(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating embedding: {str(e)}")

def save_index():
    """Save the index data to disk"""
    try:
        # Extract vectors from FAISS index
        vectors = []
        if index.ntotal > 0:
            # Fix the rev_swig_ptr call to use correct arguments
            # The total size is ntotal * d (vectors * dimension)
            vectors_np = faiss.rev_swig_ptr(index.get_xb(), index.ntotal * index.d).reshape(index.ntotal, index.d)
            vectors = vectors_np.tolist()
        
        save_data = {
            'url_to_ids': url_to_ids,
            'id_to_data': id_to_data,
            'next_id': next_id,
            'vectors': vectors
        }
        
        # Create parent directory if it doesn't exist
        os.makedirs(os.path.dirname(os.path.abspath(INDEX_PATH)), exist_ok=True)
        
        with open(INDEX_PATH, 'w') as f:
            json.dump(save_data, f)
            
        print(f"Index saved with {index.ntotal} vectors")
    except Exception as e:
        print(f"Error saving index: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving index: {str(e)}")

@app.on_event("startup")
def startup_event():
    """Initialize the index when the app starts"""
    init_index()

@app.get("/health")
async def health_check():
    """Check if the API is running"""
    return {"status": "ok"}

@app.post("/index", response_model=Dict[str, Any])
async def index_content(item: IndexItem):
    """Index webpage content chunks"""
    global next_id
    
    if not item.chunks:
        raise HTTPException(status_code=400, detail="No content chunks provided")
    
    # First, remove any existing content for this URL
    if item.url in url_to_ids:
        await delete_url(item.url)
    
    # Store IDs for this URL
    url_to_ids[item.url] = []
    
    # Process each chunk
    chunk_ids = []
    embeddings = []
    
    for chunk in item.chunks:
        if len(chunk.strip()) < 10:  # Skip very short chunks
            continue
            
        # Generate embedding
        embedding = await generate_embedding(chunk)
        
        # Assign an ID and store
        chunk_id = next_id
        next_id += 1
        
        # Store mapping from ID to data
        id_to_data[chunk_id] = {
            "url": item.url,
            "text": chunk
        }
        
        # Add to list of IDs for this URL
        url_to_ids[item.url].append(chunk_id)
        
        # Add to batch for FAISS indexing
        chunk_ids.append(chunk_id)
        embeddings.append(embedding)
    
    if embeddings:
        # Convert embeddings to numpy array
        embeddings_np = np.array(embeddings).astype('float32')
        
        # Add to FAISS index
        index.add(embeddings_np)
        
        # Save index to disk
        save_index()
    
    return {
        "success": True,
        "url": item.url,
        "chunks_indexed": len(chunk_ids)
    }

@app.post("/search", response_model=SearchResponse)
async def search(query: SearchQuery):
    """Search for content using vector similarity"""
    if index.ntotal == 0:
        return {"results": []}
    
    try:
        # Generate embedding for query
        query_embedding = await generate_embedding(query.query)
        
        # Convert to numpy array
        query_np = np.array([query_embedding]).astype('float32')
        
        # Search index - get top 5 results
        k = min(5, index.ntotal)
        distances, indices = index.search(query_np, k)
        
        # Process results
        results = []
        for i, idx in enumerate(indices[0]):
            if idx != -1:  # Valid index
                item_data = id_to_data.get(int(idx))
                if item_data:
                    # Convert distance to similarity score (closer distance = higher similarity)
                    # FAISS uses L2 distance, so we need to convert to a similarity score
                    # We use a simple exponential decay function
                    distance = distances[0][i]
                    similarity_score = np.exp(-distance)
                    
                    results.append({
                        "url": item_data["url"],
                        "text": item_data["text"],
                        "score": similarity_score
                    })
        
        return {"results": results}
    except Exception as e:
        print(f"Error during search: {e}")
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")

@app.delete("/delete")
async def delete(query: DeleteQuery):
    """Delete a URL from the index"""
    result = await delete_url(query.url)
    return result

async def delete_url(url: str):
    """Delete a URL and its chunks from the index"""
    if url not in url_to_ids:
        return {"success": True, "message": "URL not found in index"}
    
    try:
        # Get IDs for this URL
        chunk_ids = url_to_ids[url]
        
        if chunk_ids and index.ntotal > 0:
            # For FAISS, we need to rebuild the index without these vectors
            # Fix the rev_swig_ptr call with proper arguments and reshape
            all_vectors = faiss.rev_swig_ptr(index.get_xb(), index.ntotal * index.d).reshape(index.ntotal, index.d)
            
            # Create a boolean mask for vectors to keep
            keep_mask = np.ones(index.ntotal, dtype=bool)
            
            # Find positions of IDs to remove
            id_to_pos = {}
            pos = 0
            for id_val in sorted(id_to_data.keys()):
                id_to_pos[id_val] = pos
                pos += 1
            
            # Mark vectors to remove
            for id_to_remove in chunk_ids:
                if id_to_remove in id_to_pos:
                    keep_mask[id_to_pos[id_to_remove]] = False
            
            # Reset index
            index.reset()
            
            # Add back only the vectors we want to keep
            vectors_to_keep = all_vectors[keep_mask]
            if len(vectors_to_keep) > 0:
                index.add(vectors_to_keep)
            
            # Remove data
            for chunk_id in chunk_ids:
                if chunk_id in id_to_data:
                    del id_to_data[chunk_id]
        
        # Remove URL mapping
        del url_to_ids[url]
        
        # Save updated index
        save_index()
        
        return {"success": True, "url": url}
    except Exception as e:
        print(f"Error deleting URL: {e}")
        raise HTTPException(status_code=500, detail=f"Delete error: {str(e)}")

@app.post("/clear")
async def clear_all():
    """Clear all indexed data"""
    global url_to_ids, id_to_data, next_id
    
    try:
        # Reset index
        index.reset()
        
        # Clear data structures
        url_to_ids = {}
        id_to_data = {}
        next_id = 0
        
        # Save empty index
        save_index()
        
        return {"success": True, "message": "All data cleared"}
    except Exception as e:
        print(f"Error clearing data: {e}")
        raise HTTPException(status_code=500, detail=f"Clear error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 