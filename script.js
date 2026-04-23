// State Management
let watchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
let history = JSON.parse(localStorage.getItem('history')) || [];
let searchTimeout;

// DOM Elements
const searchInput = document.getElementById('movie-search');
const searchResults = document.getElementById('search-results');
const watchlistGrid = document.getElementById('watchlist-grid');
const historyGrid = document.getElementById('history-grid');
const watchlistCount = document.getElementById('watchlist-count');
const historyCount = document.getElementById('history-count');
const tabs = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('main section');

// Modal Elements
const modal = document.getElementById('movie-modal');
const syncModal = document.getElementById('sync-modal');
const closeModalBtns = document.querySelectorAll('.close-modal');
const modalOverlays = document.querySelectorAll('.modal-overlay');

// Sync Elements
const openSyncBtn = document.getElementById('open-sync');
const syncCodeDisplay = document.getElementById('sync-code-display');
const generateSyncBtn = document.getElementById('generate-sync');
const syncInput = document.getElementById('sync-input');
const loadSyncBtn = document.getElementById('load-sync');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderWatchlist();
    renderHistory();
    setupEventListeners();
    updateStats();
});

function setupEventListeners() {
    // Search with debounce
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            searchResults.classList.add('hidden');
            return;
        }

        searchTimeout = setTimeout(() => {
            fetchMovies(query);
        }, 400);
    });

    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            sections.forEach(s => {
                s.classList.remove('active');
                if (s.id === `${target}-section`) s.classList.add('active');
            });
        });
    });

    // Close Modals
    closeModalBtns.forEach(btn => {
        btn.onclick = () => {
            modal.classList.add('hidden');
            syncModal.classList.add('hidden');
        };
    });

    modalOverlays.forEach(overlay => {
        overlay.onclick = () => {
            modal.classList.add('hidden');
            syncModal.classList.add('hidden');
        };
    });

    // Sync Event Listeners
    openSyncBtn.onclick = () => syncModal.classList.remove('hidden');
    generateSyncBtn.onclick = generateSyncCode;
    loadSyncBtn.onclick = loadFromSyncCode;

    // Hide search results on click outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('hidden');
        }
    });

    // Logo refresh (clear search)
    document.getElementById('logo-refresh').onclick = () => {
        searchInput.value = '';
        searchResults.classList.add('hidden');
    };
}

// Fetch Movies from API
async function fetchMovies(query) {
    try {
        const response = await fetch(`https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.ok && data.description) {
            renderSearchResults(data.description);
        }
    } catch (error) {
        console.error('Error fetching movies:', error);
        showToast('Failed to fetch movies. Check your connection.', 'error');
    }
}

// Render Search Results Dropdown
function renderSearchResults(movies) {
    searchResults.innerHTML = '';
    
    if (movies.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item"><p>No results found</p></div>';
    } else {
        movies.forEach(movie => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <img src="${movie['#IMG_POSTER'] || 'https://via.placeholder.com/45x65?text=?'}" alt="Poster" onerror="this.src='https://via.placeholder.com/45x65?text=?'">
                <div class="result-info">
                    <h4>${movie['#TITLE']}</h4>
                    <p>${movie['#YEAR']} • ${movie['#ACTORS'] || 'No details'}</p>
                </div>
            `;
            item.onclick = () => showMovieDetails(movie);
            searchResults.appendChild(item);
        });
    }
    
    searchResults.classList.remove('hidden');
}

// Show Movie Details in Modal
function showMovieDetails(movie) {
    searchResults.classList.add('hidden');
    
    const modalImg = document.getElementById('modal-img');
    const modalTitle = document.getElementById('modal-title');
    const modalYear = document.getElementById('modal-year');
    const modalActors = document.getElementById('modal-actors');
    const modalRating = document.getElementById('modal-rating');
    const modalAddBtn = document.getElementById('modal-add-btn');
    const modalWatchedBtn = document.getElementById('modal-watched-btn');

    modalImg.src = movie['#IMG_POSTER'] || 'https://via.placeholder.com/320x480?text=No+Poster';
    modalTitle.textContent = movie['#TITLE'];
    modalYear.textContent = movie['#YEAR'];
    modalActors.textContent = movie['#ACTORS'] ? `Starring: ${movie['#ACTORS']}` : 'Cast details unavailable';
    modalRating.textContent = movie['#RANK'] ? `Rank #${movie['#RANK']}` : 'N/A';
    
    const isInWatchlist = watchlist.find(m => m['#IMDB_ID'] === movie['#IMDB_ID']);
    const isInHistory = history.find(m => m['#IMDB_ID'] === movie['#IMDB_ID']);

    modalAddBtn.innerHTML = isInWatchlist ? '<i class="fas fa-check"></i> In Watchlist' : '<i class="fas fa-plus"></i> Watchlist';
    modalAddBtn.disabled = !!isInWatchlist;
    modalAddBtn.onclick = () => addToWatchlist(movie);

    modalWatchedBtn.innerHTML = isInHistory ? '<i class="fas fa-check-circle"></i> Watched' : '<i class="fas fa-check"></i> Watched';
    modalWatchedBtn.disabled = !!isInHistory;
    modalWatchedBtn.onclick = () => addToHistory(movie);

    modal.classList.remove('hidden');
}

// Watchlist & History Logic
function addToWatchlist(movie) {
    if (!watchlist.find(m => m['#IMDB_ID'] === movie['#IMDB_ID'])) {
        watchlist.unshift(movie);
        saveData();
        renderWatchlist();
        modal.classList.add('hidden');
        showToast('Added to your watchlist');
    }
}

function removeFromWatchlist(id) {
    watchlist = watchlist.filter(m => m['#IMDB_ID'] !== id);
    saveData();
    renderWatchlist();
    showToast('Removed from watchlist');
}

function addToHistory(movie) {
    // If it was in watchlist, remove it
    watchlist = watchlist.filter(m => m['#IMDB_ID'] !== movie['#IMDB_ID']);
    
    if (!history.find(m => m['#IMDB_ID'] === movie['#IMDB_ID'])) {
        history.unshift(movie);
        saveData();
        renderWatchlist();
        renderHistory();
        modal.classList.add('hidden');
        showToast('Marked as watched');
    }
}

function removeFromHistory(id) {
    history = history.filter(m => m['#IMDB_ID'] !== id);
    saveData();
    renderHistory();
    showToast('Removed from history');
}

// Rendering Grids
function renderWatchlist() {
    watchlistGrid.innerHTML = '';
    if (watchlist.length === 0) {
        watchlistGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-film"></i>
                <p>Your vault is empty. Start adding movies to your watchlist!</p>
            </div>
        `;
    } else {
        watchlist.forEach(movie => {
            watchlistGrid.appendChild(createMovieCard(movie, true));
        });
    }
    updateStats();
}

function renderHistory() {
    historyGrid.innerHTML = '';
    if (history.length === 0) {
        historyGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>You haven't watched anything yet. Mark movies as watched to see them here.</p>
            </div>
        `;
    } else {
        history.forEach(movie => {
            historyGrid.appendChild(createMovieCard(movie, false));
        });
    }
    updateStats();
}

function createMovieCard(movie, isWatchlist) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML = `
        <div class="card-poster">
            <img src="${movie['#IMG_POSTER'] || 'https://via.placeholder.com/220x330?text=No+Poster'}" alt="Poster" loading="lazy" onerror="this.src='https://via.placeholder.com/220x330?text=No+Poster'">
            <div class="card-overlay">
                <div class="card-actions">
                    ${isWatchlist ? `
                        <button class="action-btn watched" title="Mark as Watched"><i class="fas fa-check"></i></button>
                    ` : ''}
                    <button class="action-btn delete" title="Remove"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>
        <div class="card-info">
            <h3>${movie['#TITLE']}</h3>
            <p>${movie['#YEAR']}</p>
        </div>
    `;

    card.querySelector('.delete').onclick = (e) => {
        e.stopPropagation();
        if (isWatchlist) removeFromWatchlist(movie['#IMDB_ID']);
        else removeFromHistory(movie['#IMDB_ID']);
    };

    if (isWatchlist) {
        card.querySelector('.watched').onclick = (e) => {
            e.stopPropagation();
            addToHistory(movie);
        };
    }

    card.onclick = () => showMovieDetails(movie);
    return card;
}

// Data Persistence
function saveData() {
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    localStorage.setItem('history', JSON.stringify(history));
}

function updateStats() {
    watchlistCount.textContent = `${watchlist.length} ${watchlist.length === 1 ? 'Movie' : 'Movies'}`;
    historyCount.textContent = `${history.length} ${history.length === 1 ? 'Movie' : 'Movies'}`;
}

// Sync System (Mock Network implementation)
async function generateSyncCode() {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    syncCodeDisplay.textContent = code;
    
    const data = { watchlist, history };
    
    try {
        // Use a public free API for simulation (restful-api.dev)
        // In a real app, this would be a specialized KV store or backend
        const response = await fetch('https://api.restful-api.dev/objects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: `cinetrack-sync-${code}`,
                data: data
            })
        });
        
        if (response.ok) {
            showToast('Sync code generated!');
        }
    } catch (error) {
        console.error('Sync failed:', error);
        showToast('Network error, but code generated locally', 'warning');
    }
}

async function loadFromSyncCode() {
    const code = syncInput.value.trim();
    if (code.length !== 6) {
        showToast('Please enter a valid 6-digit code', 'error');
        return;
    }

    loadSyncBtn.disabled = true;
    loadSyncBtn.textContent = 'Syncing...';

    try {
        // First, we need to find the object with the matching name
        // This is a bit slow on this specific public API but works for a demo
        const response = await fetch('https://api.restful-api.dev/objects');
        const objects = await response.json();
        
        const syncObj = objects.find(obj => obj.name === `cinetrack-sync-${code}`);
        
        if (syncObj && syncObj.data) {
            watchlist = syncObj.data.watchlist || [];
            history = syncObj.data.history || [];
            saveData();
            renderWatchlist();
            renderHistory();
            syncModal.classList.add('hidden');
            showToast('Vault synchronized successfully!');
        } else {
            showToast('Invalid or expired code', 'error');
        }
    } catch (error) {
        console.error('Sync load failed:', error);
        showToast('Failed to sync. Try again later.', 'error');
    } finally {
        loadSyncBtn.disabled = false;
        loadSyncBtn.textContent = 'Import';
    }
}

// Toast Notification
function showToast(message, type = 'success') {
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    toast.style.animation = 'toastIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}
