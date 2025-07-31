/**
 * Reading Archive JavaScript
 * Handles CSV loading, parsing, and article rendering with individual card editing
 */

// DOM element references
const elements = {
    loading: () => document.getElementById('loading'),
    error: () => document.getElementById('error'),
    container: () => document.getElementById('articles-container'),
    count: () => document.getElementById('article-count'),
    filterContainer: () => document.getElementById('filter-container'),
    filterTags: () => document.getElementById('filter-tags'),
    filterClearAll: () => document.getElementById('filter-clear-all')
};

// Global state
let articles = [];
let currentFilters = [];

/**
 * Parse CSV data into article objects
 * @param {string} csvText - Raw CSV content
 * @returns {Array<Object>} Array of article objects
 */
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const parsedArticles = [];
    
    // Skip header row and process data rows
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Enhanced CSV parsing to handle 6 columns (title, url, date, favorite, review, tags)
        const matches = line.match(/^"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)"$/);
        if (matches) {
            const [, title, url, date, favorite, review, tags] = matches;
            
            if (title && url && date) {
                try {
                    // Parse tags from comma-separated string
                    const tagArray = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
                    
                    parsedArticles.push({
                        title,
                        url,
                        date,
                        favorite: favorite === 'true',
                        review: review || '',
                        tags: tagArray,
                        domain: new URL(url).hostname.replace('www.', ''),
                        originalIndex: i - 1 // Store original index for CSV updates
                    });
                } catch (error) {
                    console.warn('Invalid URL:', url, error);
                }
            }
        }
    }
    
    return parsedArticles;
}

/**
 * Convert articles back to CSV format
 * @param {Array<Object>} articles - Array of article objects
 * @returns {string} CSV formatted string
 */
function articlesToCSV(articles) {
    const header = 'title,url,date,favorite,review,tags';
    const rows = articles.map(article => {
        const tagsString = (article.tags || []).join(',');
        return `"${article.title}","${article.url}","${article.date}","${article.favorite}","${article.review || ''}","${tagsString}"`;
    });
    return [header, ...rows].join('\n');
}

/**
 * Save updated CSV to server
 * @param {string} csvContent - CSV content to save
 */
async function saveCSV(csvContent) {
    try {
        const response = await fetch('/api/save-csv', {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: csvContent
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Save successful:', result.message);
        
        return result;
    } catch (error) {
        console.error('Error saving CSV:', error);
        throw error;
    }
}

/**
 * Format date for display
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch (error) {
        console.warn('Invalid date:', dateString);
        return dateString;
    }
}

/**
 * Create a tag input element
 * @param {string} value - Initial value for the tag input
 * @param {HTMLElement} container - Container to add the input to
 * @param {Function} onInput - Callback for input changes
 * @returns {HTMLElement} The created input element
 */
function createTagInput(value = '', container, onInput) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tag-input';
    input.value = value;
    input.placeholder = 'Add tag...';
    
    input.addEventListener('input', () => {
        if (onInput) onInput();
        
        // Auto-add new empty input if this one has content and is the last one
        if (input.value.trim() && input === container.lastElementChild) {
            createTagInput('', container, onInput);
        }
        
        // Remove empty inputs (except the last one)
        if (!input.value.trim() && input !== container.lastElementChild) {
            container.removeChild(input);
        }
    });
    
    container.appendChild(input);
    return input;
}

/**
 * Get all tag values from a container
 * @param {HTMLElement} container - Container with tag inputs
 * @returns {Array<string>} Array of tag values
 */
function getTagsFromContainer(container) {
    const inputs = container.querySelectorAll('.tag-input');
    return Array.from(inputs)
        .map(input => input.value.trim())
        .filter(value => value);
}

/**
 * Set up tag inputs for an article in edit mode
 * @param {HTMLElement} container - Tags container element
 * @param {Array<string>} tags - Current tags for the article
 * @param {Function} onInput - Callback for input changes
 */
function setupTagInputs(container, tags, onInput) {
    // Clear existing inputs
    container.innerHTML = '';
    
    // Add inputs for existing tags
    tags.forEach(tag => {
        createTagInput(tag, container, onInput);
    });
    
    // Always have at least one empty input
    createTagInput('', container, onInput);
}

/**
 * Enter edit mode for a specific article
 * @param {number} articleIndex - Index of the article to edit
 * @param {HTMLElement} articleElement - The article DOM element
 */
function enterEditMode(articleIndex, articleElement) {
    articleElement.classList.add('editing');
    
    const article = articles[articleIndex];
    const dateInput = articleElement.querySelector('.article-date-input');
    const favoriteInput = articleElement.querySelector('.favorite-checkbox');
    const urlInput = articleElement.querySelector('.article-url-input');
    const titleInput = articleElement.querySelector('.article-title-input');
    const reviewInput = articleElement.querySelector('.article-review-input');
    const tagsContainer = articleElement.querySelector('.article-tags-container');
    const saveButton = articleElement.querySelector('.save-button');
    
    // Determine if this is a new article (no title and URL)
    const isNewArticle = !article.title && !article.url;
    
    // Set values
    dateInput.value = article.date;
    favoriteInput.checked = article.favorite;
    urlInput.value = article.url || '';
    titleInput.value = article.title;
    reviewInput.value = article.review || '';
    
    // Always show URL input for both new and existing articles
    urlInput.style.display = 'block';
    
    // Focus appropriate input
    if (isNewArticle) {
        urlInput.focus(); // Focus URL input for new articles
    } else {
        titleInput.focus(); // Focus title input for existing articles
    }
    
    // Set up tag inputs
    setupTagInputs(tagsContainer, article.tags || [], checkForChanges);
    
    // Auto-resize textarea
    titleInput.style.height = 'auto';
    titleInput.style.height = titleInput.scrollHeight + 'px';
    
    // Track changes to show save button
    let hasChanges = false;
    
    function checkForChanges() {
        const titleChanged = titleInput.value.trim() !== article.title;
        const dateChanged = dateInput.value !== article.date;
        const favoriteChanged = favoriteInput.checked !== article.favorite;
        const urlChanged = urlInput.value.trim() !== (article.url || '');
        const reviewChanged = reviewInput.value.trim() !== (article.review || '');
        const currentTags = getTagsFromContainer(tagsContainer);
        const originalTags = article.tags || [];
        const tagsChanged = JSON.stringify(currentTags.sort()) !== JSON.stringify(originalTags.sort());
        
        if ((titleChanged || dateChanged || favoriteChanged || urlChanged || reviewChanged || tagsChanged || isNewArticle) && !hasChanges) {
            hasChanges = true;
            saveButton.classList.add('show');
        } else if (!titleChanged && !dateChanged && !favoriteChanged && !urlChanged && !reviewChanged && !tagsChanged && !isNewArticle && hasChanges) {
            hasChanges = false;
            saveButton.classList.remove('show');
        }
    }
    
    titleInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
        checkForChanges();
    });
    
    dateInput.addEventListener('input', checkForChanges);
    favoriteInput.addEventListener('change', checkForChanges);
    urlInput.addEventListener('input', checkForChanges);
    reviewInput.addEventListener('input', checkForChanges);
    
    // Save functionality
    saveButton.addEventListener('click', async () => {
        if (!hasChanges && !isNewArticle) return;
        
        saveButton.disabled = true;
        try {
            const currentTags = getTagsFromContainer(tagsContainer);
            
            if (isNewArticle) {
                await saveNewArticle(articleIndex, titleInput.value.trim(), urlInput.value.trim(), dateInput.value, favoriteInput.checked, reviewInput.value.trim(), currentTags);
            } else {
                // For existing articles, update the saveArticleChanges call to include URL
                await saveArticleChangesWithUrl(articleIndex, titleInput.value.trim(), urlInput.value.trim(), dateInput.value, favoriteInput.checked, reviewInput.value.trim(), currentTags);
            }
            exitEditMode(articleElement);
        } finally {
            saveButton.disabled = false;
        }
    });
    
    // Exit edit mode on Escape key
    function handleKeydown(e) {
        if (e.key === 'Escape') {
            // For new articles, remove them if escape is pressed
            if (isNewArticle) {
                articles.shift(); // Remove from beginning instead of end
                articleElement.remove();
                elements.count().textContent = `${articles.length} articles`;
            } else {
                exitEditMode(articleElement);
            }
            document.removeEventListener('keydown', handleKeydown);
        }
    }
    document.addEventListener('keydown', handleKeydown);
    
    // Exit edit mode when clicking outside
    function handleClickOutside(e) {
        if (!articleElement.contains(e.target)) {
            // For new articles, remove them if clicking outside
            if (isNewArticle) {
                articles.shift(); // Remove from beginning instead of end
                articleElement.remove();
                elements.count().textContent = `${articles.length} articles`;
            } else {
                exitEditMode(articleElement);
            }
            document.removeEventListener('click', handleClickOutside);
        }
    }
    setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
    }, 0);
}

/**
 * Exit edit mode for an article
 * @param {HTMLElement} articleElement - The article DOM element
 */
function exitEditMode(articleElement) {
    articleElement.classList.remove('editing');
    const saveButton = articleElement.querySelector('.save-button');
    saveButton.classList.remove('show');
}

/**
 * Save article changes
 * @param {number} articleIndex - Index of article in the articles array
 * @param {string} newTitle - New title for the article
 * @param {string} newDate - New date for the article (YYYY-MM-DD format)
 * @param {boolean} newFavorite - New favorite status for the article
 * @param {string} newReview - New review text for the article
 * @param {Array<string>} newTags - New tags for the article
 */
async function saveArticleChanges(articleIndex, newTitle, newDate, newFavorite, newReview, newTags) {
    if (articleIndex < 0 || articleIndex >= articles.length) {
        console.error('Invalid article index');
        return;
    }
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        alert('Please enter a valid date in YYYY-MM-DD format');
        return;
    }
    
    // Update the article
    articles[articleIndex].title = newTitle;
    articles[articleIndex].date = newDate;
    articles[articleIndex].favorite = newFavorite;
    articles[articleIndex].review = newReview;
    articles[articleIndex].tags = newTags || [];
    
    try {
        // Convert to CSV and save
        const csvContent = articlesToCSV(articles);
        await saveCSV(csvContent);
        
        // Re-render the articles
        renderArticles(articles);
        
        console.log('Article saved successfully');
    } catch (error) {
        console.error('Error saving article:', error);
        // Show error to user
        alert('Error saving changes. Please try again.');
    }
}

/**
 * Save article changes including URL
 * @param {number} articleIndex - Index of article in the articles array
 * @param {string} newTitle - New title for the article
 * @param {string} newUrl - New URL for the article
 * @param {string} newDate - New date for the article (YYYY-MM-DD format)
 * @param {boolean} newFavorite - New favorite status for the article
 * @param {string} newReview - New review text for the article
 * @param {Array<string>} newTags - New tags for the article
 */
async function saveArticleChangesWithUrl(articleIndex, newTitle, newUrl, newDate, newFavorite, newReview, newTags) {
    if (articleIndex < 0 || articleIndex >= articles.length) {
        console.error('Invalid article index');
        return;
    }
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        alert('Please enter a valid date in YYYY-MM-DD format');
        return;
    }
    
    // Validate URL format
    try {
        new URL(newUrl);
    } catch (error) {
        alert('Please enter a valid URL');
        return;
    }
    
    // Update the article
    articles[articleIndex].title = newTitle;
    articles[articleIndex].url = newUrl;
    articles[articleIndex].date = newDate;
    articles[articleIndex].favorite = newFavorite;
    articles[articleIndex].review = newReview;
    articles[articleIndex].tags = newTags || [];
    articles[articleIndex].domain = new URL(newUrl).hostname.replace('www.', '');
    
    try {
        // Convert to CSV and save
        const csvContent = articlesToCSV(articles);
        await saveCSV(csvContent);
        
        // Re-render the articles
        renderArticles(articles);
        
        console.log('Article saved successfully');
    } catch (error) {
        console.error('Error saving article:', error);
        // Show error to user
        alert('Error saving changes. Please try again.');
    }
}

/**
 * Create a new empty article and enter edit mode
 */
function createNewArticle() {
    // Create a new empty article object
    const newArticle = {
        title: '',
        url: '',
        date: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
        favorite: false,
        review: '',
        tags: [],
        domain: '',
        originalIndex: 0 // Will be at the top
    };
    
    // Add to beginning of articles array
    articles.unshift(newArticle);
    const newIndex = 0; // New article is now at index 0
    
    // Update original indices for all other articles
    for (let i = 1; i < articles.length; i++) {
        articles[i].originalIndex = i;
    }
    
    // Create and add the article element at the top
    const articleElement = createArticleElement(newArticle, newIndex);
    const container = elements.container();
    container.insertBefore(articleElement, container.firstChild);
    
    // Update article count
    elements.count().textContent = `${articles.length} articles`;
    
    // Enter edit mode immediately
    enterEditMode(newIndex, articleElement);
    
    // Scroll to the new article
    articleElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Save a new article (different from editing existing)
 * @param {number} articleIndex - Index of the new article
 * @param {string} title - Title for the article
 * @param {string} url - URL for the article
 * @param {string} date - Date for the article
 * @param {boolean} favorite - Favorite status
 * @param {string} review - Review text
 * @param {Array<string>} tags - Tags array
 */
async function saveNewArticle(articleIndex, title, url, date, favorite, review, tags) {
    if (articleIndex < 0 || articleIndex >= articles.length) {
        console.error('Invalid article index');
        return;
    }
    
    // Validate required fields
    if (!title.trim() || !url.trim()) {
        alert('Title and URL are required for new articles');
        return;
    }
    
    // Validate URL format
    try {
        new URL(url);
    } catch (error) {
        alert('Please enter a valid URL');
        return;
    }
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        alert('Please enter a valid date in YYYY-MM-DD format');
        return;
    }
    
    // Update the article with domain
    articles[articleIndex].title = title;
    articles[articleIndex].url = url;
    articles[articleIndex].date = date;
    articles[articleIndex].favorite = favorite;
    articles[articleIndex].review = review;
    articles[articleIndex].tags = tags || [];
    articles[articleIndex].domain = new URL(url).hostname.replace('www.', '');
    
    try {
        // Convert to CSV and save
        const csvContent = articlesToCSV(articles);
        await saveCSV(csvContent);
        
        // Re-render the articles
        renderArticles(articles);
        
        console.log('New article saved successfully');
    } catch (error) {
        console.error('Error saving new article:', error);
        // Show error to user
        alert('Error saving new article. Please try again.');
    }
}

/**
 * Fetch and load articles from CSV file
 */
async function loadArticles() {
    const loadingElement = elements.loading();
    const errorElement = elements.error();
    
    try {
        const response = await fetch('articles.csv');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const csvText = await response.text();
        articles = parseCSV(csvText);
        
        if (articles.length === 0) {
            throw new Error('No valid articles found in CSV file');
        }
        
        loadingElement.style.display = 'none';
        renderArticles(articles);
        
    } catch (error) {
        console.error('Error loading articles:', error);
        showError(`Error loading articles: ${error.message}`);
    }
}

/**
 * Display error message
 * @param {string} message - Error message to display
 */
function showError(message) {
    const loadingElement = elements.loading();
    const errorElement = elements.error();
    
    loadingElement.style.display = 'none';
    errorElement.style.display = 'block';
    errorElement.textContent = message;
}

/**
 * Add a tag to the current filters
 * @param {string} tag - Tag to add to filters
 */
function addTagFilter(tag) {
    if (!currentFilters.includes(tag)) {
        currentFilters.push(tag);
        updateFilterDisplay();
        applyFilters();
    }
}

/**
 * Remove a tag from the current filters
 * @param {string} tag - Tag to remove from filters
 */
function removeTagFilter(tag) {
    const index = currentFilters.indexOf(tag);
    if (index > -1) {
        currentFilters.splice(index, 1);
        updateFilterDisplay();
        applyFilters();
    }
}

/**
 * Clear all current filters
 */
function clearAllFilters() {
    currentFilters = [];
    updateFilterDisplay();
    applyFilters();
}

/**
 * Update the filter display UI
 */
function updateFilterDisplay() {
    const filterContainer = elements.filterContainer();
    const filterTags = elements.filterTags();
    
    if (currentFilters.length === 0) {
        filterContainer.classList.remove('active');
        return;
    }
    
    filterContainer.classList.add('active');
    filterTags.innerHTML = '';
    
    currentFilters.forEach(tag => {
        const filterTag = document.createElement('div');
        filterTag.className = 'filter-tag';
        
        const tagText = document.createElement('span');
        tagText.textContent = tag;
        
        const removeButton = document.createElement('button');
        removeButton.className = 'filter-tag-remove';
        removeButton.textContent = '×';
        removeButton.title = `Remove ${tag} filter`;
        removeButton.addEventListener('click', () => removeTagFilter(tag));
        
        filterTag.appendChild(tagText);
        filterTag.appendChild(removeButton);
        filterTags.appendChild(filterTag);
    });
}

/**
 * Apply current filters to articles
 */
function applyFilters() {
    if (currentFilters.length === 0) {
        renderArticles(articles);
        updateTagHighlighting([]);
        return;
    }
    
    // Filter articles that contain ALL selected tags
    const filteredArticles = articles.filter(article => {
        if (!article.tags || article.tags.length === 0) {
            return false;
        }
        
        // Check if article has all selected tags
        return currentFilters.every(filterTag => 
            article.tags.includes(filterTag)
        );
    });
    
    renderArticles(filteredArticles);
    updateTagHighlighting(currentFilters);
}

/**
 * Update tag highlighting across all articles
 * @param {Array<string>} activeTags - Tags to highlight
 */
function updateTagHighlighting(activeTags) {
    const allTagChips = document.querySelectorAll('.tag-chip');
    
    allTagChips.forEach(chip => {
        if (activeTags.includes(chip.textContent)) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}

/**
 * Handle tag chip click
 * @param {string} tag - Tag that was clicked
 */
function handleTagClick(tag) {
    if (currentFilters.includes(tag)) {
        // If tag is already filtered, remove it
        removeTagFilter(tag);
    } else {
        // Add tag to filters
        addTagFilter(tag);
    }
}

/**
 * Render articles to the DOM
 * @param {Array<Object>} articles - Array of article objects
 */
function renderArticles(articles) {
    const container = elements.container();
    const countElement = elements.count();
    
    // Update article count
    countElement.textContent = `${articles.length} articles`;
    
    // Clear container and render articles
    container.innerHTML = '';
    
    articles.forEach((article, index) => {
        const articleElement = createArticleElement(article, index);
        container.appendChild(articleElement);
    });
}

/**
 * Create a single article DOM element
 * @param {Object} article - Article object with title, url, date, favorite, and review
 * @param {number} index - Index of the article in the articles array
 * @returns {HTMLElement} Article DOM element
 */
function createArticleElement(article, index) {
    const articleElement = document.createElement('div');
    articleElement.className = 'article-item';
    
    // Create edit trigger area (invisible, top-right corner)
    const editTrigger = document.createElement('div');
    editTrigger.className = 'article-edit-trigger';
    editTrigger.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        enterEditMode(index, articleElement);
    });
    
    // Create date row with optional star
    const dateRow = document.createElement('div');
    dateRow.className = 'article-date-row';
    
    // Add star if favorited
    if (article.favorite) {
        const starElement = document.createElement('span');
        starElement.className = 'article-favorite-star';
        starElement.textContent = 'star';
        dateRow.appendChild(starElement);
    }
    
    const dateElement = document.createElement('div');
    dateElement.className = 'article-date';
    dateElement.textContent = formatDate(article.date);
    dateRow.appendChild(dateElement);
    
    // Create title link (only if article has title and URL)
    let linkElement = null;
    if (article.title && article.url) {
        linkElement = document.createElement('a');
        linkElement.href = article.url;
        linkElement.target = '_blank';
        linkElement.rel = 'noopener noreferrer';
        linkElement.className = 'article-title-link';
        linkElement.textContent = article.title;
    } else {
        // For new/empty articles, show placeholder text
        linkElement = document.createElement('div');
        linkElement.className = 'article-title-placeholder';
        linkElement.textContent = 'New Article - Click to edit';
    }
    
    // Create review display (only if review exists)
    let reviewElement = null;
    if (article.review && article.review.trim()) {
        reviewElement = document.createElement('div');
        reviewElement.className = 'article-review';
        reviewElement.textContent = article.review;
    }
    
    // Create tags display (only if tags exist)
    let tagsElement = null;
    if (article.tags && article.tags.length > 0) {
        tagsElement = document.createElement('div');
        tagsElement.className = 'article-tags';
        
        article.tags.forEach(tag => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.textContent = tag;
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleTagClick(tag);
            });
            tagsElement.appendChild(chip);
        });
    }
    
    // Create edit container (hidden by default)
    const editContainer = document.createElement('div');
    editContainer.className = 'article-edit-container';
    
    // Create edit controls row
    const editControls = document.createElement('div');
    editControls.className = 'article-edit-controls';
    
    // Create date input
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'article-date-input';
    
    // Create favorite toggle
    const favoriteContainer = document.createElement('div');
    favoriteContainer.className = 'favorite-toggle-container';
    
    const favoriteLabel = document.createElement('span');
    favoriteLabel.className = 'favorite-toggle-label';
    favoriteLabel.textContent = 'Favorite';
    
    const favoriteToggle = document.createElement('label');
    favoriteToggle.className = 'favorite-toggle';
    
    const favoriteCheckbox = document.createElement('input');
    favoriteCheckbox.type = 'checkbox';
    favoriteCheckbox.className = 'favorite-checkbox';
    
    const favoriteSlider = document.createElement('span');
    favoriteSlider.className = 'favorite-slider';
    
    favoriteToggle.appendChild(favoriteCheckbox);
    favoriteToggle.appendChild(favoriteSlider);
    
    favoriteContainer.appendChild(favoriteLabel);
    favoriteContainer.appendChild(favoriteToggle);
    
    editControls.appendChild(dateInput);
    editControls.appendChild(favoriteContainer);
    
    // Create URL input (for new articles)
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.className = 'article-url-input';
    urlInput.placeholder = 'https://example.com';
    
    // Create textarea for editing title
    const titleInput = document.createElement('textarea');
    titleInput.className = 'article-title-input';
    titleInput.placeholder = 'Enter article title...';
    titleInput.rows = 1;
    
    // Create textarea for editing review
    const reviewInput = document.createElement('textarea');
    reviewInput.className = 'article-review-input';
    reviewInput.placeholder = 'Add your review or thoughts about this article...';
    reviewInput.rows = 3;
    
    // Create tags input container
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'article-tags-container';
    
    editContainer.appendChild(editControls);
    editContainer.appendChild(urlInput);
    editContainer.appendChild(titleInput);
    editContainer.appendChild(reviewInput);
    editContainer.appendChild(tagsContainer);
    
    // Create save button
    const saveButton = document.createElement('button');
    saveButton.className = 'save-button';
    saveButton.title = 'Save changes';
    
    // Assemble the article
    articleElement.appendChild(editTrigger);
    articleElement.appendChild(dateRow);
    articleElement.appendChild(linkElement);
    if (reviewElement) {
        articleElement.appendChild(reviewElement);
    }
    if (tagsElement) {
        articleElement.appendChild(tagsElement);
    }
    articleElement.appendChild(editContainer);
    articleElement.appendChild(saveButton);
    
    return articleElement;
}

/**
 * Initialize the application
 */
function initializeApp() {
    loadArticles();
    
    // Add event listener for the add button
    const addButton = document.getElementById('add-button');
    if (addButton) {
        addButton.addEventListener('click', createNewArticle);
    }
    
    // Add event listener for the clear all filters button
    const filterClearAll = elements.filterClearAll();
    if (filterClearAll) {
        filterClearAll.addEventListener('click', clearAllFilters);
    }
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp); 