#!/usr/bin/env python3
"""Create a static non-enqueued Jannah 6-CSS test bundle on production FTPS.
Does not change any active source, WordPress database, config or existing files."""
import os, re, ftplib, hashlib, io, json, urllib.request, urllib.parse, html.parser, sys
BASE="https://ptscps.com.vn/"
ROOT="/domains/ptscps.com.vn/public_html"
TARGET="wp-content/themes/jannah-child/ptscps-css-bundle-audit-20261116.css"
HANDLES=["tie-css-base-css","tie-css-styles-css","tie-css-widgets-css","tie-css-helpers-css",
         "tie-fontawesome5-css","tie-css-ilightbox-css"]
class Links(html.parser.HTMLParser):
    def __init__(self): super().__init__();self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag!="link":return
        d=dict(attrs)
        if "stylesheet" in (d.get("rel") or ""):
            self.links.append(d)
def retrieve(url):
    req=urllib.request.Request(url,headers={"User-Agent":"PTSCPS-CSS-ReadOnly-Audit/1.0"})
    with urllib.request.urlopen(req,timeout=30) as r:
        if r.status!=200:raise ValueError("HTTP "+str(r.status))
        data=r.read(600000)
        if len(data)>=600000:raise ValueError("Unexpected oversized CSS")
        return data.decode("utf-8","replace")
parser=Links()
parser.feed(retrieve(BASE))
positions=[]
for h in HANDLES:
    hits=[(i,x)for i,x in enumerate(parser.links)if x.get("id")==h]
    if len(hits)!=1:raise RuntimeError("Missing/duplicate stylesheet handle "+h)
    positions.append(hits[0])
idx=[p for p,_ in positions]
if any(idx[i]!=idx[i-1]+1 for i in range(1,len(idx))):
    raise RuntimeError("Stylesheets not adjacent; abort")
chunks=[]
for index,tag in positions:
    url=urllib.parse.urljoin(BASE,tag["href"])
    if not url.startswith(BASE+"wp-content/themes/jannah/"):
        raise RuntimeError("Unexpected CSS origin")
    css=retrieve(url)
    if re.search(r"@import\s",css,re.I):raise RuntimeError("Nested CSS imports unsupported")
    def replace_url(match):
        raw=(match.group(2)if match.group(2)is not None else match.group(3)).strip()
        if not raw or re.match(r"(?:data:|https?:|//|#|blob:)",raw,re.I):return match.group(0)
        return 'url("'+urllib.parse.urljoin(url,raw)+'")'
    css=re.sub(r"url\(\s*(?:([\"'])(.*?)\1|([^)]*))\s*\)",replace_url,css,flags=re.I)
    chunks.append("/* "+tag["id"]+" */\n"+css+"\n")
new=("\n".join(chunks)).encode("utf-8")
sha=hashlib.sha256(new).hexdigest()
p=urllib.parse.urlsplit(os.environ["FTP_SERVER"] if "://" in os.environ["FTP_SERVER"] else "//"+os.environ["FTP_SERVER"])
f=ftplib.FTP_TLS()
f.connect(p.hostname,p.port or 21,timeout=25);f.auth()
f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p()
def read(rel):
    dat=bytearray()
    f.retrbinary("RETR "+rel,dat.extend)
    return bytes(dat)
try:
    f.cwd(ROOT)
    names={v.rstrip("/").split("/")[-1]for v in f.nlst()}
    if not {"wp-content","wp-admin","wp-includes","index.php"}.issubset(names):
        raise RuntimeError("Unexpected WordPress install")
    dest=ROOT+"/"+TARGET
    current=None
    try:current=read(dest)
    except ftplib.error_perm:pass
    if current is not None and current!=new:raise RuntimeError("Existing test asset differs; refuse overwrite")
    if current is None:
        f.storbinary("STOR "+dest,io.BytesIO(new))
        if hashlib.sha256(read(dest)).hexdigest()!=sha:
            f.delete(dest);raise RuntimeError("Checksum mismatch")
    print("ASSET "+json.dumps({"status":"verified","active":False,"path":TARGET,
        "url":BASE+TARGET,"sha256":sha,"bytes":len(new),"parts":HANDLES,
        "existing_reused":current is not None},ensure_ascii=False))
finally:
    try:f.quit()
    except Exception:f.close()
