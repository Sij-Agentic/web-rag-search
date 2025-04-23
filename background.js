// Background script for Web RAG Search extension
// Refactored to use FastAPI backend for vectorization and indexing

// Configuration for the FastAPI backend
const API_BASE_URL = 'http://localhost:8000';

// Global state - only store document metadata, not vectors
let documentMap = {};

// Initialize when the service worker starts
async function initialize() {
  try {
    // Load documentMap from storage if exists
    const data = await chrome.storage.local.get(['documentMap']);
    
    if (data.documentMap) {
      documentMap = data.documentMap;
      console.log('Loaded existing document map with', Object.keys(documentMap).length, 'documents');
    } else {
      // Create new document map
      documentMap = {};
      console.log('Created new document map');
    }
  } catch (error) {
    console.error('Error initializing document map:', error);
    documentMap = {};
  }
}

// Save document map to storage
async function saveDocumentMap() {
  await chrome.storage.local.set({
    documentMap: documentMap
  });
  console.log('Document map saved to storage');
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
  
  if (message.type === 'deletePage') {
    // Handle page deletion
    deletePage(message.url)
      .then(() => sendResponse({success: true}))
      .catch(error => {
        console.error('Error deleting page:', error);
        sendResponse({success: false, error: error.toString()});
      });
    return true;
  }
  
  if (message.type === 'clearAllData') {
    // Handle clear all data
    clearAllData()
      .then(() => sendResponse({success: true}))
      .catch(error => {
        console.error('Error clearing data:', error);
        sendResponse({success: false, error: error.toString()});
      });
    return true;
  }
  
  if (message.type === 'getDocumentMap') {
    // Return the current document map
    sendResponse({documentMap: documentMap});
    return false;
  }
});

// Process and index page content through the FastAPI backend
async function indexPage(url, content, title) {
  // Simple text chunking (can be improved with better NLP)
  const chunks = chunkText(content);
  
  // Skip if no meaningful content
  if (chunks.length === 0) {
    throw new Error('No meaningful content found to index');
  }
  
  try {
    // Send page data to the FastAPI backend for vectorization and indexing
    const response = await fetch(`${API_BASE_URL}/index`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        title: title,
        chunks: chunks
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.detail || response.statusText}`);
    }
    
    const result = await response.json();
    
    // Store metadata in our local document map
    documentMap[url] = {
      title: title,
      chunks: chunks.map((chunk, index) => ({
        id: `${url}-${index}`,
        text: chunk
      })),
      indexed_at: new Date().toISOString()
    };
    
    // Save document map
    await saveDocumentMap();
    
    return result;
  } catch (error) {
    console.error('Error in indexPage:', error);
    throw error;
  }
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

// Search content via the FastAPI backend
async function searchContent(query) {
  try {
    // Call the search endpoint
    const response = await fetch(`${API_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.detail || response.statusText}`);
    }
    
    const searchResults = await response.json();
    
    // Enhance results with data from our document map
    const enhancedResults = searchResults.results.map(result => {
      const url = result.url;
      const documentInfo = documentMap[url] || { title: url };
      
      return {
        ...result,
        title: documentInfo.title || url
      };
    });
    
    return enhancedResults;
  } catch (error) {
    console.error('Error in searchContent:', error);
    throw error;
  }
}

// Delete a page from the index
async function deletePage(url) {
  try {
    // Call the delete endpoint
    const response = await fetch(`${API_BASE_URL}/delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.detail || response.statusText}`);
    }
    
    // Remove from our document map
    if (documentMap[url]) {
      delete documentMap[url];
      await saveDocumentMap();
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error in deletePage:', error);
    throw error;
  }
}

// Clear all indexed data
async function clearAllData() {
  try {
    // Call the clear endpoint
    const response = await fetch(`${API_BASE_URL}/clear`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.detail || response.statusText}`);
    }
    
    // Clear local document map
    documentMap = {};
    await saveDocumentMap();
    
    return { success: true };
  } catch (error) {
    console.error('Error in clearAllData:', error);
    throw error;
  }
}

// Initialize when the service worker starts
initialize(); 