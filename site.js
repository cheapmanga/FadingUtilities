// ===== SCRIPTS COMMUNS =====
// Particules d'eau et défilement doux.
// Chargé sur toutes les pages. Aucun handler inline (compatible CSP).

(function () {
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
