#!/usr/bin/env python3
"""Read-only curl transport inspection of PTSCPS HTML/CSS. No credentials requested."""
import html
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from html.parser import HTMLParser

SITE="https://ptscps.com.vn/"
ASSET=SITE+"wp-content/themes/jannah-child/ptscps-css-bundle-audit-20261116.css"
CSS_HANDLES=["tie-css-base-css","tie-css-styles-css","tie-css-widgets-css","tie-css-helpers-css","tie-fontawesome5-css","tie-css-ilightbox-css"]
OUT="transport-results"
os.makedirs(OUT,exist_ok=True)

class CSSLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.styles=[]
    def handle_starttag(self, tag, attributes):
        if tag!="link": return
        data=dict(attributes)
        if "stylesheet" not in (data.get("rel") or ""):return
        self.styles.append({"id":data.get("id",""),"url":urllib.parse.urljoin(SITE,html.unescape(data.get("href","")))})
def shell_probe(url,mode="compressed",http_protocol="2",attempt=1):
    args=["curl","--silent","--show-error","--location","--connect-timeout","12","--max-time","45",
          "--dump-header","-","--output","/dev/null","--user-agent","PTSCPS-FCP-Audit/1.0",
          "--write-out", "\n__CURL_METRICS__%{http_version}|%{http_code}|%{size_download}|%{time_namelookup}|%{time_connect}|%{time_appconnect}|%{time_starttransfer}|%{time_total}|%{num_redirects}|%{url_effective}\n"]
    args.append("--http2" if http_protocol=="2" else "--http1.1")
    if mode=="compressed":args.append("--compressed")
    elif mode=="identity":args+=["--header","Accept-Encoding: identity"]
    args.append(url)
    done=subprocess.run(args,capture_output=True,text=True,timeout=55,check=False)
    if done.returncode:
        return {"url":url,"mode":mode,"protocol":http_protocol,"attempt":attempt,
                "error":done.stderr.strip()[:300],"exit":done.returncode}
    block=done.stdout
    match=re.search(r"__CURL_METRICS__(.+)",block)
    if not match:return {"url":url,"error":"curl output without metrics"}
    x=match.group(1).strip().split("|")
    # Remove interim 1xx proxy responses / redirects; inspect last response header block.
    raw=block[:match.start()].replace("\r\n","\n")
    chunks=re.split(r"(?=^HTTP/\S+\s+\d{3})",raw,flags=re.M)
    h=[c for c in chunks if re.match(r"HTTP/\S+\s+\d{3}",c)]
    latest=h[-1] if h else ""
    headers={}
    for line in latest.splitlines()[1:]:
        if ":" in line:
            k,v=line.split(":",1);headers[k.strip().lower()]=v.strip()
    expose=["content-encoding","content-length","transfer-encoding","content-type","cache-control","etag","expires",
            "last-modified","vary","age","x-cache","x-cache-status","cf-cache-status","server","alt-svc",
            "content-security-policy","x-powered-by"]
    return {"url":url.replace(SITE,"/"),"mode":mode,"protocol":http_protocol,"attempt":attempt,
        "httpVersion":x[0],"status":int(x[1]),"bytesTransferred":int(float(x[2])),
        "dnsMs":round(float(x[3])*1000),"tcpMs":round(float(x[4])*1000),"tlsMs":round(float(x[5])*1000),
        "ttfbMs":round(float(x[6])*1000),"totalMs":round(float(x[7])*1000),
        "redirects":int(x[8]),"headers":{k:headers[k] for k in expose if k in headers}}
def main():
    print("CURL_VERSION",subprocess.check_output(["curl","--version"],text=True).splitlines()[0])
    with urllib.request.urlopen(urllib.request.Request(SITE,headers={"User-Agent":"PTSCPS-FCP-Audit/1.0"}),timeout=30) as response:
        doc=response.read(1500000).decode("utf-8","replace")
    p=CSSLinks();p.feed(doc)
    pairs=[next((x for x in p.styles if x["id"]==name),None)for name in CSS_HANDLES]
    if any(x is None for x in pairs):raise RuntimeError("Expected homepage CSS handles changed")
    selected=[("HTML",SITE)]+[(x["id"],x["url"]) for x in pairs]+[("Hosted bundle",ASSET)]
    extra=next((s for s in p.styles if "elementor/assets/css/frontend" in s["url"]),None)
    if extra:selected.append(("Elementor frontend",extra["url"]))
    extra=next((s for s in p.styles if "/sr7.css" in s["url"]),None)
    if extra:selected.append(("Slider Revolution",extra["url"]))
    extra=next((s for s in p.styles if "jannah-child/style.css" in s["url"]),None)
    if extra:selected.append(("Child theme",extra["url"]))
    output=[]
    for label,url in selected:
        for i in (1,2):
            row=shell_probe(url,"compressed","2",i)
            row["label"]=label;output.append(row)
            print("TRANSPORT",json.dumps(row,ensure_ascii=False))
        if label in ["HTML","Hosted bundle","tie-css-base-css","tie-css-styles-css"]:
            row=shell_probe(url,"identity","2",1)
            row["label"]=label;output.append(row)
            print("TRANSPORT",json.dumps(row,ensure_ascii=False))
    for label,url in [selected[0],selected[1],("Hosted bundle",ASSET)]:
        row=shell_probe(url,"compressed","1.1",1)
        row["label"]=label;output.append(row)
        print("TRANSPORT",json.dumps(row,ensure_ascii=False))
    with open(OUT+"/transport.json","w")as f:json.dump(output,f,indent=2,ensure_ascii=False)
    by_name={}
    for row in output:
        if row.get("mode")!="compressed" or row.get("protocol")!="2" or row.get("status")!=200:continue
        by_name.setdefault(row["label"],[]).append(row)
    for label,items in by_name.items():
        print("SUMMARY",json.dumps({"label":label,"encoding":[x["headers"].get("content-encoding","none")for x in items],
             "transferred":[x["bytesTransferred"]for x in items],
             "ttfbMs":[x["ttfbMs"]for x in items],
             "totalMs":[x["totalMs"]for x in items],
             "HTTP":[x["httpVersion"]for x in items],
             "cache":[x["headers"].get("cache-control","")for x in items],
             "altSvc":[x["headers"].get("alt-svc","")for x in items]},ensure_ascii=False))
if __name__=="__main__":main()
