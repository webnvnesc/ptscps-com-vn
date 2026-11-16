#!/usr/bin/env python3
"""Read-only live QA for PTSCPS SR7 FastPath.

Compare two exact API routes with native forced fallback, check strict path
matching, content-type, response markers and anonymous vs cookie handling.
"""
import hashlib,json,statistics,subprocess,time,urllib.error,urllib.request
from pathlib import Path
BASE="https://ptscps.com.vn"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; PTSCPS-SR7-FastPath-QA/1.0)","Accept":"application/json"}
def get(url,extra=None):
 req=urllib.request.Request(url,headers={**HEADERS,**(extra or {})})
 with urllib.request.urlopen(req,timeout=40) as response:
  body=response.read(75000)
  return response.status,dict(response.headers.items()),body,response.url
def parse(raw):
 obj=json.loads(raw)
 assert isinstance(obj,dict) and obj.get("success") is True
 assert isinstance(obj.get("slides"),(list,dict)) and "addOns" in obj
 return obj
for slide in (2,3):
 endpoint=f"{BASE}/wp-json/sliderrevolution/sliders/1"
 fast=endpoint+f"?srengine=7&slideid={slide}"
 origin=fast+"&ptscps_sr7_force_origin=1"
 results={}
 for label,url,opts in [
  ("fastpath",fast,{}),
  ("origin-fallback",origin,{}),
  ("cookie-fallback",fast,{"Cookie":"wordpress_logged_in_fake=somevalue"}),
  ("query-reversed",endpoint+f"?slideid={slide}&srengine=7",{}),
 ]:
  status,heads,body,final=get(url,opts)
  obj=parse(body)
  marker=heads.get("X-PTSCPS-SR7-FastPath") or heads.get("x-ptscps-sr7-fastpath")
  results[label]={"status":status,"bytes":len(body),"sha":hashlib.sha256(body).hexdigest()[:16],
    "marker":marker,"cache":heads.get("Cache-Control") or heads.get("cache-control"),
    "ctype":heads.get("Content-Type") or heads.get("content-type"),"obj":obj}
  assert status==200
  print("FASTPATH_QA "+json.dumps({"slide":slide,"mode":label,**{k:v for k,v in results[label].items() if k!="obj"}}),flush=True)
 assert results["fastpath"]["obj"]==results["origin-fallback"]["obj"],"Payload mismatch from WordPress"
 assert results["query-reversed"]["obj"]==results["origin-fallback"]["obj"],"Reverse query changed payload"
 assert not results["cookie-fallback"]["marker"],"Logged-in-like cookie bypass failed"
 # Positive marker requires mod_headers. If unavailable, checks still verify
 # static filename bytes served from the direct URL and compare response.
 assert results["origin-fallback"]["marker"] is None,"Forced origin request unexpectedly served from FastPath"
 assert results["fastpath"]["marker"]=="static","Exact URL did not use static FastPath"
 static_url=BASE+f"/_ptscps-sr7-fastpath/slide-{slide}.json"
 status,headers,body,_=get(static_url)
 assert parse(body)==results["fastpath"]["obj"],"Direct static payload differs"
 print("FASTPATH_VERIFIED "+json.dumps({"slide":slide,"sameSemantics":True,"staticBytes":len(body)}),flush=True)
# Static baseline compare, warmed connection timing. Not Lighthouse.
fmt="TIMING:%{http_code}|%{num_connects}|%{time_starttransfer}|%{time_total}\n"
for idx in range(1,5):
 urls=[
  BASE+"/wp-json/sliderrevolution/sliders/1?srengine=7&slideid=2&ptscps_sr7_force_origin=1",
  BASE+"/wp-json/sliderrevolution/sliders/1?srengine=7&slideid=2",
  BASE+"/wp-json/sliderrevolution/sliders/1?srengine=7&slideid=3&ptscps_sr7_force_origin=1",
  BASE+"/wp-json/sliderrevolution/sliders/1?srengine=7&slideid=3"
 ]
 if idx%2==0:urls.reverse()
 args=["curl"]
 for i,url in enumerate(urls):
  if i:args+=["--next"]
  args+=["-sS","-L","--http2","--compressed","--max-time","30","-o","/dev/null","-w",fmt,url]
 p=subprocess.run(args,capture_output=True,text=True,timeout=150)
 lines=[l for l in p.stdout.splitlines() if l.startswith("TIMING:")]
 if p.returncode or len(lines)!=4:raise RuntimeError("Curl failed to validate timing")
 for url,line in zip(urls,lines):
  code,conn,ttfb,total=line[7:].split("|")
  print("FASTPATH_TIMING "+json.dumps({"cycle":idx,"slide":2 if "slideid=2" in url else 3,
   "path":"origin" if "force_origin" in url else "static",
   "code":int(code),"newConnection":int(conn),"ttfbMs":round(float(ttfb)*1000,1),
   "totalMs":round(float(total)*1000,1)}),flush=True)
print("FASTPATH_QA_SUCCESS "+json.dumps({"slides":[2,3],"nativeFallbackVerified":True,"rewriteVerified":True}),flush=True)
