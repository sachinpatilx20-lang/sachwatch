// --- State Management ---
let watchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
let history = JSON.parse(localStorage.getItem('history')) || [];
let searchTimeout;
let peer = null;
let p2pConn = null;

// --- DOM Elements ---
const searchInput = document.getElementById('movie-search');
const searchResults = document.getElementById('search-results');
const watchlistGrid = document.getElementById('watchlist-grid');
const historyGrid = document.getElementById('history-grid');
const watchlistCount = document.getElementById('watchlist-count');
const historyCount = document.getElementById('history-count');
const tabs = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('main section');

// Modals
const movieModal = document.getElementById('movie-modal');
const syncModal = document.getElementById('sync-modal');
const closeBtns = document.querySelectorAll('.close-modal');
const modalOverlays = document.querySelectorAll('.modal-overlay');

// Sync/P2P
const openSyncBtn = document.getElementById('open-sync');
const syncTabBtns = document.querySelectorAll('.sync-tab-btn');
const syncSections = document.querySelectorAll('.sync-section');
const startP2PBtn = document.getElementById('start-p2p');
const stopP2PBtn = document.getElementById('stop-p2p');
const p2pMyIdDisplay = document.getElementById('p2p-my-id');
const p2pConnectBtn = document.getElementById('p2p-connect-btn');
const p2pConnectInput = document.getElementById('p2p-connect-input');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    renderWatchlist();
    renderHistory();
    setupEventListeners();
    checkURLForPeer();
});

function setupEventListeners() {
    // Search logic
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length < 2) {
            searchResults.classList.add('hidden');
            return;
        }
        searchTimeout = setTimeout(() => fetchMovies(query), 400);
    });

    // Tab switching (Watchlist/History)
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            sections.forEach(s => {
                s.classList.add('hidden');
                if (s.id === `${target}-section`) s.classList.remove('hidden');
            });
        });
    });

    // Sync Modal Tab Switching
    syncTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            syncTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            syncSections.forEach(s => {
                s.classList.add('hidden');
                if (s.id === `${target}-panel`) s.classList.remove('hidden');
            });
        });
    });

    // Modal Control
    openSyncBtn.onclick = () => syncModal.classList.remove('hidden');
    closeBtns.forEach(btn => btn.onclick = closeAllModals);
    modalOverlays.forEach(ol => ol.onclick = closeAllModals);

    // Sync Actions
    document.getElementById('generate-sync').onclick = generateSyncCode;
    document.getElementById('load-sync').onclick = loadFromSyncCode;
    startP2PBtn.onclick = startP2PSharing;
    stopP2PBtn.onclick = stopP2PSharing;
    p2pConnectBtn.onclick = () => {
        const id = p2pConnectInput.value.trim();
        if (id) connectToPeer(id);
    };

    // Global Clicks
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('hidden');
        }
    });
}

function closeAllModals() {
    movieModal.classList.add('hidden');
    syncModal.classList.add('hidden');
}

// --- API & Rendering ---
async function fetchMovies(query) {
    try {
        const res = await fetch(`https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.ok && data.description) renderSearchResults(data.description);
    } catch (err) {
        console.error('API Error:', err);
    }
}

function renderSearchResults(movies) {
    searchResults.innerHTML = '';
    movies.forEach(movie => {
        const item = document.createElement('div');
        item.className = 'search-result-item'; // Styles should match old but I'll add inline or fix style.css
        item.style.padding = '1rem';
        item.style.display = 'flex';
        item.style.gap = '1rem';
        item.style.cursor = 'pointer';
        item.style.borderRadius = '12px';
        item.style.transition = '0.3s';
        
        item.innerHTML = `
            <img src="${movie['#IMG_POSTER'] || ''}" style="width:40px; height:60px; border-radius:4px; object-fit:cover;">
            <div>
                <h4 style="font-size:0.9rem;">${movie['#TITLE']}</h4>
                <p style="font-size:0.8rem; color:var(--text-secondary)">${movie['#YEAR']}</p>
            </div>
        `;
        item.onmouseover = () => item.style.background = 'rgba(255,255,255,0.05)';
        item.onmouseout = () => item.style.background = 'transparent';
        item.onclick = () => showMovieDetails(movie);
        searchResults.appendChild(item);
    });
    searchResults.classList.remove('hidden');
}

function showMovieDetails(movie) {
    searchResults.classList.add('hidden');
    document.getElementById('modal-img').src = movie['#IMG_POSTER'] || '';
    document.getElementById('modal-title').textContent = movie['#TITLE'];
    document.getElementById('modal-year').textContent = movie['#YEAR'];
    document.getElementById('modal-rating').textContent = movie['#RANK'] ? `IMDb Rank: ${movie['#RANK']}` : 'N/A';
    document.getElementById('modal-actors').textContent = movie['#ACTORS'] || '';

    const inWatchlist = watchlist.some(m => m['#IMDB_ID'] === movie['#IMDB_ID']);
    const inHistory = history.some(m => m['#IMDB_ID'] === movie['#IMDB_ID']);

    const addBtn = document.getElementById('modal-add-btn');
    const watchedBtn = document.getElementById('modal-watched-btn');

    addBtn.textContent = inWatchlist ? 'In Watchlist' : 'Add to Watchlist';
    addBtn.disabled = inWatchlist;
    addBtn.onclick = () => {
        watchlist.unshift(movie);
        saveData();
        renderWatchlist();
        movieModal.classList.add('hidden');
        showToast('Added to watchlist');
    };

    watchedBtn.textContent = inHistory ? 'Watched' : 'Mark Watched';
    watchedBtn.disabled = inHistory;
    watchedBtn.onclick = () => {
        watchlist = watchlist.filter(m => m['#IMDB_ID'] !== movie['#IMDB_ID']);
        history.unshift(movie);
        saveData();
        renderWatchlist();
        renderHistory();
        movieModal.classList.add('hidden');
        showToast('Marked as watched');
    };

    movieModal.classList.remove('hidden');
}

function renderWatchlist() {
    watchlistGrid.innerHTML = watchlist.length ? '' : '<p style="grid-column:1/-1; text-align:center; padding:4rem; color:var(--text-secondary)">Your watchlist is empty</p>';
    watchlist.forEach(movie => watchlistGrid.appendChild(createMovieCard(movie, true)));
    watchlistCount.textContent = `${watchlist.length} Titles`;
}

function renderHistory() {
    historyGrid.innerHTML = history.length ? '' : '<p style="grid-column:1/-1; text-align:center; padding:4rem; color:var(--text-secondary)">You haven\'t watched any movies yet</p>';
    history.forEach(movie => historyGrid.appendChild(createMovieCard(movie, false)));
    historyCount.textContent = `${history.length} Titles`;
}

function createMovieCard(movie, isWatchlist) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML = `
        <div class="card-poster">
            <img src="${movie['#IMG_POSTER'] || ''}" loading="lazy">
            <div class="card-overlay">
                <div class="card-actions">
                    ${isWatchlist ? '<button class="action-btn watched-fast"><i class="fas fa-check"></i> Watched</button>' : ''}
                    <button class="action-btn delete"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>
        <div class="card-info">
            <h3>${movie['#TITLE']}</h3>
            <p>${movie['#YEAR']}</p>
        </div>
    `;

    card.onclick = () => showMovieDetails(movie);
    card.querySelector('.delete').onclick = (e) => {
        e.stopPropagation();
        if (isWatchlist) watchlist = watchlist.filter(m => m['#IMDB_ID'] !== movie['#IMDB_ID']);
        else history = history.filter(m => m['#IMDB_ID'] !== movie['#IMDB_ID']);
        saveData();
        isWatchlist ? renderWatchlist() : renderHistory();
    };

    if (isWatchlist) {
        card.querySelector('.watched-fast').onclick = (e) => {
            e.stopPropagation();
            watchlist = watchlist.filter(m => m['#IMDB_ID'] !== movie['#IMDB_ID']);
            history.unshift(movie);
            saveData();
            renderWatchlist();
            renderHistory();
        };
    }

    return card;
}

function saveData() {
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    localStorage.setItem('history', JSON.stringify(history));
}

// --- Sync & P2P System ---
async function generateSyncCode() {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('sync-code-display').textContent = code;
    try {
        await fetch('https://api.restful-api.dev/objects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `cinetrack-sync-${code}`, data: { watchlist, history } })
        });
        showToast('Code generated!');
    } catch (e) { showToast('Sync error', 'error'); }
}

async function loadFromSyncCode() {
    const code = document.getElementById('sync-input').value.trim();
    if (code.length !== 6) return;
    try {
        const res = await fetch('https://api.restful-api.dev/objects');
        const objects = await res.json();
        const syncObj = objects.find(obj => obj.name === `cinetrack-sync-${code}`);
        if (syncObj && syncObj.data) {
            watchlist = syncObj.data.watchlist || [];
            history = syncObj.data.history || [];
            saveData(); renderWatchlist(); renderHistory();
            syncModal.classList.add('hidden');
            showToast('Vault synced!');
        }
    } catch (e) { showToast('Load error', 'error'); }
}

// P2P Logic
function startP2PSharing() {
    if (peer) return;
    document.getElementById('p2p-status-text').textContent = "Initializing...";
    document.getElementById('p2p-init-view').classList.add('hidden');
    document.getElementById('p2p-share-view').classList.remove('hidden');

    peer = new Peer();
    peer.on('open', (id) => {
        p2pMyIdDisplay.textContent = id;
        document.getElementById('p2p-status-text').textContent = "Waiting for peer...";
        generateP2PQRCode(id);
        if (window.location.protocol === 'file:') document.getElementById('p2p-protocol-warning').classList.remove('hidden');
    });

    peer.on('connection', (conn) => {
        p2pConn = conn;
        document.getElementById('p2p-status-text').textContent = "Connected!";
        showToast('Device connected!');
        setTimeout(() => {
            p2pConn.send({ type: 'VAULT', payload: { watchlist, history } });
            showToast('Data sent!');
        }, 1000);
    });
}

function stopP2PSharing() {
    if (peer) peer.destroy();
    peer = null;
    document.getElementById('p2p-init-view').classList.remove('hidden');
    document.getElementById('p2p-share-view').classList.add('hidden');
}

function generateP2PQRCode(id) {
    const container = document.getElementById('p2p-qrcode');
    container.innerHTML = '';
    let text = id;
    if (window.location.protocol !== 'file:') {
        const url = new URL(window.location.href);
        url.searchParams.set('peer', id);
        text = url.toString();
    }
    new QRCode(container, { text, width: 160, height: 160, colorDark: "#000", colorLight: "#fff" });
}

function connectToPeer(id) {
    showToast('Connecting...');
    const client = new Peer();
    client.on('open', () => {
        const conn = client.connect(id);
        conn.on('open', () => showToast('Connected!'));
        conn.on('data', (data) => {
            if (data.type === 'VAULT') handleReceivedData(data.payload);
        });
    });
}

function handleReceivedData(data) {
    if (confirm('Import vault? OK to Merge, Cancel to Replace')) {
        const ids = new Set([...watchlist, ...history].map(m => m['#IMDB_ID']));
        [...data.watchlist, ...data.history].forEach(m => {
            if (!ids.has(m['#IMDB_ID'])) watchlist.push(m);
        });
    } else {
        watchlist = data.watchlist; history = data.history;
    }
    saveData(); renderWatchlist(); renderHistory();
    showToast('Vault updated!');
}

function checkURLForPeer() {
    const id = new URLSearchParams(window.location.search).get('peer');
    if (id) {
        window.history.replaceState({}, '', window.location.pathname);
        connectToPeer(id);
    }
}

// Toast
function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed; bottom:2rem; right:2rem; background:${type === 'success' ? '#3b82f6' : '#ef4444'}; color:white; padding:1rem 2rem; border-radius:12px; z-index:9999; font-weight:700; box-shadow:0 10px 30px rgba(0,0,0,0.5); animation:slideIn 0.4s ease;`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.animation = 'slideOut 0.4s ease'; setTimeout(() => t.remove(), 400); }, 3000);
}

// Inline styles for toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    @keyframes slideOut { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(20px); } }
`;
document.head.appendChild(style);
