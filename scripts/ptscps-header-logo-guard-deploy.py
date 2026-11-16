#!/usr/bin/env python3
"""Install narrowly scoped logo guard MU plugin, verify bytes, preserve rollback."""
import ftplib,hashlib,io,os,uuid,sys
from pathlib import Path
from urllib.parse import urlsplit
root="/domains/ptscps.com.vn/public_html"
dest=root+"/wp-content/mu-plugins/ptscps-header-logo-safety.php"
source=Path("deploy/ptscps-header-logo-safety.php").read_bytes()
if b"Plugin Name: PTSCPS Header Logo Safety Guard" not in source or b"Version: 1.0.0" not in source:
    sys.exit("Unexpected source; abort")
url=os.environ["FTP_SERVER"]
u=urlsplit(url if "://" in url else "//"+url)
f=ftplib.FTP_TLS(timeout=28)
f.connect(u.hostname,u.port or 21,timeout=28);f.auth()
f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
stamp=uuid.uuid4().hex[:12]
def get(p):
    b=bytearray();f.retrbinary("RETR "+p,b.extend);return bytes(b)
def same(a,b):return hashlib.sha256(a).digest()==hashlib.sha256(b).digest()
try:
    f.cwd(root)
    entries={p.rstrip("/").rsplit("/",1)[-1] for p in f.nlst()}
    if not {"index.php","wp-admin","wp-content","wp-includes"}.issubset(entries):
        raise RuntimeError("Refuse unexpected WordPress root")
    try:old=get(dest)
    except ftplib.error_perm as e:
        if not str(e).startswith("550"):raise
        old=None
    if old is not None and same(old,source):
        print("LOGO_GUARD_ALREADY_CURRENT")
        sys.exit(0)
    if old is not None and b"Plugin Name: PTSCPS Header Logo Safety Guard" not in old:
        raise RuntimeError("Refuse overwrite of unmanaged MU plugin")
    if old is not None:
        Path("logo-guard-prior.php").write_bytes(old)
        backup=dest+"."+stamp+".bak"
        f.storbinary("STOR "+backup,io.BytesIO(old))
        if not same(get(backup),old):raise RuntimeError("Backup verification failed")
    tmp=dest+"."+stamp+".tmp"
    f.storbinary("STOR "+tmp,io.BytesIO(source))
    if not same(get(tmp),source):raise RuntimeError("Staged source mismatch")
    if old is None:
        f.rename(tmp,dest)
    else:
        parked=dest+"."+stamp+".old"
        f.rename(dest,parked)
        try:f.rename(tmp,dest)
        except Exception:
            f.rename(parked,dest)
            raise
        f.delete(parked)
    if not same(get(dest),source):raise RuntimeError("Production checksum mismatch")
    print("LOGO_GUARD_PRODUCTION_ENABLED "+hashlib.sha256(source).hexdigest())
finally:
    try:f.quit()
    except Exception:f.close()
