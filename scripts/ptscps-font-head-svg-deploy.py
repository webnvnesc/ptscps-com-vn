#!/usr/bin/env python3
"""Reversible, checksum-verified FTPS install of one dedicated MU plugin."""
import ftplib
import hashlib
import io
import json
import os
import uuid
from pathlib import Path
from urllib.parse import urlsplit

root = "/domains/ptscps.com.vn/public_html"
mu = root + "/wp-content/mu-plugins"
name = "ptscps-font-head-carousel-svg.php"
target = mu + "/" + name
source = Path("deploy/" + name).read_bytes()
state_path = Path("font-head-svg-state.json")
prior_path = Path("font-head-svg-before.php")
if (b"Plugin Name: PTSCPS Google Font Hints + Customer Carousel SVG Trial" not in source
        or b"Version: 1.0.1" not in source):
    raise RuntimeError("Unrecognized/unsupported plugin source")
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
    ftp.cwd(root)
    names = {p.rstrip("/").rsplit("/", 1)[-1] for p in ftp.nlst()}
    if not {"index.php", "wp-admin", "wp-content", "wp-includes"}.issubset(names):
        raise RuntimeError("Unexpected production WordPress root")
    try:
        existing = read(target)
    except ftplib.error_perm as exc:
        if not str(exc).startswith("550"):
            raise
        existing = None
    if existing is not None and b"Plugin Name: PTSCPS Google Font Hints + Customer Carousel SVG Trial" not in existing:
        raise RuntimeError("Refusing to modify unrelated MU plugin")
    mode = "already-current" if existing == source else ("new" if existing is None else "update")
    state_path.write_text(json.dumps({"mode": mode, "expected_sha256": hashlib.sha256(source).hexdigest()}))
    if mode == "already-current":
        print("FONT_HEAD_SVG_ALREADY_CURRENT")
    else:
        if existing is not None:
            prior_path.write_bytes(existing)
            backup = mu + "/." + name + "." + uuid.uuid4().hex[:12] + ".bak"
            ftp.storbinary("STOR " + backup, io.BytesIO(existing))
            if read(backup) != existing:
                raise RuntimeError("Server-side backup checksum mismatch")
            print("FONT_HEAD_SVG_BACKUP_VERIFIED", flush=True)
        staged = mu + "/." + name + "." + uuid.uuid4().hex[:12] + ".tmp"
        ftp.storbinary("STOR " + staged, io.BytesIO(source))
        if read(staged) != source:
            raise RuntimeError("Uploaded PHP checksum mismatch")
        if existing is None:
            ftp.rename(staged, target)
        else:
            parked = target + "." + uuid.uuid4().hex[:12] + ".old"
            ftp.rename(target, parked)
            try:
                ftp.rename(staged, target)
            except Exception:
                ftp.rename(parked, target)
                raise
            ftp.delete(parked)
        if read(target) != source:
            raise RuntimeError("Installed PHP checksum mismatch")
        print("FONT_HEAD_SVG_INSTALLED " + hashlib.sha256(source).hexdigest(), flush=True)
finally:
    try:
        ftp.quit()
    except Exception:
        ftp.close()
