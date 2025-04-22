// Import FAISS for vector indexing
importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');
importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js');

// Global state
let index = null;
let documentMap = {};
let pipeline = null;

// Initialize the embedding model
async function initializeModel() {
  try {
    pipeline = await new Transformers.Pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Embedding model initialized');
  } catch (error) {
    console.error('Error initializing model:', error);
  }
}

// Create a new index or load existing one
async function initializeIndex() {
  try {
    // Load from storage if exists
    const data = await chrome.storage.local.get(['vectorIndex', 'documentMap']);
    
    if (data.vectorIndex && data.documentMap) {
      index = data.vectorIndex;
      documentMap = data.documentMap;
      console.log('Loaded existing index with', Object.keys(documentMap).length, 'documents');
    } else {
      // Create new index
      index = {};
      documentMap = {};
      console.log('Created new vector index');
    }
  } catch (error) {
    console.error('Error initializing index:', error);
    index = {};
    documentMap = {};
  }
}

// Save index to storage
async function saveIndex() {
  await chrome.storage.local.set({
    vectorIndex: index,
    documentMap: documentMap
  });
  console.log('Index saved to storage');
}

// Handle incoming messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'indexPage') {
    // Queue indexing job
    indexPage(message.url, message.content, message.title)
      .then(() => sendResponse({success: true}))
      .catch(error => {
        console.error('Error indexing page:', error);
        sendResponse({success: false, error: error.toString()});
      });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'search') {
    // Handle search request
    searchContent(message.query)
      .then(results => sendResponse({success: true, results}))
      .catch(error => {
        console.error('Error searching:', error);
        sendResponse({success: false, error: error.toString()});
      });
    return true; // Keep channel open for async response
  }
});

// Process and index page content
async function indexPage(url, content, title) {
  if (!pipeline) await initializeModel();
  
  // Simple text chunking (can be improved with better NLP)
  const chunks = chunkText(content);
  
  // For each chunk, create embedding and store in index
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.trim().length < 10) continue; // Skip very small chunks
    
    // Generate embedding
    const embedding = await getEmbedding(chunk);
    
    // Store in index 
    const chunkId = `${url}-${i}`;
    
    // Using a simple in-memory structure, but in a real app would use FAISS
    if (!index[url]) index[url] = [];
    index[url].push({
      id: chunkId,
      embedding: embedding,
      chunk: chunk
    });
    
    // Update document map
    if (!documentMap[url]) {
      documentMap[url] = {
        title: title,
        chunks: []
      };
    }
    documentMap[url].chunks.push({
      id: chunkId,
      text: chunk
    });
  }
  
  // Save updated index
  await saveIndex();
}

// Basic text chunking function
function chunkText(text, maxChunkSize = 500) {
  // Remove excessive whitespace
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  // Split by sentence boundaries but preserve them
  const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
  
  const chunks = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length <= maxChunkSize) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = sentence;
    }
  }
  
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

// Get embedding for text
async function getEmbedding(text) {
  try {
    const result = await pipeline(text, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(result.data);
  } catch (error) {
    console.error('Error generating embedding:', error);
    return new Array(384).fill(0); // Default empty embedding
  }
}

// Search content using vector similarity
async function searchContent(query) {
  if (!pipeline) await initializeModel();
  
  // Get query embedding
  const queryEmbedding = await getEmbedding(query);
  
  // Simple cosine similarity search across all vectors
  const results = [];
  
  for (const url in index) {
    for (const item of index[url]) {
      const similarity = cosineSimilarity(queryEmbedding, item.embedding);
      results.push({
        url: url,
        chunkId: item.id,
        text: item.chunk,
        title: documentMap[url]?.title || url,
        score: similarity
      });
    }
  }
  
  // Sort by similarity score (descending)
  results.sort((a, b) => b.score - a.score);
  
  // Return top 5 results
  return results.slice(0, 5);
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

// Initialize when the service worker starts
initializeModel();
initializeIndex(); 