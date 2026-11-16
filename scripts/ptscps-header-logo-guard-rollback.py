#!/usr/bin/env python3
"""Rollback only when exact installed guard matches known candidate."""
import ftplib,os,io,hashlib,uuid
from pathlib import Path
from urllib.parse import urlsplit
p="/domains/ptscps.com.vn/public_html/wp-content/mu-plugins/ptscps-header-logo-safety.php"
candidate=Path("deploy/ptscps-header-logo-safety.php").read_bytes()
u=os.environ["FTP_SERVER"];u=urlsplit(u if "://" in u else "//"+u)
f=ftplib.FTP_TLS(timeout=28);f.connect(u.hostname,u.port or 21,timeout=28);f.auth()
f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
def get(p):
    b=bytearray();f.retrbinary("RETR "+p,b.extend);return bytes(b)
try:
    try:current=get(p)
    except ftplib.error_perm:
        print("LOGO_GUARD_NOT_INSTALLED");raise SystemExit(0)
    if hashlib.sha256(current).digest()!=hashlib.sha256(candidate).digest():
        raise RuntimeError("Installed guard changed; refuse rollback")
    prior=Path("logo-guard-prior.php")
    if prior.exists():
        old=prior.read_bytes()
        if b"Plugin Name: PTSCPS Header Logo Safety Guard" not in old:raise RuntimeError("Unknown rollback source")
        tmp=p+"."+uuid.uuid4().hex[:12]+".tmp"
        f.storbinary("STOR "+tmp,io.BytesIO(old))
        if get(tmp)!=old:raise RuntimeError("Rollback staged checksum mismatch")
        f.delete(p);f.rename(tmp,p)
        if get(p)!=old:raise RuntimeError("Rollback final checksum mismatch")
        print("LOGO_GUARD_RESTORED_PRIOR")
    else:
        f.delete(p);print("LOGO_GUARD_REMOVED")
finally:
    try:f.quit()
    except Exception:f.close()
