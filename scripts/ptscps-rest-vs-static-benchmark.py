#!/usr/bin/env python3
"""Read-only SR7 vs core REST vs static latency on a *reused* HTTPS connection.
No WordPress modifications. Curl --next uses one process-wide connection cache.
"""
import json,subprocess,statistics,time,random
BASE="https://ptscps.com.vn"
URLS={
 "static-logo":BASE+"/wp-content/uploads/2024/08/logo-2024-300x100.jpg",
 "core-rest":BASE+"/wp-json/wp/v2/types/post",
 "slider-2":BASE+"/wp-json/sliderrevolution/sliders/1?srengine=7&slideid=2",
 "slider-3":BASE+"/wp-json/sliderrevolution/sliders/1?srengine=7&slideid=3",
}
FMT="PTSCPS_TIMING:%{http_code}|%{http_version}|%{num_connects}|%{time_namelookup}|%{time_connect}|%{time_appconnect}|%{time_pretransfer}|%{time_starttransfer}|%{time_total}|%{size_download}\n"
def roundms(v):return round(float(v)*1000,1)
def summarize(rows):
 d={}
 for row in rows:
  d.setdefault(row["name"],[]).append(row)
 for name,rr in d.items():
  valid=[x for x in rr if x["status"]==200]
  med=lambda key:round(statistics.median([r[key] for r in valid]),1) if valid else None
  print("REST_LATENCY_SUMMARY "+json.dumps({
   "name":name,"n":len(rr),"success":len(valid),"reused":sum(r["connections"]==0 for r in valid),
   "medianTotalMs":med("totalMs"),"medianTTFBMs":med("ttfbMs"),
   "medianWaitAfterReadyMs":med("waitMs"),"medianDownloadMs":med("bodyMs"),
   "maxTTFBMs":max((r["ttfbMs"] for r in valid),default=None),
   "bytes":med("bytes"),"httpVersions":sorted(set(r["proto"] for r in rr)),
   "errors":[r["status"] for r in rr if r["status"]!=200]
  }),flush=True)
def call_cycle(names,cycle):
 args=["curl","--silent","--show-error","--location","--http2",
       "--compressed","--connect-timeout","12","--max-time","25",
       "--user-agent","Mozilla/5.0 (compatible; PTSCPS-Rest-Comparison/1.0)"]
 for i,name in enumerate(names):
  if i:args+=["--next","--silent","--show-error","--location","--http2",
              "--compressed","--connect-timeout","12","--max-time","25",
              "--user-agent","Mozilla/5.0 (compatible; PTSCPS-Rest-Comparison/1.0)"]
  args+=["--output","/dev/null","--write-out",FMT,URLS[name]]
 run=subprocess.run(args,capture_output=True,text=True,timeout=len(names)*26+20)
 if run.returncode:print("REST_CYCLE_ERROR "+json.dumps({"cycle":cycle,"exit":run.returncode,"message":run.stderr[-400:]}),flush=True)
 raws=[l[len("PTSCPS_TIMING:"):] for l in run.stdout.splitlines() if l.startswith("PTSCPS_TIMING:")]
 rows=[]
 for name,line in zip(names,raws):
  p=line.split("|")
  if len(p)!=10:
   print("REST_PARSE_ERROR "+json.dumps({"cycle":cycle,"name":name,"got":p}),flush=True);continue
  try:
   status=int(p[0]);conns=int(p[2]);tn,tc,ta,tp,ts,tt=map(float,p[3:9]);size=int(float(p[9]))
   row={"cycle":cycle,"name":name,"status":status,"proto":p[1],"connections":conns,
    "dnsMs":roundms(tn),"tcpReadyMs":roundms(tc),"tlsReadyMs":roundms(ta),
    "requestReadyMs":roundms(tp),"ttfbMs":roundms(ts),"totalMs":roundms(tt),
    "waitMs":roundms(ts-tp),"bodyMs":roundms(tt-ts),"bytes":size}
   print("REST_LATENCY_CASE "+json.dumps(row),flush=True)
   rows.append(row)
  except Exception as ex:
   print("REST_PARSE_ERROR "+json.dumps({"cycle":cycle,"name":name,"error":str(ex)[:160]}),flush=True)
 return rows
rows=[]
for cycle in range(1,7):
 names=list(URLS)
 if cycle%2==0:names.reverse()
 rows+=call_cycle(names,cycle)
 time.sleep(0.45)
summarize(rows)
print("REST_LATENCY_CONCLUSION "+json.dumps({
 "meaning":"Core REST and SR7 both load WordPress; static logo does not. Compare especially connections==0 and waitMs to separate connection setup from upstream/runtime delay.",
 "warning":"GitHub runner geography and server state vary; no Server-Timing means PHP execution time has not been measured directly."}),flush=True)
