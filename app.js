/**
 * SachTube Premium Links Vault
 * YouTube-style Minimalist Layout, Dynamic Favicons, Real-time Search
 */
class VidLinkApp {
    constructor() {
        this.links = JSON.parse(localStorage.getItem('vidlinks')) || [];
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

        this.initElements();
        this.initEvents();
        this.setTheme(this.theme);
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
        this.saveMovieToVaultBtn = document.getElementById('saveMovieToVaultBtn');
        this.openImdbPageBtn = document.getElementById('openImdbPageBtn');
        this.closeMovieModalBtn = document.getElementById('closeMovieModal');

        this.lightboxModal = document.getElementById('lightboxModal');
        this.lightboxImg = document.getElementById('lightboxImg');
        this.lightboxTitle = document.getElementById('lightboxTitle');
        this.lightboxFitToggleBtn = document.getElementById('lightboxFitToggleBtn');
        this.closeLightboxBtn = document.getElementById('closeLightboxBtn');

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
            if (e.key === 'Escape') this.closeAllModals();
        });

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

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.searchDropdown && !e.target.closest('.add-section')) {
                this.searchDropdown.classList.add('hidden');
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

        if (this.exportBtn) this.exportBtn.addEventListener('click', () => this.exportVault());
        if (this.importBtn) this.importBtn.addEventListener('click', () => {
            if (this.importFileInput) this.importFileInput.click();
        });
        if (this.importFileInput) this.importFileInput.addEventListener('change', (e) => this.importVault(e));

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
        [this.thumbModal, this.editModal, this.movieModal, this.lightboxModal].forEach(m => {
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
        let results = {
            title: url,
            description: 'Fetching metadata...',
            images: [],
            fallback: `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`,
            url: url,
            tags: [],
            isScreenshot: false
        };

        const resolveUrl = (relative) => {
            try { return new URL(relative, url).href; } catch (e) { return relative; }
        };

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 1. DEDICATED EXTRACTORS (Zero-CORS, Fast, High Precision)
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
                }
            } catch (e) {}

            results.images = [
                `https://i.ytimg.com/vi/${vidId}/maxresdefault.jpg`,
                `https://i.ytimg.com/vi/${vidId}/sddefault.jpg`,
                `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
                `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`
            ];
            results.tags = ['video', 'youtube'];
            return results;
        }

        // B. IMDb Movie/TV Series Direct JSONP Extractor
        const imdbMatch = url.match(/imdb\.com\/title\/(tt\d+)/i);
        if (imdbMatch && imdbMatch[1]) {
            const ttId = imdbMatch[1];
            try {
                const imdbData = await new Promise((resolve, reject) => {
                    const callbackName = `imdb$${ttId}`;
                    const script = document.createElement('script');
                    script.src = `https://sg.media-imdb.com/suggests/${ttId.charAt(0)}/${ttId}.json`;
                    script.async = true;
                    const timer = setTimeout(() => { cleanup(); reject(new Error('IMDb timeout')); }, 4500);
                    window[callbackName] = (data) => { cleanup(); resolve(data); };
                    script.onerror = () => { cleanup(); reject(new Error('IMDb script error')); };
                    function cleanup() {
                        clearTimeout(timer);
                        if (script.parentNode) script.parentNode.removeChild(script);
                        delete window[callbackName];
                    }
                    document.head.appendChild(script);
                });

                if (imdbData?.d && imdbData.d.length > 0) {
                    const item = imdbData.d[0];
                    const year = item.y || item.tl || '';
                    results.title = year ? `${item.l} (${year})` : item.l;
                    results.description = item.s ? `Starring: ${item.s}` : 'IMDb Title';
                    if (item.i && item.i[0]) results.images.push(item.i[0]);
                    results.tags = ['movie'];
                    return results;
                }
            } catch (e) {
                console.warn('IMDb direct extract error:', e);
            }
        }

        // C. Spotify (Tracks, Albums, Playlists, Artists, Shows, Episodes)
        if (/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/i.test(url)) {
            try {
                const res = await this.fetchWithTimeout(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {}, 4000);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title) results.title = this.cleanTitle(data.title, 'Spotify');
                    results.description = `${data.provider_name || 'Spotify'} • Music`;
                    if (data.thumbnail_url) results.images.push(data.thumbnail_url);
                    results.tags = ['music', 'spotify'];
                    return results;
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
                    if (data.thumbnail_url) results.images.push(data.thumbnail_url);
                    results.tags = ['music', 'audio'];
                    return results;
                }
            } catch (e) {}
        }

        // E. Wikipedia REST Summary API
        const wikiMatch = url.match(/([a-z]+)\.wikipedia\.org\/wiki\/([^?#]+)/i);
        if (wikiMatch) {
            const [, lang, pageSlug] = wikiMatch;
            try {
                const res = await this.fetchWithTimeout(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${pageSlug}`, {}, 4500);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title) results.title = data.title;
                    if (data.extract) results.description = data.extract;
                    if (data.originalimage?.source) results.images.push(data.originalimage.source);
                    if (data.thumbnail?.source) results.images.push(data.thumbnail.source);
                    results.tags = ['wiki', 'article'];
                    return results;
                }
            } catch (e) {}
        }

        // F. GitHub Repositories
        const ghMatch = url.match(/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/i);
        if (ghMatch) {
            const [, owner, repo] = ghMatch;
            const cleanRepo = repo.replace(/\.git$/i, '');
            results.images.push(`https://opengraph.githubassets.com/1/${owner}/${cleanRepo}`);
            try {
                const res = await this.fetchWithTimeout(`https://api.github.com/repos/${owner}/${cleanRepo}`, {
                    headers: { 'Accept': 'application/vnd.github.v3+json' }
                }, 4000);
                if (res.ok) {
                    const data = await res.json();
                    results.title = data.full_name || `${owner}/${cleanRepo}`;
                    results.description = data.description || 'GitHub Repository';
                    if (data.owner?.avatar_url) results.images.push(data.owner.avatar_url);
                }
            } catch (e) {}
            results.tags = ['code', 'github'];
            return results;
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 2. PARALLEL UNIVERSAL ENGINES (For Any Web Page)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 1. Microlink Open Graph Engine
        const microlinkPromise = this.fetchWithTimeout(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, {}, 5000)
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success' && data.data) {
                    const m = data.data;
                    if (m.title && results.title === url) results.title = this.cleanTitle(m.title);
                    if (m.description && (!results.description || results.description === 'Fetching metadata...')) {
                        results.description = this.decodeHtml(m.description);
                    }
                    if (m.image?.url) results.images.push(m.image.url);
                    if (m.logo?.url) results.images.push(m.logo.url);
                }
            }).catch(() => {});

        // 2. Jina AI Fast Reader Engine
        const jinaPromise = this.fetchWithTimeout(`https://r.jina.ai/${url}`, {
            headers: { 'Accept': 'application/json' }
        }, 5000)
            .then(res => res.json())
            .then(res => {
                const data = res?.data;
                if (data) {
                    if (data.title && results.title === url) results.title = this.cleanTitle(data.title);
                    if (data.description && (!results.description || results.description === 'Fetching metadata...')) {
                        results.description = this.decodeHtml(data.description);
                    }
                }
            }).catch(() => {});

        // 3. NoEmbed Generic oEmbed Provider
        const noembedPromise = this.fetchWithTimeout(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, {}, 4000)
            .then(res => res.json())
            .then(data => {
                if (data.title && results.title === url) results.title = this.cleanTitle(data.title);
                if (data.author_name && (!results.description || results.description === 'Fetching metadata...')) {
                    results.description = `By ${data.author_name}`;
                }
                if (data.thumbnail_url) results.images.push(data.thumbnail_url);
            }).catch(() => {});

        // 4. AllOrigins HTML Parser (Deep JSON-LD & OG tags)
        const alloriginsPromise = this.fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {}, 5000)
            .then(res => res.json())
            .then(data => {
                if (!data?.contents) return;
                const doc = new DOMParser().parseFromString(data.contents, 'text/html');
                const getM = (s) => doc.querySelector(`meta[property="${s}"], meta[name="${s}"]`)?.getAttribute('content');

                // JSON-LD Structured Data
                try {
                    const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
                    for (const s of ldScripts) {
                        const parsed = JSON.parse(s.textContent.trim());
                        const item = Array.isArray(parsed) ? parsed[0] : (parsed['@graph'] ? parsed['@graph'][0] : parsed);
                        if (item) {
                            const ldTitle = item.headline || item.name;
                            const ldDesc = item.description;
                            const ldImg = typeof item.image === 'string' ? item.image : (item.image?.url || item.thumbnailUrl);
                            if (ldTitle && results.title === url) results.title = this.cleanTitle(ldTitle);
                            if (ldDesc && (!results.description || results.description === 'Fetching metadata...')) {
                                results.description = this.decodeHtml(ldDesc);
                            }
                            if (ldImg) results.images.push(resolveUrl(ldImg));
                            if (results.title !== url) break;
                        }
                    }
                } catch(e) {}

                const title = getM('og:title') || getM('twitter:title') || doc.querySelector('[itemprop="name"]')?.getAttribute('content') || doc.title;
                if (title && results.title === url) results.title = this.cleanTitle(title);

                const desc = getM('og:description') || getM('twitter:description') || doc.querySelector('[itemprop="description"]')?.getAttribute('content') || getM('description');
                if (desc && (!results.description || results.description === 'Fetching metadata...')) {
                    results.description = this.decodeHtml(desc);
                }

                const og = getM('og:image:secure_url') || getM('og:image') || getM('twitter:image') || getM('twitter:image:src') || doc.querySelector('[itemprop="image"]')?.getAttribute('content');
                if (og) results.images.push(resolveUrl(og));

                ['apple-touch-icon', 'icon', 'shortcut icon'].forEach(rel => {
                    const href = doc.querySelector(`link[rel="${rel}"]`)?.getAttribute('href');
                    if (href) results.images.push(resolveUrl(href));
                });
            }).catch(() => {});

        await Promise.allSettled([microlinkPromise, jinaPromise, noembedPromise, alloriginsPromise]);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 3. SMART AUTOMATIC CATEGORY TAGS
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const host = this.getHostname(url).toLowerCase();
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
        // 4. CLEANUP & FALLBACKS
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (!results.title || results.title === url) {
            try {
                results.title = new URL(url).hostname.replace('www.', '');
            } catch(e) {}
        }

        if (!results.description || results.description === 'Fetching metadata...') {
            results.description = `Saved link from ${this.getHostname(url)}`;
        }

        // Add Google S2 HD Favicon and DuckDuckGo Favicon as fallback icon options
        try {
            const u = new URL(url);
            results.images.push(`https://www.google.com/s2/favicons?sz=128&domain=${u.hostname}`);
            results.images.push(`https://icons.duckduckgo.com/ip3/${u.hostname}.ico`);
        } catch(e) {}

        // Deduplicate and filter images
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
            this.thumbStatus.innerText = "Select cover image:";
            this.thumbStatus.style.color = "#ccc";
        }

        allImages.forEach((img, index) => {
            const div = document.createElement('div');
            div.className = 'thumb-option' + (index === 0 ? ' selected' : '');
            div.innerHTML = `<img src="${img}" loading="lazy">`;
            
            const imgEl = div.querySelector('img');
            imgEl.onerror = () => {
                if (img.includes('maxresdefault.jpg')) {
                    imgEl.src = img.replace('maxresdefault.jpg', 'hqdefault.jpg');
                    return;
                }
                div.remove();
                if (!this.selectedThumb || this.selectedThumb === img) {
                    const next = this.thumbPicker.querySelector('.thumb-option');
                    if (next) {
                        next.classList.add('selected');
                        this.selectedThumb = next.querySelector('img')?.src || '';
                    }
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
        this.showModal(this.thumbModal);
    }

    confirmThumbnail() {
        this.saveLink(this.selectedThumb, this.currentMetadata.title, this.currentMetadata.description, [...this.currentLinkTags]);
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
        const unique = [...new Set([...(images || []), this.selectedThumb])];
        this.editThumbPicker.innerHTML = unique.map(img => {
            const escapedImg = img.replace(/'/g, "\\'");
            return `
                <div class="thumb-option ${img === this.selectedThumb ? 'selected' : ''}" onclick="window.vidLinkApp.selectEditThumb('${escapedImg}')">
                    <img src="${img}">
                </div>
            `;
        }).join('');
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
        this.links = this.links.filter(l => l.id !== id);
        this.updateStorage();
        this.render();
        this.showToast('Deleted', 'success');
    }

    updateStorage() { localStorage.setItem('vidlinks', JSON.stringify(this.links)); }
    showModal(m) { if (m) m.classList.remove('hidden'); }
    hideModal(m) { if (m) m.classList.add('hidden'); }

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

    exportVault() {
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

    importVault(e) {
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
        if (this.activeTag !== 'all') {
            filtered = filtered.filter(l => {
                const tags = Array.isArray(l.tags) ? l.tags : (Array.isArray(l.actors) ? l.actors : (l.category ? [l.category] : []));
                return tags.includes(this.activeTag);
            });
        }

        // Sorting (Always Newest First)
        filtered.sort((a, b) => (b.date || 0) - (a.date || 0));

        if (filtered.length === 0) {
            const isFiltering = this.activeTag !== 'all' || this.searchQuery.trim();
            this.linkGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="${isFiltering ? 'fas fa-search' : 'fas fa-film'}"></i></div>
                    <div class="empty-title">${isFiltering ? 'No results found' : 'Vault is Empty'}</div>
                    <p class="empty-sub">${isFiltering ? 'Try searching for different keywords or tag filters.' : 'Paste any URL or search above to save movies & links.'}</p>
                </div>`;
            return;
        }

        this.linkGrid.innerHTML = filtered.map(l => {
            const tags = Array.isArray(l.tags) ? l.tags : (Array.isArray(l.actors) ? l.actors : (l.category ? [l.category] : []));
            const hostname = this.getHostname(l.url);
            const favicon = this.getFaviconUrl(l.url);
            const relativeTime = this.getRelativeTime(l.date);
            const isMovie = tags.includes('movie') || (l.url && l.url.includes('imdb.com/title/'));
            const escapedTitle = (l.title || 'Screen View').replace(/'/g, "\\'");
            const escapedThumb = (l.thumb || '').replace(/'/g, "\\'");

            return `
            <div class="card ${isMovie ? 'card-movie-vertical' : ''}" data-id="${l.id}">
                <div class="card-img-wrapper" onclick="window.open('${l.url}', '_blank')">
                    <img src="${l.thumb}" class="card-img" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;400&quot; height=&quot;225&quot; viewBox=&quot;0 0 400 225&quot;><rect width=&quot;400&quot; height=&quot;225&quot; fill=&quot;%231a1a1a&quot;/><text x=&quot;50%&quot; y=&quot;50%&quot; dominant-baseline=&quot;middle&quot; text-anchor=&quot;middle&quot; fill=&quot;%23888&quot; font-family=&quot;sans-serif&quot; font-size=&quot;14&quot;>No Image</text></svg>'">
                    ${isMovie ? `<span style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.75); color: #f5c518; padding: 2px 8px; border-radius: 6px; font-size: 0.68rem; font-weight: 800; backdrop-filter: blur(4px);"><i class="fab fa-imdb"></i> MOVIE</span>` : ''}
                </div>
                <div class="card-content">
                    <div class="card-header-row">
                        <img src="${favicon}" class="channel-avatar" onerror="this.src='https://via.placeholder.com/64?text=L'">
                        <div class="card-text-col">
                            <h3 class="card-title" onclick="window.open('${l.url}', '_blank')" title="${l.title}">${l.title}</h3>
                            <div class="card-metadata">
                                <span class="channel-name" title="${hostname}">${hostname}</span>
                                <span class="metadata-separator">•</span>
                                <span class="upload-date">${relativeTime}</span>
                            </div>
                            <p class="card-desc">${l.desc}</p>
                            <div class="card-tag-tags">
                                ${tags.map(t => `<span class="card-tag-tag">${t}</span>`).join('')}
                            </div>
                            <div class="card-actions">
                                <button class="btn open-btn" onclick="window.open('${l.url}', '_blank')" title="Open">
                                    Open
                                </button>
                                <button class="btn default-btn icon-only" onclick="window.vidLinkApp.openLightbox('${escapedThumb}', '${escapedTitle}')" title="Fit to Screen Lightbox">
                                    <i class="fas fa-expand"></i>
                                </button>
                                <button class="btn default-btn icon-only" onclick="window.vidLinkApp.copyLink('${l.url}')" title="Copy URL">
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

    updateTagBar() {
        const allTags = this.links.flatMap(l => Array.isArray(l.tags) ? l.tags : (Array.isArray(l.actors) ? l.actors : (l.category ? [l.category] : [])));
        const uniqueTags = [...new Set(allTags)].filter(Boolean).sort();
        
        const html = [
            `<button class="cat-pill ${this.activeTag === 'all' ? 'active' : ''}" data-tag="all">All Tags</button>`,
            ...uniqueTags.map(tag => `<button class="cat-pill ${this.activeTag === tag ? 'active' : ''}" data-tag="${tag}">${tag}</button>`)
        ].join('');
        
        if (this.tagFilter.innerHTML !== html) {
            this.tagFilter.innerHTML = html;
        }
    }

    handleAddFormTag(formType) {
        const input = formType === 'add' ? this.addTagsInput : this.editTagsInput;
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
            return null;
        }
    }

    openMovieDetails(movie) {
        if (!this.movieModal) return;

        this.movieModalTitle.textContent = movie.title;
        this.movieModalPoster.src = movie.poster || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="%231a1a1a"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23888" font-family="sans-serif" font-size="16">No Poster</text></svg>';
        this.movieModalYear.textContent = `${movie.year} · ${movie.imdbId}`;
        this.movieModalType.textContent = movie.type;
        this.movieModalCast.textContent = `Cast: ${movie.actors}`;
        this.openImdbPageBtn.href = `https://www.imdb.com/title/${movie.imdbId}/`;

        // Save Movie to Vault Callback
        this.saveMovieToVaultBtn.onclick = () => {
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
                    date: Date.now()
                };
                this.links.unshift(link);
                this.updateStorage();
                this.render();
                this.showToast(`Saved "${movie.title}"`, 'success');
            }
            this.hideModal(this.movieModal);
        };

        // Fetch Official YouTube HD Trailer
        if (this.movieTrailerWrap && this.movieTrailerIframe) {
            this.movieTrailerWrap.classList.add('hidden');
            this.movieTrailerIframe.src = '';
            this.fetchTrailerId(movie.title, movie.year).then(vidId => {
                if (vidId) {
                    this.movieTrailerIframe.src = `https://www.youtube.com/embed/${vidId}?autoplay=0&rel=0`;
                    this.movieTrailerWrap.classList.remove('hidden');
                }
            });
        }

        this.showModal(this.movieModal);
    }
}

window.vidLinkApp = new VidLinkApp();

