#!/usr/bin/env python3
"""Deploy vetted PTSCPS root llms.txt over TLS FTP; checksum, stop-on-conflict,
backup, rollback. Never alters WordPress, theme, Elementor, or cached page HTML.
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
NAME="llms.txt"
SRC=Path("deploy/llms.txt").read_bytes()
MARKER=b"# PTSC Production Services JSC (PTSC PPS)"
if not SRC.startswith(MARKER) or len(SRC)>20000 or b"\r\n" in SRC:
    sys.exit("FAIL: unexpected llms content or size")
if b"https://ptscps.com.vn/" not in SRC or b"## D" not in SRC:
    sys.exit("FAIL: missing canonical links or sections")
host=os.environ.get("FTP_SERVER","")
user=os.environ.get("FTP_USERNAME","")
password=os.environ.get("FTP_PASSWORD","")
if not all((host,user,password)):
    sys.exit("FAIL: FTPS secrets unavailable")
loc=urlsplit(host if "://" in host else "//"+host)
if not loc.hostname:
    sys.exit("FAIL: invalid FTPS host")
socket.getaddrinfo(loc.hostname,loc.port or 21,type=socket.SOCK_STREAM)
ftp=ftplib.FTP_TLS(timeout=30)
uid=uuid.uuid4().hex[:12]
temp=".ptscps-llms-"+uid+".tmp"
old=".ptscps-llms-old-"+uid+".tmp"
backup=".ptscps-llms-backup-"+uid+".txt.bak"
temp_exists=False
old_exists=False
original=None
def read(name):
    data=bytearray()
    def add(chunk):
        if len(data)+len(chunk)>25000:
            raise ValueError("Unexpected remote llms.txt size")
        data.extend(chunk)
    ftp.retrbinary("RETR "+name,add)
    return bytes(data)
try:
    ftp.connect(loc.hostname,loc.port or 21,timeout=30)
    ftp.auth();ftp.login(user,password);ftp.prot_p();ftp.set_pasv(True)
    ftp.cwd(ROOT)
    names={x.rstrip("/").split("/")[-1] for x in ftp.nlst()}
    if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(names):
        sys.exit("FAIL: unexpected WordPress root")
    if NAME in names:
        original=read(NAME)
        if original==SRC:
            print("ALREADY_DEPLOYED",hashlib.sha256(SRC).hexdigest(),flush=True)
            sys.exit(0)
        # Never overwrite a separately managed root llms file.
        if not original.startswith(MARKER):
            sys.exit("FAIL: root llms.txt exists with unknown owner; refusing overwrite")
        Path("llms-previous.txt").write_bytes(original)
        ftp.storbinary("STOR "+backup,io.BytesIO(original))
        if read(backup)!=original:
            raise RuntimeError("Rollback backup checksum mismatch")
        print("ROLLBACK_BACKUP",backup,flush=True)
    ftp.storbinary("STOR "+temp,io.BytesIO(SRC))
    temp_exists=True
    if hashlib.sha256(read(temp)).digest()!=hashlib.sha256(SRC).digest():
        raise RuntimeError("staged llms checksum mismatch")
    if original is not None:
        ftp.rename(NAME,old)
        old_exists=True
    try:
        ftp.rename(temp,NAME)
        temp_exists=False
        if read(NAME)!=SRC:
            raise RuntimeError("installed llms checksum mismatch")
    except Exception:
        try:ftp.delete(NAME)
        except ftplib.all_errors:pass
        if old_exists:
            ftp.rename(old,NAME)
            old_exists=False
        raise
    if old_exists:
        ftp.delete(old)
        old_exists=False
    print("LLMS_DEPLOYED",NAME,"SHA256",hashlib.sha256(SRC).hexdigest(),"BYTES",len(SRC),flush=True)
finally:
    if temp_exists:
        try:ftp.delete(temp)
        except Exception:pass
    try:ftp.quit()
    except Exception:ftp.close()
