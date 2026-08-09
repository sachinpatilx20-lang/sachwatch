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
        this.theme = localStorage.getItem('sachin_theme') || 'light';
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
        this.urlInput = document.getElementById('urlInput');
        this.addBtn = document.getElementById('addBtn');
        this.linkGrid = document.getElementById('linkGrid');
        this.loader = document.getElementById('loader');
        
        // Search Bar
        this.searchInput = document.getElementById('searchInput');
        this.searchClearBtn = document.getElementById('searchClearBtn');
        this.searchBtn = document.getElementById('searchBtn');

        // Modals
        this.thumbModal = document.getElementById('thumbModal');
        this.thumbPicker = document.getElementById('thumbPicker');
        this.thumbStatus = document.getElementById('thumbStatus');
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

        this.searchCache = new Map();
        this.searchTimeout = null;
        this.suggestionAbortController = null;
    }

    initEvents() {
        this.addBtn.addEventListener('click', () => this.handleAddLink());
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleAddLink();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeAllModals();
        });

        // Search Handlers & IMDb Live Movie Suggestions
        this.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            if (this.searchQuery.trim()) {
                this.searchClearBtn.classList.remove('hidden');
            } else {
                this.searchClearBtn.classList.add('hidden');
                if (this.searchDropdown) this.searchDropdown.classList.add('hidden');
            }
            this.render();
            this.triggerMovieSearch(this.searchQuery);
        });

        this.searchClearBtn.addEventListener('click', () => {
            this.searchInput.value = '';
            this.searchQuery = '';
            this.searchClearBtn.classList.add('hidden');
            if (this.searchDropdown) this.searchDropdown.classList.add('hidden');
            this.render();
            this.searchInput.focus();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.searchDropdown && !e.target.closest('.header-search')) {
                this.searchDropdown.classList.add('hidden');
            }
        });

        // Movie Modal Close Button
        if (this.closeMovieModalBtn) {
            this.closeMovieModalBtn.onclick = () => this.hideModal(this.movieModal);
        }

        this.closeModalBtn.addEventListener('click', () => {
            this.hideModal(this.thumbModal);
            if (this.links.length === 0) this.render();
        });
        this.confirmThumbBtn.addEventListener('click', () => this.confirmThumbnail());
        this.retryFetchBtn.addEventListener('click', () => this.handleRetryFetch());

        this.saveEditBtn.addEventListener('click', () => this.saveEdit());
        this.closeEditModalBtn.addEventListener('click', () => this.hideModal(this.editModal));
        this.genScreenshotBtn.addEventListener('click', () => this.generateScreenshot());

        document.querySelectorAll('.crop-presets button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.crop-presets button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCrop = parseInt(btn.dataset.crop);
            });
        });

        this.exportBtn.addEventListener('click', () => this.exportVault());
        this.importBtn.addEventListener('click', () => this.importFileInput.click());
        this.importFileInput.addEventListener('change', (e) => this.importVault(e));

        this.themeToggle.addEventListener('click', () => this.toggleTheme());

        this.tagFilter.addEventListener('click', (e) => {
            const pill = e.target.closest('.cat-pill');
            if (pill) {
                this.activeTag = pill.dataset.tag;
                this.tagFilter.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.render();
            }
        });

        this.addTagBtn.addEventListener('click', () => this.handleAddFormTag('add'));
        this.editTagBtn.addEventListener('click', () => this.handleAddFormTag('edit'));

        this.addTagsInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleAddFormTag('add');
            }
        });

        this.editTagsInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleAddFormTag('edit');
            }
        });
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

    closeAllModals() {
        [this.thumbModal, this.editModal].forEach(m => {
            if (m && !m.classList.contains('hidden')) {
                m.classList.add('hidden');
                if (m === this.thumbModal && this.links.length === 0) this.render();
            }
        });
    }

    async handleAddLink() {
        const url = this.urlInput.value.trim();
        if (!url) return;

        // Auto-add any tag typed in the input
        this.handleAddFormTag('add');
        this.currentLinkTags = [...this.tempTags];

        this.currentUrl = url;
        this.addBtn.disabled = true;

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
            const existingLink = this.links.find(l => l.url === url);
            if (existingLink) {
                this.showToast('Link already in vault!', 'error');
                this.urlInput.value = '';
                this.addTagsInput.value = '';
                this.tempTags = [];
                this.renderFormTags('add');
                const skel = document.getElementById('tempSkeleton');
                if (skel) skel.remove();
                this.addBtn.disabled = false;
                
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
            this.showThumbPicker(metadata.images || []);
        } catch (error) {
            console.error('Metadata error:', error);
            const fb = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
            this.showThumbPicker([], fb);
        } finally {
            this.addBtn.disabled = false;
            this.urlInput.value = '';
            this.addTagsInput.value = '';
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
            isScreenshot: false
        };

        const resolveUrl = (relative) => {
            try { return new URL(relative, url).href; } catch (e) { return relative; }
        };

        // Try YouTube OEmbed fast path
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
                    results.description = `YouTube Video by ${data.author_name}`;
                    if (data.thumbnail_url) results.images.push(data.thumbnail_url);
                    return results;
                }
            } catch (e) {}
        }

        // Run other fetchers in parallel to get max images faster
        await Promise.allSettled([
            fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.title && results.title === url) results.title = data.title;
                    if (data.author_name && results.description === 'Fetching metadata...') results.description = `Shared by ${data.author_name || 'user'}`;
                    if (data.thumbnail_url) results.images.push(data.thumbnail_url);
                }),
            fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        const m = data.data;
                        if (m.title && results.title === url) results.title = m.title;
                        if (m.description && results.description === 'Fetching metadata...') results.description = m.description;
                        if (m.image?.url) results.images.push(m.image.url);
                        if (m.logo?.url) results.images.push(m.logo.url);
                    }
                }),
            fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
                .then(res => res.json())
                .then(data => {
                    const doc = new DOMParser().parseFromString(data.contents, 'text/html');
                    const getM = (s) => doc.querySelector(`meta[property="${s}"], meta[name="${s}"]`)?.getAttribute('content');
                    
                    const title = getM('og:title') || getM('twitter:title') || doc.querySelector('[itemprop="name"]')?.getAttribute('content') || doc.title;
                    if (title && results.title === url) results.title = title;
                    
                    const desc = getM('og:description') || getM('twitter:description') || doc.querySelector('[itemprop="description"]')?.getAttribute('content') || getM('description');
                    if (desc && results.description === 'Fetching metadata...') results.description = desc || 'No description.';
                    
                    const og = getM('og:image') || getM('twitter:image') || doc.querySelector('[itemprop="image"]')?.getAttribute('content');
                    if (og) results.images.push(resolveUrl(og));

                    // Extract more images (icons and img tags)
                    ['apple-touch-icon', 'icon', 'shortcut icon'].forEach(rel => {
                        const href = doc.querySelector(`link[rel="${rel}"]`)?.getAttribute('href');
                        if (href) results.images.push(resolveUrl(href));
                    });

                    Array.from(doc.querySelectorAll('img'))
                        .map(img => img.getAttribute('src'))
                        .filter(Boolean)
                        .filter(src => src.startsWith('http') || src.startsWith('/'))
                        .slice(0, 15)
                        .forEach(src => results.images.push(resolveUrl(src)));
                })
        ]).catch(err => console.warn('Parallel fetch error:', err));

        // If no title found, use hostname
        if (results.title === url) {
            try {
                results.title = new URL(url).hostname;
            } catch(e) {}
        }

        // Remove duplicates and empty
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
            this.thumbStatus.innerText = "OG Image not found. Use this screenshot or try again?";
            this.thumbStatus.style.color = "#d9534f"; // Alert color
        } else {
            this.thumbStatus.innerText = "Select your preferred thumbnail:";
            this.thumbStatus.style.color = "#666";
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
        this.showToast('Link removed from vault', 'success');
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
        navigator.clipboard.writeText(url).then(() => this.showToast('Copied to clipboard!'));
    }

    exportVault() {
        if (this.links.length === 0) return this.showToast('No links to export.', 'error');
        
        try {
            const dataStr = JSON.stringify(this.links, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `sachlink_vault_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showToast('Vault exported successfully!');
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
                
                this.showToast(`Imported ${added} new links successfully!`);
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
            return 'https://via.placeholder.com/64?text=L';
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
                    <div class="empty-icon">${isFiltering ? '🔍' : '🌐'}</div>
                    <div class="empty-title">${isFiltering ? 'No results found' : 'Nothing here yet'}</div>
                    <div class="empty-sub">${isFiltering ? 'Try adjusting your search or filters.' : 'Add a link to begin.'}</div>
                </div>`;
            return;
        }

        this.linkGrid.innerHTML = filtered.map(l => {
            const tags = Array.isArray(l.tags) ? l.tags : (Array.isArray(l.actors) ? l.actors : (l.category ? [l.category] : []));
            const hostname = this.getHostname(l.url);
            const favicon = this.getFaviconUrl(l.url);
            const relativeTime = this.getRelativeTime(l.date);
            const isMovie = tags.includes('movie') || (l.url && l.url.includes('imdb.com/title/'));

            return `
            <div class="card ${isMovie ? 'card-movie-vertical' : ''}" data-id="${l.id}">
                <div class="card-img-wrapper" onclick="window.open('${l.url}', '_blank')">
                    <img src="${l.thumb}" class="card-img" loading="lazy" onerror="this.src='https://via.placeholder.com/400?text=Image+Unavailable'">
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
        const list = formType === 'add' ? this.addTagsInput : this.editTagsInput;
        list.innerHTML = this.tempTags.map((t, i) => `
            <div class="form-actor-tag">
                ${t}
                <button type="button" onclick="window.vidLinkApp.removeFormTag('${formType}', ${i})">×</button>
            </div>
        `).join('');
    }

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       IMDb LIVE MOVIE SEARCH & TRAILERS INTEGRATION
       ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

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
                    <img src="${movie.poster || 'https://via.placeholder.com/300x450?text=🎞️'}" width="30" height="45" loading="lazy">
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
        this.movieModalPoster.src = movie.poster || 'https://via.placeholder.com/300x450?text=No+Poster';
        this.movieModalYear.textContent = `${movie.year} · ${movie.imdbId}`;
        this.movieModalType.textContent = movie.type;
        this.movieModalCast.textContent = `Who's in it: ${movie.actors}`;
        this.openImdbPageBtn.href = `https://www.imdb.com/title/${movie.imdbId}/`;

        // Save Movie to Vault Callback
        this.saveMovieToVaultBtn.onclick = () => {
            const movieUrl = `https://www.imdb.com/title/${movie.imdbId}/`;
            const existing = this.links.find(l => l.url === movieUrl);
            if (existing) {
                this.showToast('Already saved in your list!', 'error');
            } else {
                const link = {
                    id: 'l_' + Date.now(),
                    url: movieUrl,
                    thumb: movie.poster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=600&auto=format&fit=crop',
                    title: `${movie.title} (${movie.year})`,
                    desc: `Starring: ${movie.actors}`,
                    tags: ['movie'],
                    date: Date.now()
                };
                this.links.unshift(link);
                this.updateStorage();
                this.render();
                this.showToast(`Saved "${movie.title}" to your list!`, 'success');
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

