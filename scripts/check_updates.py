#!/usr/bin/env python3
"""Detecte les changements de Fading Echo et alimente updates.json.

Deux sources, comme SteamDB :

  - Steam PICS via api.steamcmd.net : l'appinfo complet du jeu. On garde un
    snapshot du run precedent et on en fait un diff, ce qui detecte builds,
    depots, branches (y compris les branches de test) et metadonnees store,
    donc aussi les patchs pousses sans annonce.
  - ISteamNews : les annonces et patch notes publies par le studio.

Le format des evenements produits est celui de parse_steamdb_history.py, pour
que la page rende l'historique importe et le suivi live de la meme façon.

Sorties :
  updates.json      flux complet lu par tracker.html
  new_updates.json  nouveautes du run, consommees par format_email.py
Code de sortie 0 meme sans nouveaute : l'absence de changement n'est pas une erreur.
"""

import html as html_mod
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

APPID = "2467880"
PICS_URL = f"https://api.steamcmd.net/v1/info/{APPID}"
NEWS_URL = (
    "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"
    f"?appid={APPID}&count=20&maxlength=0"
)
USER_AGENT = "FadingUtilities-tracker/2.0 (+https://github.com/cheapmanga/FadingUtilities)"

ROOT = Path(__file__).resolve().parent.parent
UPDATES_FILE = ROOT / "updates.json"
SNAPSHOT_FILE = ROOT / "data" / "pics_snapshot.json"
NEW_FILE = ROOT / "new_updates.json"

# Un evenement par changenumber suffit ; au-dela on tronque le flux pour que
# updates.json reste raisonnable a servir et a differ dans git.
MAX_EVENTS = 1200

# Chemins PICS trop bruyants pour meriter une entree : ils bougent a chaque
# rebuild du store sans rien dire d'utile.
NOISE_PATHS = (
    "common/icon",
    "common/clienticon",
    "common/clienttga",
    "common/community_hub_visible",
)

# Prefixe de chemin PICS -> categorie affichee. Premier match gagnant.
CATEGORY_RULES = [
    ("build", ("buildid", "timebuildupdated")),
    ("branch", ("branches", "privatebranches")),
    ("depot", ("depots", "manifests")),
    ("assets", (
        "library_assets", "header_image", "small_capsule", "library_capsule",
        "movie", "screenshots", "logo", "store_asset",
    )),
    ("store", (
        "common/name", "store_tags", "genres", "associations", "release",
        "languages", "price", "supported", "playtest", "franchise",
    )),
]


def log(msg):
    print(msg, flush=True)


def fetch_json(url, attempts=3):
    """GET + JSON, avec quelques reessais. Retourne None si l'API est muette."""
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=45) as resp:
                return json.load(resp)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            log(f"  ! {url.split('/')[2]} tentative {attempt}/{attempts} : {exc}")
    return None


# --- PICS ----------------------------------------------------------------

def fetch_appinfo():
    payload = fetch_json(PICS_URL)
    if not payload or payload.get("status") != "success":
        return None
    return payload.get("data", {}).get(APPID)


def flatten(obj, prefix=""):
    """Aplati l'appinfo imbrique en {chemin: valeur} pour un diff simple."""
    flat = {}
    if isinstance(obj, dict):
        for key, value in obj.items():
            flat.update(flatten(value, f"{prefix}/{key}" if prefix else str(key)))
    elif isinstance(obj, list):
        for index, value in enumerate(obj):
            flat.update(flatten(value, f"{prefix}/{index}"))
    else:
        flat[prefix] = obj
    return flat


def categorize(paths):
    joined = " ".join(paths).lower()
    for name, keywords in CATEGORY_RULES:
        if any(kw in joined for kw in keywords):
            return name
    return "meta"


def pretty_path(path):
    """'depots/branches/public/buildid' -> 'depots > branches > public'."""
    parts = path.split("/")
    return " > ".join(parts[:-1]) if len(parts) > 1 else ""


# PICS stocke les assets en chemin relatif ("<hash>/header.jpg") ; le CDN les
# sert sous cette racine. La reconstruire permet a la page de previsualiser les
# assets detectes en direct, comme ceux importes de SteamDB.
ASSET_ROOT = f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{APPID}/"
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".ico", ".bmp")
VIDEO_EXT = (".mp4", ".webm")


def asset_media(value):
    """('url', 'image'|'video') si la valeur designe un asset, sinon (None, None)."""
    if not isinstance(value, str) or "/" not in value or len(value) > 300:
        return None, None
    lowered = value.split("?")[0].lower()
    if lowered.endswith(IMAGE_EXT):
        kind = "image"
    elif lowered.endswith(VIDEO_EXT):
        kind = "video"
    else:
        return None, None
    # Une URL deja absolue (les trailers en donnent) se suffit a elle-meme.
    if value.startswith("https://"):
        return value, kind
    if value.startswith("http://"):
        return None, None
    return ASSET_ROOT + value.lstrip("/"), kind


def value_seg(kind, value):
    """Segment de valeur, enrichi de son URL quand c'est un asset."""
    seg = {"t": kind, "v": str(value)}
    url, media = asset_media(value)
    if url:
        seg["href"] = url
        seg["media"] = media
    return seg


def diff_appinfo(old, new):
    """Compare deux snapshots PICS et rend des noeuds au format du tracker."""
    old_flat, new_flat = flatten(old), flatten(new)
    new_change = new_flat.get("_change_number")

    # Metadonnees de transport : le changenumber sert de detecteur (traite plus
    # bas), le sha et la taille sont derives du reste et feraient double emploi.
    for key in ("_change_number", "_sha", "_size", "_missing_token", "public_only"):
        old_flat.pop(key, None)
        new_flat.pop(key, None)

    groups = {}
    touched = []
    buildid = None

    for path in sorted(set(old_flat) | set(new_flat)):
        if any(noise in path for noise in NOISE_PATHS):
            continue
        before, after = old_flat.get(path), new_flat.get(path)
        if before == after:
            continue

        if before is None:
            op, verb = "added", "Added"
        elif after is None:
            op, verb = "removed", "Removed"
        else:
            op, verb = "modified", "Changed"

        touched.append(path)
        field = path.split("/")[-1]
        # Seule la branche public merite le titre : une build sur une branche
        # de test ne doit pas passer pour la version jouable du jour.
        if field == "buildid" and after is not None and "/public/" in f"/{path}/":
            buildid = str(after)
        seg = [{"t": "text", "v": f"{verb} "}, {"t": "field", "v": f"{field}:"}]
        if before is not None:
            seg.append(value_seg("del", before))
        if before is not None and after is not None:
            seg.append({"t": "text", "v": " › "})
        if after is not None:
            seg.append(value_seg("ins", after))

        groups.setdefault(pretty_path(path), []).append(
            {"op": op, "seg": seg, "children": []}
        )

    if not touched:
        return None, new_change

    # Un noeud parent par sous-arbre modifie, pour retrouver le regroupement
    # visuel de SteamDB (Depots > public branch > champs).
    changes = []
    for group, nodes in sorted(groups.items()):
        if group:
            changes.append({
                "op": "none",
                "seg": [{"t": "text", "v": "Changed "}, {"t": "field", "v": group}],
                "children": nodes,
            })
        else:
            changes.extend(nodes)

    return {"changes": changes, "paths": touched, "buildid": buildid}, new_change


def build_opaque_event(previous, changenumber, now):
    """Changelist publie sans aucun changement visible dans l'appinfo public.

    L'API anonyme ne renvoie pas la section depots de Fading Echo
    (_missing_token), donc ni buildid ni manifests. Quand le changenumber bouge
    alors que tout le reste est identique, la seule lecture raisonnable est
    qu'une build a ete poussee : on l'enregistre comme telle, sans inventer un
    numero qu'on n'a pas.
    """
    changeid = str(changenumber)
    old = previous.get("_change_number", "?")
    return {
        "id": f"change:{changeid}",
        "type": "build",
        "changeid": changeid,
        "title": "Build pushed (content not public)",
        "url": f"https://steamdb.info/app/{APPID}/history/?changeid={changeid}",
        "source": "pics",
        "date": now,
        "opaque": True,
        "changes": [{
            "op": "modified",
            "seg": [
                {"t": "text", "v": "Changed "},
                {"t": "field", "v": "ChangeNumber:"},
                {"t": "del", "v": str(old)},
                {"t": "text", "v": " › "},
                {"t": "ins", "v": changeid},
            ],
            "children": [{
                "op": "none",
                "seg": [{
                    "t": "muted",
                    "v": "Aucun changement dans l'appinfo public : le patch porte "
                         "sur les depots, que l'API anonyme ne renvoie pas. "
                         "Le buildid n'est lisible que sur SteamDB.",
                }],
                "children": [],
            }],
        }],
    }


def build_pics_event(diff, changenumber, now):
    # Un buildid pousse merite le titre : c'est l'info utile du patch.
    buildid = diff.get("buildid")
    if buildid:
        head = None
    else:
        fields = []
        for path in diff["paths"]:
            field = path.split("/")[-1]
            if field.isdigit():
                field = path.split("/")[-2] if "/" in path else field
            if field not in fields:
                fields.append(field)

        head = ", ".join(fields[:3])
        if len(fields) > 3:
            head += f" +{len(fields) - 3}"

    changeid = str(changenumber or int(datetime.now(timezone.utc).timestamp()))
    return {
        "id": f"change:{changeid}",
        "type": categorize(diff["paths"]),
        "changeid": changeid,
        "title": f"Build {buildid}" if buildid else f"Changed {head}",
        "url": f"https://steamdb.info/app/{APPID}/history/?changeid={changeid}",
        "source": "pics",
        "date": now,
        "changes": diff["changes"],
    }


# --- News ----------------------------------------------------------------

def clean_bbcode(text):
    """Le contenu Steam est du BBCode ; on le rend lisible en texte brut."""
    text = re.sub(r"\[img\][^\[]*\[/img\]", "", text, flags=re.I)
    text = re.sub(r"\[url=([^\]]+)\](.*?)\[/url\]", r"\2 (\1)", text, flags=re.I | re.DOTALL)
    text = re.sub(r"\[/?[a-z][^\]]*\]", "", text, flags=re.I)
    text = html_mod.unescape(text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def fetch_news():
    payload = fetch_json(NEWS_URL)
    if not payload:
        return []

    events = []
    for item in payload.get("appnews", {}).get("newsitems", []):
        stamp = datetime.fromtimestamp(int(item.get("date", 0)), tz=timezone.utc)
        events.append({
            "id": f"news:{item['gid']}",
            "type": "news",
            "changeid": item["gid"],
            "title": item.get("title", "(sans titre)"),
            "url": item.get("url", ""),
            "source": "news",
            "author": item.get("author", ""),
            "feed": item.get("feedlabel", ""),
            "body": clean_bbcode(item.get("contents", "")),
            "date": stamp.isoformat(),
            "changes": [],
        })
    return events


# --- Orchestration -------------------------------------------------------

def load_events():
    if not UPDATES_FILE.exists():
        return []
    try:
        return json.loads(UPDATES_FILE.read_text(encoding="utf-8")).get("events", [])
    except (json.JSONDecodeError, OSError) as exc:
        log(f"updates.json illisible ({exc}) : on repart du flux vide.")
        return []


def main():
    existing = load_events()
    known = {e["id"] for e in existing}
    now = datetime.now(timezone.utc).isoformat()
    fresh = []

    appinfo = fetch_appinfo()
    if appinfo is None:
        log("PICS injoignable : on continue avec les news seules.")
    else:
        previous = None
        if SNAPSHOT_FILE.exists():
            try:
                previous = json.loads(SNAPSHOT_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                log(f"Snapshot PICS illisible ({exc}) : on le reamorce.")

        if previous is None:
            # Sans snapshot precedent, tout l'appinfo ressemble a une nouveaute.
            # On amorce en silence plutot que d'annoncer un faux patch.
            log("Amorcage du snapshot PICS, aucun diff pour ce run.")
        else:
            diff, changenumber = diff_appinfo(previous, appinfo)
            moved = changenumber != previous.get("_change_number")

            if diff:
                event = build_pics_event(diff, changenumber, now)
            elif moved:
                # Cas le plus important du tracker : Steam a publie un
                # changelist, mais rien n'a bouge dans l'appinfo public. Le
                # changement est donc dans une section que l'API anonyme ne
                # renvoie pas (depots, branches, manifests) : en pratique, une
                # nouvelle build. On ne peut pas en lire le buildid, seulement
                # constater qu'elle existe.
                event = build_opaque_event(previous, changenumber, now)
            else:
                event = None
                log("PICS : aucun changement.")

            if event and event["id"] not in known:
                fresh.append(event)
                log(f"PICS : {event['title']}")

        SNAPSHOT_FILE.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT_FILE.write_text(
            json.dumps(appinfo, indent=1, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    news = [e for e in fetch_news() if e["id"] not in known]
    if news:
        log(f"News : {len(news)} nouvelle(s).")
    fresh += news

    # ISteamNews renvoie les 20 dernieres annonces a chaque appel : au premier
    # run, tout ce backlog est inedit et partirait en 20 mails. On l'enregistre
    # en silence.
    # PICS n'a pas besoin de ce garde-fou : son amorçage est deja gere par
    # l'absence de snapshot, qui ne produit aucun evenement. L'y soumettre
    # reviendrait a taire la toute premiere build detectee, justement celle qui
    # justifie le tracker.
    seen_sources = {e.get("source") for e in existing}
    notify = []
    for event in fresh:
        if event["source"] == "news" and "news" not in seen_sources:
            continue
        notify.append(event)

    if fresh and not notify:
        log("Amorcage des news : enregistrees sans notification.")

    merged = sorted(fresh + existing, key=lambda e: e["date"], reverse=True)[:MAX_EVENTS]
    UPDATES_FILE.write_text(
        json.dumps({"generated": now, "appid": APPID, "events": merged},
                   indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    NEW_FILE.write_text(json.dumps(notify, indent=1, ensure_ascii=False) + "\n",
                        encoding="utf-8")

    log(f"{len(fresh)} nouveaux evenements, {len(notify)} a notifier.")

    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"has_new={'true' if notify else 'false'}\n")
            fh.write(f"count={len(notify)}\n")
            if notify:
                subject = notify[0]["title"].replace("\n", " ")[:120]
                fh.write(f"subject={subject}\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
