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

// Standalone utility for fetch with timeout that returns raw text (HTML)
async function fetchTextWithTimeout(resource, options = {}) {
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
        const data = await response.text();
        clearTimeout(id);
        return data;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

// Promise helper that returns the first successful resolution, or rejects if all fail
function firstSuccess(promises) {
    return new Promise((resolve, reject) => {
        let errors = [];
        let remaining = promises.length;
        if (remaining === 0) reject(new Error("No promises provided"));
        promises.forEach(p => {
            p.then(resolve).catch(err => {
                errors.push(err);
                remaining--;
                if (remaining === 0) {
                    reject(new Error("All promises rejected: " + errors.map(e => e.message || e).join("; ")));
                }
            });
        });
    });
}

// Cascading and CONCURRENT raced proxy HTML fetcher
async function fetchHtmlFromProxies(url) {
    const proxies = [
        // 1. Direct fetch (fast fail if CORS blocks)
        {
            url: url,
            type: 'direct',
            timeout: 1500
        },
        // 2. Corsproxy.io (returns raw HTML)
        {
            url: `https://corsproxy.io/?${encodeURIComponent(url)}`,
            type: 'text',
            timeout: 4000
        },
        // 3. Allorigins raw text (no JSON container, extremely fast)
        {
            url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            type: 'text',
            timeout: 4000
        },
        // 4. Codetabs (returns raw HTML)
        {
            url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
            type: 'text',
            timeout: 4000
        },
        // 5. Thingproxy.freeboard.io (backup text proxy)
        {
            url: `https://thingproxy.freeboard.io/fetch/${url}`,
            type: 'text',
            timeout: 4500
        }
    ];

    const fetchPromise = (proxy) => {
        return fetchTextWithTimeout(proxy.url, { timeout: proxy.timeout }).then(html => {
            if (html && html.trim().length > 100 && (html.toLowerCase().includes('<title') || html.toLowerCase().includes('<meta'))) {
                return html;
            }
            throw new Error(`Invalid HTML content from proxy ${proxy.type}`);
        });
    };

    try {
        // Race all proxies concurrently! This ensures the absolute highest reliability and speed.
        return await firstSuccess(proxies.map(p => fetchPromise(p)));
    } catch (e) {
        console.warn("Raced proxies failed, attempting fallback sequential fetch...", e);
        
        // Fallback: If raced failing, try Allorigins JSON proxy sequentially
        try {
            const alloriginsJsonUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const json = await fetchWithTimeout(alloriginsJsonUrl, { timeout: 3500 });
            if (json && json.contents) {
                return json.contents;
            }
        } catch (err) {
            console.error("Allorigins JSON sequential fallback also failed:", err);
        }
        throw new Error("All metadata proxies failed to fetch HTML.");
    }
}

// Parses HTML string to extract title, description, and candidate image/thumbnail URLs
function parseHtmlMetadata(htmlStr, baseUrl) {
    const results = {
        title: '',
        description: '',
        images: []
    };

    try {
        const doc = new DOMParser().parseFromString(htmlStr, 'text/html');
        if (!doc) return results;

        const resolveUrl = (relative) => {
            if (!relative) return '';
            try { return new URL(relative, baseUrl).href; } catch (e) { return relative; }
        };

        const getMeta = (nameOrProperty) => {
            return doc.querySelector(`meta[property="${nameOrProperty}"], meta[name="${nameOrProperty}"], meta[itemprop="${nameOrProperty}"]`)?.getAttribute('content') || '';
        };

        // Extract Title
        results.title = getMeta('og:title') || 
                        getMeta('twitter:title') || 
                        getMeta('title') || 
                        doc.querySelector('[itemprop="name"]')?.getAttribute('content') || 
                        doc.title || 
                        doc.querySelector('h1')?.textContent?.trim() || 
                        '';

        // Extract Description
        results.description = getMeta('og:description') || 
                              getMeta('twitter:description') || 
                              getMeta('description') || 
                              doc.querySelector('[itemprop="description"]')?.getAttribute('content') || 
                              doc.querySelector('p')?.textContent?.trim() || 
                              '';

        // Collect Images
        const addImage = (src) => {
            if (!src || src.startsWith('data:image')) return;
            const resolved = resolveUrl(src);
            if (resolved && !results.images.includes(resolved)) {
                results.images.push(resolved);
            }
        };

        // Standard OG & Twitter tags
        addImage(getMeta('og:image'));
        addImage(getMeta('og:image:url'));
        addImage(getMeta('og:image:secure_url'));
        addImage(getMeta('twitter:image'));
        addImage(getMeta('twitter:image:src'));
        addImage(getMeta('thumbnail'));

        // Link relations
        const imageSrcLink = doc.querySelector('link[rel="image_src"]')?.getAttribute('href');
        if (imageSrcLink) addImage(imageSrcLink);

        const preloadImgLink = doc.querySelector('link[rel="preload"][as="image"]')?.getAttribute('href');
        if (preloadImgLink) addImage(preloadImgLink);

        // Helper to parse srcset attributes (extracting all candidate URLs)
        const parseSrcset = (srcsetStr) => {
            if (!srcsetStr) return [];
            const urls = [];
            srcsetStr.split(',').forEach(part => {
                const trimmed = part.trim();
                if (!trimmed) return;
                const match = trimmed.match(/^(\S+)(?:\s+([\d\.]+)w)?(?:\s+([\d\.]+)x)?/);
                if (match && match[1]) {
                    urls.push(match[1]);
                }
            });
            return urls;
        };

        // Parse srcset in the document (supports responsive picture source elements)
        try {
            const srcsetElements = doc.querySelectorAll('[srcset]');
            srcsetElements.forEach(el => {
                const srcset = el.getAttribute('srcset');
                const parsedUrls = parseSrcset(srcset);
                parsedUrls.forEach(imgUrl => addImage(imgUrl));
            });
        } catch (e) {}

        // Schema.org JSON-LD Extraction
        try {
            const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
            ldScripts.forEach(script => {
                try {
                    const json = JSON.parse(script.textContent);
                    const traverseLd = (obj) => {
                        if (!obj) return;
                        if (typeof obj === 'string') {
                            if (obj.startsWith('http') || obj.startsWith('/')) {
                                addImage(obj);
                            }
                        } else if (Array.isArray(obj)) {
                            obj.forEach(item => traverseLd(item));
                        } else if (typeof obj === 'object') {
                            if (obj.url) traverseLd(obj.url);
                            if (obj.image) traverseLd(obj.image);
                            if (obj.thumbnailUrl) traverseLd(obj.thumbnailUrl);
                        }
                    };
                    traverseLd(json);
                    if (json['@graph'] && Array.isArray(json['@graph'])) {
                        json['@graph'].forEach(item => traverseLd(item));
                    }
                } catch (e) {}
            });
        } catch (e) {}

        // Page Image elements scraping and scoring
        try {
            const imgElements = Array.from(doc.querySelectorAll('img'));
            const scored = [];

            imgElements.forEach(img => {
                const src = img.getAttribute('src');
                if (!src) return;

                const resolved = resolveUrl(src);
                if (!resolved || resolved.startsWith('data:image')) return;

                const alt = img.getAttribute('alt') || '';
                const width = parseInt(img.getAttribute('width') || '0');
                const height = parseInt(img.getAttribute('height') || '0');

                // Filter spacers/tracking pixels
                const lowerSrc = resolved.toLowerCase();
                if (lowerSrc.includes('spacer') || lowerSrc.includes('pixel') || lowerSrc.includes('tracking') || lowerSrc.includes('blank') || lowerSrc.includes('addec')) {
                    return;
                }

                let score = 0;

                // Keywords scoring
                if (lowerSrc.includes('logo') || lowerSrc.includes('icon') || lowerSrc.includes('avatar') || lowerSrc.includes('nav') || lowerSrc.includes('btn') || lowerSrc.includes('button')) {
                    score -= 15;
                }
                if (lowerSrc.includes('cover') || lowerSrc.includes('banner') || lowerSrc.includes('feature') || lowerSrc.includes('hero') || lowerSrc.includes('article') || lowerSrc.includes('thumb')) {
                    score += 25;
                }
                if (alt.toLowerCase().includes('cover') || alt.toLowerCase().includes('thumbnail') || alt.toLowerCase().includes('main') || alt.toLowerCase().includes('featured')) {
                    score += 20;
                }

                // Size scoring
                if (width > 200) score += 10;
                if (width > 500) score += 20;
                if (height > 200) score += 10;

                // Context scoring
                let parent = img.parentElement;
                let depth = 0;
                while (parent && depth < 4) {
                    const tag = parent.tagName.toLowerCase();
                    if (tag === 'article' || tag === 'main') {
                        score += 15;
                        break;
                    }
                    if (tag === 'header' || tag === 'nav') {
                        score -= 5;
                        break;
                    }
                    parent = parent.parentElement;
                    depth++;
                }

                scored.push({ url: resolved, score: score });
            });

            // Sort descending and grab top 6 page images
            scored.sort((a, b) => b.score - a.score);
            scored.slice(0, 6).forEach(item => addImage(item.url));
        } catch (e) {}

        // Favicons
        const iconRels = ['apple-touch-icon', 'icon', 'shortcut icon'];
        iconRels.forEach(rel => {
            const href = doc.querySelector(`link[rel="${rel}"]`)?.getAttribute('href');
            if (href) addImage(href);
        });

    } catch (e) {
        console.error("HTML parsing error:", e);
    }

    return results;
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
        this.planner = JSON.parse(localStorage.getItem('sach_weekly_planner')) || {};
        this.plannerWeek = 1;
        this.taskMode = 'list';
        this.heroIndex = 0;
        this.heroInterval = null;

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

        // Scroll listener for transparent-to-black header
        const topBar = document.getElementById('top-bar');
        if (topBar) {
            window.addEventListener('scroll', () => {
                if (window.scrollY > 20) {
                    topBar.classList.add('scrolled');
                } else {
                    topBar.classList.remove('scrolled');
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
            this.heroIndex = 0;
            if (this.heroInterval) {
                clearInterval(this.heroInterval);
                this.heroInterval = null;
            }
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
        this.modalTrailerContainer = document.getElementById('modal-trailer-container');
        this.modalTrailerIframe = document.getElementById('modal-trailer-iframe');

        // New Workspace Expansion Elements
        this.statsSection = document.getElementById('stats-section');
        this.modalEditType = document.getElementById('modal-edit-type');
        this.editCinemaFields = document.getElementById('edit-cinema-fields');
        this.editBookFields = document.getElementById('edit-book-fields');
        this.editTaskFields = document.getElementById('edit-task-fields');
        this.modalEditDirector = document.getElementById('modal-edit-director');
        this.modalEditGenre = document.getElementById('modal-edit-genre');
        this.modalEditRuntime = document.getElementById('modal-edit-runtime');
        this.modalEditAuthor = document.getElementById('modal-edit-author');
        this.modalEditCurrentPage = document.getElementById('modal-edit-current-page');
        this.modalEditTotalPages = document.getElementById('modal-edit-total-pages');
        this.modalEditPriority = document.getElementById('modal-edit-priority');
        this.modalEditDueDate = document.getElementById('modal-edit-due-date');
        this.modalEditStarPicker = document.getElementById('modal-edit-star-picker');

        // Planner elements
        this.plannerModal = document.getElementById('plannerModal');
        this.plannerModalTitle = document.getElementById('plannerModalTitle');
        this.plannerMoviesList = document.getElementById('plannerMoviesList');
        this.closePlannerModalBtn = document.getElementById('closePlannerModalBtn');
        this.plannerSection = document.getElementById('planner-section');
        this.fullPlannerGrid = document.getElementById('full-planner-grid');
        this.plannerWeekTitle = document.getElementById('planner-week-title');
        this.plannerWeekPrevBtn = document.getElementById('planner-week-prev-btn');
        this.plannerWeekNextBtn = document.getElementById('planner-week-next-btn');

        // Quick Add elements
        this.quickAddFab = document.getElementById('quickAddFab');
        this.quickAddModal = document.getElementById('quickAddModal');
        this.quickAddTypeSegment = document.getElementById('quickAddTypeSegment');
        this.qaTitle = document.getElementById('qa-title');
        this.qaMovieDirector = document.getElementById('qa-movie-director');
        this.qaMovieGenre = document.getElementById('qa-movie-genre');
        this.qaMovieRuntime = document.getElementById('qa-movie-runtime');
        this.qaMovieStarPicker = document.getElementById('qa-movie-star-picker');
        this.qaBookAuthor = document.getElementById('qa-book-author');
        this.qaBookCurrentPage = document.getElementById('qa-book-current-page');
        this.qaBookTotalPages = document.getElementById('qa-book-total-pages');
        this.qaLinkUrl = document.getElementById('qa-link-url');
        this.qaLinkFetchBtn = document.getElementById('qa-link-fetch-btn');
        this.qaLinkThumbPicker = document.getElementById('qa-link-thumb-picker');
        this.qaLinkThumbSection = document.getElementById('qa-link-thumb-section');
        this.qaTaskPriority = document.getElementById('qa-task-priority');
        this.qaTaskDueDate = document.getElementById('qa-task-due-date');
        this.qaDesc = document.getElementById('qa-desc');
        this.qaTags = document.getElementById('qa-tags');
        this.qaThumb = document.getElementById('qa-thumb');
        this.qaShelf = document.getElementById('qa-shelf');
        this.qaSaveBtn = document.getElementById('qa-save-btn');
        this.qaCancelBtn = document.getElementById('qa-cancel-btn');

        // Details Modal Redesign elements
        this.modalBackdropGlow = document.getElementById('modal-backdrop-glow');
        this.detailsModalTabs = document.getElementById('detailsModalTabs');
        this.detailsTabOverview = document.getElementById('details-tab-overview');
        this.detailsTabNotes = document.getElementById('details-tab-notes');
        this.detailsTabEdit = document.getElementById('details-tab-edit');
        this.modalEditNotes = document.getElementById('modal-edit-notes');
        this.modalSaveNotesBtn = document.getElementById('modal-save-notes-btn');
    }

    initEvents() {
        // ----------------------------------------------------
        // QUICK ADD FAB & MODAL EVENTS
        // ----------------------------------------------------
        if (this.quickAddFab) {
            this.quickAddFab.addEventListener('click', () => {
                // Populate Shelves Dropdown
                if (this.qaShelf) {
                    this.qaShelf.innerHTML = '<option value="">None (General Library)</option>';
                    this.shelves.forEach(sh => {
                        const opt = document.createElement('option');
                        opt.value = sh;
                        opt.textContent = sh;
                        this.qaShelf.appendChild(opt);
                    });
                }
                
                // Reset inputs
                if (this.qaTitle) this.qaTitle.value = '';
                if (this.qaMovieDirector) this.qaMovieDirector.value = '';
                if (this.qaMovieGenre) this.qaMovieGenre.value = '';
                if (this.qaMovieRuntime) this.qaMovieRuntime.value = '';
                this.qaSelectedRating = 0;
                this.updateQaStarPickerUI(0);
                if (this.qaBookAuthor) this.qaBookAuthor.value = '';
                if (this.qaBookCurrentPage) this.qaBookCurrentPage.value = 0;
                if (this.qaBookTotalPages) this.qaBookTotalPages.value = 100;
                if (this.qaLinkUrl) this.qaLinkUrl.value = '';
                if (this.qaLinkThumbPicker) this.qaLinkThumbPicker.innerHTML = '';
                if (this.qaLinkThumbSection) this.qaLinkThumbSection.classList.add('hidden');
                if (this.qaTaskPriority) this.qaTaskPriority.value = 'medium';
                if (this.qaTaskDueDate) this.qaTaskDueDate.value = '';
                if (this.qaDesc) this.qaDesc.value = '';
                if (this.qaTags) this.qaTags.value = '';
                if (this.qaThumb) this.qaThumb.value = '';
                this.qaSelectedThumb = '';
                this.qaActiveType = 'movie';

                // Reset Type Segment
                if (this.quickAddTypeSegment) {
                    this.quickAddTypeSegment.querySelectorAll('.segment-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.type === 'movie');
                    });
                }
                this.toggleQaTypeFields('movie');
                this.showModal(this.quickAddModal);
            });
        }

        if (this.qaCancelBtn) {
            this.qaCancelBtn.addEventListener('click', () => {
                this.hideModal(this.quickAddModal);
            });
        }

        if (this.quickAddModal) {
            this.quickAddModal.addEventListener('click', (e) => {
                if (e.target === this.quickAddModal) this.hideModal(this.quickAddModal);
            });
        }

        if (this.quickAddTypeSegment) {
            this.quickAddTypeSegment.addEventListener('click', (e) => {
                const btn = e.target.closest('.segment-btn');
                if (btn) {
                    this.quickAddTypeSegment.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.qaActiveType = btn.dataset.type;
                    this.toggleQaTypeFields(this.qaActiveType);
                }
            });
        }

        // Quick Add Star Picker
        if (this.qaMovieStarPicker) {
            this.qaMovieStarPicker.querySelectorAll('i').forEach(star => {
                star.addEventListener('click', () => {
                    this.qaSelectedRating = parseInt(star.dataset.rating) || 0;
                    this.updateQaStarPickerUI(this.qaSelectedRating);
                });
            });
        }

        // Quick Add Link Meta Fetch
        if (this.qaLinkFetchBtn) {
            this.qaLinkFetchBtn.addEventListener('click', async () => {
                const url = this.qaLinkUrl ? this.qaLinkUrl.value.trim() : '';
                if (!url) return;
                this.showLoader(true, "Scraping URL metadata...");
                try {
                    const m = await this.fetchLinkMetadata(url);
                    if (m) {
                        if (this.qaTitle) this.qaTitle.value = m.title || '';
                        if (this.qaDesc) this.qaDesc.value = m.description || '';
                        this.renderQaThumbPicker(m.images || [], `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`);
                    }
                } catch (e) {
                    console.error("Meta fetch failed:", e);
                    this.showToast("Autofetch failed. Please fill manually.", "error");
                } finally {
                    this.showLoader(false);
                }
            });
        }

        // Save Quick Add Item
        if (this.qaSaveBtn) {
            this.qaSaveBtn.addEventListener('click', () => {
                const title = this.qaTitle ? this.qaTitle.value.trim() : '';
                if (!title) {
                    this.showToast("Title is required!", "error");
                    return;
                }

                const tags = this.qaTags ? this.qaTags.value.split(',').map(t => t.trim()).filter(Boolean) : [];
                const desc = this.qaDesc ? this.qaDesc.value.trim() : '';
                const shelf = this.qaShelf ? this.qaShelf.value : '';
                const thumb = this.qaThumb ? this.qaThumb.value.trim() : '';

                const item = {
                    id: this.qaActiveType + '_' + Date.now(),
                    type: this.qaActiveType,
                    title: title,
                    desc: desc,
                    tags: tags,
                    shelf: shelf,
                    completed: false,
                    date: Date.now(),
                    favorite: false
                };

                // Add default placeholders for thumbnails
                if (this.qaActiveType === 'movie') {
                    item.thumb = thumb || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=600&auto=format&fit=crop';
                    item.director = this.qaMovieDirector ? this.qaMovieDirector.value.trim() : '';
                    item.genre = this.qaMovieGenre ? this.qaMovieGenre.value.trim() : '';
                    item.runtime = this.qaMovieRuntime ? (parseInt(this.qaMovieRuntime.value) || 0) : 0;
                    item.rating = this.qaSelectedRating || 0;
                    item.year = new Date().getFullYear().toString();
                } else if (this.qaActiveType === 'book') {
                    item.thumb = thumb || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=600&auto=format&fit=crop';
                    item.author = this.qaBookAuthor ? this.qaBookAuthor.value.trim() : '';
                    item.currentPage = this.qaBookCurrentPage ? (parseInt(this.qaBookCurrentPage.value) || 0) : 0;
                    item.totalPages = this.qaBookTotalPages ? (parseInt(this.qaBookTotalPages.value) || 100) : 100;
                    item.year = new Date().getFullYear().toString();
                } else if (this.qaActiveType === 'link') {
                    item.url = this.qaLinkUrl ? this.normalizeUrl(this.qaLinkUrl.value.trim()) : 'https://google.com';
                    item.thumb = this.qaSelectedThumb || thumb || 'https://images.unsplash.com/photo-1546074177-3b1b98a31289?q=80&w=600&auto=format&fit=crop';
                    item.year = this.getHostname(item.url);
                } else if (this.qaActiveType === 'task') {
                    item.thumb = '';
                    item.priority = this.qaTaskPriority ? this.qaTaskPriority.value : 'medium';
                    item.dueDate = this.qaTaskDueDate ? this.qaTaskDueDate.value : '';
                    item.year = 'Task';
                }

                this.items.unshift(item);
                this.saveItems();
                this.hideModal(this.quickAddModal);
                this.showToast(`Added "${title}" successfully!`, "success");
                this.dirtyLibrary = true;
                this.dirtyShelves = true;
                this.render();
            });
        }

        // ----------------------------------------------------
        // DETAILS MODAL TABS EVENTS
        // ----------------------------------------------------
        if (this.detailsModalTabs) {
            this.detailsModalTabs.addEventListener('click', (e) => {
                const btn = e.target.closest('.segment-btn');
                if (btn) {
                    this.detailsModalTabs.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.switchDetailsTab(btn.dataset.tab);
                }
            });
        }

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



        const libClearAllBtn = document.getElementById('lib-clear-all-btn');
        if (libClearAllBtn) {
            libClearAllBtn.addEventListener('click', () => {
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
                    this.addToSearchHistory(query);
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



        // Planner modal close handlers
        if (this.closePlannerModalBtn) {
            this.closePlannerModalBtn.onclick = () => this.hideModal(this.plannerModal);
        }
        if (this.plannerModal) {
            this.plannerModal.onclick = (e) => {
                if (e.target === this.plannerModal) this.hideModal(this.plannerModal);
            };
        }



        // Main Details Modal
        this.closeModalBtnDetails.onclick = () => this.hideModal(this.mainModal);
        this.mainModal.onclick = (e) => { if (e.target === this.mainModal) this.hideModal(this.mainModal); };

        // Type switcher event in modal
        if (this.modalEditType) {
            this.modalEditType.addEventListener('change', (e) => {
                this.toggleEditTypeFields(e.target.value);
            });
        }

        // Star rating picker event in modal
        if (this.modalEditStarPicker) {
            this.modalEditStarPicker.querySelectorAll('i').forEach(star => {
                star.addEventListener('click', () => {
                    const rating = parseInt(star.dataset.rating);
                    this.selectedRating = rating;
                    this.updateStarPickerUI(rating);
                });
            });
        }

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

        // Desktop Header Nav Link events
        document.querySelectorAll('.header-nav-link').forEach(link => {
            link.onclick = () => {
                const targetNav = link.dataset.nav;
                
                // Set active class
                document.querySelectorAll('.header-nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                if (targetNav === 'home') {
                    // Switch to home, show all
                    this.activeType = 'all';
                    this.activeTag = 'all';
                    this.activeStatus = 'all';
                    this.switchTab('home');
                    this.clearAllFilters(); // Reset filters
                } else if (targetNav === 'movie') {
                    // Switch to home, filter to movies
                    this.activeType = 'movie';
                    this.activeTag = 'all';
                    this.activeStatus = 'all';
                    this.switchTab('home');
                    this.render();
                } else if (targetNav === 'link') {
                    // Switch to home, filter to bookmarks
                    this.activeType = 'link';
                    this.activeTag = 'all';
                    this.activeStatus = 'all';
                    this.switchTab('home');
                    this.render();
                } else if (targetNav === 'sync') {
                    this.switchTab('sync');
                }
            };
        });



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
        if (theme === 'light') {
            document.body.className = 'light-theme';
            document.body.classList.remove('dark-theme');
            localStorage.setItem('sach_theme', 'light');
            if (this.themeIcon) {
                this.themeIcon.className = 'fas fa-moon';
            }
        } else {
            document.body.className = 'dark-theme';
            document.body.classList.remove('light-theme');
            localStorage.setItem('sach_theme', 'dark');
            if (this.themeIcon) {
                this.themeIcon.className = 'fas fa-sun';
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
        if (this.modalTrailerIframe) this.modalTrailerIframe.src = '';
        if (this.modalTrailerContainer) this.modalTrailerContainer.classList.add('hidden');
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

    toggleQaTypeFields(type) {
        const types = ['movie', 'book', 'link', 'task'];
        types.forEach(t => {
            const el = document.getElementById(`qa-fields-${t}`);
            if (el) el.classList.toggle('hidden', t !== type);
        });
        
        // Hide image/thumb URL field for tasks
        const thumbRow = document.getElementById('qa-thumb-row');
        if (thumbRow) thumbRow.classList.toggle('hidden', type === 'task');
    }

    updateQaStarPickerUI(rating) {
        if (!this.qaMovieStarPicker) return;
        this.qaMovieStarPicker.querySelectorAll('i').forEach(star => {
            const r = parseInt(star.dataset.rating) || 0;
            if (r <= rating) {
                star.className = 'fas fa-star';
                star.style.color = '#f5c518';
            } else {
                star.className = 'far fa-star';
                star.style.color = '';
            }
        });
    }

    renderQaThumbPicker(images, fallback) {
        if (!this.qaLinkThumbPicker) return;
        this.qaLinkThumbPicker.innerHTML = '';
        this.qaSelectedThumb = '';

        const allImages = [...new Set([fallback, ...images])].filter(Boolean);
        if (allImages.length === 0) {
            if (this.qaLinkThumbSection) this.qaLinkThumbSection.classList.add('hidden');
            return;
        }

        if (this.qaLinkThumbSection) this.qaLinkThumbSection.classList.remove('hidden');

        allImages.forEach((imgUrl, i) => {
            const item = document.createElement('div');
            item.className = 'thumb-picker-item' + (i === 0 ? ' active' : '');
            if (i === 0) {
                this.qaSelectedThumb = imgUrl;
                if (this.qaThumb) this.qaThumb.value = imgUrl;
            }

            const img = document.createElement('img');
            img.src = imgUrl;
            img.loading = 'lazy';
            img.onerror = () => item.remove();

            item.appendChild(img);
            item.onclick = () => {
                this.qaLinkThumbPicker.querySelectorAll('.thumb-picker-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                this.qaSelectedThumb = imgUrl;
                if (this.qaThumb) this.qaThumb.value = imgUrl;
            };

            this.qaLinkThumbPicker.appendChild(item);
        });
    }

    switchDetailsTab(tab) {
        const panels = ['overview', 'notes', 'edit'];
        panels.forEach(p => {
            const el = document.getElementById(`details-tab-${p}`);
            if (el) el.classList.toggle('hidden', p !== tab);
        });
    }

    switchTab(tab) {
        this.activeTab = tab;
        
        // Update header links state
        document.querySelectorAll('.header-nav-link').forEach(l => {
            let isMatch = false;
            if (tab === 'sync' && l.dataset.nav === 'sync') {
                isMatch = true;
            } else if (tab === 'home') {
                if (this.activeType === 'all' && l.dataset.nav === 'home') isMatch = true;
                if (this.activeType === 'movie' && l.dataset.nav === 'movie') isMatch = true;
                if (this.activeType === 'link' && l.dataset.nav === 'link') isMatch = true;
            }
            l.classList.toggle('active', isMatch);
        });

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
            // Do NOT auto-generate sync code — let the user initiate manually
            // Just update status to ready if not already connected
            if (this.syncCodeDisplay && this.syncCodeDisplay.textContent === '——') {
                this.updateSyncStatus('ready', 'Ready — click Generate to broadcast');
            }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.render();
    }

    // Smart suggestion triggers
    triggerSearch(query, dropdownEl) {
        clearTimeout(this.searchTimeout);
        if (!query || query.trim().length < 2) {
            const history = JSON.parse(localStorage.getItem('sach_search_history')) || [];
            let historyHtml = '';
            if (history.length > 0) {
                historyHtml = `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px 6px; border-bottom: 1px solid var(--border);">
                        <span style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text2);">Recent Searches</span>
                        <button id="clear-search-history-btn" style="font-size: 0.65rem; font-weight: 700; color: var(--accent); cursor: pointer; text-transform: uppercase; border: none; background: none;" onclick="event.stopPropagation(); window.sachApp.clearSearchHistory()">Clear All</button>
                    </div>
                    <div style="display: flex; flex-direction: column;">
                        ${history.map((h, index) => `
                            <div class="search-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px;" onclick="event.stopPropagation(); window.sachApp.quickSearchFill('${h.replace(/'/g, "\\'")}', '${dropdownEl.id}')">
                                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                                    <i class="fas fa-clock-rotate-left" style="font-size: 0.75rem; color: var(--text3); flex-shrink: 0;"></i>
                                    <span style="font-size: 0.85rem; color: var(--text2); word-break: break-all;">${h}</span>
                                </div>
                                <button style="color: var(--text3); font-size: 0.85rem; padding: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; background: none;" onclick="event.stopPropagation(); window.sachApp.removeSearchHistoryItem(${index})">
                                    <i class="fas fa-xmark"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            const recentSaved = this.items.slice(0, 3);
            let recentHtml = '';
            if (recentSaved.length > 0) {
                recentHtml = `
                    <div style="padding: 10px 12px 6px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text2); border-bottom: 1px solid var(--border);">Recently Added</div>
                `;
                recentSaved.forEach(item => {
                    const icon = item.type === 'link' ? '<i class="fas fa-bookmark" style="color:var(--accent)"></i>' : '<i class="fas fa-film" style="color:var(--accent)"></i>';
                    recentHtml += `
                        <div class="search-item" onclick="event.stopPropagation(); window.sachApp.openRecentItem('${item.id}', '${dropdownEl.id}')">
                            <div style="width:24px; text-align:center;">${icon}</div>
                            <div style="flex:1; min-width:0;">
                                <h4 style="font-size:0.85rem; font-weight:700; word-break: break-word;">${item.title}</h4>
                            </div>
                        </div>
                    `;
                });
            }

            const ideas = ['Inception', 'Breaking Bad', 'Interstellar', 'Friends', 'Stranger Things'];
            const ideasHtml = `
                <div style="padding: 10px 12px 6px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text2); border-bottom: 1px solid var(--border); margin-top: 4px;">Quick Search Ideas</div>
                <div style="padding: 10px 12px; display: flex; flex-wrap: wrap; gap: 6px;">
                    ${ideas.map(idea => `<span class="card-tag-pill" style="cursor:pointer; padding: 4px 10px; font-size: 0.72rem; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--r-xs);" onclick="event.stopPropagation(); window.sachApp.quickSearchFill('${idea}', '${dropdownEl.id}')">${idea}</span>`).join('')}
                </div>
            `;

            dropdownEl.innerHTML = historyHtml + recentHtml + ideasHtml;
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
                        <h4 style="font-size:0.85rem; font-weight:700; word-break: break-word;">Import Web Link</h4>
                        <p style="font-size:0.72rem; color:var(--text2); word-break: break-all;">${query}</p>
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
            heading.style.cssText = 'padding: 6px 12px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text2); border-bottom: 1px solid var(--border2);';
            heading.textContent = 'Saved in Library';
            dropdownEl.appendChild(heading);

            localMatches.forEach(item => {
                const row = document.createElement('div');
                row.className = 'search-item';
                const icon = item.type === 'link' ? '<i class="fas fa-bookmark" style="color:var(--accent)"></i>' : '<i class="fas fa-film" style="color:var(--accent)"></i>';
                row.innerHTML = `
                    <div style="width:24px; text-align:center;">${icon}</div>
                    <div style="flex:1; min-width:0;">
                        <h4 style="font-size:0.85rem; font-weight:700; word-break: break-word;">${item.title}</h4>
                    </div>
                `;
                row.onclick = () => {
                    this.addToSearchHistory(query);
                    dropdownEl.classList.add('hidden');
                    this.openDetails(item);
                };
                dropdownEl.appendChild(row);
            });
        }

        // 2. Render Online Matches or Loading State
        if (isLoadingOnline) {
            const heading = document.createElement('div');
            heading.style.cssText = 'padding: 6px 12px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text2); border-bottom: 1px solid var(--border2); margin-top: 4px;';
            heading.textContent = 'Online Movies & TV Shows';
            dropdownEl.appendChild(heading);

            const loaderRow = document.createElement('div');
            loaderRow.style.cssText = 'padding: 1rem; text-align: center; color: var(--text2); font-size: 0.8rem; display: flex; align-items: center; justify-content: center; gap: 8px;';
            loaderRow.innerHTML = `
                <div class="loader-spinner" style="border: 2px solid var(--border2); border-top: 2px solid var(--accent); border-radius: 50%; width: 16px; height: 16px; animation: spin 0.8s linear infinite;"></div>
                <span>Searching IMDb...</span>
            `;
            dropdownEl.appendChild(loaderRow);
        } else if (imdbResults.length > 0) {
            const heading = document.createElement('div');
            heading.style.cssText = 'padding: 6px 12px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text2); border-bottom: 1px solid var(--border2); margin-top: 4px;';
            heading.textContent = 'Online Movies & TV Shows';
            dropdownEl.appendChild(heading);

            imdbResults.forEach(movie => {
                const row = document.createElement('div');
                row.className = 'search-item';
                const isAlreadySaved = this.items.some(i => movie.imdbId && i.imdbId && i.imdbId.toLowerCase() === movie.imdbId.toLowerCase());
                row.innerHTML = `
                    <img src="${movie.poster || 'https://via.placeholder.com/30x45?text=🎞️'}" width="30" height="45" loading="lazy" decoding="async" style="border-radius:4px; object-fit:contain; background:#000;">
                    <div style="flex:1; min-width:0;">
                        <h4 style="font-size:0.85rem; font-weight:700; word-break: break-word;">${movie.title}</h4>
                        <p style="font-size:0.72rem; color:var(--text2);">${movie.year} ${isAlreadySaved ? '· <span style="color:var(--accent); font-weight:bold;">On list</span>' : ''}</p>
                    </div>
                `;
                row.onclick = () => {
                    this.addToSearchHistory(query);
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
                    <div style="color: var(--text3); font-size: 0.8rem; margin-bottom: 0.75rem;">No results found for "${query}"</div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button class="btn secondary tiny" id="btnSearchAddMovie" style="width: 100%; border: 1px solid var(--border2); background: rgba(255,255,255,0.03);"><i class="fas fa-plus"></i> Add Custom Movie / Show</button>
                        <button class="btn secondary tiny" id="btnSearchAddLink" style="width: 100%; border: 1px solid var(--border2); background: rgba(255,255,255,0.03);"><i class="fas fa-link"></i> Add Custom Link</button>
                        <button class="btn secondary tiny" id="btnSearchAddBook" style="width: 100%; border: 1px solid var(--border2); background: rgba(255,255,255,0.03);"><i class="fas fa-book"></i> Add Custom Book</button>
                        <button class="btn secondary tiny" id="btnSearchAddTask" style="width: 100%; border: 1px solid var(--border2); background: rgba(255,255,255,0.03);"><i class="fas fa-circle-check"></i> Add Custom Task</button>
                    </div>
                </div>
            `;
            
            const btnMovie = dropdownEl.querySelector('#btnSearchAddMovie');
            const btnLink = dropdownEl.querySelector('#btnSearchAddLink');
            const btnBook = dropdownEl.querySelector('#btnSearchAddBook');
            const btnTask = dropdownEl.querySelector('#btnSearchAddTask');
            
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
                        imdbId: 'custom_' + Date.now(),
                        date: Date.now()
                    };
                    
                    this.items.unshift(movieItem);
                    this.saveItems();
                    this.render();
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
                    
                    this.items.unshift(linkItem);
                    this.saveItems();
                    this.render();
                    this.openDetails(linkItem, true);
                };
            }

            if (btnBook) {
                btnBook.onclick = (e) => {
                    e.stopPropagation();
                    dropdownEl.classList.add('hidden');
                    if (this.searchInput) this.searchInput.value = '';
                    this.searchQuery = '';
                    
                    const bookItem = {
                        id: 'book_custom_' + Date.now(),
                        type: 'book',
                        title: query,
                        desc: '',
                        thumb: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=600&auto=format&fit=crop',
                        url: '',
                        tags: [],
                        completed: false,
                        year: new Date().getFullYear().toString(),
                        author: '',
                        currentPage: 0,
                        totalPages: 100,
                        date: Date.now()
                    };
                    
                    this.items.unshift(bookItem);
                    this.saveItems();
                    this.render();
                    this.openDetails(bookItem, true);
                };
            }

            if (btnTask) {
                btnTask.onclick = (e) => {
                    e.stopPropagation();
                    dropdownEl.classList.add('hidden');
                    if (this.searchInput) this.searchInput.value = '';
                    this.searchQuery = '';
                    
                    const taskItem = {
                        id: 'task_custom_' + Date.now(),
                        type: 'task',
                        title: query,
                        desc: '',
                        thumb: '',
                        url: '',
                        tags: [],
                        completed: false,
                        year: 'Task',
                        priority: 'medium',
                        dueDate: '',
                        date: Date.now()
                    };
                    
                    this.items.unshift(taskItem);
                    this.saveItems();
                    this.render();
                    this.openDetails(taskItem, true);
                };
            }
        } else if (localMatches.length > 0 && imdbResults.length === 0 && !isLoadingOnline) {
            const heading = document.createElement('div');
            heading.style.cssText = 'padding: 6px 12px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text2); border-bottom: 1px solid var(--border2); margin-top: 4px;';
            heading.textContent = 'Online Movies & TV Shows';
            dropdownEl.appendChild(heading);

            const emptyRow = document.createElement('div');
            emptyRow.style.cssText = 'padding: 0.8rem 1rem; text-align: center; color: var(--text3); font-size: 0.75rem;';
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

    addToSearchHistory(query) {
        if (!query) return;
        const q = query.trim();
        if (q.length < 2) return;
        let history = JSON.parse(localStorage.getItem('sach_search_history')) || [];
        history = history.filter(item => item.toLowerCase() !== q.toLowerCase());
        history.unshift(q);
        if (history.length > 5) {
            history = history.slice(0, 5);
        }
        localStorage.setItem('sach_search_history', JSON.stringify(history));
    }

    clearSearchHistory() {
        localStorage.removeItem('sach_search_history');
        if (this.searchInput) {
            this.triggerSearch(this.searchInput.value, this.searchDropdown);
        }
    }

    removeSearchHistoryItem(index) {
        let history = JSON.parse(localStorage.getItem('sach_search_history')) || [];
        history.splice(index, 1);
        localStorage.setItem('sach_search_history', JSON.stringify(history));
        if (this.searchInput) {
            this.triggerSearch(this.searchInput.value, this.searchDropdown);
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
        
        // Combine parsed images and screenshot fallback, removing duplicates
        const allImages = [...(images || [])];
        if (overrideFB && !allImages.includes(overrideFB)) {
            allImages.push(overrideFB);
        }
        
        const uniqueImages = [...new Set(allImages)].filter(Boolean);
        const isScreenshotOnly = this.currentMetadata?.isScreenshot || (uniqueImages.length === 1 && uniqueImages[0].includes('mshots'));

        if (this.thumbStatus) {
            if (isScreenshotOnly) {
                this.thumbStatus.innerText = "OG Image not found. Use this screenshot or try again?";
                this.thumbStatus.style.color = "var(--red)";
            } else {
                this.thumbStatus.innerText = "Select your preferred thumbnail:";
                this.thumbStatus.style.color = "var(--text2)";
            }
        }

        let firstLoaded = false;

        uniqueImages.forEach((img) => {
            const div = document.createElement('div');
            div.className = 'thumb-option';
            
            const imgEl = document.createElement('img');
            imgEl.src = img;
            
            imgEl.onload = () => {
                // If it is the first image that successfully loads, select it
                if (!firstLoaded) {
                    div.classList.add('selected');
                    this.selectedThumb = img;
                    firstLoaded = true;
                }
            };
            
            imgEl.onerror = () => {
                div.remove();
                // If the removed image was currently selected, select the first remaining option
                if (this.selectedThumb === img) {
                    const firstOption = this.thumbPicker.querySelector('.thumb-option');
                    if (firstOption) {
                        const nextImg = firstOption.querySelector('img')?.src;
                        if (nextImg) {
                            firstOption.classList.add('selected');
                            this.selectedThumb = nextImg;
                        }
                    }
                }
            };

            div.onclick = () => {
                this.thumbPicker.querySelectorAll('.thumb-option').forEach(o => o.classList.remove('selected'));
                div.classList.add('selected');
                this.selectedThumb = img;
            };

            div.appendChild(imgEl);
            this.thumbPicker.appendChild(div);
        });

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
            isScreenshot: false,
            ogImage: null,
            twitterImage: null,
            itempropImage: null,
            microlinkImage: null,
            noembedImage: null,
            otherImages: []
        };

        const resolveUrl = (relative) => {
            try { return new URL(relative, url).href; } catch (e) { return relative; }
        };

        // Determine hostname and domain info
        let hostname = '';
        let domainOnly = '';
        try {
            hostname = new URL(url).hostname;
            domainOnly = hostname.replace('www.', '');
        } catch (e) {
            hostname = 'web';
            domainOnly = 'web';
        }

        // Predictable YouTube thumbnails
        const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i);
        if (ytMatch) {
            const videoId = ytMatch[1];
            results.images.push(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
            results.images.push(`https://img.youtube.com/vi/${videoId}/sddefault.jpg`);
            results.images.push(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
            results.images.push(`https://img.youtube.com/vi/${videoId}/default.jpg`);
        }

        // Consolidated oEmbed Endpoint detector
        const getOEmbedUrl = (targetUrl) => {
            const lower = targetUrl.toLowerCase();
            if (lower.includes('youtube.com/watch') || lower.includes('youtu.be/')) {
                let ytUrl = targetUrl;
                if (targetUrl.includes('youtu.be/')) {
                    const id = targetUrl.split('youtu.be/')[1].split('?')[0];
                    ytUrl = `https://www.youtube.com/watch?v=${id}`;
                }
                return `https://www.youtube.com/oembed?url=${encodeURIComponent(ytUrl)}&format=json`;
            }
            if (lower.includes('spotify.com/')) {
                return `https://open.spotify.com/oembed?url=${encodeURIComponent(targetUrl)}`;
            }
            if (lower.includes('tiktok.com/')) {
                return `https://www.tiktok.com/oembed?url=${encodeURIComponent(targetUrl)}`;
            }
            if (lower.includes('reddit.com/')) {
                return `https://www.reddit.com/oembed?url=${encodeURIComponent(targetUrl)}`;
            }
            if (lower.includes('vimeo.com/')) {
                return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(targetUrl)}`;
            }
            return null;
        };

        // Parallel metadata fetches
        await Promise.allSettled([
            // 1. Wikipedia Summary REST API
            (async () => {
                const wikiMatch = url.match(/([a-z]+)\.wikipedia\.org\/wiki\/([^#?]+)/i);
                if (wikiMatch) {
                    try {
                        const lang = wikiMatch[1];
                        const title = wikiMatch[2];
                        const wikiApiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`;
                        const data = await fetchWithTimeout(wikiApiUrl, { timeout: 3000 });
                        if (data) {
                            if (data.title) results.title = data.title;
                            if (data.extract) results.description = data.extract;
                            if (data.thumbnail && data.thumbnail.source) {
                                results.images.push(data.thumbnail.source);
                            }
                        }
                    } catch (e) {
                        console.warn("Wikipedia API fetch failed:", e);
                    }
                }
            })(),

            // 2. Consolidate oEmbed for YouTube, Spotify, TikTok, Reddit, Vimeo
            (async () => {
                const oembedUrl = getOEmbedUrl(url);
                if (oembedUrl) {
                    try {
                        const data = await fetchWithTimeout(oembedUrl, { timeout: 3000 });
                        if (data) {
                            results.title = data.title || results.title;
                            results.description = data.description || `${data.type || 'Media'} by ${data.author_name || data.provider_name || 'Creator'}`;
                            const imgUrl = data.thumbnail_url || data.url;
                            if (imgUrl) results.images.push(resolveUrl(imgUrl));
                        }
                    } catch (e) {
                        console.warn("oEmbed query failed:", e);
                    }
                }
            })(),

            // 3. Noembed (generic oEmbed fallback API)
            fetchWithTimeout(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, { timeout: 2500 })
                .then(data => {
                    if (data.title && results.title === url) results.title = data.title;
                    if (data.author_name && results.description.startsWith('Fetching')) results.description = `Shared by ${data.author_name}`;
                    if (data.thumbnail_url) results.noembedImage = data.thumbnail_url;
                }),

            // 4. Microlink API
            fetchWithTimeout(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, { timeout: 2500 })
                .then(data => {
                    if (data.status === 'success') {
                        const m = data.data;
                        if (m.title && results.title === url) results.title = m.title;
                        if (m.description) results.description = m.description;
                        if (m.image?.url) results.microlinkImage = m.image.url;
                        if (m.logo?.url) results.otherImages.push(m.logo.url);
                    }
                }),

            // 5. Custom Raced HTML Proxy Scraper + Parser
            fetchHtmlFromProxies(url)
                .then(html => {
                    const parsed = parseHtmlMetadata(html, url);
                    if (parsed.title && results.title === url) results.title = parsed.title;
                    if (parsed.description && results.description.startsWith('Fetching')) results.description = parsed.description;
                    if (parsed.images && parsed.images.length > 0) {
                        results.otherImages = [...results.otherImages, ...parsed.images];
                    }
                })
        ]).catch(err => console.warn("Scrapers finished with errors:", err));

        if (results.title === url) {
            try { results.title = hostname; } catch (e) {}
        }

        // Add Fallback brand/favicon APIs
        const brandLogos = [
            `https://logo.clearbit.com/${domainOnly}`,
            `https://www.google.com/s2/favicons?sz=256&domain=${hostname}`,
            `https://unavatar.io/${domainOnly}`,
            `https://icon.horse/icon/${hostname}`
        ];

        const priorityList = [
            ...results.images, // Predictable & oEmbed images
            results.microlinkImage,
            results.noembedImage,
            ...results.otherImages, // Parsed from HTML
            ...brandLogos
        ];

        results.images = [...new Set(priorityList.filter(Boolean))];
        if (results.images.length === 0) {
            results.images = [results.fallback];
            results.isScreenshot = true;
        }

        return results;
    }



    // Modal Details quick opening
    openDetails(item, startEdit = false) {
        const isSaved = this.items.some(i => String(i.id) === String(item.id) || (item.imdbId && i.imdbId && String(i.imdbId).toLowerCase() === String(item.imdbId).toLowerCase()));
        const savedItem = this.items.find(i => String(i.id) === String(item.id) || (item.imdbId && i.imdbId && String(i.imdbId).toLowerCase() === String(item.imdbId).toLowerCase())) || item;
        
        const posterUrl = savedItem.thumb || 'https://via.placeholder.com/300x450?text=Unavailable';
        this.modalImg.src = posterUrl;
        const posterSideEl = document.querySelector('.modal-poster-side');
        if (posterSideEl) {
            posterSideEl.style.setProperty('--poster-bg', `url('${posterUrl.replace(/'/g, "\\'")}')`);
        }
        this.modalTitle.textContent = savedItem.title;

        // Dynamic Blurred Ambient Backdrop Glow
        if (this.modalBackdropGlow) {
            this.modalBackdropGlow.style.backgroundImage = `url('${posterUrl.replace(/'/g, "\\'")}')`;
        }

        // Setup Trailer Preview if Movie
        if (savedItem.type === 'movie') {
            if (this.modalTrailerContainer) this.modalTrailerContainer.classList.add('hidden');
            if (this.modalTrailerIframe) this.modalTrailerIframe.src = '';
            
            this.fetchTrailerId(savedItem.title, savedItem.year).then(videoId => {
                if (videoId && !this.mainModal.classList.contains('hidden') && this.modalTitle.textContent === savedItem.title) {
                    if (this.modalTrailerIframe) this.modalTrailerIframe.src = `https://www.youtube.com/embed/${videoId}`;
                    if (this.modalTrailerContainer) this.modalTrailerContainer.classList.remove('hidden');
                }
            });
        } else {
            if (this.modalTrailerContainer) this.modalTrailerContainer.classList.add('hidden');
            if (this.modalTrailerIframe) this.modalTrailerIframe.src = '';
        }
        
        this.renderModalDescription(savedItem);
        this.modalLinkActions.classList.toggle('hidden', savedItem.type !== 'link' && !isSaved);
        this.modalOpenUrl.classList.toggle('hidden', savedItem.type !== 'link');
        this.modalCopyUrl.classList.toggle('hidden', savedItem.type !== 'link');
        
        // Reset details tabs state
        if (this.detailsModalTabs) {
            this.detailsModalTabs.querySelectorAll('.segment-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.tab === 'overview');
                if (b.dataset.tab === 'edit' || b.dataset.tab === 'notes') {
                    b.classList.toggle('hidden', !isSaved);
                }
            });
        }
        this.switchDetailsTab(startEdit ? 'edit' : 'overview');
        if (startEdit && this.detailsModalTabs) {
            this.detailsModalTabs.querySelectorAll('.segment-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.tab === 'edit');
            });
        }

        // Populate personal notes
        if (this.modalEditNotes) {
            this.modalEditNotes.value = savedItem.notes || '';
        }
        if (this.modalSaveNotesBtn) {
            this.modalSaveNotesBtn.onclick = () => {
                savedItem.notes = this.modalEditNotes.value.trim();
                this.saveItems();
                this.showToast("Notes saved!", "success");
            };
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

        // Prepopulate inline editor fields if saved
        if (isSaved) {
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

            if (this.modalEditType) {
                this.modalEditType.value = savedItem.type || 'movie';
            }
            this.toggleEditTypeFields(savedItem.type || 'movie');
            
            if (savedItem.type === 'movie') {
                if (this.modalEditDirector) this.modalEditDirector.value = savedItem.director || '';
                if (this.modalEditGenre) this.modalEditGenre.value = savedItem.genre || '';
                if (this.modalEditRuntime) this.modalEditRuntime.value = savedItem.runtime || '';
                this.selectedRating = savedItem.rating || 0;
                this.updateStarPickerUI(this.selectedRating);
            } else if (savedItem.type === 'book') {
                if (this.modalEditAuthor) this.modalEditAuthor.value = savedItem.author || '';
                if (this.modalEditCurrentPage) this.modalEditCurrentPage.value = savedItem.currentPage || 0;
                if (this.modalEditTotalPages) this.modalEditTotalPages.value = savedItem.totalPages || 100;
            } else if (savedItem.type === 'task') {
                if (this.modalEditPriority) this.modalEditPriority.value = savedItem.priority || 'medium';
                if (this.modalEditDueDate) this.modalEditDueDate.value = savedItem.dueDate || '';
            }

            // Toggle edit link thumbnail selection
            if (this.modalEditLinkThumbSection) {
                this.modalEditLinkThumbSection.classList.toggle('hidden', savedItem.type !== 'link');
            }
            if (savedItem.type === 'link') {
                this.selectedThumb = savedItem.thumb;
                this.currentUrl = savedItem.url;
                this.renderEditThumbPicker([savedItem.thumb]);
                this.fetchLinkMetadata(savedItem.url).then(m => this.renderEditThumbPicker(m.images || []));
            }
        }

        // Save edit button callback
        this.modalEditSave.onclick = () => {
            savedItem.title = this.modalEditTitle.value || savedItem.title;
            savedItem.desc = this.modalEditDesc.value || savedItem.desc;
            
            const newType = this.modalEditType ? this.modalEditType.value : savedItem.type;
            savedItem.type = newType;

            if (this.modalEditTags) {
                savedItem.tags = this.modalEditTags.value.split(',').map(t => t.trim()).filter(Boolean);
            }

            if (newType === 'link') {
                const manualThumb = this.modalEditThumb ? this.modalEditThumb.value.trim() : '';
                if (manualThumb && manualThumb !== savedItem.thumb && manualThumb !== this.selectedThumb) {
                    savedItem.thumb = manualThumb;
                } else if (this.selectedThumb) {
                    savedItem.thumb = this.selectedThumb;
                }
                this.modalImg.src = savedItem.thumb;
            } else {
                if (this.modalEditThumb) {
                    savedItem.thumb = this.modalEditThumb.value.trim() || savedItem.thumb;
                }
                
                // Set default thumbnails for books/tasks if empty
                if (!savedItem.thumb) {
                    if (newType === 'book') {
                        savedItem.thumb = 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=600&auto=format&fit=crop';
                    }
                }
                this.modalImg.src = savedItem.thumb || 'https://via.placeholder.com/300x450?text=Unavailable';
            }

            // Save type-specific fields
            if (newType === 'movie') {
                savedItem.director = this.modalEditDirector ? this.modalEditDirector.value.trim() : '';
                savedItem.genre = this.modalEditGenre ? this.modalEditGenre.value.trim() : '';
                savedItem.runtime = this.modalEditRuntime ? (parseInt(this.modalEditRuntime.value) || 0) : 0;
                savedItem.rating = this.selectedRating || 0;
            } else if (newType === 'book') {
                savedItem.author = this.modalEditAuthor ? this.modalEditAuthor.value.trim() : '';
                savedItem.currentPage = this.modalEditCurrentPage ? (parseInt(this.modalEditCurrentPage.value) || 0) : 0;
                savedItem.totalPages = this.modalEditTotalPages ? (parseInt(this.modalEditTotalPages.value) || 100) : 100;
            } else if (newType === 'task') {
                savedItem.priority = this.modalEditPriority ? this.modalEditPriority.value : 'medium';
                savedItem.dueDate = this.modalEditDueDate ? this.modalEditDueDate.value : '';
            }

            if (this.modalEditShelf) {
                savedItem.shelf = this.modalEditShelf.value;
            }

            this.saveItems();
            this.modalTitle.textContent = savedItem.title;
            this.renderModalDescription(savedItem);
            this.renderModalTags(savedItem);
            
            // Update backdrop glow image
            if (this.modalBackdropGlow) {
                this.modalBackdropGlow.style.backgroundImage = `url('${savedItem.thumb || ''}')`;
            }

            // Switch back to overview tab
            if (this.detailsModalTabs) {
                this.detailsModalTabs.querySelectorAll('.segment-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.tab === 'overview');
                });
            }
            this.switchDetailsTab('overview');
            this.showToast("Changes Saved!");
            
            this.dirtyLibrary = true;
            this.dirtyShelves = true;
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
                    favBtn.onclick = () => {
                        this.toggleFavorite(savedItem.id);
                        const isFavNow = !savedItem.favorite;
                        favBtn.classList.toggle('active', isFavNow);
                        favBtn.innerHTML = isFavNow 
                            ? '<i class="fas fa-star" style="color:#f5c518"></i> Favorited' 
                            : '<i class="far fa-star"></i> Favorite';
                    };
                }
                
                if (statusBtn) {
                    statusBtn.classList.toggle('active', !!savedItem.completed);
                    let label = 'Completed';
                    if (savedItem.type === 'movie') label = 'Watched';
                    else if (savedItem.type === 'link') label = 'Read';
                    else if (savedItem.type === 'book') label = 'Finished';
                    
                    statusBtn.innerHTML = savedItem.completed 
                        ? `<i class="fas fa-circle-check" style="color:var(--green)"></i> ${label}` 
                        : `<i class="far fa-circle-check"></i> Mark ${label}`;
                    statusBtn.onclick = () => {
                        this.toggleCompleted(savedItem.id);
                        const isCompNow = !savedItem.completed;
                        statusBtn.classList.toggle('active', isCompNow);
                        statusBtn.innerHTML = isCompNow 
                            ? `<i class="fas fa-circle-check" style="color:var(--green)"></i> ${label}` 
                            : `<i class="far fa-circle-check"></i> Mark ${label}`;
                    };
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
                this.dirtyLibrary = true;
                this.dirtyShelves = true;
                this.render();
            }
        };

        // Delete / Remove logic
        const oldR = document.getElementById('details-remove-btn');
        if (oldR) oldR.remove();

        if (isSaved) {
            const rBtn = document.createElement('button');
            rBtn.id = 'details-remove-btn';
            rBtn.className = 'btn danger wide';
            rBtn.style.marginTop = '12px';
            rBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete Item';
            rBtn.onclick = () => {
                this.items = this.items.filter(i => i.id !== savedItem.id);
                this.saveItems();
                this.hideModal(this.mainModal);
                this.showToast("Removed from Library", "success");
                this.dirtyLibrary = true;
                this.dirtyShelves = true;
                this.render();
            };
            this.detailsTabOverview.appendChild(rBtn);
        }

        this.showModal(this.mainModal);
    }

    async fetchTrailerId(title, year) {
        try {
            const query = `${title} ${year || ''} official trailer`;
            const url = `https://api.allorigins.win/get?url=${encodeURIComponent('https://www.youtube.com/results?search_query=' + encodeURIComponent(query))}`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            const html = data.contents;
            const regex = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
            let match;
            const ids = [];
            while ((match = regex.exec(html)) !== null) {
                ids.push(match[1]);
            }
            const uniqueIds = [...new Set(ids)];
            return uniqueIds.length > 0 ? uniqueIds[0] : null;
        } catch (e) {
            console.error("Error fetching trailer ID:", e);
            return null;
        }
    }

    renderEditThumbPicker(images) {
        if (!this.editThumbPicker) return;
        this.editThumbPicker.innerHTML = '';
        const unique = [...new Set([...(images || []), this.selectedThumb])].filter(Boolean);
        
        unique.forEach(img => {
            const div = document.createElement('div');
            div.className = 'thumb-option' + (img === this.selectedThumb ? ' selected' : '');
            div.onclick = () => this.selectEditThumb(img);
            
            const imgEl = document.createElement('img');
            imgEl.src = img;
            imgEl.onerror = () => {
                div.remove();
                if (this.selectedThumb === img) {
                    const firstOption = this.editThumbPicker.querySelector('.thumb-option');
                    if (firstOption) {
                        const nextImg = firstOption.querySelector('img')?.src;
                        if (nextImg) this.selectEditThumb(nextImg);
                    }
                }
            };
            
            div.appendChild(imgEl);
            this.editThumbPicker.appendChild(div);
        });
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
        const isSaved = this.items.some(i => String(i.id) === String(item.id) || (item.imdbId && i.imdbId && String(i.imdbId).toLowerCase() === String(item.imdbId).toLowerCase()));
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
        
        const isSaved = this.items.some(i => String(i.id) === String(item.id) || (item.imdbId && i.imdbId && String(i.imdbId).toLowerCase() === String(item.imdbId).toLowerCase()));
        
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

        // 2. Weekly Cinema Plan Shelf
        const carouselId = 'shelf-watchlist';
        
        let cardsHtml = '';
        // Weekly Cinema Planner cards strictly
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        days.forEach(day => {
            const key = day + '_w' + this.plannerWeek;
            const scheduledId = this.planner ? this.planner[key] : null;
            const movie = scheduledId ? this.items.find(i => String(i.id) === String(scheduledId)) : null;
            
            if (movie) {
                const posterUrl = movie.thumb || '';
                const completedBadge = movie.completed 
                    ? `<div class="card-completed-badge"><i class="fas fa-check"></i> Watched</div>`
                    : '';
                
                cardsHtml += `
                    <div class="card type-movie planner-card ${movie.completed ? 'completed-active' : ''}" data-id="${movie.id}" onclick="window.sachApp.openDetailsById('${movie.id}')" style="position: relative;">
                        <span class="planner-day-badge">${day.substring(0, 3)}</span>
                        
                        <!-- Quick Action Buttons -->
                        <button class="quick-action complete-action ${movie.completed ? 'active' : ''}" title="${movie.completed ? 'Mark Pending' : 'Mark Watched'}" onclick="event.stopPropagation(); window.sachApp.markScheduledMovieCompleted('${movie.id}', '${day}')">
                            <i class="${movie.completed ? 'fas fa-circle-check' : 'far fa-circle-check'}"></i>
                        </button>
                        <button class="quick-action edit-action" title="Change Movie" onclick="event.stopPropagation(); window.sachApp.openPlannerMovieSelector('${day}')" style="right: 36px;">
                            <i class="fas fa-arrows-rotate"></i>
                        </button>
                        <button class="quick-action delete-action" title="Clear Slot" onclick="event.stopPropagation(); window.sachApp.removeScheduledMovie('${day}')" style="right: 8px;">
                            <i class="fas fa-trash-can" style="color: var(--red);"></i>
                        </button>
                        
                        <div class="card-img-wrapper" onclick="event.stopPropagation(); window.sachApp.openDetailsById('${movie.id}')">
                            <img src="${posterUrl || 'https://via.placeholder.com/400x600?text=No+Cover'}" class="card-img" loading="lazy" decoding="async">
                            ${completedBadge}
                        </div>
                        <div class="card-body">
                            <div class="card-info-header" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                                <span class="card-match-score" style="color: var(--green); font-weight: 800; font-size: 0.72rem;">${this.getMatchScore(movie.title)}</span>
                                <span class="card-host-text" style="font-size: 0.68rem; color: var(--text3); font-weight: 600;"><i class="fas fa-calendar-alt"></i> ${movie.year}</span>
                            </div>
                            <h3 class="card-title">${movie.title}</h3>
                            <p class="card-desc">${movie.desc || ''}</p>
                        </div>
                    </div>
                `;
            } else {
                cardsHtml += `
                    <div class="card type-movie planner-empty-card" onclick="window.sachApp.openPlannerMovieSelector('${day}')" style="position: relative; border-style: dashed; border-width: 1px; border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.02);">
                        <span class="planner-day-badge empty">${day.substring(0, 3)}</span>
                        
                        <div class="card-img-wrapper" style="aspect-ratio: 2/3; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.01);">
                            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text3);">
                                <i class="far fa-calendar-plus" style="font-size: 1.5rem; color: var(--accent);"></i>
                                <span style="font-size: 0.68rem; font-weight: 700; opacity: 0.8;">Add Movie</span>
                            </div>
                        </div>
                        <div class="card-body" style="text-align: center; justify-content: center; height: auto;">
                            <h3 class="card-title" style="color: var(--text3); font-size: 0.72rem; font-weight: 600; opacity: 0.7; margin: 0;">Empty Slot</h3>
                        </div>
                    </div>
                `;
            }
        });

        shelvesHtml += `
            <div class="shelf-block">
                <div class="shelf-hd">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <h3 class="shelf-title"><i class="fas fa-film"></i> Weekly Cinema Plan</h3>
                        
                        <!-- Weeks switcher -->
                        <div class="planner-controls" style="display: flex; gap: 4px; align-items: center; margin-left: 8px;">
                            <button class="btn ${this.plannerWeek === 1 ? 'primary' : 'secondary'} tiny" onclick="window.sachApp.togglePlannerWeek(1)" style="font-size:0.62rem; padding:2px 6px; height:auto; line-height:1;">This Week</button>
                            <button class="btn ${this.plannerWeek === 2 ? 'primary' : 'secondary'} tiny" onclick="window.sachApp.togglePlannerWeek(2)" style="font-size:0.62rem; padding:2px 6px; height:auto; line-height:1;">Next Week</button>
                        </div>
                    </div>
                    
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

        // 3. Tasks Shelf
        const pendingTasks = this.items.filter(item => item.type === 'task' && !item.completed);
        const taskCarouselId = 'shelf-tasks';
        
        let tasksHtml = '';
        if (this.taskMode === 'list') {
            tasksHtml = pendingTasks.length > 0 
                ? pendingTasks.map(item => this.createCardHtml(item)).join('')
                : `<div class="shelf-empty" style="padding: 2rem; width: 100%; text-align: center; color: var(--text3);">No pending tasks. Great job!</div>`;
        } else {
            // Agenda Mode
            const todayStr = new Date().toISOString().split('T')[0];
            const todayMs = new Date(todayStr).getTime();
            const sevenDaysLaterMs = todayMs + (7 * 24 * 60 * 60 * 1000);

            const groups = {
                overdue: { title: 'Overdue', icon: 'fa-triangle-exclamation', class: 'overdue', items: [] },
                today: { title: 'Today', icon: 'fa-calendar-day', class: 'today', items: [] },
                thisweek: { title: 'This Week', icon: 'fa-calendar-week', class: 'thisweek', items: [] },
                later: { title: 'Later', icon: 'fa-calendar-days', class: 'later', items: [] },
                nodate: { title: 'No Date', icon: 'fa-circle-question', class: 'nodate', items: [] }
            };

            pendingTasks.forEach(task => {
                if (!task.dueDate) {
                    groups.nodate.items.push(task);
                } else {
                    const taskDateMs = new Date(task.dueDate).getTime();
                    if (task.dueDate < todayStr) {
                        groups.overdue.items.push(task);
                    } else if (task.dueDate === todayStr) {
                        groups.today.items.push(task);
                    } else if (taskDateMs > todayMs && taskDateMs <= sevenDaysLaterMs) {
                        groups.thisweek.items.push(task);
                    } else {
                        groups.later.items.push(task);
                    }
                }
            });

            let groupsHtml = '';
            let totalGrouped = 0;
            for (const key in groups) {
                const grp = groups[key];
                if (grp.items.length > 0) {
                    totalGrouped += grp.items.length;
                    const groupCards = grp.items.map(item => this.createCardHtml(item)).join('');
                    groupsHtml += `
                        <div class="agenda-group">
                            <div class="agenda-group-title ${grp.class}">
                                <i class="fas ${grp.icon}"></i> ${grp.title} <span class="shelf-count" style="margin-left:4px;">${grp.items.length}</span>
                            </div>
                            <div class="agenda-cards-container">
                                ${groupCards}
                            </div>
                        </div>
                    `;
                }
            }

            tasksHtml = totalGrouped > 0 
                ? `<div class="agenda-timeline" style="padding: 8px 4px; width: 100%; display: flex; flex-direction: column; width: 100%; gap: 16px;">` + groupsHtml + `</div>`
                : `<div class="shelf-empty" style="padding: 2rem; width: 100%; text-align: center; color: var(--text3);">No pending tasks. Great job!</div>`;
        }

        shelvesHtml += `
            <div class="shelf-block">
                <div class="shelf-hd">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <h3 class="shelf-title"><i class="fas fa-list-check"></i> Tasks Agenda <span class="shelf-count">${pendingTasks.length}</span></h3>
                        <div class="segment-control tab-style-segment" style="display: flex; background: rgba(255, 255, 255, 0.04); border-radius: var(--r-xs); padding: 2px; border: 1px solid var(--border);">
                            <button class="segment-btn ${this.taskMode === 'list' ? 'active' : ''}" onclick="window.sachApp.setTaskMode('list')" style="font-size: 0.65rem; padding: 4px 10px; font-weight:700;">List</button>
                            <button class="segment-btn ${this.taskMode === 'agenda' ? 'active' : ''}" onclick="window.sachApp.setTaskMode('agenda')" style="font-size: 0.65rem; padding: 4px 10px; font-weight:700;">Agenda</button>
                        </div>
                    </div>
                    
                    ${this.taskMode === 'list' ? `
                    <div class="carousel-controls">
                        <button class="carousel-control-btn" onclick="window.sachApp.scrollCarousel('${taskCarouselId}', -1)" title="Scroll Left"><i class="fas fa-chevron-left"></i></button>
                        <button class="carousel-control-btn" onclick="window.sachApp.scrollCarousel('${taskCarouselId}', 1)" title="Scroll Right"><i class="fas fa-chevron-right"></i></button>
                    </div>
                    ` : ''}
                </div>
                ${this.taskMode === 'list' ? `
                <div class="carousel-shelf" id="${taskCarouselId}">
                    ${tasksHtml}
                </div>
                ` : `<div style="display:block; width:100%;">${tasksHtml}</div>`}
            </div>
        `;

        // 4. Custom Shelves
        this.shelves.forEach((shelfName, idx) => {
            const shelfItems = this.items.filter(item => item.shelf === shelfName);
            const customCarouselId = `shelf-custom-${idx}`;
            const shelfCardsHtml = shelfItems.length > 0 
                ? shelfItems.map(item => this.createCardHtml(item)).join('')
                : `<div class="shelf-empty">This shelf is empty. Edit items to assign them here.</div>`;
            
            shelvesHtml += `
                <div class="shelf-block">
                    <div class="shelf-hd">
                        <h3 class="shelf-title"><i class="fas fa-list-ul"></i> ${shelfName} <span class="shelf-count">${shelfItems.length}</span></h3>
                        <button class="section-del-btn" title="Delete Shelf" onclick="window.sachApp.deleteShelf('${shelfName.replace(/'/g, "\\'")}')"><i class="fas fa-trash-alt"></i></button>
                        <div class="carousel-controls" style="${shelfItems.length === 0 ? 'display:none;' : ''}">
                            <button class="carousel-control-btn" onclick="window.sachApp.scrollCarousel('${customCarouselId}', -1)" title="Scroll Left"><i class="fas fa-chevron-left"></i></button>
                            <button class="carousel-control-btn" onclick="window.sachApp.scrollCarousel('${customCarouselId}', 1)" title="Scroll Right"><i class="fas fa-chevron-right"></i></button>
                        </div>
                    </div>
                    <div class="carousel-shelf" id="${customCarouselId}">
                        ${shelfCardsHtml}
                    </div>
                </div>
            `;
        });

        container.innerHTML = shelvesHtml;
        container.style.display = shelvesHtml ? 'block' : 'none';
        this.dirtyShelves = false;
    }

    togglePlannerWeek(week) {
        this.plannerWeek = week;
        this.dirtyShelves = true;
        this.renderShelves();
    }

    setTaskMode(mode) {
        this.taskMode = mode;
        this.dirtyShelves = true;
        this.renderShelves();
    }

    // Grid rendering logic
    render() {
        if (this.activeTab !== 'home') return;

        if (!this.linkGrid) return;

        const libWrap = this.linkGrid ? this.linkGrid.closest('.lib-wrap') : null;
        if (libWrap) {
            libWrap.classList.toggle('is-empty', this.items.length === 0);
        }

        const libClearAllBtn = document.getElementById('lib-clear-all-btn');
        if (libClearAllBtn) {
            libClearAllBtn.classList.toggle('hidden', this.items.length === 0);
        }

        // Render dynamic immersive billboard banner
        this.renderHeroBanner();

        // Render shelves
        this.renderShelves();

        // If library items have changed, rebuild the library catalog DOM elements
        if (this.dirtyLibrary) {
            this.updateTagPillBar();

            if (this.items.length === 0) {
                this.linkGrid.innerHTML = `
                    <div class="empty-state-welcome" style="padding: 4rem 1.5rem; text-align: center; max-width: 420px; margin: 0 auto; width: 100%; opacity: 0.7;">
                        <i class="fas fa-folder-open" style="font-size: 2.5rem; color: var(--text3); margin-bottom: 16px; display: block;"></i>
                        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text); margin-bottom: 8px;">Your Library is Empty</h3>
                        <p style="font-size: 0.8rem; color: var(--text2); line-height: 1.5; margin: 0;">Add movies, tasks, books, or links using the Floating Quick Add button at the bottom right.</p>
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
                } else if (this.activeSort === 'priority') {
                    const priorityWeight = { 'high': 3, 'medium': 2, 'low': 1 };
                    sorted.sort((a, b) => {
                        const weightA = priorityWeight[(a.priority || '').toLowerCase()] || 0;
                        const weightB = priorityWeight[(b.priority || '').toLowerCase()] || 0;
                        return weightB - weightA;
                    });
                } else if (this.activeSort === 'duedate') {
                    sorted.sort((a, b) => {
                        if (!a.dueDate) return 1;
                        if (!b.dueDate) return -1;
                        return a.dueDate.localeCompare(b.dueDate);
                    });
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

    getMatchScore(title) {
        if (!title) return '95%';
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            hash = title.charCodeAt(i) + ((hash << 5) - hash);
        }
        const score = 85 + Math.abs(hash % 15);
        return `${score}% Match`;
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

        if (item.type === 'book') {
            const pagePercentage = item.totalPages ? Math.min(100, Math.round((item.currentPage || 0) * 100 / item.totalPages)) : 0;
            const completedBadgeHTML = item.completed || pagePercentage === 100
                ? `<div class="card-completed-badge" style="background:#eab308; color:#111;"><i class="fas fa-check"></i> Read</div>`
                : '';
            const clickHandler = `window.sachApp.openDetailsById('${item.id}')`;
            const authorText = item.author ? `by ${item.author}` : 'Unknown Author';
            const progressHTML = `
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${pagePercentage}%;"></div>
                </div>
                <div class="progress-percentage-label">Page ${item.currentPage || 0} of ${item.totalPages || 100} (${pagePercentage}%)</div>
            `;
            
            return `
                <div class="card type-book ${item.favorite ? 'fav-active' : ''} ${item.completed ? 'completed-active' : ''}" data-id="${item.id}" onclick="${clickHandler}">
                    <button class="quick-action edit-action" title="Edit details" onclick="event.stopPropagation(); window.sachApp.openDetailsById('${item.id}', true)">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="quick-action complete-action ${item.completed ? 'active' : ''}" title="Mark Read" onclick="event.stopPropagation(); window.sachApp.toggleCompleted('${item.id}')">
                        <i class="${item.completed ? 'fas fa-circle-check' : 'far fa-circle-check'}"></i>
                    </button>
                    <button class="quick-action fav-action ${item.favorite ? 'active' : ''}" title="Favorite" onclick="event.stopPropagation(); window.sachApp.toggleFavorite('${item.id}')">
                        <i class="${item.favorite ? 'fas fa-star' : 'far fa-star'}"></i>
                    </button>
                    <button class="quick-action" title="Delete" onclick="event.stopPropagation(); window.sachApp.removeLink('${item.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="card-img-wrapper" style="aspect-ratio: 2/3;">
                        <img src="${item.thumb || 'https://via.placeholder.com/400x600?text=Book+Cover'}" class="card-img" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='https://via.placeholder.com/400x600?text=Book+Cover'">
                        ${completedBadgeHTML}
                    </div>
                    <div class="card-body">
                        <div class="card-info-header" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <span style="color: #eab308; font-weight: 800; font-size: 0.72rem;"><i class="fas fa-book"></i> Book</span>
                            <span class="card-host-text" style="font-size: 0.68rem; color: var(--text3); font-weight: 600;">${timeAgo}</span>
                        </div>
                        <h3 class="card-title">${item.title}</h3>
                        <p class="card-desc" style="margin-top: 2px;">${authorText}</p>
                        ${progressHTML}
                    </div>
                </div>
            `;
        }

        if (item.type === 'task') {
            const clickHandler = `window.sachApp.openDetailsById('${item.id}')`;
            const isCompleted = !!item.completed;
            const checkboxClass = isCompleted ? 'checked' : '';
            const checkboxIcon = isCompleted ? '<i class="fas fa-check"></i>' : '';
            const priorityClass = (item.priority || 'medium').toLowerCase();
            
            // Overdue check
            let isOverdue = false;
            if (item.dueDate && !isCompleted) {
                const today = new Date().toISOString().split('T')[0];
                if (item.dueDate < today) {
                    isOverdue = true;
                }
            }
            const dateStyle = isOverdue ? 'color: var(--red); font-weight: bold;' : 'color: var(--text3);';
            const dueDateText = item.dueDate ? `<div style="font-size:0.7rem; ${dateStyle} margin-top:2px;"><i class="far fa-calendar"></i> ${item.dueDate} ${isOverdue ? '(OVERDUE)' : ''}</div>` : '';
            
            return `
                <div class="card type-task ${item.favorite ? 'fav-active' : ''} ${item.completed ? 'completed-active' : ''}" data-id="${item.id}" onclick="${clickHandler}">
                    <button class="quick-action edit-action" title="Edit details" onclick="event.stopPropagation(); window.sachApp.openDetailsById('${item.id}', true)">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="quick-action" title="Delete" onclick="event.stopPropagation(); window.sachApp.removeLink('${item.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="card-body" style="padding: 1rem; display: flex; gap: 12px; align-items: flex-start;">
                        <div class="task-checkbox-btn ${checkboxClass}" onclick="event.stopPropagation(); window.sachApp.toggleCompleted('${item.id}')">
                            ${checkboxIcon}
                        </div>
                        <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:4px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%;">
                                <span class="priority-badge ${priorityClass}">${priorityClass}</span>
                                <span style="font-size:0.68rem; color:var(--text3); font-weight:600;">${timeAgo}</span>
                            </div>
                            <h3 class="card-title" style="margin:0; white-space:normal; overflow:visible;">${item.title}</h3>
                            <p class="card-desc" style="margin:0; white-space:normal; overflow:visible; font-size:0.75rem; color:var(--text2);">${item.desc || 'No description'}</p>
                            ${dueDateText}
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
        
        let scheduledText = '';
        if (this.planner) {
            for (const [key, value] of Object.entries(this.planner)) {
                if (String(value) === String(item.id)) {
                    const parts = key.split('_w');
                    const day = parts[0];
                    const week = parts[1] || '1';
                    scheduledText = `${day} (W${week})`;
                    break;
                }
            }
        }
        const scheduleBadge = scheduledText 
            ? `<span class="schedule-badge" onclick="event.stopPropagation(); window.sachApp.navigateToSchedule('${scheduledText}')" title="Click to jump to planner"><i class="far fa-calendar-days"></i> ${scheduledText}</span>`
            : '';

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

        let starRatingHTML = '';
        if (item.rating) {
            starRatingHTML = `<div class="card-rating-stars">${'<i class="fas fa-star"></i>'.repeat(item.rating)}${'<i class="far fa-star"></i>'.repeat(5 - item.rating)}</div>`;
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
                    <div class="card-info-header" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                        <span class="card-match-score" style="color: var(--green); font-weight: 800; font-size: 0.72rem;">${this.getMatchScore(item.title)}</span>
                        <span class="card-host-text" style="font-size: 0.68rem; color: var(--text3); font-weight: 600;">${hostOrYear}</span>
                    </div>
                    <h3 class="card-title">${item.title}</h3>
                    ${starRatingHTML}
                    ${descHTML}
                    ${(scheduleBadge || tagsHTML) ? `<div class="card-tags">${scheduleBadge}${tagsHTML}</div>` : ''}
                </div>
            </div>
        `;
    }

    // Helper methods for the workspace expansion
    toggleEditTypeFields(type) {
        this.editCinemaFields?.classList.toggle('hidden', type !== 'movie');
        this.editBookFields?.classList.toggle('hidden', type !== 'book');
        this.editTaskFields?.classList.toggle('hidden', type !== 'task');
        if (this.modalEditLinkThumbSection) {
            this.modalEditLinkThumbSection.classList.toggle('hidden', type !== 'link');
        }
    }

    updateStarPickerUI(rating) {
        if (!this.modalEditStarPicker) return;
        this.modalEditStarPicker.querySelectorAll('i').forEach(s => {
            const r = parseInt(s.dataset.rating);
            if (r <= rating) {
                s.className = 'fas fa-star active';
            } else {
                s.className = 'far fa-star';
            }
        });
    }

    renderModalDescription(savedItem) {
        if (savedItem.type === 'link') {
            this.modalImg.style.aspectRatio = '16/9';
            this.modalImg.parentElement.style.flex = '0 0 100%';
            this.modalTagsLabel.textContent = 'Tags';
            this.modalDesc.innerHTML = `
                <span class="year-badge"><i class="fas fa-globe"></i> ${savedItem.year}</span>
                <span>${savedItem.desc || 'No description available'}</span>
            `;
            this.modalOpenUrl.onclick = () => window.open(savedItem.url, '_blank');
            this.modalCopyUrl.onclick = () => {
                navigator.clipboard.writeText(savedItem.url);
                this.showToast("URL Copied to clipboard!", "success");
            };
        } else if (savedItem.type === 'movie') {
            this.modalImg.style.aspectRatio = '2/3';
            this.modalImg.parentElement.style.flex = '0 0 280px';
            this.modalTagsLabel.textContent = 'Actors & Tags';
            
            let cinemaDetails = '';
            if (savedItem.director) cinemaDetails += `<strong>Director:</strong> ${savedItem.director}<br/>`;
            if (savedItem.genre) cinemaDetails += `<strong>Genre:</strong> ${savedItem.genre}<br/>`;
            if (savedItem.runtime) cinemaDetails += `<strong>Runtime:</strong> ${savedItem.runtime} min<br/>`;
            if (savedItem.rating) {
                cinemaDetails += `<strong>Rating:</strong> ${'★'.repeat(savedItem.rating)}${'☆'.repeat(5 - savedItem.rating)}<br/>`;
            }
            this.modalDesc.innerHTML = `
                <span class="year-badge"><i class="fas fa-calendar"></i> ${savedItem.year}</span>
                <div style="margin-top:8px; line-height:1.6;">
                    ${cinemaDetails}
                    <p style="margin-top:6px; color:var(--text2);">${savedItem.desc || 'Film Details'}</p>
                </div>
            `;
        } else if (savedItem.type === 'book') {
            this.modalImg.style.aspectRatio = '2/3';
            this.modalImg.parentElement.style.flex = '0 0 280px';
            this.modalTagsLabel.textContent = 'Tags';
            
            const pagePercentage = savedItem.totalPages ? Math.min(100, Math.round((savedItem.currentPage || 0) * 100 / savedItem.totalPages)) : 0;
            const progressText = savedItem.totalPages ? `Page ${savedItem.currentPage || 0} of ${savedItem.totalPages} (${pagePercentage}%)` : '';
            this.modalDesc.innerHTML = `
                <span class="year-badge" style="background:#eab308; color:#111;"><i class="fas fa-book"></i> Book</span>
                <div style="margin-top:8px; line-height:1.6;">
                    <strong>Author:</strong> ${savedItem.author || 'Unknown'}<br/>
                    <strong>Progress:</strong> ${progressText}
                    <p style="margin-top:6px; color:var(--text2);">${savedItem.desc || 'No description available'}</p>
                </div>
            `;
        } else if (savedItem.type === 'task') {
            this.modalImg.style.aspectRatio = '16/9';
            this.modalImg.parentElement.style.flex = '0 0 100%';
            this.modalTagsLabel.textContent = 'Tags';
            
            this.modalDesc.innerHTML = `
                <span class="year-badge" style="background:var(--green); color:#111;"><i class="fas fa-circle-check"></i> Task</span>
                <div style="margin-top:8px; line-height:1.6;">
                    <strong>Priority:</strong> <span class="priority-badge ${savedItem.priority || 'medium'}">${savedItem.priority || 'medium'}</span><br/>
                    <strong>Due Date:</strong> ${savedItem.dueDate || 'No due date'}<br/>
                    <p style="margin-top:6px; color:var(--text2);">${savedItem.desc || 'No description'}</p>
                </div>
            `;
        }
    }

    renderStats() {
        const movies = this.items.filter(i => i.type === 'movie');
        const books = this.items.filter(i => i.type === 'book');
        const tasks = this.items.filter(i => i.type === 'task');

        const watchedMovies = movies.filter(m => m.completed);
        const readBooks = books.filter(b => b.completed || (b.currentPage && b.currentPage === b.totalPages));
        const doneTasks = tasks.filter(t => t.completed);

        // 1. Movies Count
        const moviesCountEl = document.getElementById('stat-movies-count');
        if (moviesCountEl) moviesCountEl.textContent = watchedMovies.length;

        // 2. Average Rating
        const ratedMovies = movies.filter(m => m.rating > 0);
        const avgRating = ratedMovies.length > 0
            ? (ratedMovies.reduce((sum, m) => sum + m.rating, 0) / ratedMovies.length).toFixed(1)
            : '0.0';
        const moviesRatingEl = document.getElementById('stat-movies-rating');
        if (moviesRatingEl) moviesRatingEl.textContent = avgRating;

        // 3. Watch Hours (only count movies with actual runtime logged)
        const totalMins = watchedMovies.reduce((sum, m) => sum + (m.runtime > 0 ? m.runtime : 0), 0);
        const totalHours = Math.round(totalMins / 60);
        const moviesHoursEl = document.getElementById('stat-movies-hours');
        if (moviesHoursEl) moviesHoursEl.textContent = totalHours;

        // 4. Books Read
        const booksCountEl = document.getElementById('stat-books-count');
        if (booksCountEl) booksCountEl.textContent = readBooks.length;

        // 5. Tasks Done + Overdue
        const tasksCountEl = document.getElementById('stat-tasks-count');
        if (tasksCountEl) tasksCountEl.textContent = doneTasks.length;
        const today = new Date().toISOString().split('T')[0];
        const overdueTasks = tasks.filter(t => !t.completed && t.dueDate && t.dueDate < today);
        const overdueEl = document.getElementById('stat-overdue-tasks');
        if (overdueEl) overdueEl.textContent = overdueTasks.length;

        // Workspace Rank calculation
        const rankEl = document.getElementById('stat-workspace-rank');
        const rankSubEl = document.getElementById('stat-workspace-rank-sub');
        if (rankEl && rankSubEl) {
            let rank = 'Fresh Slate 🌟';
            if (this.items.length > 0) {
                if (watchedMovies.length >= 10) {
                    rank = 'Movie Director 🎬';
                } else if (readBooks.length >= 5) {
                    rank = 'Bibliophile 📚';
                } else if (doneTasks.length >= 8) {
                    rank = 'Productivity Guru ⚡';
                } else if (this.items.length >= 15) {
                    rank = 'Workspace Champ 🏆';
                } else if (this.items.length >= 5) {
                    rank = 'Active Collector 🎟️';
                } else {
                    rank = 'Cinema Rookie 🍿';
                }
            }
            rankEl.textContent = rank;
            rankSubEl.textContent = `Logged: ${this.items.length} ${this.items.length === 1 ? 'item' : 'items'}`;
        }

        // Daily Quote selection
        const quotes = [
            { text: "Frankly, my dear, I don't give a damn.", author: "Gone with the Wind (1939)" },
            { text: "I'm going to make him an offer he can't refuse.", author: "The Godfather (1972)" },
            { text: "May the Force be with you.", author: "Star Wars (1977)" },
            { text: "Here's looking at you, kid.", author: "Casablanca (1942)" },
            { text: "There's no place like home.", author: "The Wizard of Oz (1939)" },
            { text: "All we have to decide is what to do with the time that is given us.", author: "J.R.R. Tolkien, The Fellowship of the Ring" },
            { text: "Not all those who wander are lost.", author: "J.R.R. Tolkien, The Fellowship of the Ring" },
            { text: "It is our choices, Harry, that show what we truly are, far more than our abilities.", author: "J.K. Rowling, Harry Potter and the Chamber of Secrets" },
            { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
            { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
            { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
            { text: "The secret of getting ahead is getting started.", author: "Mark Twain" }
        ];
        const quoteTextEl = document.getElementById('stats-quote-text');
        const quoteAuthorEl = document.getElementById('stats-quote-author');
        if (quoteTextEl && quoteAuthorEl) {
            const index = new Date().getDate() % quotes.length;
            const quote = quotes[index];
            quoteTextEl.textContent = `"${quote.text}"`;
            quoteAuthorEl.textContent = `— ${quote.author}`;
        }

        // 6. Genres Breakdown
        const genresListEl = document.getElementById('stats-genres-list');
        if (genresListEl) {
            const genreCounts = {};
            movies.forEach(m => {
                if (m.genre) {
                    const parts = m.genre.split(',').map(g => g.trim()).filter(Boolean);
                    parts.forEach(g => {
                        genreCounts[g] = (genreCounts[g] || 0) + 1;
                    });
                }
            });

            const sortedGenres = Object.entries(genreCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            if (sortedGenres.length === 0) {
                genresListEl.innerHTML = '<div class="shelf-empty" style="padding:0;">No genre data logged yet. Add genres in Movie details.</div>';
            } else {
                const totalMovies = movies.length;
                genresListEl.innerHTML = sortedGenres.map(([genre, count]) => {
                    const percentage = totalMovies > 0 ? Math.round(count * 100 / totalMovies) : 0;
                    return `
                        <div class="genre-row">
                            <div class="genre-row-meta">
                                <span class="genre-row-name">${genre}</span>
                                <span class="genre-row-count">${count} ${count === 1 ? 'movie' : 'movies'} (${percentage}%)</span>
                            </div>
                            <div class="genre-progress-bg">
                                <div class="genre-progress-bar" style="width: ${percentage}%;"></div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // 7. Reading Progress
        const totalBookPages = books.reduce((sum, b) => sum + (b.totalPages || 100), 0);
        const currentBookPages = books.reduce((sum, b) => sum + (b.currentPage || 0), 0);
        const readingPercentage = totalBookPages > 0 ? Math.round(currentBookPages * 100 / totalBookPages) : 0;
        const readingPercentageEl = document.getElementById('stats-reading-percentage');
        if (readingPercentageEl) readingPercentageEl.textContent = `${readingPercentage}%`;
        const readingProgressBarEl = document.getElementById('stats-reading-progress-bar');
        if (readingProgressBarEl) readingProgressBarEl.style.width = `${readingPercentage}%`;

        // 8. Tasks Progress
        const totalTaskCount = tasks.length;
        const tasksPercentage = totalTaskCount > 0 ? Math.round(doneTasks.length * 100 / totalTaskCount) : 0;
        const tasksPercentageEl = document.getElementById('stats-tasks-percentage');
        if (tasksPercentageEl) tasksPercentageEl.textContent = `${tasksPercentage}%`;
        const tasksProgressBarEl = document.getElementById('stats-tasks-progress-bar');
        if (tasksProgressBarEl) tasksProgressBarEl.style.width = `${tasksPercentage}%`;
    }



    openPlannerMovieSelector(day) {
        if (!this.plannerModal || !this.plannerMoviesList) return;
        
        const pendingMovies = this.items.filter(i => i.type === 'movie' && !i.completed);
        const watchedMovies = this.items.filter(i => i.type === 'movie' && i.completed);
        const container = this.plannerMoviesList;
        container.innerHTML = '';

        if (this.plannerModalTitle) {
            this.plannerModalTitle.textContent = `Schedule Movie for ${day}`;
        }

        if (pendingMovies.length === 0 && watchedMovies.length === 0) {
            container.innerHTML = `
                <div class="shelf-empty" style="padding: 1rem 0; text-align: center;">
                    <i class="fas fa-clapperboard" style="font-size: 2rem; color: var(--text3); margin-bottom: 8px; display: block;"></i>
                    No movies in your library.<br/>Search and add movies first!
                </div>
            `;
            this.showModal(this.plannerModal);
            return;
        }

        // Render Pending Movies Header
        if (pendingMovies.length > 0) {
            if (watchedMovies.length > 0) {
                const pendingHeader = document.createElement('div');
                pendingHeader.style.cssText = 'padding: 6px 4px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--accent); border-bottom: 1px solid var(--border); margin-bottom: 8px;';
                pendingHeader.textContent = 'Pending Watchlist';
                container.appendChild(pendingHeader);
            }
            
            pendingMovies.forEach(movie => {
                const opt = document.createElement('div');
                opt.className = 'planner-movie-option';
                const thumbUrl = movie.thumb || '';
                const thumbHtml = thumbUrl ? `<img src="${thumbUrl}" class="planner-movie-option-thumb" />` : `<div class="planner-movie-option-thumb" style="display:flex; align-items:center; justify-content:center; background:var(--surface2);"><i class="fas fa-film" style="color:var(--text3);"></i></div>`;
                
                opt.innerHTML = `
                    ${thumbHtml}
                    <div style="flex: 1; min-width: 0;">
                        <h4 style="font-size: 0.85rem; font-weight: 700; margin:0; white-space:normal;">${movie.title}</h4>
                        <p style="font-size: 0.72rem; color: var(--text2); margin: 0; white-space:normal;">${movie.year} ${movie.genre ? '• ' + movie.genre : ''}</p>
                    </div>
                `;
                
                opt.onclick = () => {
                    if (!this.planner) this.planner = {};
                    const key = day + '_w' + this.plannerWeek;
                    this.planner[key] = movie.id;
                    localStorage.setItem('sach_weekly_planner', JSON.stringify(this.planner));
                    this.hideModal(this.plannerModal);
                    this.dirtyShelves = true;
                    this.renderShelves();
                    this.render();
                    this.showToast(`Scheduled "${movie.title}" for ${day}!`, "success");
                };
                container.appendChild(opt);
            });
        }

        // Render Completed/Watched Movies (Recover/Re-watch Section)
        if (watchedMovies.length > 0) {
            const watchedHeader = document.createElement('div');
            watchedHeader.style.cssText = 'padding: 6px 4px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--green); border-bottom: 1px solid var(--border); margin-top: 12px; margin-bottom: 8px;';
            watchedHeader.textContent = 'Watched Movies (Re-watch / Recover)';
            container.appendChild(watchedHeader);
            
            watchedMovies.forEach(movie => {
                const opt = document.createElement('div');
                opt.className = 'planner-movie-option';
                opt.style.borderColor = 'var(--green)';
                const thumbUrl = movie.thumb || '';
                const thumbHtml = thumbUrl ? `<img src="${thumbUrl}" class="planner-movie-option-thumb" />` : `<div class="planner-movie-option-thumb" style="display:flex; align-items:center; justify-content:center; background:var(--surface2);"><i class="fas fa-film" style="color:var(--text3);"></i></div>`;
                
                opt.innerHTML = `
                    ${thumbHtml}
                    <div style="flex: 1; min-width: 0;">
                        <h4 style="font-size: 0.85rem; font-weight: 700; margin:0; white-space:normal;">${movie.title}</h4>
                        <p style="font-size: 0.72rem; color: var(--text2); margin: 0; white-space:normal;">${movie.year} • <span style="color:var(--green); font-weight:700;"><i class="fas fa-check"></i> Watched</span></p>
                    </div>
                `;
                
                opt.onclick = () => {
                    if (!this.planner) this.planner = {};
                    const key = day + '_w' + this.plannerWeek;
                    this.planner[key] = movie.id;
                    
                    // Recover completion state so it goes back to pending watchlist for planning
                    movie.completed = false;
                    this.saveItems();
                    localStorage.setItem('sach_weekly_planner', JSON.stringify(this.planner));
                    
                    this.hideModal(this.plannerModal);
                    this.dirtyShelves = true;
                    this.renderShelves();
                    this.render();
                    this.showToast(`Recovered & scheduled "${movie.title}" for ${day}!`, "success");
                };
                container.appendChild(opt);
            });
        }

        this.showModal(this.plannerModal);
    }

    removeScheduledMovie(day) {
        const key = day + '_w' + this.plannerWeek;
        if (this.planner && this.planner[key]) {
            delete this.planner[key];
            localStorage.setItem('sach_weekly_planner', JSON.stringify(this.planner));
            this.dirtyShelves = true;
            this.renderShelves();
            this.render();
            this.showToast(`Removed scheduled movie for ${day}.`);
        }
    }



    navigateToSchedule(text) {
        const parts = text.split(' (W');
        const day = parts[0];
        const week = parseInt(parts[1]) || 1;
        
        this.plannerWeek = week;
        this.dirtyShelves = true;
        this.switchTab('home');
        this.renderShelves();
        
        // Scroll to the day card and flash highlight
        setTimeout(() => {
            const plannerCards = document.querySelectorAll('.planner-card, .planner-empty-card');
            plannerCards.forEach(card => {
                const badgeEl = card.querySelector('.planner-day-badge');
                if (badgeEl && badgeEl.textContent.trim().toUpperCase() === day.substring(0, 3).toUpperCase()) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.style.outline = '3px solid var(--accent)';
                    card.style.outlineOffset = '3px';
                    card.style.transition = 'outline 0.3s ease';
                    setTimeout(() => {
                        card.style.outline = '';
                        card.style.outlineOffset = '';
                    }, 1800);
                }
            });
        }, 150);
    }

    markScheduledMovieCompleted(movieId, day) {
        const movie = this.items.find(i => String(i.id) === String(movieId));
        if (movie) {
            movie.completed = true;
            this.saveItems();
            // Remove from all planner slots automatically
            this.removePlannerEntry(movieId);
            this.dirtyShelves = true;
            this.renderShelves();
            this.render();
            this.showToast(`Congratulations! "${movie.title}" marked as watched 🎉`, "success");
        }
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
        const item = this.items.find(i => String(i.id) === String(id));
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
        const isFiltering = this.searchQuery || this.activeType !== 'all' || this.activeStatus !== 'all' || this.activeTag !== 'all';

        const tagPillsHTML = [
            ...(isFiltering ? [`<button class="cat-pill clear-filters-pill" style="border: 1px dashed var(--accent); color: var(--accent); background: var(--accent-dim); display: inline-flex; align-items: center; gap: 4px;" onclick="window.sachApp.clearAllFilters()"><i class="fas fa-xmark" style="font-size:0.65rem;"></i> Clear Filters</button>`] : []),
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

    clearAllFilters() {
        this.searchQuery = '';
        if (this.searchInput) this.searchInput.value = '';
        if (this.searchClearBtn) this.searchClearBtn.classList.add('hidden');
        this.activeType = 'all';
        this.activeStatus = 'all';
        this.activeTag = 'all';

        this.dirtyLibrary = true;
        this.dirtyShelves = true;
        this.dirtyHero = true;
        this.render();
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

                    // Perform library merges, deduplicating by ID, URL, or IMDb IDs
                    const originalCount = this.items.length;
                    const existingIds = new Set(this.items.map(i => i.id));
                    const existingUrls = new Set(this.items.filter(i => i.url).map(i => i.url.toLowerCase()));
                    const existingImdbs = new Set(this.items.filter(i => i.imdbId).map(i => i.imdbId.toLowerCase()));

                    incomingItems.forEach(item => {
                        if (existingIds.has(item.id)) return;
                        
                        if (item.type === 'link' && item.url && !existingUrls.has(item.url.toLowerCase())) {
                            this.items.push(item);
                            existingUrls.add(item.url.toLowerCase());
                            existingIds.add(item.id);
                        } else if (item.type === 'movie' && item.imdbId && !existingImdbs.has(item.imdbId.toLowerCase())) {
                            this.items.push(item);
                            existingImdbs.add(item.imdbId.toLowerCase());
                            existingIds.add(item.id);
                        } else if (item.type === 'book' || item.type === 'task') {
                            this.items.push(item);
                            existingIds.add(item.id);
                        } else if (!item.url && !item.imdbId && !this.items.some(i => i.title === item.title)) {
                            this.items.push(item);
                            existingIds.add(item.id);
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
        } else if (status === 'disconnected') {
            this.syncStatusIndicator.classList.add('disconnected');
            this.syncStatusText.textContent = text || 'Connection failed';
        } else {
            // 'ready' — neutral state, no active connection
            this.syncStatusIndicator.classList.add('ready');
            this.syncStatusText.textContent = text || 'Ready — click Generate to broadcast';
        }
    }

    renderHeroBanner() {
        const container = document.getElementById('hero-banner-container');
        if (!container) {
            if (this.heroInterval) {
                clearInterval(this.heroInterval);
                this.heroInterval = null;
            }
            return;
        }

        if (this.items.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            this.dirtyHero = false;
            if (this.heroInterval) {
                clearInterval(this.heroInterval);
                this.heroInterval = null;
            }
            return;
        }

        // Hide hero if searching or filtering active
        const isFiltering = this.searchQuery || this.activeType !== 'all' || this.activeStatus !== 'all' || this.activeTag !== 'all';
        if (isFiltering) {
            container.style.display = 'none';
            return;
        }

        // Candidates for hero: Favorites + movie watchlist + newest items
        let candidates = this.items.filter(i => i.favorite || (i.type === 'movie' && !i.completed));
        if (candidates.length === 0) {
            candidates = this.items.slice(0, 5); // Fallback to newest 5 items
        }

        if (candidates.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            this.dirtyHero = false;
            if (this.heroInterval) {
                clearInterval(this.heroInterval);
                this.heroInterval = null;
            }
            return;
        }

        // Adjust index if out of bounds
        if (this.heroIndex >= candidates.length) {
            this.heroIndex = 0;
        }

        const featured = candidates[this.heroIndex];

        // Set rotation interval if not set already
        if (!this.heroInterval && candidates.length > 1) {
            this.heroInterval = setInterval(() => {
                this.heroIndex = (this.heroIndex + 1) % candidates.length;
                this.dirtyHero = true;
                this.renderHeroBanner();
            }, 8000); // rotate every 8 seconds
        }

        if (!this.dirtyHero && container.innerHTML !== '') return;

        const isMovie = featured.type === 'movie';
        const badgeText = featured.favorite ? 'FAVORITE' : 'FEATURED';
        const badgeIcon = featured.favorite ? 'fa-star' : 'fa-play';
        const yearOrHost = isMovie ? featured.year : this.getHostname(featured.url);
        
        let recBadge = '';
        if (featured.rating && featured.rating >= 4) {
            recBadge = `<span class="hero-rec-badge gold"><i class="fas fa-trophy"></i> Cinephile Favorite</span>`;
        } else if (featured.type === 'movie' && !featured.completed) {
            recBadge = `<span class="hero-rec-badge red"><i class="fas fa-ticket"></i> Popcorn Pick</span>`;
        } else if (featured.type === 'link') {
            recBadge = `<span class="hero-rec-badge purple"><i class="fas fa-fire"></i> Tech Resource</span>`;
        } else if (featured.type === 'book') {
            recBadge = `<span class="hero-rec-badge yellow"><i class="fas fa-bolt"></i> Must Read</span>`;
        }

        let ratingStarsHtml = '';
        if (featured.rating) {
            ratingStarsHtml = `<div class="hero-rating-stars" style="color:#f5c518; margin-top:2px;">` + 
                Array(5).fill(0).map((_, i) => `<i class="${i < featured.rating ? 'fas' : 'far'} fa-star"></i>`).join('') + 
                `</div>`;
        }
        
        const featuredThumb = featured.thumb || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop';
        container.innerHTML = `
            <div class="hero-wrap">
                <div class="hero-banner" style="--hero-bg: url('${featuredThumb.replace(/'/g, "\\'")}')">
                    <div class="hero-scrim"></div>
                    <div class="hero-content-split">
                        <div class="hero-poster-col" onclick="window.sachApp.openDetailsById('${featured.id}')" style="cursor: pointer;">
                            <img class="hero-poster-img" src="${featuredThumb}" alt="${featured.title}">
                        </div>
                        <div class="hero-text-col">
                            <div class="hero-badge-row">
                                <span class="hero-type-badge"><i class="fas ${badgeIcon}"></i> ${badgeText}</span>
                                <span class="hero-year-pill">${yearOrHost}</span>
                                ${recBadge}
                            </div>
                            <h2 class="hero-title" onclick="window.sachApp.openDetailsById('${featured.id}')" style="cursor: pointer;">${featured.title}</h2>
                            ${ratingStarsHtml}
                            <p class="hero-desc">${featured.desc || 'No description available.'}</p>
                            <div class="hero-btn-row">
                                ${featured.url ? `
                                    <button class="btn-netflix-play" onclick="event.stopPropagation(); window.open('${featured.url.replace(/'/g, "\\'")}', '_blank')">
                                        <i class="fas fa-play"></i> ${isMovie ? 'Play' : 'Open Link'}
                                    </button>
                                ` : ''}
                                <button class="btn-netflix-info" onclick="event.stopPropagation(); window.sachApp.openDetailsById('${featured.id}')">
                                    <i class="fas fa-circle-info"></i> Details
                                </button>
                                <button class="btn-netflix-fav ${featured.favorite ? 'active' : ''}" onclick="event.stopPropagation(); window.sachApp.toggleFavorite('${featured.id}')">
                                    <i class="${featured.favorite ? 'fas' : 'far'} fa-star"></i> ${featured.favorite ? 'Favorited' : 'Favorite'}
                                </button>
                                <button class="btn-netflix-watch ${featured.completed ? 'active' : ''}" onclick="event.stopPropagation(); window.sachApp.toggleCompleted('${featured.id}')">
                                    <i class="${featured.completed ? 'fas' : 'far'} fa-circle-check"></i> ${featured.completed ? (featured.type === 'link' ? 'Read' : 'Watched') : (featured.type === 'link' ? 'Mark Read' : 'Mark Watched')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.style.display = 'block';
        this.dirtyHero = false;
    }

    // Toggle favorite state
    toggleFavorite(id) {
        const item = this.items.find(i => String(i.id) === String(id));
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

    // Remove a movie from all planner slots
    removePlannerEntry(id) {
        if (!this.planner) return;
        let changed = false;
        Object.keys(this.planner).forEach(key => {
            if (String(this.planner[key]) === String(id)) {
                delete this.planner[key];
                changed = true;
            }
        });
        if (changed) {
            localStorage.setItem('sach_weekly_planner', JSON.stringify(this.planner));
        }
    }

    // Toggle watch/completion state
    toggleCompleted(id) {
        const item = this.items.find(i => String(i.id) === String(id));
        if (item) {
            item.completed = !item.completed;
            this.saveItems(false);
            this.dirtyShelves = true;
            this.dirtyHero = true;

            // If marked as watched, auto-remove from planner
            if (item.completed && item.type === 'movie') {
                this.removePlannerEntry(id);
            }
            
            const label = item.type === 'link' ? 'Read' : 'Watched';
            this.showToast(item.completed ? `Marked as ${label}!` : `Marked as pending.`);

            // In-place card update
            const cardEl = this.cardElements.get(id);
            if (cardEl) {
                this.updateCardDOM(item, cardEl);
            }

            // Re-render card grids & billboard
            this.renderHeroBanner();
            this.renderShelves();
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
        
        // Remove any existing toasts immediately to prevent stacking
        container.querySelectorAll('.toast').forEach(t => t.remove());
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-circle-info';
        toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
        
        container.appendChild(toast);
        // Trigger animation on next paint
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 350);
        }, 3200);
    }
}

// Instantiate App on DomContentLoaded
window.addEventListener('DOMContentLoaded', () => {
    window.sachApp = new SachApp();
    window.vidLinkApp = window.sachApp;
});
