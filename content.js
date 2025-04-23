// Content script to extract text content from web pages
// Add logging to verify content script is loading
console.log("Content script loaded for Web RAG Search");

// Configuration
const excludeSelectors = [
  'script', 'style', 'noscript', 'iframe', 'svg', 'path', 'nav', 'footer',
  'header', 'menu', 'aside', '[role="banner"]', '[role="navigation"]',
  '[role="complementary"]', '[role="form"]', '[aria-hidden="true"]'
];

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extractContent") {
    try {
      const pageContent = extractPageContent();
      const pageUrl = window.location.href;
      const pageTitle = document.title;
      
      console.log("Content extracted successfully, length:", pageContent.length);
      
      sendResponse({
        content: pageContent,
        url: pageUrl,
        title: pageTitle
      });
    } catch (error) {
      console.error("Error extracting content:", error);
      sendResponse({
        error: error.message
      });
    }
  }
  
  if (message.action === "highlightText") {
    try {
      highlightText(message.text);
      sendResponse({ success: true });
    } catch (error) {
      console.error("Error highlighting text:", error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  return true; // Keep channel open for async response
});

// Extract meaningful text content from the page
function extractPageContent() {
  try {
    // Make sure we have a valid document body
    if (!document || !document.body) {
      throw new Error('Document body not available');
    }
    
    // Create a copy of the body to manipulate
    const bodyClone = document.body.cloneNode(true);
    
    // Remove elements that don't contain useful content
    excludeSelectors.forEach(selector => {
      try {
        const elements = bodyClone.querySelectorAll(selector);
        elements.forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      } catch (e) {
        console.warn(`Error removing selector ${selector}:`, e);
      }
    });
    
    // Get all text nodes
    const textContent = getAllTextContent(bodyClone);
    
    // Clean up whitespace
    return textContent
      .replace(/\s+/g, ' ')
      .trim();
  } catch (error) {
    console.error("Error in extractPageContent:", error);
    throw error;
  }
}

// Recursively get text from all nodes, preserving some structure
function getAllTextContent(element) {
  // Check if element is valid
  if (!element) return '';
  
  // Skip invisible elements - but only if it's an actual Element node
  if (element.nodeType === Node.ELEMENT_NODE) {
    try {
      // Only apply getComputedStyle to actual elements
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return '';
      }
    } catch (e) {
      console.warn('Error getting computed style:', e);
      // Continue processing even if we can't check visibility
    }
  }
  
  // Check if this is a text node
  if (element.nodeType === Node.TEXT_NODE) {
    return element.textContent ? element.textContent.trim() : '';
  }
  
  // Process element node
  let text = '';
  
  // Only process tagName if it's an ELEMENT_NODE
  if (element.nodeType === Node.ELEMENT_NODE) {
    const tagName = element.tagName?.toLowerCase();
    
    // Add paragraph breaks for block elements
    const isBlockElement = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'article', 'section'].includes(tagName);
    
    if (isBlockElement) {
      text += '\n';
    }
    
    // Process child nodes
    if (element.childNodes) {
      for (const child of element.childNodes) {
        text += getAllTextContent(child) + ' ';
      }
    }
    
    // Add additional line breaks for certain elements
    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(tagName)) {
      text += '\n';
    }
  }
  
  return text;
}

// Highlight text on the page
function highlightText(textToHighlight) {
  console.log("Highlighting text:", textToHighlight.substring(0, 50) + '...');
  
  // First, remove any existing highlights
  const existingHighlights = document.querySelectorAll('.web-rag-highlight');
  existingHighlights.forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    }
  });
  
  if (!textToHighlight) return;
  
  // Prepare text for better fuzzy matching
  // Normalize whitespace and create a clean version for matching
  const normalizedText = textToHighlight
    .replace(/\s+/g, ' ')
    .trim();
  
  // First try exact matching
  let found = highlightExactMatch(normalizedText);
  
  // If exact match fails, try fuzzy matching with smaller chunks
  if (!found) {
    console.log("Exact match failed, trying sentence-by-sentence matching");
    
    // Split text into sentences for more flexible matching
    const sentences = normalizedText.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    // Try to highlight each sentence
    for (const sentence of sentences) {
      highlightExactMatch(sentence.trim());
    }
  }
  
  // Create a button to remove highlights
  createHighlightControls();
}

// Try to find and highlight an exact text match
function highlightExactMatch(text) {
  if (!text || text.length < 5) return false;
  
  // Create regex for matching the text (case insensitive)
  const escapedText = text
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\s+/g, '\\s+'); // Allow any whitespace

  const regex = new RegExp(`(${escapedText})`, 'i');
  
  // Walk through text nodes and highlight matches
  const textNodes = getTextNodes(document.body);
  let found = false;
  
  textNodes.forEach(node => {
    const matches = regex.exec(node.textContent);
    if (matches) {
      found = true;
      const matchedText = matches[0];
      const startIndex = matches.index;
      
      // Split text node and insert highlight
      if (matchedText.length > 0) {
        // Text before match
        const beforeText = node.textContent.substring(0, startIndex);
        // Text after match
        const afterText = node.textContent.substring(startIndex + matchedText.length);
        
        const span = document.createElement('span');
        span.className = 'web-rag-highlight';
        span.textContent = matchedText;
        
        // Apply more visible styling
        span.style.backgroundColor = '#FFFF00';
        span.style.color = '#000000';
        span.style.padding = '2px';
        span.style.borderRadius = '3px';
        span.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.2)';
        
        const fragment = document.createDocumentFragment();
        if (beforeText) fragment.appendChild(document.createTextNode(beforeText));
        fragment.appendChild(span);
        if (afterText) fragment.appendChild(document.createTextNode(afterText));
        
        // Replace the original node with our fragment
        const parent = node.parentNode;
        if (parent) {
          parent.replaceChild(fragment, node);
        }
        
        // Scroll to the highlight
        span.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  });
  
  return found;
}

// Create UI controls for highlights
function createHighlightControls() {
  // Remove any existing controls
  const existingControls = document.querySelector('.web-rag-controls');
  if (existingControls) existingControls.remove();
  
  // Count highlights
  const highlights = document.querySelectorAll('.web-rag-highlight');
  if (highlights.length === 0) return;
  
  // Create controls container
  const controls = document.createElement('div');
  controls.className = 'web-rag-controls';
  controls.style.position = 'fixed';
  controls.style.top = '10px';
  controls.style.right = '10px';
  controls.style.zIndex = '9999';
  controls.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  controls.style.color = 'white';
  controls.style.padding = '10px';
  controls.style.borderRadius = '5px';
  controls.style.fontFamily = 'Arial, sans-serif';
  controls.style.fontSize = '14px';
  
  controls.innerHTML = `
    <div style="margin-bottom:8px">
      <strong>${highlights.length} matches found</strong>
    </div>
    <button id="web-rag-clear" style="background:#f44336;color:white;border:none;padding:5px 10px;cursor:pointer;border-radius:3px;margin-right:5px">
      Remove Highlights
    </button>
  `;
  
  document.body.appendChild(controls);
  
  // Add event listeners
  document.getElementById('web-rag-clear').addEventListener('click', () => {
    const highlights = document.querySelectorAll('.web-rag-highlight');
    highlights.forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      }
    });
    controls.remove();
  });
}

// Get all text nodes in the document
function getTextNodes(element) {
  const textNodes = [];
  
  // Validate element
  if (!element || !element.nodeType) {
    return textNodes;
  }
  
  // Skip invisible elements - only for actual Element nodes
  if (element.nodeType === Node.ELEMENT_NODE) {
    try {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return textNodes;
      }
    } catch (e) {
      console.warn('Error in getTextNodes getComputedStyle:', e);
      // Continue anyway
    }
  }
  
  function getTextNodesRecursive(node) {
    if (!node) return;
    
    if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim() !== '') {
      textNodes.push(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Skip excluded elements
      try {
        const tagName = node.tagName ? node.tagName.toLowerCase() : '';
        
        // First check if it's a simple tag match
        if (excludeSelectors.includes(tagName)) {
          return;
        }
        
        // Then try the more complex matching only if node.matches exists
        if (node.matches && excludeSelectors.some(selector => {
          try {
            return node.matches(selector);
          } catch (e) {
            // Some selectors might not be valid
            return false;
          }
        })) {
          return;
        }
      } catch (e) {
        console.warn('Error checking node against exclude selectors:', e);
      }
      
      // Process children
      if (node.childNodes) {
        for (const child of node.childNodes) {
          getTextNodesRecursive(child);
        }
      }
    }
  }
  
  getTextNodesRecursive(element);
  return textNodes;
}

// Inform background that this page has loaded (optional, for auto-indexing)
(function notifyPageLoaded() {
  try {
    chrome.runtime.sendMessage({
      type: 'pageLoaded',
      url: window.location.href,
      title: document.title
    });
    console.log("Page load notification sent");
  } catch (error) {
    console.error("Error sending page load notification:", error);
  }
})(); 