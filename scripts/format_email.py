#!/usr/bin/env python3
"""Transforme new_updates.json en corps d'email HTML (email_body.html).

Deux formes d'evenements a rendre :
  - les annonces Steam, qui ont un texte (`body`) ;
  - les changements PICS, qui ont un arbre de diff (`changes`).
"""

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRACKER_URL = "https://cheapmanga.github.io/FadingUtilities/tracker.html"

KIND_LABELS = {
    "news": "Patch note / annonce",
    "build": "Build Steam",
    "depot": "Depots",
    "branch": "Branches",
    "store": "Metadonnees du store",
    "assets": "Assets",
    "meta": "Changement divers",
}

SEGMENT_STYLES = {
    "del": "color:#b91c1c;text-decoration:line-through;",
    "ins": "color:#15803d;",
    "field": "font-weight:600;color:#111;",
    "muted": "color:#888;font-size:12px;",
    "branch": "color:#0e7490;font-weight:600;",
}

BULLETS = {"added": "+", "removed": "-", "modified": "~"}


def render_tree(nodes, depth=0):
    if not nodes:
        return ""
    pad = 16 if depth else 0
    rows = []
    for node in nodes:
        line = "".join(
            f'<span style="{SEGMENT_STYLES[seg["t"]]}">{html.escape(seg["v"])}</span>'
            if seg["t"] in SEGMENT_STYLES else html.escape(seg["v"])
            for seg in node.get("seg", [])
        )
        bullet = BULLETS.get(node.get("op"), "")
        prefix = f'<strong>{bullet}</strong> ' if bullet else ""
        rows.append(f'<li style="margin:2px 0;">{prefix}{line}</li>')
        rows.append(render_tree(node.get("children", []), depth + 1))

    return (f'<ul style="list-style:none;padding-left:{pad}px;margin:4px 0;'
            f'font-size:13px;line-height:1.55;color:#333;">{"".join(rows)}</ul>')


def render(event):
    title = html.escape(event.get("title", "Changement"))
    kind = KIND_LABELS.get(event.get("type"), "Changement")

    if event.get("body"):
        text = html.escape(event["body"]).replace("\n", "<br>")
        content = f'<div style="font-size:14px;line-height:1.6;color:#333;">{text}</div>'
    else:
        content = render_tree(event.get("changes", []))

    link = ""
    if event.get("url"):
        url = html.escape(event["url"], quote=True)
        link = f'<p style="margin:12px 0 0;"><a href="{url}" style="color:#00A0AA;">Voir le detail</a></p>'

    return f"""
    <div style="border-left:4px solid #00A0AA;padding:12px 18px;margin:0 0 24px;background:#f6feff;">
      <p style="margin:0 0 4px;font-size:12px;color:#777;text-transform:uppercase;">{kind}</p>
      <h2 style="margin:0 0 12px;font-size:19px;color:#111;">{title}</h2>
      {content}
      {link}
    </div>"""


def main():
    path = ROOT / "new_updates.json"
    if not path.exists():
        return
    events = json.loads(path.read_text(encoding="utf-8"))
    if not events:
        return

    blocks = "".join(render(e) for e in events)
    plural = "s" if len(events) > 1 else ""
    page = f"""<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;">
  <h1 style="font-size:22px;color:#111;">Fading Echo - {len(events)} update{plural}</h1>
  {blocks}
  <p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:14px;">
    Envoye automatiquement par le tracker FadingUtilities.
    <a href="{TRACKER_URL}" style="color:#00A0AA;">Voir le tracker</a>
  </p>
</div>"""

    (ROOT / "email_body.html").write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
