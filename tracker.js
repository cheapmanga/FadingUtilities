// ===== PAGE TRACKER =====
// Rend l'historique des changements Steam de Fading Echo, facon SteamDB.
//
// updates.json est ecrit par scripts/check_updates.py (GitHub Action toutes les
// 10 min) et amorce par scripts/parse_steamdb_history.py. Le fichier est servi
// en same-origin : la CSP du site reste inchangee.

(function () {
    const PAGE_SIZE = 40;
    const NOISE_KEY = 'fe-tracker-noise';
    // Intervalle du rafraichissement automatique cote navigateur (5 min).
    const AUTO_MS = 300000;
    // Apres un echec reseau on retente plus tot que le cycle nominal.
    const RETRY_MS = 30000;
    // Delai au-dela duquel une requete pendante est abandonnee : sans cela un
    // fetch qui ne se resout jamais laisserait loading a true pour toujours.
    const FETCH_MS = 20000;
    // Duree d'affichage d'un message transitoire dans l'indicateur.
    const FLASH_MS = 8000;

    // ----- Sources de donnees -----
    //
    // Deux sources, par ordre de preference :
    //
    //   1. l'API steamtrack, qui suit le flux PICS en continu et donne donc
    //      l'etat en direct ;
    //   2. updates.json, ecrit par la GitHub Action, servi same-origin.
    //
    // L'API n'est pas toujours joignable : elle tourne sur une VM qui peut
    // etre eteinte, derriere un tunnel dont l'adresse change a chaque
    // redemarrage. updates.json, lui, est toujours la. On tente donc l'API et
    // on retombe sur le fichier sans que le visiteur voie autre chose qu'un
    // flux complet -- simplement moins frais.
    //
    // La cle ci-dessous est PUBLIQUE par construction : tout ce qui est servi
    // au navigateur est lisible. Elle est donc choisie pour que sa divulgation
    // ne coute rien --
    //
    //   - lecture seule : elle ne peut ni ajouter ni retirer un jeu, les deux
    //     seuls endpoints d'ecriture la refusent en 403 ;
    //   - quota borne (5000/h) : un abus reste plafonne, la ou une cle
    //     illimitee publierait un droit d'aspiration sans frein ;
    //   - dediee a ce site : elle se revoque sans toucher aux autres acces.
    //
    // Les cles illimitees de steamtrack sont des cles d'administration --
    // elles autorisent la suppression d'un jeu avec tout son historique -- et
    // n'ont rien a faire dans le JavaScript d'un site public.
    const API_KEY = 'st_wKGo181hDZTAWdyiv0jeXszQUiTjGfmC';
    const API_APPID = 2467880;
    const TUNNEL_JSON =
        'https://raw.githubusercontent.com/cheapmanga/SteamTrack/main/tunnel.json';
    // Derniere adresse connue de l'API. La retenir evite de relire tunnel.json
    // a chaque chargement, et fait gagner un aller-retour au demarrage.
    const API_CACHE = 'fe-tracker-api-base';
    // Plafond impose par l'endpoint /changes.
    const API_PAGE = 500;

    // L'ordre fixe l'ordre des boutons de filtre.
    const TYPES = {
        build: { label: 'Builds', icon: 'fa-hammer' },
        depot: { label: 'Depots', icon: 'fa-hard-drive' },
        branch: { label: 'Branches', icon: 'fa-code-branch' },
        store: { label: 'Store', icon: 'fa-tags' },
        assets: { label: 'Assets', icon: 'fa-image' },
        news: { label: 'News', icon: 'fa-newspaper' },
        meta: { label: 'Other', icon: 'fa-cube' },
        changenumber: { label: 'Changenumber', icon: 'fa-hashtag' },
    };

    const feedEl = document.getElementById('trackerFeed');
    const statsEl = document.getElementById('trackerStats');
    const filtersEl = document.getElementById('trackerFilters');
    const searchEl = document.getElementById('trackerSearch');
    const noiseEl = document.getElementById('showNoise');
    const moreBtn = document.getElementById('loadMore');
    // Peut ne pas exister : le bouton n'est present que sur la page tracker.
    const refreshBtn = document.getElementById('refreshBtn');

    let allEvents = [];
    let visible = [];
    let shown = 0;
    let activeType = 'all';

    // Etat de l'auto-refresh.
    let autoEl = null;      // <span id="autoStatus">, cree par le JS
    let nextAt = 0;         // horodatage du prochain rafraichissement
    let lastFetch = 0;      // horodatage du dernier chargement reussi
    let flashUntil = 0;     // fin d'affichage du message transitoire
    let flashText = '';
    let loading = false;
    let lastLive = false;   // le dernier chargement venait-il de l'API ?
    // Adresse de l'API effectivement utilisee, retenue pour pouvoir lier vers
    // le site steamtrack : le tunnel change d'adresse, un lien en dur mourrait
    // au premier redemarrage de la VM.
    let apiOrigin = localStorage.getItem(API_CACHE) || '';

    noiseEl.checked = localStorage.getItem(NOISE_KEY) === '1';

    // ----- Acces a l'API -----

    // auth : n'envoyer la cle qu'a l'API steamtrack. X-API-Key est un en-tete
    // non standard, donc soumis au preflight CORS ; l'ajouter a la lecture de
    // tunnel.json ferait echouer une requete que GitHub sert tres bien sans.
    function jsonFetch(url, ms, auth) {
        return fetch(url, {
            cache: 'no-store',
            headers: auth ? { 'X-API-Key': API_KEY } : undefined,
            signal: AbortSignal.timeout(ms || FETCH_MS),
        }).then(resp => {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        });
    }

    // Adresse courante de l'API. L'adresse en cache est tentee d'abord : quand
    // elle est encore valide (le cas courant), le chargement ne coute pas la
    // lecture de tunnel.json.
    async function apiBase(force) {
        const cached = localStorage.getItem(API_CACHE);
        if (cached && !force) { apiOrigin = cached; return cached; }
        // Delai court : tunnel.json n'est qu'un aiguillage, et le repli sur
        // updates.json doit rester rapide si GitHub ne repond pas.
        const data = await jsonFetch(TUNNEL_JSON, 8000);
        const url = (data && data.url || '').replace(/\/$/, '');
        if (!url) throw new Error('no tunnel address published');
        localStorage.setItem(API_CACHE, url);
        apiOrigin = url;
        return url;
    }

    // L'API expose kind/occurred_at/change_number la ou le tracker attend
    // type/date/changeid. Pour les annonces, le corps vit dans `changes`.
    function adaptEvent(e) {
        const payload = e.changes;
        const out = {
            id: e.source + ':' + (e.change_number || e.id),
            // Rang d'enregistrement cote API. Retenu pour que le
            // rafraichissement incremental suive l'ordre de DECOUVERTE et non
            // la date de publication : une annonce parue hier et detectee
            // aujourd'hui porte la date d'hier, donc un filtre sur la date ne
            // la ramene jamais.
            rowid: e.id,
            type: e.kind,
            types: e.types || [e.kind],
            changeid: e.change_number,
            title: e.title,
            source: e.source,
            date: e.occurred_at,
            changes: Array.isArray(payload) ? payload : [],
        };
        if (!Array.isArray(payload) && payload) {
            out.url = payload.url;
            out.author = payload.author;
            out.feed = payload.feed;
            out.body = payload.body;
        }
        return out;
    }

    // Charge depuis l'API. `sinceId` permet aux rafraichissements de ne demander
    // que l'inedit : une requete au lieu des deux que coute la pagination
    // complete des 850+ evenements.
    async function loadFromApi(sinceId) {
        const base = await apiBase(false);
        const path = `${base}/v1/apps/${API_APPID}/changes?limit=${API_PAGE}`;
        const inc = sinceId ? '&since_id=' + encodeURIComponent(sinceId) : '';
        let data;
        try {
            data = await jsonFetch(path + inc, FETCH_MS, true);
        } catch (err) {
            // L'adresse en cache peut dater d'avant un redemarrage de la VM :
            // on relit tunnel.json une fois avant de conclure a une panne.
            const fresh = await apiBase(true);
            data = await jsonFetch(
                `${fresh}/v1/apps/${API_APPID}/changes?limit=${API_PAGE}` + inc,
                FETCH_MS, true);
        }

        const events = (data.changes || []).map(adaptEvent);
        // Pagination : l'endpoint plafonne a 500. Sur un chargement complet on
        // va chercher la suite, sur un rafraichissement incremental il n'y a
        // presque jamais de seconde page.
        let offset = events.length;
        while (!sinceId && offset < (data.total || 0) && offset < 5000) {
            const page = await jsonFetch(
                `${await apiBase(false)}/v1/apps/${API_APPID}/changes` +
                `?limit=${API_PAGE}&offset=${offset}`, FETCH_MS, true);
            const more = (page.changes || []).map(adaptEvent);
            if (!more.length) break;
            events.push(...more);
            offset += more.length;
        }
        return { generated: new Date().toISOString(), events, live: true };
    }

    // Plus grand rang d'enregistrement connu, curseur du suivi incremental.
    // Renvoie 0 si aucun evenement n'en porte : c'est le cas d'un flux venu
    // d'updates.json, qui n'a pas ces identifiants -- on repart alors sur un
    // chargement complet plutot que sur un curseur invente.
    function maxRowId(events) {
        let max = 0;
        for (const e of events) {
            if (typeof e.rowid === 'number' && e.rowid > max) max = e.rowid;
        }
        return max;
    }

    // Tente l'API, retombe sur le fichier statique. Le repli n'est pas une
    // erreur : c'est le mode nominal quand la VM est eteinte.
    async function fetchData(sinceId) {
        try {
            return await loadFromApi(sinceId);
        } catch (err) {
            const data = await jsonFetch('updates.json');
            data.live = false;
            return data;
        }
    }

    // ----- Chargement -----
    // silent : rafraichissement en arriere-plan, on ne detruit ni le flux deja
    // rendu ni la position de lecture si le reseau tombe.
    async function load(silent) {
        if (loading) return;
        loading = true;
        setBusy(true);
        if (silent) status('Refreshing...');

        try {
            // Sans delai maximum, un fetch qui ne se resout jamais (portail
            // captif, reprise de veille) laisserait loading a true pour
            // toujours : le compte a rebours gelerait et le bouton resterait
            // desactive jusqu'au rechargement de la page.
            // Rafraichissement incremental : quand un flux est deja rendu et
            // que la derniere source etait l'API, ne demander que l'inedit.
            // Le curseur est le plus grand rowid connu, pas la date la plus
            // recente : un evenement enregistre apres coup -- une annonce
            // Steam detectee le lendemain de sa parution -- porte une date
            // ancienne et resterait invisible jusqu'au prochain rechargement
            // complet de la page.
            const sinceId = silent && allEvents.length && lastLive
                ? maxRowId(allEvents)
                : null;
            const data = await fetchData(sinceId);

            lastFetch = Date.now();
            lastLive = !!data.live;
            const known = new Set(allEvents.map(eventId));
            let events = (data.events || []).filter(e => e && e.date);

            if (sinceId) {
                // Reponse partielle : elle complete le flux, elle ne le
                // remplace pas. Sans cette fusion un rafraichissement sans
                // nouveaute viderait la page.
                const seen = new Set(events.map(eventId));
                events = events.concat(
                    allEvents.filter(e => !seen.has(eventId(e))));
            }
            events.sort((a, b) => b.date.localeCompare(a.date));
            // Le premier chargement reussi n'est pas une nouveaute : sans ce
            // garde, un echec initial suivi d'un retour du reseau annoncerait
            // tout le flux comme inedit ("815 new changes").
            const fresh = silent && allEvents.length
                ? events.filter(e => !known.has(eventId(e))).length
                : 0;

            allEvents = events;

            // On restaure la position de lecture : un rafraichissement ne doit
            // jamais ramener l'utilisateur en haut du flux.
            const scrollY = window.scrollY;
            renderStats(data);
            renderFilters();
            apply(silent);
            if (silent) window.scrollTo(0, scrollY);

            if (fresh) {
                flash(fresh + (fresh > 1 ? ' new changes' : ' new change'), true);
            }
            schedule();
        } catch (err) {
            // Apres un echec on retente bien plus tot que le cycle nominal :
            // annoncer "retrying" pour ne rien faire pendant cinq minutes
            // serait mensonger, et une page ouverte sur un flux vide le
            // resterait tout ce temps.
            if (silent) {
                flash('Refresh failed, retrying');
            } else {
                feedEl.replaceChildren(el('p', 'tracker-empty error',
                    'Could not load history: ' + err.message));
                // renderStats n'a pas tourne : l'indicateur n'est pas encore dans
                // le DOM, on l'y place pour que le compte a rebours reste visible.
                if (!autoStatus().isConnected) statsEl.append(autoStatus());
            }
            schedule(RETRY_MS);
        } finally {
            loading = false;
            setBusy(false);
            // Affiche le compte a rebours sans attendre le prochain battement :
            // sinon l'indicateur reste vide pres d'une seconde apres le rendu.
            tick();
        }
    }

    // Identite d'un evenement : le changenumber quand il existe, sinon la paire
    // date + titre, suffisante pour reperer une entree inedite.
    function eventId(event) {
        return event.changeid ? 'c' + event.changeid : event.date + '|' + (event.title || '');
    }

    function setBusy(on) {
        if (!refreshBtn) return;
        refreshBtn.classList.toggle('refreshing', on);
        refreshBtn.disabled = on;
    }

    // ----- En-tete -----
    function renderStats(data) {
        const lastBuild = allEvents.find(e => e.type === 'build');
        const lastNews = allEvents.find(e => e.type === 'news');
        const real = allEvents.filter(e => e.type !== 'changenumber');

        const cards = [
            ['Latest change', allEvents.length ? relative(allEvents[0].date) : '-',
                allEvents.length ? absolute(allEvents[0].date) : ''],
            ['Latest build', lastBuild ? relative(lastBuild.date) : 'none',
                lastBuild ? absolute(lastBuild.date) : ''],
            ['Latest announcement', lastNews ? relative(lastNews.date) : 'none',
                lastNews ? lastNews.title : ''],
            ['Tracked changes', String(real.length),
                allEvents.length + ' entries total'],
        ];

        statsEl.replaceChildren(...cards.map(([label, value, hint]) => {
            const card = el('div', 'tracker-stat');
            card.append(el('span', 'tracker-stat-label', label));
            card.append(el('strong', 'tracker-stat-value', value));
            if (hint) card.append(el('span', 'tracker-stat-hint', hint));
            return card;
        }));

        if (data.generated) {
            // Date cote serveur, et date de la derniere mise a jour REELLE des
            // donnees : le fichier n'est reecrit que lorsqu'il change. Elle ne
            // bouge donc pas a chaque controle, ni au clic sur Refresh -- d'ou
            // "Data updated" plutot que "Last checked", qui laissait croire
            // l'inverse. Le controle, lui, a lieu toutes les 10 minutes.
            // La provenance est dite explicitement : servi par l'API, le flux
            // est celui du collecteur en direct ; servi par le fichier, il
            // date du dernier passage de la GitHub Action. Deux fraicheurs
            // differentes ne doivent pas s'afficher de la meme facon.
            const line = el('p', 'tracker-generated',
                `Data updated ${relative(data.generated)} ` +
                `(${absolute(data.generated)}) — `);
            if (data.live && apiOrigin) {
                // La mention de la source devient un lien vers la page que
                // steamtrack consacre au jeu. L'adresse est celle qui vient de
                // repondre, pas une constante : le tunnel en change a chaque
                // redemarrage.
                line.append('live from the ');
                const link = el('a', 'tracker-source-link', 'steamtrack API');
                link.href = `${apiOrigin}/app.html?appid=${API_APPID}`;
                link.target = '_blank';
                link.rel = 'noopener';
                link.title = 'Open Fading Echo on steamtrack';
                line.append(link);
            } else {
                line.append(data.live ? 'live from the steamtrack API'
                                      : 'from the published snapshot');
            }
            statsEl.append(line);
        }

        // replaceChildren vient de vider le conteneur : l'indicateur d'auto-refresh
        // est reattache ici pour survivre a chaque rendu de l'en-tete.
        statsEl.append(autoStatus());
    }

    // ----- Indicateur d'auto-refresh -----
    function autoStatus() {
        if (!autoEl) {
            autoEl = el('span', 'tracker-auto');
            autoEl.id = 'autoStatus';
        }
        return autoEl;
    }

    function status(text) {
        autoStatus().textContent = text;
    }

    // Message transitoire : il masque le compte a rebours quelques secondes.
    // highlight n'est vrai que pour une bonne nouvelle (des changements
    // inedits) : un echec passe aussi par ici et ne doit pas s'afficher en
    // cyan comme une reussite.
    function flash(text, highlight) {
        flashText = text;
        flashUntil = Date.now() + FLASH_MS;
        status(text);
        autoStatus().classList.toggle('fresh', !!highlight);
    }

    function schedule(delay) {
        nextAt = Date.now() + (delay || AUTO_MS);
    }

    function tick() {
        if (loading) return;

        if (nextAt && Date.now() >= nextAt) {
            load(true);
            return;
        }
        if (Date.now() < flashUntil) {
            status(flashText);
            return;
        }
        if (!nextAt) return;

        // Le message transitoire a expire : on rend la main au compte a rebours,
        // donc l'accentuation n'a plus lieu d'etre.
        autoStatus().classList.remove('fresh');

        const left = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
        const mins = Math.floor(left / 60);
        const secs = left % 60;
        const countdown = `next in ${mins}:${String(secs).padStart(2, '0')}`;

        // L'heure du dernier chargement reussi, elle, bouge a chaque clic sur
        // Refresh : c'est le retour visible que l'action a bien eu lieu.
        status(lastFetch
            ? `Page refreshed at ${clock(lastFetch)} - ${countdown}`
            : `Next refresh in ${mins}:${String(secs).padStart(2, '0')}`);
    }

    // Categories d'un evenement. types[] est le format courant ; le repli sur
    // type couvre les entrees ecrites avant son introduction.
    function typesOf(event) {
        return Array.isArray(event.types) && event.types.length
            ? event.types
            : [event.type];
    }

    // ----- Filtres -----
    function renderFilters() {
        const counts = {};
        // Un evenement mixte compte dans chaque categorie ou il apparait : la
        // somme des compteurs depasse donc le total, comme pour des etiquettes.
        allEvents.forEach(e => {
            typesOf(e).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
        });

        // "All" annonce ce qui sera reellement affiche : compter les
        // changenumbers alors qu'ils sont masques donnait un badge a 815 pour
        // 173 entrees a l'ecran.
        const all = noiseEl.checked
            ? allEvents.length
            : allEvents.filter(e => e.type !== 'changenumber').length;

        const buttons = [makeFilter('all', 'All', 'fa-layer-group', all)];
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
    // keepCount : conserve le nombre d'elements deja depiles par l'utilisateur,
    // pour qu'un rafraichissement automatique ne reduise pas la pagination.
    function apply(keepCount) {
        const query = searchEl.value.trim().toLowerCase();
        const noise = noiseEl.checked;

        visible = allEvents.filter(e => {
            // Les changenumbers seuls sont 80% du flux et ne disent rien :
            // masques par defaut, comme le fait SteamDB.
            if (e.type === 'changenumber' && !noise && activeType !== 'changenumber') return false;
            if (activeType !== 'all' && !typesOf(e).includes(activeType)) return false;
            if (query && !haystack(e).includes(query)) return false;
            return true;
        });

        const target = keepCount ? Math.max(shown, PAGE_SIZE) : PAGE_SIZE;

        shown = 0;
        feedEl.replaceChildren();
        if (!visible.length) {
            feedEl.append(el('p', 'tracker-empty', 'No matching events.'));
            moreBtn.hidden = true;
            return;
        }
        do { more(); } while (shown < target && shown < visible.length);
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
        moreBtn.textContent = `Show more (${visible.length - shown} remaining)`;
    }

    function panel(event) {
        const box = el('article', 'tracker-panel ' + event.type);

        const head = el('div', 'tracker-panel-head');
        const left = el('div', 'tracker-panel-title');
        const meta = TYPES[event.type] || TYPES.meta;
        left.append(el('span', 'tracker-tag ' + event.type, meta.label.toUpperCase()));
        left.append(el('h3', '', event.title || 'Change'));
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
            link.title = 'View the details on the source';
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
                const toggle = el('button', 'tracker-expand', 'Read more');
                toggle.type = 'button';
                toggle.addEventListener('click', () => {
                    const open = body.classList.toggle('clamped');
                    toggle.textContent = open ? 'Read more' : 'Show less';
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
        a.title = 'Hover to preview, click to download';
        return a;
    }

    // ----- Dates -----
    function absolute(iso) {
        const d = new Date(iso);
        return isNaN(d) ? iso : d.toLocaleString('en-GB', {
            day: '2-digit', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    // [duree d'une unite en secondes, singulier, pluriel]
    const UNITS = [
        [31536000, 'year', 'years'],
        [2592000, 'month', 'months'],
        [86400, 'day', 'days'],
        [3600, 'hour', 'hours'],
        [60, 'minute', 'minutes'],
    ];

    // Les secondes ne sont pas du detail : sans elles, deux rafraichissements
    // dans la meme minute affichent la meme heure, et le bouton parait inerte.
    function clock(stamp) {
        return new Date(stamp).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    }

    function relative(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        const secs = (Date.now() - d.getTime()) / 1000;
        if (secs < 60) return 'just now';
        for (const [size, one, many] of UNITS) {
            if (secs >= size) {
                const n = Math.floor(secs / size);
                return `${n} ${n > 1 ? many : one} ago`;
            }
        }
        return 'just now';
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
        // Declaree avant le chargement : une ressource en cache appelle ready()
        // de façon synchrone, et la legende doit deja exister a ce moment-la.
        const caption = el('span', 'tracker-preview-caption', 'Loading...');

        // Les ecouteurs sont poses AVANT src : une ressource deja en cache se
        // charge de façon synchrone, et l'evenement partirait avant l'ecoute.
        // C'est le cas des le deuxieme survol du meme asset, qui resterait
        // sinon bloque sur "Loading..." indefiniment.
        if (kind === 'video') {
            const video = document.createElement('video');
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.addEventListener('loadeddata', () => ready(video.videoWidth, video.videoHeight));
            video.addEventListener('error', fail);
            video.src = url;
            frame.append(video);
            // Filet pour le cas ou les donnees sont deja la malgre tout.
            if (video.readyState >= 2) ready(video.videoWidth, video.videoHeight);
        } else {
            const img = document.createElement('img');
            img.alt = '';
            img.addEventListener('load', () => ready(img.naturalWidth, img.naturalHeight));
            img.addEventListener('error', fail);
            img.src = url;
            frame.append(img);
            if (img.complete) {
                // complete vaut aussi true sur une image en erreur : c'est
                // naturalWidth qui distingue les deux.
                if (img.naturalWidth) ready(img.naturalWidth, img.naturalHeight);
                else fail();
            }
        }

        hover.append(frame, caption);
        document.body.append(hover);
        place(link);

        function ready(w, h) {
            if (!hover) return;
            hover.classList.remove('loading');
            caption.textContent = (w && h ? `${w}x${h} - ` : '') + 'click to download';
            place(link);
        }
        function fail() {
            if (!hover) return;
            hover.classList.remove('loading');
            hover.classList.add('failed');
            caption.textContent = 'Preview unavailable';
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
        // Le badge "All" depend de cette case : il doit etre recalcule.
        renderFilters();
        apply();
    });

    moreBtn.addEventListener('click', more);

    // Rafraichissement manuel : meme chemin que l'auto, et le compte a rebours
    // repart de zero puisque load() replanifie en sortie.
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => load(true));
    }

    // Un seul intervalle d'une seconde pilote a la fois le compte a rebours et
    // le declenchement du rechargement : pas de second timer a resynchroniser.
    setInterval(tick, 1000);

    load();
})();
