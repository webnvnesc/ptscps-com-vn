#!/usr/bin/env python3
"""Install isolated PTSCPS Accessibility/SEO MU plugin via encrypted FTPS.
Atomic rename; verify SHA256, leave same-host rollback and keep local copy.
No other WP content, Jannah files, or Elementor editor data are touched.
"""
import ftplib
import hashlib
import io
import os
import socket
import sys
import uuid
from pathlib import Path
from urllib.parse import urlsplit

ROOT="/domains/ptscps.com.vn/public_html"
TARGET=ROOT+"/wp-content/mu-plugins"
NAME="ptscps-a11y-seo.php"
FILE=Path("deploy")/NAME
MARKER=b"Plugin Name: PTSCPS Public Accessibility and SEO Fixes"
SOURCE=FILE.read_bytes()
if MARKER not in SOURCE or b"ptscps_a11y_seo_html" not in SOURCE:
    sys.exit("FAIL: invalid source / plugin marker")
if len(SOURCE)>45000:
    sys.exit("FAIL: unexpectedly large plugin")
host=os.environ.get("FTP_SERVER","")
user=os.environ.get("FTP_USERNAME","")
password=os.environ.get("FTP_PASSWORD","")
if not (host and user and password):
    sys.exit("FAIL: missing FTPS secrets")
parsed=urlsplit(host if "://" in host else "//"+host)
if not parsed.hostname:
    sys.exit("FAIL: invalid host")
socket.getaddrinfo(parsed.hostname,parsed.port or 21,type=socket.SOCK_STREAM)
ftp=ftplib.FTP_TLS(timeout=30)
uid=uuid.uuid4().hex[:12]
new_tmp=".ptscps-a11y-"+uid+".tmp"
back=".ptscps-a11y-rollback-"+uid+".php.bak"
old_tmp=".ptscps-a11y-old-"+uid+".tmp"
original=None
temp_active=False
old_retired=False
def read(remote):
    data=bytearray()
    def append(block):
        if len(data)+len(block)>45000:
            raise ValueError("Remote file too large")
        data.extend(block)
    ftp.retrbinary("RETR "+remote,append)
    return bytes(data)
try:
    ftp.connect(parsed.hostname,parsed.port or 21,timeout=30)
    ftp.auth()
    ftp.login(user,password)
    ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(ROOT)
    listing={x.rstrip("/").rsplit("/",1)[-1] for x in ftp.nlst()}
    if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(listing):
        sys.exit("FAIL: unexpected WordPress root")
    ftp.cwd(TARGET)
    listing={x.rstrip("/").rsplit("/",1)[-1] for x in ftp.nlst()}
    if NAME in listing:
        original=read(NAME)
        if MARKER not in original:
            sys.exit("FAIL: existing plugin is not ours")
        if original==SOURCE:
            print("ALREADY_DEPLOYED SHA256",hashlib.sha256(SOURCE).hexdigest(),flush=True)
            sys.exit(0)
        Path("ptscps-a11y-seo-before.php").write_bytes(original)
        ftp.storbinary("STOR "+back,io.BytesIO(original))
        if read(back)!=original:sys.exit("FAIL: backup checksum mismatch")
        print("ROLLBACK_FILE",back,hashlib.sha256(original).hexdigest(),flush=True)
    ftp.storbinary("STOR "+new_tmp,io.BytesIO(SOURCE))
    temp_active=True
    if hashlib.sha256(read(new_tmp)).digest()!=hashlib.sha256(SOURCE).digest():
        raise ValueError("staging SHA mismatch")
    if original is not None:
        ftp.rename(NAME,old_tmp)
        old_retired=True
    try:
        ftp.rename(new_tmp,NAME)
        temp_active=False
        if hashlib.sha256(read(NAME)).digest()!=hashlib.sha256(SOURCE).digest():
            raise ValueError("installed SHA mismatch")
    except Exception:
        if old_retired:
            try:ftp.delete(NAME)
            except ftplib.all_errors:pass
            ftp.rename(old_tmp,NAME)
            old_retired=False
        else:
            try:ftp.delete(NAME)
            except ftplib.all_errors:pass
        raise
    if old_retired:
        ftp.delete(old_tmp)
        old_retired=False
    print("DEPLOY_SUCCESS",NAME,"SHA256",hashlib.sha256(SOURCE).hexdigest(),flush=True)
finally:
    if temp_active:
        try:ftp.delete(new_tmp)
        except Exception:pass
    try:ftp.quit()
    except Exception:
        try:ftp.close()
        except Exception:pass
