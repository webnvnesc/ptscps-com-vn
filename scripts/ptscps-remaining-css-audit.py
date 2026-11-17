#!/usr/bin/env python3
"""Read-only production audit of remaining linked CSS after Jannah core6 bundle.
No WordPress or hosting mutation. Includes precise head order, inline barriers,
cross-template usage, CSS body sizes, imports, url() and font-face checks.
"""
import collections
import gzip
import html as unescape
import json
import os
import re
import statistics
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

BASE="https://ptscps.com.vn"
PAGES={
 "home":"/",
 "contact":"/lien-he",
 "services":"/dich-vu",
 "service_detail":"/dich-vu/van-hanh-va-bao-duong-fpso-fso-mopu",
 "intro":"/thu-ngo.htm",
 "news":"/tin-tuc",
 "news_detail":"/cong-ty-pps-hanh-trinh-tri-an-nam-2026-tai-tp-ho-chi-minh.htm",
 "english":"/e",
}
OUT=Path("remaining-css-audit-results")
OUT.mkdir(exist_ok=True)
UA="PTSCPS-ReadOnly-CSS-Inventory/1.0 (+CSS merge decision)"
def get(url,maxbytes=2800000):
 req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"text/css,text/html,*/*"})
 with urllib.request.urlopen(req,timeout=42) as r:
  data=r.read(maxbytes+1)
  if len(data)>maxbytes:raise RuntimeError("Excessive file size "+url)
  return {"body":data,"mime":r.headers.get("content-type"),"status":r.status}
class Tag(HTMLParser):
 def __init__(self):super().__init__();self.attrs=[]
 def handle_starttag(self,tag,attrs):self.attrs=dict(attrs)
def attrs(match):
 p=Tag()
 try:p.feed(match)
 except Exception:return {}
 return p.attrs
def family(url):
 u=urllib.parse.urlsplit(url).path
 if "/wp-content/themes/jannah-child/" in u:return "Jannah Child"
 if "/wp-content/themes/jannah/" in u:return "Jannah parent"
 if "/wp-content/plugins/elementor-pro/" in u:return "Elementor Pro"
 if "/wp-content/plugins/elementor/" in u:return "Elementor"
 if "/wp-content/plugins/revslider/" in u:return "Slider Revolution"
 if "/wp-content/cache/asp/" in u:return "Ajax Search"
 if "/wp-content/plugins/" in u:return "Other plugin"
 if "/wp-includes/" in u:return "WordPress core"
 return "Other/third-party"
def head_elements(body):
 text=body.decode("utf-8","replace")
 m=re.search(r"<head\b[^>]*>([\s\S]*?)</head\s*>",text,re.I)
 if not m:raise RuntimeError("Head not found")
 head=m.group(1)
 entries=[]
 for m in re.finditer(r"<(?:link|style|script)\b[^>]*>",head,re.I):
  tag=m.group(0);kind=re.match(r"<(\w+)",tag).group(1).lower()
  a=attrs(tag)
  isstylesheet=kind=="link" and "stylesheet" in (a.get("rel") or "").lower().split()
  # Preserve link as barrier when not stylesheet, for risk classification.
  if kind=="link" and not isstylesheet:continue
  u=urllib.parse.urljoin(BASE+"/",unescape.unescape(a.get("href","")))
  entries.append({"index":len(entries),"kind":"css" if isstylesheet else kind,
   "id":a.get("id",""),"url":u if isstylesheet else None,
   "media":a.get("media","all") if isstylesheet else None,
   "at":m.start(),"end":m.end(),"tag":tag[:240]})
 return text,entries
def candidates(entries):
 groups=[];curr=[]
 for row in entries:
  if row["kind"]=="css" and (not curr or (
      row["media"].strip().lower() in ("all","") and
      curr[0]["media"].strip().lower() in ("all","")
    )):
   curr.append(row)
  else:
   if len(curr)>1:groups.append(curr)
   curr=[row] if row["kind"]=="css" else []
 if len(curr)>1:groups.append(curr)
 return groups

summary={"pages":[],"css":{},"groups":[]}
pages={}
for k,p in PAGES.items():
 try:
  r=get(BASE+p,950000)
  text,tags=head_elements(r["body"])
  sheets=[x for x in tags if x["kind"]=="css"]
  pages[k]={"path":p,"status":r["status"],"styles":sheets,"headEvents":tags}
  groups=candidates(tags)
  for x in sheets:
   item=summary["css"].setdefault(x["url"],{"url":x["url"],"family":family(x["url"]),"usedBy":[],"ids":[],"media":[]})
   item["usedBy"].append(k);item["ids"].append(x["id"]);item["media"].append(x["media"])
  summary["pages"].append({"name":k,"path":p,"http":r["status"],"styles":len(sheets),
    "core6":sum("ptscps-jannah-core6" in x["url"] for x in sheets),
    "barriers":sum(x["kind"] in ("style","script") for x in tags),
    "runs":[{"n":len(g),"ids":[x["id"] for x in g],"families":[x and family(x["url"]) for x in g]} for g in groups]})
  print("CSS_PAGE "+json.dumps({"name":k,"styles":len(sheets),"core6":sum("ptscps-jannah-core6" in x["url"] for x in sheets),
    "heads":[{"id":x["id"],"media":x["media"],"url":urllib.parse.urlsplit(x["url"]).path,
              "family":family(x["url"])} for x in sheets],
    "groups":[{"n":len(g),"ids":[x["id"] for x in g]} for g in groups]},ensure_ascii=False),flush=True)
 except Exception as e:
  summary["pages"].append({"name":k,"path":p,"error":str(e)[:300]})
  print("CSS_PAGE_ERROR "+json.dumps({"name":k,"error":str(e)}),flush=True)
if "home" not in pages:raise RuntimeError("Could not read homepage")
if not any("ptscps-jannah-core6" in x["url"] for x in pages["home"]["styles"]):
 raise RuntimeError("Production core6 not active; source inventory stale")

for item in summary["css"].values():
 url=item["url"]
 if urllib.parse.urlsplit(url).netloc not in ("ptscps.com.vn","www.ptscps.com.vn"):
  item["fetchError"]="External resource; not downloaded"
  continue
 try:
  raw=get(url,1900000)["body"]
  text=raw.decode("utf-8","replace")
  item.update({"bytes":len(raw),"gzip":len(gzip.compress(raw,compresslevel=6)),
    "import":bool(re.search(r"@import\s",text,re.I)),
    "fontFaces":len(re.findall(r"@font-face\b",text,re.I)),
    "urls":len(re.findall(r"url\s*\(",text,re.I)),
    "mediaRules":len(re.findall(r"@media\b",text,re.I)),
    "relativeUrls":len([x for x in re.findall(r"url\s*\(\s*[\"']?([^\"')]+)",text,re.I)
                          if x.strip() and not re.match(r"(?i)^(?:data:|https?:|//|#|blob:)",x.strip())]),
    "hasImportant":bool(re.search(r"!important",text,re.I)),
   })
 except Exception as e:item["fetchError"]=str(e)[:300]
home=pages["home"]
print("CSS_HOME_ORDER "+json.dumps([{
 "i":x["index"],"kind":x["kind"],"id":x["id"],"media":x["media"],
 "url":(x["url"] or "").replace(BASE,""),
 "family":family(x["url"]) if x["kind"]=="css" else None,
 "gzip":summary["css"].get(x["url"],{}).get("gzip") if x["kind"]=="css" else None,
 } for x in home["headEvents"]],ensure_ascii=False),flush=True)
byids=collections.defaultdict(dict)
for page,r in pages.items():
 for group in candidates(r["headEvents"]):
  key=tuple(x["id"] for x in group)
  info=byids[key]
  info["n"]=len(group);info["ids"]=list(key)
  info["families"]=[family(x["url"]) for x in group]
  info.setdefault("usedBy",[]).append(page)
  info["bytes"]=sum(summary["css"].get(x["url"],{}).get("bytes",0) for x in group)
  info["gzipIndividual"]=sum(summary["css"].get(x["url"],{}).get("gzip",0) for x in group)
  info["hasImport"]=any(summary["css"].get(x["url"],{}).get("import",False) for x in group)
  info["hasFetchError"]=any("fetchError" in summary["css"].get(x["url"],{}) for x in group)
  info["urls"]=[x["url"] for x in group]
summary["groups"]=sorted(byids.values(),key=lambda x:(-len(x["usedBy"]),-x["n"]))
print("CSS_MERGE_CANDIDATES "+json.dumps(summary["groups"][:35],ensure_ascii=False),flush=True)
summary["homeOrder"]=[{
 "i":x["index"],"kind":x["kind"],"id":x["id"],"media":x["media"],
 "url":x["url"],"family":family(x["url"]) if x["kind"]=="css" else None,
 "gzip":summary["css"].get(x["url"],{}).get("gzip") if x["kind"]=="css" else None
 } for x in home["headEvents"]]
summary["counts"]={"uniqueCSS":len(summary["css"]),"home":len(home["styles"]),
 "homepageCssBytes":sum(summary["css"].get(x["url"],{}).get("bytes",0) for x in home["styles"]),
 "homepageGzipEstimate":sum(summary["css"].get(x["url"],{}).get("gzip",0) for x in home["styles"]),
 "errors":sum("fetchError" in item for item in summary["css"].values())}
(OUT/"summary.json").write_text(json.dumps(summary,indent=2,ensure_ascii=False))
print("CSS_AUDIT_SUMMARY "+json.dumps({"counts":summary["counts"],"pages":summary["pages"]},ensure_ascii=False)[:19000],flush=True)
