// Popup script for the Web RAG Search extension

// Configuration
const API_BASE_URL = 'http://localhost:8000';

// DOM elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');
const noResults = document.getElementById('no-results');
const searchLoading = document.getElementById('search-loading');

const indexBtn = document.getElementById('index-current-btn');
const clearIndexBtn = document.getElementById('clear-index-btn');
const indexCount = document.getElementById('index-count');
const storageUsed = document.getElementById('storage-used');
const pageList = document.getElementById('page-list');
const indexLoading = document.getElementById('index-loading');

const searchHistory = document.getElementById('search-history');
const clearHistoryBtn = document.getElementById('clear-history-btn');

const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// API Status indicator
const apiStatusIndicator = document.createElement('div');
apiStatusIndicator.className = 'api-status';
apiStatusIndicator.innerHTML = `
  <div class="status-indicator"></div>
  <span class="status-text">Checking API...</span>
`;
document.querySelector('header').appendChild(apiStatusIndicator);

// Tab switching
tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    // Remove active class from all buttons and hide all content
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.add('hidden'));
    
    // Add active class to clicked button and show corresponding content
    button.classList.add('active');
    const tabId = button.getAttribute('data-tab');
    document.getElementById(`${tabId}-tab`).classList.remove('hidden');
    
    // Update UI based on selected tab
    if (tabId === 'index') {
      updateIndexStats();
    } else if (tabId === 'history') {
      loadSearchHistory();
    }
  });
});

// Search functionality
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') {
    performSearch();
  }
});

async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) return;
  
  // Show loading indicator
  searchResults.innerHTML = '';
  searchLoading.classList.remove('hidden');
  noResults.classList.add('hidden');
  
  try {
    // Check API connectivity first
    if (!(await checkApiConnectivity())) {
      throw new Error('FastAPI backend is not available. Please ensure the service is running.');
    }
    
    // Send search request to background script
    const response = await chrome.runtime.sendMessage({
      type: 'search',
      query: query
    });
    
    // Process response
    if (response.success && response.results && response.results.length > 0) {
      displaySearchResults(response.results);
      
      // Add to search history
      addToSearchHistory(query, response.results.length);
    } else {
      noResults.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Search error:', error);
    searchResults.innerHTML = `<div class="error">An error occurred: ${error.message}</div>`;
  } finally {
    searchLoading.classList.add('hidden');
  }
}

function displaySearchResults(results) {
  searchResults.innerHTML = '';
  
  results.forEach((result, index) => {
    const resultEl = document.createElement('div');
    resultEl.className = 'result-item';
    
    const score = Math.round(result.score * 100);
    const titleMaxLength = 60;
    const title = result.title.length > titleMaxLength 
      ? result.title.substring(0, titleMaxLength) + '...' 
      : result.title;
    
    resultEl.innerHTML = `
      <div class="result-header">
        <h3 class="result-title">${title}</h3>
        <span class="result-score">${score}% match</span>
      </div>
      <div class="result-url">${formatUrl(result.url)}</div>
      <div class="result-content">${formatContent(result.text)}</div>
      <div class="result-actions">
        <button class="view-btn" data-url="${result.url}" data-text="${encodeURIComponent(result.text)}">View & Highlight</button>
      </div>
    `;
    
    searchResults.appendChild(resultEl);
  });
  
  // Add event listeners to view buttons
  document.querySelectorAll('.view-btn').forEach(button => {
    button.addEventListener('click', () => {
      const url = button.getAttribute('data-url');
      const text = decodeURIComponent(button.getAttribute('data-text'));
      
      // Open tab and highlight text
      chrome.tabs.create({ url: url }, (tab) => {
        // We need to wait for the page to load before highlighting
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            // Remove the listener to avoid multiple calls
            chrome.tabs.onUpdated.removeListener(listener);
            
            // Send highlight message to content script
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, {
                action: 'highlightText',
                text: text
              });
            }, 1000); // Give the page a second to fully render
          }
        });
      });
    });
  });
}

// Format URL for display
function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.hostname}${urlObj.pathname.substring(0, 25)}${urlObj.pathname.length > 25 ? '...' : ''}`;
  } catch (e) {
    return url.substring(0, 40) + (url.length > 40 ? '...' : '');
  }
}

// Format content for display
function formatContent(content) {
  // Truncate content if too long
  const maxLength = 200;
  let displayContent = content;
  
  if (content.length > maxLength) {
    // Try to truncate at a space to avoid cutting words
    const truncatePoint = content.lastIndexOf(' ', maxLength);
    displayContent = content.substring(0, truncatePoint > 0 ? truncatePoint : maxLength) + '...';
  }
  
  // Escape HTML to prevent injection
  const escaped = displayContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  return escaped;
}

// Indexing functionality
indexBtn.addEventListener('click', indexCurrentPage);
clearIndexBtn.addEventListener('click', clearAllData);

async function indexCurrentPage() {
  indexLoading.classList.remove('hidden');
  
  try {
    // Check API connectivity first
    if (!(await checkApiConnectivity())) {
      throw new Error('FastAPI backend is not available. Please ensure the service is running.');
    }
    
    // Get active tab
    const [activeTab] = await chrome.tabs.query({ 
      active: true, 
      currentWindow: true 
    });
    
    if (!activeTab) {
      throw new Error('No active tab found');
    }
    
    console.log("Extracting content from tab:", activeTab.id, activeTab.url);
    
    // Request content from the tab
    try {
      const contentResponse = await chrome.tabs.sendMessage(
        activeTab.id, 
        { action: 'extractContent' }
      );
      
      if (!contentResponse) {
        throw new Error('No response from content script. Ensure the extension has permission for this page.');
      }
      
      if (contentResponse.error) {
        throw new Error(`Content script error: ${contentResponse.error}`);
      }
      
      if (!contentResponse.content) {
        throw new Error('No content extracted from page. The page might be empty or not fully loaded.');
      }
      
      console.log("Content extracted successfully, length:", contentResponse.content.length);
      
      // Send to background script for processing
      const indexResponse = await chrome.runtime.sendMessage({
        type: 'indexPage',
        url: contentResponse.url,
        title: contentResponse.title,
        content: contentResponse.content
      });
      
      if (!indexResponse || !indexResponse.success) {
        throw new Error(indexResponse?.error || 'Unknown error during indexing');
      }
      
      // Show success message
      const successMessage = document.createElement('div');
      successMessage.className = 'success-message';
      successMessage.textContent = 'Page indexed successfully!';
      
      // Remove any existing message
      const existingMessage = document.querySelector('.success-message');
      if (existingMessage) existingMessage.remove();
      
      // Add to page and remove after a delay
      document.querySelector('.index-status').appendChild(successMessage);
      setTimeout(() => successMessage.remove(), 3000);
      
      // Update index stats
      updateIndexStats();
    } catch (error) {
      console.error("Error communicating with tab:", error);
      
      // Check if content script might not be injected
      if (error.message.includes('Could not establish connection') || 
          error.message.includes('No response from content script')) {
        
        // Try injecting the content script manually
        try {
          console.log("Attempting to inject content script manually");
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js']
          });
          
          // Try again after injecting
          setTimeout(() => {
            console.log("Retrying content extraction after script injection");
            indexCurrentPage();
          }, 500);
          return;
        } catch (injectionError) {
          console.error("Failed to inject content script:", injectionError);
          throw new Error(`Cannot access this page. The site may have restrictions that prevent content extraction. Error: ${injectionError.message}`);
        }
      } else {
        throw error; // Re-throw other errors
      }
    }
  } catch (error) {
    console.error('Indexing error:', error);
    
    // Show error message
    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.textContent = `Error: ${error.message}`;
    
    // Remove any existing message
    const existingMessage = document.querySelector('.error-message');
    if (existingMessage) existingMessage.remove();
    
    // Add to page and remove after a delay
    document.querySelector('.index-status').appendChild(errorMessage);
    setTimeout(() => errorMessage.remove(), 5000);
  } finally {
    indexLoading.classList.add('hidden');
  }
}

async function updateIndexStats() {
  try {
    // Get document map from background script
    const response = await chrome.runtime.sendMessage({
      type: 'getDocumentMap'
    });
    
    if (response && response.documentMap) {
      const documentMap = response.documentMap;
      const pageCount = Object.keys(documentMap).length;
      
      // Update UI
      indexCount.textContent = pageCount;
      
      // Calculate approximate storage size
      const storageSize = new Blob([JSON.stringify(documentMap)]).size;
      const formattedSize = formatStorageSize(storageSize);
      storageUsed.textContent = formattedSize;
      
      // Update page list
      updatePageList(documentMap);
    }
  } catch (error) {
    console.error('Error updating index stats:', error);
  }
}

function updatePageList(documentMap) {
  pageList.innerHTML = '';
  
  if (Object.keys(documentMap).length === 0) {
    pageList.innerHTML = '<li class="no-pages">No pages indexed yet</li>';
    return;
  }
  
  // Sort by most recently indexed
  const pages = Object.entries(documentMap)
    .map(([url, info]) => ({
      url,
      title: info.title,
      chunksCount: info.chunks?.length || 0,
      indexed_at: info.indexed_at || new Date(0).toISOString()
    }))
    .sort((a, b) => new Date(b.indexed_at) - new Date(a.indexed_at));
  
  // Build list items
  pages.forEach(page => {
    const listItem = document.createElement('li');
    listItem.className = 'page-item';
    
    const titleMaxLength = 40;
    const title = page.title.length > titleMaxLength 
      ? page.title.substring(0, titleMaxLength) + '...' 
      : page.title;
    
    listItem.innerHTML = `
      <div class="page-info">
        <div class="page-title">${title}</div>
        <div class="page-url">${formatUrl(page.url)}</div>
        <div class="page-meta">Chunks: ${page.chunksCount}</div>
      </div>
      <button class="delete-btn" data-url="${page.url}">Delete</button>
    `;
    
    pageList.appendChild(listItem);
  });
  
  // Add event listeners to delete buttons
  document.querySelectorAll('.delete-btn').forEach(button => {
    button.addEventListener('click', async (e) => {
      const url = button.getAttribute('data-url');
      await deletePage(url);
    });
  });
}

async function deletePage(url) {
  try {
    // Check API connectivity first
    if (!(await checkApiConnectivity())) {
      throw new Error('FastAPI backend is not available. Please ensure the service is running.');
    }
    
    // Send delete request to background script
    const response = await chrome.runtime.sendMessage({
      type: 'deletePage',
      url: url
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to delete page');
    }
    
    // Update stats
    updateIndexStats();
  } catch (error) {
    console.error('Error deleting page:', error);
    alert('Error deleting page: ' + error.message);
  }
}

async function clearAllData() {
  try {
    if (!confirm('Are you sure you want to clear all indexed data? This cannot be undone.')) {
      return;
    }
    
    // Check API connectivity first
    if (!(await checkApiConnectivity())) {
      throw new Error('FastAPI backend is not available. Please ensure the service is running.');
    }
    
    // Send clear request to background script
    const response = await chrome.runtime.sendMessage({
      type: 'clearAllData'
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to clear data');
    }
    
    // Update stats
    updateIndexStats();
  } catch (error) {
    console.error('Error clearing data:', error);
    alert('Error clearing data: ' + error.message);
  }
}

// Search history functionality
async function loadSearchHistory() {
  try {
    // Get search history from storage
    const data = await chrome.storage.local.get(['searchHistory']);
    const history = data.searchHistory || [];
    
    // Update UI
    searchHistory.innerHTML = '';
    
    if (history.length === 0) {
      searchHistory.innerHTML = '<li class="no-history">No search history yet</li>';
      return;
    }
    
    // Display most recent searches first
    history
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10) // Show only last 10 searches
      .forEach(item => {
        const listItem = document.createElement('li');
        listItem.className = 'history-item';
        
        const time = new Date(item.timestamp).toLocaleString();
        
        listItem.innerHTML = `
          <div class="history-query">${item.query}</div>
          <div class="history-meta">
            <span class="history-time">${time}</span>
            <span class="history-results">${item.resultCount} results</span>
          </div>
          <button class="search-again-btn" data-query="${encodeURIComponent(item.query)}">Search Again</button>
        `;
        
        searchHistory.appendChild(listItem);
      });
    
    // Add event listeners to search again buttons
    document.querySelectorAll('.search-again-btn').forEach(button => {
      button.addEventListener('click', () => {
        const query = decodeURIComponent(button.getAttribute('data-query'));
        searchInput.value = query;
        
        // Switch to search tab
        document.querySelector('[data-tab="search"]').click();
        
        // Perform search
        performSearch();
      });
    });
  } catch (error) {
    console.error('Error loading search history:', error);
    searchHistory.innerHTML = '<li class="error">Error loading search history</li>';
  }
}

async function addToSearchHistory(query, resultCount) {
  try {
    // Get existing history
    const data = await chrome.storage.local.get(['searchHistory']);
    let history = data.searchHistory || [];
    
    // Add new entry
    history.unshift({
      query,
      resultCount,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 50 searches
    if (history.length > 50) {
      history = history.slice(0, 50);
    }
    
    // Save back to storage
    await chrome.storage.local.set({ searchHistory: history });
  } catch (error) {
    console.error('Error adding to search history:', error);
  }
}

// Clear search history
clearHistoryBtn.addEventListener('click', async () => {
  try {
    if (!confirm('Are you sure you want to clear your search history?')) {
      return;
    }
    
    await chrome.storage.local.set({ searchHistory: [] });
    loadSearchHistory();
  } catch (error) {
    console.error('Error clearing search history:', error);
    alert('Error clearing search history: ' + error.message);
  }
});

// Helper functions
function formatStorageSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// API connectivity check
async function checkApiConnectivity() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET'
    });
    
    const isConnected = response.ok;
    
    // Update status indicator
    const statusIndicator = document.querySelector('.status-indicator');
    const statusText = document.querySelector('.status-text');
    
    if (isConnected) {
      statusIndicator.className = 'status-indicator connected';
      statusText.textContent = 'API Connected';
      statusText.className = 'status-text connected';
    } else {
      statusIndicator.className = 'status-indicator disconnected';
      statusText.textContent = 'API Disconnected';
      statusText.className = 'status-text disconnected';
    }
    
    return isConnected;
  } catch (error) {
    console.error('API connectivity check failed:', error);
    
    // Update status indicator
    const statusIndicator = document.querySelector('.status-indicator');
    const statusText = document.querySelector('.status-text');
    
    statusIndicator.className = 'status-indicator disconnected';
    statusText.textContent = 'API Disconnected';
    statusText.className = 'status-text disconnected';
    
    return false;
  }
}

// Initialize on popup open
async function initialize() {
  // Check API connectivity
  await checkApiConnectivity();
  
  // Load initial data
  updateIndexStats();
}

// Run initialization
initialize(); 