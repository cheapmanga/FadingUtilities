#!/usr/bin/env python3
"""Convertit une page History de SteamDB (sauvegardee en HTML) en updates.json.

SteamDB bloque les scripts (Cloudflare 403), donc l'historique anterieur au
tracker ne peut pas etre recupere automatiquement : on part d'une sauvegarde
manuelle de https://steamdb.info/app/2467880/history/ (Ctrl+S dans le
navigateur).

Ce script ne sert qu'a amorcer la base. Une fois updates.json amorce, c'est
check_updates.py qui prend le relais via l'API PICS, et ce script n'a plus a
etre relance.

Usage:
    python3 scripts/parse_steamdb_history.py "Fading Echo History · SteamDB.html"
    python3 scripts/parse_steamdb_history.py page.html --merge   # garde l'existant
"""

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPDATES_FILE = ROOT / "updates.json"

# Balises dont le contenu textuel devient un segment type dans le rendu.
SEGMENT_TAGS = {"del": "del", "ins": "ins"}

# Medias previsualisables. Les CDN Steam repondent avec
# 'access-control-allow-origin: *', ce qui autorise le telechargement par fetch
# cote navigateur. Les manifestes de streaming adaptatif (.mpd, .m3u8) sont
# volontairement absents : ils ne sont pas lisibles sans bibliotheque dediee.
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".ico", ".bmp")
VIDEO_EXT = (".mp4", ".webm")
MEDIA_HOSTS = ("steamstatic.com", "akamaihd.net", "steamcdn-a.akamaihd.net")


def media_kind(url):
    """'image', 'video', ou None si l'URL ne pointe pas un media affichable."""
    if not url or not url.startswith("https://"):
        return None
    if not any(host in url.split("/")[2] for host in MEDIA_HOSTS):
        return None
    path = url.split("?")[0].lower()
    if path.endswith(IMAGE_EXT):
        return "image"
    if path.endswith(VIDEO_EXT):
        return "video"
    return None


def is_media(url):
    return media_kind(url) is not None

# Mot-cle rencontre dans un evenement -> categorie affichee par le tracker.
# L'ordre compte : le premier match gagne, du plus specifique au plus general.
CATEGORY_RULES = [
    ("build", ("buildid", "timebuildupdated")),
    ("branch", ("branch", "privatebranches")),
    ("depot", ("depot", "manifest")),
    ("store", (
        "store genres", "user tags", "store description", "store release date",
        "supported languages", "name", "associations", "store asset",
        "has a playtest", "price", "franchise", "publisher", "developer",
    )),
    ("assets", (
        "assets", "screenshots", "trailers", "header_image", "small_capsule",
        "library_capsule", "capsule", "movie", "logo",
    )),
]


class PanelParser(HTMLParser):
    """Reconstruit l'arbre des <li> d'un panneau d'historique SteamDB.

    Le markup imbrique des <ul class="app-history"> dans les <li> pour grouper
    (Depots > branche public > champs). On preserve cette hierarchie : le
    tracker la rend telle quelle, comme SteamDB.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {"children": []}
        self.stack = [self.root]        # <li> ouverts, du plus externe au plus interne
        self.fmt = []                   # balises de formatage ouvertes (del/ins/i/span muted)
        self.hrefs = []                 # pile parallele : URL du <a> englobant, si media

    # -- helpers ----------------------------------------------------------
    def _current(self):
        return self.stack[-1]

    def _push_text(self, text, kind=None):
        node = self._current()
        if node is self.root:
            return
        if kind is None:
            kind = self._active_kind()
        href = self._active_href()
        segs = node["seg"]
        # Fusionne avec le segment precedent s'il est du meme type ET pointe le
        # meme media : evite un emiettement en dizaines de fragments pour une
        # seule phrase, sans coller deux liens differents l'un a l'autre.
        if segs and segs[-1]["t"] == kind and segs[-1].get("href") == href:
            segs[-1]["v"] += text
        else:
            seg = {"t": kind, "v": text}
            if href:
                seg["href"] = href
            segs.append(seg)

    def _active_kind(self):
        for kind in reversed(self.fmt):
            if kind:
                return kind
        return "text"

    def _active_href(self):
        for href in reversed(self.hrefs):
            if href:
                return href
        return None

    # -- HTMLParser -------------------------------------------------------
    def _open(self, kind, href=None):
        """Ouvre une balise de formatage. Les deux piles avancent ensemble."""
        self.fmt.append(kind)
        self.hrefs.append(href)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        cls = attrs.get("class", "")

        if tag == "li":
            op = "none"
            for candidate in ("added", "modified", "removed"):
                if f"diff-{candidate}" in cls:
                    op = candidate
            node = {"op": op, "seg": [], "children": []}
            self._current().setdefault("children", []).append(node)
            self.stack.append(node)
            return

        if tag in SEGMENT_TAGS:
            self._open(SEGMENT_TAGS[tag])
            return

        if tag == "i":
            # <i class="history-icon"> est une puce decorative, sans texte.
            # <i class="muted"> porte les tailles lisibles ("(4.53 GiB)").
            if "history-icon" in cls:
                self._open("skip")
            elif "muted" in cls:
                self._open("muted")
            else:
                self._open("field")
            return

        if tag == "a":
            href = attrs.get("href", "")
            # Seuls les liens vers un media sont conserves : ceux vers SteamDB
            # (changelist, depot, patchnotes) n'ont rien a previsualiser et
            # alourdiraient le JSON pour rien.
            media = href if is_media(href) else None
            # Les liens "?" vers la FAQ sont du bruit dans un flux condense.
            if "/faq/" in href:
                self._open("skip")
            elif "del" in cls:
                self._open("del", media)
            elif "ins" in cls:
                self._open("ins", media)
            else:
                self._open(None, media)
            return

        if tag == "span":
            if "muted" in cls:
                self._open("muted")
            elif "branch-name" in cls:
                self._open("branch")
            else:
                self._open(None)
            return

        if tag in ("svg", "path", "template"):
            self._open("skip")

    def handle_endtag(self, tag):
        if tag == "li":
            if len(self.stack) > 1:
                self.stack.pop()
            return
        if tag in ("del", "ins", "i", "a", "span", "svg", "path", "template"):
            if self.fmt:
                self.fmt.pop()
                self.hrefs.pop()

    def handle_data(self, data):
        if self._active_kind() == "skip":
            return
        text = re.sub(r"\s+", " ", data)
        if not text.strip():
            # On garde l'espace simple qui separe deux segments, pas les
            # retours a la ligne du markup.
            if text == " " and self._current().get("seg"):
                self._push_text(" ")
            return
        self._push_text(text)


def clean_tree(nodes):
    """Supprime les segments vides et les <li> qui ne portent plus rien."""
    out = []
    for node in nodes:
        node["children"] = clean_tree(node.get("children", []))
        segs = []
        for seg in node.get("seg", []):
            if seg["t"] == "skip":
                continue
            seg["v"] = re.sub(r"\s+", " ", seg["v"])
            # SteamDB emet les tailles et deltas dans des <i> tantot muted,
            # tantot nus : "(4.53 GiB)", "(+23.22 KiB)". Ce ne sont pas des
            # noms de champ, on les reclasse pour ne pas les mettre en avant.
            if seg["t"] == "field" and seg["v"].lstrip().startswith("("):
                seg["t"] = "muted"
            if seg["t"] == "field":
                seg["v"] = seg["v"].lstrip()
            if seg["v"].strip():
                # Le type de media est resolu ici, une fois, plutot qu'a chaque
                # rendu cote navigateur.
                if seg.get("href"):
                    seg["media"] = media_kind(seg["href"])
                segs.append(seg)
        # Rogne les espaces en bord de ligne.
        if segs:
            segs[0]["v"] = segs[0]["v"].lstrip()
            segs[-1]["v"] = segs[-1]["v"].rstrip()
        node["seg"] = segs
        if segs or node["children"]:
            out.append(node)
    return out


def flatten_text(nodes):
    """Texte brut de l'arbre, pour categoriser et resumer."""
    parts = []
    for node in nodes:
        parts.extend(seg["v"] for seg in node.get("seg", []))
        parts.append(flatten_text(node.get("children", [])))
    return " ".join(parts)


def categorize(text):
    lowered = text.lower()
    for name, keywords in CATEGORY_RULES:
        if any(kw in lowered for kw in keywords):
            return name
    return "meta"


def find_buildid(nodes):
    """Recupere le buildid pousse, s'il y en a un dans l'arbre.

    C'est l'information la plus utile d'un patch : elle merite le titre, plutot
    qu'un generique 'Changed Depots'.
    """
    for node in nodes:
        segs = node.get("seg", [])
        for index, seg in enumerate(segs):
            if seg["t"] == "field" and seg["v"].strip().rstrip(":") == "buildid":
                for later in segs[index + 1:]:
                    if later["t"] == "ins":
                        return later["v"].strip()
        found = find_buildid(node.get("children", []))
        if found:
            return found
    return None


def summarize(nodes, text):
    """Titre court de l'evenement, façon 'Changed Depots, User Tags'."""
    buildid = find_buildid(nodes)
    if buildid:
        return f"Build {buildid}"

    labels = []
    for node in nodes:
        for seg in node.get("seg", []):
            if seg["t"] == "field":
                label = seg["v"].strip().rstrip(":")
                if label and label not in labels and not label.startswith("("):
                    labels.append(label)
                break
    labels = [lab for lab in labels if lab != "ChangeNumber"]
    if not labels:
        return "Changenumber only"
    head = ", ".join(labels[:3])
    if len(labels) > 3:
        head += f" +{len(labels) - 3}"
    verb = "Changed"
    if "Added" in text and "Changed" not in text:
        verb = "Added"
    elif "Removed" in text and "Changed" not in text:
        verb = "Removed"
    return f"{verb} {head}"


def parse_panels(html_text):
    start = html_text.find('<div class="history-container">')
    if start < 0:
        sys.exit("Balise history-container introuvable : ce n'est pas une page History SteamDB.")

    chunks = re.split(r'(?=<div class="panel panel-history)', html_text[start:])
    events = []

    for chunk in chunks:
        match = re.match(r'<div class="panel panel-history[^"]*" data-changeid="([^"]+)"', chunk)
        if not match:
            continue
        changeid = match.group(1)

        date = re.search(r'<relative-time[^>]*datetime="([^"]+)"', chunk)
        if not date:
            continue
        date = date.group(1)

        parser = PanelParser()
        parser.feed(chunk)
        tree = clean_tree(parser.root["children"])

        # Le changenumber est un fait technique repete a chaque panneau ; on le
        # sort de l'arbre pour ne pas polluer le rendu de chaque evenement.
        changes = [n for n in tree if not flatten_text([n]).strip().startswith("ChangeNumber")]

        text = flatten_text(changes)
        category = categorize(text) if changes else "changenumber"

        events.append({
            "id": f"change:{changeid}",
            "type": category,
            "changeid": changeid,
            "title": summarize(changes, text) if changes else "Changenumber only",
            "url": f"https://steamdb.info/app/2467880/history/?changeid={changeid}",
            "source": "steamdb-history",
            "date": date,
            "changes": changes,
        })

    return events


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("html", help="page History de SteamDB sauvegardee")
    ap.add_argument("--merge", action="store_true",
                    help="fusionne avec updates.json au lieu de l'ecraser")
    ap.add_argument("--out", default=str(UPDATES_FILE))
    args = ap.parse_args()

    html_text = Path(args.html).read_text(encoding="utf-8", errors="replace")
    events = parse_panels(html_text)
    if not events:
        sys.exit("Aucun evenement extrait : le markup de SteamDB a peut-etre change.")

    out_path = Path(args.out)
    if args.merge and out_path.exists():
        existing = json.loads(out_path.read_text(encoding="utf-8")).get("events", [])
        known = {e["id"] for e in events}
        events += [e for e in existing if e["id"] not in known]

    events.sort(key=lambda e: e["date"], reverse=True)

    payload = {
        "generated": events[0]["date"],
        "appid": "2467880",
        "events": events,
    }
    out_path.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n",
                        encoding="utf-8")

    counts = {}
    for event in events:
        counts[event["type"]] = counts.get(event["type"], 0) + 1
    print(f"{len(events)} evenements ecrits dans {out_path}")
    for kind, count in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {count:4d}  {kind}")


if __name__ == "__main__":
    main()
