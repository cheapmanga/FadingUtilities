// ===== SCRIPTS COMMUNS =====
// Menu hamburger, particules d'eau et défilement doux.
// Chargé sur toutes les pages. Aucun handler inline (compatible CSP).

(function () {
    // ----- Menu hamburger -----
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');

    function closeMenu() {
        hamburger.classList.remove('active');
        mobileMenu.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    }

    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            mobileMenu.classList.toggle('active');
            const open = mobileMenu.classList.contains('active');
            hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
            document.body.style.overflow = open ? 'hidden' : '';
        });

        // Ferme au clic sur le fond ou sur un lien du menu
        mobileMenu.addEventListener('click', (e) => {
            if (e.target === mobileMenu || e.target.closest('a')) closeMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileMenu.classList.contains('active')) closeMenu();
        });
    }

    // ----- Particules d'eau -----
    function createWaterParticle() {
        const particle = document.createElement('div');
        particle.className = 'water-particle';
        particle.style.left = Math.random() * 100 + 'vw';
        particle.style.width = Math.random() * 10 + 5 + 'px';
        particle.style.height = particle.style.width;
        particle.style.animationDuration = Math.random() * 3 + 2 + 's';
        document.body.appendChild(particle);
        setTimeout(() => { particle.remove(); }, 5000);
    }
    setInterval(createWaterParticle, 500);

    // ----- Défilement doux vers les ancres -----
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (href === '#') return; // liens gérés en JS (ex: back-btn)
        anchor.addEventListener('click', function (e) {
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
})();
