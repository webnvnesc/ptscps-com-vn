#!/usr/bin/env python3
"""Inspect just the picture/source markup around Jannah header logo; read-only."""
import urllib.request,re,json
paths=["/","/c/co-dong"]
for path in paths:
 req=urllib.request.Request("https://ptscps.com.vn"+path,headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36"})
 with urllib.request.urlopen(req,timeout=30) as resp:html=resp.read(300000).decode("utf-8","replace")
 m=re.search(r'<picture\b[^>]*tie-logo-picture\b[^>]*>.*?</picture>',html,re.I|re.S)
 if not m:raise RuntimeError("Missing logo picture "+path)
 content=m.group(0)
 print("PICTURE_LOGO "+json.dumps({"path":path,"markup":content[:2200],"sources":re.findall(r'<source\b[^>]*>',content,re.I),"image":re.findall(r'<img\b[^>]*>',content,re.I)},ensure_ascii=False),flush=True)
