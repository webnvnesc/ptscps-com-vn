#!/usr/bin/env python3
"""HTTP 1.1 vs HTTP 2 real static resource timing; readonly, bounded.
No auth, cookie, cache-busting query, origin modifications, or config dumps.
"""
import json, re, html, os, statistics, subprocess, time, urllib.request, urllib.parse
from html.parser import HTMLParser
BASE="https://ptscps.com.vn/"
OUT="ptscps-h1-vs-h2"
os.makedirs(OUT,exist_ok=True)
class Parser(HTMLParser):
    def __init__(self):
        super().__init__();self.links=[];self.scripts=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs);v=d.get("href") if tag=="link" else d.get("src") if tag=="script" else None
        if not v:return
        url=urllib.parse.urljoin(BASE,html.unescape(v))
        if not url.startswith(BASE):return
        (self.links if tag=="link" else self.scripts).append(url)
def median(xs):
    xs=[x for x in xs if isinstance(x,(float,int))]
    return round(statistics.median(xs),1) if xs else None
def percentile(xs,p=.90):
    xs=sorted(x for x in xs if isinstance(x,(float,int)))
    return round(xs[min(len(xs)-1,int((len(xs)-1)*p+0.9999))],1) if xs else None
def select():
    req=urllib.request.Request(BASE,headers={"User-Agent":"Mozilla/5.0 (compatible; PTSCPSReadOnly/1.0)"})
    with urllib.request.urlopen(req,timeout=25) as r:doc=r.read(1800000).decode("utf8","replace")
    p=Parser();p.feed(doc)
    def find(li,pat):
        v=next((x for x in li if re.search(pat,x)),None)
        if not v:raise ValueError("not found: "+pat)
        return v
    return {
        "jannah-style":find(p.links,r"/jannah/assets/css/style\.min\.css"),
        "tiny-spacer":find(p.links,r"/elementor/assets/css/widget-spacer\.min\.css"),
        "jquery":find(p.scripts,r"/jquery/jquery\.min\.js"),
        "html":BASE
    }
# curl --write-out JSON prints timing in stable structured fields (curl v7.70+).
FIELDS=["http_code","http_version","time_namelookup","time_connect","time_appconnect","time_pretransfer",
        "time_starttransfer","time_total","size_download","num_connects","remote_ip","url_effective"]
def probe(url,proto,label,cycle):
    cmd=["curl","--silent","--show-error","--location","--compressed","--connect-timeout","10",
         "--max-time","24","--no-keepalive","--http2" if proto=="h2" else "--http1.1",
         "-A","Mozilla/5.0 (compatible; PTSCPSReadOnly/1.0)",
         "-D","-","-o","/dev/null","-w","\n__PERF__%{json}\n",url]
    try:
        p=subprocess.run(cmd,text=True,capture_output=True,timeout=28,check=False)
        if p.returncode:return {"label":label,"cycle":cycle,"requested":proto,"curlExit":p.returncode,"error":p.stderr[-150:]}
        m=re.search(r"__PERF__(\{.*\})",p.stdout)
        if not m:return {"label":label,"cycle":cycle,"requested":proto,"error":"no-curl-json"}
        data=json.loads(m.group(1))
        marker=p.stdout.split("__PERF__")[0].replace("\r\n","\n").strip()
        response_blocks=re.split(r"(?=^HTTP/\S+\s+\d{3})",marker,flags=re.M)
        header_lines=(response_blocks[-1] if response_blocks else "").splitlines()
        headers={}
        for line in header_lines[1:]:
            if ":" in line:
                k,v=line.split(":",1)
                if k.lower() in {"server","via","alt-svc","cache-control","x-cache","cf-cache-status",
                                  "x-litespeed-cache","age","content-encoding","content-type","etag","vary"}:
                    headers[k.lower()]=v.strip()[:130]
        ms=lambda f:round(float(data.get("time_"+f) or 0)*1000,1)
        row={"label":label,"cycle":cycle,"requested":proto,"actual":data.get("http_version"),
             "status":int(data.get("http_code") or 0),"curlExit":p.returncode,
             "ip":data.get("remote_ip"),"bytes":int(data.get("size_download") or 0),
             "dnsMs":ms("namelookup"),"tcpMs":ms("connect"),"tlsMs":ms("appconnect"),
             "pretransferMs":ms("pretransfer"),"firstByteMs":ms("starttransfer"),
             "totalMs":ms("total"),"postHandshakeWaitMs":round(ms("starttransfer")-ms("pretransfer"),1),
             "bodyMs":round(ms("total")-ms("starttransfer"),1),"headers":headers}
        return row
    except Exception as e:return {"label":label,"cycle":cycle,"requested":proto,"error":type(e).__name__+": "+str(e)[:140]}
def main():
    urls=select()
    print("SELECTED "+json.dumps({k:urllib.parse.urlparse(u).path for k,u in urls.items()}),flush=True)
    samples=[]
    pairs=int(os.getenv("TRANSPORT_PAIRS","10"))
    # Randomize via alternating order to avoid always favoring cold vs warm.
    for cycle in range(pairs):
        for label,url in urls.items():
            protos=("h2","h1") if cycle%2==0 else ("h1","h2")
            for proto in protos:
                x=probe(url,proto,label,cycle)
                samples.append(x)
                if x.get("status")!=200:print("FAIL_SAMPLE "+json.dumps(x),flush=True)
                print("SAMPLE "+json.dumps({k:x.get(k) for k in ["label","cycle","requested","actual","status",
                    "firstByteMs","postHandshakeWaitMs","bodyMs","error"]}),flush=True)
    summaries=[]
    for label in urls:
        a=[x for x in samples if x["label"]==label]
        for proto in ("h1","h2"):
            data=[x for x in a if x["requested"]==proto]
            ok=[x for x in data if x.get("status")==200 and not x.get("error")]
            s={"label":label,"proto":proto,"count":len(data),"ok":len(ok),
                "actualHttp":list(dict.fromkeys(x.get("actual") for x in ok)),
                "ips":list(dict.fromkeys(x.get("ip") for x in ok))[:4],
                "medianTTFB":median([x.get("firstByteMs") for x in ok]),
                "p90TTFB":percentile([x.get("firstByteMs") for x in ok]),
                "maxTTFB":max([x.get("firstByteMs") for x in ok],default=None),
                "medianPostHandshakeWait":median([x.get("postHandshakeWaitMs") for x in ok]),
                "medianBody":median([x.get("bodyMs") for x in ok]),
                "headers":ok[0]["headers"] if ok else {}}
            summaries.append(s);print("TRANSPORT_SUMMARY "+json.dumps(s),flush=True)
        paired=[]
        for cyc in range(pairs):
            h1=next((r for r in a if r["cycle"]==cyc and r["requested"]=="h1" and r.get("status")==200),None)
            h2=next((r for r in a if r["cycle"]==cyc and r["requested"]=="h2" and r.get("status")==200),None)
            if h1 and h2:paired.append(round(h2["postHandshakeWaitMs"]-h1["postHandshakeWaitMs"],1))
        print("TRANSPORT_PAIRS "+json.dumps({"label":label,"valid":len(paired),
            "h2MinusH1WaitMedian":median(paired),"h2SlowerCount":sum(d>50 for d in paired),
            "h1SlowerCount":sum(d<(-50) for d in paired),"deltas":paired}),flush=True)
    with open(OUT+"/data.json","w") as f:json.dump({"urls":urls,"samples":samples,"summaries":summaries},f,indent=2)
    if any(s["ok"]<max(pairs-2,1) for s in summaries):raise RuntimeError("too many failed samples")
if __name__=="__main__":main()
