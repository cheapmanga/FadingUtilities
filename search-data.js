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
    { title: "Teleport Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Alternative to Cheat Engine - F6/F7", icon: "fa-location-arrow" },
    { title: "Volume Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "See invisible walls & triggers", icon: "fa-border-all" },
    { title: "Core Giver Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Give yourself elemental cores (water, waste, fire, glitch, power)", icon: "fa-atom" },
    { title: "MoonJump Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Infinite jump / BotW-style flight", icon: "fa-feather" },
    { title: "Chest Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Teleport yourself to all loaded chests", icon: "fa-box-open" },
    { title: "KillAll Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Kills all loaded enemies", icon: "fa-skull-crossbones" },
    { title: "Source Giver Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Give yourself connected sources - at 12 opens the ending", icon: "fa-plug-circle-bolt" },
    { title: "XP Giver Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Give yourself Ætherfact points (skill points)", icon: "fa-star" },
    { title: "Skins Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Access One's hidden skins, swap her model or strip the outline", icon: "fa-shirt" },
    { title: "Bad Apple Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Play Bad Apple rendered live by the game's own cubes", icon: "fa-play" },

    // --- Tracker ---
    { title: "Updates", category: "Steam", page: "tracker.html", target: "", desc: "Steam update tracker: builds, depots, branches and patch notes", icon: "fa-satellite-dish" },

    // --- Outils (désormais sur la page Mods & Tools) ---
    { title: "LiveSplit", category: "Tool", page: "mods-tools.html", target: "tools", desc: "Timing software with auto-splitter", icon: "fa-stopwatch" },
    { title: "Cheat Engine", category: "Tool", page: "mods-tools.html", target: "tools", desc: "Practice tool for teleportation", icon: "fa-microchip" },
    { title: "Infinite Health", category: "Tool", page: "mods-tools.html", target: "tools", desc: "Invincibility cheat with Cheat Engine", icon: "fa-heart" },
    { title: "Older Demo", category: "Tool", page: "mods-tools.html", target: "tools", desc: "Previous demo versions for glitch hunters", icon: "fa-gamepad" }
];
