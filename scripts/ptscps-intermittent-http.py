#!/usr/bin/env python3
"""PTSCPS intermittent latency investigation, origin HTTP/2 without throttling.

30 alternating cycles of 3 validated real assets and HTML, comparing fresh curl
TLS connections, connection reuse, and concurrent multiplexing. No FTP writes.
Numbers represent a GitHub hosted runner's region, not Vietnam end-user latency.
"""
import html
import json
import os
import re
import statistics
import subprocess
import urllib.parse
import urllib.request
from collections import defaultdict
from html.parser import HTMLParser

BASE="https://ptscps.com.vn"
OUT="ptscps-intermittent-http"
os.makedirs(OUT,exist_ok=True)
class Refs(HTMLParser):
    def __init__(self):super().__init__();self.links=[];self.scripts=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=="link" and "stylesheet" in (d.get("rel") or ""):
            self.links.append({"url":urllib.parse.urljoin(BASE,html.unescape(d.get("href",""))),"id":d.get("id","")})
        if tag=="script" and d.get("src"):
            self.scripts.append({"url":urllib.parse.urljoin(BASE,html.unescape(d.get("src",""))),"id":d.get("id","")})
def select():
    with urllib.request.urlopen(urllib.request.Request(BASE,headers={"User-Agent":"Mozilla/5.0"}),timeout=35) as r:
        body=r.read(1600000).decode("utf-8","replace")
    refs=Refs();refs.feed(body)
    def style(pattern):
        x=next((x for x in refs.links if re.search(pattern,x["url"],re.I)),None)
        if not x:raise ValueError("expected CSS missing: "+pattern)
        return x["url"]
    def script(pattern):
        x=next((x for x in refs.scripts if re.search(pattern,x["url"],re.I)),None)
        if not x:raise ValueError("expected JS missing: "+pattern)
        return x["url"]
    return {
        "html":BASE+"/",
        "tiny-css":style(r"/elementor/assets/css/widget-spacer\.min\.css"),
        "jannah-css":style(r"/jannah/assets/css/style\.min\.css"),
        "jquery-js":script(r"/jquery/jquery\.min\.js")
    }
FIELDS=["http_code","http_version","num_connects","time_namelookup",
    "time_connect","time_appconnect","time_pretransfer","time_starttransfer",
    "time_total","size_download"]
MEASURE="PTSCPS_CURL|%{http_code}|%{http_version}|%{num_connects}|%{time_namelookup}|%{time_connect}|%{time_appconnect}|%{time_pretransfer}|%{time_starttransfer}|%{time_total}|%{size_download}\n"
def call(url,timeout=35):
    cmd=["curl","-sS","-L","--http2","--compressed","--max-time",str(timeout),"--connect-timeout","12","-A","Mozilla/5.0 (compatible; PTSCPS-Intermittent-Curl/1.0)","-o","/dev/null","-w",MEASURE,url]
    p=subprocess.run(cmd,capture_output=True,text=True,timeout=timeout+6)
    if p.returncode:raise RuntimeError("curl error: "+p.stderr.strip()[:180])
    line=next((s for s in p.stdout.splitlines() if s.startswith("PTSCPS_CURL|")),None)
    if line is None:raise RuntimeError("missing metrics")
    v=line.split("|")[1:]
    if len(v)!=len(FIELDS):raise RuntimeError("unexpected count")
    raw=dict(zip(FIELDS,v))
    row={"status":int(raw["http_code"]),"protocol":raw["http_version"],"connections":int(raw["num_connects"])}
    for key in FIELDS[3:-1]:
        row[key.replace("time_","")+"Ms"]=round(float(raw[key])*1000,1)
    row["bodyMs"]=round(row["totalMs"]-row["starttransferMs"],1)
    row["postConnectionMs"]=round(row["starttransferMs"]-row["pretransferMs"],1)
    row["bytes"]=int(float(raw["size_download"]))
    return row
def median(items):
    x=[v for v in items if isinstance(v,(int,float))]
    return round(statistics.median(x),1) if x else None
def p90(items):
    x=sorted(v for v in items if isinstance(v,(int,float)))
    return x[min(len(x)-1,int(.9*len(x)))] if x else None
def main():
    urls=select()
    print("ASSETS "+json.dumps(urls),flush=True)
    results=[]
    # Native repeated request; each invocation a new DNS/TCP/TLS connection.
    for cycle in range(1,21):
        names=list(urls)
        if cycle%2==0:names.reverse()
        for name in names:
            try:
                row={"cycle":cycle,"asset":name,"mode":"fresh",**call(urls[name])}
            except Exception as e:
                row={"cycle":cycle,"asset":name,"mode":"fresh","error":str(e)[:180]}
            results.append(row)
            print("CURL_ROW "+json.dumps(row),flush=True)
    # Compare concurrent individual connections for short bursts (onset of resource contention).
    # 4 requests per wave; bounded concurrency avoids incidental load testing.
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=4) as pool:
        for cycle in range(1,6):
            futs={name:pool.submit(call,url) for name,url in urls.items()}
            for name,f in futs.items():
                try:row={"cycle":cycle,"asset":name,"mode":"concurrent",**f.result()}
                except Exception as e:row={"cycle":cycle,"asset":name,"mode":"concurrent","error":str(e)[:180]}
                results.append(row)
                print("CURL_ROW "+json.dumps(row),flush=True)
    groups=defaultdict(list)
    for row in results:
        groups[(row["asset"],row["mode"])].append(row)
    for (asset,mode),items in sorted(groups.items()):
        valid=[r for r in items if r.get("status")==200]
        summary={"asset":asset,"mode":mode,"count":len(items),"valid":len(valid),
          "medianTTFB":median([r["starttransferMs"] for r in valid]),
          "p90TTFB":p90([r["starttransferMs"] for r in valid]),
          "maxTTFB":max([r["starttransferMs"] for r in valid],default=None),
          "medianPostConnection":median([r["postConnectionMs"] for r in valid]),
          "p90PostConnection":p90([r["postConnectionMs"] for r in valid]),
          "medianBody":median([r["bodyMs"] for r in valid]),
          "p90Body":p90([r["bodyMs"] for r in valid]),
          "medianTLS":median([r["appconnectMs"] for r in valid]),
          "medianBytes":median([r["bytes"] for r in valid]),
          "failures":[r.get("error") for r in items if r.get("error")]}
        print("CURL_SUMMARY "+json.dumps(summary),flush=True)
    with open(OUT+"/results.json","w")as f:
        json.dump({"urls":urls,"results":results},f,indent=2)
if __name__=="__main__":main()
