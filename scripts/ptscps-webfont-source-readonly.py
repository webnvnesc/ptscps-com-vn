#!/usr/bin/env python3
"""Read-only inspect markup and font resources on real WordPress PTSCPS pages."""
import urllib.request,urllib.parse,re,json,hashlib,html
ROOT="https://ptscps.com.vn"
paths=["/","/thu-ngo.htm","/dich-vu","/lien-he","/e"]
agents={
 "desktop":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
 "mobile":"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36",
}
for path in paths:
 for agent,ua in agents.items():
  url=ROOT+path
  req=urllib.request.Request(url,headers={"User-Agent":ua,"Accept":"text/html","Accept-Encoding":"identity"})
  try:
   with urllib.request.urlopen(req,timeout=30) as r:
    body=r.read(2_800_000).decode("utf8","replace")
    status=r.status
  except Exception as e:
   print("FONT_HTML_ERROR "+json.dumps({"path":path,"agent":agent,"error":str(e)[:270]}),flush=True)
   continue
  matches=[]
  for pattern in [r"webfont(?:loader)?(?:\.js|\.load|\s*=)",r"fonts\.googleapis\.com",r"fonts\.gstatic\.com",r"\bExo\b",r"sr7\.css"]:
   for m in list(re.finditer(pattern,body,re.I))[:16]:
    near=body[max(0,m.start()-650):min(len(body),m.end()+650)]
    # Remove any unpredictable tokens/credentials in arbitrary inline script.
    near=re.sub(r"(?:nonce|token|key|secret|password|_wpnonce)\s*[:=]\s*['\"][^'\"]+['\"]",r"[redacted]",near,flags=re.I)
    matches.append({"pattern":pattern,"offset":m.start(),"context":near[:1300]})
  scripts=re.findall(r"<script\b[^>]*\bsrc\s*=\s*(['\"])(.*?)\1",body,re.I|re.S)
  styles=re.findall(r"<link\b[^>]*\bhref\s*=\s*(['\"])(.*?)\1[^>]*>",body,re.I|re.S)
  print("FONT_HTML "+json.dumps({"path":path,"agent":agent,"status":status,"bytes":len(body),
    "hasWebfont":bool(re.search(r'webfont|WebFont',body,re.I)),
    "hasExo":bool(re.search(r'\bExo\b',body,re.I)),
    "matches":matches[:18],
    "webfontScripts":[b for a,b in scripts if "webfont" in b.lower()],
    "fontLinks":[b for a,b in styles if "fonts" in b.lower() or "exo" in b.lower()][:12]
   },ensure_ascii=False),flush=True)
