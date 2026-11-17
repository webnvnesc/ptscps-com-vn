#!/usr/bin/env python3
"""End-to-end HTTP validation of exact three WebP banner rewrite rules.

The tests cover webp-capable clients, unsupported clients, direct WebP URL,
dimensions, cache negotiation Vary, MIME and the untouched current HTML poster.
"""
import urllib.request, urllib.error, json, sys, time, io
from PIL import Image

URL="https://ptscps.com.vn/wp-content/uploads/2019/10/"
FILES=("ruby-banner.jpg","banner2.jpg","banner3.jpg")
def fetch(url,accept):
    req=urllib.request.Request(url,headers={
        "Accept":accept,"User-Agent":"Mozilla/5.0 (PTSCPS WebP negotiation pilot QA)",
        "Cache-Control":"no-cache"})
    with urllib.request.urlopen(req,timeout=45) as r:
        data=r.read()
        return r.status,dict(r.headers.items()),data
def mime(h):
    return h.get("Content-Type",h.get("content-type","")).split(";")[0].lower()
def vary(h):
    return h.get("Vary",h.get("vary",""))
def image(blob):
    im=Image.open(io.BytesIO(blob));im.load()
    return im.format,[im.width,im.height]
def main():
    result=[]
    for n in FILES:
        # Cache-busting query parameters prevent stale intermediate cache from
        # poisoning the variant test. Original JPG URL remains unchanged on site.
        path=URL+n
        qp="?ptscps_webp_pilot_v1="+str(int(time.time()))+"_"+n.split(".")[0]
        status,wheaders,wblob=fetch(path+qp,"image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
        jstatus,jheaders,jblob=fetch(path+qp+"&legacy=1","image/jpeg,image/png,*/*;q=0.8")
        direct_status,dheaders,dblob=fetch(path+".webp","image/webp")
        wf,wd=image(wblob)
        jf,jd=image(jblob)
        df,dd=image(dblob)
        row={"image":n,"webp":{"status":status,"type":mime(wheaders),"format":wf,"bytes":len(wblob),
               "vary":vary(wheaders)},
             "legacy":{"status":jstatus,"type":mime(jheaders),"format":jf,"bytes":len(jblob),
                       "vary":vary(jheaders)},
             "direct":{"status":direct_status,"type":mime(dheaders),"format":df,
                       "bytes":len(dblob)},
             "sameDimensions":wd==jd==dd}
        result.append(row)
        print("WEBP_PILOT_HTTP_CASE "+json.dumps(row),flush=True)
        if not all(x==200 for x in (status,jstatus,direct_status)):
            raise RuntimeError("Unexpected HTTP status "+n)
        if not all((wf=="WEBP",jf=="JPEG",df=="WEBP",mime(wheaders)=="image/webp",
                     mime(jheaders)=="image/jpeg",mime(dheaders)=="image/webp",
                     wd==jd==dd, wblob==dblob, len(wblob)<len(jblob)*0.88)):
            raise RuntimeError("Image negotiation or fallback mismatch "+n)
        if "accept" not in vary(wheaders).lower() or "accept" not in vary(jheaders).lower():
            raise RuntimeError("Missing safe cache Vary: Accept "+n)
    homepage,hh,html=fetch("https://ptscps.com.vn/","text/html")
    text=html.decode("utf-8","replace")
    if homepage!=200 or "data-ptscps-poster" not in text or "ruby-banner.jpg" not in text:
        raise RuntimeError("Homepage slider markup or poster preload missing")
    print("WEBP_PILOT_HTTP_SUCCESS "+json.dumps({"cases":len(result),
        "homeStatus":homepage,"nativePosterUnchanged":True}),flush=True)
if __name__=="__main__":
    try:main()
    except Exception as e:
        print("WEBP_PILOT_HTTP_FAILED "+type(e).__name__+" "+str(e)[:280],flush=True)
        sys.exit(1)
