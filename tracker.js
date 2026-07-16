// ===== PAGE TRACKER =====
// Lit updates.json (ecrit toutes les 15 min par la GitHub Action fe-tracker),
// affiche le flux et signale les nouveautes par son + notification systeme.
//
// L'email part de la GitHub Action, pas d'ici : cette page ne notifie que
// pendant qu'elle est ouverte.
//
// ?widget=1 : rend le panneau en pleine fenetre, pour un embed iframe / OBS.

(function () {
    const POLL_MS = 60000;
    const SEEN_KEY = 'fe-tracker-seen';
    const MUTED_KEY = 'fe-tracker-muted';

    const feedEl = document.getElementById('trackerFeed');
    const statusEl = document.getElementById('trackerStatus');
    const checkedEl = document.getElementById('trackerChecked');
    const armBtn = document.getElementById('armBtn');
    const muteBtn = document.getElementById('muteBtn');

    let seen = loadSeen();
    let muted = localStorage.getItem(MUTED_KEY) === '1';
    let audioCtx = null;

    if (new URLSearchParams(location.search).get('widget') === '1') {
        document.getElementById('trackerWidget').classList.add('embed');
    }

    // ----- Persistance des evenements deja vus -----
    function loadSeen() {
        try {
            return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []);
        } catch {
            return new Set();
        }
    }

    function saveSeen() {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
    }

    // ----- Son -----
    // Les navigateurs exigent un geste utilisateur avant tout audio : le
    // contexte n'est cree qu'au clic sur "Activer les alertes".
    function beep() {
        if (muted || !audioCtx) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const now = audioCtx.currentTime;
        [880, 1320].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, now + i * 0.16);
            gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.16 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.15);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(now + i * 0.16);
            osc.stop(now + i * 0.16 + 0.16);
        });
    }

    // ----- Notification systeme -----
    function notify(event) {
        if (Notification.permission !== 'granted') return;
        const n = new Notification(event.title, {
            body: event.body.slice(0, 220),
            icon: 'Images/favicon.png',
            tag: event.id,
        });
        if (event.url) {
            n.onclick = () => { window.open(event.url, '_blank', 'noopener'); };
        }
    }

    // ----- Rendu -----
    function render(events) {
        if (!events.length) {
            feedEl.innerHTML = '<p class="tracker-empty">Aucune update enregistree pour le moment.</p>';
            return;
        }
        feedEl.replaceChildren(...events.map(card));
    }

    function card(event) {
        const el = document.createElement('div');
        el.className = 'tracker-item ' + event.type;
        if (!seen.has(event.id)) el.classList.add('unseen');

        const meta = document.createElement('div');
        meta.className = 'tracker-meta';

        const tag = document.createElement('span');
        tag.className = 'tracker-tag';
        tag.textContent = event.type === 'build' ? 'BUILD' : 'NEWS';
        meta.append(tag, document.createTextNode(formatDate(event.date)));
        if (event.feed) meta.append(document.createTextNode('· ' + event.feed));

        const title = document.createElement('h3');
        title.textContent = event.title;

        const body = document.createElement('div');
        body.className = 'tracker-body';
        body.textContent = event.body;

        el.append(meta, title, body);

        if (event.url) {
            const link = document.createElement('a');
            link.className = 'tracker-link';
            link.href = event.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'Ouvrir sur Steam →';
            el.append(link);
        }
        return el;
    }

    function formatDate(iso) {
        const d = new Date(iso);
        return isNaN(d) ? iso : d.toLocaleString('fr-FR', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        });
    }

    // ----- Polling -----
    async function poll() {
        try {
            const resp = await fetch('updates.json', { cache: 'no-store' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            const events = data.events || [];

            const fresh = events.filter(e => !seen.has(e.id));
            render(events);

            // Au tout premier chargement, tout le flux est "nouveau" : on
            // enregistre sans alerter, sinon la page hurle des l'ouverture.
            const firstRun = seen.size === 0;
            if (fresh.length && !firstRun) {
                beep();
                fresh.forEach(notify);
            }
            fresh.forEach(e => seen.add(e.id));
            saveSeen();

            statusEl.textContent = events.length + ' updates suivies';
            statusEl.classList.remove('error');
            checkedEl.textContent = 'Verifie a ' + new Date().toLocaleTimeString('fr-FR');
        } catch (err) {
            statusEl.textContent = 'Erreur de chargement : ' + err.message;
            statusEl.classList.add('error');
        }
    }

    // ----- Controles -----
    armBtn.addEventListener('click', async () => {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') await audioCtx.resume();

        if (Notification.permission === 'default') await Notification.requestPermission();

        const ok = Notification.permission === 'granted';
        armBtn.classList.add('armed');
        armBtn.querySelector('span').textContent = ok ? 'Alertes actives' : 'Son actif (notifs refusees)';
        beep();
    });

    function paintMute() {
        muteBtn.querySelector('i').className = muted ? 'fas fa-volume-xmark' : 'fas fa-volume-high';
        muteBtn.title = muted ? 'Reactiver le son' : 'Couper le son';
    }

    muteBtn.addEventListener('click', () => {
        muted = !muted;
        localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
        paintMute();
    });

    paintMute();
    poll();
    setInterval(poll, POLL_MS);
})();
