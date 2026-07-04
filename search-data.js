// ===== INDEX DE RECHERCHE — ENTRÉES STATIQUES =====
// Ne contient QUE les entrées qui ne sont pas des glitches (pages dédiées,
// mods, outils). Les glitches sont générés automatiquement depuis
// glitches.json par search.js — plus de doublon à maintenir ici.
//
// Pour rendre un glitch cherchable : il suffit de l'ajouter à glitches.json.
// Champs optionnels dans glitches.json pour soigner l'affichage dans la
// recherche : "search_icon", "search_desc" (par glitch) et "search_category"
// (par section). À défaut, repli sur l'icône de section, alt_names/how_to.

const staticSearchIndex = [
    // --- Void Cancel (page dédiée) ---
    { title: "Void Cancel Guide", category: "Any%", page: "voidcancel.html", target: "", desc: "Complete detailed guide to bypass fall limits", icon: "fa-book-open" },
    { title: "Void Cancel (CS Method)", category: "Glitch", page: "voidcancel.html", target: "", desc: "Primary method using Cutscene Skip", icon: "fa-film" },
    { title: "Void Cancel (Death Method)", category: "Glitch", page: "voidcancel.html", target: "", desc: "Alternative method without CS", icon: "fa-skull" },

    // --- Mods ---
    { title: "Teleport Mod", category: "Mod", page: "mods.html", target: "", desc: "Alternative to Cheat Engine - F6/F7", icon: "fa-location-arrow" },
    { title: "Volume Mod", category: "Mod", page: "mods.html", target: "", desc: "See invisible walls & triggers", icon: "fa-border-all" },

    // --- Outils ---
    { title: "LiveSplit", category: "Tool", page: "speedrun.html", target: "tools", desc: "Timing software with auto-splitter", icon: "fa-stopwatch" },
    { title: "Cheat Engine", category: "Tool", page: "speedrun.html", target: "tools", desc: "Practice tool for teleportation", icon: "fa-microchip" },
    { title: "Infinite Health", category: "Tool", page: "speedrun.html", target: "tools", desc: "Invincibility cheat with Cheat Engine", icon: "fa-heart" },
    { title: "Older Demo", category: "Tool", page: "speedrun.html", target: "tools", desc: "Previous demo version for glitch hunters", icon: "fa-gamepad" }
];
