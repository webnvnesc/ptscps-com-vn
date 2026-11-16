#!/usr/bin/env python3
"""Read-only first-visitor HTML cache and origin-response timing audit.
Prints headers from an explicit allowlist, no cookies or HTML response content.
WordPress FTPS probes only file names under wp-content, never reads file bytes.
"""
import ftplib
import json
import os
import re
import subprocess
from urllib.parse import urlsplit

PAGES = {
    "home": "https://ptscps.com.vn/",
    "news": "https://ptscps.com.vn/c/hoat-dong-cua-cong-ty",
    "service": "https://ptscps.com.vn/dich-vu/van-hanh-va-bao-duong-fpso-fso-mopu",
}
SAFE_HEADERS = {
    "cache-control", "age", "expires", "vary", "etag", "last-modified",
    "x-cache", "x-cache-status", "cf-cache-status", "x-litespeed-cache",
    "x-lsadc-cache", "x-fastcgi-cache", "x-proxy-cache",
    "x-wp-rocket-cache", "x-cache-enabled", "server-timing",
    "content-encoding", "content-type"
}
def curl_probe(url):
    args = [
        "curl", "--silent", "--show-error", "--location", "--compressed", "--http2",
        "--connect-timeout", "12", "--max-time", "45",
        "--header", "Accept: text/html",
        "--user-agent", "Mozilla/5.0 (compatible; PTSCPS-FCP-ReadOnly-Audit/1.0)",
        "--dump-header", "-", "--output", "/dev/null",
        "--write-out",
        "\n__DATA__%{http_code}|%{http_version}|%{time_namelookup}|%{time_connect}|%{time_appconnect}|%{time_starttransfer}|%{time_total}|%{size_download}\n",
        url,
    ]
    proc = subprocess.run(args, capture_output=True, text=True, timeout=55, check=False)
    if proc.returncode:
        return {"error":proc.stderr[-200:], "exit":proc.returncode}
    separator = "__DATA__"
    if separator not in proc.stdout:
        return {"error":"curl missing metrics"}
    raw, metrics = proc.stdout.rsplit(separator, 1)
    parts = metrics.strip().split("|")
    chunks = re.split(r"(?=^HTTP/\S+\s+\d{3})", raw.replace("\r\n", "\n"), flags=re.M)
    final = [c for c in chunks if re.match(r"HTTP/\S+\s+\d{3}", c)]
    headers = {}
    for line in (final[-1] if final else "").splitlines()[1:]:
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        if k.strip().lower() in SAFE_HEADERS:
            headers[k.strip().lower()] = v.strip()[:200]
    return {
        "code":int(parts[0]), "http":parts[1],
        "dnsMs":round(float(parts[2])*1000),
        "connectMs":round(float(parts[3])*1000),
        "tlsMs":round(float(parts[4])*1000),
        "ttfbMs":round(float(parts[5])*1000),
        "totalMs":round(float(parts[6])*1000),
        "bytes":int(float(parts[7])), "headers":headers,
    }

def ftp_inventory():
    server = os.getenv("FTP_SERVER", "")
    user = os.getenv("FTP_USERNAME", "")
    password = os.getenv("FTP_PASSWORD", "")
    if not (server and user and password):
        return {"available":False, "reason":"secrets not supplied"}
    server_info = urlsplit(server if "://" in server else "//"+server)
    ftp = ftplib.FTP_TLS(timeout=25)
    root = "/domains/ptscps.com.vn/public_html"
    def safe_list(path):
        try:
            return {name:meta.get("type") for name,meta in ftp.mlsd(root + path)}
        except (ftplib.all_errors, OSError):
            return {}
    try:
        ftp.connect(server_info.hostname, server_info.port or 21, timeout=25)
        ftp.auth()
        ftp.login(user, password)
        ftp.prot_p()
        ftp.set_pasv(True)
        # Metadata only; never fetch .htaccess, wp-config.php, logs, uploads or plugin source.
        content = safe_list("/wp-content")
        plugins = safe_list("/wp-content/plugins")
        mu_plugins = safe_list("/wp-content/mu-plugins")
        cache_regex = re.compile(r"(cache|optim|speed|performance|litespeed|redis|varnish|rocket|nitropack|cloudflare)", re.I)
        return {
            "available": True,
            "advancedCacheDropInPresent":content.get("advanced-cache.php")=="file",
            "objectCacheDropInPresent":content.get("object-cache.php")=="file",
            "wpContentCacheDirPresent":content.get("cache")=="dir",
            "candidateCachePluginDirs":sorted(x for x,t in plugins.items()
                if t=="dir" and cache_regex.search(x))[:25],
            "muPluginDirectoryPresent":content.get("mu-plugins")=="dir",
            "muPluginCacheRelatedNames":sorted(x for x in mu_plugins
                if cache_regex.search(x))[:25]
        }
    except Exception as e:
        return {"available":False,"errorType":type(e).__name__}
    finally:
        try: ftp.quit()
        except Exception: ftp.close()

def main():
    records = []
    for page_name, url in PAGES.items():
        for n in range(3):
            data = curl_probe(url)
            row = {"page":page_name,"kind":"cold-browser-no-cookie","cycle":n+1,**data}
            records.append(row)
            print("HTTP "+json.dumps(row,ensure_ascii=False),flush=True)
    # This URL differs from the canonical page, so it can only suggest bypass behavior,
    # not prove the performance of a genuinely uncached normal URL.
    test = curl_probe(PAGES["home"]+"?__ptscps_readonly_cache_probe=20261116")
    row = {"page":"home","kind":"query-string-probe","cycle":1,**test}
    records.append(row)
    print("HTTP "+json.dumps(row,ensure_ascii=False),flush=True)
    ftps = ftp_inventory()
    print("FTPS_METADATA "+json.dumps(ftps,ensure_ascii=False),flush=True)
    os.makedirs("html-cache-results",exist_ok=True)
    with open("html-cache-results/summary.json","w",encoding="utf-8") as f:
        json.dump({"http":records,"ftps":ftps},f,indent=2,ensure_ascii=False)
    if any(r.get("code") != 200 for r in records):
        raise SystemExit("Non-200 HTTP response in cache audit")
if __name__ == "__main__":
    main()
