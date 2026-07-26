// ===== PAGE TRACKER =====
// Renders the Steam change history for Fading Echo, SteamDB-style.
//
// updates.json is written by scripts/check_updates.py (GitHub Action every
// 10 min) and seeded by scripts/parse_steamdb_history.py. The file is served
// same-origin: the site's CSP stays unchanged.

(function () {
    const PAGE_SIZE = 40;
    const NOISE_KEY = 'fe-tracker-noise';
    // Interval of the automatic browser-side refresh (5 min).
    const AUTO_MS = 300000;
    // After a network failure we retry sooner than the nominal cycle.
    const RETRY_MS = 30000;
    // Delay beyond which a pending request is abandoned: without it a fetch
    // that never resolves would leave loading at true forever.
    const FETCH_MS = 20000;
    // How long a transient message is shown in the indicator.
    const FLASH_MS = 8000;

    // ----- Data sources -----
    //
    // Two sources, in order of preference:
    //
    //   1. the steamtrack API, which follows the PICS feed continuously and so
    //      gives the live state;
    //   2. updates.json, written by the GitHub Action, served same-origin.
    //
    // The API is not always reachable: it runs on a VM that may be powered
    // off, behind a tunnel whose address changes on every restart.
    // updates.json, on the other hand, is always there. So we try the API and
    // fall back to the file without the visitor seeing anything other than a
    // complete feed -- simply less fresh.
    //
    // The key below is PUBLIC by construction: everything served to the
    // browser is readable. It is therefore chosen so that its disclosure costs
    // nothing --
    //
    //   - read-only: it can neither add nor remove a game, the two only
    //     write endpoints refuse it with a 403;
    //   - bounded quota (5000/h): abuse stays capped, whereas an unlimited key
    //     would publish an unthrottled right to scrape;
    //   - dedicated to this site: it can be revoked without touching other access.
    //
    // The unlimited steamtrack keys are administration keys -- they allow
    // deleting a game along with its entire history -- and have no business
    // being in the JavaScript of a public site.
    const API_KEY = 'st_wKGo181hDZTAWdyiv0jeXszQUiTjGfmC';
    const API_APPID = 2467880;
    const TUNNEL_JSON =
        'https://raw.githubusercontent.com/cheapmanga/SteamTrack/main/tunnel.json';
    // steamtrack gateway: stable entry point, hosted on Cloudflare Pages
    // (repository cheapmanga/steamtrack-status, redeployed on every commit).
    // It reads the same address as above, checks that the service responds,
    // and redirects. It's the only address of the service that never changes --
    // hence the only one that can be hard-coded in a link.
    const STATUS_URL = 'https://steamtrack-status.pages.dev';
    // Last known address of the API. Keeping it avoids re-reading tunnel.json
    // on every load, and saves a round-trip at startup.
    const API_CACHE = 'fe-tracker-api-base';
    // Cap imposed by the /changes endpoint.
    const API_PAGE = 500;

    // The order fixes the order of the filter buttons.
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
    // May not exist: the button is only present on the tracker page.
    const refreshBtn = document.getElementById('refreshBtn');

    let allEvents = [];
    let visible = [];
    let shown = 0;
    let activeType = 'all';

    // Auto-refresh state.
    let autoEl = null;      // <span id="autoStatus">, created by the JS
    let nextAt = 0;         // timestamp of the next refresh
    let lastFetch = 0;      // timestamp of the last successful load
    let flashUntil = 0;     // end of the transient message display
    let flashText = '';
    let loading = false;
    let lastLive = false;   // did the last load come from the API?

    noiseEl.checked = localStorage.getItem(NOISE_KEY) === '1';

    // ----- API access -----

    // auth: only send the key to the steamtrack API. X-API-Key is a
    // non-standard header, hence subject to the CORS preflight; adding it to
    // the read of tunnel.json would break a request that GitHub serves just
    // fine without it.
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

    // Current address of the API. The cached address is tried first: when it
    // is still valid (the common case), the load does not cost the read of
    // tunnel.json.
    async function apiBase(force) {
        const cached = localStorage.getItem(API_CACHE);
        if (cached && !force) return cached;
        // Short delay: tunnel.json is only a switchboard, and the fallback to
        // updates.json must stay fast if GitHub does not respond.
        const data = await jsonFetch(TUNNEL_JSON, 8000);
        const url = (data && data.url || '').replace(/\/$/, '');
        if (!url) throw new Error('no tunnel address published');
        localStorage.setItem(API_CACHE, url);
        return url;
    }

    // The API exposes kind/occurred_at/change_number where the tracker expects
    // type/date/changeid. For announcements, the body lives in `changes`.
    function adaptEvent(e) {
        const payload = e.changes;
        const out = {
            id: e.source + ':' + (e.change_number || e.id),
            // Record rank on the API side. Kept so that the incremental
            // refresh follows the order of DISCOVERY and not the publication
            // date: an announcement posted yesterday and detected today
            // carries yesterday's date, so a filter on the date never brings
            // it back.
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

    // Loads from the API. `sinceId` lets refreshes request only what's new:
    // one request instead of the two that the full pagination of the 850+
    // events costs.
    async function loadFromApi(sinceId) {
        const base = await apiBase(false);
        const path = `${base}/v1/apps/${API_APPID}/changes?limit=${API_PAGE}`;
        const inc = sinceId ? '&since_id=' + encodeURIComponent(sinceId) : '';
        let data;
        try {
            data = await jsonFetch(path + inc, FETCH_MS, true);
        } catch (err) {
            // The cached address may predate a VM restart: we re-read
            // tunnel.json once before concluding there's an outage.
            const fresh = await apiBase(true);
            data = await jsonFetch(
                `${fresh}/v1/apps/${API_APPID}/changes?limit=${API_PAGE}` + inc,
                FETCH_MS, true);
        }

        const events = (data.changes || []).map(adaptEvent);
        // Pagination: the endpoint caps at 500. On a full load we go fetch the
        // rest, on an incremental refresh there is almost never a second page.
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

    // Largest known record rank, cursor of the incremental tracking.
    // Returns 0 if no event carries one: that's the case for a feed coming
    // from updates.json, which lacks these identifiers -- we then restart from
    // a full load rather than from an invented cursor.
    function maxRowId(events) {
        let max = 0;
        for (const e of events) {
            if (typeof e.rowid === 'number' && e.rowid > max) max = e.rowid;
        }
        return max;
    }

    // Tries the API, falls back to the static file. The fallback is not an
    // error: it's the nominal mode when the VM is powered off.
    async function fetchData(sinceId) {
        try {
            return await loadFromApi(sinceId);
        } catch (err) {
            const data = await jsonFetch('updates.json');
            data.live = false;
            return data;
        }
    }

    // ----- Loading -----
    // silent: background refresh, we destroy neither the already-rendered feed
    // nor the reading position if the network goes down.
    async function load(silent) {
        if (loading) return;
        loading = true;
        setBusy(true);
        if (silent) status('Refreshing...');

        try {
            // Without a maximum delay, a fetch that never resolves (captive
            // portal, wake from sleep) would leave loading at true forever:
            // the countdown would freeze and the button would stay disabled
            // until the page is reloaded.
            // Incremental refresh: when a feed is already rendered and the
            // last source was the API, request only what's new.
            // The cursor is the largest known rowid, not the most recent
            // date: an event recorded after the fact -- a Steam announcement
            // detected the day after it was posted -- carries an old date and
            // would stay invisible until the next full reload of the page.
            const sinceId = silent && allEvents.length && lastLive
                ? maxRowId(allEvents)
                : null;
            const data = await fetchData(sinceId);

            lastFetch = Date.now();
            lastLive = !!data.live;
            const known = new Set(allEvents.map(eventId));
            let events = (data.events || []).filter(e => e && e.date);

            if (sinceId) {
                // Partial response: it completes the feed, it does not replace
                // it. Without this merge a refresh with no new items would
                // empty the page.
                const seen = new Set(events.map(eventId));
                events = events.concat(
                    allEvents.filter(e => !seen.has(eventId(e))));
            }
            events.sort((a, b) => b.date.localeCompare(a.date));
            // The first successful load is not a new item: without this guard,
            // an initial failure followed by the network returning would
            // announce the whole feed as new ("815 new changes").
            const fresh = silent && allEvents.length
                ? events.filter(e => !known.has(eventId(e))).length
                : 0;

            allEvents = events;

            // We restore the reading position: a refresh must never bring the
            // user back to the top of the feed.
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
            // After a failure we retry much sooner than the nominal cycle:
            // announcing "retrying" to then do nothing for five minutes would
            // be misleading, and a page opened on an empty feed would stay
            // that way the whole time.
            if (silent) {
                flash('Refresh failed, retrying');
            } else {
                feedEl.replaceChildren(el('p', 'tracker-empty error',
                    'Could not load history: ' + err.message));
                // renderStats didn't run: the indicator isn't in the DOM yet,
                // we place it there so the countdown stays visible.
                if (!autoStatus().isConnected) statsEl.append(autoStatus());
            }
            schedule(RETRY_MS);
        } finally {
            loading = false;
            setBusy(false);
            // Show the countdown without waiting for the next beat: otherwise
            // the indicator stays empty for nearly a second after the render.
            tick();
        }
    }

    // Identity of an event: the changenumber when it exists, otherwise the
    // date + title pair, enough to spot a new entry.
    function eventId(event) {
        return event.changeid ? 'c' + event.changeid : event.date + '|' + (event.title || '');
    }

    function setBusy(on) {
        if (!refreshBtn) return;
        refreshBtn.classList.toggle('refreshing', on);
        refreshBtn.disabled = on;
    }

    // ----- Header -----
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
            // Server-side date, and date of the last REAL update of the data:
            // the file is only rewritten when it changes. So it does not move
            // on every check, nor on clicking Refresh -- hence "Data updated"
            // rather than "Last checked", which suggested the opposite. The
            // check, for its part, happens every 10 minutes.
            // The provenance is stated explicitly: served by the API, the feed
            // is the one from the live collector; served by the file, it dates
            // from the last run of the GitHub Action. Two different freshness
            // levels must not be shown the same way.
            const line = el('p', 'tracker-generated',
                `Data updated ${relative(data.generated)} ` +
                `(${absolute(data.generated)}) — `);
            // The source mention becomes a link to the steamtrack gateway,
            // and not to the tunnel: the tunnel's address changes on every VM
            // restart, this one is stable. The gateway announces the service
            // state and redirects to the current address -- so it's the only
            // one we can hard-code.
            //
            // The link is placed in both modes, including on the fallback:
            // it's precisely when the data is NOT live that we want to be able
            // to go check whether the service is down.
            line.append(data.live ? 'live from the ' : 'from the published snapshot — ');
            const link = el('a', 'tracker-source-link',
                data.live ? 'steamtrack API' : 'steamtrack status');
            link.href = STATUS_URL;
            link.target = '_blank';
            link.rel = 'noopener';
            link.title = 'steamtrack service status';
            line.append(link);
            statsEl.append(line);
        }

        // replaceChildren just emptied the container: the auto-refresh
        // indicator is reattached here to survive every render of the header.
        statsEl.append(autoStatus());
    }

    // ----- Auto-refresh indicator -----
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

    // Transient message: it hides the countdown for a few seconds.
    // highlight is only true for good news (new changes): a failure also goes
    // through here and must not show in cyan like a success.
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

        // The transient message has expired: we hand control back to the
        // countdown, so the highlight no longer has any reason to be.
        autoStatus().classList.remove('fresh');

        const left = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
        const mins = Math.floor(left / 60);
        const secs = left % 60;
        const countdown = `next in ${mins}:${String(secs).padStart(2, '0')}`;

        // The time of the last successful load, for its part, moves on every
        // click on Refresh: it's the visible feedback that the action did happen.
        status(lastFetch
            ? `Page refreshed at ${clock(lastFetch)} - ${countdown}`
            : `Next refresh in ${mins}:${String(secs).padStart(2, '0')}`);
    }

    // Categories of an event. types[] is the current format; the fallback to
    // type covers entries written before it was introduced.
    function typesOf(event) {
        return Array.isArray(event.types) && event.types.length
            ? event.types
            : [event.type];
    }

    // ----- Filters -----
    function renderFilters() {
        const counts = {};
        // A mixed event counts in each category where it appears: the sum of
        // the counters therefore exceeds the total, as with tags.
        allEvents.forEach(e => {
            typesOf(e).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
        });

        // "All" announces what will actually be shown: counting the
        // changenumbers while they are hidden gave a badge of 815 for 173
        // entries on screen.
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
    // keepCount: preserves the number of items already unrolled by the user,
    // so that an automatic refresh does not shrink the pagination.
    function apply(keepCount) {
        const query = searchEl.value.trim().toLowerCase();
        const noise = noiseEl.checked;

        visible = allEvents.filter(e => {
            // Changenumbers alone are 80% of the feed and say nothing:
            // hidden by default, as SteamDB does.
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

    // ----- Batch rendering -----
    // 795 events at once are thousands of nodes: we render in batches to keep
    // the page responsive.
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

            // Patch notes are long: we collapse them so they don't drown the feed.
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

    // Steam asset: preview on hover, download on click.
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

    // [duration of one unit in seconds, singular, plural]
    const UNITS = [
        [31536000, 'year', 'years'],
        [2592000, 'month', 'months'],
        [86400, 'day', 'days'],
        [3600, 'hour', 'hours'],
        [60, 'minute', 'minutes'],
    ];

    // The seconds are not a detail: without them, two refreshes in the same
    // minute show the same time, and the button looks inert.
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

    // ----- DOM utility -----
    // textContent everywhere: the content comes from Steam, never innerHTML.
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // ----- Asset preview -----
    // A single reused popover, and delegated listeners: the feed has hundreds
    // of links, equipping each one would be wasteful.

    let hover = null;       // current popover
    let hoverTimer = null;

    function showPreview(link) {
        hidePreview();

        const url = link.href;
        const kind = link.dataset.media;

        hover = el('div', 'tracker-preview loading');
        const frame = el('div', 'tracker-preview-frame');
        // Declared before loading: a cached resource calls ready()
        // synchronously, and the caption must already exist at that point.
        const caption = el('span', 'tracker-preview-caption', 'Loading...');

        // The listeners are set up BEFORE src: an already-cached resource
        // loads synchronously, and the event would fire before the listening.
        // This happens from the second hover on the same asset onward, which
        // would otherwise stay stuck on "Loading..." indefinitely.
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
            // Safety net for the case where the data is already there anyway.
            if (video.readyState >= 2) ready(video.videoWidth, video.videoHeight);
        } else {
            const img = document.createElement('img');
            img.alt = '';
            img.addEventListener('load', () => ready(img.naturalWidth, img.naturalHeight));
            img.addEventListener('error', fail);
            img.src = url;
            frame.append(img);
            if (img.complete) {
                // complete is also true on an errored image: it's
                // naturalWidth that tells the two apart.
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

    // Anchors the popover to the link, folding it back if it goes off screen.
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

        // Above the link by default, below it if there's no room.
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
        // Small delay: sweeping across the feed must not flicker previews.
        hoverTimer = setTimeout(() => showPreview(link), 180);
    });

    feedEl.addEventListener('mouseout', ev => {
        const link = ev.target.closest('.seg-media');
        if (!link) return;
        if (ev.relatedTarget && link.contains(ev.relatedTarget)) return;
        hidePreview();
    });

    window.addEventListener('scroll', hidePreview, { passive: true });

    // ----- Download -----
    // The download attribute is ignored cross-origin: the browser navigates
    // instead of saving. So we go through fetch + blob, which the Steam CDNs
    // allow (access-control-allow-origin: *).
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
            // Give the browser time to read the blob before releasing it.
            setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
        } catch (err) {
            // Offline, CORS refused, asset deleted: opening the original
            // is still more useful than doing nothing.
            window.open(url, '_blank', 'noopener,noreferrer');
        } finally {
            link.classList.remove('downloading');
        }
    });

    // ----- Events -----
    let searchTimer = null;
    searchEl.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(apply, 150);
    });

    noiseEl.addEventListener('change', () => {
        localStorage.setItem(NOISE_KEY, noiseEl.checked ? '1' : '0');
        // The "All" badge depends on this checkbox: it must be recomputed.
        renderFilters();
        apply();
    });

    moreBtn.addEventListener('click', more);

    // Manual refresh: same path as the auto one, and the countdown restarts
    // from zero since load() reschedules on the way out.
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => load(true));
    }

    // A single one-second interval drives both the countdown and the
    // triggering of the reload: no second timer to resynchronize.
    setInterval(tick, 1000);

    load();
})();
