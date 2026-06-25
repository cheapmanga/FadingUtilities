// ===== SEARCH SYSTEM =====
// Ce fichier est chargé par toutes les pages.
// Chaque page doit définir son propre tableau `pageSearchIndex` AVANT ce script.

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
            <a href="${item.page}${item.target ? '#' + item.target : ''}" class="search-result-item" onclick="closeSearch()">
                <div class="search-result-icon"><i class="fas ${item.icon}"></i></div>
                <div class="search-result-content">
                    <div class="search-result-title">${item.title}</div>
                    <div class="search-result-desc">${item.desc}</div>
                </div>
                <span class="search-result-category">${item.category}</span>
            </a>
        `).join('');
    });
}

// Initialisation au chargement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchSystem);
} else {
    initSearchSystem();
}

