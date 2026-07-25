// ===== SHARED SCRIPTS =====
// Water particles and smooth scrolling.
// Loaded on every page. No inline handlers (CSP-compatible).

(function () {
    // ----- Water particles -----
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

    // ----- Smooth scrolling to anchors -----
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (href === '#') return; // links handled in JS (e.g. back-btn)
        anchor.addEventListener('click', function (e) {
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
})();
