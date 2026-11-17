#!/usr/bin/env python3
"""Build and install a guarded six-file Jannah CSS bundle and one MU plugin.
Encrypted FTPS, hash-based backups, and in-job rollback state.
Only the CSS in jannah-child and our dedicated MU plugin may be touched.
"""
import ftplib
import hashlib
import io
import json
import os
import re
import uuid
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ORIGIN="https://ptscps.com.vn/"
ROOT="/domains/ptscps.com.vn/public_html"
THEME=ROOT+"/wp-content/themes/jannah-child/"
MU=ROOT+"/wp-content/mu-plugins/"
BUNDLE="ptscps-jannah-core6-20261117-v1.css"
MANIFEST="ptscps-jannah-core6-20261117-v1.json"
PLUGIN="ptscps-jannah-core6-bundle.php"
STATE=Path("ptscps-core6-deploy-state.json")
BEFORE=Path("ptscps-core6-plugin-before.php")
HANDLES=[
    "tie-css-base-css","tie-css-styles-css","tie-css-widgets-css",
    "tie-css-helpers-css","tie-fontawesome5-css","tie-css-ilightbox-css"
]
class Styles(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags=[]
    def handle_starttag(self,tag,attrs):
        if tag=="link":
            d=dict(attrs)
            if "stylesheet" in (d.get("rel") or ""):
                self.tags.append(d)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def public(url,maxlen=3_000_000):
    if not url.startswith(ORIGIN):
        raise RuntimeError("Unexpected source domain "+url[:130])
    req=urllib.request.Request(url,headers={"User-Agent":"PTSCPS-Core6-Release/1.0",
                                                "Accept":"text/css,text/html,*/*"})
    with urllib.request.urlopen(req,timeout=38) as res:
        if res.status!=200:
            raise RuntimeError("HTTP source "+str(res.status))
        raw=res.read(maxlen+1)
        if len(raw)>maxlen:
            raise RuntimeError("Source too large")
        return raw

def rebase(css,url):
    if re.search(r"@import\s",css,re.I):
        raise RuntimeError("Unsafe @import in "+url)
    def fix(m):
        value=(m.group(2) if m.group(2) is not None else m.group(3)).strip()
        if not value or re.match(r"(?i)^(?:data:|https?:|//|#|blob:|about:)",value):
            return m.group(0)
        return 'url("'+urllib.parse.urljoin(url,value)+'")'
    return re.sub(r"url\(\s*(?:([\"'])(.*?)\1|([^)]*))\s*\)",fix,css,flags=re.I)

def prepare():
    html=public(ORIGIN).decode("utf-8","replace")
    p=Styles()
    p.feed(html)
    pairs=[]
    for handle in HANDLES:
        items=[(i,x) for i,x in enumerate(p.tags) if x.get("id")==handle]
        if len(items)!=1:
            raise RuntimeError("Missing / duplicate handle "+handle)
        i,tag=items[0]
        media=(tag.get("media") or "all").lower().strip()
        if media not in ("","all"):
            raise RuntimeError("Media mismatch for "+handle)
        source=urllib.parse.urljoin(ORIGIN,tag["href"].replace("&amp;","&"))
        parsed=urllib.parse.urlsplit(source)
        if parsed.hostname!="ptscps.com.vn" or not parsed.path.startswith("/wp-content/themes/jannah/"):
            raise RuntimeError("CSS not owned by Jannah: "+source)
        pairs.append((i,handle,source))
    if any(pairs[i][0]!=pairs[i-1][0]+1 for i in range(1,len(pairs))):
        raise RuntimeError("CSS handles are not consecutive")
    chunks=[]
    sources={}
    for _,handle,url in pairs:
        css=public(url).decode("utf-8","replace")
        if len(css)<200:
            raise RuntimeError("CSS unexpectedly small: "+url)
        sources[handle]=url
        chunks.append("/* "+handle+" */\n"+rebase(css,url)+"\n")
    joined=("\n".join(chunks)).encode("utf-8")
    if len(joined)<20000:
        raise RuntimeError("Bundle unexpectedly small")
    manifest={
        "version":"1.0.0",
        "sources":sources,
        "sha256":sha(joined),
        "bytes":len(joined),
        "handles":HANDLES
    }
    Path("ptscps-core6-built.css").write_bytes(joined)
    Path("ptscps-core6-built.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print("CORE6_BUILD "+json.dumps({"sha256":sha(joined),"size":len(joined),"sources":sources}),flush=True)
    return joined,json.dumps(manifest,ensure_ascii=False,indent=2).encode("utf-8")

def connect():
    raw=os.environ["FTP_SERVER"]
    url=urllib.parse.urlsplit(raw if "://" in raw else "//"+raw)
    ftps=ftplib.FTP_TLS(timeout=32)
    ftps.connect(url.hostname,url.port or 21,timeout=32)
    ftps.auth()
    ftps.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
    ftps.prot_p()
    ftps.set_pasv(True)
    ftps.cwd(ROOT)
    names={x.rstrip("/").split("/")[-1] for x in ftps.nlst()}
    if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(names):
        raise RuntimeError("Unexpected WP root")
    return ftps

def read(ftps,name):
    output=bytearray()
    ftps.retrbinary("RETR "+name,output.extend)
    return bytes(output)

def maybe(ftps,name):
    try:
        return read(ftps,name)
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            return None
        raise

def upload(ftps,target,raw):
    temp=target+"."+uuid.uuid4().hex[:10]+".tmp"
    ftps.storbinary("STOR "+temp,io.BytesIO(raw))
    if sha(read(ftps,temp))!=sha(raw):
        raise RuntimeError("Upload temp integrity failed for "+target)
    if maybe(ftps,target) is not None:
        raise RuntimeError("Refusing to overwrite existing file: "+target)
    ftps.rename(temp,target)
    if sha(read(ftps,target))!=sha(raw):
        raise RuntimeError("Final upload checksum failed for "+target)

def save_state(state):
    STATE.write_text(json.dumps(state,indent=2))

def deploy():
    css,manifest=prepare()
    plugin=Path("deploy/"+PLUGIN).read_bytes()
    if b"Plugin Name: PTSCPS Reversible Jannah Core 6 CSS Bundle" not in plugin:
        raise RuntimeError("Unrecognized plugin")
    state={"marker":"PTSCPS_CORE6_20261117_v1","created":[],"plugin":None,
           "assets":{},"hash":sha(css)}
    save_state(state)
    ftps=connect()
    try:
        for name,body in [(BUNDLE,css),(MANIFEST,manifest)]:
            target=THEME+name
            existing=maybe(ftps,target)
            if existing is not None:
                if existing!=body:
                    raise RuntimeError("CSS artifact already exists with different bytes; fail closed "+name)
                state["assets"][name]="reused"
            else:
                upload(ftps,target,body)
                state["assets"][name]="new"
                state["created"].append({"target":target,"sha256":sha(body)})
            save_state(state)
        target=MU+PLUGIN
        old=maybe(ftps,target)
        if old is not None and b"Plugin Name: PTSCPS Reversible Jannah Core 6 CSS Bundle" not in old:
            raise RuntimeError("Refuse to touch unrelated plugin")
        if old==plugin:
            state["plugin"]="reused"
        elif old is None:
            upload(ftps,target,plugin)
            state["plugin"]="new"
            state["created"].append({"target":target,"sha256":sha(plugin)})
        else:
            # Upgrade our own plugin with prior bytes retained for exact rollback.
            BEFORE.write_bytes(old)
            stage=target+"."+uuid.uuid4().hex[:10]+".tmp"
            ftps.storbinary("STOR "+stage,io.BytesIO(plugin))
            if sha(read(ftps,stage))!=sha(plugin):
                raise RuntimeError("Plugin stage checksum failed")
            parked=target+"."+uuid.uuid4().hex[:10]+".parked"
            ftps.rename(target,parked)
            try:
                ftps.rename(stage,target)
            except Exception:
                ftps.rename(parked,target)
                raise
            if sha(read(ftps,target))!=sha(plugin):
                raise RuntimeError("Plugin checksum after swap failed")
            ftps.delete(parked)
            state["plugin"]="updated"
        state["pluginSha"]=sha(plugin)
        save_state(state)
        print("CORE6_PRODUCTION_INSTALLED "+json.dumps(state),flush=True)
    finally:
        try:ftps.quit()
        except Exception:ftps.close()

def rollback():
    if not STATE.exists():
        print("CORE6_NO_DEPLOY_STATE")
        return
    state=json.loads(STATE.read_text())
    if state.get("marker")!="PTSCPS_CORE6_20261117_v1":
        raise RuntimeError("Unrecognized deploy state")
    ftps=connect()
    try:
        target=MU+PLUGIN
        if state.get("plugin")=="updated":
            raw=maybe(ftps,target)
            if raw is None or sha(raw)!=state["pluginSha"]:
                raise RuntimeError("Refusing restore because live plugin changed")
            old=BEFORE.read_bytes()
            stage=target+"."+uuid.uuid4().hex[:10]+".tmp"
            ftps.storbinary("STOR "+stage,io.BytesIO(old))
            if read(ftps,stage)!=old:
                raise RuntimeError("Restore temp checksum mismatch")
            parked=target+"."+uuid.uuid4().hex[:10]+".old"
            ftps.rename(target,parked)
            try:ftps.rename(stage,target)
            except Exception:
                ftps.rename(parked,target)
                raise
            ftps.delete(parked)
            print("CORE6_PRIOR_PLUGIN_RESTORED")
        # Delete plugin FIRST, disabling bundle swapping before asset cleanup.
        for entry in reversed(state.get("created",[])):
            current=maybe(ftps,entry["target"])
            if current is None:
                continue
            if sha(current)!=entry["sha256"]:
                raise RuntimeError("Refuse rollback modified asset: "+entry["target"])
            ftps.delete(entry["target"])
            print("CORE6_ROLLBACK_DELETED "+entry["target"],flush=True)
        print("CORE6_ROLLBACK_SUCCESS",flush=True)
    finally:
        try:ftps.quit()
        except Exception:ftps.close()

if __name__=="__main__":
    import sys
    if len(sys.argv)!=2 or sys.argv[1] not in ("deploy","rollback"):
        raise SystemExit("Usage: deploy | rollback")
    if sys.argv[1]=="deploy":
        deploy()
    else:
        rollback()
