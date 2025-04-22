// Popup script for the Web RAG Search extension

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
    // Get active tab
    const [activeTab] = await chrome.tabs.query({ 
      active: true, 
      currentWindow: true 
    });
    
    if (!activeTab) {
      throw new Error('No active tab found');
    }
    
    // Request content from the tab
    const contentResponse = await chrome.tabs.sendMessage(
      activeTab.id, 
      { action: 'extractContent' }
    );
    
    if (!contentResponse || !contentResponse.content) {
      throw new Error('Failed to extract content from page');
    }
    
    // Send content to background for indexing
    const indexResponse = await chrome.runtime.sendMessage({
      type: 'indexPage',
      url: contentResponse.url,
      title: contentResponse.title,
      content: contentResponse.content
    });
    
    if (indexResponse.success) {
      // Update UI
      updateIndexStats();
      
      // Show success message
      const successEl = document.createElement('div');
      successEl.className = 'success-message';
      successEl.textContent = 'Page indexed successfully!';
      document.querySelector('.index-status').appendChild(successEl);
      
      setTimeout(() => {
        successEl.remove();
      }, 3000);
    } else {
      throw new Error(indexResponse.error || 'Failed to index page');
    }
  } catch (error) {
    console.error('Indexing error:', error);
    alert('Error indexing page: ' + error.message);
  } finally {
    indexLoading.classList.add('hidden');
  }
}

async function updateIndexStats() {
  try {
    // Request stats from background
    const stats = await chrome.storage.local.get(['documentMap']);
    const documentMap = stats.documentMap || {};
    
    // Update count
    const pageCount = Object.keys(documentMap).length;
    indexCount.textContent = pageCount;
    
    // Calculate and update storage used
    const storageEstimate = await navigator.storage.estimate();
    const usedKB = Math.round(storageEstimate.usage / 1024);
    storageUsed.textContent = `${usedKB} KB`;
    
    // Update page list
    updatePageList(documentMap);
  } catch (error) {
    console.error('Error updating index stats:', error);
  }
}

function updatePageList(documentMap) {
  pageList.innerHTML = '';
  
  if (Object.keys(documentMap).length === 0) {
    pageList.innerHTML = '<li class="empty-list">No pages indexed yet</li>';
    return;
  }
  
  // Sort by most recently added (assuming keys are added in order)
  const pages = Object.entries(documentMap).reverse();
  
  pages.forEach(([url, data]) => {
    const li = document.createElement('li');
    li.className = 'page-item';
    
    const title = data.title || url;
    const maxTitleLength = 40;
    const displayTitle = title.length > maxTitleLength 
      ? title.substring(0, maxTitleLength) + '...' 
      : title;
    
    const chunkCount = data.chunks?.length || 0;
    
    li.innerHTML = `
      <div class="page-title">${displayTitle}</div>
      <div class="page-meta">${chunkCount} chunks</div>
      <div class="page-actions">
        <button class="delete-page" data-url="${url}">Delete</button>
      </div>
    `;
    
    pageList.appendChild(li);
  });
  
  // Add event listeners to delete buttons
  document.querySelectorAll('.delete-page').forEach(button => {
    button.addEventListener('click', async () => {
      const url = button.getAttribute('data-url');
      if (confirm('Are you sure you want to delete this page from the index?')) {
        await deletePage(url);
        updateIndexStats();
      }
    });
  });
}

async function deletePage(url) {
  try {
    // Get current data
    const data = await chrome.storage.local.get(['vectorIndex', 'documentMap']);
    const vectorIndex = data.vectorIndex || {};
    const documentMap = data.documentMap || {};
    
    // Remove page data
    delete vectorIndex[url];
    delete documentMap[url];
    
    // Save updated data
    await chrome.storage.local.set({
      vectorIndex,
      documentMap
    });
    
    console.log('Deleted page:', url);
  } catch (error) {
    console.error('Error deleting page:', error);
    throw error;
  }
}

async function clearAllData() {
  if (confirm('Are you sure you want to clear all indexed data? This cannot be undone.')) {
    try {
      await chrome.storage.local.remove(['vectorIndex', 'documentMap']);
      updateIndexStats();
      
      // Show confirmation
      alert('All indexed data has been cleared.');
    } catch (error) {
      console.error('Error clearing data:', error);
      alert('Error clearing data: ' + error.message);
    }
  }
}

// Search history functionality
async function loadSearchHistory() {
  try {
    const data = await chrome.storage.local.get(['searchHistory']);
    const history = data.searchHistory || [];
    
    searchHistory.innerHTML = '';
    
    if (history.length === 0) {
      searchHistory.innerHTML = '<li class="empty-list">No search history</li>';
      return;
    }
    
    history.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      
      li.innerHTML = `
        <div class="history-query">${item.query}</div>
        <div class="history-meta">
          <span class="history-date">${formattedDate}</span>
          <span class="history-results">${item.resultCount} results</span>
        </div>
        <button class="rerun-search" data-query="${encodeURIComponent(item.query)}">Search Again</button>
      `;
      
      searchHistory.appendChild(li);
    });
    
    // Add event listeners
    document.querySelectorAll('.rerun-search').forEach(button => {
      button.addEventListener('click', () => {
        const query = decodeURIComponent(button.getAttribute('data-query'));
        
        // Switch to search tab
        document.querySelector('.tab-btn[data-tab="search"]').click();
        
        // Set input value and trigger search
        searchInput.value = query;
        performSearch();
      });
    });
  } catch (error) {
    console.error('Error loading search history:', error);
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
      timestamp: Date.now()
    });
    
    // Keep only most recent 20 searches
    history = history.slice(0, 20);
    
    // Save updated history
    await chrome.storage.local.set({ searchHistory: history });
  } catch (error) {
    console.error('Error adding to search history:', error);
  }
}

clearHistoryBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear your search history?')) {
    try {
      await chrome.storage.local.remove(['searchHistory']);
      loadSearchHistory();
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }
});

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  // Initial tab is search, but update stats
  updateIndexStats();
}); 