// ===== SEARCH INDEX — STATIC ENTRIES =====
// Contains ONLY the entries that are not glitches (dedicated pages,
// mods, tools). Glitches are generated automatically from
// glitches.json by search.js — no more duplicates to maintain here.
//
// To make a glitch searchable: just add it to glitches.json.
// Optional fields in glitches.json to refine how it appears in the
// search: "search_icon", "search_desc" (per glitch) and "search_category"
// (per section). Otherwise, falls back to the section icon, alt_names/how_to.

const staticSearchIndex = [
    // --- Void Cancel (dedicated page) ---
    { title: "Void Cancel Guide", category: "Any%", page: "voidcancel.html", target: "", desc: "Complete detailed guide to bypass fall limits", icon: "fa-book-open" },
    { title: "Void Cancel (CS Method)", category: "Glitch", page: "voidcancel.html", target: "", desc: "Primary method using Cutscene Skip", icon: "fa-film" },
    { title: "Void Cancel (No Cutscene Skip)", category: "Glitch", page: "voidcancel.html", target: "", desc: "Alternative method without CS — not possible anymore, until further proof", icon: "fa-skull" },

    // --- Mods ---
    { title: "Teleport Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Alternative to Cheat Engine - F6/F7", icon: "fa-location-arrow" },
    { title: "Volume Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "See invisible walls & triggers", icon: "fa-border-all" },
    { title: "Core Giver Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Give yourself elemental cores (water, waste, fire, glitch, power)", icon: "fa-atom" },
    { title: "Ascend Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Rise while jump is held, plus unlimited mid-air re-jumps", icon: "fa-feather" },
    { title: "Chest Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Teleport yourself to all loaded chests", icon: "fa-box-open" },
    { title: "KillAll Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Kills all loaded enemies", icon: "fa-skull-crossbones" },
    { title: "Source Giver Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Give yourself connected sources - at 12 opens the ending", icon: "fa-plug-circle-bolt" },
    { title: "XP Giver Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Give yourself Ætherfact points (skill points)", icon: "fa-star" },
    { title: "Skins Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Access One's hidden skins, swap her model or strip the outline", icon: "fa-shirt" },
    { title: "Skin Menu Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Every skin in the game's own Options menu — One's five plus Bob's Marcel Bob (build 1.0.27953)", icon: "fa-palette" },
    { title: "Bad Apple Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Play Bad Apple rendered live by the game's own cubes", icon: "fa-play" },
    { title: "Void Cancel Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "F9/F10 toggle: fall forever, no void, no respawn — and turn it back off", icon: "fa-arrow-down-long" },
    { title: "Game Speed Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Slow-motion or fast-forward the whole game", icon: "fa-gauge-high" },
    { title: "Gravity Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Scale the player gravity — floaty jumps or none at all", icon: "fa-feather-pointed" },
    { title: "Camera FOV Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Change the camera field of view, with an optional lock", icon: "fa-video" },
    { title: "Screenshot Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "High-resolution screenshots, up to 8x the screen size", icon: "fa-camera" },
    { title: "HUD Mod", category: "Mod", page: "mods-tools.html", target: "", desc: "Show or hide the HUD for clean screenshots and capture", icon: "fa-eye-slash" },

    // --- Tracker ---
    { title: "Updates", category: "Steam", page: "tracker.html", target: "", desc: "Steam update tracker: builds, depots, branches and patch notes", icon: "fa-satellite-dish" },

    // --- Tools (now on the Mods & Tools page) ---
    { title: "LiveSplit", category: "Tool", page: "mods-tools.html", target: "tools", desc: "Timing software with auto-splitter", icon: "fa-stopwatch" },
    { title: "Cheat Engine", category: "Tool", page: "mods-tools.html", target: "tools", desc: "Practice tool for teleportation", icon: "fa-microchip" },
    { title: "Infinite Health", category: "Tool", page: "mods-tools.html", target: "tools", desc: "Invincibility cheat with Cheat Engine", icon: "fa-heart" },
    { title: "Older Demo", category: "Tool", page: "mods-tools.html", target: "tools", desc: "Previous demo versions for glitch hunters", icon: "fa-gamepad" }
];
