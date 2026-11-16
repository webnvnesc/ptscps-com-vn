#!/usr/bin/env python3
"""Verify production SR7 selective plugin loader after retiring static FastPath."""
import urllib.request,urllib.error,json,hashlib,statistics,subprocess
ROOT="https://ptscps.com.vn"
PATH="/wp-json/sliderrevolution/sliders/1?srengine=7&slideid="
headers={"Accept":"application/json","User-Agent":"Mozilla/5.0 (compatible; PTSCPS-SR7-Slim-ProductionQA)"}
def request(url, extra={}):
 req=urllib.request.Request(url,headers={**headers,**extra})
 with urllib.request.urlopen(req,timeout=40) as r:
  return r.status,dict(r.headers.items()),r.read(15000)
for slide in (2,3):
 url=ROOT+PATH+str(slide)
 results={}
 for mode,extra in (("slim",{}),("full-control",{"Cookie":"wordpress_logged_in_fake=1"}),
                    ("extra-query",{})):
  actual=url+("&ptscps_sr7_extra_query=1" if mode=="extra-query" else "")
  status,h,b=request(actual,extra)
  j=json.loads(b)
  assert status==200 and j.get("success") is True and "slides" in j and "addOns" in j
  marker=h.get("X-PTSCPS-SR7-Plugin-Profile") or h.get("x-ptscps-sr7-plugin-profile")
  static=h.get("X-PTSCPS-SR7-FastPath") or h.get("x-ptscps-sr7-fastpath")
  results[mode]=(j,marker,static)
  print("SLIM_LIVE_CASE "+json.dumps({"slide":slide,"mode":mode,"code":status,
   "bytes":len(b),"sha":hashlib.sha256(b).hexdigest()[:16],
   "slimMarker":marker,"staticMarker":static}),flush=True)
 assert results["slim"][1]=="slim" and results["slim"][2] is None
 assert results["full-control"][1] is None and results["full-control"][2] is None
 assert results["slim"][0]==results["full-control"][0]==results["extra-query"][0],"Payload changed"
 print("SLIM_LIVE_EQUIVALENT "+str(slide),flush=True)
# Other WordPress endpoints and homepage remain accessible and untouched.
for url in [ROOT+"/",ROOT+"/wp-json/wp/v2/types/post"]:
 s,h,b=request(url)
 assert s==200 and b and not h.get("X-PTSCPS-SR7-Plugin-Profile")
 print("SLIM_LIVE_UNAFFECTED "+json.dumps({"url":url,"http":s,"bytes":len(b)}),flush=True)
# Compare repeated connections on exact public API versus full-plugin control.
fmt="PTSCPS_SLIM:%{http_code}|%{num_connects}|%{time_pretransfer}|%{time_starttransfer}|%{time_total}\n"
observed={"slim":[],"full":[]}
for n in range(1,6):
 urls=[]
 for slide in (2,3):
  for mode in (["slim","full"] if n%2 else ["full","slim"]):
   url=ROOT+PATH+str(slide)
   urls.append((mode,url))
 args=["curl"]
 for i,(mode,url) in enumerate(urls):
  if i:args+=["--next"]
  args+=["-sS","--http2","--compressed","--connect-timeout","12",
         "--max-time","30","-o","/dev/null","-w",fmt]
  if mode=="full":args+=["-H","Cookie: wordpress_logged_in_fake=1"]
  args.append(url)
 proc=subprocess.run(args,capture_output=True,text=True,timeout=145)
 lines=[l for l in proc.stdout.splitlines() if l.startswith("PTSCPS_SLIM:")]
 if proc.returncode or len(lines)!=len(urls):
  raise RuntimeError("Timing test error: "+proc.stderr[-250:])
 for (mode,url),line in zip(urls,lines):
  code,conn,ready,first,total=line[len("PTSCPS_SLIM:"):].split("|")
  assert code=="200"
  ms=round(1000*(float(first)-float(ready)),1)
  observed[mode].append(ms)
  print("SLIM_LIVE_TIMING "+json.dumps({"cycle":n,"mode":mode,"slide":2 if "slideid=2" in url else 3,
   "newConnections":int(conn),"responseWaitMs":ms}),flush=True)
for mode,times in observed.items():
 print("SLIM_LIVE_SUMMARY "+json.dumps({"mode":mode,"medianResponseWaitMs":round(statistics.median(times),1),
  "maxResponseWaitMs":max(times),"samples":len(times)}),flush=True)
print("SLIM_LIVE_PASS all plugin filtering routes, other routes and equivalence verified",flush=True)
