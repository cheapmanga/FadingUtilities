// ===== SEARCH SYSTEM =====
// Loaded by every page, AFTER search-data.js (which defines staticSearchIndex).
//
// The search index = static entries (pages/mods/tools) + glitch entries
// generated on the fly from glitches.json (single source of truth).
// Adding a glitch to glitches.json therefore makes it automatically searchable.

// Live index: we start from the static entries, glitches are inserted at the
// front as soon as glitches.json is loaded. The search handler reads this index
// on every keystroke, so the asynchronous addition is transparent.
let pageSearchIndex = staticSearchIndex.slice();

// Escapes the text before injection (the data comes from an editable JSON file).
function escapeSearchHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

// Builds a glitch's description for the search: explicit search_desc,
// otherwise alt_names, otherwise a cleaned-up excerpt from how_to.
function deriveGlitchDesc(glitch) {
    if (glitch.search_desc) return glitch.search_desc;
    if (glitch.alt_names) return glitch.alt_names;
    if (glitch.how_to) {
        const text = glitch.how_to.replace(/<[^>]*>/g, '').trim();
        const dot = text.indexOf('. ');
        if (dot > 0 && dot < 120) return text.slice(0, dot + 1);
        return text.length > 100 ? text.slice(0, 100).trim() + '…' : text;
    }
    return '';
}

// Fetches glitches.json and adds the glitches to the search index.
async function loadGlitchSearchEntries() {
    try {
        const response = await fetch('glitches.json');
        if (!response.ok) return;
        const data = await response.json();
        const entries = [];
        (data.sections || []).forEach(section => {
            const category = section.search_category || 'Glitch';
            const sectionIcon = section.icon || 'fa-bug';
            (section.glitches || []).forEach(glitch => {
                if (!glitch.title) return;
                entries.push({
                    title: glitch.title,
                    category: category,
                    page: 'speedrun.html',
                    target: 'glitches',
                    desc: deriveGlitchDesc(glitch),
                    icon: glitch.search_icon || sectionIcon
                });
            });
        });
        // Glitches at the front (historical order of the index).
        pageSearchIndex.unshift(...entries);
    } catch (error) {
        // Offline / file:// : we keep the static index, the search works anyway.
        console.warn('Search: unable to load glitches.json for the search index.', error);
    }
}

function initSearchSystem() {
    const searchModal = document.getElementById('searchModal');
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const searchTrigger = document.getElementById('searchTrigger');

    function openSearch() {
        searchModal.classList.add('active');
        setTimeout(() => searchInput.focus(), 100);
        document.body.style.overflow = 'hidden';
    }

    function closeSearch() {
        searchModal.classList.remove('active');
        searchInput.value = '';
        searchResults.innerHTML = '<div class="search-empty">Start typing to search...</div>';
        document.body.style.overflow = '';
    }

    if (searchTrigger) searchTrigger.addEventListener('click', openSearch);

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
        if (e.key === 'Escape' && searchModal.classList.contains('active')) closeSearch();
    });

    searchModal.addEventListener('click', (e) => { if (e.target === searchModal) closeSearch(); });

    // Closes the modal when a result is clicked (delegation: closeSearch is not global)
    searchResults.addEventListener('click', (e) => {
        if (e.target.closest('.search-result-item')) closeSearch();
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            searchResults.innerHTML = '<div class="search-empty">Start typing to search...</div>';
            return;
        }
        const filtered = pageSearchIndex.filter(item =>
            item.title.toLowerCase().includes(query) ||
            item.desc.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query)
        );
        if (filtered.length === 0) {
            searchResults.innerHTML = '<div class="search-empty">No results found</div>';
            return;
        }
        searchResults.innerHTML = filtered.map(item => `
            <a href="${item.page}${item.target ? '#' + item.target : ''}" class="search-result-item">
                <div class="search-result-icon"><i class="fas ${escapeSearchHtml(item.icon)}"></i></div>
                <div class="search-result-content">
                    <div class="search-result-title">${escapeSearchHtml(item.title)}</div>
                    <div class="search-result-desc">${escapeSearchHtml(item.desc)}</div>
                </div>
                <span class="search-result-category">${escapeSearchHtml(item.category)}</span>
            </a>
        `).join('');
    });
}

// Loads the glitches into the index (asynchronous) then initializes the search.
loadGlitchSearchEntries();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchSystem);
} else {
    initSearchSystem();
}
