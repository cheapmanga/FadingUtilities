// ===== INDEX DE RECHERCHE GLOBAL =====
// Index unique partagé par toutes les pages (chargé avant search.js).
// Avant, chaque page avait sa propre copie, qui divergeait.

const pageSearchIndex = [
    // --- Glitches / mouvements ---
    { title: "Hyper Dash (HD)", category: "Glitch", page: "speedrun.html", target: "glitches", desc: "Wave Dash, Long Jump, Collision Jump, Ricochet", icon: "fa-bolt" },
    { title: "Form Dash (FD)", category: "Glitch", page: "speedrun.html", target: "glitches", desc: "Water Dash, Drop Dash, FDP", icon: "fa-wind" },
    { title: "Jump Switch (JS)", category: "Glitch", page: "speedrun.html", target: "glitches", desc: "Element Switch, Switch Boost, Poison JS", icon: "fa-arrow-up" },
    { title: "Hyper Switch (HS)", category: "Glitch", page: "speedrun.html", target: "glitches", desc: "Combo of Hyper Dash and Jump Switch", icon: "fa-bolt" },
    { title: "Jump Kick (JK)", category: "Glitch", page: "speedrun.html", target: "glitches", desc: "Gain momentum up", icon: "fa-shoe-prints" },
    { title: "Cutscene Skip (CS)", category: "Any%", page: "speedrun.html", target: "glitches", desc: "Key glitch for Any% runs - WR 3:57.04", icon: "fa-film" },
    { title: "Void Cancel (VC)", category: "Any%", page: "speedrun.html", target: "glitches", desc: "Fall forever, bypass void/respawn", icon: "fa-ban" },
    { title: "Void Cancel Guide", category: "Any%", page: "voidcancel.html", target: "", desc: "Complete detailed guide to bypass fall limits", icon: "fa-book-open" },
    { title: "Void Cancel (CS Method)", category: "Glitch", page: "voidcancel.html", target: "", desc: "Primary method using Cutscene Skip", icon: "fa-film" },
    { title: "Void Cancel (Death Method)", category: "Glitch", page: "voidcancel.html", target: "", desc: "Alternative method without CS", icon: "fa-skull" },
    { title: "Infinite Dash (ID)", category: "Any%", page: "speedrun.html", target: "glitches", desc: "Void, Voidless, Respawn variations", icon: "fa-infinity" },
    { title: "Jojo Glitch", category: "Any%", page: "speedrun.html", target: "glitches", desc: "Tube Glitch, Flying Glitch, Volcano Skip", icon: "fa-bug" },
    { title: "Portal Glitch", category: "Glitch", page: "speedrun.html", target: "glitches", desc: "Portal Wrong Load, OOB", icon: "fa-door-open" },
    { title: "Glitch²", category: "Glitch", page: "speedrun.html", target: "glitches", desc: "Glitch Glitch, GG, invincibility", icon: "fa-radiation" },
    { title: "Infinite Core Glitch", category: "Breakthrough", page: "speedrun.html", target: "glitches", desc: "Point Zero, WIP", icon: "fa-star" },
    { title: "Point Zero", category: "Breakthrough", page: "speedrun.html", target: "glitches", desc: "Coordinates far from levels", icon: "fa-map-pin" },

    // --- Mods ---
    { title: "Teleport Mod", category: "Mod", page: "mods.html", target: "", desc: "Alternative to Cheat Engine - F6/F7", icon: "fa-location-arrow" },
    { title: "Volume Mod", category: "Mod", page: "mods.html", target: "", desc: "See invisible walls & triggers", icon: "fa-border-all" },

    // --- Outils ---
    { title: "LiveSplit", category: "Tool", page: "speedrun.html", target: "tools", desc: "Timing software with auto-splitter", icon: "fa-stopwatch" },
    { title: "Cheat Engine", category: "Tool", page: "speedrun.html", target: "tools", desc: "Practice tool for teleportation", icon: "fa-microchip" },
    { title: "Infinite Health", category: "Tool", page: "speedrun.html", target: "tools", desc: "Invincibility cheat with Cheat Engine", icon: "fa-heart" },
    { title: "Older Demo", category: "Tool", page: "speedrun.html", target: "tools", desc: "Previous demo version for glitch hunters", icon: "fa-gamepad" }
];
