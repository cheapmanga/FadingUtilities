// ===== SEARCH SYSTEM =====
// Chargé par toutes les pages, APRÈS search-data.js (qui définit staticSearchIndex).
//
// L'index de recherche = entrées statiques (pages/mods/outils) + entrées de
// glitches générées à la volée depuis glitches.json (source unique de vérité).
// Ajouter un glitch dans glitches.json le rend donc automatiquement cherchable.

// Index vivant : on part des entrées statiques, les glitches sont insérés en
// tête dès que glitches.json est chargé. Le handler de recherche lit cet index
// à chaque frappe, donc l'ajout asynchrone est transparent.
let pageSearchIndex = staticSearchIndex.slice();

// Échappe le texte avant injection (les données viennent d'un JSON éditable).
function escapeSearchHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

// Construit la description d'un glitch pour la recherche : search_desc explicite,
// sinon alt_names, sinon un extrait nettoyé de how_to.
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

// Récupère glitches.json et ajoute les glitches à l'index de recherche.
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
        // Glitches en tête (ordre historique de l'index).
        pageSearchIndex.unshift(...entries);
    } catch (error) {
        // Hors-ligne / file:// : on garde l'index statique, la recherche marche quand même.
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

    // Ferme la modale au clic sur un résultat (délégation : closeSearch n'est pas globale)
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

// Charge les glitches dans l'index (asynchrone) puis initialise la recherche.
loadGlitchSearchEntries();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchSystem);
} else {
    initSearchSystem();
}
