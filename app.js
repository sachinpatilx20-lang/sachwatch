/**
 * Sach.in Cinema Vault & Minimalist Watchlist
 * Apple TV+ & Spotify Minimalist Layout, Dynamic Favicons, Real-time Search
 */
class VidLinkApp {
    constructor() {
        const safeGet = (key, fallback) => {
            try {
                const v = localStorage.getItem(key);
                return v ? JSON.parse(v) : fallback;
            } catch (e) {
                return fallback;
            }
        };

        const rawLinks = safeGet('vidlinks', []);
        this.links = (Array.isArray(rawLinks) ? rawLinks : []).map(l => {
            if (!l) return null;
            return {
                id: l.id || ('l_' + Date.now() + Math.random().toString(36).substr(2, 4)),
                url: l.url || '',
                thumb: l.thumb || '',
                title: l.title || 'Untitled',
                desc: l.desc || '',
                tags: Array.isArray(l.tags) ? l.tags : (Array.isArray(l.actors) ? l.actors : (l.category ? [l.category] : [])),
                date: l.date || Date.now(),
                isFavorite: !!l.isFavorite,
                isWatched: !!l.isWatched
            };
        }).filter(Boolean);

        this.currentUrl = '';
        this.currentMetadata = null;
        this.selectedThumb = '';
        this.editingId = null;
        this.currentCrop = 1200;
        this.theme = localStorage.getItem('sachin_theme') || 'dark';
        this.activeTag = 'all';
        this.tempTags = []; 
        this.currentLinkTags = [];
        this.searchQuery = '';
        this.currentSort = localStorage.getItem('sachin_sort') || 'newest';
        this.viewMode = localStorage.getItem('sachin_view_mode') || 'grid';
        this.deferredInstallPrompt = null;
        this.currentSurpriseItem = null;

        // Daily Cinephile Quotes Collection
        this.cineQuotes = [
            { text: "Cinema is a matter of what's in the frame and what's out.", author: "Martin Scorsese" },
            { text: "May the Force be with you.", author: "Star Wars" },
            { text: "I'm going to make him an offer he can't refuse.", author: "The Godfather" },
            { text: "Here's looking at you, kid.", author: "Casablanca" },
            { text: "There is no spoon.", author: "The Matrix" },
            { text: "Why do we fall? So that we can learn to pick ourselves up.", author: "Batman Begins" },
            { text: "Every man dies, not every man really lives.", author: "Braveheart" },
            { text: "Carpe diem. Seize the day, boys. Make your lives extraordinary.", author: "Dead Poets Society" },
            { text: "Great things are done by a series of small things brought together.", author: "Vincent Van Gogh" },
            { text: "It's what you do right now that makes a difference.", author: "Black Hawk Down" },
            { text: "Do, or do not. There is no try.", author: "Yoda" },
            { text: "Hope is a good thing, maybe the best of things, and no good thing ever dies.", author: "Shawshank Redemption" },
            { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
            { text: "Keep your eyes on the stars, and your feet on the ground.", author: "Theodore Roosevelt" },
            { text: "Life moves pretty fast. If you don't stop and look around once in a while, you could miss it.", author: "Ferris Bueller" }
        ];
        this.quoteIndex = Math.floor(Math.random() * this.cineQuotes.length);

        // Customizable Quick Tiles
        const DEFAULT_TILES = [
            { name: "YouTube", url: "https://www.youtube.com", icon: "fab fa-youtube" },
            { name: "YT Music", url: "https://music.youtube.com", icon: "fas fa-music" },
            { name: "Prime Video", url: "https://www.primevideo.com", icon: "fas fa-play" },
            { name: "Netflix", url: "https://netflix.com", icon: "fas fa-film" },
            { name: "JioHotstar", url: "https://www.hotstar.com", icon: "fas fa-star" },
            { name: "SonyLIV", url: "https://www.sonyliv.com", icon: "fas fa-tv" },
            { name: "ZEE5", url: "https://www.zee5.com", icon: "fas fa-play-circle" },
            { name: "Spotify", url: "https://open.spotify.com", icon: "fab fa-spotify" },
            { name: "Instagram", url: "https://www.instagram.com/reels", icon: "fab fa-instagram" },
            { name: "WhatsApp", url: "https://web.whatsapp.com", icon: "fab fa-whatsapp" },
            { name: "Telegram", url: "https://web.telegram.org", icon: "fab fa-telegram" },
            { name: "Reddit", url: "https://www.reddit.com", icon: "fab fa-reddit-alien" },
            { name: "Twitter", url: "https://www.x.com", icon: "fab fa-x-twitter" },
            { name: "Discord", url: "https://discord.com/channels/@me", icon: "fab fa-discord" },
            { name: "Google", url: "https://www.google.com", icon: "fab fa-google" },
            { name: "IMDb", url: "https://www.imdb.com", icon: "fab fa-imdb" },
            { name: "YarrLists", url: "https://yarrlists.net/movies-and-tv-shows", icon: "fas fa-film" },
            { name: "FMHY", url: "https://fmhy.net/video", icon: "fas fa-clapperboard" }
        ];
        this.customTiles = (safeGet('sachin_custom_tiles', DEFAULT_TILES))
            .filter(t => !t.url.includes('twitch.tv') && !t.url.includes('crunchyroll.com'))
            .map(t => {
                if (t.name === 'mPhg') t.name = 'YarrLists';
                if (t.icon === 'fab fa-popcorn' || !t.icon) t.icon = 'fas fa-film';
                return t;
            });

        this.initElements();
        this.initEvents();
        this.setTheme(this.theme);
        this.startLiveClock();
        this.initDailyWidgets();
        this.renderQuickTiles();
        this.initScratchpad();
        this.initUrlParams();
        this.render();
    }

    initElements() {
        this.searchInput = document.getElementById('searchInput');
        this.urlInput = this.searchInput; // Unified Smart Input
        this.addBtn = document.getElementById('addBtn');
        this.linkGrid = document.getElementById('linkGrid');
        this.loader = document.getElementById('loader');
        
        // Search Bar
        this.searchClearBtn = document.getElementById('searchClearBtn');

        // Modals
        this.thumbModal = document.getElementById('thumbModal');
        this.thumbPicker = document.getElementById('thumbPicker');
        this.thumbStatus = document.getElementById('thumbStatus');
        this.thumbMetaPreview = document.getElementById('thumbMetaPreview');
        this.thumbMetaTitle = document.getElementById('thumbMetaTitle');
        this.thumbMetaDesc = document.getElementById('thumbMetaDesc');
        this.thumbMetaTags = document.getElementById('thumbMetaTags');
        this.confirmThumbBtn = document.getElementById('confirmThumb');
        this.closeModalBtn = document.getElementById('closeModal');
        this.retryFetchBtn = document.getElementById('retryFetchBtn');

        this.editModal = document.getElementById('editModal');
        this.editTitle = document.getElementById('editTitle');
        this.editDesc = document.getElementById('editDesc');
        this.editThumbPicker = document.getElementById('editThumbPicker');
        this.saveEditBtn = document.getElementById('saveEditBtn');
        this.closeEditModalBtn = document.getElementById('closeEditModal');
        this.genScreenshotBtn = document.getElementById('genScreenshotBtn');

        // Export/Import
        this.exportBtn = document.getElementById('exportBtn');
        this.importBtn = document.getElementById('importBtn');
        this.importFileInput = document.getElementById('importFileInput');

        this.themeToggle = document.getElementById('themeToggle');
        this.themeIcon = document.getElementById('themeIcon');

        this.tagFilter = document.getElementById('tagFilter');
        this.addTagsInput = document.getElementById('addTagsInput');
        this.addTagBtn = document.getElementById('addTagBtn');
        this.addTagsList = document.getElementById('addTagsList');
        this.editTagsInput = document.getElementById('editTags');
        this.editTagBtn = document.getElementById('editTagBtn');
        this.editTagsList = document.getElementById('editTagsList');

        // IMDb Movie Search Elements
        this.searchDropdown = document.getElementById('search-dropdown');
        this.movieModal = document.getElementById('movieModal');
        this.movieModalPoster = document.getElementById('movieModalPoster');
        this.movieModalTitle = document.getElementById('movieModalTitle');
        this.movieModalYear = document.getElementById('movieModalYear');
        this.movieModalType = document.getElementById('movieModalType');
        this.movieModalCast = document.getElementById('movieModalCast');
        this.movieTrailerWrap = document.getElementById('movieTrailerWrap');
        this.movieTrailerIframe = document.getElementById('movieTrailerIframe');
        this.saveMovieToWatchlistBtn = document.getElementById('saveMovieToWatchlistBtn');
        this.openImdbPageBtn = document.getElementById('openImdbPageBtn');
        this.closeMovieModalBtn = document.getElementById('closeMovieModal');

        this.lightboxModal = document.getElementById('lightboxModal');
        this.lightboxImg = document.getElementById('lightboxImg');
        this.lightboxTitle = document.getElementById('lightboxTitle');
        this.lightboxFitToggleBtn = document.getElementById('lightboxFitToggleBtn');
        this.closeLightboxBtn = document.getElementById('closeLightboxBtn');

        // Daily Interactive Elements
        this.headerSurpriseBtn = document.getElementById('headerSurpriseBtn');
        this.headerNotesBtn = document.getElementById('headerNotesBtn');
        this.headerShortcutsBtn = document.getElementById('headerShortcutsBtn');
        this.surpriseMeBtn = document.getElementById('surpriseMeBtn');
        this.dailyQuoteCard = document.getElementById('dailyQuoteCard');
        this.nextQuoteBtn = document.getElementById('nextQuoteBtn');
        this.quickTilesContainer = document.getElementById('quickTilesContainer');

        // Surprise Modal Elements
        this.surpriseModal = document.getElementById('surpriseModal');
        this.surpriseCardContainer = document.getElementById('surpriseCardContainer');
        this.surpriseRollAgainBtn = document.getElementById('surpriseRollAgainBtn');
        this.surpriseOpenBtn = document.getElementById('surpriseOpenBtn');
        this.closeSurpriseModalBtn = document.getElementById('closeSurpriseModalBtn');

        // Scratchpad Modal Elements
        this.scratchpadModal = document.getElementById('scratchpadModal');
        this.scratchpadInput = document.getElementById('scratchpadInput');
        this.scratchpadStats = document.getElementById('scratchpadStats');
        this.copyScratchpadBtn = document.getElementById('copyScratchpadBtn');
        this.clearScratchpadBtn = document.getElementById('clearScratchpadBtn');
        this.closeScratchpadBtn = document.getElementById('closeScratchpadBtn');

        // Custom Shortcut Modal Elements
        this.customTileModal = document.getElementById('customTileModal');
        this.customTileTitle = document.getElementById('customTileTitle');
        this.customTileUrl = document.getElementById('customTileUrl');
        this.saveCustomTileBtn = document.getElementById('saveCustomTileBtn');
        this.closeCustomTileModalBtn = document.getElementById('closeCustomTileModalBtn');

        // Shortcuts Modal
        this.shortcutsModal = document.getElementById('shortcutsModal');
        this.closeShortcutsModalBtn = document.getElementById('closeShortcutsModalBtn');

        // Toolbar Elements
        this.statsCount = document.getElementById('statsCount');
        this.sortSelect = document.getElementById('sortSelect');
        this.viewToggleBtn = document.getElementById('viewToggleBtn');
        this.pwaInstallBtn = document.getElementById('pwaInstallBtn');

        // Mobile Bottom Nav Dock Elements
        this.navAllBtn = document.getElementById('navAllBtn');
        this.navMoviesBtn = document.getElementById('navMoviesBtn');
        this.navSurpriseBtn = document.getElementById('navSurpriseBtn');
        this.navNotesBtn = document.getElementById('navNotesBtn');
        this.navSearchBtn = document.getElementById('navSearchBtn');
        this.navScrollTopBtn = document.getElementById('navScrollTopBtn');

        this.searchCache = new Map();
        this.searchTimeout = null;
        this.suggestionAbortController = null;
    }

    isUrl(str) {
        if (!str) return false;
        const s = str.trim();
        return /^https?:\/\//i.test(s) || 
               /^www\./i.test(s) || 
               /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|co|in|app|dev|tv|me|cc|info|xyz|gov|edu|uk|ca|de|fr|jp|au)(\/[^\s]*)?$/i.test(s);
    }

    handleSmartAction() {
        const val = this.searchInput ? this.searchInput.value.trim() : '';
        if (!val) return;
        if (this.isUrl(val)) {
            if (this.searchDropdown) this.searchDropdown.classList.add('hidden');
            this.handleAddLink();
        } else {
            if (this.searchDropdown) this.searchDropdown.classList.add('hidden');
            this.searchQuery = val;
            this.render();
        }
    }

    initEvents() {
        if (this.addBtn) this.addBtn.addEventListener('click', () => this.handleSmartAction());
        if (this.searchInput) {
            this.searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleSmartAction();
                }
            });

            // Unified Smart Input Event
            this.searchInput.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                if (val) {
                    if (this.searchClearBtn) this.searchClearBtn.classList.remove('hidden');
                } else {
                    if (this.searchClearBtn) this.searchClearBtn.classList.add('hidden');
                    if (this.searchDropdown) this.searchDropdown.classList.add('hidden');
                }

                if (this.isUrl(val)) {
                    if (this.addBtn) this.addBtn.innerHTML = '<i class="fas fa-plus"></i> Save';
                    if (this.searchDropdown) this.searchDropdown.classList.add('hidden');
                    this.searchQuery = '';
                    this.render();
                } else {
                    if (this.addBtn) this.addBtn.innerHTML = val ? '<i class="fas fa-search"></i> Search' : '<i class="fas fa-plus"></i> Save';
                    this.searchQuery = val;
                    this.render();
                    this.triggerMovieSearch(val);
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
            if (e.key === 'Escape') this.closeAllModals();
            if (!inInput) {
                if (e.key === '/') {
                    e.preventDefault();
                    if (this.searchInput) {
                        this.searchInput.focus();
                        this.searchInput.select();
                    }
                } else if (e.key.toLowerCase() === 'r') {
                    e.preventDefault();
                    this.rollSurprisePick();
                } else if (e.key.toLowerCase() === 'n') {
                    e.preventDefault();
                    this.openScratchpad();
                } else if (e.key.toLowerCase() === 't') {
                    e.preventDefault();
                    this.toggleTheme();
                } else if (e.key === '?') {
                    e.preventDefault();
                    this.openShortcuts();
                }
            }
        });

        // Daily Hero & Quick Tool Button Listeners
        if (this.headerSurpriseBtn) this.headerSurpriseBtn.addEventListener('click', () => this.rollSurprisePick());
        if (this.surpriseMeBtn) this.surpriseMeBtn.addEventListener('click', () => this.rollSurprisePick());
        if (this.headerNotesBtn) this.headerNotesBtn.addEventListener('click', () => this.openScratchpad());
        if (this.headerShortcutsBtn) this.headerShortcutsBtn.addEventListener('click', () => this.openShortcuts());

        if (this.dailyQuoteCard) this.dailyQuoteCard.addEventListener('click', () => this.nextQuote());
        if (this.nextQuoteBtn) this.nextQuoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.nextQuote();
        });

        // Surprise Me Modal Events
        if (this.surpriseRollAgainBtn) this.surpriseRollAgainBtn.addEventListener('click', () => this.rollSurprisePick());
        if (this.surpriseOpenBtn) {
            this.surpriseOpenBtn.addEventListener('click', () => {
                if (this.currentSurpriseItem?.url) {
                    window.open(this.currentSurpriseItem.url, '_blank');
                    this.hideModal(this.surpriseModal);
                }
            });
        }
        if (this.closeSurpriseModalBtn) this.closeSurpriseModalBtn.addEventListener('click', () => this.hideModal(this.surpriseModal));

        // Scratchpad Events
        if (this.closeScratchpadBtn) this.closeScratchpadBtn.addEventListener('click', () => this.hideModal(this.scratchpadModal));
        if (this.clearScratchpadBtn) {
            this.clearScratchpadBtn.addEventListener('click', () => {
                if (confirm('Clear your scratchpad notes?')) {
                    if (this.scratchpadInput) this.scratchpadInput.value = '';
                    localStorage.removeItem('sachin_scratchpad');
                    this.updateScratchpadStats();
                    this.showToast('Scratchpad cleared', 'info');
                }
            });
        }
        if (this.copyScratchpadBtn) {
            this.copyScratchpadBtn.addEventListener('click', () => {
                if (this.scratchpadInput?.value) {
                    navigator.clipboard.writeText(this.scratchpadInput.value).then(() => {
                        this.showToast('Notes copied to clipboard!', 'success');
                    });
                } else {
                    this.showToast('Nothing to copy', 'info');
                }
            });
        }

        // Custom Quick Tile Events
        if (this.saveCustomTileBtn) this.saveCustomTileBtn.addEventListener('click', () => this.saveCustomTile());
        if (this.closeCustomTileModalBtn) this.closeCustomTileModalBtn.addEventListener('click', () => this.hideModal(this.customTileModal));

        // Shortcuts Modal Events
        if (this.closeShortcutsModalBtn) this.closeShortcutsModalBtn.addEventListener('click', () => this.hideModal(this.shortcutsModal));

        // PWA Install Prompt Listeners
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredInstallPrompt = e;
            if (this.pwaInstallBtn) this.pwaInstallBtn.classList.remove('hidden');
        });

        window.addEventListener('appinstalled', () => {
            this.deferredInstallPrompt = null;
            if (this.pwaInstallBtn) this.pwaInstallBtn.classList.add('hidden');
            this.showToast('App installed successfully! Enjoy your streaming hub.', 'success');
        });

        if (this.pwaInstallBtn) {
            this.pwaInstallBtn.addEventListener('click', async () => {
                if (this.deferredInstallPrompt) {
                    this.deferredInstallPrompt.prompt();
                    const { outcome } = await this.deferredInstallPrompt.userChoice;
                    if (outcome === 'accepted') {
                        this.pwaInstallBtn.classList.add('hidden');
                    }
                    this.deferredInstallPrompt = null;
                } else {
                    this.showToast('To install: click the Install icon in your browser URL bar or Add to Home screen in menu.', 'info');
                }
            });
        }

        // Sort Control
        if (this.sortSelect) {
            this.sortSelect.value = this.currentSort;
            this.sortSelect.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                localStorage.setItem('sachin_sort', this.currentSort);
                this.render();
            });
        }

        // View Mode Toggle (Grid vs Compact)
        if (this.viewToggleBtn) {
            this.viewToggleBtn.addEventListener('click', () => {
                this.viewMode = this.viewMode === 'grid' ? 'compact' : 'grid';
                localStorage.setItem('sachin_view_mode', this.viewMode);
                this.render();
            });
        }

        // Mobile Bottom Nav Dock Listeners
        if (this.navAllBtn) {
            this.navAllBtn.addEventListener('click', () => {
                this.activeTag = 'all';
                this.updateActiveNavPill('all');
                this.render();
            });
        }
        if (this.navMoviesBtn) {
            this.navMoviesBtn.addEventListener('click', () => {
                this.activeTag = 'movie';
                this.updateActiveNavPill('movie');
                this.render();
            });
        }
        if (this.navSurpriseBtn) {
            this.navSurpriseBtn.addEventListener('click', () => this.rollSurprisePick());
        }
        if (this.navNotesBtn) {
            this.navNotesBtn.addEventListener('click', () => this.openScratchpad());
        }
        if (this.navSearchBtn) {
            this.navSearchBtn.addEventListener('click', () => {
                if (this.searchInput) {
                    this.searchInput.focus();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }
        if (this.navScrollTopBtn) {
            this.navScrollTopBtn.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        if (this.searchClearBtn) {
            this.searchClearBtn.addEventListener('click', () => {
                if (this.searchInput) this.searchInput.value = '';
                this.searchQuery = '';
                this.searchClearBtn.classList.add('hidden');
                if (this.searchDropdown) this.searchDropdown.classList.add('hidden');
                if (this.addBtn) this.addBtn.innerHTML = '<i class="fas fa-plus"></i> Save';
                this.render();
                if (this.searchInput) this.searchInput.focus();
            });
        }

        // Close dropdown when clicking outside the search box
        document.addEventListener('click', (e) => {
            if (this.searchDropdown && !e.target.closest('.search-box-container')) {
                this.searchDropdown.classList.add('hidden');
            }
        });

        // Close modal when clicking directly on backdrop
        [this.thumbModal, this.editModal, this.movieModal, this.surpriseModal, this.scratchpadModal, this.customTileModal, this.shortcutsModal].forEach(m => {
            if (m) {
                m.addEventListener('click', (e) => {
                    if (e.target === m) this.hideModal(m);
                });
            }
        });

        // Movie Modal Close Button
        if (this.closeMovieModalBtn) {
            this.closeMovieModalBtn.onclick = () => this.hideModal(this.movieModal);
        }

        if (this.closeModalBtn) {
            this.closeModalBtn.addEventListener('click', () => {
                this.hideModal(this.thumbModal);
                if (this.links.length === 0) this.render();
            });
        }
        if (this.confirmThumbBtn) this.confirmThumbBtn.addEventListener('click', () => this.confirmThumbnail());
        if (this.retryFetchBtn) this.retryFetchBtn.addEventListener('click', () => this.handleRetryFetch());

        if (this.saveEditBtn) this.saveEditBtn.addEventListener('click', () => this.saveEdit());
        if (this.closeEditModalBtn) this.closeEditModalBtn.addEventListener('click', () => this.hideModal(this.editModal));
        if (this.genScreenshotBtn) this.genScreenshotBtn.addEventListener('click', () => this.generateScreenshot());

        document.querySelectorAll('.crop-presets button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.crop-presets button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCrop = parseInt(btn.dataset.crop);
            });
        });

        if (this.exportBtn) this.exportBtn.addEventListener('click', () => this.exportWatchlist());
        if (this.importBtn) this.importBtn.addEventListener('click', () => {
            if (this.importFileInput) this.importFileInput.click();
        });
        if (this.importFileInput) this.importFileInput.addEventListener('change', (e) => this.importWatchlist(e));

        const handleTagSelect = (tag) => {
            this.activeTag = tag;
            if (this.tagFilter) {
                this.tagFilter.querySelectorAll('.cat-pill').forEach(p => {
                    if (p.dataset.tag === tag) p.classList.add('active');
                    else p.classList.remove('active');
                });
            }
            document.querySelectorAll('.netflix-nav .nav-link').forEach(l => {
                if (l.dataset.tag === tag) l.classList.add('active');
                else l.classList.remove('active');
            });
            this.render();
        };

        if (this.tagFilter) {
            this.tagFilter.addEventListener('click', (e) => {
                const pill = e.target.closest('.cat-pill');
                if (pill && pill.dataset.tag) handleTagSelect(pill.dataset.tag);
            });
        }

        document.querySelectorAll('.netflix-nav .nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (link.dataset.tag) handleTagSelect(link.dataset.tag);
            });
        });

        if (this.themeToggle) this.themeToggle.addEventListener('click', () => this.toggleTheme());

        if (this.addTagBtn) this.addTagBtn.addEventListener('click', () => this.handleAddFormTag('add'));
        if (this.editTagBtn) this.editTagBtn.addEventListener('click', () => this.handleAddFormTag('edit'));

        if (this.addTagsInput) {
            this.addTagsInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleAddFormTag('add');
                }
            });
        }

        if (this.editTagsInput) {
            this.editTagsInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleAddFormTag('edit');
                }
            });
        }

        if (this.lightboxFitToggleBtn) this.lightboxFitToggleBtn.addEventListener('click', () => this.toggleLightboxFit());
        if (this.closeLightboxBtn) this.closeLightboxBtn.addEventListener('click', () => this.closeLightbox());
    }

    showLoader(show) {
        if (show) this.loader.classList.remove('hidden');
        else this.loader.classList.add('hidden');
    }

    setTheme(theme) {
        this.theme = theme;
        document.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
        localStorage.setItem('sachin_theme', theme);
        
        if (this.themeIcon) {
            this.themeIcon.innerHTML = theme === 'dark' 
                ? '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>'
                : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        }
    }

    toggleTheme() {
        this.setTheme(this.theme === 'light' ? 'dark' : 'light');
    }

    openLightbox(imgSrc, title = 'Screen View') {
        if (!this.lightboxModal || !this.lightboxImg) return;
        this.lightboxImg.src = imgSrc;
        if (this.lightboxTitle) this.lightboxTitle.textContent = title;
        this.lightboxImg.className = 'fit-contain';
        this.showModal(this.lightboxModal);
    }

    toggleLightboxFit() {
        if (!this.lightboxImg) return;
        if (this.lightboxImg.classList.contains('fit-contain')) {
            this.lightboxImg.classList.remove('fit-contain');
            this.lightboxImg.classList.add('fit-cover');
        } else {
            this.lightboxImg.classList.remove('fit-cover');
            this.lightboxImg.classList.add('fit-contain');
        }
    }

    closeLightbox() {
        this.hideModal(this.lightboxModal);
    }

    closeAllModals() {
        [this.thumbModal, this.editModal, this.movieModal, this.lightboxModal, this.surpriseModal, this.scratchpadModal, this.customTileModal, this.shortcutsModal].forEach(m => {
            if (m && !m.classList.contains('hidden')) {
                this.hideModal(m);
                if (m === this.thumbModal && this.links.length === 0) this.render();
            }
        });
    }

    async fetchWithTimeout(fetchUrl, options = {}, timeoutMs = 5000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(fetchUrl, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            return res;
        } catch (e) {
            clearTimeout(timeoutId);
            throw e;
        }
    }

    decodeHtml(str) {
        if (!str) return '';
        try {
            const doc = new DOMParser().parseFromString(str, 'text/html');
            return doc.documentElement.textContent || str;
        } catch (e) {
            return str;
        }
    }

    cleanTitle(title, domain = '') {
        if (!title) return '';
        let t = this.decodeHtml(title).trim();
        // Remove common trailing branding tags
        t = t.replace(/\s*[-|•–—]\s*(YouTube|Netflix|IMDb|Spotify|SoundCloud|Prime Video|Wikipedia|GitHub|Vimeo|Reddit)\s*$/i, '');
        return t.trim() || title;
    }

    sanitizeImageUrl(rawUrl, baseUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return '';
        let u = rawUrl.trim();
        if (!u) return '';

        // Unescape quotes, backslashes, and HTML entities
        u = u.replace(/^['"]+|['"]+$/g, '')
             .replace(/\\\//g, '/')
             .replace(/&amp;/g, '&')
             .replace(/&#38;/g, '&');

        if (u.startsWith('//')) {
            u = 'https:' + u;
        }

        try {
            u = new URL(u, baseUrl).href;
        } catch (e) {
            return '';
        }

        if (!u.startsWith('http://') && !u.startsWith('https://') && !u.startsWith('data:image/')) {
            return '';
        }

        // Clean tracking query params like utm_source, utm_medium, utm_campaign
        try {
            const parsed = new URL(u);
            let cleaned = false;
            ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(p => {
                if (parsed.searchParams.has(p)) {
                    parsed.searchParams.delete(p);
                    cleaned = true;
                }
            });
            if (cleaned) u = parsed.href;
        } catch(e) {}

        const lower = u.toLowerCase();

        // Reject non-image web pages accidentally captured
        if (/\.(html?|php|asp|aspx|jsp)(\?.*)?$/i.test(u) && !/\.(jpe?g|png|webp|gif|avif|svg)/i.test(u)) {
            return '';
        }
        if (/youtube\.com\/watch|youtu\.be\/|vimeo\.com\/\d+$|reddit\.com\/r\//i.test(u)) {
            return '';
        }

        // Reject tracking pixels and spacer images (without blocking soundtrack, tracker, etc.)
        if (
            lower.includes('1x1') ||
            lower.includes('spacer') ||
            lower.includes('blank.gif') ||
            lower.includes('pixel') ||
            lower.includes('cleardot') ||
            lower.includes('beacon') ||
            lower.includes('/s.gif') ||
            lower.includes('ad.doubleclick') ||
            /(?:^|\/|\?|&)tr(?:ack(?:ing)?)?\.(?:gif|png|jpe?g)/i.test(u)
        ) {
            return '';
        }

        return u;
    }

    extractImagesFromDoc(doc, baseUrl) {
        if (!doc) return [];
        const images = [];
        const seen = new Set();

        const addImg = (raw) => {
            const clean = this.sanitizeImageUrl(raw, baseUrl);
            if (clean && !seen.has(clean)) {
                seen.add(clean);
                images.push(clean);
            }
        };

        // 1. Meta image tags (collect all occurrences)
        const metaSelectors = [
            'meta[property="og:image"]',
            'meta[property="og:image:url"]',
            'meta[property="og:image:secure_url"]',
            'meta[name="og:image"]',
            'meta[name="twitter:image"]',
            'meta[name="twitter:image:src"]',
            'meta[property="twitter:image"]',
            'meta[itemprop="image"]',
            'meta[name="image"]',
            'meta[name="thumbnail"]',
            'meta[name="sailthru.image"]',
            'meta[name="parsely-image-url"]',
            'meta[name="msapplication-TileImage"]'
        ];

        metaSelectors.forEach(sel => {
            try {
                doc.querySelectorAll(sel).forEach(el => {
                    const c = el.getAttribute('content') || el.getAttribute('value');
                    if (c) addImg(c);
                });
            } catch (e) {}
        });

        // 2. Link image / icon tags
        const linkSelectors = [
            'link[rel="image_src"]',
            'link[rel="apple-touch-icon"]',
            'link[rel="apple-touch-icon-precomposed"]',
            'link[rel="fluid-icon"]',
            'link[rel="icon"]',
            'link[rel="shortcut icon"]'
        ];
        linkSelectors.forEach(sel => {
            try {
                doc.querySelectorAll(sel).forEach(el => {
                    const h = el.getAttribute('href');
                    if (h) addImg(h);
                });
            } catch (e) {}
        });

        // 3. JSON-LD scripts
        try {
            doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
                const text = s.textContent ? s.textContent.trim() : '';
                if (!text) return;
                try {
                    const parsed = JSON.parse(text);
                    this.extractImagesFromJsonLd(parsed, addImg);
                } catch (e) {
                    try {
                        const sanitized = text.replace(/\\"/g, '"').replace(/[\r\n\t]/g, ' ');
                        this.extractImagesFromJsonLd(JSON.parse(sanitized), addImg);
                    } catch (err) {}
                }
            });
        } catch (e) {}

        // 4. Semantic / prominent page images
        try {
            const semanticSelectors = [
                '[class*="poster"] img',
                '[class*="cover"] img',
                '[class*="thumb"] img',
                '[class*="hero"] img',
                '[class*="featured"] img',
                '[class*="banner"] img',
                '[id*="poster"] img',
                '[id*="cover"] img',
                'article img',
                'main img',
                'figure img'
            ];
            semanticSelectors.forEach(sel => {
                doc.querySelectorAll(sel).forEach(img => {
                    this.extractFromImgElement(img, addImg, baseUrl);
                });
            });

            // 5. General img tags on the page (up to 25 candidates)
            const allImgs = Array.from(doc.querySelectorAll('img'));
            for (const img of allImgs) {
                if (images.length >= 30) break;
                this.extractFromImgElement(img, addImg, baseUrl);
            }
        } catch (e) {}

        return images;
    }

    extractFromImgElement(img, addImg, baseUrl) {
        if (!img) return;
        const src = img.getAttribute('src');
        const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || img.getAttribute('data-high-res-src');
        const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');

        if (dataSrc) addImg(dataSrc);
        if (src && !src.startsWith('data:image/svg')) addImg(src);

        if (srcset) {
            try {
                const parts = srcset.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
                if (parts.length > 0) {
                    addImg(parts[parts.length - 1]);
                }
            } catch (e) {}
        }
    }

    extractImagesFromJsonLd(node, addImg) {
        if (!node) return;
        if (typeof node === 'string') {
            if (node.startsWith('http') || /\.(jpe?g|png|webp|gif|avif)($|\?)/i.test(node)) {
                addImg(node);
            }
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(item => this.extractImagesFromJsonLd(item, addImg));
            return;
        }
        if (typeof node === 'object') {
            const keys = ['image', 'images', 'thumbnailUrl', 'thumbnail', 'primaryImageOfPage', 'photo', 'photos', 'screenshot', 'logo', 'contentUrl', 'embedUrl', 'banner'];
            for (const k of keys) {
                if (node[k]) {
                    if (typeof node[k] === 'string') addImg(node[k]);
                    else if (Array.isArray(node[k])) this.extractImagesFromJsonLd(node[k], addImg);
                    else if (typeof node[k] === 'object') {
                        if (node[k].url) addImg(node[k].url);
                        if (node[k].contentUrl) addImg(node[k].contentUrl);
                    }
                }
            }
            if (node['@graph']) {
                this.extractImagesFromJsonLd(node['@graph'], addImg);
            }
        }
    }

    extractImagesFromMarkdown(text, addImg) {
        if (!text || typeof text !== 'string') return;
        // 1. Markdown syntax: ![alt](url)
        const mdImgRegex = /!\[.*?\]\(\s*<?(https?:\/\/[^\s\)>"]+)>?/g;
        let match;
        while ((match = mdImgRegex.exec(text)) !== null) {
            if (match[1]) addImg(match[1]);
        }
        // 2. Direct image URLs embedded in markdown text
        const rawImgRegex = /https?:\/\/[^\s\)"'<>]+\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s\)"'<>]*)?/gi;
        while ((match = rawImgRegex.exec(text)) !== null) {
            if (match[0]) addImg(match[0]);
        }
    }

    async handleAddLink() {
        let url = this.urlInput ? this.urlInput.value.trim() : '';
        if (!url) return;

        // Auto-prefix protocol if missing
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }

        if (this.addTagsInput) this.handleAddFormTag('add');
        this.currentLinkTags = [...this.tempTags];

        this.currentUrl = url;
        if (this.addBtn) this.addBtn.disabled = true;

        const skeletonHtml = `
            <div class="skeleton-card" id="tempSkeleton">
                <div class="skeleton-img"></div>
                <div class="skeleton-content">
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line tiny" style="margin-top: auto;"></div>
                </div>
            </div>
        `;
        if (this.linkGrid.querySelector('.empty-state')) this.linkGrid.innerHTML = '';
        this.linkGrid.insertAdjacentHTML('afterbegin', skeletonHtml);

        try {
            // Check for duplicates
            const existingLink = this.links.find(l => {
                const normL = (l.url || '').trim().toLowerCase().replace(/\/$/, '');
                const normU = url.trim().toLowerCase().replace(/\/$/, '');
                return normL === normU;
            });

            if (existingLink) {
                this.showToast('Saved already', 'error');
                if (this.urlInput) this.urlInput.value = '';
                if (this.addTagsInput) this.addTagsInput.value = '';
                this.tempTags = [];
                this.renderFormTags('add');
                const skel = document.getElementById('tempSkeleton');
                if (skel) skel.remove();
                if (this.addBtn) this.addBtn.disabled = false;
                
                // Scroll to existing link
                const card = document.querySelector(`[data-id="${existingLink.id}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('highlight-flash');
                    setTimeout(() => card.classList.remove('highlight-flash'), 2000);
                }
                return;
            }

            const metadata = await this.fetchMetadata(url);
            this.currentMetadata = metadata;

            // Merge auto-extracted tags
            if (metadata.tags && Array.isArray(metadata.tags)) {
                metadata.tags.forEach(t => {
                    if (!this.currentLinkTags.includes(t)) {
                        this.currentLinkTags.push(t);
                    }
                });
            }

            this.showThumbPicker(metadata.images || []);
        } catch (error) {
            console.error('Metadata extraction error:', error);
            const fb = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
            this.showThumbPicker([], fb);
        } finally {
            if (this.addBtn) this.addBtn.disabled = false;
            if (this.urlInput) this.urlInput.value = '';
            if (this.addTagsInput) this.addTagsInput.value = '';
            this.tempTags = [];
            this.renderFormTags('add');
            const skel = document.getElementById('tempSkeleton');
            if (skel) skel.remove();
            if (this.links.length === 0 && document.getElementById('thumbModal').classList.contains('hidden')) {
                this.render();
            }
        }
    }

    async handleRetryFetch() {
        this.hideModal(this.thumbModal);
        this.urlInput.value = this.currentUrl;
        this.handleAddLink();
    }

    async fetchMetadata(url) {
        const hostname = this.getHostname(url);
        let results = {
            title: url,
            description: '',
            images: [],
            fallback: `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`,
            url: url,
            tags: [],
            isScreenshot: false
        };

        const candidateImages = [];
        const seenImages = new Set();
        const addImage = (raw) => {
            const clean = this.sanitizeImageUrl(raw, url);
            if (clean && !seenImages.has(clean)) {
                seenImages.add(clean);
                candidateImages.push(clean);
            }
        };

        // 0. Direct Image URL
        if (/\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i.test(url)) {
            addImage(url);
            try {
                const pathname = new URL(url).pathname;
                const filename = pathname.split('/').pop().replace(/\.[^/.]+$/, '');
                results.title = decodeURIComponent(filename) || hostname;
            } catch(e) {
                results.title = hostname;
            }
            results.description = `Direct image link from ${hostname}`;
            results.tags = ['image'];
            results.images = candidateImages;
            return results;
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 1. DEDICATED EXTRACTORS (High Precision, Specialized Media)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // A. YouTube (Videos, Shorts, Live, Music, Embeds)
        const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
        if (ytMatch && ytMatch[1]) {
            const vidId = ytMatch[1];
            try {
                const oembedRes = await this.fetchWithTimeout(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vidId}&format=json`, {}, 4000);
                if (oembedRes.ok) {
                    const data = await oembedRes.json();
                    if (data.title) results.title = this.cleanTitle(data.title, 'YouTube');
                    if (data.author_name) results.description = `YouTube Video by ${data.author_name}`;
                    if (data.thumbnail_url) addImage(data.thumbnail_url);
                }
            } catch (e) {}

            addImage(`https://i.ytimg.com/vi/${vidId}/maxresdefault.jpg`);
            addImage(`https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`);
            addImage(`https://i.ytimg.com/vi/${vidId}/sddefault.jpg`);
            addImage(`https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`);
            addImage(`https://i.ytimg.com/vi/${vidId}/1.jpg`);
            addImage(`https://i.ytimg.com/vi/${vidId}/2.jpg`);
            addImage(`https://i.ytimg.com/vi/${vidId}/3.jpg`);
            results.tags = ['video', 'youtube'];
            results.images = candidateImages;
            return results;
        }

        // B. IMDb Movie/TV Series Direct Cinemeta + JSONP Extractor
        const imdbMatch = url.match(/imdb\.com\/title\/(tt\d+)/i);
        if (imdbMatch && imdbMatch[1]) {
            const ttId = imdbMatch[1];
            results.tags = ['movie'];

            // Cinemeta public Stremio API (fast, high-res posters, backdrop art, logo, trailers)
            const cinemetaPromise = (async () => {
                try {
                    let res = await this.fetchWithTimeout(`https://v3-cinemeta.strem.io/meta/movie/${ttId}.json`, {}, 4500);
                    let data = res.ok ? await res.json() : null;
                    if (!data?.meta) {
                        res = await this.fetchWithTimeout(`https://v3-cinemeta.strem.io/meta/series/${ttId}.json`, {}, 4500);
                        data = res.ok ? await res.json() : null;
                    }
                    if (data?.meta) {
                        const m = data.meta;
                        if (m.name) results.title = m.year ? `${m.name} (${m.year})` : m.name;
                        if (m.description) results.description = m.description;
                        if (m.poster) addImage(m.poster);
                        addImage(`https://images.metahub.space/poster/medium/${ttId}/img`);
                        addImage(`https://images.metahub.space/poster/large/${ttId}/img`);
                        if (m.background) addImage(m.background);
                        if (m.logo) addImage(m.logo);
                        if (Array.isArray(m.trailers)) {
                            m.trailers.forEach(tr => {
                                const yid = tr.source || tr.ytId;
                                if (yid) addImage(`https://i.ytimg.com/vi/${yid}/hqdefault.jpg`);
                            });
                        }
                        if (Array.isArray(m.genres)) {
                            m.genres.forEach(g => {
                                const gl = g.toLowerCase();
                                if (!results.tags.includes(gl)) results.tags.push(gl);
                            });
                        }
                    }
                } catch (e) {}
            })();

            // IMDb JSONP Suggest Autosuggest API
            const imdbJsonpPromise = new Promise((resolve) => {
                const callbackName = `imdb$${ttId}`;
                const script = document.createElement('script');
                script.src = `https://sg.media-imdb.com/suggests/${ttId.charAt(0)}/${ttId}.json`;
                script.async = true;
                const timer = setTimeout(() => { cleanup(); resolve(); }, 4000);
                window[callbackName] = (data) => {
                    cleanup();
                    if (data?.d && data.d.length > 0) {
                        const item = data.d[0];
                        if (!results.title || results.title === url) {
                            const year = item.y || item.tl || '';
                            results.title = year ? `${item.l} (${year})` : item.l;
                        }
                        if (!results.description) {
                            results.description = item.s ? `Starring: ${item.s}` : 'IMDb Title';
                        }
                        if (item.i && item.i[0]) addImage(item.i[0]);
                    }
                    resolve();
                };
                script.onerror = () => { cleanup(); resolve(); };
                function cleanup() {
                    clearTimeout(timer);
                    if (script.parentNode) script.parentNode.removeChild(script);
                    delete window[callbackName];
                }
                document.head.appendChild(script);
            });

            await Promise.allSettled([cinemetaPromise, imdbJsonpPromise]);
            // Do NOT return early here: let Jina AI run below to fetch dozens of scene stills and photos!
        }

        // C. Spotify (Tracks, Albums, Playlists, Artists, Shows, Episodes)
        if (/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/i.test(url)) {
            try {
                const res = await this.fetchWithTimeout(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {}, 4000);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title) results.title = this.cleanTitle(data.title, 'Spotify');
                    results.description = `${data.provider_name || 'Spotify'} • Music`;
                    if (data.thumbnail_url) addImage(data.thumbnail_url);
                    results.tags = ['music', 'spotify'];
                }
            } catch (e) {}
        }

        // D. SoundCloud
        if (/soundcloud\.com\/[^\/]+\/[^\/]+/i.test(url)) {
            try {
                const res = await this.fetchWithTimeout(`https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`, {}, 4000);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title) results.title = this.cleanTitle(data.title, 'SoundCloud');
                    results.description = data.description || (data.author_name ? `SoundCloud track by ${data.author_name}` : 'SoundCloud Audio');
                    if (data.thumbnail_url) addImage(data.thumbnail_url);
                    results.tags = ['music', 'audio'];
                }
            } catch (e) {}
        }

        // E. Reddit
        if (/reddit\.com\/r\/|redd\.it\//i.test(url)) {
            try {
                results.tags = ['social', 'reddit'];
                const oembedRes = await this.fetchWithTimeout(`https://www.reddit.com/oembed?url=${encodeURIComponent(url)}`, {}, 4000);
                if (oembedRes.ok) {
                    const data = await oembedRes.json();
                    if (data.title) results.title = this.cleanTitle(data.title, 'Reddit');
                    if (data.author_name) results.description = `Reddit post by ${data.author_name}`;
                    if (data.thumbnail_url) addImage(data.thumbnail_url);
                }
            } catch (e) {}
        }

        // F. Vimeo
        if (/vimeo\.com\/\d+/i.test(url)) {
            try {
                const res = await this.fetchWithTimeout(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`, {}, 4000);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title) results.title = this.cleanTitle(data.title, 'Vimeo');
                    if (data.description) results.description = data.description;
                    if (data.thumbnail_url) addImage(data.thumbnail_url);
                    if (data.thumbnail_url_with_play_button) addImage(data.thumbnail_url_with_play_button);
                    results.tags = ['video', 'vimeo'];
                }
            } catch (e) {}
        }

        // G. Wikipedia REST Summary & Media-List API
        const wikiMatch = url.match(/([a-z]+)\.wikipedia\.org\/wiki\/([^?#]+)/i);
        if (wikiMatch) {
            const [, lang, pageSlug] = wikiMatch;
            results.tags = ['wiki', 'article'];
            try {
                const res = await this.fetchWithTimeout(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${pageSlug}`, {}, 4500);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title) results.title = data.title;
                    if (data.extract) results.description = data.extract;
                    if (data.originalimage?.source) addImage(data.originalimage.source);
                    if (data.thumbnail?.source) addImage(data.thumbnail.source);
                }
            } catch (e) {}

            try {
                const mediaRes = await this.fetchWithTimeout(`https://${lang}.wikipedia.org/api/rest_v1/page/media-list/${pageSlug}`, {}, 4500);
                if (mediaRes.ok) {
                    const mediaData = await mediaRes.json();
                    if (Array.isArray(mediaData.items)) {
                        mediaData.items.forEach(item => {
                            if (item.srcset && item.srcset.length > 0) {
                                const highest = item.srcset[item.srcset.length - 1]?.src;
                                if (highest) addImage(highest);
                            }
                        });
                    }
                }
            } catch (e) {}
        }

        // H. GitHub Repositories
        const ghMatch = url.match(/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/i);
        if (ghMatch) {
            const [, owner, repo] = ghMatch;
            const cleanRepo = repo.replace(/\.git$/i, '');
            addImage(`https://opengraph.githubassets.com/1/${owner}/${cleanRepo}`);
            addImage(`https://github.com/${owner}.png?size=400`);
            try {
                const res = await this.fetchWithTimeout(`https://api.github.com/repos/${owner}/${cleanRepo}`, {
                    headers: { 'Accept': 'application/vnd.github.v3+json' }
                }, 4000);
                if (res.ok) {
                    const data = await res.json();
                    results.title = data.full_name || `${owner}/${cleanRepo}`;
                    results.description = data.description || 'GitHub Repository';
                    if (data.owner?.avatar_url) addImage(data.owner.avatar_url);
                }
            } catch (e) {}
            results.tags = ['code', 'github'];
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 2. PARALLEL UNIVERSAL ENGINES (Zero-Failure Multi-Proxy)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // Engine 1: Jina AI (Full Rendered HTML + Rich JSON Metadata & Markdown)
        const jinaPromise = (async () => {
            try {
                const res = await this.fetchWithTimeout(`https://r.jina.ai/${url}`, {
                    headers: { 'Accept': 'application/json' }
                }, 7000);
                
                if (res.ok) {
                    const contentType = res.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const json = await res.json();
                        const data = json?.data;
                        if (data) {
                            if (data.title && (results.title === url || !results.title)) {
                                results.title = this.cleanTitle(data.title);
                            }
                            if (data.description && !results.description) {
                                results.description = this.decodeHtml(data.description);
                            }
                            
                            // Comprehensive extraction from metadata
                            if (data.metadata && typeof data.metadata === 'object') {
                                Object.entries(data.metadata).forEach(([k, v]) => {
                                    if (/image|poster|thumb|logo|photo|banner|cover|avatar|art|tile|preview/i.test(k)) {
                                        if (typeof v === 'string') addImage(v);
                                        else if (Array.isArray(v)) v.forEach(item => typeof item === 'string' ? addImage(item) : (item?.url && addImage(item.url)));
                                        else if (v && typeof v === 'object' && v.url) addImage(v.url);
                                    }
                                });
                            }

                            // Extract from external links / icons
                            if (data.external && typeof data.external === 'object') {
                                Object.values(data.external).forEach(extObj => {
                                    if (extObj && typeof extObj === 'object') {
                                        Object.keys(extObj).forEach(addImage);
                                    }
                                });
                            }

                            // Extract all images from page markdown content
                            if (data.content) {
                                this.extractImagesFromMarkdown(data.content, addImage);
                            }

                            // If data.html is returned, parse it with DOMParser as well
                            if (data.html) {
                                const doc = new DOMParser().parseFromString(data.html, 'text/html');
                                this.extractImagesFromDoc(doc, url).forEach(addImage);
                            }
                        }
                    } else {
                        // Plain text markdown response
                        const text = await res.text();
                        if (text) {
                            const titleMatch = text.match(/^Title:\s*(.+)$/m);
                            if (titleMatch && (results.title === url || !results.title)) {
                                results.title = this.cleanTitle(titleMatch[1]);
                            }
                            this.extractImagesFromMarkdown(text, addImage);
                        }
                    }
                }
            } catch (e) {
                // Engine 1 Fallback: direct text fetch if JSON request was rejected
                try {
                    const textRes = await this.fetchWithTimeout(`https://r.jina.ai/${url}`, {}, 5000);
                    if (textRes.ok) {
                        const text = await textRes.text();
                        if (text) {
                            const titleMatch = text.match(/^Title:\s*(.+)$/m);
                            if (titleMatch && (results.title === url || !results.title)) {
                                results.title = this.cleanTitle(titleMatch[1]);
                            }
                            this.extractImagesFromMarkdown(text, addImage);
                        }
                    }
                } catch (err) {}
            }
        })();

        // Engine 2: Microlink API (OpenGraph snapshot engine)
        const microlinkPromise = (async () => {
            try {
                const res = await this.fetchWithTimeout(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, {}, 3500);
                if (res.ok) {
                    const data = await res.json();
                    if (data?.status === 'success' && data.data) {
                        const m = data.data;
                        if (m.title && (results.title === url || !results.title)) results.title = this.cleanTitle(m.title);
                        if (m.description && !results.description) results.description = this.decodeHtml(m.description);
                        if (m.image?.url) addImage(m.image.url);
                        if (Array.isArray(m.images)) {
                            m.images.forEach(img => {
                                if (typeof img === 'string') addImage(img);
                                else if (img?.url) addImage(img.url);
                            });
                        }
                        if (m.logo?.url) addImage(m.logo.url);
                    }
                }
            } catch (e) {}
        })();

        // Engine 3: NoEmbed Generic oEmbed Provider
        const noembedPromise = (async () => {
            try {
                const res = await this.fetchWithTimeout(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, {}, 3500);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title && (results.title === url || !results.title)) results.title = this.cleanTitle(data.title);
                    if (data.author_name && !results.description) results.description = `By ${data.author_name}`;
                    if (data.thumbnail_url) addImage(data.thumbnail_url);
                }
            } catch (e) {}
        })();

        await Promise.allSettled([jinaPromise, microlinkPromise, noembedPromise]);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 3. SMART AUTOMATIC CATEGORY TAGS
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const host = hostname.toLowerCase();
        if (host.includes('netflix') || host.includes('primevideo') || host.includes('hotstar') || host.includes('sonyliv') || host.includes('zee5') || host.includes('hulu') || host.includes('disney')) {
            results.tags.push('movie', 'streaming');
        } else if (host.includes('youtube') || host.includes('vimeo') || host.includes('dailymotion') || host.includes('tiktok') || host.includes('twitch')) {
            results.tags.push('video');
        } else if (host.includes('spotify') || host.includes('soundcloud') || host.includes('music.apple') || host.includes('bandcamp')) {
            results.tags.push('music');
        } else if (host.includes('reddit') || host.includes('twitter') || host.includes('x.com') || host.includes('instagram')) {
            results.tags.push('social');
        } else if (host.includes('github') || host.includes('gitlab') || host.includes('stackoverflow')) {
            results.tags.push('code');
        } else if (host.includes('medium') || host.includes('wikipedia') || host.includes('substack') || host.includes('dev.to')) {
            results.tags.push('article');
        }
        results.tags = [...new Set(results.tags.filter(Boolean))];

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 4. CLEANUP & GUARANTEED IMAGE FALLBACKS
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (!results.title || results.title === url) {
            try {
                results.title = new URL(url).hostname.replace('www.', '');
            } catch(e) {}
        }

        if (!results.description || results.description === 'Fetching metadata...') {
            results.description = `Saved link from ${hostname}`;
        }

        // Always add high-res Favicons as reliable candidates
        try {
            const u = new URL(url);
            addImage(`https://www.google.com/s2/favicons?sz=256&domain=${u.hostname}`);
            addImage(`https://icons.duckduckgo.com/ip3/${u.hostname}.ico`);
        } catch(e) {}

        results.images = candidateImages;

        // Guaranteed fallback if zero images survived
        if (results.images.length === 0) {
            results.images = [
                `https://www.google.com/s2/favicons?sz=256&domain=${hostname}`,
                results.fallback
            ];
            results.isScreenshot = true;
        }

        return results;
    }

    updateThumbCount() {
        if (!this.thumbPicker || !this.thumbStatus) return;
        const count = this.thumbPicker.querySelectorAll('.thumb-option').length;
        const firstImg = this.thumbPicker.querySelector('.thumb-option img')?.src || '';
        const isScreenshotOnly = this.currentMetadata?.isScreenshot || (count === 1 && firstImg.includes('mshots'));

        if (isScreenshotOnly) {
            this.thumbStatus.innerText = "Screenshot Cover";
            this.thumbStatus.style.color = "#e50914";
        } else {
            this.thumbStatus.innerText = `Select cover image (${count} available):`;
            this.thumbStatus.style.color = "#ccc";
        }
    }

    showThumbPicker(images, overrideFB) {
        this.thumbPicker.innerHTML = '';
        let allImages = (overrideFB ? [overrideFB] : (images || [])).filter(Boolean);

        if (allImages.length === 0) {
            const host = this.getHostname(this.currentUrl);
            allImages = [
                `https://www.google.com/s2/favicons?sz=256&domain=${host}`,
                `https://s.wordpress.com/mshots/v1/${encodeURIComponent(this.currentUrl)}?w=1200`
            ];
        }

        const isScreenshotOnly = this.currentMetadata?.isScreenshot || (allImages.length === 1 && allImages[0].includes('mshots'));

        if (this.thumbMetaPreview) {
            this.thumbMetaPreview.classList.remove('hidden');
            if (this.thumbMetaTitle) this.thumbMetaTitle.textContent = this.currentMetadata?.title || this.currentUrl;
            if (this.thumbMetaDesc) this.thumbMetaDesc.textContent = this.currentMetadata?.description || 'No description available.';
            if (this.thumbMetaTags) {
                const tagsToDisplay = this.currentLinkTags && this.currentLinkTags.length > 0 ? this.currentLinkTags : (this.currentMetadata?.tags || []);
                this.thumbMetaTags.innerHTML = tagsToDisplay.map(t => `<span class="thumb-meta-tag">${t}</span>`).join('');
            }
        }

        if (isScreenshotOnly) {
            this.thumbStatus.innerText = "Screenshot Cover";
            this.thumbStatus.style.color = "#e50914";
        } else {
            this.thumbStatus.innerText = `Select cover image (${allImages.length} available):`;
            this.thumbStatus.style.color = "#ccc";
        }

        allImages.forEach((img, index) => {
            const div = document.createElement('div');
            div.className = 'thumb-option' + (index === 0 ? ' selected' : '');
            div.innerHTML = `<img src="${img}" referrerpolicy="no-referrer">`;
            
            const imgEl = div.querySelector('img');
            imgEl.onerror = () => {
                if (img.includes('maxresdefault.jpg')) {
                    imgEl.src = img.replace('maxresdefault.jpg', 'hqdefault.jpg');
                    return;
                }
                if (img.includes('hqdefault.jpg')) {
                    imgEl.src = img.replace('hqdefault.jpg', 'mqdefault.jpg');
                    return;
                }
                div.remove();
                this.updateThumbCount();
                const remaining = this.thumbPicker.querySelectorAll('.thumb-option');
                if (remaining.length > 0) {
                    if (!this.thumbPicker.querySelector('.thumb-option.selected')) {
                        remaining[0].classList.add('selected');
                        const nextSrc = remaining[0].querySelector('img')?.src;
                        if (nextSrc) this.selectedThumb = nextSrc;
                    }
                } else {
                    const host = this.getHostname(this.currentUrl);
                    const fb = `https://www.google.com/s2/favicons?sz=256&domain=${host}`;
                    const fbDiv = document.createElement('div');
                    fbDiv.className = 'thumb-option selected';
                    fbDiv.innerHTML = `<img src="${fb}" referrerpolicy="no-referrer">`;
                    this.thumbPicker.appendChild(fbDiv);
                    this.selectedThumb = fb;
                    this.updateThumbCount();
                }
            };

            div.onclick = () => {
                this.thumbPicker.querySelectorAll('.thumb-option').forEach(o => o.classList.remove('selected'));
                div.classList.add('selected');
                this.selectedThumb = img;
            };
            this.thumbPicker.appendChild(div);
        });

        this.selectedThumb = allImages[0] || '';
        this.updateThumbCount();
        this.showModal(this.thumbModal);
    }

    confirmThumbnail() {
        if (!this.selectedThumb) {
            const firstImg = this.thumbPicker.querySelector('.thumb-option img');
            if (firstImg && firstImg.src) {
                this.selectedThumb = firstImg.src;
            } else {
                const host = this.getHostname(this.currentUrl);
                this.selectedThumb = `https://www.google.com/s2/favicons?sz=256&domain=${host}`;
            }
        }
        const title = this.currentMetadata?.title || this.cleanTitle(this.currentUrl) || this.currentUrl;
        const desc = this.currentMetadata?.description || `Saved link from ${this.getHostname(this.currentUrl)}`;
        this.saveLink(this.selectedThumb, title, desc, [...this.currentLinkTags]);
        this.hideModal(this.thumbModal);
    }

    saveLink(thumb, title, desc, tags) {
        const link = { id: 'l_' + Date.now(), url: this.currentUrl, thumb, title, desc, tags: tags || [], date: Date.now() };
        this.links.unshift(link);
        this.updateStorage();
        this.render();
    }

    editLink(id) {
        const link = this.links.find(l => l.id === id);
        if (!link) return;
        this.editingId = id;
        this.editTitle.value = link.title;
        this.editDesc.value = link.desc;
        this.tempTags = Array.isArray(link.tags) ? [...link.tags] : (Array.isArray(link.actors) ? [...link.actors] : (link.category ? [link.category] : []));
        this.renderFormTags('edit');
        this.editTagsInput.value = '';
        this.selectedThumb = link.thumb;
        this.currentUrl = link.url;
        this.renderEditThumbPicker([link.thumb]);
        this.fetchMetadata(link.url).then(m => this.renderEditThumbPicker(m.images || []));
        this.showModal(this.editModal);
    }

    renderEditThumbPicker(images) {
        const unique = [...new Set([...(images || []), this.selectedThumb].filter(Boolean))];
        this.editThumbPicker.innerHTML = '';
        unique.forEach(img => {
            const div = document.createElement('div');
            div.className = 'thumb-option' + (img === this.selectedThumb ? ' selected' : '');
            div.innerHTML = `<img src="${img}" referrerpolicy="no-referrer">`;
            div.onclick = () => this.selectEditThumb(img);
            const imgEl = div.querySelector('img');
            imgEl.onerror = () => div.remove();
            this.editThumbPicker.appendChild(div);
        });
    }

    selectEditThumb(img) {
        this.selectedThumb = img;
        this.editThumbPicker.querySelectorAll('.thumb-option').forEach(o => {
            o.classList.remove('selected');
            const imgEl = o.querySelector('img');
            if (imgEl && (imgEl.src === img || imgEl.getAttribute('src') === img)) o.classList.add('selected');
        });
    }

    generateScreenshot() {
        const ss = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(this.currentUrl)}?w=${this.currentCrop}`;
        this.selectEditThumb(ss);
        const div = document.createElement('div');
        div.className = 'thumb-option selected';
        div.innerHTML = `<img src="${ss}">`;
        div.onclick = () => this.selectEditThumb(ss);
        this.editThumbPicker.prepend(div);
    }

    saveEdit() {
        const link = this.links.find(l => l.id === this.editingId);
        if (link) {
            // Auto-add any text left in the input
            this.handleAddFormTag('edit');
            link.title = this.editTitle.value;
            link.desc = this.editDesc.value;
            link.tags = [...this.tempTags];
            if (link.actors) delete link.actors; // Clean up legacy key
            link.thumb = this.selectedThumb;
            this.updateStorage();
            this.render();
        }
        this.hideModal(this.editModal);
        this.tempTags = [];
    }

    removeLink(id) {
        const item = this.links.find(l => l.id === id);
        const name = item ? `"${item.title}"` : 'this link';
        if (!confirm(`Are you sure you want to delete ${name}?`)) return;
        this.links = this.links.filter(l => l.id !== id);
        this.updateStorage();
        this.render();
        this.showToast('Item deleted', 'info');
    }

    updateStorage() { localStorage.setItem('vidlinks', JSON.stringify(this.links)); }
    showModal(m) { if (m) m.classList.remove('hidden'); }
    hideModal(m) {
        if (!m) return;
        m.classList.add('hidden');
        if (m === this.movieModal) {
            if (this.movieTrailerIframe) this.movieTrailerIframe.src = '';
            if (this.movieTrailerWrap) this.movieTrailerWrap.classList.add('hidden');
        }
    }

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerText = message;
        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('fade-out');
                setTimeout(() => toast.remove(), 300);
            }
        }, 3000);
    }

    copyLink(url) {
        navigator.clipboard.writeText(url).then(() => this.showToast('Copied'));
    }

    exportWatchlist() {
        if (this.links.length === 0) return this.showToast('Empty', 'error');
        
        try {
            const dataStr = JSON.stringify(this.links, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `sachlink_stash_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showToast('Exported');
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Export failed.', 'error');
        }
    }

    importWatchlist(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (!Array.isArray(imported)) {
                    this.showToast('Invalid backup file. Must be a JSON array.', 'error');
                    return;
                }

                const oldLen = this.links.length;
                // Merge, filtering out duplicates by URL
                const merged = [...imported, ...this.links];
                const seen = new Set();
                this.links = merged.filter(l => {
                    if (!l.url) return false;
                    const normalizedUrl = l.url.trim().toLowerCase();
                    return seen.has(normalizedUrl) ? false : seen.add(normalizedUrl);
                });

                const added = this.links.length - oldLen;
                this.updateStorage();
                this.render();
                
                this.showToast(`+${added} items`);
            } catch (err) {
                console.error('Import parse error:', err);
                this.showToast('Failed to parse file.', 'error');
            } finally {
                // Clear the input so the same file can be imported again if needed
                this.importFileInput.value = '';
            }
        };
        reader.readAsText(file);
    }

    getHostname(url) {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch(e) {
            return 'link';
        }
    }

    getFaviconUrl(url) {
        try {
            const hostname = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
        } catch(e) {
            return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="%23262626"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23aaa" font-family="sans-serif" font-size="20">🌐</text></svg>';
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

    render() {
        if (!this.linkGrid) return;
        
        // Update Tag Bar
        this.updateTagBar();

        let filtered = [...this.links];

        // Search Filter
        if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(l => {
                const titleMatch = l.title?.toLowerCase().includes(q);
                const descMatch = l.desc?.toLowerCase().includes(q);
                const tags = Array.isArray(l.tags) ? l.tags : (Array.isArray(l.actors) ? l.actors : (l.category ? [l.category] : []));
                const tagsMatch = tags.some(t => t.toLowerCase().includes(q));
                return titleMatch || descMatch || tagsMatch;
            });
        }

        // Tag filter
        if (this.activeTag === 'fav') {
            filtered = filtered.filter(l => !!l.isFavorite);
        } else if (this.activeTag === 'watched') {
            filtered = filtered.filter(l => !!l.isWatched);
        } else if (this.activeTag === 'towatch') {
            filtered = filtered.filter(l => !l.isWatched);
        } else if (this.activeTag === 'movie') {
            filtered = filtered.filter(l => {
                const tags = Array.isArray(l.tags) ? l.tags : (Array.isArray(l.actors) ? l.actors : (l.category ? [l.category] : []));
                return tags.includes('movie') || (l.url && l.url.includes('imdb.com/title/'));
            });
        } else if (this.activeTag !== 'all') {
            filtered = filtered.filter(l => {
                const tags = Array.isArray(l.tags) ? l.tags : (Array.isArray(l.actors) ? l.actors : (l.category ? [l.category] : []));
                return tags.includes(this.activeTag);
            });
        }

        // Sorting according to user choice
        if (this.currentSort === 'fav') {
            filtered.sort((a, b) => {
                if (a.isFavorite && !b.isFavorite) return -1;
                if (!a.isFavorite && b.isFavorite) return 1;
                return (b.date || 0) - (a.date || 0);
            });
        } else if (this.currentSort === 'newest') {
            filtered.sort((a, b) => (b.date || 0) - (a.date || 0));
        } else if (this.currentSort === 'oldest') {
            filtered.sort((a, b) => (a.date || 0) - (b.date || 0));
        } else if (this.currentSort === 'alpha') {
            filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        }

        // Update stats counter
        if (this.statsCount) {
            this.statsCount.textContent = this.links.length;
        }

        // Apply View Mode
        if (this.linkGrid) {
            if (this.viewMode === 'compact') {
                this.linkGrid.classList.add('compact-view');
                if (this.viewToggleBtn) this.viewToggleBtn.innerHTML = '<i class="fas fa-table-cells-large"></i>';
            } else {
                this.linkGrid.classList.remove('compact-view');
                if (this.viewToggleBtn) this.viewToggleBtn.innerHTML = '<i class="fas fa-grip"></i>';
            }
        }

        if (filtered.length === 0) {
            const isFiltering = this.activeTag !== 'all' || this.searchQuery.trim();
            this.linkGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="${isFiltering ? 'fas fa-search' : 'fas fa-film'}"></i></div>
                    <div class="empty-title">${isFiltering ? 'No matching items' : 'Watchlist is Empty'}</div>
                    <p class="empty-sub">${isFiltering ? 'Try searching different keywords or switching category tabs.' : 'Paste any URL or search above to save movies & links.'}</p>
                    ${!isFiltering ? `
                    <div class="empty-starter-chips">
                        <button class="starter-chip" onclick="window.vidLinkApp.addDemoItem('https://www.netflix.com', 'Netflix Streaming Hub', ['streaming', 'movie'], 'https://assets.nflxext.com/ffe/siteui/vlv3/9d3533b2-0e2b-40b2-95e0-ecd7979cc88b/a3873901-5b7f-44bc-b959-122340229fda/US-en-20240311-popsignuptwoweeks-perspective_alpha_website_large.jpg')"><i class="fas fa-play"></i> + Netflix</button>
                        <button class="starter-chip" onclick="window.vidLinkApp.addDemoItem('https://www.imdb.com/title/tt0111161/', 'The Shawshank Redemption (1994)', ['movie', 'drama'], 'https://m.media-amazon.com/images/M/MV5BMDFkYTc0MGEtZmNhMC00ZDIzLWFmNTEtODM1ZmRlYWMwMWFmXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_FMjpg_UX1000_.jpg')"><i class="fas fa-film"></i> + Shawshank Redemption</button>
                        <button class="starter-chip" onclick="window.vidLinkApp.addDemoItem('https://www.imdb.com/title/tt1375666/', 'Inception (2010)', ['movie', 'sci-fi'], 'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_FMjpg_UX1000_.jpg')"><i class="fas fa-star" style="color: #f5c518;"></i> + Inception</button>
                        <button class="starter-chip" onclick="window.vidLinkApp.addDemoItem('https://music.youtube.com', 'YouTube Music Hub', ['music'], 'https://lh3.googleusercontent.com/pw/AP1GczOsqq0vP83s4gP40c5fGffZ3J87E6dFvG1N3_l68Xw_xK3pEaWzK8f9=w1200-h630-p')"><i class="fas fa-music"></i> + YT Music</button>
                    </div>` : ''}
                </div>`;
            return;
        }

        const safeStr = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');

        this.linkGrid.innerHTML = filtered.map(l => {
            const tags = Array.isArray(l.tags) ? l.tags : (Array.isArray(l.actors) ? l.actors : (l.category ? [l.category] : []));
            const hostname = this.getHostname(l.url);
            const favicon = this.getFaviconUrl(l.url);
            const relativeTime = this.getRelativeTime(l.date);
            const isMovie = tags.includes('movie') || (l.url && l.url.includes('imdb.com/title/'));
            const isFav = !!l.isFavorite;
            const isWatched = !!l.isWatched;
            const escapedTitle = safeStr(l.title || 'Screen View');
            const escapedThumb = safeStr(l.thumb || '');
            const escapedUrl = safeStr(l.url || '');

            return `
            <div class="card ${isMovie ? 'card-movie-vertical' : ''} ${isFav ? 'is-favorite' : ''} ${isWatched ? 'is-watched' : ''}" data-id="${l.id}">
                <div class="card-img-wrapper" onclick="window.open('${escapedUrl}', '_blank')">
                    <img src="${l.thumb}" class="card-img" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;400&quot; height=&quot;225&quot; viewBox=&quot;0 0 400 225&quot;><rect width=&quot;400&quot; height=&quot;225&quot; fill=&quot;%231a1a1a&quot;/><text x=&quot;50%&quot; y=&quot;50%&quot; dominant-baseline=&quot;middle&quot; text-anchor=&quot;middle&quot; fill=&quot;%23888&quot; font-family=&quot;sans-serif&quot; font-size=&quot;14&quot;>No Image</text></svg>'">
                    <div class="card-top-badges">
                        ${isMovie ? `<span class="badge-tag badge-movie"><i class="fab fa-imdb"></i> MOVIE</span>` : ''}
                        ${isFav ? `<span class="badge-tag badge-starred"><i class="fas fa-star"></i></span>` : ''}
                        ${isWatched ? `<span class="badge-tag badge-watched"><i class="fas fa-check"></i> WATCHED</span>` : ''}
                    </div>
                </div>
                <div class="card-content">
                    <div class="card-header-row">
                        <img src="${favicon}" class="channel-avatar" referrerpolicy="no-referrer" onerror="this.src='https://www.google.com/s2/favicons?sz=64&domain=${hostname}'">
                        <div class="card-text-col">
                            <h3 class="card-title" onclick="window.open('${escapedUrl}', '_blank')" title="${escapedTitle}">${l.title}</h3>
                            <div class="card-metadata">
                                <span class="channel-name" title="${hostname}">${hostname}</span>
                                <span class="metadata-separator">•</span>
                                <span class="upload-date">${relativeTime}</span>
                            </div>
                            <p class="card-desc">${l.desc || ''}</p>
                            <div class="card-tag-tags">
                                ${tags.map(t => `<span class="card-tag-tag" onclick="event.stopPropagation(); window.vidLinkApp.filterByTag('${safeStr(t)}')" title="Filter by tag: ${t}">${t}</span>`).join('')}
                            </div>
                            <div class="card-actions">
                                <button class="btn open-btn" onclick="window.open('${escapedUrl}', '_blank')" title="Open Link">
                                    Open
                                </button>
                                <button class="btn default-btn icon-only btn-fav ${isFav ? 'active' : ''}" onclick="window.vidLinkApp.toggleFavorite('${l.id}')" title="${isFav ? 'Unstar' : 'Star / Pin to Top'}">
                                    <i class="${isFav ? 'fas' : 'far'} fa-star"></i>
                                </button>
                                <button class="btn default-btn icon-only btn-watched ${isWatched ? 'active' : ''}" onclick="window.vidLinkApp.toggleWatched('${l.id}')" title="${isWatched ? 'Mark as Unwatched' : 'Mark as Watched'}">
                                    <i class="fas ${isWatched ? 'fa-check-circle' : 'fa-circle-check'}"></i>
                                </button>
                                ${isMovie ? `
                                <button class="btn default-btn icon-only" onclick="window.vidLinkApp.quickTrailer('${escapedTitle}')" title="Watch Trailer">
                                    <i class="fab fa-youtube"></i>
                                </button>` : ''}
                                <button class="btn default-btn icon-only" onclick="window.vidLinkApp.openLightbox('${escapedThumb}', '${escapedTitle}')" title="Fit to Screen Lightbox">
                                    <i class="fas fa-expand"></i>
                                </button>
                                <button class="btn default-btn icon-only" onclick="window.vidLinkApp.copyLink('${escapedUrl}')" title="Copy URL">
                                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </button>
                                <button class="btn default-btn icon-only" onclick="window.vidLinkApp.editLink('${l.id}')" title="Edit">
                                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                <button class="btn default-btn icon-only delete-btn" onclick="window.vidLinkApp.removeLink('${l.id}')" title="Delete">
                                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;}).join('');
    }

    filterByTag(tag) {
        this.activeTag = tag;
        this.updateActiveNavPill(tag);
        this.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateTagBar() {
        const allTags = this.links.flatMap(l => Array.isArray(l.tags) ? l.tags : (Array.isArray(l.actors) ? l.actors : (l.category ? [l.category] : [])));
        const uniqueTags = [...new Set(allTags)].filter(t => t && t !== 'movie').sort();
        
        const html = [
            `<button class="cat-pill ${this.activeTag === 'all' ? 'active' : ''}" data-tag="all">All</button>`,
            `<button class="cat-pill ${this.activeTag === 'fav' ? 'active' : ''}" data-tag="fav"><i class="fas fa-star" style="color: #f5c518;"></i> Starred</button>`,
            `<button class="cat-pill ${this.activeTag === 'movie' ? 'active' : ''}" data-tag="movie"><i class="fas fa-film"></i> Movies</button>`,
            `<button class="cat-pill ${this.activeTag === 'towatch' ? 'active' : ''}" data-tag="towatch"><i class="far fa-clock"></i> To Watch</button>`,
            `<button class="cat-pill ${this.activeTag === 'watched' ? 'active' : ''}" data-tag="watched"><i class="fas fa-check-circle" style="color: #22c55e;"></i> Watched</button>`,
            ...uniqueTags.map(tag => `<button class="cat-pill ${this.activeTag === tag ? 'active' : ''}" data-tag="${tag}">${tag}</button>`)
        ].join('');
        
        if (this.tagFilter && this.tagFilter.innerHTML !== html) {
            this.tagFilter.innerHTML = html;
        }
    }

    handleAddFormTag(formType) {
        const input = formType === 'add' ? this.addTagsInput : this.editTagsInput;
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
        const list = formType === 'add' ? this.addTagsList : this.editTagsList;
        if (!list) return;
        list.innerHTML = this.tempTags.map((t, i) => `
            <div class="form-actor-tag">
                ${t}
                <button type="button" onclick="window.vidLinkApp.removeFormTag('${formType}', ${i})">×</button>
            </div>
        `).join('');
    }

    triggerMovieSearch(query) {
        clearTimeout(this.searchTimeout);
        if (!this.searchDropdown) return;

        if (!query || query.trim().length < 2) {
            this.searchDropdown.classList.add('hidden');
            return;
        }

        const q = query.toLowerCase().trim();
        if (this.searchCache.has(q)) {
            const cached = this.searchCache.get(q);
            this.renderMovieSuggestions(query, cached);
        } else {
            this.searchTimeout = setTimeout(() => {
                this.fetchImdbSuggestions(query);
            }, 200);
        }
    }

    async fetchImdbSuggestions(query) {
        const q = query.toLowerCase().trim();

        if (this.suggestionAbortController) {
            this.suggestionAbortController.abort();
        }
        this.suggestionAbortController = new AbortController();

        let cleanQuery = q.replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '_');
        if (!cleanQuery) return;

        const firstLetter = cleanQuery.charAt(0);
        const callbackName = `imdb$${cleanQuery}`;
        const url = `https://sg.media-imdb.com/suggests/${firstLetter}/${cleanQuery}.json`;
        const controller = this.suggestionAbortController;

        try {
            const fetchPromise = new Promise((resolve, reject) => {
                let script = document.createElement('script');
                script.src = url;
                script.async = true;

                window[callbackName] = (data) => {
                    cleanup();
                    resolve(data);
                };
                script.onerror = () => {
                    cleanup();
                    reject(new Error("JSONP error"));
                };

                const timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error("JSONP timeout"));
                }, 4000);

                const abortHandler = () => {
                    cleanup();
                    reject(new Error("JSONP aborted"));
                };
                if (controller && controller.signal) {
                    controller.signal.addEventListener('abort', abortHandler);
                }

                function cleanup() {
                    clearTimeout(timeoutId);
                    if (script && script.parentNode) script.parentNode.removeChild(script);
                    delete window[callbackName];
                    if (controller && controller.signal) {
                        controller.signal.removeEventListener('abort', abortHandler);
                    }
                }
                document.head.appendChild(script);
            });

            const data = await fetchPromise;
            let imdbResults = [];
            if (data && Array.isArray(data.d)) {
                imdbResults = data.d.map(m => {
                    let type = 'Movie';
                    if (m.q === 'TV series' || m.q === 'TV mini-series') type = 'TV Series';

                    return {
                        title: m.l || 'Untitled',
                        year: m.y || '—',
                        poster: (m.i && m.i[0]) ? m.i[0] : '',
                        imdbId: m.id || '',
                        actors: m.s || 'Cast details unavailable',
                        type: type
                    };
                }).filter(m => m.imdbId && m.imdbId.startsWith('tt')).slice(0, 6);
            }

            if (this.searchCache.size >= 50) {
                const firstKey = this.searchCache.keys().next().value;
                this.searchCache.delete(firstKey);
            }
            this.searchCache.set(q, imdbResults);

            this.renderMovieSuggestions(query, imdbResults);
        } catch (e) {
            // Ignore abort errors
        }
    }

    renderMovieSuggestions(query, imdbResults) {
        if (!this.searchDropdown) return;
        if (!imdbResults || imdbResults.length === 0) {
            this.searchDropdown.classList.add('hidden');
            return;
        }

        this.searchDropdown.innerHTML = `
            <div style="padding: 6px 10px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px;">
                <i class="fab fa-imdb" style="color: #f5c518;"></i> Movies &amp; Shows Found
            </div>
            ${imdbResults.map(movie => `
                <div class="search-item" onclick="window.vidLinkApp.openMovieDetailsByData('${encodeURIComponent(JSON.stringify(movie))}')">
                    <img src="${movie.poster || 'data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;300&quot; height=&quot;450&quot; viewBox=&quot;0 0 300 450&quot;><rect width=&quot;300&quot; height=&quot;450&quot; fill=&quot;%231a1a1a&quot;/><text x=&quot;50%&quot; y=&quot;50%&quot; dominant-baseline=&quot;middle&quot; text-anchor=&quot;middle&quot; fill=&quot;%23888&quot; font-family=&quot;sans-serif&quot; font-size=&quot;16&quot;>No Poster</text></svg>'}" width="30" height="45" loading="lazy">
                    <div style="flex:1; min-width:0;">
                        <h4>${movie.title}</h4>
                        <p>${movie.year} · ${movie.type} · ${movie.actors}</p>
                    </div>
                </div>
            `).join('')}
        `;
        this.searchDropdown.classList.remove('hidden');
    }

    openMovieDetailsByData(jsonStr) {
        try {
            if (this.searchDropdown) this.searchDropdown.classList.add('hidden');
            const movie = JSON.parse(decodeURIComponent(jsonStr));
            this.openMovieDetails(movie);
        } catch (e) {
            console.error("Error opening movie details:", e);
        }
    }

    async fetchTrailerId(title, year, imdbId) {
        // 1. Try Cinemeta API if IMDb ID is available
        if (imdbId) {
            try {
                const res = await this.fetchWithTimeout(`https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`, {}, 3000);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data?.meta?.trailers) && data.meta.trailers.length > 0) {
                        const tr = data.meta.trailers[0];
                        const yid = tr.source || tr.ytId;
                        if (yid) return yid;
                    }
                }
            } catch (e) {}
        }

        // 2. Try scraping via allorigins proxy
        try {
            const query = `${title} ${year || ''} official trailer`;
            const url = `https://api.allorigins.win/get?url=${encodeURIComponent('https://www.youtube.com/results?search_query=' + encodeURIComponent(query))}`;
            const response = await this.fetchWithTimeout(url, {}, 4000);
            if (response.ok) {
                const data = await response.json();
                const html = data.contents;
                const regex = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
                let match;
                const ids = [];
                while ((match = regex.exec(html)) !== null) {
                    ids.push(match[1]);
                }
                const uniqueIds = [...new Set(ids)];
                if (uniqueIds.length > 0) return uniqueIds[0];
            }
        } catch (e) {}

        return null;
    }

    openMovieDetails(movie) {
        if (!this.movieModal) return;

        this.movieModalTitle.textContent = movie.title;
        this.movieModalPoster.src = movie.poster || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="%231a1a1a"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23888" font-family="sans-serif" font-size="16">No Poster</text></svg>';
        this.movieModalYear.textContent = `${movie.year} · ${movie.imdbId}`;
        this.movieModalType.textContent = movie.type;
        this.movieModalCast.textContent = `Cast: ${movie.actors}`;
        this.openImdbPageBtn.href = `https://www.imdb.com/title/${movie.imdbId}/`;

        // Save Movie to Watchlist Callback
        this.saveMovieToWatchlistBtn.onclick = () => {
            const movieUrl = `https://www.imdb.com/title/${movie.imdbId}/`;
            const existing = this.links.find(l => l.url === movieUrl);
            if (existing) {
                this.showToast('Saved already', 'error');
            } else {
                const link = {
                    id: 'l_' + Date.now(),
                    url: movieUrl,
                    thumb: movie.poster || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="%231a1a1a"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23888" font-family="sans-serif" font-size="16">No Poster</text></svg>',
                    title: `${movie.title} (${movie.year})`,
                    desc: `Starring: ${movie.actors}`,
                    tags: ['movie'],
                    date: Date.now(),
                    isFavorite: false,
                    isWatched: false
                };
                this.links.unshift(link);
                this.updateStorage();
                this.render();
                this.showToast(`Saved "${movie.title}"`, 'success');
            }
            this.hideModal(this.movieModal);
        };

        // Fetch Official YouTube HD Trailer with zero-failure fallback
        if (this.movieTrailerWrap && this.movieTrailerIframe) {
            this.movieTrailerWrap.classList.add('hidden');
            this.movieTrailerIframe.src = '';
            this.fetchTrailerId(movie.title, movie.year, movie.imdbId).then(vidId => {
                if (vidId) {
                    this.movieTrailerIframe.src = `https://www.youtube-nocookie.com/embed/${vidId}?autoplay=0&rel=0`;
                    this.movieTrailerWrap.classList.remove('hidden');
                } else {
                    const fallbackSearch = `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(movie.title + ' ' + (movie.year || '') + ' official trailer')}`;
                    this.movieTrailerIframe.src = fallbackSearch;
                    this.movieTrailerWrap.classList.remove('hidden');
                }
            });
        }

        this.showModal(this.movieModal);
    }

    updateActiveNavPill(tag) {
        if (this.tagFilter) {
            this.tagFilter.querySelectorAll('.cat-pill').forEach(p => {
                if (p.dataset.tag === tag) p.classList.add('active');
                else p.classList.remove('active');
            });
        }
        if (this.navAllBtn && this.navMoviesBtn) {
            this.navAllBtn.classList.toggle('active', tag === 'all');
            this.navMoviesBtn.classList.toggle('active', tag === 'movie');
        }
    }

    addDemoItem(url, title, tags = ['movie'], thumb = 'icon.svg') {
        const existing = this.links.find(l => l.url === url);
        if (existing) {
            this.showToast('Already in your watchlist', 'info');
            return;
        }
        const item = {
            id: 'l_' + Date.now(),
            url: url,
            thumb: thumb || 'icon.svg',
            title: title,
            desc: `Quick launch link for ${title}`,
            tags: tags,
            date: Date.now(),
            isFavorite: false,
            isWatched: false
        };
        this.links.unshift(item);
        this.updateStorage();
        this.render();
        this.showToast(`Added ${title}!`, 'success');
    }

    async quickTrailer(title) {
        this.showToast(`Finding trailer for "${title}"...`, 'info');
        const vidId = await this.fetchTrailerId(title);
        if (this.movieTrailerWrap && this.movieTrailerIframe) {
            this.movieTrailerIframe.src = vidId 
                ? `https://www.youtube-nocookie.com/embed/${vidId}?autoplay=1&rel=0`
                : `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(title + ' official trailer')}&autoplay=1`;
            this.movieTrailerWrap.classList.remove('hidden');
            if (this.movieModalTitle) this.movieModalTitle.textContent = title;
            if (this.movieModalPoster) this.movieModalPoster.src = 'icon.svg';
            if (this.movieModalYear) this.movieModalYear.textContent = 'Official Trailer';
            if (this.movieModalCast) this.movieModalCast.textContent = '';
            if (this.movieModalType) this.movieModalType.textContent = 'Trailer';
            this.showModal(this.movieModal);
        } else {
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' official trailer')}`, '_blank');
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DAILY INTERACTIVE FEATURES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    toggleFavorite(id) {
        const link = this.links.find(l => l.id === id);
        if (!link) return;
        link.isFavorite = !link.isFavorite;
        this.updateStorage();
        this.render();
        this.showToast(link.isFavorite ? 'Starred link ★' : 'Removed from Starred', 'info');
    }

    toggleWatched(id) {
        const link = this.links.find(l => l.id === id);
        if (!link) return;
        link.isWatched = !link.isWatched;
        this.updateStorage();
        this.render();
        this.showToast(link.isWatched ? 'Marked as Watched ✓' : 'Marked as Unwatched', 'info');
    }

    startLiveClock() {
        this.updateLiveClock();
        setInterval(() => this.updateLiveClock(), 1000);
    }

    updateLiveClock() {
        const now = new Date();
        const hrs = now.getHours();
        const mins = String(now.getMinutes()).padStart(2, '0');
        const secs = String(now.getSeconds()).padStart(2, '0');
        const timeStr = `${String(hrs).padStart(2, '0')}:${mins}:${secs}`;
        
        let greeting = 'Welcome, Sachin';
        let icon = '✨';
        if (hrs >= 5 && hrs < 12) {
            greeting = 'Good morning, Sachin';
            icon = '🌅';
        } else if (hrs >= 12 && hrs < 17) {
            greeting = 'Good afternoon, Sachin';
            icon = '☀️';
        } else if (hrs >= 17 && hrs < 22) {
            greeting = 'Good evening, Sachin';
            icon = '🌆';
        } else {
            greeting = 'Good night, Sachin';
            icon = '🌙';
        }

        const options = { weekday: 'long', month: 'short', day: 'numeric' };
        const dateStr = now.toLocaleDateString(undefined, options);

        const clockEl = document.getElementById('liveClockText');
        const dateEl = document.getElementById('liveDateText');
        const greetEl = document.getElementById('greetingText');
        const iconEl = document.getElementById('greetingTimeIcon');

        if (clockEl) clockEl.textContent = timeStr;
        if (dateEl) dateEl.textContent = dateStr;
        if (greetEl) greetEl.textContent = greeting;
        if (iconEl) iconEl.textContent = icon;
    }

    initDailyWidgets() {
        this.updateQuoteDisplay();
    }

    updateQuoteDisplay() {
        const q = this.cineQuotes[this.quoteIndex];
        const textEl = document.getElementById('dailyQuoteText');
        const authorEl = document.getElementById('dailyQuoteAuthor');
        if (textEl && q) textEl.textContent = q.text;
        if (authorEl && q) authorEl.textContent = `— ${q.author}`;
    }

    nextQuote() {
        this.quoteIndex = (this.quoteIndex + 1) % this.cineQuotes.length;
        this.updateQuoteDisplay();
    }

    renderQuickTiles() {
        if (!this.quickTilesContainer) return;
        const tilesHtml = this.customTiles.map((tile, idx) => `
            <div class="tile-wrapper">
                <a href="${tile.url}" target="_blank" rel="noopener noreferrer" class="tile" title="${tile.name}">
                    <i class="${tile.icon || 'fas fa-link'}"></i> ${tile.name}
                </a>
                <button class="tile-delete-btn" onclick="window.vidLinkApp.removeCustomTile(${idx})" title="Remove Shortcut">×</button>
            </div>
        `).join('');

        this.quickTilesContainer.innerHTML = `
            ${tilesHtml}
            <button class="tile tile-add-btn" onclick="window.vidLinkApp.openAddTileModal()" title="Add Custom Shortcut">
                <i class="fas fa-plus"></i> Add
            </button>
        `;
    }

    openAddTileModal() {
        if (this.customTileTitle) this.customTileTitle.value = '';
        if (this.customTileUrl) this.customTileUrl.value = '';
        this.showModal(this.customTileModal);
        if (this.customTileTitle) this.customTileTitle.focus();
    }

    saveCustomTile() {
        const title = this.customTileTitle?.value.trim();
        let url = this.customTileUrl?.value.trim();
        if (!title || !url) {
            this.showToast('Please enter both title and URL', 'error');
            return;
        }
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        this.customTiles.push({
            name: title,
            url: url,
            icon: 'fas fa-arrow-up-right-from-square'
        });
        localStorage.setItem('sachin_custom_tiles', JSON.stringify(this.customTiles));
        this.renderQuickTiles();
        this.hideModal(this.customTileModal);
        this.showToast(`Added shortcut "${title}"!`, 'success');
    }

    removeCustomTile(index) {
        const removed = this.customTiles.splice(index, 1);
        localStorage.setItem('sachin_custom_tiles', JSON.stringify(this.customTiles));
        this.renderQuickTiles();
        if (removed && removed[0]) {
            this.showToast(`Removed "${removed[0].name}"`, 'info');
        }
    }

    rollSurprisePick() {
        if (!this.links || this.links.length === 0) {
            this.showToast('Watchlist is empty! Save some movies or links first.', 'info');
            return;
        }

        const unwatched = this.links.filter(l => !l.isWatched);
        const pool = unwatched.length > 0 ? unwatched : this.links;
        const randomItem = pool[Math.floor(Math.random() * pool.length)];

        this.currentSurpriseItem = randomItem;
        this.renderSurpriseCard(randomItem);
        this.showModal(this.surpriseModal);
    }

    renderSurpriseCard(item) {
        if (!this.surpriseCardContainer) return;
        const isMovie = (item.tags || []).includes('movie') || (item.url && item.url.includes('imdb.com/title/'));
        const hostname = this.getHostname(item.url);
        const tags = Array.isArray(item.tags) ? item.tags : [];

        this.surpriseCardContainer.innerHTML = `
            <div class="surprise-inner-card">
                <img src="${item.thumb || 'icon.svg'}" class="surprise-inner-thumb" onerror="this.src='icon.svg'">
                <div class="surprise-inner-details">
                    <h3 class="surprise-inner-title">${item.title}</h3>
                    <div class="surprise-inner-meta">
                        <span><i class="fas fa-globe"></i> ${hostname}</span>
                        ${isMovie ? ' • <span style="color: #f5c518; font-weight: 700;"><i class="fab fa-imdb"></i> Movie</span>' : ''}
                        ${item.isWatched ? ' • <span style="color: #22c55e;"><i class="fas fa-check"></i> Watched</span>' : ''}
                    </div>
                    <p class="surprise-inner-desc">${item.desc || 'No description provided.'}</p>
                    <div class="surprise-inner-tags">
                        ${tags.map(t => `<span class="card-tag-tag">${t}</span>`).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    initScratchpad() {
        if (!this.scratchpadInput) return;
        this.scratchpadInput.value = localStorage.getItem('sachin_scratchpad') || '';
        this.updateScratchpadStats();
        this.scratchpadInput.addEventListener('input', () => {
            localStorage.setItem('sachin_scratchpad', this.scratchpadInput.value);
            this.updateScratchpadStats();
        });
    }

    openScratchpad() {
        if (this.scratchpadInput) {
            this.scratchpadInput.value = localStorage.getItem('sachin_scratchpad') || '';
            this.updateScratchpadStats();
        }
        this.showModal(this.scratchpadModal);
        setTimeout(() => this.scratchpadInput?.focus(), 100);
    }

    updateScratchpadStats() {
        if (!this.scratchpadStats || !this.scratchpadInput) return;
        const text = this.scratchpadInput.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        const chars = text.length;
        this.scratchpadStats.textContent = `${words} words · ${chars} chars`;
    }

    initUrlParams() {
        try {
            const params = new URLSearchParams(window.location.search);
            const action = params.get('action');
            const filter = params.get('filter');
            const sharedUrl = params.get('url') || params.get('text');

            if (filter) {
                this.activeTag = filter;
                this.updateActiveNavPill(filter);
            }

            if (sharedUrl && this.isUrl(sharedUrl)) {
                if (this.searchInput) this.searchInput.value = sharedUrl;
                setTimeout(() => this.handleAddLink(), 300);
            } else if (action === 'search') {
                setTimeout(() => {
                    if (this.searchInput) {
                        this.searchInput.focus();
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }, 200);
            }
        } catch (e) {
            console.error('URL params init error:', e);
        }
    }

    openShortcuts() {
        this.showModal(this.shortcutsModal);
    }
}

window.vidLinkApp = new VidLinkApp();

