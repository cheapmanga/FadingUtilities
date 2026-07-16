#!/usr/bin/env python3
"""Transforme new_updates.json en corps d'email HTML (email_body.html)."""

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRACKER_URL = "https://cheapmanga.github.io/FadingUtilities/tracker.html"


def render(event):
    title = html.escape(event["title"])
    body = html.escape(event["body"]).replace("\n", "<br>")
    kind = "Patch note / annonce" if event["type"] == "news" else "Build Steam"
    link = ""
    if event.get("url"):
        url = html.escape(event["url"], quote=True)
        link = f'<p><a href="{url}" style="color:#00A0AA;">Ouvrir sur Steam</a></p>'

    return f"""
    <div style="border-left:4px solid #00A0AA;padding:12px 18px;margin:0 0 24px;background:#f6feff;">
      <p style="margin:0 0 4px;font-size:12px;color:#777;text-transform:uppercase;">{kind}</p>
      <h2 style="margin:0 0 12px;font-size:19px;color:#111;">{title}</h2>
      <div style="font-size:14px;line-height:1.6;color:#333;">{body}</div>
      {link}
    </div>"""


def main():
    events = json.loads((ROOT / "new_updates.json").read_text(encoding="utf-8"))
    if not events:
        return

    blocks = "".join(render(e) for e in events)
    plural = "s" if len(events) > 1 else ""
    page = f"""<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;">
  <h1 style="font-size:22px;color:#111;">Fading Echo — {len(events)} update{plural}</h1>
  {blocks}
  <p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:14px;">
    Envoye automatiquement par le tracker FadingUtilities.
    <a href="{TRACKER_URL}" style="color:#00A0AA;">Voir le tracker</a>
  </p>
</div>"""

    (ROOT / "email_body.html").write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
