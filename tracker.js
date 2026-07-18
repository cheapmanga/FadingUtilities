// ===== PAGE TRACKER =====
// Rend l'historique des changements Steam de Fading Echo, facon SteamDB.
//
// updates.json est ecrit par scripts/check_updates.py (GitHub Action toutes les
// 15 min) et amorce par scripts/parse_steamdb_history.py. Le fichier est servi
// en same-origin : la CSP du site reste inchangee.

(function () {
    const PAGE_SIZE = 40;
    const NOISE_KEY = 'fe-tracker-noise';

    // L'ordre fixe l'ordre des boutons de filtre.
    const TYPES = {
        build: { label: 'Builds', icon: 'fa-hammer' },
        depot: { label: 'Depots', icon: 'fa-hard-drive' },
        branch: { label: 'Branches', icon: 'fa-code-branch' },
        store: { label: 'Store', icon: 'fa-tags' },
        assets: { label: 'Assets', icon: 'fa-image' },
        news: { label: 'News', icon: 'fa-newspaper' },
        meta: { label: 'Divers', icon: 'fa-cube' },
        changenumber: { label: 'Changenumber', icon: 'fa-hashtag' },
    };

    const feedEl = document.getElementById('trackerFeed');
    const statsEl = document.getElementById('trackerStats');
    const filtersEl = document.getElementById('trackerFilters');
    const searchEl = document.getElementById('trackerSearch');
    const noiseEl = document.getElementById('showNoise');
    const moreBtn = document.getElementById('loadMore');

    let allEvents = [];
    let visible = [];
    let shown = 0;
    let activeType = 'all';

    noiseEl.checked = localStorage.getItem(NOISE_KEY) === '1';

    // ----- Chargement -----
    async function load() {
        try {
            const resp = await fetch('updates.json', { cache: 'no-store' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            allEvents = (data.events || []).filter(e => e && e.date);
            allEvents.sort((a, b) => b.date.localeCompare(a.date));
            renderStats(data);
            renderFilters();
            apply();
        } catch (err) {
            feedEl.replaceChildren(el('p', 'tracker-empty error',
                "Impossible de charger l'historique : " + err.message));
        }
    }

    // ----- En-tete -----
    function renderStats(data) {
        const lastBuild = allEvents.find(e => e.type === 'build');
        const lastNews = allEvents.find(e => e.type === 'news');
        const real = allEvents.filter(e => e.type !== 'changenumber');

        const cards = [
            ['Dernier changement', allEvents.length ? relative(allEvents[0].date) : '-',
                allEvents.length ? absolute(allEvents[0].date) : ''],
            ['Derniere build', lastBuild ? relative(lastBuild.date) : 'aucune',
                lastBuild ? absolute(lastBuild.date) : ''],
            ['Derniere annonce', lastNews ? relative(lastNews.date) : 'aucune',
                lastNews ? lastNews.title : ''],
            ['Changements suivis', String(real.length),
                allEvents.length + ' entrees au total'],
        ];

        statsEl.replaceChildren(...cards.map(([label, value, hint]) => {
            const card = el('div', 'tracker-stat');
            card.append(el('span', 'tracker-stat-label', label));
            card.append(el('strong', 'tracker-stat-value', value));
            if (hint) card.append(el('span', 'tracker-stat-hint', hint));
            return card;
        }));

        if (data.generated) {
            statsEl.append(el('p', 'tracker-generated',
                'Derniere verification : ' + absolute(data.generated)));
        }
    }

    // ----- Filtres -----
    function renderFilters() {
        const counts = {};
        allEvents.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });

        const buttons = [makeFilter('all', 'Tout', 'fa-layer-group',
            allEvents.length)];
        Object.entries(TYPES).forEach(([type, meta]) => {
            if (!counts[type]) return;
            buttons.push(makeFilter(type, meta.label, meta.icon, counts[type]));
        });
        filtersEl.replaceChildren(...buttons);
    }

    function makeFilter(type, label, icon, count) {
        const btn = el('button', 'tracker-filter' + (type === activeType ? ' active' : ''));
        btn.type = 'button';
        btn.dataset.type = type;
        btn.setAttribute('aria-pressed', String(type === activeType));
        btn.append(el('i', 'fas ' + icon));
        btn.append(el('span', '', label));
        btn.append(el('span', 'tracker-count', String(count)));
        btn.addEventListener('click', () => {
            activeType = type;
            filtersEl.querySelectorAll('.tracker-filter').forEach(b => {
                const on = b.dataset.type === type;
                b.classList.toggle('active', on);
                b.setAttribute('aria-pressed', String(on));
            });
            apply();
        });
        return btn;
    }

    // ----- Selection -----
    function apply() {
        const query = searchEl.value.trim().toLowerCase();
        const noise = noiseEl.checked;

        visible = allEvents.filter(e => {
            // Les changenumbers seuls sont 80% du flux et ne disent rien :
            // masques par defaut, comme le fait SteamDB.
            if (e.type === 'changenumber' && !noise && activeType !== 'changenumber') return false;
            if (activeType !== 'all' && e.type !== activeType) return false;
            if (query && !haystack(e).includes(query)) return false;
            return true;
        });

        shown = 0;
        feedEl.replaceChildren();
        if (!visible.length) {
            feedEl.append(el('p', 'tracker-empty', 'Aucun evenement ne correspond.'));
            moreBtn.hidden = true;
            return;
        }
        more();
    }

    function haystack(event) {
        if (!event._hay) {
            event._hay = [event.title, event.changeid, event.body || '', flatten(event.changes)]
                .join(' ').toLowerCase();
        }
        return event._hay;
    }

    function flatten(nodes) {
        if (!nodes) return '';
        return nodes.map(n =>
            (n.seg || []).map(s => s.v).join('') + ' ' + flatten(n.children)
        ).join(' ');
    }

    // ----- Rendu par lots -----
    // 795 evenements d'un coup, ce sont des milliers de noeuds : on rend par
    // paquets pour garder la page reactive.
    function more() {
        const slice = visible.slice(shown, shown + PAGE_SIZE);
        const frag = document.createDocumentFragment();
        slice.forEach(e => frag.append(panel(e)));
        feedEl.append(frag);
        shown += slice.length;
        moreBtn.hidden = shown >= visible.length;
        moreBtn.textContent = `Afficher plus (${visible.length - shown} restants)`;
    }

    function panel(event) {
        const box = el('article', 'tracker-panel ' + event.type);

        const head = el('div', 'tracker-panel-head');
        const left = el('div', 'tracker-panel-title');
        const meta = TYPES[event.type] || TYPES.meta;
        left.append(el('span', 'tracker-tag ' + event.type, meta.label.toUpperCase()));
        left.append(el('h3', '', event.title || 'Changement'));
        head.append(left);

        const time = el('div', 'tracker-panel-time');
        const stamp = el('span', 'tracker-rel', relative(event.date));
        stamp.title = absolute(event.date);
        time.append(stamp);
        if (event.url) {
            const link = el('a', 'tracker-permalink', '#' + (event.changeid || ''));
            link.href = event.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = 'Voir le detail sur la source';
            time.append(link);
        }
        head.append(time);
        box.append(head);

        if (event.changes && event.changes.length) {
            box.append(tree(event.changes));
        }

        if (event.body) {
            const body = el('div', 'tracker-body');
            body.textContent = event.body;
            box.append(body);

            // Les patch notes sont longs : on les replie pour ne pas noyer le flux.
            if (event.body.length > 400) {
                body.classList.add('clamped');
                const toggle = el('button', 'tracker-expand', 'Lire la suite');
                toggle.type = 'button';
                toggle.addEventListener('click', () => {
                    const open = body.classList.toggle('clamped');
                    toggle.textContent = open ? 'Lire la suite' : 'Replier';
                });
                box.append(toggle);
            }
        }

        if (event.feed) {
            box.append(el('p', 'tracker-source',
                [event.feed, event.author].filter(Boolean).join(' - ')));
        }
        return box;
    }

    function tree(nodes) {
        const ul = el('ul', 'tracker-changes');
        nodes.forEach(node => {
            const li = el('li', 'op-' + (node.op || 'none'));
            const line = el('span', 'tracker-line');
            (node.seg || []).forEach(seg => {
                const cls = {
                    del: 'seg-del', ins: 'seg-ins', field: 'seg-field',
                    muted: 'seg-muted', branch: 'seg-branch',
                }[seg.t] || 'seg-text';
                line.append(seg.href ? mediaLink(seg, cls) : el('span', cls, seg.v));
            });
            li.append(line);
            if (node.children && node.children.length) li.append(tree(node.children));
            ul.append(li);
        });
        return ul;
    }

    // Asset Steam : apercu au survol, telechargement au clic.
    function mediaLink(seg, cls) {
        const a = el('a', cls + ' seg-media is-' + (seg.media || 'file'), seg.v);
        a.href = seg.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.dataset.media = seg.media || '';
        a.title = 'Survoler pour previsualiser, cliquer pour telecharger';
        return a;
    }

    // ----- Dates -----
    function absolute(iso) {
        const d = new Date(iso);
        return isNaN(d) ? iso : d.toLocaleString('fr-FR', {
            day: '2-digit', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    // [duree d'une unite en secondes, singulier, pluriel]
    const UNITS = [
        [31536000, 'an', 'ans'],
        [2592000, 'mois', 'mois'],
        [86400, 'jour', 'jours'],
        [3600, 'heure', 'heures'],
        [60, 'minute', 'minutes'],
    ];

    function relative(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        const secs = (Date.now() - d.getTime()) / 1000;
        if (secs < 60) return "a l'instant";
        for (const [size, one, many] of UNITS) {
            if (secs >= size) {
                const n = Math.floor(secs / size);
                return `il y a ${n} ${n > 1 ? many : one}`;
            }
        }
        return "a l'instant";
    }

    // ----- Utilitaire DOM -----
    // textContent partout : le contenu vient de Steam, jamais d'innerHTML.
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // ----- Apercu des assets -----
    // Un seul popover reutilise, et des ecouteurs delegues : le flux compte
    // des centaines de liens, en equiper chacun serait du gaspillage.

    let hover = null;       // popover courant
    let hoverTimer = null;

    function showPreview(link) {
        hidePreview();

        const url = link.href;
        const kind = link.dataset.media;

        hover = el('div', 'tracker-preview loading');
        const frame = el('div', 'tracker-preview-frame');

        if (kind === 'video') {
            const video = document.createElement('video');
            video.src = url;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.addEventListener('loadeddata', () => ready(video.videoWidth, video.videoHeight));
            video.addEventListener('error', fail);
            frame.append(video);
        } else {
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            img.addEventListener('load', () => ready(img.naturalWidth, img.naturalHeight));
            img.addEventListener('error', fail);
            frame.append(img);
        }

        const caption = el('span', 'tracker-preview-caption', 'Chargement...');
        hover.append(frame, caption);
        document.body.append(hover);
        place(link);

        function ready(w, h) {
            if (!hover) return;
            hover.classList.remove('loading');
            caption.textContent = (w && h ? `${w}x${h} - ` : '') + 'clic pour telecharger';
            place(link);
        }
        function fail() {
            if (!hover) return;
            hover.classList.remove('loading');
            hover.classList.add('failed');
            caption.textContent = 'Apercu indisponible';
        }
    }

    // Ancre le popover au lien, en le rabattant s'il sort de l'ecran.
    function place(link) {
        if (!hover) return;
        const r = link.getBoundingClientRect();
        const box = hover.getBoundingClientRect();
        const margin = 12;

        let left = r.left;
        if (left + box.width > window.innerWidth - margin) {
            left = window.innerWidth - box.width - margin;
        }
        left = Math.max(margin, left);

        // Au-dessus du lien par defaut, en dessous s'il n'y a pas la place.
        let top = r.top - box.height - 8;
        if (top < margin) top = r.bottom + 8;

        hover.style.left = left + 'px';
        hover.style.top = top + 'px';
    }

    function hidePreview() {
        clearTimeout(hoverTimer);
        if (hover) {
            hover.remove();
            hover = null;
        }
    }

    feedEl.addEventListener('mouseover', ev => {
        const link = ev.target.closest('.seg-media');
        if (!link || !feedEl.contains(link)) return;
        clearTimeout(hoverTimer);
        // Petit delai : traverser le flux ne doit pas faire clignoter des apercus.
        hoverTimer = setTimeout(() => showPreview(link), 180);
    });

    feedEl.addEventListener('mouseout', ev => {
        const link = ev.target.closest('.seg-media');
        if (!link) return;
        if (ev.relatedTarget && link.contains(ev.relatedTarget)) return;
        hidePreview();
    });

    window.addEventListener('scroll', hidePreview, { passive: true });

    // ----- Telechargement -----
    // L'attribut download est ignore en cross-origin : le navigateur navigue
    // au lieu d'enregistrer. On passe donc par fetch + blob, ce que les CDN
    // Steam autorisent (access-control-allow-origin: *).
    feedEl.addEventListener('click', async ev => {
        const link = ev.target.closest('.seg-media');
        if (!link || !feedEl.contains(link)) return;
        ev.preventDefault();
        hidePreview();

        const url = link.href;
        const name = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'asset';

        link.classList.add('downloading');
        try {
            const resp = await fetch(url, { mode: 'cors' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const blob = await resp.blob();
            const objectUrl = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = name;
            document.body.append(a);
            a.click();
            a.remove();
            // Laisse au navigateur le temps de lire le blob avant liberation.
            setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
        } catch (err) {
            // Hors ligne, CORS refuse, asset supprime : ouvrir l'original
            // reste plus utile que de ne rien faire.
            window.open(url, '_blank', 'noopener,noreferrer');
        } finally {
            link.classList.remove('downloading');
        }
    });

    // ----- Evenements -----
    let searchTimer = null;
    searchEl.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(apply, 150);
    });

    noiseEl.addEventListener('change', () => {
        localStorage.setItem(NOISE_KEY, noiseEl.checked ? '1' : '0');
        apply();
    });

    moreBtn.addEventListener('click', more);

    load();
})();
