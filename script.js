// --- System State ---
let watchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
let history = JSON.parse(localStorage.getItem('history')) || [];
let searchTimeout;
let peer = null;

const SYNC_PREFIX = "cinematic-vault-";

// --- DOM References ---
const watchlistGrid = document.getElementById('watchlist-grid');
const historyGrid = document.getElementById('history-grid');
const mainSearch = document.getElementById('main-search');
const mobileSearchInput = document.getElementById('mobile-search-input');
const searchDropdown = document.getElementById('search-dropdown');
const mobileResults = document.getElementById('mobile-results');
const mainModal = document.getElementById('main-modal');

// --- Start App ---
document.addEventListener('DOMContentLoaded', () => {
    renderVault();
    renderHistory();
    initEventListeners();
});

function initEventListeners() {
    // Navigation Logic
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabItems = document.querySelectorAll('.tab-item');
    const sections = document.querySelectorAll('main section');

    const switchSection = (target) => {
        [...navBtns, ...tabItems].forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`[data-tab="${target}"]`).forEach(b => b.classList.add('active'));
        sections.forEach(s => {
            s.classList.add('hidden');
            if (s.id === `${target}-section`) s.classList.remove('hidden');
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    navBtns.forEach(btn => btn.onclick = () => switchSection(btn.dataset.tab));
    tabItems.forEach(btn => btn.onclick = () => switchSection(btn.dataset.tab));

    // Search Interaction
    const triggerSearch = (query, container) => {
        clearTimeout(searchTimeout);
        if (query.length < 2) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }
        searchTimeout = setTimeout(() => fetchMovies(query, container), 400);
    };

    if (mainSearch) mainSearch.oninput = (e) => triggerSearch(e.target.value.trim(), searchDropdown);
    if (mobileSearchInput) mobileSearchInput.oninput = (e) => triggerSearch(e.target.value.trim(), mobileResults);

    // Mobile Search Handlers
    const searchBtn = document.getElementById('mobile-search-btn');
    if (searchBtn) {
        searchBtn.onclick = () => {
            document.getElementById('search-overlay').classList.add('active');
            setTimeout(() => mobileSearchInput.focus(), 300);
        };
    }

    const closeSearchBtn = document.getElementById('close-search');
    if (closeSearchBtn) {
        closeSearchBtn.onclick = () => {
            document.getElementById('search-overlay').classList.remove('active');
            mobileSearchInput.value = '';
            mobileResults.innerHTML = '';
        };
    }

    // Modal Handlers
    document.getElementById('close-modal').onclick = closeModal;
    mainModal.onclick = (e) => { if (e.target === mainModal) closeModal(); };

    // Sync Actions
    document.getElementById('generate-sync').onclick = generateSyncCode;
    document.getElementById('load-sync').onclick = loadFromSync;

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (mainSearch && !mainSearch.contains(e.target) && searchDropdown && !searchDropdown.contains(e.target)) {
            searchDropdown.classList.add('hidden');
        }
    });

    // ESC to exit all
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.getElementById('search-overlay').classList.remove('active');
            if (searchDropdown) searchDropdown.classList.add('hidden');
        }
    });
}

// --- Movie Core ---
async function fetchMovies(query, container) {
    try {
        const res = await fetch(`https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.ok && data.description) renderSearchResults(data.description, container);
    } catch (err) { console.error('Fetch Error:', err); }
}

function renderSearchResults(movies, container) {
    container.innerHTML = '';
    movies.forEach(movie => {
        const row = document.createElement('div');
        row.className = 'result-row';
        row.style.cssText = `padding: 1rem; display: flex; gap: 1rem; align-items: center; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.3s ease;`;
        row.innerHTML = `
            <img src="${movie['#IMG_POSTER'] || ''}" style="width:50px; height:70px; border-radius:8px; object-fit:cover;">
            <div style="flex:1">
                <h4 style="font-size:0.95rem; font-weight:700;">${movie['#TITLE']}</h4>
                <p style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">${movie['#YEAR']}</p>
            </div>
        `;
        row.onmouseover = () => row.style.background = 'var(--surface)';
        row.onmouseout = () => row.style.background = 'transparent';
        row.onclick = () => {
            container.classList.add('hidden');
            if (mainSearch) mainSearch.value = '';
            if (mobileSearchInput) mobileSearchInput.value = '';
            document.getElementById('search-overlay').classList.remove('active');
            openMovieDetails(movie);
        };
        container.appendChild(row);
    });
    container.classList.remove('hidden');
}

function openMovieDetails(movie) {
    document.getElementById('modal-img').src = movie['#IMG_POSTER'] || '';
    document.getElementById('modal-title').textContent = movie['#TITLE'];
    document.getElementById('modal-desc').innerHTML = `
        <span style="display:inline-block; margin-right:0.5rem; background:var(--accent); color:white; padding:0.2rem 0.4rem; border-radius:4px; font-size:0.7rem; font-weight:700;">${movie['#YEAR']}</span>
        <span>${movie['#ACTORS'] || 'Film Details'}</span>
    `;

    const inWatchlist = watchlist.some(m => m['#IMDB_ID'] === movie['#IMDB_ID']);
    const inHistory = history.some(m => m['#IMDB_ID'] === movie['#IMDB_ID']);

    const addBtn = document.getElementById('add-to-vault');
    const watchBtn = document.getElementById('mark-watched');

    addBtn.textContent = inWatchlist ? 'In Vault' : 'Add to Vault';
    addBtn.disabled = inWatchlist;
    addBtn.onclick = () => {
        watchlist.unshift(movie); save(); renderVault();
        closeModal(); showToast('Added to Vault');
    };

    watchBtn.textContent = inHistory ? 'Finished' : 'Mark Finished';
    watchBtn.disabled = inHistory;
    watchBtn.onclick = () => {
        watchlist = watchlist.filter(m => m['#IMDB_ID'] !== movie['#IMDB_ID']);
        history.unshift(movie); save(); renderVault(); renderHistory();
        closeModal(); showToast('Marked as Finished');
    };

    // Remove Option
    const oldR = document.getElementById('remove-btn');
    if (oldR) oldR.remove();
    if (inWatchlist || inHistory) {
        const rBtn = document.createElement('button');
        rBtn.id = 'remove-btn';
        rBtn.className = 'btn-ghost';
        rBtn.style.color = '#ff4444';
        rBtn.style.marginTop = '0.5rem';
        rBtn.textContent = 'Remove Forever';
        rBtn.onclick = () => {
            watchlist = watchlist.filter(m => m['#IMDB_ID'] !== movie['#IMDB_ID']);
            history = history.filter(m => m['#IMDB_ID'] !== movie['#IMDB_ID']);
            save(); renderVault(); renderHistory();
            closeModal(); showToast('Removed');
        };
        document.querySelector('.modal-actions').appendChild(rBtn);
    }

    mainModal.classList.add('active');
}

function closeModal() { mainModal.classList.remove('active'); }

function renderVault() {
    watchlistGrid.innerHTML = watchlist.length ? '' : `
        <div style="grid-column:1/-1; text-align:center; padding:4rem 1rem; color:var(--text-muted);">
            <i class="fas fa-layer-group" style="font-size:2rem; margin-bottom:1rem; opacity:0.1;"></i>
            <h2 style="font-weight:700; color:var(--text); font-size:1.2rem;">Your Vault is Empty</h2>
            <p style="font-weight:500; font-size:0.9rem;">Search for a movie to start</p>
        </div>
    `;
    watchlist.forEach(m => watchlistGrid.appendChild(createCard(m)));
}

function renderHistory() {
    historyGrid.innerHTML = history.length ? '' : `
        <div style="grid-column:1/-1; text-align:center; padding:4rem 1rem; color:var(--text-muted);">
            <i class="fas fa-check-circle" style="font-size:2rem; margin-bottom:1rem; opacity:0.1;"></i>
            <h2 style="font-weight:700; color:var(--text); font-size:1.2rem;">No History</h2>
            <p style="font-weight:500; font-size:0.9rem;">Finished movies appear here</p>
        </div>
    `;
    history.forEach(m => historyGrid.appendChild(createCard(m)));
}

function createCard(movie) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML = `
        <div class="poster-wrap">
            <img src="${movie['#IMG_POSTER'] || ''}" loading="lazy" alt="${movie['#TITLE']}">
            <button class="quick-action" title="Remove"><i class="fas fa-times"></i></button>
        </div>
        <div class="card-info">
            <h3>${movie['#TITLE']}</h3>
            <p>${movie['#YEAR']}</p>
        </div>
    `;
    card.onclick = () => openMovieDetails(movie);
    card.querySelector('.quick-action').onclick = (e) => {
        e.stopPropagation();
        watchlist = watchlist.filter(m => m['#IMDB_ID'] !== movie['#IMDB_ID']);
        history = history.filter(m => m['#IMDB_ID'] !== movie['#IMDB_ID']);
        save(); renderVault(); renderHistory();
        showToast('Removed');
    };
    return card;
}

function save() {
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    localStorage.setItem('history', JSON.stringify(history));
}

// --- Sync Hub Logic (P2P via 6-digit code) ---
function generateSyncCode() {
    if (peer) peer.destroy();
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const display = document.getElementById('sync-code-display');
    const peerId = `${SYNC_PREFIX}${code}`;
    
    display.textContent = code;
    display.style.opacity = '0.5';

    peer = new Peer(peerId);

    peer.on('open', () => {
        display.style.opacity = '1';
        showToast('Broadcasting Vault...');
    });

    peer.on('connection', (conn) => {
        showToast('Device Connected');
        conn.on('open', () => {
            conn.send({ watchlist, history });
            showToast('Collection Sent');
        });
    });

    peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            generateSyncCode(); // Try again if collision
        } else {
            showToast('P2P Error');
            display.textContent = 'ERR';
        }
    });
}

function loadFromSync() {
    const input = document.getElementById('sync-input');
    const code = input.value.trim();
    if (code.length !== 6) {
        showToast('Enter 6 Digits');
        return;
    }

    showToast('Connecting...');
    const tempPeer = new Peer();
    
    tempPeer.on('open', () => {
        const conn = tempPeer.connect(`${SYNC_PREFIX}${code}`);
        
        conn.on('data', (data) => {
            if (data.watchlist || data.history) {
                watchlist = data.watchlist || [];
                history = data.history || [];
                save(); renderVault(); renderHistory();
                showToast('Import Success');
                input.value = '';
                tempPeer.destroy();
            }
        });

        setTimeout(() => {
            if (tempPeer.open && !conn.open) {
                showToast('Code Not Found');
                tempPeer.destroy();
            }
        }, 5000);
    });

    tempPeer.on('error', () => {
        showToast('Connection Failed');
        tempPeer.destroy();
    });
}

function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed; bottom:2rem; left:50%; transform:translateX(-50%); background:black; color:white; padding:0.6rem 1.2rem; border-radius:10px; z-index:9999; font-weight:700; box-shadow:0 10px 30px rgba(0,0,0,0.1); font-size:0.8rem; pointer-events:none; opacity:0; transition: all 0.3s ease;`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.style.opacity = '1', 10);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 2500);
}
