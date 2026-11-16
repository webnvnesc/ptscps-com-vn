#!/usr/bin/env python3
"""Purge only exact public WP Super Cache HTML entries affected by a11y/SEO.
Does NOT recursively delete, touch wp-admin cookies, or purge whole cache.
"""
import ftplib
import os
import re
import sys
from urllib.parse import urlsplit

ROOT="/domains/ptscps.com.vn/public_html"
BASE=ROOT+"/wp-content/cache/supercache/ptscps.com.vn"
PATHS=["", "/dich-vu", "/lien-he", "/c/hoat-dong-cua-cong-ty"]
ALLOW=re.compile(r"^(?:index-https\.html(?:\.gz)?|index\.html(?:\.gz)?|(?:meta-)?wp-cache-[0-9a-f]{32}\.php)$")
h=os.environ.get("FTP_SERVER","")
u=os.environ.get("FTP_USERNAME","")
p=os.environ.get("FTP_PASSWORD","")
if not h or not u or not p:
    sys.exit("FAIL: FTPS secrets missing")
host=urlsplit(h if "://" in h else "//"+h)
ftp=ftplib.FTP_TLS(timeout=25)
ftp.connect(host.hostname,host.port or 21,timeout=25)
ftp.auth();ftp.login(u,p);ftp.prot_p();ftp.set_pasv(True)
try:
    ftp.cwd(ROOT)
    names={x.rstrip("/").split("/")[-1] for x in ftp.nlst()}
    if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(names):
        sys.exit("FAIL: unexpected WordPress root")
    total=0
    for fragment in PATHS:
        directory=BASE+fragment
        try:
            entries=list(ftp.mlsd(directory))
        except ftplib.error_perm:
            print("CACHE_PATH_NOT_PRESENT",fragment or "/",flush=True)
            continue
        paths=[name for name,facts in entries if facts.get("type")=="file" and ALLOW.fullmatch(name)]
        if len(paths)>35:
            sys.exit("FAIL: unexpected cache count in "+directory)
        if not paths:
            print("CACHE_NO_ENTRY",fragment or "/",flush=True)
            continue
        ftp.cwd(directory)
        for filename in paths:
            ftp.delete(filename)
            total+=1
        print("CACHE_INVALIDATED",fragment or "/",len(paths),flush=True)
    print("CACHE_INVALIDATE_COMPLETE",total,flush=True)
finally:
    try:ftp.quit()
    except Exception:ftp.close()
