#!/usr/bin/env python3
"""Read-only inspect two public Slider Revolution SR7 REST responses.
Only requests exact URLs the user supplied; never changes production state.
"""
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from difflib import SequenceMatcher

HOST="https://ptscps.com.vn"
SLIDES=[2,3]
UA="Mozilla/5.0 (compatible; PTSCPS-SR7-SlidePayload-Inspection/1.0)"

def safe_obj(o,depth=0):
    if depth>5:return f"<depth exceeded: {type(o).__name__}>"
    if isinstance(o,dict):
        return {str(k):safe_obj(v,depth+1) for k,v in list(o.items())[:70]
                if not re.search(r"nonce|token|secret|password|cookie|license|auth",str(k),re.I)}
    if isinstance(o,list):return [safe_obj(x,depth+1) for x in o[:40]]
    if isinstance(o,str):return o[:6500]
    return o

def analyze_raw(blob,ctype):
    txt=blob.decode("utf-8","replace")
    try:
        obj=json.loads(txt)
        return {"isJSON":True,"jsonType":type(obj).__name__,
            "topKeys":list(obj)[:65] if isinstance(obj,dict) else None,
            "tree":safe_obj(obj)}
    except json.JSONDecodeError:
        # Some SR7 REST endpoints return HTML or JavaScript fragments.
        return {"isJSON":False,"textSample":txt[:6500],"title":None}

results={}
for slideid in SLIDES:
    url=f"{HOST}/wp-json/sliderrevolution/sliders/1?srengine=7&slideid={slideid}"
    for repeat in (1,2):
        req=urllib.request.Request(url,headers={"User-Agent":UA,
            "Accept":"application/json,text/plain,*/*","Accept-Encoding":"identity"})
        t=time.perf_counter()
        try:
            with urllib.request.urlopen(req,timeout=45) as response:
                content=response.read(1200000)
                latency=round((time.perf_counter()-t)*1000)
                raw_headers=dict(response.headers.items())
                info={"slideid":slideid,"repeat":repeat,"status":response.status,
                    "url":response.url,"contentType":raw_headers.get("Content-Type"),
                    "cacheControl":raw_headers.get("Cache-Control"),
                    "contentLength":raw_headers.get("Content-Length"),
                    "lastModified":raw_headers.get("Last-Modified"),
                    "vary":raw_headers.get("Vary"),
                    "age":raw_headers.get("Age"),
                    "server":raw_headers.get("Server"),
                    "elapsedMs":latency,"bytes":len(content),
                    "sha256":hashlib.sha256(content).hexdigest()[:16]}
                if repeat==1:
                    info["content"]=analyze_raw(content,raw_headers.get("Content-Type"))
                print("SR7_RESPONSE "+json.dumps(info,ensure_ascii=False),flush=True)
                results[(slideid,repeat)]=content
        except Exception as e:
            print("SR7_FETCH_ERROR "+json.dumps({"slideid":slideid,"repeat":repeat,
                "type":type(e).__name__,"message":str(e)[:260]}),flush=True)

if (2,1) in results and (3,1) in results:
    a,b=results[(2,1)],results[(3,1)]
    images=lambda s:sorted(set(re.findall(r'[^"\'\s<>]+?\.(?:jpe?g|webp|png|gif|svg)(?:\?[^"\'\s<>]*)?',s.decode("utf-8","replace"),re.I)))
    imgsA,imgsB=images(a),images(b)
    summary={"sameExactBytes":a==b,"len2":len(a),"len3":len(b),
      "similarityRatio":round(SequenceMatcher(None,a,b,autojunk=False).ratio(),4),
      "sharedImageRefs":sorted(set(imgsA).intersection(imgsB))[:30],
      "onlySlide2":sorted(set(imgsA)-set(imgsB))[:30],
      "onlySlide3":sorted(set(imgsB)-set(imgsA))[:30]}
    print("SR7_COMPARISON "+json.dumps(summary,ensure_ascii=False),flush=True)
else:
    print("SR7_COMPARISON "+json.dumps({"status":"incomplete","fetched":len(results)}),flush=True)
