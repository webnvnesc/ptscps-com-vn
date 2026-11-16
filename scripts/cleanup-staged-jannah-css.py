#!/usr/bin/env python3
"""Delete only the inactive, known-checksum PTSCPS Jannah audit CSS file."""
import os,ftplib,hashlib
from urllib.parse import urlsplit
root="/domains/ptscps.com.vn/public_html"
file="wp-content/themes/jannah-child/ptscps-css-bundle-audit-20261116.css"
expected="3aca78f104b1bfc43b6e0296f7e18eb8ae4a6588bcc09f874d8f8714f70f829d"
server=os.environ["FTP_SERVER"];p=urlsplit(server if "://" in server else "//"+server)
ftp=ftplib.FTP_TLS()
ftp.connect(p.hostname,p.port or 21,timeout=25);ftp.auth()
ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);ftp.prot_p()
try:
    ftp.cwd(root)
    root_names={x.rstrip("/").split("/")[-1] for x in ftp.nlst()}
    if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(root_names):
        raise RuntimeError("Unexpected document root")
    data=bytearray()
    try:
        ftp.retrbinary("RETR "+root+"/"+file,data.extend)
    except ftplib.error_perm:
        print("ALREADY_ABSENT: inactive test CSS file not found")
    else:
        actual=hashlib.sha256(data).hexdigest()
        if actual!=expected:
            raise RuntimeError("Refusing cleanup; checksum differs from known audit file")
        ftp.delete(root+"/"+file)
        try:
            ftp.size(root+"/"+file)
        except ftplib.error_perm:
            print("SUCCESS: removed inactive audit CSS with verified sha256")
        else:
            raise RuntimeError("Audit file still present after delete")
finally:
    try:ftp.quit()
    except Exception:ftp.close()
