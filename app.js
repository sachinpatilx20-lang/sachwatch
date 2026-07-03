/**
 * Sach — Unified Link & Media Organizer
 * Combines Sachlink and SachWatch with premium P2P Syncing,
 * Smart Metadata extraction, and responsive grid layouts.
 */

// Standalone utility for fetch with timeout that returns parsed JSON
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 2500 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        clearTimeout(id);
        return data;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

class SachApp {
    constructor() {
        this.items = [];
        this.activeTab = 'library'; // 'library' (My List), 'sync'
        this.activeType = 'all';  // always 'all' to show links and movies combined
        this.activeTag = 'all';
        this.searchQuery = '';
        
        this.tempTags = []; // Temp tag storage for add link
        this.currentUrl = '';
        this.currentMetadata = null;
        this.selectedThumb = '';
        this.editingId = null;
        this.currentCrop = 1200;
        this.theme = localStorage.getItem('sach_theme') || 'dark';
        this.peer = null;
        this.searchTimeout = null;

        this.initData();
        this.initElements();
        this.initEvents();
        this.setTheme(this.theme);
        this.render();
        
        // Auto P2P Connect if "?sync=XXXXXX" in URL
        this.checkUrlSync();
    }

    // Initialize data & run migrator for previous databases
    initData() {
        let rawLibrary = localStorage.getItem('sach_data');
        if (!rawLibrary) rawLibrary = localStorage.getItem('sachvault_data');
        if (rawLibrary) {
            try {
                this.items = JSON.parse(rawLibrary) || [];
                // Migration: reset completed to false and clear tags for movies
                let changed = false;
                this.items.forEach(item => {
                    if (item.completed) {
                        item.completed = false;
                        changed = true;
                    }
                    if (item.type === 'movie' && item.tags && item.tags.length > 0) {
                        item.tags = [];
                        changed = true;
                    }
                });
                if (changed) this.saveItems();
                return;
            } catch (e) {
                console.error("Error parsing legacy data:", e);
            }
        }

        // Data Migration logic
        this.items = [];
        let migrated = false;

        // 1. Migrate Links
        const rawLinks = localStorage.getItem('vidlinks');
        if (rawLinks) {
            try {
                const links = JSON.parse(rawLinks);
                if (Array.isArray(links)) {
                    links.forEach(l => {
                        this.items.push({
                            id: l.id || ('sv_' + Date.now() + Math.random().toString(36).substr(2, 5)),
                            type: 'link',
                            title: l.title || 'Untitled Link',
                            desc: l.desc || '',
                            thumb: l.thumb || '',
                            url: l.url || '',
                            tags: Array.isArray(l.tags) ? l.tags : [],
                            date: l.date || Date.now(),
                            completed: false,
                            year: this.getHostname(l.url)
                        });
                    });
                    migrated = true;
                }
            } catch (e) { console.error("Link migration error:", e); }
        }

        // 2. Migrate Active watchlist movies
        const rawWatchlist = localStorage.getItem('watchlist');
        if (rawWatchlist) {
            try {
                const wl = JSON.parse(rawWatchlist);
                if (Array.isArray(wl)) {
                    wl.forEach(m => {
                        this.items.push({
                            id: m.imdbId ? ('movie_' + m.imdbId) : ('movie_' + Date.now() + Math.random().toString(36).substr(2, 5)),
                            type: 'movie',
                            title: m.title || 'Untitled Movie',
                            desc: m.actors || '',
                            thumb: m.poster || '',
                            url: m.sourceUrl || '',
                            tags: [],
                            date: Date.now(),
                            completed: false,
                            year: m.year || '—',
                            imdbId: m.imdbId || '',
                            aspectRatio: m.aspectRatio || '2/3'
                        });
                    });
                    migrated = true;
                }
            } catch (e) { console.error("Watchlist migration error:", e); }
        }

        // 3. Migrate Completed movies as active library movies
        const rawHistory = localStorage.getItem('history');
        if (rawHistory) {
            try {
                const hist = JSON.parse(rawHistory);
                if (Array.isArray(hist)) {
                    hist.forEach(m => {
                        this.items.push({
                            id: m.imdbId ? ('movie_' + m.imdbId) : ('movie_' + Date.now() + Math.random().toString(36).substr(2, 5)),
                            type: 'movie',
                            title: m.title || 'Untitled Movie',
                            desc: m.actors || '',
                            thumb: m.poster || '',
                            url: m.sourceUrl || '',
                            tags: [],
                            date: Date.now(),
                            completed: false,
                            year: m.year || '—',
                            imdbId: m.imdbId || '',
                            aspectRatio: m.aspectRatio || '2/3'
                        });
                    });
                    migrated = true;
                }
            } catch (e) { console.error("History migration error:", e); }
        }

        this.saveItems();
        if (migrated) {
            setTimeout(() => this.showToast("Imported data from previous layout!", "success"), 800);
        }
    }

    saveItems() {
        localStorage.setItem('sach_data', JSON.stringify(this.items));
    }

    initElements() {
        // Hidden Form Ingestion elements
        this.urlInput = document.getElementById('urlInput');
        this.addBtn = document.getElementById('addBtn');
        this.addTagsInput = document.getElementById('addTagsInput');
        
        // Grid & Lists
        this.linkGrid = document.getElementById('linkGrid');
        this.tagFilter = document.getElementById('tagFilter');
        this.loader = document.getElementById('loader');
        this.loaderText = document.getElementById('loader-text');

        // Search Handlers
        this.searchInput = document.getElementById('searchInput');
        this.searchClearBtn = document.getElementById('searchClearBtn');
        this.searchDropdown = document.getElementById('search-dropdown');
        
        this.mobileSearchInput = document.getElementById('mobile-search-input');
        this.mobileSearchBtn = document.getElementById('mobile-search-btn');
        this.mobileResults = document.getElementById('mobile-results');
        this.closeSearchBtn = document.getElementById('close-search');

        // Nav and Section wrappers
        this.libraryHistoryContainer = document.getElementById('library-history-container');
        this.syncSection = document.getElementById('sync-section');

        // Modals - Link Thumbnail Selector
        this.thumbModal = document.getElementById('thumbModal');
        this.thumbPicker = document.getElementById('thumbPicker');
        this.thumbStatus = document.getElementById('thumbStatus');
        this.confirmThumbBtn = document.getElementById('confirmThumb');
        this.closeModalBtn = document.getElementById('closeModal');
        this.retryFetchBtn = document.getElementById('retryFetchBtn');
        this.addThumbTagsInput = document.getElementById('addThumbTags');
        this.addThumbTagBtn = document.getElementById('addThumbTagBtn');
        this.addThumbTagsList = document.getElementById('addThumbTagsList');

        // Modals - Link Editor
        this.editModal = document.getElementById('editModal');
        this.editTitle = document.getElementById('editTitle');
        this.editDesc = document.getElementById('editDesc');
        this.editTagsInput = document.getElementById('editTags');
        this.editTagBtn = document.getElementById('editTagBtn');
        this.editTagsList = document.getElementById('editTagsList');
        this.editThumbPicker = document.getElementById('editThumbPicker');
        this.genScreenshotBtn = document.getElementById('genScreenshotBtn');
        this.closeEditModalBtn = document.getElementById('closeEditModal');
        this.saveEditBtn = document.getElementById('saveEditBtn');

        // Modals - Unified Detail Modal
        this.mainModal = document.getElementById('main-modal');
        this.modalImg = document.getElementById('modal-img');
        this.modalTitle = document.getElementById('modal-title');
        this.modalDesc = document.getElementById('modal-desc');
        this.modalLinkActions = document.getElementById('modal-link-actions');
        this.modalOpenUrl = document.getElementById('modal-open-url');
        this.modalCopyUrl = document.getElementById('modal-copy-url');
        this.modalEditToggle = document.getElementById('modal-edit-toggle');
        this.modalEditSection = document.getElementById('modal-edit-section');
        this.modalEditTitle = document.getElementById('modal-edit-title');
        this.modalEditDesc = document.getElementById('modal-edit-desc');
        this.modalEditSave = document.getElementById('modal-edit-save');
        this.modalActorsSection = document.getElementById('modal-actors-section');
        this.modalTagsLabel = document.getElementById('modal-tags-label');
        this.modalActorTags = document.getElementById('modal-actor-tags');
        this.modalActorInput = document.getElementById('modal-actor-input');
        this.modalAddActor = document.getElementById('modal-add-actor');
        this.addToLibraryBtn = document.getElementById('add-to-library');
        this.closeModalBtnDetails = document.getElementById('close-modal');

        // Theme Toggle features
        this.themeToggle = document.getElementById('themeToggle');
        this.themeIcon = document.getElementById('themeIcon');

        // Sync Features
        this.syncCodeDisplay = document.getElementById('sync-code-display');
        this.p2pQr = document.getElementById('p2p-qr');
        this.generateSyncBtn = document.getElementById('generate-sync');
        this.syncInput = document.getElementById('sync-input');
        this.loadSyncBtn = document.getElementById('load-sync');
    }

    initEvents() {
        // Add link input triggers (via hidden fields in response to URL click)
        this.addBtn.addEventListener('click', () => this.handleAddLink());

        // Search trigger suggest
        this.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            this.searchQuery = query;
            if (query) {
                this.searchClearBtn.classList.remove('hidden');
            } else {
                this.searchClearBtn.classList.add('hidden');
            }
            // Update local catalog grid instantly
            this.render();
            this.triggerSearch(query, this.searchDropdown);
        });

        this.searchClearBtn.addEventListener('click', () => {
            this.searchInput.value = '';
            this.searchQuery = '';
            this.searchClearBtn.classList.add('hidden');
            this.searchDropdown.classList.add('hidden');
            this.searchDropdown.innerHTML = '';
            this.render();
            this.searchInput.focus();
        });

        // Close dropdown on click outside
        document.addEventListener('click', (e) => {
            if (!this.searchInput.contains(e.target) && !this.searchDropdown.contains(e.target)) {
                this.searchDropdown.classList.add('hidden');
            }
        });

        // Mobile search toggle
        if (this.mobileSearchBtn) {
            this.mobileSearchBtn.onclick = () => {
                document.getElementById('search-overlay').classList.add('active');
                setTimeout(() => this.mobileSearchInput.focus(), 250);
            };
        }
        if (this.closeSearchBtn) {
            this.closeSearchBtn.onclick = () => {
                document.getElementById('search-overlay').classList.remove('active');
                this.mobileSearchInput.value = '';
                this.mobileResults.innerHTML = '';
                this.searchQuery = '';
                this.render();
            };
        }
        if (this.mobileSearchInput) {
            this.mobileSearchInput.oninput = (e) => {
                const query = e.target.value.trim();
                this.searchQuery = query;
                // Update local catalog grid instantly
                this.render();
                this.triggerSearch(query, this.mobileResults);
            };
        }

        // Enter key listeners to trigger immediate URL ingestion or focus search
        const handleSearchEnter = (evt, inputEl, dropdownEl) => {
            if (evt.key === 'Enter') {
                const query = inputEl.value.trim();
                if (!query) return;
                
                const isUrl = /^https?:\/\//i.test(query);
                if (isUrl) {
                    evt.preventDefault();
                    dropdownEl.classList.add('hidden');
                    inputEl.value = '';
                    this.searchQuery = '';
                    if (this.searchClearBtn) this.searchClearBtn.classList.add('hidden');
                    document.getElementById('search-overlay').classList.remove('active');
                    
                    this.urlInput.value = query;
                    this.handleAddLink();
                } else {
                    inputEl.blur();
                    dropdownEl.classList.add('hidden');
                }
            }
        };

        this.searchInput.addEventListener('keydown', (evt) => handleSearchEnter(evt, this.searchInput, this.searchDropdown));
        if (this.mobileSearchInput) {
            this.mobileSearchInput.addEventListener('keydown', (evt) => handleSearchEnter(evt, this.mobileSearchInput, this.mobileResults));
        }

        // Global Esc key closer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeAllModals();
        });

        // Thumbnail selector modal
        this.closeModalBtn.addEventListener('click', () => this.hideModal(this.thumbModal));
        this.confirmThumbBtn.addEventListener('click', () => this.confirmThumbnail());
        this.retryFetchBtn.addEventListener('click', () => this.handleRetryFetch());
        if (this.addThumbTagBtn) {
            this.addThumbTagBtn.addEventListener('click', () => this.handleAddFormTag('thumb'));
        }
        if (this.addThumbTagsInput) {
            this.addThumbTagsInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleAddFormTag('thumb');
                }
            });
        }

        // Edit link modal
        this.closeEditModalBtn.addEventListener('click', () => this.hideModal(this.editModal));
        this.saveEditBtn.addEventListener('click', () => this.saveEdit());
        this.genScreenshotBtn.addEventListener('click', () => this.generateScreenshot());
        
        this.editTagBtn.addEventListener('click', () => this.handleAddFormTag('edit'));
        this.editTagsInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleAddFormTag('edit');
            }
        });

        // Crop options
        document.querySelectorAll('.crop-presets button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.crop-presets button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCrop = parseInt(btn.dataset.crop);
            });
        });

        // Main Details Modal
        this.closeModalBtnDetails.onclick = () => this.hideModal(this.mainModal);
        this.mainModal.onclick = (e) => { if (e.target === this.mainModal) this.hideModal(this.mainModal); };

        // Theme toggle action
        if (this.themeToggle) {
            this.themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Sync operations
        this.generateSyncBtn.onclick = () => this.generateSyncCode();
        this.loadSyncBtn.onclick = () => this.loadFromSync();

        // Header Navigation tab events
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => this.switchTab(btn.dataset.tab);
        });
        document.querySelectorAll('.tab-item').forEach(btn => {
            btn.onclick = () => this.switchTab(btn.dataset.tab);
        });

        this.tagFilter.addEventListener('click', (e) => {
            const pill = e.target.closest('.cat-pill');
            if (pill) {
                this.activeTag = pill.dataset.tag;
                this.tagFilter.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.render();
            }
        });

        // Brand Home button click resets filter
        document.getElementById('logoHome').onclick = () => {
            this.switchTab('library');
            this.activeTag = 'all';
            this.searchQuery = '';
            this.searchInput.value = '';
            this.searchClearBtn.classList.add('hidden');
            this.render();
        };
    }

    showLoader(show, text = "Fetching metadata...") {
        if (this.loaderText) this.loaderText.textContent = text;
        if (show) this.loader.classList.remove('hidden');
        else this.loader.classList.add('hidden');
    }

    setTheme(theme) {
        this.theme = theme;
        document.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
        localStorage.setItem('sach_theme', theme);
        
        if (this.themeIcon) {
            if (theme === 'dark') {
                this.themeIcon.className = 'fas fa-sun';
            } else {
                this.themeIcon.className = 'fas fa-moon';
            }
        }
    }

    toggleTheme() {
        this.setTheme(this.theme === 'light' ? 'dark' : 'light');
    }

    closeAllModals() {
        [this.thumbModal, this.editModal, this.mainModal].forEach(m => {
            if (m) this.hideModal(m);
        });
    }

    showModal(m) {
        if (m) {
            m.classList.remove('hidden');
            m.classList.add('active');
        }
    }

    hideModal(m) {
        if (m) {
            m.classList.add('hidden');
            m.classList.remove('active');
        }
    }

    switchTab(tab) {
        this.activeTab = tab;
        
        // Update tabs active state
        document.querySelectorAll('.nav-btn, .tab-item').forEach(b => {
            b.classList.remove('active');
            if (b.dataset.tab === tab) b.classList.add('active');
        });

        // Hide show sections
        if (tab === 'library') {
            this.libraryHistoryContainer.classList.remove('hidden');
            this.syncSection.classList.add('hidden');
        } else if (tab === 'sync') {
            this.libraryHistoryContainer.classList.add('hidden');
            this.syncSection.classList.remove('hidden');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.render();
    }

    // Smart suggestion triggers
    triggerSearch(query, dropdownEl) {
        clearTimeout(this.searchTimeout);
        if (query.length < 2) {
            dropdownEl.classList.add('hidden');
            dropdownEl.innerHTML = '';
            this.render();
            return;
        }

        this.searchTimeout = setTimeout(() => {
            this.fetchSuggestions(query, dropdownEl);
        }, 300);
    }

    renderSuggestions(query, localMatches, imdbResults, isLoadingOnline, dropdownEl) {
        // Discard if the current search input value doesn't match the query
        const currentVal = (dropdownEl === this.mobileResults) 
            ? (this.mobileSearchInput ? this.mobileSearchInput.value.trim() : '')
            : (this.searchInput ? this.searchInput.value.trim() : '');
        
        if (currentVal.toLowerCase() !== query.toLowerCase()) {
            return;
        }

        dropdownEl.innerHTML = '';

        // 1. Render Local Matches
        if (localMatches.length > 0) {
            const heading = document.createElement('div');
            heading.style.cssText = 'padding: 6px 12px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text-secondary); border-bottom: 1px solid var(--border-color);';
            heading.textContent = 'Saved in Library';
            dropdownEl.appendChild(heading);

            localMatches.forEach(item => {
                const row = document.createElement('div');
                row.className = 'search-item';
                const icon = item.type === 'link' ? '<i class="fas fa-bookmark" style="color:var(--accent-color)"></i>' : '<i class="fas fa-film" style="color:var(--accent-color)"></i>';
                row.innerHTML = `
                    <div style="width:24px; text-align:center;">${icon}</div>
                    <div style="flex:1; min-width:0;">
                        <h4 style="font-size:0.85rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</h4>
                    </div>
                `;
                row.onclick = () => {
                    dropdownEl.classList.add('hidden');
                    document.getElementById('search-overlay').classList.remove('active');
                    this.openDetails(item);
                };
                dropdownEl.appendChild(row);
            });
        }

        // 2. Render Online Matches or Loading State
        if (isLoadingOnline) {
            const heading = document.createElement('div');
            heading.style.cssText = 'padding: 6px 12px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); margin-top: 4px;';
            heading.textContent = 'Online Movie Matches';
            dropdownEl.appendChild(heading);

            const loaderRow = document.createElement('div');
            loaderRow.style.cssText = 'padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.8rem; display: flex; align-items: center; justify-content: center; gap: 8px;';
            loaderRow.innerHTML = `
                <div class="loader-spinner" style="border: 2px solid var(--border-color); border-top: 2px solid var(--accent-color); border-radius: 50%; width: 16px; height: 16px; animation: spin 0.8s linear infinite;"></div>
                <span>Searching IMDb...</span>
            `;
            dropdownEl.appendChild(loaderRow);
        } else if (imdbResults.length > 0) {
            const heading = document.createElement('div');
            heading.style.cssText = 'padding: 6px 12px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); margin-top: 4px;';
            heading.textContent = 'Online Movie Matches';
            dropdownEl.appendChild(heading);

            imdbResults.forEach(movie => {
                const row = document.createElement('div');
                row.className = 'search-item';
                const isAlreadySaved = this.items.some(i => i.imdbId === movie.imdbId);
                row.innerHTML = `
                    <img src="${movie.poster || 'https://via.placeholder.com/30x45?text=🎞️'}" width="30" height="45" style="border-radius:4px; object-fit:cover;">
                    <div style="flex:1; min-width:0;">
                        <h4 style="font-size:0.85rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${movie.title}</h4>
                        <p style="font-size:0.72rem; color:var(--text-secondary);">${movie.year} ${isAlreadySaved ? '· <span style="color:var(--accent-color); font-weight:bold;">On list</span>' : ''}</p>
                    </div>
                `;
                row.onclick = () => {
                    dropdownEl.classList.add('hidden');
                    document.getElementById('search-overlay').classList.remove('active');
                    
                    const movieItem = {
                        id: 'movie_' + movie.imdbId,
                        type: 'movie',
                        title: movie.title,
                        desc: movie.actors,
                        thumb: movie.poster,
                        url: '',
                        tags: [],
                        completed: false,
                        year: movie.year,
                        imdbId: movie.imdbId
                    };
                    this.openDetails(movieItem);
                };
                dropdownEl.appendChild(row);
            });
        }

        // 3. No Results State
        if (localMatches.length === 0 && imdbResults.length === 0 && !isLoadingOnline) {
            dropdownEl.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.8rem;">No results found</div>';
        }

        dropdownEl.classList.remove('hidden');
    }

    async fetchSuggestions(query, dropdownEl) {
        const isUrl = /^https?:\/\//i.test(query);

        // 1. If it's a URL, show rapid URL import helper
        if (isUrl) {
            dropdownEl.innerHTML = `
                <div class="search-item" id="btnImportUrlSuggest" style="background: var(--accent-dim);">
                    <div style="width:32px; height:32px; border-radius:4px; background:var(--accent-gradient); color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">
                        <i class="fas fa-link"></i>
                    </div>
                    <div style="flex:1; min-width:0;">
                        <h4 style="font-size:0.85rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Import Web Link</h4>
                        <p style="font-size:0.72rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${query}</p>
                    </div>
                </div>
            `;
            dropdownEl.classList.remove('hidden');

            const btn = document.getElementById('btnImportUrlSuggest');
            if (btn) {
                btn.onclick = () => {
                    dropdownEl.classList.add('hidden');
                    if (this.searchInput) {
                        this.searchInput.value = '';
                        if (this.searchClearBtn) this.searchClearBtn.classList.add('hidden');
                    }
                    if (this.mobileSearchInput) this.mobileSearchInput.value = '';
                    this.searchQuery = '';
                    document.getElementById('search-overlay').classList.remove('active');

                    // Trigger ingestion directly
                    this.urlInput.value = query;
                    this.handleAddLink();
                };
            }
            return;
        }

        // 2. Local matching items
        const q = query.toLowerCase();
        const localMatches = this.items.filter(item => {
            return (item.title || '').toLowerCase().includes(q) ||
                   (item.desc || '').toLowerCase().includes(q) ||
                   (item.tags || []).some(tag => tag.toLowerCase().includes(q));
        }).slice(0, 3);

        // Render local matches instantly
        this.renderSuggestions(query, localMatches, [], true, dropdownEl);

        // 3. Online IMDb query
        try {
            const data = await fetchWithTimeout(`https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(query)}`, { timeout: 4000 });
            let imdbResults = [];
            if (data.ok && data.description) {
                imdbResults = data.description.map(m => ({
                    title: m.title || m['#TITLE'] || 'Untitled',
                    year: m.year || m['#YEAR'] || '—',
                    poster: m.poster || m['#IMG_POSTER'] || '',
                    imdbId: m.imdbId || m['#IMDB_ID'] || '',
                    actors: m.actors || m['#ACTORS'] || ''
                })).filter(Boolean).slice(0, 6);
            }
            this.renderSuggestions(query, localMatches, imdbResults, false, dropdownEl);
        } catch (e) {
            console.warn("IMDb fetch failed or timed out:", e);
            this.renderSuggestions(query, localMatches, [], false, dropdownEl);
        }
    }

    // Link Metadata Extractor
    async handleAddLink() {
        const url = this.urlInput.value.trim();
        if (!url) return;

        this.currentLinkTags = [];
        this.currentUrl = url;
        
        const skeletonHtml = `
            <div class="skeleton-card" id="tempSkeleton">
                <div class="skeleton-img"></div>
                <div class="skeleton-content">
                    <div class="skeleton-line title"></div>
                    <div class="skeleton-line desc"></div>
                    <div class="skeleton-line desc2"></div>
                    <div class="skeleton-line tags"></div>
                </div>
            </div>
        `;
        
        if (this.linkGrid.querySelector('.empty-state')) this.linkGrid.innerHTML = '';
        this.linkGrid.insertAdjacentHTML('afterbegin', skeletonHtml);
        this.showLoader(true, "Fetching metadata...");

        try {
            // Check for duplication
            const dup = this.items.find(i => i.url === url);
            if (dup) {
                this.showToast("Link already saved!", "error");
                this.resetAddForm();
                
                const card = document.querySelector(`[data-id="${dup.id}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('highlight-flash');
                    setTimeout(() => card.classList.remove('highlight-flash'), 1800);
                }
                return;
            }

            const meta = await this.fetchLinkMetadata(url);
            this.currentMetadata = meta;
            this.showLoader(false);
            this.showThumbPicker(meta.images || []);
        } catch (error) {
            console.error("Metadata retrieval failed:", error);
            const screenshotFallback = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
            this.showLoader(false);
            this.showThumbPicker([], screenshotFallback);
        } finally {
            this.resetAddForm();
        }
    }

    resetAddForm() {
        this.urlInput.value = '';
        this.tempTags = [];
        const skel = document.getElementById('tempSkeleton');
        if (skel) skel.remove();
        this.showLoader(false);
        this.render();
    }

    async handleRetryFetch() {
        this.hideModal(this.thumbModal);
        this.urlInput.value = this.currentUrl;
        this.handleAddLink();
    }

    async fetchLinkMetadata(url) {
        let results = {
            title: url,
            description: 'Fetching website metadata...',
            images: [],
            fallback: `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`,
            url: url,
            isScreenshot: false
        };

        const resolveUrl = (relative) => {
            try { return new URL(relative, url).href; } catch (e) { return relative; }
        };

        // YouTube fast path check
        if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
            try {
                let ytUrl = url;
                if (url.includes('youtu.be/')) {
                    const id = url.split('youtu.be/')[1].split('?')[0];
                    ytUrl = `https://www.youtube.com/watch?v=${id}`;
                }
                const data = await fetchWithTimeout(`https://www.youtube.com/oembed?url=${encodeURIComponent(ytUrl)}&format=json`, { timeout: 2500 });
                if (data.title) {
                    results.title = data.title;
                    results.description = `YouTube Video by ${data.author_name}`;
                    if (data.thumbnail_url) results.images.push(data.thumbnail_url);
                    return results;
                }
            } catch (e) {}
        }

        // Parallel metadata lookups
        await Promise.allSettled([
            fetchWithTimeout(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, { timeout: 2000 })
                .then(data => {
                    if (data.title && results.title === url) results.title = data.title;
                    if (data.author_name && results.description.startsWith('Fetching')) results.description = `Shared by ${data.author_name}`;
                    if (data.thumbnail_url) results.images.push(data.thumbnail_url);
                }),
            fetchWithTimeout(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, { timeout: 2000 })
                .then(data => {
                    if (data.status === 'success') {
                        const m = data.data;
                        if (m.title && results.title === url) results.title = m.title;
                        if (m.description) results.description = m.description;
                        if (m.image?.url) results.images.push(m.image.url);
                        if (m.logo?.url) results.images.push(m.logo.url);
                    }
                }),
            fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { timeout: 1800 })
                .then(data => {
                    const doc = new DOMParser().parseFromString(data.contents, 'text/html');
                    const getM = (s) => doc.querySelector(`meta[property="${s}"], meta[name="${s}"]`)?.getAttribute('content');
                    
                    const title = getM('og:title') || getM('twitter:title') || doc.querySelector('[itemprop="name"]')?.getAttribute('content') || doc.title;
                    if (title && results.title === url) results.title = title;
                    
                    const desc = getM('og:description') || getM('twitter:description') || doc.querySelector('[itemprop="description"]')?.getAttribute('content') || getM('description');
                    if (desc) results.description = desc;
                    
                    const og = getM('og:image') || getM('twitter:image') || doc.querySelector('[itemprop="image"]')?.getAttribute('content');
                    if (og) results.images.push(resolveUrl(og));

                    // Grab rel icons
                    ['apple-touch-icon', 'icon', 'shortcut icon'].forEach(rel => {
                        const href = doc.querySelector(`link[rel="${rel}"]`)?.getAttribute('href');
                        if (href) results.images.push(resolveUrl(href));
                    });

                    // Grab document images
                    Array.from(doc.querySelectorAll('img'))
                        .map(img => img.getAttribute('src'))
                        .filter(Boolean)
                        .filter(src => src.startsWith('http') || src.startsWith('/'))
                        .slice(0, 10)
                        .forEach(src => results.images.push(resolveUrl(src)));
                })
        ]).catch(err => console.warn("Proxy fetches finished with errors:", err));

        if (results.title === url) {
            try { results.title = new URL(url).hostname; } catch (e) {}
        }

        results.images = [...new Set(results.images.filter(Boolean))];
        if (results.images.length === 0) {
            results.images = [results.fallback];
            results.isScreenshot = true;
        }

        return results;
    }

    showThumbPicker(images, overrideFB) {
        this.thumbPicker.innerHTML = '';
        const allImages = overrideFB ? [overrideFB] : images;
        const isScreenshotOnly = this.currentMetadata?.isScreenshot || (allImages.length === 1 && allImages[0].includes('mshots'));

        if (isScreenshotOnly) {
            this.thumbStatus.innerText = "Metadata cover not found. Select screenshot or try again:";
            this.thumbStatus.style.color = "var(--danger)";
        } else {
            this.thumbStatus.innerText = "Select preferred thumbnail:";
            this.thumbStatus.style.color = "var(--text-secondary)";
        }

        allImages.forEach((img, index) => {
            const div = document.createElement('div');
            div.className = 'thumb-option' + (index === 0 ? ' selected' : '');
            div.innerHTML = `<img src="${img}" onerror="this.remove()">`;
            div.onclick = () => {
                this.thumbPicker.querySelectorAll('.thumb-option').forEach(o => o.classList.remove('selected'));
                div.classList.add('selected');
                this.selectedThumb = img;
            };
            this.thumbPicker.appendChild(div);
        });

        this.selectedThumb = allImages[0];
        
        // Reset thumbnail modal tags input & view
        this.tempTags = [];
        if (this.addThumbTagsInput) this.addThumbTagsInput.value = '';
        this.renderFormTags('thumb');

        this.showModal(this.thumbModal);
    }

    confirmThumbnail() {
        const item = {
            id: 'sv_' + Date.now(),
            type: 'link',
            title: this.currentMetadata.title || 'Untitled Link',
            desc: this.currentMetadata.description || '',
            thumb: this.selectedThumb,
            url: this.currentUrl,
            tags: [...this.tempTags],
            date: Date.now(),
            completed: false,
            year: this.getHostname(this.currentUrl)
        };

        this.items.unshift(item);
        this.saveItems();
        this.hideModal(this.thumbModal);
        this.showToast("Link saved successfully!", "success");
        this.render();
    }

    // Modal Details quick opening
    openDetails(item) {
        const isSaved = this.items.some(i => i.id === item.id || (item.imdbId && i.imdbId === item.imdbId));
        const savedItem = this.items.find(i => i.id === item.id || (item.imdbId && i.imdbId === item.imdbId)) || item;
        
        this.modalImg.src = savedItem.thumb || 'https://via.placeholder.com/300x450?text=Unavailable';
        this.modalTitle.textContent = savedItem.title;
        
        // Modal layout settings depending on Link or Movie
        const isLink = savedItem.type === 'link';
        this.modalLinkActions.classList.toggle('hidden', !isLink);
        this.modalEditSection.classList.add('hidden'); // hidden initially
        
        if (isLink) {
            this.modalActorsSection.classList.remove('hidden');
            this.modalImg.style.aspectRatio = '16/9';
            this.modalImg.parentElement.style.flex = '0 0 100%'; // Stretch top on mobile
            this.modalTagsLabel.textContent = 'Tags';
            this.modalDesc.innerHTML = `
                <span class="year-badge"><i class="fas fa-globe"></i> ${savedItem.year}</span>
                <span>${savedItem.desc || 'No description available'}</span>
            `;

            // Copy and Open action event listeners
            this.modalOpenUrl.onclick = () => window.open(savedItem.url, '_blank');
            this.modalCopyUrl.onclick = () => {
                navigator.clipboard.writeText(savedItem.url);
                this.showToast("URL Copied to clipboard!", "success");
            };

            // Inline editor triggers
            this.modalEditToggle.onclick = () => {
                this.modalEditSection.classList.toggle('hidden');
                if (!this.modalEditSection.classList.contains('hidden')) {
                    this.modalEditTitle.value = savedItem.title;
                    this.modalEditDesc.value = savedItem.desc;
                }
            };

            this.modalEditSave.onclick = () => {
                savedItem.title = this.modalEditTitle.value || savedItem.title;
                savedItem.desc = this.modalEditDesc.value || savedItem.desc;
                this.saveItems();
                this.modalTitle.textContent = savedItem.title;
                this.modalDesc.innerHTML = `
                    <span class="year-badge"><i class="fas fa-globe"></i> ${savedItem.year}</span>
                    <span>${savedItem.desc}</span>
                `;
                this.modalEditSection.classList.add('hidden');
                this.showToast("Changes Saved!");
                this.render();
            };
        } else {
            this.modalActorsSection.classList.add('hidden');
            this.modalImg.style.aspectRatio = '2/3';
            this.modalImg.parentElement.style.flex = '0 0 280px';
            this.modalDesc.innerHTML = `
                <span class="year-badge"><i class="fas fa-calendar"></i> ${savedItem.year}</span>
                <span>${savedItem.desc || 'Film Details'}</span>
            `;
        }

        // Setup Tags
        this.renderModalTags(savedItem);

        // Binding add tag event in modal
        this.modalAddActor.onclick = () => {
            const val = this.modalActorInput.value.trim();
            if (val && !savedItem.tags.includes(val)) {
                savedItem.tags.push(val);
                this.saveItems();
                this.renderModalTags(savedItem);
                this.render();
                this.modalActorInput.value = '';
                this.showToast("Tag added!");
            }
        };

        this.modalActorInput.onkeydown = (e) => {
            if (e.key === 'Enter') this.modalAddActor.click();
        };

        // Actions Setup: "Add to My List" / "Remove"
        if (isSaved) {
            this.addToLibraryBtn.classList.add('hidden');
        } else {
            this.addToLibraryBtn.classList.remove('hidden');
            this.addToLibraryBtn.textContent = 'Add to My List';
            this.addToLibraryBtn.disabled = false;
        }
        
        this.addToLibraryBtn.onclick = () => {
            if (!isSaved) {
                savedItem.completed = false;
                savedItem.date = Date.now();
                this.items.unshift(savedItem);
                this.saveItems();
                this.hideModal(this.mainModal);
                this.showToast("Added to library!", "success");
                this.render();
            }
        };

        // Delete / Remove logic
        const oldR = document.getElementById('details-remove-btn');
        if (oldR) oldR.remove();

        if (isSaved) {
            const rBtn = document.createElement('button');
            rBtn.id = 'details-remove-btn';
            rBtn.className = 'btn danger';
            rBtn.style.marginTop = '4px';
            rBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Remove';
            rBtn.onclick = () => {
                this.items = this.items.filter(i => i.id !== savedItem.id);
                this.saveItems();
                this.hideModal(this.mainModal);
                this.showToast("Removed from Library", "success");
                this.render();
            };
            this.mainModal.querySelector('.modal-actions').appendChild(rBtn);
        }

        this.showModal(this.mainModal);
    }

    renderModalTags(item) {
        this.modalActorTags.innerHTML = '';
        if (!item.tags) item.tags = [];
        
        item.tags.forEach((tag, idx) => {
            const tagEl = document.createElement('div');
            tagEl.className = 'actor-tag';
            tagEl.innerHTML = `
                ${tag}
                <button type="button"><i class="fas fa-times"></i></button>
            `;
            tagEl.querySelector('button').onclick = (e) => {
                e.stopPropagation();
                item.tags.splice(idx, 1);
                this.saveItems();
                this.renderModalTags(item);
                this.render();
                this.showToast("Tag removed!");
            };
            this.modalActorTags.appendChild(tagEl);
        });
    }

    // General Link full editor
    editLink(id) {
        const item = this.items.find(i => i.id === id);
        if (!item) return;

        this.editingId = id;
        this.editTitle.value = item.title;
        this.editDesc.value = item.desc;
        this.tempTags = Array.isArray(item.tags) ? [...item.tags] : [];
        this.renderFormTags('edit');
        this.editTagsInput.value = '';
        this.selectedThumb = item.thumb;
        this.currentUrl = item.url;
        
        this.renderEditThumbPicker([item.thumb]);
        this.fetchLinkMetadata(item.url).then(m => this.renderEditThumbPicker(m.images || []));
        this.showModal(this.editModal);
    }

    renderEditThumbPicker(images) {
        const unique = [...new Set([...(images || []), this.selectedThumb])];
        this.editThumbPicker.innerHTML = unique.map(img => {
            const escapedImg = img.replace(/'/g, "\\'");
            return `
                <div class="thumb-option ${img === this.selectedThumb ? 'selected' : ''}">
                    <img src="${img}" onerror="this.remove()">
                </div>
            `;
        }).join('');

        this.editThumbPicker.querySelectorAll('.thumb-option').forEach((opt, idx) => {
            opt.onclick = () => {
                this.editThumbPicker.querySelectorAll('.thumb-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                this.selectedThumb = unique[idx];
            };
        });
    }

    generateScreenshot() {
        const ss = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(this.currentUrl)}?w=${this.currentCrop}`;
        this.selectedThumb = ss;
        
        const div = document.createElement('div');
        div.className = 'thumb-option selected';
        div.innerHTML = `<img src="${ss}">`;
        
        this.editThumbPicker.querySelectorAll('.thumb-option').forEach(o => o.classList.remove('selected'));
        div.onclick = () => {
            this.editThumbPicker.querySelectorAll('.thumb-option').forEach(o => o.classList.remove('selected'));
            div.classList.add('selected');
            this.selectedThumb = ss;
        };

        this.editThumbPicker.prepend(div);
        this.showToast("Screenshot generated!");
    }

    saveEdit() {
        const item = this.items.find(i => i.id === this.editingId);
        if (item) {
            this.handleAddFormTag('edit');
            item.title = this.editTitle.value;
            item.desc = this.editDesc.value;
            item.tags = [...this.tempTags];
            item.thumb = this.selectedThumb;
            this.saveItems();
            this.render();
            this.showToast("Bookmark saved successfully!", "success");
        }
        this.hideModal(this.editModal);
        this.tempTags = [];
    }

    removeLink(id) {
        this.items = this.items.filter(i => i.id !== id);
        this.saveItems();
        this.render();
        this.showToast("Item removed from Library", "success");
    }

    copyLink(url) {
        navigator.clipboard.writeText(url).then(() => {
            this.showToast("URL copied to clipboard!", "success");
        });
    }

    // Grid rendering logic
    render() {
        if (!this.linkGrid) return;
        this.updateTagPillBar();
        this.renderHeroBanner();

        let filtered = [...this.items];

        // 1. Tab filters (No Completed filter since completed section is removed)

        // 2. Tag filters
        if (this.activeTag !== 'all') {
            filtered = filtered.filter(i => (i.tags || []).includes(this.activeTag));
        }

        // 3. Text search local filter
        if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(i => {
                return (i.title || '').toLowerCase().includes(q) ||
                       (i.desc || '').toLowerCase().includes(q) ||
                       (i.tags || []).some(t => t.toLowerCase().includes(q)) ||
                       (i.year || '').toLowerCase().includes(q);
            });
        }



        // Sorting: Newest first
        filtered.sort((a, b) => (b.date || 0) - (a.date || 0));

        if (filtered.length === 0) {
            const searching = this.searchQuery.trim() || this.activeTag !== 'all';
            if (searching) {
                this.linkGrid.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-search empty-state-icon"></i>
                        <div class="empty-title">No matches found</div>
                        <div class="empty-sub">Try adjusting your queries or filters.</div>
                    </div>
                `;
            } else {
                this.linkGrid.innerHTML = `
                    <div class="empty-state-welcome">
                        <div class="welcome-header">
                            <i class="fas fa-folder-open welcome-icon"></i>
                            <h2>Start Your Premium Collection</h2>
                            <p>Paste a website URL or search movie titles in the search bar above. Try importing these popular quick-links instantly:</p>
                        </div>
                        <div class="quick-add-grid">
                            <div class="quick-add-card" onclick="window.sachApp.quickImport('https://www.youtube.com')">
                                <i class="fab fa-youtube qa-icon yt"></i>
                                <span>YouTube</span>
                            </div>
                            <div class="quick-add-card" onclick="window.sachApp.quickImport('https://www.imdb.com')">
                                <i class="fas fa-film qa-icon imdb"></i>
                                <span>IMDb</span>
                            </div>
                            <div class="quick-add-card" onclick="window.sachApp.quickImport('https://github.com')">
                                <i class="fab fa-github qa-icon github"></i>
                                <span>GitHub</span>
                            </div>
                            <div class="quick-add-card" onclick="window.sachApp.quickImport('https://news.ycombinator.com')">
                                <i class="fab fa-y-combinator qa-icon yc"></i>
                                <span>Hacker News</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            return;
        }

        // Render card lists
        const gridHTML = filtered.map(item => {
            
            const isLink = item.type === 'link';
            const favicon = isLink ? this.getFaviconUrl(item.url) : 'https://imdb.iamidiotareyoutoo.com/favicon.ico';
            const timeAgo = this.getRelativeTime(item.date);
            const badgeText = isLink ? 'Web Link' : 'Movie & TV';
            const iconClass = isLink ? 'fa-bookmark' : 'fa-film';

            // Link cards open URL directly; movie cards open detail modal
            const clickHandler = isLink
                ? `window.open('${item.url.replace(/'/g, "\\'")}',' _blank')` 
                : `window.sachApp.openDetailsById('${item.id}')`;

            const hostOrYear = isLink ? item.year : `<i class="fas fa-calendar-alt"></i> ${item.year}`;
            const tagsHTML = (item.tags || []).slice(0, 2).map(t => `<span class="card-tag-pill">${t}</span>`).join('');
            const iconBadge = isLink ? `<i class="fas fa-link"></i>` : `<i class="fas fa-film"></i>`;

            return `
                <div class="card type-${item.type}" data-id="${item.id}" onclick="${clickHandler}">
                    <button class="quick-action" title="Delete" onclick="event.stopPropagation(); window.sachApp.removeLink('${item.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="card-img-wrapper">
                        <img src="${item.thumb || 'https://via.placeholder.com/400x225?text=Poster+Unavailable'}" class="card-img" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/400x225?text=Image+Unavailable'">
                        <div class="card-info-overlay">
                            <div class="card-info-header">
                                <span class="card-type-icon">${iconBadge}</span>
                                <span class="card-host-text">${hostOrYear}</span>
                            </div>
                            <h3 class="card-overlay-title">${item.title}</h3>
                            ${tagsHTML ? `<div class="card-overlay-tags">${tagsHTML}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this.linkGrid.innerHTML = gridHTML;
    }

    openDetailsById(id) {
        const item = this.items.find(i => i.id === id);
        if (item) this.openDetails(item);
    }



    updateTagPillBar() {
        if (!this.tagFilter) return;

        // Gather tags only from library web links
        const currentTabItems = this.activeTab === 'library' ? this.items.filter(i => i.type === 'link') : [];

        const allTags = currentTabItems.flatMap(i => i.tags || []);
        const uniqueTags = [...new Set(allTags)].filter(Boolean).sort();

        const tagPillsHTML = [
            `<button class="cat-pill ${this.activeTag === 'all' ? 'active' : ''}" data-tag="all">All Tags</button>`,
            ...uniqueTags.map(tag => `
                <button class="cat-pill ${this.activeTag === tag ? 'active' : ''}" data-tag="${tag}">${tag}</button>
            `)
        ].join('');

        if (this.tagFilter.innerHTML !== tagPillsHTML) {
            this.tagFilter.innerHTML = tagPillsHTML;
        }
    }

    // Add forms tag helpers
    handleAddFormTag(formType) {
        let input;
        if (formType === 'add') input = this.addTagsInput;
        else if (formType === 'edit') input = this.editTagsInput;
        else if (formType === 'thumb') input = this.addThumbTagsInput;

        if (!input) return;

        const name = input.value.trim();
        if (name) {
            const names = name.split(',').map(n => n.trim()).filter(Boolean);
            names.forEach(n => {
                if (!this.tempTags.includes(n)) {
                    this.tempTags.push(n);
                }
            });
            input.value = '';
            this.renderFormTags(formType);
        }
    }

    removeFormTag(formType, index) {
        this.tempTags.splice(index, 1);
        this.renderFormTags(formType);
    }

    renderFormTags(formType) {
        let list;
        if (formType === 'add') list = this.addTagsList;
        else if (formType === 'edit') list = this.editTagsList;
        else if (formType === 'thumb') list = this.addThumbTagsList;

        if (!list) return;

        list.innerHTML = this.tempTags.map((t, i) => `
            <div class="form-actor-tag">
                ${t}
                <button type="button" onclick="window.sachApp.removeFormTag('${formType}', ${i})">×</button>
            </div>
        `).join('');
    }

    // P2P Synchronization Logic
    generateSyncCode() {
        if (this.peer) this.peer.destroy();

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const display = this.syncCodeDisplay;
        const qrContainer = this.p2pQr;
        const peerId = `cinematic-sync-${code}`;

        display.textContent = code;
        display.style.opacity = '0.5';

        this.peer = new Peer(peerId);

        this.peer.on('open', () => {
            display.style.opacity = '1';
            this.showToast("Broadcasting library...");

            if (qrContainer) {
                qrContainer.innerHTML = '';
                qrContainer.classList.remove('hidden');
                const joinUrl = `${window.location.origin}${window.location.pathname}?sync=${code}`;
                new QRCode(qrContainer, {
                    text: joinUrl,
                    width: 140,
                    height: 140,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            }
        });

        this.peer.on('connection', (conn) => {
            this.showToast("Device Connected!");
            conn.on('open', () => {
                conn.send({ items: this.items });
                this.showToast("Library synchronized successfully!", "success");
            });
        });

        this.peer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                this.generateSyncCode(); // collision check retry
            } else {
                this.showToast("Sync connection failed.", "error");
                display.textContent = 'ERR';
                if (qrContainer) {
                    qrContainer.classList.add('hidden');
                    qrContainer.innerHTML = '';
                }
            }
        });
    }

    loadFromSync() {
        const code = this.syncInput.value.trim();
        if (code.length !== 6) {
            this.showToast("Please enter 6 digits.", "error");
            return;
        }

        this.showToast("Connecting...");
        const tempPeer = new Peer();

        tempPeer.on('open', () => {
            const conn = tempPeer.connect(`cinematic-sync-${code}`);
            
            conn.on('data', (data) => {
                if (data.items || data.watchlist) {
                    let incomingItems = [];
                    
                    if (Array.isArray(data.items)) {
                        incomingItems = data.items;
                    } else {
                        // Backward compatibility parser for raw watchlists
                        const incomingWatchlist = (data.watchlist || []).map(m => ({
                            id: m.imdbId ? ('movie_' + m.imdbId) : ('movie_' + Date.now()),
                            type: 'movie',
                            title: m.title || 'Untitled',
                            desc: m.actors || '',
                            thumb: m.poster || '',
                            url: m.sourceUrl || '',
                            tags: [],
                            date: Date.now(),
                            completed: false,
                            year: m.year || '—',
                            imdbId: m.imdbId || ''
                        }));
                        const incomingHistory = (data.history || []).map(m => ({
                            id: m.imdbId ? ('movie_' + m.imdbId) : ('movie_' + Date.now()),
                            type: 'movie',
                            title: m.title || 'Untitled',
                            desc: m.actors || '',
                            thumb: m.poster || '',
                            url: m.sourceUrl || '',
                            tags: [],
                            date: Date.now(),
                            completed: false,
                            year: m.year || '—',
                            imdbId: m.imdbId || ''
                        }));
                        incomingItems = [...incomingWatchlist, ...incomingHistory];
                    }

                    // Perform library merges, deduplicating by URL or IMDb IDs
                    const originalCount = this.items.length;
                    const existingUrls = new Set(this.items.filter(i => i.url).map(i => i.url.toLowerCase()));
                    const existingImdbs = new Set(this.items.filter(i => i.imdbId).map(i => i.imdbId.toLowerCase()));

                    incomingItems.forEach(item => {
                        if (item.type === 'link' && item.url && !existingUrls.has(item.url.toLowerCase())) {
                            this.items.push(item);
                            existingUrls.add(item.url.toLowerCase());
                        } else if (item.type === 'movie' && item.imdbId && !existingImdbs.has(item.imdbId.toLowerCase())) {
                            this.items.push(item);
                            existingImdbs.add(item.imdbId.toLowerCase());
                        } else if (!item.url && !item.imdbId && !this.items.some(i => i.title === item.title)) {
                            this.items.push(item);
                        }
                    });

                    this.saveItems();
                    this.render();
                    this.showToast(`Merged ${this.items.length - originalCount} new records successfully!`, "success");
                    this.syncInput.value = '';
                    tempPeer.destroy();
                    // Switch back to library tab so the user sees the synced results
                    setTimeout(() => this.switchTab('library'), 1000);
                }
            });

            setTimeout(() => {
                if (tempPeer.open && !conn.open) {
                    this.showToast("Pair code not found or expired.", "error");
                    tempPeer.destroy();
                }
            }, 6000);
        });

        tempPeer.on('error', () => {
            this.showToast("Connection failed.", "error");
            tempPeer.destroy();
        });
    }

    checkUrlSync() {
        const urlParams = new URLSearchParams(window.location.search);
        const syncParam = urlParams.get('sync');
        if (syncParam && syncParam.length === 6) {
            this.switchTab('sync');
            if (this.syncInput) {
                this.syncInput.value = syncParam;
                this.showToast(`Connecting to sync code ${syncParam}...`);
                setTimeout(() => this.loadFromSync(), 800);
            }
            // Clear the query parameter from the URL to prevent repeating connection attempts on reload
            const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({ path: newUrl }, '', newUrl);
        }
    }

    renderHeroBanner() {
        const container = document.getElementById('heroBannerContainer');
        if (!container) return;

        // Only show hero banner on Library tab, and when search query is empty
        if (this.activeTab !== 'library' || this.searchQuery.trim() !== '') {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        if (this.items.length === 0) {
            // Default premium fallback billboard
            container.innerHTML = `
                <div class="hero-banner">
                    <div class="hero-backdrop" style="background-image: linear-gradient(to right, rgba(20,20,20,0.9) 30%, rgba(20,20,20,0.3) 100%), url('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200')"></div>
                    <div class="hero-content">
                        <span class="hero-badge-featured"><i class="fas fa-star"></i> Welcome to Sach</span>
                        <h1 class="hero-title">Your Cinematic Watchlist & Link Library</h1>
                        <p class="hero-meta">Save bookmarks, organize movie lists, and synchronize peer-to-peer instantly.</p>
                        <div class="hero-buttons">
                            <button class="btn primary hero-btn-watch" onclick="document.getElementById('searchInput').focus();"><i class="fas fa-plus"></i> Add First Item</button>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        // Find the latest item (prefer movies for cinematic feel)
        let featured = this.items.find(i => i.type === 'movie');
        if (!featured) featured = this.items[0]; // Fallback to latest link

        const isMovie = featured.type === 'movie';
        const backdropUrl = featured.thumb || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200';
        const badgeText = isMovie ? 'Featured Movie' : 'Featured Bookmark';
        const badgeIcon = isMovie ? 'fa-film' : 'fa-link';
        const buttonText = isMovie ? 'View Details' : 'Open Link';
        const buttonIcon = isMovie ? 'fa-info-circle' : 'fa-external-link-alt';

        const actionHandler = isMovie
            ? `window.sachApp.openDetailsById('${featured.id}')`
            : `window.open('${featured.url.replace(/'/g, "\\'")}', '_blank')`;

        const tagsHTML = (featured.tags || []).slice(0, 3).map(t => `<span class="hero-tag">${t}</span>`).join('');

        container.innerHTML = `
            <div class="hero-banner">
                <div class="hero-backdrop" style="background-image: linear-gradient(to right, rgba(20,20,20,0.9) 40%, rgba(20,20,20,0.4) 100%), url('${backdropUrl}')"></div>
                <div class="hero-content">
                    <span class="hero-badge-featured"><i class="fas ${badgeIcon}"></i> ${badgeText}</span>
                    <h1 class="hero-title">${featured.title}</h1>
                    <p class="hero-meta">
                        <span class="hero-year">${featured.year}</span>
                        <span class="hero-actors">${featured.desc || 'No description available.'}</span>
                    </p>
                    ${tagsHTML ? `<div class="hero-tags">${tagsHTML}</div>` : ''}
                    <div class="hero-buttons">
                        <button class="btn primary hero-btn-watch" onclick="${actionHandler}">
                            <i class="fas ${buttonIcon}"></i> ${buttonText}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    quickImport(url) {
        this.urlInput.value = url;
        this.handleAddLink();
    }



    // Small helpers & details getters
    getHostname(url) {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch (e) {
            return 'Web Link';
        }
    }

    getFaviconUrl(url) {
        try {
            const hostname = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
        } catch (e) {
            return 'https://via.placeholder.com/64?text=W';
        }
    }

    getRelativeTime(timestamp) {
        if (!timestamp) return 'Added recently';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        const months = Math.floor(days / 30);
        return `${months}mo ago`;
    }

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
        
        container.appendChild(toast);
        // animate trigger
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Instantiate App on DomContentLoaded
window.addEventListener('DOMContentLoaded', () => {
    window.sachApp = new SachApp();
    window.vidLinkApp = window.sachApp;
});
