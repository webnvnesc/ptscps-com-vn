#!/usr/bin/env python3
"""Read-only PTSCPS FTPS audit of asset enqueue call sites (never read uploads/config)."""
import os, sys, re, json, ftplib, posixpath, collections, hashlib
from urllib.parse import urlsplit

root = "/domains/ptscps.com.vn/public_html"
host_value = os.environ["FTP_SERVER"]
hostinfo = urlsplit(host_value if "://" in host_value else "//" + host_value)
ftp = ftplib.FTP_TLS(timeout=25)
ftp.connect(hostinfo.hostname, hostinfo.port or 21, timeout=25)
ftp.auth()
ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
ftp.prot_p()
ftp.set_pasv(True)

ignore_dirs={"uploads","node_modules","vendor","tests","test","assets","languages","cache","storage","backups","build","dist","logs","data"}
def safe(rel):
    if rel.startswith("/") or ".." in rel.split("/"): return False
    parts=rel.split("/")
    if any(p in ignore_dirs for p in parts): return False
    if any(p.startswith(".") for p in parts): return False
    if any(p in ("wp-config.php","config.php",".htaccess",".env","debug.log") for p in parts): return False
    return rel.endswith(".php") or rel.endswith(".css") or "." not in parts[-1]

def ls(rel):
    if not safe(rel): return []
    try:
        return sorted([(n,meta.get("type","file"),int(meta.get("size",0) or 0)) for n,meta in ftp.mlsd(root+"/"+rel) if n not in (".","..")])
    except Exception as exc:
        print("LIST_FAIL",rel,type(exc).__name__,flush=True)
        return []

def read(rel,maxbytes=600000):
    if not safe(rel) or not (rel.endswith(".php") or rel.endswith(".css")):
        return None
    b=bytearray()
    def add(chunk):
        if len(b)+len(chunk)>maxbytes: raise ValueError("file too large")
        b.extend(chunk)
    try:
        ftp.retrbinary("RETR "+root+"/"+rel,add)
        return b.decode("utf8","replace")
    except Exception:
        return None

def truncate(s,n=300):
    return s.replace("\t"," ").strip()[:n]

def report(rel):
    txt=read(rel)
    if not txt: return
    matches=[]
    # Capture only related PHP code statements, not whole file or inline user content.
    pat=re.compile(r'\b(?:wp_enqueue_(?:style|script)|wp_register_(?:style|script)|wp_dequeue_(?:style|script)|wp_deregister_(?:style|script)|wp_add_inline_(?:style|script)|wp_script_add_data|wp_style_add_data|add_action|add_filter)\b|[\'"](?:wp_enqueue_scripts|admin_enqueue_scripts|elementor/frontend/after_enqueue_styles|elementor/editor/after_enqueue_styles|wp_head|wp_footer|script_loader_tag|style_loader_tag|style_loader_src|script_loader_src)[\'"]|(?:get_template_directory_uri|get_stylesheet_directory_uri)|(?:tie|jannah).*?asset|(?:css|js).*?(?:minif|combined|bundle|merge|concat)',re.I)
    lines=txt.splitlines()
    for i,line in enumerate(lines):
        if not pat.search(line): continue
        # Avoid dynamic PHP variables/environment variables. Only record up to 1-3 lines of core callback,
        # and only when no sensitive variable names appear.
        excerpt=" ".join(lines[i:min(i+3,len(lines))]).strip()
        if re.search(r'(password|secret|token|api.?key|private.?key|authorization|DB_NAME|DB_USER|DB_PASSWORD)',excerpt,re.I):continue
        matches.append({"line":i+1,"code":truncate(excerpt,350)})
    if not matches:return
    print("MATCHES",json.dumps({"path":rel,"size":len(txt.encode()),"total":len(matches),"snippets":matches[:45]},ensure_ascii=False),flush=True)

def walk(base,depth,maxdepth):
    result=[]
    q=[(base,0)]
    while q:
        p,d=q.pop(0)
        records=ls(p)
        if d<2:
            print("DIR",p,json.dumps([{"n":n,"type":t} for n,t,s in records[:65]],ensure_ascii=False),flush=True)
        for n,t,s in records:
            if not n or n.startswith("."):continue
            rel=p+"/"+n
            if t=="dir" and d<maxdepth and n not in ignore_dirs:
                q.append((rel,d+1))
            elif t=="file" and n.endswith(".php") and s<600000:
                result.append({"path":rel,"size":s})
        if len(result)>850 or len(q)>220: break
    return result

try:
    for rel in ("wp-content/themes/jannah-child/functions.php","wp-content/themes/jannah-child/style.css",
                "wp-content/themes/jannah/functions.php","wp-content/themes/jannah/header.php",
                "wp-content/plugins/elementor/elementor.php","wp-content/plugins/elementor/includes/frontend.php",
                "wp-content/plugins/elementor-pro/elementor-pro.php",
                "wp-content/plugins/revslider/revslider.php"):
        report(rel)
    bases=[
       ("wp-content/themes/jannah/framework",2),
       ("wp-content/themes/jannah/inc",2),
       ("wp-content/plugins/elementor/includes",1),
       ("wp-content/plugins/elementor/core",1),
       ("wp-content/plugins/elementor-pro/includes",1),
    ]
    candidates=[]
    for base,depth in bases:
        files=walk(base,0,depth)
        picks=[]
        for f in files:
            path=f["path"]
            basename=posixpath.basename(path)
            if re.search(r'(enqueue|asset|styles?|scripts?|frontend|theme|loader|functions|optimization|performance|css|js|fonts)',basename,re.I):
                picks.append(f)
        print("CANDIDATE_PATHS",base,json.dumps(picks[:95],ensure_ascii=False),flush=True)
        candidates.extend(picks[:40 if "jannah" in base else 12])
    seen=set()
    for f in candidates[:115]:
        rel=f["path"]
        if rel not in seen:
            seen.add(rel)
            report(rel)
    print("AUDIT_DONE",json.dumps({"files_inspected":len(seen)+8,"roots":["jannah","jannah-child","elementor","elementor-pro","revslider"],"uploads_skipped":True},ensure_ascii=False))
finally:
    try: ftp.quit()
    except Exception: ftp.close()
