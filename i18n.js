// ===== INTERNATIONALIZATION SYSTEM =====
(function() {
    const STORAGE_KEY = 'fadingutilities_lang';
    let currentLang = localStorage.getItem(STORAGE_KEY) || 'en';

    function applyTranslations() {
        const lang = translations[currentLang];
        if (!lang) return;

        // Traduire les éléments avec data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (lang[key]) {
                el.textContent = lang[key];
            }
        });

        // Traduire les placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (lang[key]) {
                el.placeholder = lang[key];
            }
        });

        // Traduire les titres (title attribute)
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (lang[key]) {
                el.title = lang[key];
            }
        });

        // Mettre à jour le bouton de langue
        const langBtn = document.getElementById('langToggle');
        if (langBtn) {
            langBtn.textContent = currentLang === 'en' ? 'FR' : 'EN';
            langBtn.setAttribute('aria-label', 
                currentLang === 'en' ? 'Switch to French' : 'Passer en français'
            );
        }

        // Mettre à jour la balise html lang
        document.documentElement.lang = currentLang;
    }

    function toggleLanguage() {
        currentLang = currentLang === 'en' ? 'fr' : 'en';
        localStorage.setItem(STORAGE_KEY, currentLang);
        applyTranslations();
    }

    // Exposer la fonction globalement
    window.toggleLanguage = toggleLanguage;

    // Appliquer au chargement
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyTranslations);
    } else {
        applyTranslations();
    }
})();