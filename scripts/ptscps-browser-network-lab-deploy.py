#!/usr/bin/env python3
"""Install only PTSCPS owner-marked, standalone end-user browser diagnostic via FTPS.

The diagnostic is a static HTML file and runs only when a visitor opens its URL.
No edits to WordPress, .htaccess, theme, cache, DNS, or any builder.
"""
import ftplib
import hashlib
import io
import os
import secrets
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = "/domains/ptscps.com.vn/public_html"
NAME = "ptscps-browser-network-lab-20261117.html"
DEST = ROOT + "/" + NAME
SRC = Path("deploy/ptscps-browser-network-lab.html").read_bytes()
MARKER = b"PTSCPS_BROWSER_NETLAB_V1"
if MARKER not in SRC or b'<meta name="robots" content="noindex,nofollow,noarchive">' not in SRC:
    raise RuntimeError("Unrecognized diagnostic source, abort")
url = os.environ["FTP_SERVER"]
u = urlsplit(url if "://" in url else "//" + url)
f = ftplib.FTP_TLS(timeout=25)
f.connect(u.hostname, u.port or 21, timeout=25)
f.auth()
f.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
f.prot_p()
f.set_pasv(True)

def read(path):
    chunks=[]
    f.retrbinary("RETR " + path, chunks.append)
    return b"".join(chunks)

try:
    f.cwd(ROOT)
    entries = {p.rstrip("/").rsplit("/", 1)[-1] for p in f.nlst()}
    if not {"wp-admin", "wp-content", "wp-includes", "index.php"}.issubset(entries):
        raise RuntimeError("Refusing to write outside expected WordPress root")

    old = None
    try:
        old = read(DEST)
    except ftplib.error_perm as e:
        if not str(e).startswith("550"):
            raise
    if old is not None and MARKER not in old:
        raise RuntimeError("Existing file was not created by this tool")
    if old == SRC:
        print("NETLAB_ALREADY_CURRENT sha256=" + hashlib.sha256(SRC).hexdigest(), flush=True)
        sys.exit(0)

    token = secrets.token_hex(6)
    temp = ROOT + "/." + NAME + "." + token + ".tmp"
    f.storbinary("STOR " + temp, io.BytesIO(SRC))
    if hashlib.sha256(read(temp)).digest() != hashlib.sha256(SRC).digest():
        raise RuntimeError("FTPS staged file mismatch")

    if old is None:
        f.rename(temp, DEST)
    else:
        backup = ROOT + "/." + NAME + "." + token + ".bak"
        f.storbinary("STOR " + backup, io.BytesIO(old))
        if read(backup) != old:
            raise RuntimeError("Backup verification failed")
        parked = ROOT + "/." + NAME + "." + token + ".old"
        f.rename(DEST, parked)
        try:
            f.rename(temp, DEST)
        except Exception:
            f.rename(parked, DEST)
            raise
        f.delete(parked)
        print("NETLAB_BACKUP_CREATED " + backup.rsplit("/", 1)[-1], flush=True)

    if hashlib.sha256(read(DEST)).digest() != hashlib.sha256(SRC).digest():
        raise RuntimeError("FTPS production verification failed")
    print("NETLAB_DEPLOYED sha256=" + hashlib.sha256(SRC).hexdigest(), flush=True)
    print("NETLAB_URL https://ptscps.com.vn/" + NAME, flush=True)
finally:
    try:
        f.quit()
    except Exception:
        f.close()
