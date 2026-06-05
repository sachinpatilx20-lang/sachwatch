// --- System State ---
function normalizeMovie(m) {
    if (!m) return null;
    return {
        title: m.title || m['#TITLE'] || 'Untitled',
        year: m.year || m['#YEAR'] || '—',
        poster: m.poster || m['#IMG_POSTER'] || '',
        imdbId: m.imdbId || m['#IMDB_ID'] || '',
        actors: m.actors || m['#ACTORS'] || '',
        sourceUrl: m.sourceUrl || m._source_url || null,
        aspectRatio: m.aspectRatio || m._aspectRatio || null,
        actorTags: m.actorTags || m._actorTags || []
    };
}

let watchlist = (JSON.parse(localStorage.getItem('watchlist')) || []).map(normalizeMovie).filter(Boolean);
let history = (JSON.parse(localStorage.getItem('history')) || []).map(normalizeMovie).filter(Boolean);
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
function switchSection(target) {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabItems = document.querySelectorAll('.tab-item');
    const sections = document.querySelectorAll('main section');

    [...navBtns, ...tabItems].forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`[data-tab="${target}"]`).forEach(b => b.classList.add('active'));
    sections.forEach(s => {
        s.classList.add('hidden');
        if (s.id === `${target}-section`) s.classList.remove('hidden');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
    renderVault();
    renderHistory();
    initEventListeners();
    
    // Auto P2P Connect if "?sync=XXXXXX" in URL
    const urlParams = new URLSearchParams(window.location.search);
    const syncParam = urlParams.get('sync');
    if (syncParam && syncParam.length === 6) {
        switchSection('sync');
        const syncInput = document.getElementById('sync-input');
        if (syncInput) {
            syncInput.value = syncParam;
            showToast('Connecting share code ' + syncParam + '...');
            setTimeout(() => {
                loadFromSync();
            }, 800);
        }
    }
});

function initEventListeners() {
    // Navigation Logic
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabItems = document.querySelectorAll('.tab-item');

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

    // Link Overlay
    const linkOverlay = document.getElementById('link-overlay');
    const closeLinkOverlay = document.getElementById('close-link-overlay');

    const resetLinkOverlay = () => {
        linkOverlay.classList.remove('active');
        document.getElementById('link-loading').classList.add('hidden');
        document.getElementById('link-preview').classList.add('hidden');
    };

    if (closeLinkOverlay) {
        closeLinkOverlay.onclick = resetLinkOverlay;
    }
    if (linkOverlay) {
        linkOverlay.onclick = (e) => {
            if (e.target === linkOverlay) resetLinkOverlay();
        };
    }

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
            document.getElementById('link-overlay').classList.remove('active');
            if (searchDropdown) searchDropdown.classList.add('hidden');
        }
    });
}

// --- Movie Core ---
async function fetchMovies(query, container) {
    // 1. Local Search
    const q = query.toLowerCase();
    const filterFn = m => {
        const titleMatch = (m.title || '').toLowerCase().includes(q);
        const actorStrMatch = (m.actors || '').toLowerCase().includes(q);
        const tagsMatch = (m.actorTags || []).some(tag => tag.toLowerCase().includes(q));
        return titleMatch || actorStrMatch || tagsMatch;
    };
    const localMatches = [
        ...watchlist.filter(filterFn),
        ...history.filter(filterFn)
    ].slice(0, 8); // Slightly higher limit for local results

    // 2. URL Detection
    const isUrl = /^https?:\/\//i.test(query);

    // 3. IMDb Search
    let imdbResults = [];
    if (!isUrl && query.length > 2) {
        try {
            const res = await fetch(`https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.ok && data.description) {
                imdbResults = data.description.map(normalizeMovie).filter(Boolean);
            }
        } catch (err) { console.error('IMDb Fetch Error:', err); }
    }

    renderUnifiedSearch(query, localMatches, imdbResults, isUrl, container);
}

function renderUnifiedSearch(query, local, online, isUrl, container) {
    container.innerHTML = '';
    
    // Header for Local results if they exist
    if (local.length > 0) {
        const h = document.createElement('div');
        h.style.cssText = 'padding: 0.6rem 1rem; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px; border-bottom: 1px solid var(--border);';
        h.textContent = 'Local Library';
        container.appendChild(h);
        
        local.forEach(m => renderSearchItem(m, container, true));
    }

    // Microlink Option
    if (isUrl) {
        const linkRow = document.createElement('div');
        linkRow.className = 'search-item';
        linkRow.style.cssText = 'padding: 1rem; display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid var(--border); cursor: pointer; background: var(--accent-dim);';
        linkRow.innerHTML = `
            <div style="width:36px; height:36px; border-radius:10px; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.9rem;">
                <i class="fas fa-link"></i>
            </div>
            <div style="flex:1;">
                <h4 style="font-size:0.88rem; font-weight:700;">Import Movie Link</h4>
                <p style="font-size:0.75rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${query}</p>
            </div>
        `;
        linkRow.onclick = () => {
            container.classList.add('hidden');
            if (mainSearch) mainSearch.value = '';
            if (mobileSearchInput) mobileSearchInput.value = '';
            document.getElementById('search-overlay').classList.remove('active');
            
            // Trigger Microlink fetch
            const linkOverlay = document.getElementById('link-overlay');
            linkOverlay.classList.add('active');
            fetchFromLink(query);
        };
        container.appendChild(linkRow);
    }

    // Header for Online results
    if (online.length > 0) {
        const h = document.createElement('div');
        h.style.cssText = 'padding: 0.6rem 1rem; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px; border-bottom: 1px solid var(--border);';
        h.textContent = 'Online Search';
        container.appendChild(h);
        
        online.forEach(m => renderSearchItem(m, container, false));
    }

    if (local.length === 0 && online.length === 0 && !isUrl) {
        container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No results found</div>';
    }

    container.classList.remove('hidden');
}

function renderSearchItem(movie, container, isLocal) {
    const row = document.createElement('div');
    row.className = 'search-item';
    row.style.cssText = `
        padding: 0.8rem 1rem;
        display: flex;
        gap: 0.8rem;
        align-items: center;
        border-bottom: 1px solid var(--border);
        cursor: pointer;
        transition: background 0.2s ease;
        position: relative;
    `;
    const posterSrc = movie.poster || '';
    row.innerHTML = `
        <img src="${posterSrc}" style="width:40px; height:56px; border-radius:6px; object-fit:cover; background:var(--surface);">
        <div style="flex:1; min-width:0;">
            <h4 style="font-size:0.88rem; font-weight:700; letter-spacing:-0.2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${movie.title}</h4>
            <p style="font-size:0.75rem; color:var(--text-muted); font-weight:500; margin-top:0.1rem;">${movie.year} ${isLocal ? '· <span style="color:var(--accent); font-weight:700;">On My List</span>' : ''}</p>
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
}

function openMovieDetails(movie) {
    const isLink = !!movie.sourceUrl;
    document.getElementById('modal-img').src = movie.poster || '';
    document.getElementById('modal-title').textContent = movie.title;
    document.getElementById('modal-desc').innerHTML = `
        <span class="year-badge">${movie.year}</span>
        <span>${movie.actors || 'Film Details'}</span>
    `;

    // Reset visibility
    const linkActions = document.getElementById('modal-link-actions');
    const editSection = document.getElementById('modal-edit-section');
    const actorsSection = document.getElementById('modal-actors-section');
    
    linkActions.classList.toggle('hidden', !isLink);
    actorsSection.classList.toggle('hidden', !isLink);
    editSection.classList.add('hidden'); // Always hidden initially

    if (isLink) {
        // Copy URL
        document.getElementById('modal-copy-url').onclick = () => {
            navigator.clipboard.writeText(movie.sourceUrl).then(() => showToast('URL Copied'));
        };
        // Open URL
        document.getElementById('modal-open-url').onclick = () => {
            window.open(movie.sourceUrl, '_blank');
        };
        // Toggle Edit
        document.getElementById('modal-edit-toggle').onclick = () => {
            editSection.classList.toggle('hidden');
            if (!editSection.classList.contains('hidden')) {
                document.getElementById('modal-edit-title').value = movie.title;
                document.getElementById('modal-edit-desc').value = movie.actors || '';
            }
        };
        // Save Edit
        document.getElementById('modal-edit-save').onclick = () => {
            movie.title = document.getElementById('modal-edit-title').value || movie.title;
            movie.actors = document.getElementById('modal-edit-desc').value || movie.actors;
            save();
            document.getElementById('modal-title').textContent = movie.title;
            document.getElementById('modal-desc').innerHTML = `
                <span class="year-badge">${movie.year}</span>
                <span>${movie.actors}</span>
            `;
            editSection.classList.add('hidden');
            renderVault();
            renderHistory();
            showToast('Changes Saved');
        };

        // Actors Tags Logic
        if (!movie.actorTags) movie.actorTags = [];
        const renderTags = () => {
            const tagContainer = document.getElementById('modal-actor-tags');
            tagContainer.innerHTML = '';
            movie.actorTags.forEach((tag, idx) => {
                const tagEl = document.createElement('div');
                tagEl.className = 'actor-tag';
                tagEl.innerHTML = `${tag}<button onclick="event.stopPropagation(); this.parentElement.remove(); window.removeModalTag('${movie.imdbId}', ${idx})"><i class="fas fa-times"></i></button>`;
                tagContainer.appendChild(tagEl);
            });
        };
        
        window.removeModalTag = (id, idx) => {
            movie.actorTags.splice(idx, 1);
            save();
            renderTags();
            renderVault();
            renderHistory();
        };

        document.getElementById('modal-add-actor').onclick = () => {
            const input = document.getElementById('modal-actor-input');
            const val = input.value.trim();
            if (val && !movie.actorTags.includes(val)) {
                movie.actorTags.push(val);
                save();
                renderTags();
                renderVault();
                renderHistory();
                input.value = '';
            }
        };
        document.getElementById('modal-actor-input').onkeydown = (e) => {
            if (e.key === 'Enter') document.getElementById('modal-add-actor').click();
        };
        renderTags();
    }

    const inWatchlist = watchlist.some(m => m.imdbId === movie.imdbId);
    const inHistory = history.some(m => m.imdbId === movie.imdbId);

    const addBtn = document.getElementById('add-to-vault');
    const watchBtn = document.getElementById('mark-watched');

    addBtn.textContent = inWatchlist ? 'On My List' : 'Add to My List';
    addBtn.disabled = inWatchlist;
    addBtn.onclick = () => {
        watchlist.unshift(movie); save(); renderVault();
        closeModal(); showToast('Added to My List');
    };

    watchBtn.textContent = inHistory ? 'Completed' : 'Mark Completed';
    watchBtn.disabled = inHistory;
    watchBtn.onclick = () => {
        watchlist = watchlist.filter(m => m.imdbId !== movie.imdbId);
        history.unshift(movie); save(); renderVault(); renderHistory();
        closeModal(); showToast('Marked as Completed');
    };

    // Remove Option
    const oldR = document.getElementById('remove-btn');
    if (oldR) oldR.remove();
    if (inWatchlist || inHistory) {
        const rBtn = document.createElement('button');
        rBtn.id = 'remove-btn';
        rBtn.className = 'btn-ghost';
        rBtn.style.color = '#ff4a4a';
        rBtn.style.borderColor = 'transparent';
        rBtn.textContent = 'Remove';
        rBtn.onclick = () => {
            watchlist = watchlist.filter(m => m.imdbId !== movie.imdbId);
            history = history.filter(m => m.imdbId !== movie.imdbId);
            save(); renderVault(); renderHistory();
            closeModal(); showToast('Removed from My List');
        };
        document.querySelector('.modal-actions').appendChild(rBtn);
    }

    mainModal.classList.add('active');
}

function closeModal() { mainModal.classList.remove('active'); }

function renderVault() {
    watchlistGrid.innerHTML = '';
    const heroBanner = document.getElementById('hero-banner');
    
    if (!watchlist.length) {
        if (heroBanner) {
            heroBanner.classList.add('hidden');
            heroBanner.innerHTML = '';
        }
        watchlistGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-play empty-state-icon"></i>
                <h2>Your list is empty</h2>
                <p>Search for a movie or TV show to start building your library</p>
            </div>
        `;
        return;
    }
    
    // Feature the first movie in the list as a Cinematic Hero Banner
    if (heroBanner) {
        const featured = watchlist[0];
        heroBanner.classList.remove('hidden');
        const posterSrc = featured.poster || '';
        const tagsHtml = (featured.actorTags || []).map(tag => `<span class="hero-tag">${tag}</span>`).join('');
        
        heroBanner.innerHTML = `
            <div class="hero-backdrop" style="background-image: linear-gradient(to top, var(--bg) 5%, rgba(7, 7, 10, 0.4) 50%, rgba(7, 7, 10, 0.8) 100%), url('${posterSrc}');"></div>
            <div class="hero-content">
                <span class="hero-badge-featured"><i class="fas fa-star"></i> Featured on My List</span>
                <h1 class="hero-title">${featured.title}</h1>
                <div class="hero-meta">
                    <span class="hero-year">${featured.year}</span>
                    <span class="hero-actors">${featured.actors || 'No details available'}</span>
                </div>
                <div class="hero-tags">${tagsHtml}</div>
                <div class="hero-buttons">
                    <button class="btn-prime hero-btn-watch" id="hero-watch-btn"><i class="fas fa-play"></i> View Details</button>
                    <button class="btn-ghost hero-btn-remove" id="hero-remove-btn"><i class="fas fa-times"></i> Remove</button>
                </div>
            </div>
        `;
        
        document.getElementById('hero-watch-btn').onclick = () => openMovieDetails(featured);
        document.getElementById('hero-remove-btn').onclick = (e) => {
            e.stopPropagation();
            watchlist = watchlist.filter(m => m.imdbId !== featured.imdbId);
            save();
            renderVault();
            showToast('Removed from My List');
        };
    }
    
    // Render the rest of the watchlist in the grid
    const displayList = watchlist.slice(1);
    
    if (displayList.length === 0) {
        return;
    }

    displayList.forEach((m, i) => {
        const card = createCard(m);
        card.style.animationDelay = `${i * 0.05}s`;
        watchlistGrid.appendChild(card);
    });
}

function renderHistory() {
    historyGrid.innerHTML = '';
    if (!history.length) {
        historyGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history empty-state-icon"></i>
                <h2>Nothing completed yet</h2>
                <p>Movies and TV shows you finish will appear here</p>
            </div>
        `;
        return;
    }
    history.forEach((m, i) => {
        const card = createCard(m);
        card.style.animationDelay = `${i * 0.05}s`;
        historyGrid.appendChild(card);
    });
}

function createCard(movie) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    const posterSrc = movie.poster || '';
    const aspectStyle = movie.aspectRatio ? `aspect-ratio: ${movie.aspectRatio};` : '';
    const tagsHtml = (movie.actorTags || []).map(tag => `<span class="card-tag">${tag}</span>`).join('');
    card.innerHTML = `
        <div class="poster-wrap" style="${aspectStyle}">
            <img src="${posterSrc}" loading="lazy" alt="${movie.title}">
            <button class="quick-action" title="Remove"><i class="fas fa-times"></i></button>
        </div>
        <div class="card-info">
            <div class="card-tags">${tagsHtml}</div>
            <h3>${movie.title}</h3>
            <p>${movie.year}</p>
        </div>
    `;
    card.onclick = () => openMovieDetails(movie);
    card.querySelector('.quick-action').onclick = (e) => {
        e.stopPropagation();
        watchlist = watchlist.filter(m => m.imdbId !== movie.imdbId);
        history = history.filter(m => m.imdbId !== movie.imdbId);
        save(); renderVault(); renderHistory();
        showToast('Removed from My List');
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
    const qrContainer = document.getElementById('p2p-qr');
    const peerId = `${SYNC_PREFIX}${code}`;
    
    display.textContent = code;
    display.style.opacity = '0.5';

    peer = new Peer(peerId);

    peer.on('open', () => {
        display.style.opacity = '1';
        showToast('Broadcasting collection...');
        
        // Generate QR Code
        if (qrContainer) {
            qrContainer.innerHTML = '';
            qrContainer.classList.remove('hidden');
            const joinUrl = `${window.location.origin}${window.location.pathname}?sync=${code}`;
            new QRCode(qrContainer, {
                text: joinUrl,
                width: 140,
                height: 140,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.M
            });
        }
    });

    peer.on('connection', (conn) => {
        showToast('Device Connected');
        conn.on('open', () => {
            conn.send({ watchlist, history });
            showToast('Collection shared successfully!');
        });
    });

    peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            generateSyncCode(); // Try again if collision
        } else {
            showToast('Sync Connection Failed');
            display.textContent = 'ERR';
            if (qrContainer) {
                qrContainer.classList.add('hidden');
                qrContainer.innerHTML = '';
            }
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
                const incomingWatchlist = (data.watchlist || []).map(normalizeMovie).filter(Boolean);
                const incomingHistory = (data.history || []).map(normalizeMovie).filter(Boolean);
                const existingIds = new Set([
                    ...watchlist.map(m => m.imdbId),
                    ...history.map(m => m.imdbId)
                ]);
                incomingWatchlist.forEach(m => {
                    if (!existingIds.has(m.imdbId)) watchlist.push(m);
                });
                incomingHistory.forEach(m => {
                    if (!existingIds.has(m.imdbId)) history.push(m);
                });
                save(); renderVault(); renderHistory();
                showToast('Import successful!');
                input.value = '';
                tempPeer.destroy();
            }
        });

        setTimeout(() => {
            if (tempPeer.open && !conn.open) {
                showToast('Share code not found or expired');
                tempPeer.destroy();
            }
        }, 5000);
    });

    tempPeer.on('error', () => {
        showToast('Connection Failed');
        tempPeer.destroy();
    });
}

// --- Multi-Source Metadata Fetch (inspired by links app) ---
let linkSelectedThumb = '';
let linkCurrentMeta = null;

async function fetchLinkMetadata(url) {
    let results = {
        title: url,
        description: '',
        images: [],
        url: url
    };

    const resolveUrl = (relative) => {
        try { return new URL(relative, url).href; } catch (e) { return relative; }
    };

    // YouTube fast path
    if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
        try {
            let ytUrl = url;
            if (url.includes('youtu.be/')) {
                const id = url.split('youtu.be/')[1].split('?')[0];
                ytUrl = `https://www.youtube.com/watch?v=${id}`;
            }
            const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(ytUrl)}&format=json`);
            const data = await res.json();
            if (data.title) {
                results.title = data.title;
                results.description = `YouTube · ${data.author_name}`;
                if (data.thumbnail_url) results.images.push(data.thumbnail_url);
            }
        } catch (e) {}
    }

    // Parallel fetchers for max coverage
    await Promise.allSettled([
        fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`)
            .then(res => res.json())
            .then(data => {
                if (data.title && results.title === url) results.title = data.title;
                if (data.author_name && !results.description) results.description = `By ${data.author_name}`;
                if (data.thumbnail_url) results.images.push(data.thumbnail_url);
            }),
        fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    const m = data.data;
                    if (m.title && results.title === url) results.title = m.title;
                    if (m.description && !results.description) results.description = m.description;
                    if (m.image?.url) results.images.push(m.image.url);
                    if (m.logo?.url) results.images.push(m.logo.url);
                }
            }),
        fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
            .then(res => res.json())
            .then(data => {
                const doc = new DOMParser().parseFromString(data.contents, 'text/html');
                const getM = (s) => doc.querySelector(`meta[property="${s}"], meta[name="${s}"]`)?.getAttribute('content');

                const title = getM('og:title') || getM('twitter:title') || doc.title;
                if (title && results.title === url) results.title = title;

                const desc = getM('og:description') || getM('twitter:description') || getM('description');
                if (desc && !results.description) results.description = desc;

                const og = getM('og:image') || getM('twitter:image');
                if (og) results.images.push(resolveUrl(og));

                // Grab icons too
                ['apple-touch-icon', 'icon', 'shortcut icon'].forEach(rel => {
                    const href = doc.querySelector(`link[rel="${rel}"]`)?.getAttribute('href');
                    if (href) results.images.push(resolveUrl(href));
                });
            })
    ]).catch(err => console.warn('Parallel fetch error:', err));

    // Fallback title
    if (results.title === url) {
        try { results.title = new URL(url).hostname; } catch (e) {}
    }

    // Dedupe images
    results.images = [...new Set(results.images.filter(Boolean))];

    // Fallback screenshot
    if (results.images.length === 0) {
        results.images.push(`https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`);
    }

    return results;
}

async function fetchFromLink(url) {
    if (!url) return;

    const loading = document.getElementById('link-loading');
    const preview = document.getElementById('link-preview');
    preview.classList.add('hidden');
    loading.classList.remove('hidden');

    try {
        const meta = await fetchLinkMetadata(url);
        linkCurrentMeta = meta;
        loading.classList.add('hidden');

        // Show preview
        document.getElementById('link-preview-title').textContent = meta.title;
        document.getElementById('link-preview-desc').textContent = meta.description || 'No description available';

        // Thumbnail picker
        const picker = document.getElementById('link-thumb-picker');
        const status = document.getElementById('link-thumb-status');
        picker.innerHTML = '';

        if (meta.images.length === 1 && meta.images[0].includes('mshots')) {
            status.textContent = 'No images found — using screenshot:';
        } else {
            status.textContent = `Select a thumbnail (${meta.images.length} found):`;
        }

        linkSelectedThumb = meta.images[0] || '';

        meta.images.forEach((img, i) => {
            const div = document.createElement('div');
            div.className = 'link-thumb-option' + (i === 0 ? ' selected' : '');
            div.innerHTML = `<img src="${img}" onerror="this.parentElement.remove()">`;
            div.onclick = () => {
                picker.querySelectorAll('.link-thumb-option').forEach(o => o.classList.remove('selected'));
                div.classList.add('selected');
                linkSelectedThumb = img;
            };
            picker.appendChild(div);
        });

        // Confirm button
        const confirmBtn = document.getElementById('link-confirm-btn');
        confirmBtn.onclick = () => {
            // Detect the selected thumbnail's natural aspect ratio
            const selectedEl = picker.querySelector('.link-thumb-option.selected img');
            let ratio = null;
            if (selectedEl && selectedEl.naturalWidth && selectedEl.naturalHeight) {
                ratio = `${selectedEl.naturalWidth} / ${selectedEl.naturalHeight}`;
            }

            const movie = {
                title: linkCurrentMeta.title || 'Untitled',
                year: new URL(linkCurrentMeta.url).hostname,
                poster: linkSelectedThumb,
                imdbId: 'link-' + btoa(linkCurrentMeta.url).slice(0, 16),
                actors: linkCurrentMeta.description || '',
                sourceUrl: linkCurrentMeta.url,
                aspectRatio: ratio,
                actorTags: []
            };
            watchlist.unshift(movie);
            save();
            renderVault();
            showToast('Added to Watchlist');

            // Reset overlay
            document.getElementById('link-overlay').classList.remove('active');
            if (mainSearch) mainSearch.value = '';
            if (mobileSearchInput) mobileSearchInput.value = '';
            preview.classList.add('hidden');
        };

        preview.classList.remove('hidden');
    } catch (err) {
        console.error('Fetch Error:', err);
        loading.classList.add('hidden');
        showToast('Fetch failed');
    }
}


function showToast(msg) {
    // Remove any existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);

    // Trigger reflow then animate in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            t.classList.add('visible');
        });
    });

    setTimeout(() => {
        t.classList.remove('visible');
        setTimeout(() => t.remove(), 350);
    }, 2500);
}
