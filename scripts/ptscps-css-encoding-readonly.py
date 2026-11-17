#!/usr/bin/env python3
"""Read-only live HTTP transfer encoding probe: compares identity, gzip and br.
No changes to WordPress, hosting, caches, builder data or GitHub secrets.
"""
import gzip, json, re, time, urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin
from pathlib import Path

ROOT="https://ptscps.com.vn/"
OUT=Path("ptscps-css-encoding-audit.json")
IDS={"ptscps-jannah-core6-css","ptscps-elementor-home-widgets-css",
     "elementor-icons-css","elementor-frontend-css"}
class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.matches={}
    def handle_starttag(self,tag,attrs):
        if tag!="link":return
        d=dict(attrs)
        key=d.get("id","")
        if key in IDS and "stylesheet" in (d.get("rel") or ""):
            self.matches[key]=urljoin(ROOT,d.get("href",""))
def fetch(url,encoding="identity",tries=3):
    last=None
    for attempt in range(tries):
        try:
            req=urllib.request.Request(url,headers={
                "User-Agent":"PTSCPS-CSS-Encoding-Check/1.0",
                "Accept-Encoding":encoding,"Accept":"text/css,text/html,*/*"
            })
            with urllib.request.urlopen(req,timeout=45) as resp:
                body=resp.read(1800000)
                if resp.status!=200:raise RuntimeError("HTTP "+str(resp.status))
                hdr={x.lower():v for x,v in resp.headers.items()}
                return {"url":url,"code":resp.status,"bytes":len(body),"body":body,
                  "encoding":hdr.get("content-encoding","identity"),
                  "contentType":hdr.get("content-type",""),
                  "contentLength":hdr.get("content-length"),
                  "vary":hdr.get("vary"),"cacheControl":hdr.get("cache-control"),
                  "server":hdr.get("server")}
        except Exception as e:
            last=e
            time.sleep(attempt+1)
    raise last
def view(row):
    return {k:v for k,v in row.items() if k!="body"}
html=fetch(ROOT)
links=Links()
links.feed(html["body"].decode("utf-8","replace"))
if len(links.matches)!=4:
    raise RuntimeError("Expected four current CSS link ids in homepage, got "+repr(links.matches))
results=[]
for key,url in links.matches.items():
    plain=fetch(url,"identity")
    if plain["encoding"] not in ("identity",""):
        raise RuntimeError("Identity response not identity for "+key)
    samples=[]
    for preference in ("gzip","br, gzip"):
        row=fetch(url,preference)
        decodedOK=None
        if row["encoding"]=="gzip":
            decodedOK=gzip.decompress(row["body"])==plain["body"]
        samples.append({**view(row),"requestAcceptEncoding":preference,
          "verifiedDecodedMatchesOriginal":decodedOK,
          "wireSavedPct":round(100*(1-row["bytes"]/plain["bytes"]),1)})
        print("CSS_ENCODING_PROBE "+json.dumps({
            "key":key,"idBytes":plain["bytes"],**samples[-1]
        },ensure_ascii=False),flush=True)
    results.append({"id":key,"url":url,"identity":view(plain),"samples":samples})
result={"homepage":ROOT,"css":results,
 "compressionConfigured":all(any(x["encoding"] in ("br","gzip") for x in r["samples"]) for r in results)}
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2))
print("CSS_ENCODING_SUMMARY "+json.dumps({
 "compressionConfigured":result["compressionConfigured"],
 "entries":[{"id":r["id"],"identity":r["identity"]["bytes"],
   "acceptGzip":r["samples"][0]["encoding"],
   "acceptBr":r["samples"][1]["encoding"],
   "gzipTransfer":r["samples"][0]["bytes"],
   "brTransfer":r["samples"][1]["bytes"]
  } for r in results]
},ensure_ascii=False),flush=True)
