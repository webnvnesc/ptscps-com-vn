#!/usr/bin/env python3
"""One-time, scoped WebP migration for audited PTSCPS customer logos.

Original JPG/PNG files, Media Library links, Elementor data and CSS unchanged.
Encrypted FTPS; exact audited source byte-length gate; never overwrites a WebP.
Roll back ONLY sidecars created by this job whose hashes still match.
"""
import ftplib
import hashlib
import io
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit
from PIL import Image, UnidentifiedImageError

ROOT = "/domains/ptscps.com.vn/public_html"
UPLOADS = ROOT + "/wp-content/uploads/"
STATE = Path("customer-webp-created.json")
# Exact inventory from read-only Chrome audit #44094770705 (19 unique customer images).
AUDITED = {
    "2019/12/logo_NSRP.png":11149,
    "2024/11/harbour-logo.jpg":26665,
    "2025/09/z6979874551665_c8eb34aea9a83efe75c7d7f7eaf2c96e.jpg":6795,
    "2025/09/z6979874281864_b62cc6399bb17ed6d2f7d64bcc059a17.jpg":6722,
    "2025/11/MVOT.jpg":7126,
    "2024/04/2222221z5245174915163_4145568119040ed86e3b35d70f0b52ca-768x289.jpg":15971,
    "2022/09/premier-oil.png":15619,
    "2024/04/333333z5245174082713_4252facd17ae73b1c1d1864970e283b0-1024x354.jpg":16024,
    "2020/03/Murphy.png":18328,
    "2020/03/VOFT.png":35848,
    "2019/10/pps-doi-tac-1.jpg":5939,
    "2019/12/logo_Hoang-Vu.png":10946,
    "2025/04/idemitsu-logo.jpg":25093,
    "2019/12/logo_Rosneft.png":5110,
    "2019/12/logo_Hoang-Long.png":12132,
    "2019/12/logo_Knoc.png":6180,
    "2019/10/pps-doi-tac-4.png":5552,
    "2019/10/pps-doi-tac-5.png":3270,
    "2024/11/thang-long-logo.jpg":44893,
}
MARK = "PTSCPS_CUSTOMER_WEBP_20261117_v1"

def digest(x):
    return hashlib.sha256(x).hexdigest()

def connect():
    raw = os.environ["FTP_SERVER"]
    url = urlsplit(raw if "://" in raw else "//" + raw)
    f = ftplib.FTP_TLS(timeout=28)
    f.connect(url.hostname, url.port or 21, timeout=28)
    f.auth()
    f.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
    f.prot_p()
    f.set_pasv(True)
    f.cwd(ROOT)
    items = {x.rstrip("/").rsplit("/", 1)[-1] for x in f.nlst()}
    if not {"wp-admin","wp-includes","wp-content","index.php"}.issubset(items):
        raise RuntimeError("Unexpected WordPress root")
    return f

def read(f, path):
    out=bytearray()
    def add(buf):
        if len(out)+len(buf)>12_000_000:
            raise RuntimeError("Unexpectedly large image")
        out.extend(buf)
    f.retrbinary("RETR " + path, add)
    return bytes(out)

def optional(f, path):
    try:
        return read(f, path)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):
            return None
        raise

def convert(path, raw):
    with Image.open(io.BytesIO(raw)) as im:
        im.load()
        w,h=im.size
        if w*h>12_000_000 or w<1 or h<1:
            raise RuntimeError("Invalid image dimensions")
        # Preserve PNG transparency; convert unsupported palette profiles to RGBA.
        if path.lower().endswith(".png"):
            img=im.convert("RGBA") if ("A" in im.getbands() or "transparency" in im.info) else im.convert("RGB")
        else:
            img=im.convert("RGB")
        dst=io.BytesIO()
        img.save(dst, format="WEBP", quality=82, method=6)
        webp=dst.getvalue()
        with Image.open(io.BytesIO(webp)) as check:
            if check.format!="WEBP" or check.size!=(w,h):
                raise RuntimeError("WebP verify failed")
        return webp,(w,h)

def write_state(items, issues=None):
    STATE.write_text(json.dumps({"marker":MARK, "created":items, "issues":issues or []},indent=2))

def deploy(f):
    created=[]
    issues=[]
    write_state(created)
    for relative,expected_bytes in AUDITED.items():
        original=UPLOADS+relative
        sidecar=original+".webp"
        record={"file":relative}
        try:
            jpg=read(f, original)
            if len(jpg)!=expected_bytes:
                record.update(skip="source-size-changed",auditBytes=expected_bytes,actualBytes=len(jpg))
                issues.append(record)
                continue
            prior=optional(f,sidecar)
            if prior is not None:
                record.update(skip="sidecar-already-present")
                issues.append(record)
                continue
            webp,dimensions=convert(relative,jpg)
            if len(webp)>=len(jpg)*0.96:
                record.update(skip="not-enough-saving",originalBytes=len(jpg),webpBytes=len(webp))
                issues.append(record)
                continue
            # Source re-check ensures not overwriting concurrently replaced source.
            if digest(read(f,original))!=digest(jpg):
                raise RuntimeError("Source changed during conversion")
            # Atomic adjacent temp upload, the .webp sidecar is registered only after verified rename.
            tmp=sidecar+"."+os.urandom(6).hex()+".tmp"
            f.storbinary("STOR "+tmp,io.BytesIO(webp))
            if digest(read(f,tmp))!=digest(webp):
                raise RuntimeError("Uploaded WebP checksum mismatch")
            if optional(f,sidecar) is not None:
                f.delete(tmp)
                issues.append({"file":relative,"skip":"sidecar-appeared-concurrently"})
                continue
            f.rename(tmp,sidecar)
            if digest(read(f,sidecar))!=digest(webp):
                raise RuntimeError("Final sidecar mismatch")
            row={"file":relative,"hash":digest(webp),"sourceHash":digest(jpg),
                 "sourceBytes":len(jpg),"webpBytes":len(webp),"width":dimensions[0],"height":dimensions[1]}
            created.append(row)
            write_state(created,issues)
            print("CUSTOMER_WEBP_CREATED "+json.dumps(row),flush=True)
        except Exception as e:
            record.update(error=type(e).__name__+":"+str(e)[:150])
            issues.append(record)
            write_state(created,issues)
            # No best-effort mutation on a failure: let QA/rollback handle known created paths.
            raise
    write_state(created,issues)
    print("CUSTOMER_WEBP_DEPLOY_SUMMARY "+json.dumps({"created":len(created),"skipped":issues,
         "sourceBytes":sum(x["sourceBytes"] for x in created),
         "webpBytes":sum(x["webpBytes"] for x in created)}),flush=True)

def rollback(f):
    if not STATE.exists():
        print("CUSTOMER_WEBP_ROLLBACK_NO_STATE")
        return
    data=json.loads(STATE.read_text())
    if data.get("marker")!=MARK:
        raise RuntimeError("Refusing state from different job")
    deleted=0
    for row in data["created"]:
        relative=row["file"]
        if relative not in AUDITED:
            raise RuntimeError("Unexpected sidecar path")
        path=UPLOADS+relative+".webp"
        existing=optional(f,path)
        if existing is None:
            continue
        if digest(existing)!=row["hash"]:
            raise RuntimeError("Refusing deletion: sidecar has changed")
        f.delete(path)
        if optional(f,path) is not None:
            raise RuntimeError("Rollback did not delete sidecar")
        deleted+=1
    print("CUSTOMER_WEBP_ROLLBACK_OK "+json.dumps({"deleted":deleted}),flush=True)

if __name__=="__main__":
    if len(sys.argv)!=2 or sys.argv[1] not in ("deploy","rollback"):
        raise SystemExit("Usage deploy|rollback")
    f=connect()
    try:
        if sys.argv[1]=="deploy":
            deploy(f)
        else:
            rollback(f)
    finally:
        try:f.quit()
        except Exception:f.close()
