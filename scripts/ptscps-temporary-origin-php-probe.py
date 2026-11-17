#!/usr/bin/env python3
"""One-shot origin-side PHP-vs-static latency probe over authenticated FTPS.

- Installs only a randomly named, tiny, standalone PHP file in document root.
- It does NOT bootstrap WordPress, access private settings, or change WP state.
- Compares actual remote HTTP timings against existing Jannah static CSS.
- Always attempts to remove the exact temporary file; fails if cleanup fails.
- Does not download hosting logs, report credentials or persist tokenized URL.
"""
import ftplib
import hashlib
import io
import json
import os
import secrets
import statistics
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

ORIGIN = "https://ptscps.com.vn/"
ROOT = "/domains/ptscps.com.vn/public_html"
CSS = ORIGIN + "wp-content/themes/jannah/assets/css/style.min.css?ver=7.6.3"
OUT = Path("ptscps-origin-php-probe")
OUT.mkdir(exist_ok=True)
PHP = b"""<?php
// Temporary, read-only response; does not load wp-config or other WordPress files.
$started = microtime(true);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');
echo json_encode(array(
    'ok' => true,
    'elapsed_ms' => round((microtime(true) - $started) * 1000, 3)
));
"""
FIELDS = {
    "time_namelookup": "dnsMs",
    "time_connect": "tcpMs",
    "time_appconnect": "tlsMs",
    "time_pretransfer": "pretransferMs",
    "time_starttransfer": "ttfbMs",
    "time_total": "totalMs",
}
def stat(values):
    a = sorted(v for v in values if isinstance(v, (float, int)))
    if not a:
        return {"n": 0}
    return {"n": len(a), "median": round(statistics.median(a), 1),
            "max": round(max(a), 1), "p90": round(a[min(len(a)-1, int(len(a)*.9))], 1)}
def connect():
    u = os.environ["FTP_SERVER"]
    parsed = urlsplit(u if "://" in u else "//" + u)
    if not parsed.hostname:
        raise ValueError("Missing FTP hostname")
    ftp = ftplib.FTP_TLS(timeout=28)
    ftp.connect(parsed.hostname, parsed.port or 21, timeout=28)
    ftp.auth()
    ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
    ftp.prot_p()
    ftp.set_pasv(True)
    return ftp
def read_file(ftp, name, max_bytes=12000):
    blocks=[]
    size=0
    def receive(b):
        nonlocal size
        size+=len(b)
        if size>max_bytes:
            raise ValueError("Unexpected large probe file")
        blocks.append(b)
    ftp.retrbinary("RETR " + name, receive)
    return b"".join(blocks)
def safe_close(ftp):
    try: ftp.quit()
    except Exception: ftp.close()
def measure(url, asset, protocol, cycle):
    # The PHP endpoint is identified by a high-entropy filename and exists only
    # during this short workflow. Do not print the actual path in logs.
    cmd=["curl","-sS","-L","--compressed","--connect-timeout","9",
         "--max-time","18","--http2" if protocol=="h2" else "--http1.1",
         "-H","Cookie:","-H","Cache-Control: no-cache",
         "-A","Mozilla/5.0 (compatible; PTSCPS-ReadOnly-Origin-Diagnostic/1.0)",
         "-w","\n__METRIC__%{json}\n",url]
    try:
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=22)
        if r.returncode:
            return {"asset":asset,"proto":protocol,"cycle":cycle,"ok":False,
                    "error":"curl_exit_"+str(r.returncode)}
        data_s=r.stdout.rsplit("__METRIC__",1)
        if len(data_s)!=2:
            raise ValueError("Missing curl timing marker")
        raw=data_s[0].strip()
        info=json.loads(data_s[1])
        times={b:round(float(info.get(a) or 0)*1000,1) for a,b in FIELDS.items()}
        row={"asset":asset,"proto":protocol,"cycle":cycle,
             "status":int(info.get("http_code",0)),
             "httpVersion":info.get("http_version"),
             "bytes":int(info.get("size_download") or 0),
             **times}
        row["waitAfterSetupMs"]=round(times["ttfbMs"]-times["pretransferMs"],1)
        row["bodyMs"]=round(times["totalMs"]-times["ttfbMs"],1)
        row["ok"]=row["status"]==200
        if asset=="php":
            # Extra leading data from intermediate redirects would be a
            # signal of an unexpected response, so fail closed.
            payload=json.loads(raw)
            row["phpElapsedMs"]=payload.get("elapsed_ms")
            row["ok"]=row["ok"] and payload.get("ok") is True and \
                isinstance(row["phpElapsedMs"],(int,float))
        return row
    except Exception as exc:
        return {"asset":asset,"proto":protocol,"cycle":cycle,"ok":False,
                "error":type(exc).__name__}
def main():
    label="ptscps-origin-diagnostic-"+secrets.token_hex(14)+".php"
    path=ROOT+"/"+label
    url=ORIGIN+label
    ftp=None
    created=False
    cleanup_ok=False
    rows=[]
    try:
        ftp=connect()
        ftp.cwd(ROOT)
        seen={p.rsplit("/",1)[-1] for p in ftp.nlst()}
        if not {"index.php","wp-admin","wp-content","wp-includes"}.issubset(seen):
            raise RuntimeError("Unexpected WordPress root")
        if label in seen:
            raise RuntimeError("Probe collision, refusing overwrite")
        ftp.storbinary("STOR "+path,io.BytesIO(PHP))
        created=True
        if hashlib.sha256(read_file(ftp,path)).digest()!=hashlib.sha256(PHP).digest():
            raise RuntimeError("FTPS probe checksum mismatch")
        print("PROBE_STARTED temporary PHP response deployed over secure FTPS",flush=True)
        pairs=6
        for cycle in range(pairs):
            order=[("css","h2"),("php","h2"),("php","h1"),("css","h1")]
            if cycle%2:
                order.reverse()
            for asset,proto in order:
                r=measure(url if asset=="php" else CSS,asset,proto,cycle)
                rows.append(r)
                print("PROBE_CASE "+json.dumps(r,sort_keys=True),flush=True)
        groups=[]
        for asset in ["css","php"]:
            for protocol in ["h1","h2"]:
                subset=[x for x in rows if x["asset"]==asset and
                        x["proto"]==protocol and x.get("ok")]
                a={"asset":asset,"proto":protocol,"valid":len(subset),"attempted":pairs,
                   "ttfbMs":stat([x["ttfbMs"] for x in subset]),
                   "waitAfterSetupMs":stat([x["waitAfterSetupMs"] for x in subset]),
                   "bodyMs":stat([x["bodyMs"] for x in subset])}
                if asset=="php":
                    a["phpElapsedMs"]=stat([x["phpElapsedMs"] for x in subset])
                groups.append(a)
                print("PROBE_SUMMARY "+json.dumps(a,sort_keys=True),flush=True)
        (OUT/"summary.json").write_text(json.dumps({"groups":groups,"rows":rows},
            indent=2),encoding="utf-8")
        if any(x["valid"]<pairs-1 for x in groups):
            raise RuntimeError("Too many failed samples")
    finally:
        # The only file that can be removed is the random name created here.
        if created:
            try:
                if ftp is None:
                    ftp=connect()
                ftp.delete(path)
                try:
                    ftp.size(path)
                except ftplib.error_perm:
                    cleanup_ok=True
                else:
                    print("PROBE_CLEANUP_FAILED probe still visible via FTPS")
            except Exception as exc:
                print("PROBE_CLEANUP_WARNING "+type(exc).__name__)
                try:
                    new_ftp=connect()
                    try:
                        new_ftp.delete(path)
                        cleanup_ok=True
                    finally:
                        safe_close(new_ftp)
                except Exception as e2:
                    print("PROBE_CLEANUP_FAILED "+type(e2).__name__)
        if ftp is not None:
            safe_close(ftp)
        print("PROBE_CLEANUP "+("SUCCESS" if cleanup_ok else "FAILED" if created else "NOT_CREATED"))
        if created and not cleanup_ok:
            sys.exit(2)
if __name__=="__main__":
    main()
