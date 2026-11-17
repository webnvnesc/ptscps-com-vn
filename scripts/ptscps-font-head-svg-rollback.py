#!/usr/bin/env python3
"""Rollback only a file installed in this Actions job, never unrelated code."""
import ftplib
import io
import json
import os
import uuid
from pathlib import Path
from urllib.parse import urlsplit

state_file = Path("font-head-svg-state.json")
if not state_file.exists():
    print("FONT_HEAD_SVG_NO_DEPLOY_STATE")
    raise SystemExit(0)
state = json.loads(state_file.read_text())
mode = state["mode"]
if mode == "already-current":
    print("FONT_HEAD_SVG_PREEXISTING_NO_ROLLBACK")
    raise SystemExit(0)
target = "/domains/ptscps.com.vn/public_html/wp-content/mu-plugins/ptscps-font-head-carousel-svg.php"
source = Path("deploy/ptscps-font-head-carousel-svg.php").read_bytes()
url = os.environ["FTP_SERVER"]
parsed = urlsplit(url if "://" in url else "//" + url)
ftp = ftplib.FTP_TLS(timeout=28)
ftp.connect(parsed.hostname, parsed.port or 21, timeout=28)
ftp.auth()
ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
ftp.prot_p()
ftp.set_pasv(True)

def read(path):
    data = bytearray()
    ftp.retrbinary("RETR " + path, data.extend)
    return bytes(data)

try:
    try:
        current = read(target)
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            print("FONT_HEAD_SVG_NOT_INSTALLED")
            raise SystemExit(0)
        raise
    if current != source:
        raise RuntimeError("Refusing to rollback a different installed plugin")
    if mode == "new":
        ftp.delete(target)
        print("FONT_HEAD_SVG_REMOVED", flush=True)
    elif mode == "update":
        prior = Path("font-head-svg-before.php").read_bytes()
        if b"Plugin Name: PTSCPS Google Font Hints + Customer Carousel SVG Trial" not in prior:
            raise RuntimeError("Backup is not our plugin")
        staged = target + "." + uuid.uuid4().hex[:12] + ".tmp"
        ftp.storbinary("STOR " + staged, io.BytesIO(prior))
        if read(staged) != prior:
            raise RuntimeError("Rollback upload checksum mismatch")
        parked = target + "." + uuid.uuid4().hex[:12] + ".old"
        ftp.rename(target, parked)
        try:
            ftp.rename(staged, target)
        except Exception:
            ftp.rename(parked, target)
            raise
        if read(target) != prior:
            raise RuntimeError("Rollback checksum mismatch")
        ftp.delete(parked)
        print("FONT_HEAD_SVG_PREVIOUS_RESTORED", flush=True)
    else:
        raise RuntimeError("Unexpected deployment state")
finally:
    try:
        ftp.quit()
    except Exception:
        ftp.close()
