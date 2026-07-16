#!/usr/bin/env python3
"""Detecte les updates de Fading Echo et met a jour updates.json.

Deux sources :
  - ISteamNews : annonces et patch notes publies par le studio.
  - Steam PICS (via steamcmd) : buildid de la branche public, ce qui detecte
    les patchs pousses sans annonce.

Ecrit updates.json (consomme par tracker.html) et, si de nouveaux evenements
sont trouves, un new_updates.json que le workflow utilise pour l'email.
Code de sortie 0 dans tous les cas ; l'absence de nouveaute n'est pas une erreur.
"""

import html
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

APPID = "2467880"
NEWS_URL = (
    "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"
    f"?appid={APPID}&count=20&maxlength=0"
)
ROOT = Path(__file__).resolve().parent.parent
UPDATES_FILE = ROOT / "updates.json"
NEW_FILE = ROOT / "new_updates.json"
MAX_EVENTS = 100


def fetch_news():
    req = urllib.request.Request(NEWS_URL, headers={"User-Agent": "FadingUtilities-tracker"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)

    events = []
    for item in data.get("appnews", {}).get("newsitems", []):
        events.append(
            {
                "id": f"news:{item['gid']}",
                "type": "news",
                "title": item.get("title", "(sans titre)"),
                "url": item.get("url", ""),
                "author": item.get("author", ""),
                "feed": item.get("feedlabel", ""),
                "body": clean_bbcode(item.get("contents", "")),
                "date": iso(item.get("date", 0)),
            }
        )
    return events


def fetch_build():
    """Retourne le buildid de la branche public, ou None si steamcmd echoue."""
    steamcmd = os.environ.get("STEAMCMD", "steamcmd")
    try:
        proc = subprocess.run(
            [steamcmd, "+login", "anonymous", "+app_info_update", "1",
             "+app_info_print", APPID, "+quit"],
            capture_output=True, text=True, timeout=300,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"steamcmd indisponible : {exc}", file=sys.stderr)
        return None

    buildid = parse_public_buildid(proc.stdout)
    if buildid is None:
        print("buildid introuvable dans la sortie steamcmd", file=sys.stderr)
    return buildid


def parse_public_buildid(text):
    """Extrait branches -> public -> buildid du VDF renvoye par app_info_print."""
    branches = re.search(r'"branches"\s*\{', text)
    if not branches:
        return None
    public = re.search(r'"public"\s*\{(.*?)\}', text[branches.end():], re.DOTALL)
    if not public:
        return None
    buildid = re.search(r'"buildid"\s*"(\d+)"', public.group(1))
    return buildid.group(1) if buildid else None


def clean_bbcode(text):
    """Le contenu Steam est du BBCode ; on le rend lisible en texte brut."""
    text = re.sub(r"\[img\][^\[]*\[/img\]", "", text, flags=re.I)
    text = re.sub(r"\[url=([^\]]+)\](.*?)\[/url\]", r"\2 (\1)", text, flags=re.I | re.DOTALL)
    text = re.sub(r"\[/?[a-z][^\]]*\]", "", text, flags=re.I)
    text = html.unescape(text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def iso(timestamp):
    return datetime.fromtimestamp(int(timestamp), tz=timezone.utc).isoformat()


def load_existing():
    if not UPDATES_FILE.exists():
        return []
    try:
        return json.loads(UPDATES_FILE.read_text(encoding="utf-8")).get("events", [])
    except (json.JSONDecodeError, OSError) as exc:
        print(f"updates.json illisible, on repart de zero : {exc}", file=sys.stderr)
        return []


def main():
    existing = load_existing()
    known = {e["id"] for e in existing}
    now = datetime.now(timezone.utc).isoformat()

    found = fetch_news()

    buildid = fetch_build()
    if buildid is not None:
        # Le premier run enregistre la build courante sans la signaler comme
        # nouveaute : sinon le tracker annonce une update qui n'en est pas une.
        seen_build = any(e["type"] == "build" for e in existing)
        found.append(
            {
                "id": f"build:{buildid}",
                "type": "build",
                "title": f"Nouvelle build detectee : {buildid}",
                "url": f"https://steamdb.info/app/{APPID}/patchnotes/",
                "author": "",
                "feed": "Steam PICS",
                "body": (
                    f"La branche public de Fading Echo est passee sur la build {buildid}. "
                    "Aucune annonce n'est forcement associee : ce peut etre un patch silencieux."
                ),
                "date": now,
                "silent": not seen_build,
            }
        )

    fresh = [e for e in found if e["id"] not in known]

    # Une premiere execution verrait tout le backlog de news comme "nouveau" et
    # enverrait 20 emails. On amorce sans notifier.
    bootstrap = not existing
    notify = [] if bootstrap else [e for e in fresh if not e.get("silent")]

    merged = sorted(fresh + existing, key=lambda e: e["date"], reverse=True)[:MAX_EVENTS]
    UPDATES_FILE.write_text(
        json.dumps({"generated": now, "appid": APPID, "events": merged},
                   indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    NEW_FILE.write_text(json.dumps(notify, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")

    if bootstrap:
        print(f"Amorcage : {len(fresh)} evenements enregistres, aucune notification.")
    else:
        print(f"{len(fresh)} nouveaux evenements, {len(notify)} a notifier.")

    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"has_new={'true' if notify else 'false'}\n")
            fh.write(f"count={len(notify)}\n")
            if notify:
                fh.write(f"subject={notify[0]['title'][:120]}\n")


if __name__ == "__main__":
    main()
