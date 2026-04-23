// --- State Management ---
let watchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
let history = JSON.parse(localStorage.getItem('history')) || [];
let searchTimeout;
let peer = null;

// --- DOM Elements ---
const watchlistGrid = document.getElementById('watchlist-grid');
const historyGrid = document.getElementById('history-grid');
const mainSearch = document.getElementById('main-search');
const mobileSearchInput = document.getElementById('mobile-search-input');
const desktopSearchResults = document.getElementById('desktop-search-results');
const mobileSearchResults = document.getElementById('mobile-search-results');
const modalOverlay = document.getElementById('universal-modal');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    renderWatchlist();
    renderHistory();
    setupEventListeners();
});

function setupEventListeners() {
    // Responsive Navigation
    const navBtns = document.querySelectorAll('.nav-btn');
    const mobileTabs = document.querySelectorAll('.mobile-tab');
    const sections = document.querySelectorAll('main section');

    const switchTab = (target) => {
        [...navBtns, ...mobileTabs].forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`[data-tab="${target}"]`).forEach(b => b.classList.add('active'));
        
        sections.forEach(s => {
            s.classList.add('hidden');
            if (s.id === `${target}-section`) s.classList.remove('hidden');
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    navBtns.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    mobileTabs.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));

    // Search Logic (Dual Input)
    const handleSearch = (query, resultsContainer) => {
        clearTimeout(searchTimeout);
        if (query.length < 2) {
            resultsContainer.classList.add('hidden');
            resultsContainer.innerHTML = '';
            return;
        }
        searchTimeout = setTimeout(() => fetchMovies(query, resultsContainer), 400);
    };

    mainSearch.oninput = (e) => handleSearch(e.target.value, desktopSearchResults);
    mobileSearchInput.oninput = (e) => handleSearch(e.target.value, mobileSearchResults);

    // Mobile Search Overlay
    document.getElementById('open-mobile-search').onclick = () => {
        document.getElementById('search-overlay').classList.add('active');
        mobileSearchInput.focus();
    };
    document.getElementById('close-mobile-search').onclick = () => {
        document.getElementById('search-overlay').classList.remove('active');
        mobileSearchInput.value = '';
        mobileSearchResults.innerHTML = '';
    };

    // Modal Control
    document.getElementById('modal-close').onclick = closeModal;
    modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };

    // Sync Actions
    document.getElementById('generate-sync').onclick = generateSyncCode;
    document.getElementById('load-sync').onclick = loadFromSyncCode;
    document.getElementById('start-p2p').onclick = startP2P;
    document.getElementById('stop-p2p').onclick = stopP2P;
    document.getElementById('copy-share-link').onclick = copyShareLink;

    // Global Clicks
    document.addEventListener('click', (e) => {
        if (!mainSearch.contains(e.target) && !desktopSearchResults.contains(e.target)) {
            desktopSearchResults.classList.add('hidden');
        }
    });
}

// --- API & Rendering ---
async function fetchMovies(query, resultsContainer) {
    try {
        const res = await fetch(`https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.ok && data.description) renderSearchResults(data.description, resultsContainer);
    } catch (err) { console.error(err); }
}

function renderSearchResults(movies, container) {
    container.innerHTML = '';
    movies.forEach(movie => {
        const item = document.createElement('div');
        item.style.padding = '1rem';
        item.style.display = 'flex';
        item.style.gap = '1rem';
        item.style.cursor = 'pointer';
        item.style.alignItems = 'center';
        item.style.borderBottom = '1px solid var(--border)';
        item.innerHTML = `
            <img src="${movie['#IMG_POSTER'] || ''}" style="width:40px; height:60px; border-radius:8px; object-fit:cover;">
            <div>
                <h4 style="font-size:0.95rem; font-weight:800;">${movie['#TITLE']}</h4>
                <p style="font-size:0.85rem; color:var(--text-muted)">${movie['#YEAR']}</p>
            </div>
        `;
        item.onclick = () => {
            mainSearch.value = '';
            mobileSearchInput.value = '';
            container.classList.add('hidden');
            document.getElementById('search-overlay').classList.remove('active');
            showMovieDetails(movie);
        };
        container.appendChild(item);
    });
    container.classList.remove('hidden');
}

function showMovieDetails(movie) {
    document.getElementById('modal-img').src = movie['#IMG_POSTER'] || '';
    document.getElementById('modal-title').textContent = movie['#TITLE'];
    
    const inWatchlist = watchlist.some(m => m['#IMDB_ID'] === movie['#IMDB_ID']);
    const inHistory = history.some(m => m['#IMDB_ID'] === movie['#IMDB_ID']);

    const addBtn = document.getElementById('modal-add-btn');
    const watchedBtn = document.getElementById('modal-watched-btn');

    addBtn.textContent = inWatchlist ? 'In Vault' : 'Add to Vault';
    addBtn.disabled = inWatchlist;
    addBtn.onclick = () => {
        watchlist.unshift(movie); saveData(); renderWatchlist();
        closeModal(); showToast('Added to vault');
    };

    watchedBtn.textContent = inHistory ? 'Watched' : 'Mark Watched';
    watchedBtn.disabled = inHistory;
    watchedBtn.onclick = () => {
        watchlist = watchlist.filter(m => m['#IMDB_ID'] !== movie['#IMDB_ID']);
        history.unshift(movie); saveData(); renderWatchlist(); renderHistory();
        closeModal(); showToast('Marked as watched');
    };

    modalOverlay.classList.add('active');
}

function closeModal() { modalOverlay.classList.remove('active'); }

function renderWatchlist() {
    watchlistGrid.innerHTML = watchlist.length ? '' : '<p style="grid-column:1/-1; text-align:center; padding:4rem; color:var(--text-muted)">Vault is empty</p>';
    watchlist.forEach(m => watchlistGrid.appendChild(createCard(m, true)));
}

function renderHistory() {
    historyGrid.innerHTML = history.length ? '' : '<p style="grid-column:1/-1; text-align:center; padding:4rem; color:var(--text-muted)">No history yet</p>';
    history.forEach(m => historyGrid.appendChild(createCard(m, false)));
}

function createCard(movie, isVault) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML = `
        <div class="card-poster"><img src="${movie['#IMG_POSTER'] || ''}" loading="lazy"></div>
        <div class="card-info">
            <h3>${movie['#TITLE']}</h3>
            <p>${movie['#YEAR']}</p>
        </div>
    `;
    card.onclick = () => showMovieDetails(movie);
    return card;
}

function saveData() {
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    localStorage.setItem('history', JSON.stringify(history));
}

// --- Sync System ---
async function generateSyncCode() {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('sync-code-display').textContent = code;
    try {
        await fetch('https://api.restful-api.dev/objects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `cinetrack-sync-${code}`, data: { watchlist, history } })
        });
        showToast('Code ready!');
    } catch (e) { showToast('Sync failed', 'error'); }
}

async function loadFromSyncCode() {
    const code = document.getElementById('sync-input').value.trim();
    if (code.length !== 6) return;
    try {
        const res = await fetch('https://api.restful-api.dev/objects');
        const objects = await res.json();
        const syncObj = objects.find(obj => obj.name === `cinetrack-sync-${code}`);
        if (syncObj) {
            watchlist = syncObj.data.watchlist || [];
            history = syncObj.data.history || [];
            saveData(); renderWatchlist(); renderHistory();
            showToast('Vault imported!');
        }
    } catch (e) { showToast('Import failed', 'error'); }
}

function startP2P() {
    if (peer) return;
    peer = new Peer();
    peer.on('open', (id) => {
        document.getElementById('p2p-my-id').textContent = id;
        document.getElementById('p2p-share-view').classList.remove('hidden');
        new QRCode(document.getElementById('p2p-qrcode'), { text: id, width: 160, height: 160 });
    });
    peer.on('connection', (conn) => {
        showToast('Device connected!');
        setTimeout(() => conn.send({ type: 'VAULT', payload: { watchlist, history } }), 1000);
    });
}

function stopP2P() { if (peer) peer.destroy(); peer = null; document.getElementById('p2p-share-view').classList.add('hidden'); }

function copyShareLink() {
    const id = document.getElementById('p2p-my-id').textContent;
    navigator.clipboard.writeText(id);
    showToast('ID copied!');
}

function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed; bottom:2rem; left:50%; transform:translateX(-50%); background:#000; color:#fff; padding:0.8rem 1.5rem; border-radius:25px; z-index:9999; font-weight:800; font-size:0.9rem; box-shadow:0 10px 30px rgba(0,0,0,0.2);`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
