# Web RAG Search Chrome Extension

A Chrome extension that allows you to index web content using vector embeddings and search across your indexed content using semantic similarity.

## Features

- **Content Indexing**: Automatically extract and index content from any web page you visit
- **Vector Search**: Search your indexed content using natural language queries
- **Highlighted Results**: View relevant content with your search matches highlighted
- **History Tracking**: Keep track of your previous searches

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" at the top right
4. Click "Load unpacked" and select the `chrome-plugin` folder from this repository
5. The extension should now be installed and visible in your Chrome toolbar

## How to Use

### Indexing Content

1. Visit any webpage you want to index
2. Click on the Web RAG Search extension icon in your toolbar to open the popup
3. Go to the "Index" tab
4. Click "Index Current Page" to extract and index the content
5. The page will be processed and added to your local index

### Searching Content

1. Click on the Web RAG Search extension icon in your toolbar
2. Enter your search query in the search box
3. Click "Search" or press Enter
4. View the search results ranked by relevance
5. Click "View & Highlight" on any result to open the page with the relevant content highlighted

### Managing Indexed Content

1. Go to the "Index" tab in the extension popup
2. View all indexed pages and their statistics
3. Use the "Delete" button to remove individual pages from the index
4. Use the "Clear All Data" button to remove all indexed content

## Privacy

All indexed content is stored locally in your browser using Chrome's storage API. No data is sent to external servers except for the transformers model which is loaded from a CDN.

## Technical Details

This extension uses:
- Transformers.js for embedding generation (MiniLM-L6-v2 model)
- Semantic similarity search with cosine similarity
- Chrome's storage API for persisting indexed content
- Content extraction with DOM manipulation

## License

This project is licensed under the MIT License - see the LICENSE file for details. 