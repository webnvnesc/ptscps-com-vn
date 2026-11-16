#!/usr/bin/env python3
"""Deploy a reviewed MU plugin through FTPS with checksum, backup and rollback.

Never edits a theme, Elementor, Slider Revolution, posts, or uploads.
"""
import ftplib, io, os, hashlib, sys, socket, uuid
from urllib.parse import urlsplit
from pathlib import Path

root = "/domains/ptscps.com.vn/public_html"
local = Path("deploy/ptscps-offscreen-images.php")
target = root + "/wp-content/mu-plugins"
name = "ptscps-offscreen-images.php"
marker = b"Plugin Name: PTSCPS Offscreen Image Loading"
source = local.read_bytes()
if marker not in source or b"post_thumbnail_html" not in source or b"elementor/widget/render_content" not in source:
    sys.exit("FAIL: Unexpected MU plugin source")
if len(source) > 25000:
    sys.exit("FAIL: plugin too large")

host = os.environ.get("FTP_SERVER", "")
user = os.environ.get("FTP_USERNAME", "")
password = os.environ.get("FTP_PASSWORD", "")
if not (host and user and password):
    sys.exit("FAIL: FTPS secrets unavailable")
loc = urlsplit(host if "://" in host else "//" + host)
if not loc.hostname:
    sys.exit("FAIL: FTP server invalid")

ftp = ftplib.FTP_TLS(timeout=30)
uid = uuid.uuid4().hex[:14]
temp_name = ".ptscps-images-" + uid + ".tmp"
original = None
temp_uploaded = False
production_swapped = False
try:
    socket.getaddrinfo(loc.hostname, loc.port or 21, type=socket.SOCK_STREAM)
    ftp.connect(loc.hostname, loc.port or 21, timeout=30)
    ftp.auth()
    ftp.login(user, password)
    ftp.prot_p()
    ftp.set_pasv(True)

    ftp.cwd(root)
    listing = set(x.rsplit("/", 1)[-1] for x in ftp.nlst())
    if not {"wp-admin", "wp-content", "wp-includes", "index.php"}.issubset(listing):
        sys.exit("FAIL: unexpected WordPress root")
    ftp.cwd(root + "/wp-content")
    content_dirs = set(x.rsplit("/", 1)[-1] for x in ftp.nlst())
    if "mu-plugins" not in content_dirs:
        # This installation was audited as having mu-plugins already.
        sys.exit("FAIL: expected wp-content/mu-plugins directory missing")
    ftp.cwd(target)

    def read(filename):
        b = bytearray()
        def append(chunk):
            if len(b) + len(chunk) > 25000:
                raise ValueError("Remote plugin unexpectedly large")
            b.extend(chunk)
        ftp.retrbinary("RETR " + filename, append)
        return bytes(b)

    files = set(x.rsplit("/",1)[-1] for x in ftp.nlst())
    if name in files:
        original = read(name)
        if marker not in original:
            sys.exit("FAIL: refusing to overwrite unknown existing file")
        if original == source:
            print("ALREADY_DEPLOYED SHA256", hashlib.sha256(source).hexdigest(), flush=True)
            sys.exit(0)
        Path("ptscps-offscreen-images-before.php").write_bytes(original)
        backup_name = ".ptscps-images-backup-" + uid + ".php.bak"
        ftp.storbinary("STOR "+backup_name,io.BytesIO(original))
        if read(backup_name)!=original:
            sys.exit("FAIL: remote backup mismatch")
        print("BACKUP", backup_name, hashlib.sha256(original).hexdigest(), flush=True)

    ftp.storbinary("STOR "+temp_name,io.BytesIO(source))
    temp_uploaded = True
    if hashlib.sha256(read(temp_name)).digest()!=hashlib.sha256(source).digest():
        raise ValueError("Temporary file SHA mismatch")

    if original is not None:
        retired = ".ptscps-images-old-" + uid + ".tmp"
        ftp.rename(name, retired)
        production_swapped = True
        try:
            ftp.rename(temp_name,name)
            temp_uploaded = False
            if read(name)!=source:
                raise ValueError("Remote installed file invalid")
        except Exception:
            try:
                ftp.delete(name)
            except ftplib.all_errors:
                pass
            ftp.rename(retired,name)
            raise
        ftp.delete(retired)
    else:
        ftp.rename(temp_name,name)
        temp_uploaded = False
        if read(name)!=source:
            ftp.delete(name)
            raise ValueError("Remote new file invalid; removed failed deployment")

    print("DEPLOY_SUCCESS",name,"SHA256",hashlib.sha256(source).hexdigest(), flush=True)
    print("NOTE: Public HTML may remain cached by WP Super Cache; inspect a fresh uncached URL.",flush=True)
finally:
    if temp_uploaded:
        try: ftp.delete(temp_name)
        except Exception: pass
    try: ftp.quit()
    except Exception:
        try: ftp.close()
        except Exception: pass
