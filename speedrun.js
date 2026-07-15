// ===== PAGE SPEEDRUN =====
// Génération des glitches depuis glitches.json.
// La page ne contient que les glitches (les outils sont sur mods-tools.html) :
// la section #glitches est active par défaut, aucune navigation de sections.

// =========================================
// DYNAMIC GLITCH LOADER (100% DYNAMIC)
// =========================================
async function loadGlitches() {
    try {
        const response = await fetch('glitches.json');
        if (!response.ok) throw new Error('Failed to load glitches.json');
        const data = await response.json();

        const container = document.getElementById('dynamic-glitches-container');

        if (!data.sections || data.sections.length === 0) {
            container.innerHTML = '<p style="color: var(--primary-pink); text-align: center; padding: 40px;">No sections found in glitches.json</p>';
            return;
        }

        // Générer chaque section (concaténation en mémoire, une seule écriture DOM)
        container.innerHTML = data.sections.map(createSectionHTML).join('');

    } catch (error) {
        console.error('Error loading glitches:', error);
        document.getElementById('dynamic-glitches-container').innerHTML =
            `<p style="color: var(--primary-pink); text-align: center; padding: 40px; font-size: 1.2rem;">
                ❌ Failed to load glitches.<br>
                <small>Please make sure you're using Live Server (not file:// protocol)</small><br>
                <small>Error: ${escapeHtml(error.message)}</small>
            </p>`;
    }
}

function createSectionHTML(section) {
    const iconClass = section.icon || 'fa-bug';
    const color = section.color || 'var(--primary-cyan)';

    let html = '';
    html += `<h2 class="category-title" style="margin: 30px 0 20px 0; padding-bottom: 10px; border-bottom: 2px solid ${escapeHtml(color)}; font-family: 'Orbitron', sans-serif; color: ${escapeHtml(color)};">`;
    html += `<i class="fas ${escapeHtml(iconClass)}"></i> ${escapeHtml(section.title)}`;
    html += `</h2>`;

    html += `<div class="content-grid">`;

    if (section.glitches && section.glitches.length > 0) {
        html += section.glitches.map(createGlitchCard).join('');
    } else {
        html += `<p style="color: #888; text-align: center; padding: 40px; grid-column: 1/-1;">No glitches in this section yet.</p>`;
    }

    html += `</div>`;

    return html;
}

function createGlitchCard(glitch) {
    const hasVideos = glitch.videos && glitch.videos.length > 0;
    const hasVariationsWithVideos = glitch.variations && glitch.variations.some(v => v.video_id);
    const hasExtraVideos = glitch.videos_extra && glitch.videos_extra.length > 0;
    const hasAnyVideo = hasVideos || hasVariationsWithVideos || hasExtraVideos;

    // Par défaut : true (vidéo au hover)
    const hoverVideo = glitch.hover_video !== false;

    let cardClass = 'content-card';
    if (hasAnyVideo) {
        cardClass = hoverVideo ? 'content-card has-video-preview' : 'content-card has-video-always';
    }

    const cardStyle = glitch.card_style ? ` style="${escapeAttr(glitch.card_style)}"` : '';
    const titleStyle = glitch.title_style ? ` style="${escapeAttr(glitch.title_style)}"` : '';

    let html = `<div class="${cardClass}"${cardStyle}>`;

    // Le titre est toujours affiché en premier (title_prefix peut contenir une icône HTML)
    html += `<h3${titleStyle}>${glitch.title_prefix || ''}${escapeHtml(glitch.title)}`;
    if (glitch.alt_names) {
        html += ` <span class="alt-names">| ${escapeHtml(glitch.alt_names)}</span>`;
    }
    if (glitch.discord_link) {
        html += `<a href="${escapeAttr(glitch.discord_link)}" target="_blank" rel="noopener noreferrer" class="glitch-link" title="View on Discord"><i class="fab fa-discord"></i></a>`;
    }
    html += `</h3>`;

    // On parcourt les autres clés DU JSON DANS L'ORDRE où elles sont écrites.
    // Champs autorisés à contenir du HTML (liens riches, mise en forme) :
    // title_prefix, how_to, note, variations[].text, extra_content.
    // Les titres, styles, liens et ids vidéo sont échappés/encodés.
    Object.keys(glitch).forEach(key => {
        const metadataKeys = ['title', 'alt_names', 'discord_link', 'card_style', 'title_style', 'title_prefix', 'note_type', 'button_link', 'hover_video', 'search_icon', 'search_desc'];
        if (metadataKeys.includes(key)) return;

        const val = glitch[key];
        if (!val) return;

        switch (key) {
            case 'how_to':
                html += `<h4>How to do:</h4><p>${val}</p>`;
                break;

            case 'note':
                const isWarning = glitch.note_type === 'warning' || val.includes('⚠️');
                const noteClass = isWarning ? 'warning' : 'note';
                const noteLabel = isWarning ? 'Warning:' : 'Note:';
                html += `<div class="${noteClass}"><strong>${noteLabel}</strong> ${val}</div>`;
                break;

            case 'variations':
                html += `<h4>Variations:</h4><ul>`;
                val.forEach(v => {
                    html += `<li>${v.text}`;
                    if (v.video_id) {
                        html += createVideoWrapper(v.video_id, glitch.title);
                    }
                    html += `</li>`;
                });
                html += `</ul>`;
                break;

            case 'videos':
            case 'videos_extra':
                val.forEach(videoId => {
                    html += createVideoWrapper(videoId, glitch.title);
                });
                break;

            case 'extra_content':
                html += val;
                break;

            case 'button_text':
                if (glitch.button_link) {
                    html += `<a href="${escapeAttr(glitch.button_link)}" class="download-btn" style="margin-top: 20px;"><i class="fas fa-book-open"></i> ${escapeHtml(val)}</a>`;
                }
                break;
        }
    });

    html += `</div>`;
    return html;
}

function createVideoWrapper(videoId, title) {
    return `<div class="glitch-video-wrapper">
        <div class="glitch-video-inner">
            <div class="glitch-video-frame">
                <iframe src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" title="${escapeAttr(title)}"></iframe>
            </div>
        </div>
    </div>`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Pour les valeurs placées dans un attribut HTML (échappe aussi les guillemets)
function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Charger les glitches au démarrage
loadGlitches();
