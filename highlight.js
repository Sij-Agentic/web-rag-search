// This script is injected into the page to handle highlighting text

(function() {
  // Create custom CSS for highlights if not already present
  function addHighlightStyles() {
    if (!document.getElementById('web-rag-highlight-styles')) {
      const style = document.createElement('style');
      style.id = 'web-rag-highlight-styles';
      style.textContent = `
        .web-rag-highlight {
          background-color: #FFFF00 !important;
          color: #000000 !important;
          padding: 2px 0;
          border-radius: 2px;
          box-shadow: 0 0 0 2px rgba(255, 255, 0, 0.3);
          transition: all 0.2s ease-in-out;
        }
        
        .web-rag-highlight:hover {
          background-color: #FFA500 !important;
          box-shadow: 0 0 0 2px rgba(255, 165, 0, 0.3);
        }
        
        .web-rag-highlight-container {
          position: fixed;
          top: 10px;
          right: 10px;
          background-color: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 10px;
          border-radius: 5px;
          z-index: 10000;
          font-family: Arial, sans-serif;
          max-width: 300px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
        }
        
        .web-rag-next-btn, .web-rag-prev-btn, .web-rag-close-btn {
          background-color: #4285F4;
          color: white;
          border: none;
          padding: 5px 10px;
          margin: 5px;
          border-radius: 3px;
          cursor: pointer;
        }
        
        .web-rag-close-btn {
          background-color: #EA4335;
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  // Variables to track highlights
  let currentHighlightIndex = -1;
  let highlights = [];
  
  // Highlight all occurrences of a text in the page
  function highlightText(text) {
    // First remove existing highlights
    removeHighlights();
    
    if (!text) return;
    
    // Create a regular expression to find all instances of the text
    const escapedText = text
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    
    const regex = new RegExp(escapedText, 'gi');
    
    // Find and highlight text nodes
    const allTextNodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip nodes in script, style, etc.
          const parent = node.parentNode;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName?.toLowerCase();
          if (['script', 'style', 'noscript', 'iframe', 'svg', 'path'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip empty nodes
          if (node.textContent.trim() === '') {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let node;
    while ((node = walker.nextNode())) {
      allTextNodes.push(node);
    }
    
    // Process each text node
    allTextNodes.forEach(textNode => {
      const parent = textNode.parentNode;
      if (!parent) return;
      
      const content = textNode.textContent;
      let match;
      let lastIndex = 0;
      let resultHTML = '';
      
      regex.lastIndex = 0; // Reset regex state
      
      while ((match = regex.exec(content)) !== null) {
        // Add text before match
        resultHTML += content.substring(lastIndex, match.index);
        
        // Add highlighted match
        resultHTML += `<span class="web-rag-highlight">${match[0]}</span>`;
        
        lastIndex = regex.lastIndex;
      }
      
      // If we found a match, replace the node
      if (lastIndex > 0) {
        // Add remaining text
        resultHTML += content.substring(lastIndex);
        
        // Replace node with HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = resultHTML;
        
        const fragment = document.createDocumentFragment();
        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild);
        }
        
        parent.replaceChild(fragment, textNode);
      }
    });
    
    // Collect all highlight elements
    highlights = Array.from(document.querySelectorAll('.web-rag-highlight'));
    
    // Navigate to first highlight if any found
    if (highlights.length > 0) {
      currentHighlightIndex = 0;
      navigateToHighlight(currentHighlightIndex);
      
      // Show navigation controls
      showHighlightControls(highlights.length);
    }
  }
  
  // Remove all highlights
  function removeHighlights() {
    const highlightElements = document.querySelectorAll('.web-rag-highlight');
    
    highlightElements.forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        // Replace with text node
        const textNode = document.createTextNode(el.textContent);
        parent.replaceChild(textNode, el);
        parent.normalize(); // Merge adjacent text nodes
      }
    });
    
    // Reset state
    highlights = [];
    currentHighlightIndex = -1;
    
    // Remove controls
    const controlsContainer = document.querySelector('.web-rag-highlight-container');
    if (controlsContainer) {
      controlsContainer.remove();
    }
  }
  
  // Navigate to a specific highlight
  function navigateToHighlight(index) {
    if (index < 0 || index >= highlights.length) return;
    
    // Update all highlights to remove active state
    highlights.forEach(h => {
      h.style.backgroundColor = '#FFFF00';
      h.style.boxShadow = '0 0 0 2px rgba(255, 255, 0, 0.3)';
    });
    
    // Highlight the current one
    const currentHighlight = highlights[index];
    currentHighlight.style.backgroundColor = '#FFA500';
    currentHighlight.style.boxShadow = '0 0 0 3px rgba(255, 165, 0, 0.5)';
    
    // Scroll to the highlight
    currentHighlight.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
    
    // Update counter in controls
    const counter = document.querySelector('.web-rag-counter');
    if (counter) {
      counter.textContent = `${index + 1} of ${highlights.length}`;
    }
  }
  
  // Show highlight navigation controls
  function showHighlightControls(count) {
    // Remove existing controls
    const existingControls = document.querySelector('.web-rag-highlight-container');
    if (existingControls) {
      existingControls.remove();
    }
    
    // Create controls container
    const container = document.createElement('div');
    container.className = 'web-rag-highlight-container';
    container.innerHTML = `
      <div>Found ${count} matches</div>
      <div class="web-rag-counter">${currentHighlightIndex + 1} of ${count}</div>
      <div>
        <button class="web-rag-prev-btn">Previous</button>
        <button class="web-rag-next-btn">Next</button>
        <button class="web-rag-close-btn">Close</button>
      </div>
    `;
    
    // Add event listeners
    container.querySelector('.web-rag-prev-btn').addEventListener('click', () => {
      currentHighlightIndex = (currentHighlightIndex - 1 + highlights.length) % highlights.length;
      navigateToHighlight(currentHighlightIndex);
    });
    
    container.querySelector('.web-rag-next-btn').addEventListener('click', () => {
      currentHighlightIndex = (currentHighlightIndex + 1) % highlights.length;
      navigateToHighlight(currentHighlightIndex);
    });
    
    container.querySelector('.web-rag-close-btn').addEventListener('click', () => {
      removeHighlights();
    });
    
    // Add to page
    document.body.appendChild(container);
  }
  
  // Listen for messages from content script
  window.addEventListener('message', function(event) {
    // Only accept messages from this window
    if (event.source !== window) return;
    
    const message = event.data;
    
    // Verify it's our message
    if (message.type === 'WEB_RAG_HIGHLIGHT') {
      addHighlightStyles();
      highlightText(message.text);
    }
    
    if (message.type === 'WEB_RAG_CLEAR_HIGHLIGHT') {
      removeHighlights();
    }
  });
  
  // Add styles when script is loaded
  addHighlightStyles();
  
  // Export functions to window object for content script to use
  window.webRagHighlighter = {
    highlight: highlightText,
    clear: removeHighlights
  };
})(); 