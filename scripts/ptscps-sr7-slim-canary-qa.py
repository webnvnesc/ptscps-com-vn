#!/usr/bin/env python3
"""Anonymous native versus slim plugin SR7 REST canary test (read only)."""
import urllib.request,urllib.error,hashlib,json,statistics,subprocess
BASE="https://ptscps.com.vn/wp-json/sliderrevolution/sliders/1?srengine=7&slideid="
def get(id,mode):
 u=BASE+str(id)+"&ptscps_sr7_force_origin=1"
 if mode=="slim":u+="&ptscps_sr7_slim_probe=1"
 headers={"Accept":"application/json","User-Agent":"Mozilla/5.0 (compatible; PTSCPS-SR7-Slim-Canary/1.0)"}
 if mode=="authguard":headers["Cookie"]="wordpress_logged_in_fake=1"
 with urllib.request.urlopen(urllib.request.Request(u,headers=headers),timeout=40) as r:
  body=r.read(25000);hdr=dict(r.headers.items())
  assert r.status==200
  x=json.loads(body);assert x.get("success") is True and "slides" in x and "addOns" in x
  return {"body":x,"bytes":len(body),"sha":hashlib.sha256(body).hexdigest()[:16],
   "marker":hdr.get("X-PTSCPS-SR7-Plugin-Profile")}
for id in (2,3):
 native=get(id,"native");slim=get(id,"slim");guard=get(id,"authguard")
 same=native["body"]==slim["body"]
 assert slim["marker"]=="slim","canary filter did not fire"
 assert native["marker"] is None and guard["marker"] is None,"canary ran outside opt-in"
 assert same,"Slim profile changed slide JSON"
 print("SLIM_CANARY_OK "+json.dumps({"slide":id,"identical":same,
   "nativeBytes":native["bytes"],"slimBytes":slim["bytes"],
   "nativeSha":native["sha"],"slimSha":slim["sha"],"authExcluded":True}),flush=True)
# Connection-resident interleaved controls. Source uses --next but libcurl can
# reuse the multiplexed HTTP/2 connection to same host inside one invocation.
fmt="SR7TIMING:%{http_code}|%{num_connects}|%{time_pretransfer}|%{time_starttransfer}|%{time_total}\n"
values={"native":[],"slim":[]}
for n in range(1,9):
 urls=[]
 for slide in ((2,3) if n%2 else (3,2)):
  order=["slim","native"] if n%2 else ["native","slim"]
  for mode in order:
   url=BASE+str(slide)+"&ptscps_sr7_force_origin=1"
   if mode=="slim":url+="&ptscps_sr7_slim_probe=1"
   urls.append((mode,url))
 args=["curl"]
 for i,(mode,url) in enumerate(urls):
  if i:args+=["--next"]
  args+=["-sS","--http2","--compressed","--connect-timeout","15",
         "--max-time","35","-o","/dev/null","-w",fmt,url]
 proc=subprocess.run(args,capture_output=True,text=True,timeout=155)
 lines=[x for x in proc.stdout.splitlines() if x.startswith("SR7TIMING:")]
 if proc.returncode or len(lines)!=len(urls):
  raise RuntimeError("timing fetch failed: "+proc.stderr[:300])
 for (mode,url),line in zip(urls,lines):
  code,conns,ready,first,total=line[10:].split("|")
  assert code=="200"
  v={"cycle":n,"mode":mode,"slide":2 if "slideid=2" in url else 3,
   "newConnect":int(conns),"responseWaitMs":round((float(first)-float(ready))*1000,1),
   "totalMs":round(float(total)*1000,1)}
  values[mode].append(v)
  print("SLIM_CANARY_TIMING "+json.dumps(v),flush=True)
for mode,rows in values.items():
 p=[r["responseWaitMs"] for r in rows]
 print("SLIM_CANARY_SUMMARY "+json.dumps({"profile":mode,"n":len(rows),
  "medianResponseWaitMs":round(statistics.median(p),1),
  "maxResponseWaitMs":max(p),"newConnections":sum(r["newConnect"] for r in rows)}),flush=True)
print("SLIM_CANARY_PASS 2/2 slide payloads unchanged; only explicit anonymous probe enabled.",flush=True)
