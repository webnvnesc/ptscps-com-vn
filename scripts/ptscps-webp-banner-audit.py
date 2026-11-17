#!/usr/bin/env python3
"""Read-only FTPS audit of PTSCPS 3 live SR7 JPEG banners and WebP savings.

No files are modified. Collects JPEGs from the *exact* production uploads dir
over encrypted FTPS, converts locally in GitHub runner memory, measures savings,
and inspects .htaccess existence without printing private content.
"""
import ftplib, os, io, json, hashlib, sys, math
from urllib.parse import urlsplit
from PIL import Image, ImageChops, ImageStat

ROOT="/domains/ptscps.com.vn/public_html"
DIR=ROOT+"/wp-content/uploads/2019/10"
NAMES=["ruby-banner.jpg","banner2.jpg","banner3.jpg"]
def ftps():
    u=os.environ["FTP_SERVER"]
    p=urlsplit(u if "://" in u else "//"+u)
    f=ftplib.FTP_TLS(timeout=30)
    f.connect(p.hostname,p.port or 21,timeout=30)
    f.auth()
    f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
    f.prot_p()
    f.set_pasv(True)
    f.cwd(ROOT)
    roots={x.rstrip("/").rsplit("/",1)[-1] for x in f.nlst()}
    if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(roots):
        raise RuntimeError("Unexpected WordPress root")
    return f
def read(f,p):
    result=bytearray()
    def sink(block):
        if len(result)+len(block)>16_000_000:
            raise RuntimeError("Unexpectedly large image or config")
        result.extend(block)
    f.retrbinary("RETR "+p,sink)
    return bytes(result)
def optional(f,p):
    try:return read(f,p)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):return None
        raise
def stats(jpg):
    rgb=Image.open(io.BytesIO(jpg))
    if rgb.format!="JPEG":raise RuntimeError("Source not JPEG")
    rgb.load()
    if rgb.width<100 or rgb.height<50:raise RuntimeError("Image size unexpected")
    if rgb.width*rgb.height>15_000_000:raise RuntimeError("Image too large")
    out=io.BytesIO()
    rgb.convert("RGB").save(out,format="WEBP",quality=85,method=6)
    webp=out.getvalue()
    if not webp.startswith(b"RIFF") or b"WEBP" not in webp[:16]:
        raise RuntimeError("Converted result not WebP")
    decoded=Image.open(io.BytesIO(webp)).convert("RGB")
    source=rgb.convert("RGB")
    delta=ImageChops.difference(source,decoded)
    st=ImageStat.Stat(delta)
    # MAE RGB is a coarse image distortion sanity check, NOT perceptual SSIM.
    mae=sum(st.mean)/len(st.mean)
    return dict(width=rgb.width,height=rgb.height,jpeg_bytes=len(jpg),
                webp_bytes=len(webp),saving_percent=round((1-len(webp)/len(jpg))*100,2),
                mae=round(mae,2),webp_sha256=hashlib.sha256(webp).hexdigest())
def main():
    f=ftps()
    report={"source_dir":"wp-content/uploads/2019/10","files":[]}
    try:
        ht=optional(f,DIR+"/.htaccess")
        report["htaccess"]={
            "exists":ht is not None,"bytes":len(ht) if ht else 0,
            "has_pilot_marker":bool(ht and b"PTSCPS_WEBP_BANNERS_PILOT" in ht),
            "has_modrewrite":bool(ht and b"RewriteEngine" in ht),
            "has_webp_directive":bool(ht and b"webp" in ht.lower())
        }
        total_j=0;total_w=0
        for name in NAMES:
            raw=read(f,DIR+"/"+name)
            s=stats(raw)
            other=optional(f,DIR+"/"+name+".webp")
            s.update(name=name,existing_webp=other is not None,
                     existing_webp_bytes=len(other) if other else None)
            report["files"].append(s)
            total_j+=s["jpeg_bytes"]
            total_w+=s["webp_bytes"]
        report["total"]={"jpeg_bytes":total_j,"webp_bytes":total_w,
          "saving_percent":round((1-total_w/total_j)*100,2)}
        os.makedirs("ptscps-webp-pilot-audit",exist_ok=True)
        with open("ptscps-webp-pilot-audit/report.json","w") as w:
            json.dump(report,w,indent=2)
        print("WEBP_AUDIT "+json.dumps(report),flush=True)
        if total_w>=total_j:
            print("WEBP_AUDIT_WARNING WebP total bigger than JPG; do not enable blindly",flush=True)
    finally:
        try:f.quit()
        except Exception:f.close()
if __name__=="__main__":
    try:main()
    except Exception as e:
        print("WEBP_AUDIT_ERROR "+type(e).__name__+": "+str(e)[:160],flush=True)
        sys.exit(1)
