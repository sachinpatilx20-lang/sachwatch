/**
 * Sach — Unified Link & Media Organizer
 * Combines Sachlink and SachWatch with premium P2P Syncing,
 * Smart Metadata extraction, and responsive grid layouts.
 */

// Standalone utility for fetch with timeout that returns parsed JSON
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 2500, signal } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    if (signal) {
        signal.addEventListener('abort', () => controller.abort());
    }
    
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
        this.activeTab = 'home';      // 'home', 'sync'
        this.activeType = 'all';      // 'all', 'movie', 'link'
        this.activeStatus = 'all';    // 'all', 'pending', 'completed'
        this.activeTag = 'all';
        this.searchQuery = '';
        this.activeSort = 'newest';   // 'newest', 'oldest', 'title'
        
        this.currentUrl = '';
        this.theme = localStorage.getItem('sach_theme') || 'dark';
        this.peer = null;
        this.currentMetadata = null;
        this.selectedThumb = '';
        this.currentCrop = 1200;
        this.searchTimeout = null;
        this.searchCache = new Map();
        this.suggestionAbortController = null;
        this.renderFrameId = null;
        this.shelves = JSON.parse(localStorage.getItem('sach_shelves')) || [];

        // Cache elements maps and optimization flags
        this.cardElements = new Map();
        this.itemsMap = new Map();
        this.dirtyHero = true;
        this.dirtyShelves = true;

        this.initData();
        this.initElements();
        this.initEvents();
        this.setTheme(this.theme);
        
        // Mark views dirty initially for full first-pass render
        this.dirtyLibrary = true;
        
        // Parallax background glow movement (desktop only) - Throttled with requestAnimationFrame
        if (window.matchMedia('(hover: hover)').matches) {
            let tick = false;
            document.addEventListener('mousemove', (e) => {
                if (!tick) {
                    requestAnimationFrame(() => {
                        const x = (e.clientX / window.innerWidth - 0.5) * 45;
                        const y = (e.clientY / window.innerHeight - 0.5) * 45;
                        if (this.glowSphere1) this.glowSphere1.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                        if (this.glowSphere2) this.glowSphere2.style.transform = `translate3d(${-x}px, ${-y}px, 0)`;
                        tick = false;
                    });
                    tick = true;
                }
            });
        }

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
                // Migration: clear tags for movies if needed, but do not reset user watch status
                let changed = false;
                this.items.forEach(item => {
                    if (item.type === 'movie' && item.tags && item.tags.length > 0) {
                        item.tags = [];
                        changed = true;
                    }
                });
                if (changed) {
                    this.saveItems();
                } else {
                    this.itemsMap = new Map(this.items.map(item => [item.id, item]));
                }
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
                const html = JSON.parse(rawHistory);
                if (Array.isArray(html)) {
                    html.forEach(m => {
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

    saveItems(dirty = true) {
        localStorage.setItem('sach_data', JSON.stringify(this.items));
        this.itemsMap = new Map(this.items.map(item => [item.id, item]));
        if (dirty) {
            this.dirtyLibrary = true;
            this.dirtyShelves = true;
            this.dirtyHero = true;
        }
    }

    initElements() {
        // Hidden Form Ingestion elements
        this.urlInput = document.getElementById('urlInput');
        this.addBtn = document.getElementById('addBtn');
        this.addTagsInput = document.getElementById('addTagsInput');
        
        // Cache ambient glow spheres
        this.glowSphere1 = document.querySelector('.glow-sphere-1');
        this.glowSphere2 = document.querySelector('.glow-sphere-2');
        
        // Grid & Lists
        this.linkGrid = document.getElementById('linkGrid');
        this.tagFilter = document.getElementById('tagFilter');
        this.sortSelect = document.getElementById('sortSelect');
        this.loader = document.getElementById('loader');
        this.loaderText = document.getElementById('loader-text');

        // Search Handlers
        this.searchInput = document.getElementById('searchInput');
        this.searchClearBtn = document.getElementById('searchClearBtn');
        this.searchDropdown = document.getElementById('search-dropdown');

        // Nav and Section wrappers
        this.syncSection = document.getElementById('sync-section');



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
        this.modalEditTags = document.getElementById('modal-edit-tags');
        this.modalEditThumb = document.getElementById('modal-edit-thumb');
        this.modalEditShelf = document.getElementById('modal-edit-shelf');
        this.modalEditSave = document.getElementById('modal-edit-save');
        this.modalActorsSection = document.getElementById('modal-actors-section');
        this.modalTagsLabel = document.getElementById('modal-tags-label');
        this.modalActorTags = document.getElementById('modal-actor-tags');
        this.modalActorInput = document.getElementById('modal-actor-input');
        this.modalAddActor = document.getElementById('modal-add-actor');
        this.addToLibraryBtn = document.getElementById('add-to-library');
        this.closeModalBtnDetails = document.getElementById('close-modal');

        // Custom Shelves Elements
        this.shelvesContainer = document.getElementById('shelves-container');
        this.createShelfBtn = document.getElementById('create-shelf-btn');
        this.createShelfForm = document.getElementById('create-shelf-form');
        this.newShelfInput = document.getElementById('new-shelf-input');

        // Theme Toggle features
        this.themeToggle = document.getElementById('themeToggle');
        this.themeIcon = document.getElementById('themeIcon');

        // Sync Features
        this.syncCodeDisplay = document.getElementById('sync-code-display');
        this.p2pQr = document.getElementById('p2p-qr');
        this.generateSyncBtn = document.getElementById('generate-sync');
        this.syncInput = document.getElementById('sync-input');
        this.loadSyncBtn = document.getElementById('load-sync');
        this.syncStatusIndicator = document.getElementById('sync-status-indicator');
        this.syncStatusText = document.getElementById('sync-status-text');
        this.copySyncLinkBtn = document.getElementById('copy-sync-link');

        // Backup and local restore Features
        this.exportBtn = document.getElementById('export-library');
        this.importTrigger = document.getElementById('import-library-trigger');
        this.importFile = document.getElementById('import-library-file');
        this.clearLibraryBtn = document.getElementById('clear-library-btn');

        // Thumbnail Picker Modal & Screenshot Tools
        this.thumbModal = document.getElementById('thumbModal');
        this.thumbPicker = document.getElementById('thumbPicker');
        this.thumbStatus = document.getElementById('thumbStatus');
        this.confirmThumbBtn = document.getElementById('confirmThumb');
        this.closeModalBtnThumb = document.getElementById('closeModal');
        this.retryFetchBtn = document.getElementById('retryFetchBtn');
        this.editThumbPicker = document.getElementById('editThumbPicker');
        this.genScreenshotBtn = document.getElementById('genScreenshotBtn');
        this.modalEditLinkThumbSection = document.getElementById('modal-edit-link-thumb-section');
    }

    initEvents() {
        // Add link input triggers (via hidden fields in response to URL click)
        this.addBtn.addEventListener('click', () => this.handleAddLink());

        // Custom Shelves events
        if (this.createShelfBtn) {
            this.createShelfBtn.addEventListener('click', () => {
                this.createShelfForm.classList.add('open');
                this.createShelfBtn.classList.add('hidden');
                if (this.newShelfInput) this.newShelfInput.focus();
            });
        }
        if (this.createShelfForm) {
            this.createShelfForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const name = this.newShelfInput.value.trim();
                if (name && !this.shelves.includes(name)) {
                    this.shelves.push(name);
                    localStorage.setItem('sach_shelves', JSON.stringify(this.shelves));
                    this.newShelfInput.value = '';
                    this.createShelfForm.classList.remove('open');
                    this.createShelfBtn.classList.remove('hidden');
                    this.showToast(`Shelf "${name}" created!`, "success");
                    this.dirtyLibrary = true;
                    this.render();
                } else if (this.shelves.includes(name)) {
                    this.showToast("Shelf already exists!", "error");
                }
            });
        }

        // Copy Sync Link event
        if (this.copySyncLinkBtn) {
            this.copySyncLinkBtn.addEventListener('click', () => {
                const code = this.syncCodeDisplay.textContent.trim();
                if (code && code !== '——' && code !== 'ERR') {
                    const joinUrl = `${window.location.origin}${window.location.pathname}?sync=${code}`;
                    navigator.clipboard.writeText(joinUrl).then(() => {
                        this.showToast("Sync Link copied to clipboard!", "success");
                    }).catch(() => {
                        this.showToast("Failed to copy link.", "error");
                    });
                }
            });
        }

        // Reset Library event
        if (this.clearLibraryBtn) {
            this.clearLibraryBtn.addEventListener('click', () => {
                if (confirm("Are you sure you want to clear your entire library and all custom shelves? This action cannot be undone.")) {
                    this.items = [];
                    this.shelves = [];
                    localStorage.removeItem('sach_shelves');
                    this.saveItems();
                    this.updateTagPillBar();
                    this.renderHeroBanner();
                    this.render();
                    this.showToast("Library cleared successfully.", "success");
                }
            });
        }

        if (this.sortSelect) {
            this.sortSelect.addEventListener('change', (e) => {
                this.activeSort = e.target.value;
                this.dirtyLibrary = true;
                this.render();
            });
        }

        // Search trigger suggest
        this.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            this.searchQuery = query;
            if (query) {
                this.searchClearBtn.classList.remove('hidden');
            } else {
                this.searchClearBtn.classList.add('hidden');
            }
            // Update local catalog grid with frame-alignment
            if (this.renderFrameId) cancelAnimationFrame(this.renderFrameId);
            this.renderFrameId = requestAnimationFrame(() => {
                this.render();
            });
            this.triggerSearch(query, this.searchDropdown);
        });

        this.searchInput.addEventListener('focus', (e) => {
            const query = e.target.value.trim();
            this.triggerSearch(query, this.searchDropdown);
        });

        this.searchClearBtn.addEventListener('click', () => {
            this.searchInput.value = '';
            this.searchQuery = '';
            this.searchClearBtn.classList.add('hidden');
            this.searchDropdown.classList.add('hidden');
            this.searchDropdown.innerHTML = '';
            if (this.renderFrameId) cancelAnimationFrame(this.renderFrameId);
            this.renderFrameId = requestAnimationFrame(() => {
                this.render();
            });
            this.searchInput.focus();
        });

        // Close dropdown on click outside
        document.addEventListener('click', (e) => {
            if (!this.searchInput.contains(e.target) && !this.searchDropdown.contains(e.target)) {
                this.searchDropdown.classList.add('hidden');
            }
        });

        // Enter key listeners to trigger immediate URL ingestion or focus search
        const handleSearchEnter = (evt, inputEl, dropdownEl) => {
            if (evt.key === 'Enter') {
                const query = inputEl.value.trim();
                if (!query) return;
                
                const isUrl = this.isLikelyUrl(query);
                if (isUrl) {
                    evt.preventDefault();
                    dropdownEl.classList.add('hidden');
                    inputEl.value = '';
                    this.searchQuery = '';
                    if (this.searchClearBtn) this.searchClearBtn.classList.add('hidden');
                    
                    this.urlInput.value = this.normalizeUrl(query);
                    this.handleAddLink();
                } else {
                    inputEl.blur();
                    dropdownEl.classList.add('hidden');
                }
            }
        };

        this.searchInput.addEventListener('keydown', (evt) => handleSearchEnter(evt, this.searchInput, this.searchDropdown));

        // Global Esc key closer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeAllModals();
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

        // Navigation tab events (bottom nav + any nav-btn)
        document.querySelectorAll('.nav-btn, .tab-item, .nav-tab').forEach(btn => {
            btn.onclick = () => this.switchTab(btn.dataset.tab);
        });

        // Segmented filter controller clicks
        const typeSegment = document.getElementById('typeSegment');
        if (typeSegment) {
            typeSegment.addEventListener('click', (e) => {
                const btn = e.target.closest('.segment-btn');
                if (btn) {
                    typeSegment.querySelectorAll('.segment-btn').forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-checked', 'false');
                    });
                    btn.classList.add('active');
                    btn.setAttribute('aria-checked', 'true');
                    this.activeType = btn.dataset.type;
                    this.render();
                }
            });
        }

        const statusSegment = document.getElementById('statusSegment');
        if (statusSegment) {
            statusSegment.addEventListener('click', (e) => {
                const btn = e.target.closest('.segment-btn');
                if (btn) {
                    statusSegment.querySelectorAll('.segment-btn').forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-checked', 'false');
                    });
                    btn.classList.add('active');
                    btn.setAttribute('aria-checked', 'true');
                    this.activeStatus = btn.dataset.status;
                    this.render();
                }
            });
        }

        // Local backup buttons
        if (this.exportBtn) {
            this.exportBtn.onclick = () => this.exportLibrary();
        }
        if (this.importTrigger && this.importFile) {
            this.importTrigger.onclick = () => this.importFile.click();
            this.importFile.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.importLibrary(file);
                    this.importFile.value = '';
                }
            };
        }

        this.tagFilter.addEventListener('click', (e) => {
            const pill = e.target.closest('.cat-pill');
            if (pill) {
                this.activeTag = pill.dataset.tag;
                this.tagFilter.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.render();
            }
        });

        // Logo click — reload the page
        const logoHome = document.getElementById('logoHome');
        if (logoHome) logoHome.onclick = () => window.location.reload();

        // Thumbnail Picker and Screenshot Event Handlers
        if (this.confirmThumbBtn) {
            this.confirmThumbBtn.addEventListener('click', () => this.confirmThumbnail());
        }
        if (this.closeModalBtnThumb) {
            this.closeModalBtnThumb.addEventListener('click', () => {
                this.hideModal(this.thumbModal);
                this.resetAddForm();
            });
        }
        if (this.retryFetchBtn) {
            this.retryFetchBtn.addEventListener('click', () => this.handleRetryFetch());
        }
        if (this.genScreenshotBtn) {
            this.genScreenshotBtn.addEventListener('click', () => this.generateScreenshot());
        }
        document.querySelectorAll('.crop-presets button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.crop-presets button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCrop = parseInt(btn.dataset.crop);
            });
        });

        // Backdrop click closer for thumbModal
        if (this.thumbModal) {
            this.thumbModal.addEventListener('click', (e) => {
                if (e.target === this.thumbModal) {
                    this.hideModal(this.thumbModal);
                    this.resetAddForm();
                }
            });
        }
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
        if (this.mainModal) this.hideModal(this.mainModal);
        if (this.thumbModal) {
            this.hideModal(this.thumbModal);
            this.resetAddForm();
        }
        if (this.searchDropdown) this.searchDropdown.classList.add('hidden');
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
        document.querySelectorAll('.nav-btn, .tab-item, .nav-tab').forEach(b => {
            b.classList.remove('active');
            if (b.dataset.tab === tab) b.classList.add('active');
        });

        // Hide show sections
        const homeSection = document.getElementById('home-section');
        const syncSection = document.getElementById('sync-section');

        if (homeSection) homeSection.classList.toggle('hidden', tab !== 'home');
        if (syncSection) syncSection.classList.toggle('hidden', tab !== 'sync');

        if (tab === 'sync') {
            // Automate pairing code generation on visiting sync tab
            if (this.syncCodeDisplay && this.syncCodeDisplay.textContent === '——') {
                this.generateSyncCode();
            }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.render();
    }

    // Smart suggestion triggers
    triggerSearch(query, dropdownEl) {
        clearTimeout(this.searchTimeout);
        if (!query || query.trim().length < 2) {
            // Show recent items & quick ideas instead of closing!
            const recentSaved = this.items.slice(0, 3);
            let recentHtml = '';
            if (recentSaved.length > 0) {
                recentHtml = `
                    <div style="padding: 6px 12px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text-secondary); border-bottom: 1px solid var(--border-color);">Recently Added</div>
                `;
                recentSaved.forEach(item => {
                    const icon = item.type === 'link' ? '<i class="fas fa-bookmark" style="color:var(--accent-color)"></i>' : '<i class="fas fa-film" style="color:var(--accent-color)"></i>';
                    recentHtml += `
                        <div class="search-item" onclick="event.stopPropagation(); window.sachApp.openRecentItem('${item.id}', '${dropdownEl.id}')">
                            <div style="width:24px; text-align:center;">${icon}</div>
                            <div style="flex:1; min-width:0;">
                                <h4 style="font-size:0.85rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</h4>
                            </div>
                        </div>
                    `;
                });
            }

            const ideas = ['Inception', 'Breaking Bad', 'Interstellar', 'Friends', 'Stranger Things'];
            const ideasHtml = `
                <div style="padding: 10px 12px 6px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); margin-top: 4px;">Quick Search Ideas</div>
                <div style="padding: 10px 12px; display: flex; flex-wrap: wrap; gap: 6px;">
                    ${ideas.map(idea => `<span class="card-tag-pill" style="cursor:pointer; padding: 4px 10px; font-size: 0.72rem; background: var(--surface2); border: 1px solid var(--border-color); border-radius: var(--r-xs);" onclick="event.stopPropagation(); window.sachApp.quickSearchFill('${idea}', '${dropdownEl.id}')">${idea}</span>`).join('')}
                </div>
            `;

            dropdownEl.innerHTML = recentHtml + ideasHtml;
            dropdownEl.classList.remove('hidden');
            return;
        }

        const isUrl = this.isLikelyUrl(query);
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
                    this.searchQuery = '';

                    this.urlInput.value = this.normalizeUrl(query);
                    this.handleAddLink();
                };
            }
            return;
        }

        // Render local matches instantly (0ms)
        const q = query.toLowerCase().trim();
        const localMatches = this.items.filter(item => {
            return (item.title || '').toLowerCase().includes(q) ||
                   (item.desc || '').toLowerCase().includes(q) ||
                   (item.tags || []).some(tag => tag.toLowerCase().includes(q));
        }).slice(0, 3);

        if (this.searchCache.has(q)) {
            const cachedResults = this.searchCache.get(q);
            this.renderSuggestions(query, localMatches, cachedResults, false, dropdownEl);
        } else {
            this.renderSuggestions(query, localMatches, [], true, dropdownEl);
            
            // Debounce online search
            this.searchTimeout = setTimeout(() => {
                this.fetchSuggestions(query, localMatches, dropdownEl);
            }, 200);
        }
    }

    renderSuggestions(query, localMatches, imdbResults, isLoadingOnline, dropdownEl) {
        // Discard if the current search input value doesn't match the query
        const currentVal = this.searchInput ? this.searchInput.value.trim() : '';
        
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
                    this.openDetails(item);
                };
                dropdownEl.appendChild(row);
            });
        }

        // 2. Render Online Matches or Loading State
        if (isLoadingOnline) {
            const heading = document.createElement('div');
            heading.style.cssText = 'padding: 6px 12px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); margin-top: 4px;';
            heading.textContent = 'Online Movies & TV Shows';
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
            heading.textContent = 'Online Movies & TV Shows';
            dropdownEl.appendChild(heading);

            imdbResults.forEach(movie => {
                const row = document.createElement('div');
                row.className = 'search-item';
                const isAlreadySaved = this.items.some(i => movie.imdbId && i.imdbId && i.imdbId.toLowerCase() === movie.imdbId.toLowerCase());
                row.innerHTML = `
                    <img src="${movie.poster || 'https://via.placeholder.com/30x45?text=🎞️'}" width="30" height="45" loading="lazy" decoding="async" style="border-radius:4px; object-fit:cover;">
                    <div style="flex:1; min-width:0;">
                        <h4 style="font-size:0.85rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${movie.title}</h4>
                        <p style="font-size:0.72rem; color:var(--text-secondary);">${movie.year} ${isAlreadySaved ? '· <span style="color:var(--accent-color); font-weight:bold;">On list</span>' : ''}</p>
                    </div>
                `;
                row.onclick = () => {
                    dropdownEl.classList.add('hidden');
                    
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

        // 3. No Results State or Empty Online Matches
        if (localMatches.length === 0 && imdbResults.length === 0 && !isLoadingOnline) {
            dropdownEl.innerHTML = `
                <div style="padding: 1.25rem 1rem; text-align: center;">
                    <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.75rem;">No results found for "${query}"</div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button class="btn secondary tiny" id="btnSearchAddMovie" style="width: 100%; border: 1px solid var(--border-color); background: rgba(255,255,255,0.03);"><i class="fas fa-plus"></i> Add Custom Movie / Show</button>
                        <button class="btn secondary tiny" id="btnSearchAddLink" style="width: 100%; border: 1px solid var(--border-color); background: rgba(255,255,255,0.03);"><i class="fas fa-link"></i> Add Custom Link</button>
                    </div>
                </div>
            `;
            
            const btnMovie = dropdownEl.querySelector('#btnSearchAddMovie');
            const btnLink = dropdownEl.querySelector('#btnSearchAddLink');
            
            if (btnMovie) {
                btnMovie.onclick = (e) => {
                    e.stopPropagation();
                    dropdownEl.classList.add('hidden');
                    if (this.searchInput) this.searchInput.value = '';
                    this.searchQuery = '';
                    
                    const movieItem = {
                        id: 'movie_custom_' + Date.now(),
                        type: 'movie',
                        title: query,
                        desc: '',
                        thumb: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=600&auto=format&fit=crop',
                        url: '',
                        tags: [],
                        completed: false,
                        year: new Date().getFullYear().toString(),
                        imdbId: 'custom_' + Date.now()
                    };
                    
                    // Immediately insert and save
                    this.items.unshift(movieItem);
                    this.saveItems();
                    this.render();
                    
                    // Open modal directly in Edit Mode
                    this.openDetails(movieItem, true);
                };
            }
            
            if (btnLink) {
                btnLink.onclick = (e) => {
                    e.stopPropagation();
                    dropdownEl.classList.add('hidden');
                    if (this.searchInput) this.searchInput.value = '';
                    this.searchQuery = '';
                    
                    const linkItem = {
                        id: 'sv_' + Date.now(),
                        type: 'link',
                        title: query,
                        desc: '',
                        thumb: 'https://images.unsplash.com/photo-1546074177-3b1b98a31289?q=80&w=600&auto=format&fit=crop',
                        url: this.isLikelyUrl(query) ? this.normalizeUrl(query) : 'https://google.com',
                        tags: [],
                        date: Date.now(),
                        completed: false,
                        year: this.getHostname(this.isLikelyUrl(query) ? this.normalizeUrl(query) : 'https://google.com')
                    };
                    
                    // Immediately insert and save
                    this.items.unshift(linkItem);
                    this.saveItems();
                    this.render();
                    
                    // Open modal directly in Edit Mode
                    this.openDetails(linkItem, true);
                };
            }
        } else if (localMatches.length > 0 && imdbResults.length === 0 && !isLoadingOnline) {
            const heading = document.createElement('div');
            heading.style.cssText = 'padding: 6px 12px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); margin-top: 4px;';
            heading.textContent = 'Online Movies & TV Shows';
            dropdownEl.appendChild(heading);

            const emptyRow = document.createElement('div');
            emptyRow.style.cssText = 'padding: 0.8rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.75rem;';
            emptyRow.textContent = 'No online matches found';
            dropdownEl.appendChild(emptyRow);
        }

        dropdownEl.classList.remove('hidden');
    }

    async fetchSuggestions(query, localMatches, dropdownEl) {
        const q = query.toLowerCase().trim();

        // Abort previous suggestions request if any is pending
        if (this.suggestionAbortController) {
            this.suggestionAbortController.abort();
        }
        this.suggestionAbortController = new AbortController();

        // 3. Online IMDb query
        try {
            const data = await fetchWithTimeout(`https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(query)}`, {
                timeout: 4000,
                signal: this.suggestionAbortController.signal
            });
            let imdbResults = [];
            const desc = data ? (data.description || data) : null;
            if (Array.isArray(desc)) {
                imdbResults = desc.map(m => ({
                    title: m.title || m['#TITLE'] || 'Untitled',
                    year: m.year || m['#YEAR'] || '—',
                    poster: m.poster || m['#IMG_POSTER'] || '',
                    imdbId: m.imdbId || m['#IMDB_ID'] || '',
                    actors: m.actors || m['#ACTORS'] || ''
                })).filter(m => m.imdbId).slice(0, 6);
            }
            
            // Limit cache size to 50 items
            if (this.searchCache.size >= 50) {
                const firstKey = this.searchCache.keys().next().value;
                this.searchCache.delete(firstKey);
            }
            this.searchCache.set(q, imdbResults);

            this.renderSuggestions(query, localMatches, imdbResults, false, dropdownEl);
        } catch (e) {
            if (e.name === 'AbortError') {
                return; // Suppress errors for aborted requests
            }
            console.warn("IMDb fetch failed or timed out:", e);
            this.renderSuggestions(query, localMatches, [], false, dropdownEl);
        }
    }

    // Link Metadata Extractor
    async handleAddLink() {
        const url = this.urlInput.value.trim();
        if (!url) return;

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

        let meta;
        try {
            // Check for duplication
            const dup = this.items.find(i => i.url === url);
            if (dup) {
                this.showLoader(false);
                const skeleton = document.getElementById('tempSkeleton');
                if (skeleton) skeleton.remove();
                
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

            meta = await this.fetchLinkMetadata(url);
        } catch (error) {
            console.error("Metadata retrieval failed:", error);
            const screenshotFallback = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
            meta = {
                title: this.getHostname(url),
                description: 'Metadata retrieval failed',
                images: [screenshotFallback],
                url: url,
                isScreenshot: true
            };
        }

        this.showLoader(false);
        const skel = document.getElementById('tempSkeleton');
        if (skel) skel.remove();

        this.currentMetadata = meta;
        this.showThumbPicker(meta.images || [], `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`);
    }

    showThumbPicker(images, overrideFB) {
        if (!this.thumbPicker) return;
        this.thumbPicker.innerHTML = '';
        const allImages = overrideFB ? [overrideFB] : images;
        const isScreenshotOnly = this.currentMetadata?.isScreenshot || (allImages.length === 1 && allImages[0].includes('mshots'));

        if (this.thumbStatus) {
            if (isScreenshotOnly) {
                this.thumbStatus.innerText = "OG Image not found. Use this screenshot or try again?";
                this.thumbStatus.style.color = "var(--red)";
            } else {
                this.thumbStatus.innerText = "Select your preferred thumbnail:";
                this.thumbStatus.style.color = "var(--text2)";
            }
        }

        allImages.forEach((img, index) => {
            const div = document.createElement('div');
            div.className = 'thumb-option' + (index === 0 ? ' selected' : '');
            div.innerHTML = `<img src="${img}">`;
            div.onclick = () => {
                this.thumbPicker.querySelectorAll('.thumb-option').forEach(o => o.classList.remove('selected'));
                div.classList.add('selected');
                this.selectedThumb = img;
            };
            this.thumbPicker.appendChild(div);
        });
        this.selectedThumb = allImages[0];
        this.showModal(this.thumbModal);
    }

    confirmThumbnail() {
        if (!this.currentMetadata) return;
        const autoTags = [];
        const domain = this.getHostname(this.currentUrl).toLowerCase();
        if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
            autoTags.push('YouTube');
        } else if (domain.includes('github.com')) {
            autoTags.push('GitHub');
        } else if (domain.includes('imdb.com')) {
            autoTags.push('IMDb');
        } else if (domain.includes('news.ycombinator.com') || domain.includes('ycombinator.com')) {
            autoTags.push('Hacker News');
        } else if (domain.includes('medium.com')) {
            autoTags.push('Medium');
        } else if (domain.includes('reddit.com')) {
            autoTags.push('Reddit');
        } else if (domain.includes('wikipedia.org')) {
            autoTags.push('Wikipedia');
        } else if (domain.includes('stackoverflow.com')) {
            autoTags.push('StackOverflow');
        }

        const item = {
            id: 'sv_' + Date.now(),
            type: 'link',
            title: this.currentMetadata.title || 'Untitled Link',
            desc: this.currentMetadata.description || '',
            thumb: this.selectedThumb,
            url: this.currentUrl,
            tags: autoTags,
            date: Date.now(),
            completed: false,
            year: this.getHostname(this.currentUrl)
        };

        this.items.unshift(item);
        this.saveItems();
        this.showToast("Link saved successfully!", "success");
        this.hideModal(this.thumbModal);
        this.resetAddForm();
    }

    handleRetryFetch() {
        this.hideModal(this.thumbModal);
        this.urlInput.value = this.currentUrl;
        this.handleAddLink();
    }

    resetAddForm() {
        this.urlInput.value = '';
        const skel = document.getElementById('tempSkeleton');
        if (skel) skel.remove();
        this.showLoader(false);
        this.render();
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



    // Modal Details quick opening
    openDetails(item, startEdit = false) {
        const isSaved = this.items.some(i => i.id === item.id || (item.imdbId && i.imdbId && i.imdbId.toLowerCase() === item.imdbId.toLowerCase()));
        const savedItem = this.items.find(i => i.id === item.id || (item.imdbId && i.imdbId && i.imdbId.toLowerCase() === item.imdbId.toLowerCase())) || item;
        
        this.modalImg.src = savedItem.thumb || 'https://via.placeholder.com/300x450?text=Unavailable';
        this.modalTitle.textContent = savedItem.title;
        
        // Modal layout settings depending on Link or Movie
        const isLink = savedItem.type === 'link';
        this.modalLinkActions.classList.toggle('hidden', !isLink && !isSaved);
        this.modalOpenUrl.classList.toggle('hidden', !isLink);
        this.modalCopyUrl.classList.toggle('hidden', !isLink);
        this.modalEditToggle.classList.toggle('hidden', !isSaved);
        this.modalEditSection.classList.add('hidden'); // hidden initially
        
        // Actors / tags section always visible
        this.modalActorsSection.classList.remove('hidden');
        
        if (isLink) {
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
        } else {
            this.modalImg.style.aspectRatio = '2/3';
            this.modalImg.parentElement.style.flex = '0 0 280px';
            this.modalTagsLabel.textContent = 'Actors & Tags';
            this.modalDesc.innerHTML = `
                <span class="year-badge"><i class="fas fa-calendar"></i> ${savedItem.year}</span>
                <span>${savedItem.desc || 'Film Details'}</span>
            `;
        }

        // Hide/show the tag adding input based on isSaved
        const inputWrap = this.modalActorsSection.querySelector('.modal-actor-input-wrap');
        if (inputWrap) {
            inputWrap.classList.toggle('hidden', !isSaved);
        }

        // Populate shelves dropdown
        if (this.modalEditShelf) {
            this.modalEditShelf.innerHTML = '<option value="">None (General Library)</option>';
            this.shelves.forEach(sh => {
                const opt = document.createElement('option');
                opt.value = sh;
                opt.textContent = sh;
                this.modalEditShelf.appendChild(opt);
            });
            this.modalEditShelf.value = savedItem.shelf || '';
        }

        // Inline editor triggers
        this.modalEditToggle.onclick = () => {
            this.modalEditSection.classList.toggle('hidden');
            if (!this.modalEditSection.classList.contains('hidden')) {
                this.modalEditTitle.value = savedItem.title;
                this.modalEditDesc.value = savedItem.desc;
                if (this.modalEditTags) {
                    this.modalEditTags.value = (savedItem.tags || []).join(', ');
                }
                if (this.modalEditThumb) {
                    this.modalEditThumb.value = savedItem.thumb || '';
                }
                if (this.modalEditShelf) {
                    this.modalEditShelf.value = savedItem.shelf || '';
                }

                // Toggle edit link thumbnail selection
                if (this.modalEditLinkThumbSection) {
                    this.modalEditLinkThumbSection.classList.toggle('hidden', !isLink);
                }
                if (isLink) {
                    this.selectedThumb = savedItem.thumb;
                    this.currentUrl = savedItem.url;
                    this.renderEditThumbPicker([savedItem.thumb]);
                    this.fetchLinkMetadata(savedItem.url).then(m => this.renderEditThumbPicker(m.images || []));
                }
            }
        };

        this.modalEditSave.onclick = () => {
            savedItem.title = this.modalEditTitle.value || savedItem.title;
            savedItem.desc = this.modalEditDesc.value || savedItem.desc;
            if (this.modalEditTags) {
                savedItem.tags = this.modalEditTags.value.split(',').map(t => t.trim()).filter(Boolean);
            }
            if (isLink) {
                const manualThumb = this.modalEditThumb ? this.modalEditThumb.value.trim() : '';
                if (manualThumb && manualThumb !== savedItem.thumb && manualThumb !== this.selectedThumb) {
                    savedItem.thumb = manualThumb;
                } else if (this.selectedThumb) {
                    savedItem.thumb = this.selectedThumb;
                }
                this.modalImg.src = savedItem.thumb;
            } else if (this.modalEditThumb) {
                savedItem.thumb = this.modalEditThumb.value.trim() || savedItem.thumb;
                this.modalImg.src = savedItem.thumb;
            }
            if (this.modalEditShelf) {
                savedItem.shelf = this.modalEditShelf.value;
            }
            this.saveItems();
            this.modalTitle.textContent = savedItem.title;
            if (isLink) {
                this.modalDesc.innerHTML = `
                    <span class="year-badge"><i class="fas fa-globe"></i> ${savedItem.year}</span>
                    <span>${savedItem.desc || 'No description available'}</span>
                `;
            } else {
                this.modalDesc.innerHTML = `
                    <span class="year-badge"><i class="fas fa-calendar"></i> ${savedItem.year}</span>
                    <span>${savedItem.desc || 'Film Details'}</span>
                `;
            }
            this.renderModalTags(savedItem);
            this.modalEditSection.classList.add('hidden');
            this.showToast("Changes Saved!");
            this.dirtyLibrary = true;
            this.render();
        };

        // Setup Tags
        this.renderModalTags(savedItem);
        this.renderTagSuggestions(savedItem);

        // Binding add tag event in modal
        this.modalAddActor.onclick = () => {
            const val = this.modalActorInput.value.trim();
            if (val && !savedItem.tags.includes(val)) {
                savedItem.tags.push(val);
                this.saveItems();
                this.renderModalTags(savedItem);
                this.renderTagSuggestions(savedItem);
                this.render();
                this.modalActorInput.value = '';
                this.showToast("Tag added!");
            }
        };

        this.modalActorInput.onkeydown = (e) => {
            if (e.key === 'Enter') this.modalAddActor.click();
        };

        // Actions Setup: Favorite & Watch status toggles inside modal details
        const stateActions = document.getElementById('modal-state-actions');
        if (stateActions) {
            if (isSaved) {
                stateActions.classList.remove('hidden');
                const favBtn = document.getElementById('modal-fav-btn');
                const statusBtn = document.getElementById('modal-status-btn');
                
                if (favBtn) {
                    favBtn.classList.toggle('active', !!savedItem.favorite);
                    favBtn.innerHTML = savedItem.favorite 
                        ? '<i class="fas fa-star" style="color:#f5c518"></i> Favorited' 
                        : '<i class="far fa-star"></i> Favorite';
                    favBtn.onclick = () => this.toggleFavorite(savedItem.id);
                }
                
                if (statusBtn) {
                    statusBtn.classList.toggle('active', !!savedItem.completed);
                    const label = savedItem.type === 'link' ? 'Read' : 'Watched';
                    statusBtn.innerHTML = savedItem.completed 
                        ? `<i class="fas fa-circle-check" style="color:var(--green)"></i> ${label}` 
                        : `<i class="far fa-circle-check"></i> Mark Completed`;
                    statusBtn.onclick = () => this.toggleCompleted(savedItem.id);
                }
            } else {
                stateActions.classList.add('hidden');
            }
        }

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
        if (startEdit && isSaved) {
            this.modalEditSection.classList.remove('hidden');
            this.modalEditTitle.value = savedItem.title;
            this.modalEditDesc.value = savedItem.desc || '';
            if (this.modalEditTags) {
                this.modalEditTags.value = (savedItem.tags || []).join(', ');
            }
            if (this.modalEditThumb) {
                this.modalEditThumb.value = savedItem.thumb || '';
            }
            if (this.modalEditShelf) {
                this.modalEditShelf.value = savedItem.shelf || '';
            }

            // Toggle edit link thumbnail selection
            if (this.modalEditLinkThumbSection) {
                this.modalEditLinkThumbSection.classList.toggle('hidden', !isLink);
            }
            if (isLink) {
                this.selectedThumb = savedItem.thumb;
                this.currentUrl = savedItem.url;
                this.renderEditThumbPicker([savedItem.thumb]);
                this.fetchLinkMetadata(savedItem.url).then(m => this.renderEditThumbPicker(m.images || []));
            }
        }

        this.showModal(this.mainModal);
    }

    renderEditThumbPicker(images) {
        if (!this.editThumbPicker) return;
        const unique = [...new Set([...(images || []), this.selectedThumb])];
        this.editThumbPicker.innerHTML = unique.map(img => {
            const escapedImg = img.replace(/'/g, "\\'");
            return `
                <div class="thumb-option ${img === this.selectedThumb ? 'selected' : ''}" onclick="window.sachApp.selectEditThumb('${escapedImg}')">
                    <img src="${img}">
                </div>
            `;
        }).join('');
    }

    selectEditThumb(img) {
        this.selectedThumb = img;
        if (this.editThumbPicker) {
            this.editThumbPicker.querySelectorAll('.thumb-option').forEach(o => {
                o.classList.remove('selected');
                const imgEl = o.querySelector('img');
                if (imgEl && (imgEl.src === img || imgEl.getAttribute('src') === img)) o.classList.add('selected');
            });
        }
    }

    generateScreenshot() {
        const ss = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(this.currentUrl)}?w=${this.currentCrop}`;
        this.selectEditThumb(ss);
        const div = document.createElement('div');
        div.className = 'thumb-option selected';
        div.innerHTML = `<img src="${ss}">`;
        div.onclick = () => this.selectEditThumb(ss);
        if (this.editThumbPicker) {
            this.editThumbPicker.prepend(div);
        }
    }

    renderTagSuggestions(item) {
        const container = document.getElementById('modal-tag-suggestions');
        if (!container) return;
        container.innerHTML = '';
        
        // Only show suggestions for saved items
        const isSaved = this.items.some(i => i.id === item.id || (item.imdbId && i.imdbId && i.imdbId.toLowerCase() === item.imdbId.toLowerCase()));
        if (!isSaved) return;

        let suggestions = [];
        if (item.type === 'movie') {
            suggestions = ['Movie', 'Cinema', 'Watchlist', 'Entertainment'];
        } else {
            const domain = this.getHostname(item.url).toLowerCase();
            if (domain.includes('github') || domain.includes('stackoverflow') || domain.includes('npm')) {
                suggestions = ['Dev', 'Tech', 'Reference', 'Code'];
            } else if (domain.includes('youtube') || domain.includes('vimeo') || domain.includes('netflix')) {
                suggestions = ['Video', 'Media', 'Watch', 'Entertainment'];
            } else if (domain.includes('wikipedia') || domain.includes('medium') || domain.includes('news') || domain.includes('reddit')) {
                suggestions = ['Research', 'Article', 'Read', 'News'];
            } else {
                suggestions = ['Web', 'Reference', 'Bookmark', 'Personal'];
            }
        }

        // Filter out tags already on the item (case-insensitive check)
        const currentTags = (item.tags || []).map(t => t.toLowerCase());
        const filtered = suggestions.filter(s => !currentTags.includes(s.toLowerCase()));

        if (filtered.length === 0) return;

        const label = document.createElement('div');
        label.className = 'edit-label';
        label.style.cssText = 'font-size: 0.65rem; width: 100%; margin-top: 8px; margin-bottom: 2px; color: var(--text3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;';
        label.textContent = 'Suggestions:';
        container.appendChild(label);

        filtered.forEach(tag => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'actor-tag';
            pill.style.cssText = 'background: var(--accent-dim); border: 1px dashed var(--accent); color: var(--accent); cursor: pointer; opacity: 0.85; transition: opacity var(--t-fast), transform var(--t-fast); display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--r-xs); font-size: 0.65rem;';
            pill.innerHTML = `<i class="fas fa-plus" style="font-size:0.55rem;"></i>${tag}`;
            pill.onclick = () => {
                item.tags.push(tag);
                this.saveItems();
                this.renderModalTags(item);
                this.renderTagSuggestions(item);
                this.render();
                this.showToast(`Tag "${tag}" added!`);
            };
            container.appendChild(pill);
        });
    }

    renderModalTags(item) {
        this.modalActorTags.innerHTML = '';
        if (!item.tags) item.tags = [];
        
        const isSaved = this.items.some(i => i.id === item.id || (item.imdbId && i.imdbId && i.imdbId.toLowerCase() === item.imdbId.toLowerCase()));
        
        item.tags.forEach((tag, idx) => {
            const tagEl = document.createElement('div');
            tagEl.className = 'actor-tag';
            if (isSaved) {
                tagEl.innerHTML = `
                    ${tag}
                    <button type="button"><i class="fas fa-times"></i></button>
                `;
                tagEl.querySelector('button').onclick = (e) => {
                    e.stopPropagation();
                    item.tags.splice(idx, 1);
                    this.saveItems();
                    this.renderModalTags(item);
                    this.renderTagSuggestions(item);
                    this.render();
                    this.showToast("Tag removed!");
                };
            } else {
                tagEl.innerHTML = `${tag}`;
            }
            this.modalActorTags.appendChild(tagEl);
        });
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

    // Delete custom shelf
    deleteShelf(name) {
        if (confirm(`Are you sure you want to delete the shelf "${name}"? Items in this shelf will remain in your library.`)) {
            this.shelves = this.shelves.filter(s => s !== name);
            localStorage.setItem('sach_shelves', JSON.stringify(this.shelves));
            this.items.forEach(item => {
                if (item.shelf === name) {
                    item.shelf = '';
                }
            });
            this.saveItems();
            this.showToast(`Shelf "${name}" deleted.`);
            this.dirtyLibrary = true;
            this.render();
        }
    }

    // Render Netflix-style shelves
    renderShelves() {
        const container = this.shelvesContainer;
        if (!container) return;

        if (this.items.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            this.dirtyShelves = false;
            return;
        }

        // Hide shelves if searching or filtering active using class toggling
        const isFiltering = this.searchQuery || this.activeType !== 'all' || this.activeStatus !== 'all' || this.activeTag !== 'all';
        container.classList.toggle('hidden', isFiltering);

        if (isFiltering) {
            return;
        }

        if (!this.dirtyShelves) return;

        let shelvesHtml = '';

        // 1. Favorites Shelf
        const favItems = this.items.filter(item => item.favorite);
        if (favItems.length > 0) {
            const carouselId = 'shelf-favorites';
            const cardsHtml = favItems.map(item => this.createCardHtml(item)).join('');
            shelvesHtml += `
                <div class="shelf-block">
                    <div class="shelf-hd">
                        <h3 class="shelf-title"><i class="fas fa-star" style="color:#f5c518"></i> Favorites <span class="shelf-count">${favItems.length}</span></h3>
                        <div class="carousel-controls">
                            <button class="carousel-control-btn" onclick="window.sachApp.scrollCarousel('${carouselId}', -1)" title="Scroll Left"><i class="fas fa-chevron-left"></i></button>
                            <button class="carousel-control-btn" onclick="window.sachApp.scrollCarousel('${carouselId}', 1)" title="Scroll Right"><i class="fas fa-chevron-right"></i></button>
                        </div>
                    </div>
                    <div class="carousel-shelf" id="${carouselId}">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        }

        // 2. Watchlist Shelf (pending movies)
        const watchlistItems = this.items.filter(item => item.type === 'movie' && !item.completed);
        if (watchlistItems.length > 0) {
            const carouselId = 'shelf-watchlist';
            const cardsHtml = watchlistItems.map(item => this.createCardHtml(item)).join('');
            shelvesHtml += `
                <div class="shelf-block">
                    <div class="shelf-hd">
                        <h3 class="shelf-title"><i class="fas fa-film"></i> Movie Watchlist <span class="shelf-count">${watchlistItems.length}</span></h3>
                        <div class="carousel-controls">
                            <button class="carousel-control-btn" onclick="window.sachApp.scrollCarousel('${carouselId}', -1)" title="Scroll Left"><i class="fas fa-chevron-left"></i></button>
                            <button class="carousel-control-btn" onclick="window.sachApp.scrollCarousel('${carouselId}', 1)" title="Scroll Right"><i class="fas fa-chevron-right"></i></button>
                        </div>
                    </div>
                    <div class="carousel-shelf" id="${carouselId}">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        }

        // 3. Custom Shelves
        this.shelves.forEach((shelfName, idx) => {
            const shelfItems = this.items.filter(item => item.shelf === shelfName);
            const carouselId = `shelf-custom-${idx}`;
            const cardsHtml = shelfItems.length > 0 
                ? shelfItems.map(item => this.createCardHtml(item)).join('')
                : `<div class="shelf-empty">This shelf is empty. Edit items to assign them here.</div>`;
            
            shelvesHtml += `
                <div class="shelf-block">
                    <div class="shelf-hd">
                        <h3 class="shelf-title"><i class="fas fa-list-ul"></i> ${shelfName} <span class="shelf-count">${shelfItems.length}</span></h3>
                        <button class="section-del-btn" title="Delete Shelf" onclick="window.sachApp.deleteShelf('${shelfName.replace(/'/g, "\\'")}')"><i class="fas fa-trash-alt"></i></button>
                        <div class="carousel-controls" style="${shelfItems.length === 0 ? 'display:none;' : ''}">
                            <button class="carousel-control-btn" onclick="window.sachApp.scrollCarousel('${carouselId}', -1)" title="Scroll Left"><i class="fas fa-chevron-left"></i></button>
                            <button class="carousel-control-btn" onclick="window.sachApp.scrollCarousel('${carouselId}', 1)" title="Scroll Right"><i class="fas fa-chevron-right"></i></button>
                        </div>
                    </div>
                    <div class="carousel-shelf" id="${carouselId}">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        });

        container.innerHTML = shelvesHtml;
        container.style.display = shelvesHtml ? 'block' : 'none';
        this.dirtyShelves = false;
    }

    // Grid rendering logic
    render() {
        if (this.activeTab !== 'home') return;

        if (!this.linkGrid) return;

        // Render dynamic immersive billboard banner
        this.renderHeroBanner();

        // Render shelves
        this.renderShelves();

        // If library items have changed, rebuild the library catalog DOM elements
        if (this.dirtyLibrary) {
            this.updateTagPillBar();

            if (this.items.length === 0) {
                this.linkGrid.innerHTML = `
                    <div class="empty-state-welcome">
                        <div class="welcome-header">
                            <i class="fas fa-folder-open welcome-icon"></i>
                            <h2>Start Your Premium Collection</h2>
                            <p>Paste a website URL or search movies & TV shows in the search bar above. Try importing these popular quick-links instantly:</p>
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
                this.cardElements.clear();
            } else {
                let sorted = [...this.items];
                if (this.activeSort === 'newest') {
                    sorted.sort((a, b) => (b.date || 0) - (a.date || 0));
                } else if (this.activeSort === 'oldest') {
                    sorted.sort((a, b) => (a.date || 0) - (b.date || 0));
                } else if (this.activeSort === 'title') {
                    sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
                }
                
                // Add an empty state container to toggle inline
                const gridHTML = sorted.map(item => this.createCardHtml(item)).join('') + `
                    <div id="library-search-empty" class="empty-state hidden">
                        <i class="fas fa-search empty-state-icon"></i>
                        <div class="empty-title">No matches found</div>
                        <div class="empty-sub">Try adjusting your queries or filters.</div>
                    </div>
                `;
                this.linkGrid.innerHTML = gridHTML;

                // Populate cardElements Map
                this.cardElements.clear();
                this.linkGrid.querySelectorAll('.card').forEach(card => {
                    this.cardElements.set(card.dataset.id, card);
                });
            }
            this.dirtyLibrary = false;
        }

        // Apply filters inline by toggling hidden class on existing elements (takes < 1ms)
        if (this.items.length > 0) {
            const q = this.searchQuery.toLowerCase().trim();
            const activeTag = this.activeTag;
            let visibleCount = 0;

            for (const [id, card] of this.cardElements.entries()) {
                const item = this.itemsMap.get(id);
                if (!item) {
                    card.classList.add('hidden');
                    continue;
                }

                // Check active tag filter
                const matchesTag = (activeTag === 'all' || 
                                    (activeTag === 'favorites' && item.favorite) || 
                                    (item.tags || []).includes(activeTag));
                
                // Check active type filter
                const matchesType = (this.activeType === 'all' || item.type === this.activeType);

                // Check active status filter
                const matchesStatus = (this.activeStatus === 'all' ||
                                       (this.activeStatus === 'pending' && !item.completed) ||
                                       (this.activeStatus === 'completed' && item.completed));
                
                // Check search filter
                let matchesSearch = true;
                if (q) {
                    matchesSearch = (item.title || '').toLowerCase().includes(q) ||
                                    (item.desc || '').toLowerCase().includes(q) ||
                                    (item.tags || []).some(t => t.toLowerCase().includes(q)) ||
                                    (item.year || '').toLowerCase().includes(q);
                }

                const visible = matchesTag && matchesType && matchesStatus && matchesSearch;
                card.classList.toggle('hidden', !visible);
                if (visible) visibleCount++;
            }

            // Toggle empty search results screen
            const emptyEl = document.getElementById('library-search-empty');
            if (emptyEl) {
                emptyEl.classList.toggle('hidden', visibleCount > 0);
            }
        }
    }

    createCardHtml(item) {
        const isLink = item.type === 'link';
        const favicon = isLink ? this.getFaviconUrl(item.url) : 'https://imdb.iamidiotareyoutoo.com/favicon.ico';
        const timeAgo = this.getRelativeTime(item.date);

        if (isLink) {
            const hostname = this.getHostname(item.url);
            const tags = item.tags || [];
            const readTime = Math.max(1, Math.round((item.desc || '').length / 150));
            
            return `
                <div class="card type-link ${item.favorite ? 'fav-active' : ''} ${item.completed ? 'completed-active' : ''}" data-id="${item.id}">
                    <div class="card-img-wrapper" onclick="window.open('${item.url.replace(/'/g, "\\'")}', '_blank')">
                        <img src="${item.thumb || 'https://via.placeholder.com/400x225?text=Image+Unavailable'}" class="card-img" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='https://via.placeholder.com/400x225?text=Image+Unavailable'">
                        <div class="card-hover-overlay">
                            <span class="hover-play-btn"><i class="fas fa-arrow-up-right-from-square"></i></span>
                        </div>
                        ${item.completed ? `<div class="card-completed-badge"><i class="fas fa-check"></i> Read</div>` : ''}
                    </div>
                    <div class="card-content">
                        <div class="card-header-row">
                            <img src="${favicon}" class="channel-avatar" onerror="this.onerror=null; this.src='https://via.placeholder.com/64?text=L'">
                            <div class="card-text-col">
                                <h3 class="card-title" onclick="window.open('${item.url.replace(/'/g, "\\'")}', '_blank')" title="${item.title}">${item.title}</h3>
                                <div class="card-metadata">
                                    <span class="channel-name" onclick="event.stopPropagation(); window.open('${item.url.replace(/'/g, "\\'")}', '_blank')" title="${hostname}">${hostname}</span>
                                    <span class="metadata-separator">•</span>
                                    <span class="upload-date">${timeAgo}</span>
                                    <span class="metadata-separator">•</span>
                                    <span class="read-time-pill" title="Estimated read time"><i class="far fa-clock"></i> ${readTime} min read</span>
                                </div>
                                <p class="card-desc">${item.desc || 'No description available'}</p>
                                <div class="card-tag-tags">
                                    ${tags.map(t => `<span class="card-tag-tag">${t}</span>`).join('')}
                                </div>
                                <div class="card-actions">
                                    <button class="btn open-btn" onclick="event.stopPropagation(); window.open('${item.url.replace(/'/g, "\\'")}', '_blank')" title="Open">
                                        Open
                                    </button>
                                    <button class="btn default-btn icon-only" onclick="event.stopPropagation(); window.sachApp.copyLink('${item.url.replace(/'/g, "\\'")}')" title="Copy URL">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    </button>
                                    <button class="btn default-btn icon-only" onclick="event.stopPropagation(); window.sachApp.openDetailsById('${item.id}', true)" title="Edit">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                    <button class="btn default-btn icon-only delete-btn" onclick="event.stopPropagation(); window.sachApp.removeLink('${item.id}')" title="Delete">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Movie card (type === 'movie')
        const completeIconClass = item.completed ? 'fas fa-circle-check' : 'far fa-circle-check';
        const isCompleteActive = item.completed ? 'active' : '';
        const completeTitle = item.completed ? `Mark as Pending` : `Mark as Watched`;
        const favIconClass = item.favorite ? 'fas fa-star' : 'far fa-star';
        const isFavActive = item.favorite ? 'active' : '';
        const favTitle = item.favorite ? 'Remove from Favorites' : 'Add to Favorites';
        const completedBadgeHTML = item.completed 
            ? `<div class="card-completed-badge"><i class="fas fa-check"></i> Watched</div>`
            : '';
        const hostOrYear = `<i class="fas fa-calendar-alt"></i> ${item.year}`;
        const tagsHTML = (item.tags || []).slice(0, 2).map(t => `<span class="card-tag-pill">${t}</span>`).join('');
        const clickHandler = `window.sachApp.openDetailsById('${item.id}')`;
        const overlayClickHandler = `event.stopPropagation(); window.sachApp.openDetailsById('${item.id}')`;
        const overlayIcon = 'fa-play';
        const iconBadge = `<i class="fas fa-film"></i>`;

        let descHTML = '';
        if (item.desc) {
            descHTML = `<p class="card-desc">${item.desc}</p>`;
        } else {
            descHTML = `<p class="card-desc add-placeholder" onclick="event.stopPropagation(); window.sachApp.openDetailsById('${item.id}', true)">+ Add Actor</p>`;
        }

        return `
            <div class="card type-movie ${item.favorite ? 'fav-active' : ''} ${item.completed ? 'completed-active' : ''}" data-id="${item.id}" onclick="${clickHandler}">
                <button class="quick-action edit-action" title="Edit details" onclick="event.stopPropagation(); window.sachApp.openDetailsById('${item.id}', true)">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="quick-action complete-action ${isCompleteActive}" title="${completeTitle}" onclick="event.stopPropagation(); window.sachApp.toggleCompleted('${item.id}')">
                    <i class="${completeIconClass}"></i>
                </button>
                <button class="quick-action fav-action ${isFavActive}" title="${favTitle}" onclick="event.stopPropagation(); window.sachApp.toggleFavorite('${item.id}')">
                    <i class="${favIconClass}"></i>
                </button>
                <button class="quick-action" title="Delete" onclick="event.stopPropagation(); window.sachApp.removeLink('${item.id}')">
                    <i class="fas fa-times"></i>
                </button>
                <div class="card-img-wrapper" onclick="${overlayClickHandler}">
                    <img src="${item.thumb || 'https://via.placeholder.com/400x225?text=Poster+Unavailable'}" class="card-img" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='https://via.placeholder.com/400x225?text=Image+Unavailable'">
                    <div class="card-hover-overlay">
                        <span class="hover-play-btn"><i class="fas ${overlayIcon}"></i></span>
                    </div>
                    ${completedBadgeHTML}
                </div>
                <div class="card-body">
                    <div class="card-info-header">
                        <span class="card-type-icon">${iconBadge}</span>
                        <span class="card-host-text">${hostOrYear}</span>
                    </div>
                    <h3 class="card-title">${item.title}</h3>
                    ${descHTML}
                    ${tagsHTML ? `<div class="card-tags">${tagsHTML}</div>` : ''}
                </div>
            </div>
        `;
    }

    updateCardDOM(item, cardEl) {
        if (!cardEl) return;
        
        // Update root classes
        cardEl.classList.toggle('fav-active', !!item.favorite);
        cardEl.classList.toggle('completed-active', !!item.completed);
        
        if (item.type === 'link') {
            // Update completed badge
            const imgWrapper = cardEl.querySelector('.card-img-wrapper');
            if (imgWrapper) {
                let badge = imgWrapper.querySelector('.card-completed-badge');
                if (item.completed) {
                    if (!badge) {
                        badge = document.createElement('div');
                        badge.className = 'card-completed-badge';
                        imgWrapper.appendChild(badge);
                    }
                    badge.innerHTML = `<i class="fas fa-check"></i> Read`;
                } else if (badge) {
                    badge.remove();
                }
            }

            // Update title
            const titleEl = cardEl.querySelector('.card-title');
            if (titleEl && titleEl.textContent !== item.title) {
                titleEl.textContent = item.title;
            }

            // Update description
            const descEl = cardEl.querySelector('.card-desc');
            if (descEl && descEl.textContent !== item.desc) {
                descEl.textContent = item.desc || 'No description available';
            }

            // Update tags
            const tagsEl = cardEl.querySelector('.card-tag-tags');
            if (tagsEl) {
                tagsEl.innerHTML = (item.tags || []).map(t => `<span class="card-tag-tag">${t}</span>`).join('');
            }

            // Update read-time estimate pill
            const readTimeEl = cardEl.querySelector('.read-time-pill');
            if (readTimeEl) {
                const readTime = Math.max(1, Math.round((item.desc || '').length / 150));
                readTimeEl.innerHTML = `<i class="far fa-clock"></i> ${readTime} min read`;
            }

            // Update thumbnail
            const imgEl = cardEl.querySelector('.card-img');
            if (imgEl && imgEl.src !== item.thumb) {
                imgEl.src = item.thumb || 'https://via.placeholder.com/400x225?text=Image+Unavailable';
            }
        } else {
            // Update favorite action button
            const favBtn = cardEl.querySelector('.fav-action');
            if (favBtn) {
                favBtn.className = `quick-action fav-action ${item.favorite ? 'active' : ''}`;
                favBtn.title = item.favorite ? 'Remove from Favorites' : 'Add to Favorites';
                const favIcon = favBtn.querySelector('i');
                if (favIcon) {
                    favIcon.className = item.favorite ? 'fas fa-star' : 'far fa-star';
                }
            }
            
            // Update complete action button
            const completeBtn = cardEl.querySelector('.complete-action');
            if (completeBtn) {
                const completeLabel = 'Watched';
                completeBtn.className = `quick-action complete-action ${item.completed ? 'active' : ''}`;
                completeBtn.title = item.completed ? `Mark as Pending` : `Mark as ${completeLabel}`;
                const completeIcon = completeBtn.querySelector('i');
                if (completeIcon) {
                    completeIcon.className = item.completed ? 'fas fa-circle-check' : 'far fa-circle-check';
                }
            }
            
            // Update completed badge
            const imgWrapper = cardEl.querySelector('.card-img-wrapper');
            if (imgWrapper) {
                let badge = imgWrapper.querySelector('.card-completed-badge');
                if (item.completed) {
                    const completeLabel = 'Watched';
                    if (!badge) {
                        badge = document.createElement('div');
                        badge.className = 'card-completed-badge';
                        imgWrapper.appendChild(badge);
                    }
                    badge.innerHTML = `<i class="fas fa-check"></i> ${completeLabel}`;
                } else if (badge) {
                    badge.remove();
                }
            }

            // Update title
            const titleEl = cardEl.querySelector('.card-title');
            if (titleEl && titleEl.textContent !== item.title) {
                titleEl.textContent = item.title;
            }

            // Update description / placeholder
            const descEl = cardEl.querySelector('.card-desc');
            if (descEl) {
                if (item.desc) {
                    descEl.textContent = item.desc;
                    descEl.classList.remove('add-placeholder');
                } else {
                    const addText = '+ Add Actor';
                    descEl.textContent = addText;
                    descEl.classList.add('add-placeholder');
                }
            }

            // Update tags
            const tagsEl = cardEl.querySelector('.card-tags');
            const tagsHTML = (item.tags || []).slice(0, 2).map(t => `<span class="card-tag-pill">${t}</span>`).join('');
            if (tagsHTML) {
                if (tagsEl) {
                    tagsEl.innerHTML = tagsHTML;
                } else {
                    const cardBody = cardEl.querySelector('.card-body');
                    if (cardBody) {
                        const newTagsEl = document.createElement('div');
                        newTagsEl.className = 'card-tags';
                        newTagsEl.innerHTML = tagsHTML;
                        cardBody.appendChild(newTagsEl);
                    }
                }
            } else if (tagsEl) {
                tagsEl.remove();
            }

            // Update thumbnail
            const imgEl = cardEl.querySelector('.card-img');
            if (imgEl && imgEl.src !== item.thumb) {
                imgEl.src = item.thumb || 'https://via.placeholder.com/400x225?text=Poster+Unavailable';
            }
        }
    }

    openDetailsById(id, startEdit = false) {
        const item = this.items.find(i => i.id === id);
        if (item) this.openDetails(item, startEdit);
    }



    updateTagPillBar() {
        if (!this.tagFilter) return;

        // Gather tags dynamically from items matching the current active type filter
        const currentTabItems = this.activeTab === 'home' 
            ? (this.activeType === 'all' ? this.items : this.items.filter(i => i.type === this.activeType))
            : [];

        const allTags = currentTabItems.flatMap(i => i.tags || []);
        const uniqueTags = [...new Set(allTags)].filter(Boolean).sort();

        const hasFavorites = this.items.some(i => i.favorite);

        const tagPillsHTML = [
            `<button class="cat-pill ${this.activeTag === 'all' ? 'active' : ''}" data-tag="all">All Tags</button>`,
            ...(hasFavorites ? [`<button class="cat-pill ${this.activeTag === 'favorites' ? 'active' : ''}" data-tag="favorites"><i class="fas fa-star" style="color:#f5c518"></i> Favorites</button>`] : []),
            ...uniqueTags.map(tag => `
                <button class="cat-pill ${this.activeTag === tag ? 'active' : ''}" data-tag="${tag}">${tag}</button>
            `)
        ].join('');

        if (this.tagFilter.innerHTML !== tagPillsHTML) {
            this.tagFilter.innerHTML = tagPillsHTML;
        }
    }



    // P2P Synchronization Logic
    generateSyncCode() {
        if (this.peer) this.peer.destroy();
        if (this.copySyncLinkBtn) this.copySyncLinkBtn.classList.add('hidden');

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const display = this.syncCodeDisplay;
        const qrContainer = this.p2pQr;
        const peerId = `cinematic-sync-${code}`;

        display.textContent = code;
        display.style.opacity = '0.5';
        this.updateSyncStatus('broadcasting', 'Preparing broadcast...');

        this.peer = new Peer(peerId);

        this.peer.on('open', () => {
            display.style.opacity = '1';
            this.showToast("Broadcasting library...");
            this.updateSyncStatus('broadcasting', `Broadcasting code: ${code}`);

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

            if (this.copySyncLinkBtn) {
                this.copySyncLinkBtn.classList.remove('hidden');
            }
        });

        this.peer.on('connection', (conn) => {
            this.showToast("Device Connected!");
            this.updateSyncStatus('connected', 'Syncing with device...');
            conn.on('open', () => {
                conn.send({ items: this.items });
                this.showToast("Library synchronized successfully!", "success");
                this.updateSyncStatus('connected', 'Library synchronized!');
                setTimeout(() => {
                    this.updateSyncStatus('broadcasting', `Broadcasting code: ${code}`);
                }, 3000);
            });
        });

        this.peer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                this.generateSyncCode(); // collision check retry
            } else {
                this.showToast("Sync connection failed.", "error");
                display.textContent = 'ERR';
                this.updateSyncStatus('disconnected', 'Broadcast connection failed');
                if (qrContainer) {
                    qrContainer.classList.add('hidden');
                    qrContainer.innerHTML = '';
                }
                if (this.copySyncLinkBtn) {
                    this.copySyncLinkBtn.classList.add('hidden');
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
        this.updateSyncStatus('broadcasting', `Connecting to pairing code ${code}...`);
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
                    this.updateSyncStatus('connected', 'Sync finished successfully!');
                    this.syncInput.value = '';
                    tempPeer.destroy();
                    setTimeout(() => this.updateSyncStatus('disconnected', 'Offline / Ready'), 4000);
                    // Switch back to home tab so the user sees the synced results
                    setTimeout(() => this.switchTab('home'), 100);
                }
            });

            setTimeout(() => {
                if (tempPeer.open && !conn.open) {
                    this.showToast("Pair code not found or expired.", "error");
                    this.updateSyncStatus('disconnected', 'Connection expired');
                    tempPeer.destroy();
                    setTimeout(() => this.updateSyncStatus('disconnected', 'Offline / Ready'), 4000);
                }
            }, 6000);
        });

        tempPeer.on('error', () => {
            this.showToast("Connection failed.", "error");
            this.updateSyncStatus('disconnected', 'Connection failed');
            tempPeer.destroy();
            setTimeout(() => this.updateSyncStatus('disconnected', 'Offline / Ready'), 4000);
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
                setTimeout(() => this.loadFromSync(), 100);
            }
            // Clear the query parameter from the URL to prevent repeating connection attempts on reload
            const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({ path: newUrl }, '', newUrl);
        }
    }





    quickImport(url) {
        this.urlInput.value = url;
        this.handleAddLink();
    }

    isLikelyUrl(str) {
        if (!str) return false;
        if (/^https?:\/\//i.test(str)) return true;
        return /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/i.test(str.trim());
    }

    normalizeUrl(url) {
        let trimmed = url.trim();
        if (!/^https?:\/\//i.test(trimmed)) {
            trimmed = 'https://' + trimmed;
        }
        return trimmed;
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

    quickSearchFill(text, dropdownId) {
        const dropdownEl = document.getElementById(dropdownId);
        const inputEl = this.searchInput;
        if (inputEl) {
            inputEl.value = text;
            if (this.searchClearBtn) {
                this.searchClearBtn.classList.remove('hidden');
            }
            this.searchQuery = text;
            this.render();
            this.triggerSearch(text, dropdownEl);
        }
    }

    openRecentItem(itemId, dropdownId) {
        const dropdownEl = document.getElementById(dropdownId);
        if (dropdownEl) dropdownEl.classList.add('hidden');
        const item = this.items.find(i => i.id === itemId);
        if (item) this.openDetails(item);
    }

    scrollCarousel(elementId, direction) {
        const carousel = document.getElementById(elementId);
        if (carousel) {
            const amount = carousel.clientWidth * 0.6 * direction;
            carousel.scrollBy({ left: amount, behavior: 'smooth' });
        }
    }

    updateSyncStatus(status, text) {
        if (!this.syncStatusIndicator || !this.syncStatusText) return;
        this.syncStatusIndicator.className = 'status-pulse';
        if (status === 'connected') {
            this.syncStatusIndicator.classList.add('connected');
            this.syncStatusText.textContent = text || 'Connected';
        } else if (status === 'broadcasting') {
            this.syncStatusIndicator.classList.add('broadcasting');
            this.syncStatusText.textContent = text || 'Broadcasting...';
        } else {
            this.syncStatusIndicator.classList.add('disconnected');
            this.syncStatusText.textContent = text || 'Offline / Ready';
        }
    }

    // Dynamic Cinematic Hero Billboard banner rendering
    renderHeroBanner() {
        const container = document.getElementById('hero-banner-container');
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
        this.dirtyHero = false;
    }

    // Toggle favorite state
    toggleFavorite(id) {
        const item = this.items.find(i => i.id === id);
        if (item) {
            item.favorite = !item.favorite;
            this.saveItems(false);
            this.dirtyShelves = true;
            this.dirtyHero = true;
            
            this.showToast(item.favorite ? "Added to favorites!" : "Removed from favorites!");
            
            // In-place card update
            const cardEl = this.cardElements.get(id);
            if (cardEl) {
                this.updateCardDOM(item, cardEl);
            }

            // Re-render components and tag bar
            this.updateTagPillBar();
            this.renderHeroBanner();
            this.render();

            // Refresh modal UI if matches
            if (this.mainModal && !this.mainModal.classList.contains('hidden')) {
                const favBtn = document.getElementById('modal-fav-btn');
                if (favBtn) {
                    favBtn.classList.toggle('active', item.favorite);
                    favBtn.innerHTML = item.favorite 
                        ? '<i class="fas fa-star" style="color:#f5c518"></i> Favorited' 
                        : '<i class="far fa-star"></i> Favorite';
                }
            }
        }
    }

    // Toggle watch/completion state
    toggleCompleted(id) {
        const item = this.items.find(i => i.id === id);
        if (item) {
            item.completed = !item.completed;
            this.saveItems(false);
            this.dirtyShelves = true;
            this.dirtyHero = true;
            
            const label = item.type === 'link' ? 'Read' : 'Watched';
            this.showToast(item.completed ? `Marked as ${label}!` : `Marked as pending.`);

            // In-place card update
            const cardEl = this.cardElements.get(id);
            if (cardEl) {
                this.updateCardDOM(item, cardEl);
            }

            // Re-render card grids & billboard
            this.renderHeroBanner();
            this.render();

            // Refresh modal UI if matches
            if (this.mainModal && !this.mainModal.classList.contains('hidden')) {
                const statusBtn = document.getElementById('modal-status-btn');
                if (statusBtn) {
                    statusBtn.classList.toggle('active', item.completed);
                    statusBtn.innerHTML = item.completed 
                        ? `<i class="fas fa-circle-check" style="color:var(--green)"></i> ${label}` 
                        : `<i class="far fa-circle-check"></i> Mark Completed`;
                }
            }
        }
    }

    // Export library backup
    exportLibrary() {
        try {
            const dataStr = JSON.stringify(this.items, null, 4);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const tempLink = document.createElement('a');
            tempLink.href = url;
            tempLink.download = `sach_library_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(tempLink);
            tempLink.click();
            document.body.removeChild(tempLink);
            URL.revokeObjectURL(url);
            this.showToast("Backup exported successfully!", "success");
        } catch (e) {
            console.error("Backup export failed:", e);
            this.showToast("Backup export failed.", "error");
        }
    }

    // Import library from JSON backup
    importLibrary(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) {
                    throw new Error("Invalid backup format: root must be an array.");
                }
                
                const originalCount = this.items.length;
                const existingIds = new Set(this.items.map(i => i.id));
                const existingUrls = new Set(this.items.filter(i => i.url).map(i => i.url.toLowerCase()));
                const existingImdbs = new Set(this.items.filter(i => i.imdbId).map(i => i.imdbId.toLowerCase()));
                
                let addedCount = 0;
                imported.forEach(item => {
                    if (!item.title || !item.type) return;
                    
                    const isDup = existingIds.has(item.id) ||
                                  (item.url && existingUrls.has(item.url.toLowerCase())) ||
                                  (item.imdbId && existingImdbs.has(item.imdbId.toLowerCase()));
                                   
                    if (!isDup) {
                        if (item.favorite === undefined) item.favorite = false;
                        if (item.completed === undefined) item.completed = false;
                        if (item.date === undefined) item.date = Date.now();
                        
                        this.items.push(item);
                        existingIds.add(item.id);
                        if (item.url) existingUrls.add(item.url.toLowerCase());
                        if (item.imdbId) existingImdbs.add(item.imdbId.toLowerCase());
                        addedCount++;
                    }
                });
                
                if (addedCount > 0) {
                    this.saveItems();
                    this.dirtyLibrary = true;
                    this.renderHeroBanner();
                    this.render();
                    this.showToast(`Imported ${addedCount} records successfully!`, "success");
                } else {
                    this.showToast("No new records found in backup.", "success");
                }
            } catch (err) {
                console.error("Backup import failed:", err);
                this.showToast("Failed to parse backup file.", "error");
            }
        };
        reader.readAsText(file);
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
