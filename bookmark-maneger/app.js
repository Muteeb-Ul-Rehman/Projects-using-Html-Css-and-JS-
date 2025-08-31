// Bookmark Pro — app.js (single-file app logic)
// NOTE: This is a big file but self-contained. If console shows CORS errors for favicon fetch, it's normal for some sites.

(() => {
    // ---- Config / Storage keys ----
    const STORAGE_KEY = 'bookmark_pro_v1';
    const SNAPSHOT_KEY = 'bookmark_pro_snapshots';
    const DEFAULT_CATEGORIES = ['Work', 'Tools', 'All'];
    const appState = {
        bookmarks: [], // {id,title,url,category,tags:[],notes,created,updated,pinned,trashed}
        categories: [],
        filter: 'all', // quick filter
        search: '',
        sort: 'created_desc',
        selectionMode: false,
        selectedIds: new Set(),
        theme: 'light'
    };

    // ---- Utils ----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    const uid = () => 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    function nowTs() { return Date.now(); }

    // Save / load
    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                appState.categories = [...DEFAULT_CATEGORIES];
                appState.bookmarks = [];
                saveState();
                return;
            }
            const parsed = JSON.parse(raw);
            // simple migration: ensure fields exist
            appState.categories = parsed.categories || DEFAULT_CATEGORIES;
            appState.bookmarks = (parsed.bookmarks || []).map(b => ({
                id: b.id || uid(),
                title: b.title || '',
                url: b.url || '',
                category: b.category || 'All',
                tags: b.tags || [],
                notes: b.notes || '',
                created: b.created || nowTs(),
                updated: b.updated || nowTs(),
                pinned: !!b.pinned,
                trashed: !!b.trashed,
            }));
            appState.theme = parsed.theme || 'light';
            saveState(); // rewrite normalized
        } catch (e) {
            console.error('load error', e);
            appState.categories = [...DEFAULT_CATEGORIES];
            appState.bookmarks = [];
        }
    }
    function saveState() {
        const snapshot = {
            categories: appState.categories,
            bookmarks: appState.bookmarks,
            theme: appState.theme,
            savedAt: nowTs()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    }

    // Snapshot auto-backup (keep last 8)
    function snapshotState() {
        try {
            const arr = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]');
            arr.unshift({ at: nowTs(), data: JSON.parse(localStorage.getItem(STORAGE_KEY)) });
            localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(arr.slice(0, 8)));
        } catch (e) {/*ignore*/ }
    }

    // ---- DOM refs ----
    const refs = {
        board: $('#board'),
        addBtn: $('#addBtn'),
        modal: $('#modal'),
        closeModal: $('#closeModal'),
        modalTitle: $('#modalTitle'),
        bTitle: $('#bTitle'),
        bUrl: $('#bUrl'),
        bCategory: $('#bCategory'),
        bTags: $('#bTags'),
        bNotes: $('#bNotes'),
        saveBtn: $('#saveBtn'),
        saveAndOpenBtn: $('#saveAndOpenBtn'),
        categoryList: $('#categoryList'),
        newCategoryInput: $('#newCategoryInput'),
        addCategoryBtn: $('#addCategoryBtn'),
        quickSearch: $('#quickSearch'),
        pasteImport: $('#pasteImport'),
        sortSelect: $('#sortSelect'),
        openAllBtn: $('#openAllBtn'),
        bulkBtn: $('#bulkBtn'),
        cleanDupBtn: $('#cleanDupBtn'),
        importBtn: $('#importBtn'),
        exportBtn: $('#exportBtn'),
        exportEncBtn: $('#exportEncBtn'),
        importFile: $('#importFile'),
        exportAllBtn: null,
        themeToggle: $('#themeToggle'),
        statsArea: $('#statsArea'),
    };

    // ---- Rendering ----
    function renderCategories() {
        refs.categoryList.innerHTML = '';
        appState.categories.forEach(cat => {
            const li = document.createElement('li');
            li.textContent = cat;
            li.dataset.cat = cat;
            li.onclick = () => {
                appState.filter = cat;
                render();
            };
            if (appState.filter === cat) li.classList.add('active');
            refs.categoryList.appendChild(li);
        });
    }

    function matchesSearch(b) {
        const s = appState.search.trim().toLowerCase();
        if (!s) return true;
        // simple fuzzy: split words
        const tokens = s.split(/\s+/);
        const hay = (b.title + ' ' + b.url + ' ' + (b.tags || []).join(' ') + ' ' + (b.notes || '')).toLowerCase();
        return tokens.every(t => hay.indexOf(t) !== -1);
    }

    function visibleFilter(b) {
        if (appState.filter === 'trash') return b.trashed;
        if (appState.filter === 'All') return !b.trashed && true;
        if (appState.filter === 'unpinned') return !b.pinned && !b.trashed;
        if (appState.filter === 'pinned') return b.pinned && !b.trashed;
        // specific category
        return !b.trashed && b.category === appState.filter;
    }

    function sortBookmarks(arr) {
        const s = appState.sort;
        return arr.sort((a, b) => {
            if (s === 'created_desc') return b.created - a.created;
            if (s === 'created_asc') return a.created - b.created;
            if (s === 'title_asc') return a.title.localeCompare(b.title);
            if (s === 'title_desc') return b.title.localeCompare(a.title);
            return b.created - a.created;
        });
    }

    function renderBoard() {
        refs.board.innerHTML = '';
        let list = appState.bookmarks.slice();
        list = list.filter(matchesSearch).filter(visibleFilter);
        list = sortBookmarks(list);

        if (list.length === 0) {
            refs.board.innerHTML = `<div class="muted">No bookmarks found. Try adding some!</div>`;
            return;
        }

        list.forEach(b => {
            const card = document.createElement('article');
            card.className = 'card';
            card.draggable = !b.trashed;
            card.dataset.id = b.id;

            // header row
            const row = document.createElement('div'); row.className = 'row';
            const title = document.createElement('div'); title.className = 'title'; title.textContent = b.title || '(no title)';
            const url = document.createElement('div'); url.className = 'url'; url.textContent = b.url;
            row.appendChild(title);

            // actions
            const actions = document.createElement('div'); actions.style.marginLeft = '8px';
            const pinBtn = document.createElement('button'); pinBtn.className = 'icon-btn'; pinBtn.title = 'Pin/unpin'; pinBtn.innerText = b.pinned ? '📌' : '📍';
            pinBtn.onclick = (e) => { e.stopPropagation(); b.pinned = !b.pinned; b.updated = nowTs(); saveState(); render(); };
            actions.appendChild(pinBtn);

            const editBtn = document.createElement('button'); editBtn.className = 'icon-btn'; editBtn.title = 'Edit'; editBtn.innerText = '✏️';
            editBtn.onclick = (e) => { e.stopPropagation(); openEditModal(b.id); };
            actions.appendChild(editBtn);

            const deleteBtn = document.createElement('button'); deleteBtn.className = 'icon-btn'; deleteBtn.title = 'Delete'; deleteBtn.innerText = '🗑️';
            deleteBtn.onclick = (e) => { e.stopPropagation(); confirmDelete(b.id); };
            actions.appendChild(deleteBtn);

            // open button
            const openBtn = document.createElement('button'); openBtn.className = 'icon-btn'; openBtn.title = 'Open'; openBtn.innerText = '🔗';
            openBtn.onclick = (e) => { e.stopPropagation(); window.open(b.url, '_blank'); b.lastOpened = nowTs(); saveState(); renderStats(); };

            actions.appendChild(openBtn);

            row.appendChild(actions);

            // body
            const meta = document.createElement('div'); meta.className = 'meta';
            const catSpan = document.createElement('span'); catSpan.className = 'small-tag'; catSpan.textContent = b.category;
            meta.appendChild(catSpan);
            if (b.tags && b.tags.length) {
                const tags = document.createElement('div');
                b.tags.slice(0, 4).forEach(t => {
                    const tspan = document.createElement('span'); tspan.className = 'small-tag'; tspan.textContent = t;
                    tags.appendChild(tspan);
                });
                meta.appendChild(tags);
            }

            if (b.notes) {
                const notes = document.createElement('div'); notes.className = 'notes'; notes.textContent = b.notes;
                card.appendChild(row);
                card.appendChild(url);
                card.appendChild(meta);
                card.appendChild(notes);
            } else {
                card.appendChild(row);
                card.appendChild(url);
                card.appendChild(meta);
            }

            // pin badge
            if (b.pinned) {
                const pin = document.createElement('div'); pin.className = 'pin'; pin.textContent = 'PIN';
                card.appendChild(pin);
            }

            // toggle select when in selectionMode
            if (appState.selectionMode) {
                const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = appState.selectedIds.has(b.id);
                checkbox.onchange = (ev) => {
                    if (ev.target.checked) appState.selectedIds.add(b.id); else appState.selectedIds.delete(b.id);
                };
                card.prepend(checkbox);
            }

            // click to open or edit (single click opens link)
            card.onclick = (e) => {
                if (appState.selectionMode) {
                    // toggle selected
                    if (appState.selectedIds.has(b.id)) appState.selectedIds.delete(b.id); else appState.selectedIds.add(b.id);
                    render();
                    return;
                }
                // open link
                window.open(b.url, '_blank');
                b.lastOpened = nowTs(); saveState(); renderStats();
            };

            // drag/drop handlers to reorder or move category
            card.addEventListener('dragstart', (ev) => {
                ev.dataTransfer.setData('text/bookmark-id', b.id);
            });
            card.addEventListener('dragover', (ev) => { ev.preventDefault(); card.style.opacity = 0.7; });
            card.addEventListener('dragleave', () => { card.style.opacity = 1; });
            card.addEventListener('drop', (ev) => {
                ev.preventDefault(); card.style.opacity = 1;
                const fromId = ev.dataTransfer.getData('text/bookmark-id');
                const toId = b.id;
                if (fromId && toId && fromId !== toId) {
                    reorderBookmarks(fromId, toId);
                }
            });

            refs.board.appendChild(card);
        });
    }

    function renderStats() {
        const total = appState.bookmarks.length;
        const trash = appState.bookmarks.filter(b => b.trashed).length;
        const pinned = appState.bookmarks.filter(b => b.pinned && !b.trashed).length;
        const perCat = {};
        appState.categories.forEach(c => perCat[c] = 0);
        appState.bookmarks.forEach(b => { if (!b.trashed) perCat[b.category] = (perCat[b.category] || 0) + 1; });
        let html = `<div>Total: ${total}</div><div>Pinned: ${pinned}</div><div>Trash: ${trash}</div>`;
        html += '<div style="margin-top:8px"><strong>By category</strong><ul style="padding-left:16px;margin:6px 0">';
        for (let c of appState.categories) html += `<li>${c}: ${perCat[c] || 0}</li>`;
        html += '</ul></div>';
        refs.statsArea.innerHTML = html;
    }

    // ---- Actions ----
    function openAddModal() {
        refs.modal.setAttribute('open', '');
        refs.modal.setAttribute('aria-hidden', 'false');
        refs.modal.style.display = 'grid';
        refs.modalTitle.textContent = 'Add Bookmark';
        refs.bTitle.value = '';
        refs.bUrl.value = '';
        refs.bTags.value = '';
        refs.bNotes.value = '';
        populateCategorySelect();
        refs.bTitle.focus();
        refs.saveBtn.onclick = saveNewFromModal;
        refs.saveAndOpenBtn.onclick = saveAndOpenFromModal;
    }

    function openEditModal(id) {
        const b = appState.bookmarks.find(x => x.id === id);
        if (!b) return;
        refs.modal.setAttribute('open', '');
        refs.modal.setAttribute('aria-hidden', 'false');
        refs.modal.style.display = 'grid';
        refs.modalTitle.textContent = 'Edit Bookmark';
        refs.bTitle.value = b.title;
        refs.bUrl.value = b.url;
        refs.bTags.value = (b.tags || []).join(', ');
        refs.bNotes.value = b.notes || '';
        populateCategorySelect(b.category);
        refs.saveBtn.onclick = () => { saveEditFromModal(id); };
        refs.saveAndOpenBtn.onclick = () => { saveEditFromModal(id, true); };
    }

    function closeModal() {
        refs.modal.removeAttribute('open');
        refs.modal.setAttribute('aria-hidden', 'true');
        refs.modal.style.display = 'none';
    }

    function populateCategorySelect(selected) {
        refs.bCategory.innerHTML = '';
        appState.categories.forEach(c => {
            const o = document.createElement('option'); o.value = c; o.textContent = c;
            if (c === selected) o.selected = true;
            refs.bCategory.appendChild(o);
        });
    }

    function saveNewFromModal() {
        const title = refs.bTitle.value.trim();
        let url = refs.bUrl.value.trim();
        if (!url) return alert('URL required');
        url = normalizeUrl(url);
        const category = refs.bCategory.value || 'All';
        const tags = refs.bTags.value.split(',').map(t => t.trim()).filter(Boolean);
        if (duplicateExists(url, category)) { return alert('This URL already exists in this category'); }
        const b = { id: uid(), title: title || url, url, category, tags, notes: refs.bNotes.value.trim(), created: nowTs(), updated: nowTs(), pinned: false, trashed: false };
        appState.bookmarks.push(b);
        snapshotState();
        saveState();
        closeModal();
        render(); renderStats();
    }
    function saveAndOpenFromModal() {
        saveNewFromModal();
        const last = appState.bookmarks[appState.bookmarks.length - 1];
        if (last) window.open(last.url, '_blank');
    }

    function saveEditFromModal(id, openAfter = false) {
        const b = appState.bookmarks.find(x => x.id === id);
        if (!b) return;
        const title = refs.bTitle.value.trim();
        let url = normalizeUrl(refs.bUrl.value.trim());
        const category = refs.bCategory.value || 'All';
        const tags = refs.bTags.value.split(',').map(t => t.trim()).filter(Boolean);
        // if moving to new category, ensure not duplicate there
        if ((url !== b.url || category !== b.category) && duplicateExists(url, category)) {
            return alert('This URL already exists in the target category');
        }
        b.title = title || url;
        b.url = url;
        b.category = category;
        b.tags = tags;
        b.notes = refs.bNotes.value.trim();
        b.updated = nowTs();
        snapshotState();
        saveState();
        closeModal();
        render();
        renderStats();
        if (openAfter) window.open(b.url, '_blank');
    }

    function duplicateExists(url, category) {
        return appState.bookmarks.some(b => !b.trashed && b.url === url && b.category === category);
    }

    function normalizeUrl(u) {
        if (!u) return u;
        if (!/^[a-zA-Z]+:\/\//.test(u)) return 'https://' + u;
        return u;
    }

    function confirmDelete(id) {
        const b = appState.bookmarks.find(x => x.id === id);
        if (!b) return;
        if (confirm(`Are you sure to delete "${b.title}"? (This moves it to Trash)`)) {
            b.trashed = true; b.updated = nowTs();
            snapshotState();
            saveState(); render(); renderStats();
        }
    }

    function permanentlyDelete(id) {
        appState.bookmarks = appState.bookmarks.filter(b => b.id !== id);
        snapshotState(); saveState(); render(); renderStats();
    }

    function restoreFromTrash(id) {
        const b = appState.bookmarks.find(x => x.id === id);
        if (!b) return;
        b.trashed = false; b.updated = nowTs();
        snapshotState(); saveState(); render(); renderStats();
    }

    function reorderBookmarks(fromId, toId) {
        const idxFrom = appState.bookmarks.findIndex(b => b.id === fromId);
        const idxTo = appState.bookmarks.findIndex(b => b.id === toId);
        if (idxFrom < 0 || idxTo < 0) return;
        const [item] = appState.bookmarks.splice(idxFrom, 1);
        appState.bookmarks.splice(idxTo, 0, item);
        snapshotState(); saveState(); render();
    }

    // ---- Bulk / misc tools ----
    function toggleSelectionMode() {
        appState.selectionMode = !appState.selectionMode;
        appState.selectedIds = new Set();
        render();
    }

    function openAllVisible() {
        const list = appState.bookmarks.filter(matchesSearch).filter(visibleFilter);
        if (!list.length) return alert('No visible bookmarks to open');
        if (!confirm(`Open ${list.length} links in new tabs?`)) return;
        const delay = 200; // small throttle
        list.forEach((b, i) => setTimeout(() => window.open(b.url, '_blank'), i * delay));
        // record lastOpened
        const t = nowTs();
        list.forEach(b => b.lastOpened = t);
        saveState(); renderStats();
    }

    function findDuplicates() {
        const map = {};
        appState.bookmarks.forEach(b => { if (!b.trashed) { map[b.url] = map[b.url] || []; map[b.url].push(b); } });
        const dups = Object.values(map).filter(arr => arr.length > 1);
        if (!dups.length) return alert('No duplicates found');
        // simple UI: list duplicates and ask to delete extras
        let report = 'Duplicates found:\\n';
        dups.forEach(arr => {
            report += `${arr.length} x ${arr[0].url}\\n`;
        });
        if (confirm(report + '\\nRemove duplicates (keep first in each group)?')) {
            dups.forEach(arr => {
                // keep first, remove rest (trash)
                arr.slice(1).forEach(b => b.trashed = true);
            });
            snapshotState(); saveState(); render(); renderStats();
        }
    }

    // ---- Import / Export ----
    function exportJSON(encrypt = false) {
        const payload = { categories: appState.categories, bookmarks: appState.bookmarks, exportedAt: nowTs() };
        if (!encrypt) {
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            downloadUrl(url, `bookmark_pro_export_${Date.now()}.json`);
            URL.revokeObjectURL(url);
            return;
        }
        // encrypted export: ask password
        const pw = prompt('Enter export password (will be used to encrypt file)');
        if (!pw) return;
        encryptJsonAndDownload(payload, pw);
    }

    async function encryptJsonAndDownload(obj, password) {
        const enc = new TextEncoder();
        const data = enc.encode(JSON.stringify(obj));
        const pwKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, pwKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
        const pack = { salt: arrayBufferToBase64(salt), iv: arrayBufferToBase64(iv), ct: arrayBufferToBase64(ct) };
        const blob = new Blob([JSON.stringify(pack)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        downloadUrl(url, `bookmark_pro_enc_${Date.now()}.json`);
        URL.revokeObjectURL(url);
    }

    async function importEncryptedFile(file) {
        const pw = prompt('Enter password to decrypt file');
        if (!pw) return;
        const text = await file.text();
        try {
            const obj = JSON.parse(text);
            const salt = base64ToArrayBuffer(obj.salt);
            const iv = base64ToArrayBuffer(obj.iv);
            const ct = base64ToArrayBuffer(obj.ct);
            const enc = new TextEncoder();
            const pwKey = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
            const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, pwKey, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
            const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
            const dec = new TextDecoder().decode(pt);
            const payload = JSON.parse(dec);
            mergeImported(payload);
        } catch (e) { alert('Decryption/import failed: ' + e.message); console.error(e); }
    }

    function importFileAsJSON(file) {
        file.text().then(txt => {
            try {
                const payload = JSON.parse(txt);
                mergeImported(payload);
            } catch (e) { alert('Invalid JSON import'); }
        });
    }

    function mergeImported(payload) {
        // merge categories
        payload.categories = payload.categories || [];
        payload.bookmarks = payload.bookmarks || [];
        payload.categories.forEach(c => { if (!appState.categories.includes(c)) appState.categories.push(c); });
        // add bookmarks (avoid duplicates per category+url)
        let added = 0;
        payload.bookmarks.forEach(b => {
            if (appState.bookmarks.some(x => x.url === b.url && x.category === b.category && !x.trashed)) return;
            const nb = {
                id: uid(), title: b.title || b.url, url: b.url, category: b.category || 'All', tags: b.tags || [], notes: b.notes || '',
                created: b.created || nowTs(), updated: nowTs(), pinned: !!b.pinned, trashed: !!b.trashed
            };
            appState.bookmarks.push(nb); added++;
        });
        snapshotState(); saveState(); render(); renderStats();
        alert(`Imported ${added} bookmarks`);
    }

    function downloadUrl(url, filename) {
        const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    }

    // ---- helpers for crypto base64 ----
    function arrayBufferToBase64(buf) {
        const bin = String.fromCharCode.apply(null, new Uint8Array(buf));
        return btoa(bin);
    }
    function base64ToArrayBuffer(base64) {
        const bin = atob(base64);
        const len = bin.length; const arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
        return arr.buffer;
    }

    // ---- import/export buttons handlers ----
    refs.exportBtn.onclick = () => exportJSON(false);
    refs.exportEncBtn.onclick = () => exportJSON(true);
    refs.importBtn.onclick = () => refs.importFile.click();
    refs.importFile.onchange = (e) => {
        const f = e.target.files[0]; if (!f) return;
        if (f.name.endsWith('.json')) importFileAsJSON(f);
        else importFileAsJSON(f);
        refs.importFile.value = '';
    };

    // ---- Paste import (one link per line) ----
    refs.pasteImport.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const text = refs.pasteImport.value.trim();
            if (!text) return;
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            let added = 0;
            lines.forEach(line => {
                const url = normalizeUrl(line);
                if (!appState.bookmarks.some(b => b.url === url && !b.trashed)) {
                    appState.bookmarks.push({ id: uid(), title: url, url, category: 'All', tags: [], notes: '', created: nowTs(), updated: nowTs(), pinned: false, trashed: false });
                    added++;
                }
            });
            snapshotState(); saveState(); render(); renderStats();
            refs.pasteImport.value = '';
            alert(`Added ${added} bookmarks`);
        }
    });

    // ---- quick search ----
    refs.quickSearch.addEventListener('input', (e) => { appState.search = e.target.value; render(); });
    // keyboard focus '/'
    window.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); refs.quickSearch.focus(); } });

    // ---- sort select ----
    refs.sortSelect.addEventListener('change', (e) => { appState.sort = e.target.value; render(); });

    // ---- open all ----
    refs.openAllBtn.addEventListener('click', openAllVisible);

    // ---- bulk / duplicates ----
    refs.bulkBtn.addEventListener('click', toggleSelectionMode);
    refs.cleanDupBtn.addEventListener('click', findDuplicates);

    // ---- add / modal events ----
    refs.addBtn.addEventListener('click', openAddModal);
    refs.closeModal.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => { if (e.target === refs.modal) closeModal(); });

    // ---- categories add ----
    refs.addCategoryBtn.addEventListener('click', () => {
        const name = refs.newCategoryInput.value.trim();
        if (!name) return;
        if (appState.categories.includes(name)) return alert('Category exists');
        appState.categories.push(name); refs.newCategoryInput.value = ''; saveState(); renderCategories(); render();
    });

    // ---- theme toggle ----
    refs.themeToggle.addEventListener('click', () => {
        appState.theme = appState.theme === 'light' ? 'dark' : 'light';
        applyTheme(); saveState();
    });

    function applyTheme() {
        if (appState.theme === 'dark') {
            document.documentElement.style.setProperty('--bg', '#0f1724');
            document.documentElement.style.setProperty('--card', '#071428');
            document.documentElement.style.setProperty('--muted', '#9aa7bf');
            document.documentElement.style.setProperty('--accent', '#51a7ff');
        } else {
            document.documentElement.style.removeProperty('--bg'); document.documentElement.style.removeProperty('--card');
            document.documentElement.style.removeProperty('--muted'); document.documentElement.style.removeProperty('--accent');
        }
    }

    // ---- simple favicon fetch (non-blocking) ----
    function fetchFavIcon(url, cb) {
        try {
            const u = new URL(url);
            const f = `${u.origin}/favicon.ico`;
            cb(f);
        } catch (e) { cb(null); }
    }

    // ---- stats calc ----
    function calcStats() {
        // simple metrics
        const total = appState.bookmarks.length;
        const byDomain = {};
        appState.bookmarks.forEach(b => {
            try {
                const d = (new URL(b.url)).hostname.replace('www.', '');
                byDomain[d] = (byDomain[d] || 0) + 1;
            } catch (e) { }
        });
        return { total, domains: Object.keys(byDomain).length, byDomain };
    }

    // ---- init / render ----
    function render() {
        renderCategories();
        renderBoard();
        renderStats();
    }

    // ---- import/merge from browser exported HTML (very naive) ----
    function importFromBrowserHtml(htmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const anchors = doc.querySelectorAll('a');
        const payload = { categories: ['Imported'], bookmarks: [] };
        anchors.forEach(a => {
            payload.bookmarks.push({ title: a.textContent, url: a.href, category: 'Imported', tags: [], notes: '' });
        });
        mergeImported(payload);
    }

    // ---- utility: open file drop support for encrypted imports and normal JSON ----
    window.addEventListener('dragover', (e) => { e.preventDefault(); });
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        if (f.name.endsWith('.json')) importFileAsJSON(f);
        else importFileAsJSON(f);
    });

    // file download helper used earlier

    // ---- crypto import/export helpers already defined above ----

    // ---- helper: merge small UI for import text (if user pastes full bookmarks HTML) ----
    // If user pastes HTML into quick search then we try to detect and import
    refs.quickSearch.addEventListener('paste', (ev) => {
        const text = (ev.clipboardData || window.clipboardData).getData('text');
        if (text && text.trim().startsWith('<')) {
            if (confirm('Detected HTML paste (maybe browser bookmarks). Import?')) {
                importFromBrowserHtml(text);
            }
        }
    });

    // ---- initial load ----
    loadState();
    applyTheme();
    render();

    // last: small keyboard shortcuts for faster work
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'b') { e.preventDefault(); openAddModal(); }
        if (e.ctrlKey && e.key === 'o') { e.preventDefault(); openAllVisible(); }
        if (e.key === 'Escape') { if (document.activeElement) document.activeElement.blur(); if (appState.selectionMode) { toggleSelectionMode(); } }
    });

})();
