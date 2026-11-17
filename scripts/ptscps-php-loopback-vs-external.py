#!/usr/bin/env python3
"""FTPS temporary origin-local vs external HTTP probe (self-cleaning).
Never accesses WP config/db or logs, no persistent production changes.
"""
import ftplib,hashlib,io,json,os,secrets,statistics,subprocess,sys
from urllib.parse import urlsplit
from pathlib import Path

ROOT="/domains/ptscps.com.vn/public_html"
PUBLIC="https://ptscps.com.vn/"
OUT=Path("ptscps-localpath-diagnostic")
OUT.mkdir(exist_ok=True)
PHP=r"""<?php
// Ephemeral diagnostic, no WordPress bootstrap, no inputs/control parameters.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
$start = microtime(true);
$relative = '/wp-content/themes/jannah/assets/css/style.min.css';
$file = __DIR__ . $relative;
$disk = array('ok' => false, 'read_ms' => null);
$t = microtime(true);
if (is_readable($file)) {
    $data = @file_get_contents($file);
    $disk = array('ok' => is_string($data) && strlen($data) > 100000,
      'read_ms' => round((microtime(true) - $t) * 1000, 3),
      'bytes' => is_string($data) ? strlen($data) : null);
    unset($data);
}
function local_probe($url, $ip) {
    if (!function_exists('curl_init')) {
        return array('ok' => false, 'error' => 'php_curl_missing');
    }
    $h = curl_init($url);
    if (!$h) return array('ok' => false, 'error' => 'init_failed');
    $bytes = 0;
    curl_setopt_array($h, array(
       CURLOPT_RETURNTRANSFER => false,
       CURLOPT_FOLLOWLOCATION => false,
       CURLOPT_CONNECTTIMEOUT_MS => 1000,
       CURLOPT_TIMEOUT_MS => 2400,
       CURLOPT_DNS_CACHE_TIMEOUT => 0,
       CURLOPT_PROXY => '',
       CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
       CURLOPT_USERAGENT => 'PTSCPS-Temporary-LocalPath-Diagnostic/1.0',
       CURLOPT_HTTPHEADER => array('Accept-Encoding: identity'),
       CURLOPT_WRITEFUNCTION => function($handle, $chunk) use (&$bytes) {
           $n = strlen($chunk);
           $bytes += $n;
           if ($bytes > 180000) return 0;
           return $n;
       }
    ));
    // DNS override keeps correct vhost/SNI/certificate name while directing
    // socket to local Apache. If loopback is not bound, report failure.
    if ($ip) curl_setopt($h, CURLOPT_RESOLVE, array('ptscps.com.vn:443:' . $ip));
    $ok = curl_exec($h);
    $code = curl_getinfo($h, CURLINFO_RESPONSE_CODE);
    $result = array(
       'ok' => $ok !== false && $code === 200 && $bytes > 100000,
       'code' => (int)$code,
       'dns_ms' => round(curl_getinfo($h, CURLINFO_NAMELOOKUP_TIME) * 1000, 1),
       'connect_ms' => round(curl_getinfo($h, CURLINFO_CONNECT_TIME) * 1000, 1),
       'tls_ms' => round(curl_getinfo($h, CURLINFO_APPCONNECT_TIME) * 1000, 1),
       'first_byte_ms' => round(curl_getinfo($h, CURLINFO_STARTTRANSFER_TIME) * 1000, 1),
       'total_ms' => round(curl_getinfo($h, CURLINFO_TOTAL_TIME) * 1000, 1),
       'bytes' => $bytes
    );
    if ($ok === false) $result['errno'] = curl_errno($h);
    curl_close($h);
    return $result;
}
$asset = 'https://ptscps.com.vn' . $relative;
$local = local_probe($asset, '127.0.0.1');
$public = local_probe($asset, null);
echo json_encode(array(
  'ok' => true,
  'disk' => $disk,
  'loopback' => $local,
  'self_public' => $public,
  'runtime_ms' => round((microtime(true) - $start) * 1000, 1)
), JSON_UNESCAPED_SLASHES);
"""
def connect():
    u=os.environ["FTP_SERVER"]
    p=urlsplit(u if "://" in u else "//"+u)
    f=ftplib.FTP_TLS(timeout=26)
    f.connect(p.hostname,p.port or 21,timeout=26)
    f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
    f.prot_p();f.set_pasv(True)
    return f
def close(f):
    try:f.quit()
    except Exception:f.close()
def read(f,path):
    b=bytearray()
    f.retrbinary("RETR "+path,lambda x:b.extend(x) if len(b)<15000 else (_ for _ in ()).throw(ValueError("too large")))
    return bytes(b)
def shell(url,cycle):
    cmd=["curl","-sS","--compressed","--connect-timeout","6","--max-time","12",
      "--http2","-H","Cache-Control: no-store","-A","PTSCPS-Temporary-LocalPath-Runner/1.0",
      "-w","\n__PERF__%{json}\n",url]
    try:
        p=subprocess.run(cmd,text=True,capture_output=True,timeout=16)
        if p.returncode:
            return {"cycle":cycle,"error":"curl_exit_"+str(p.returncode)}
        raw,payload=p.stdout.rsplit("__PERF__",1)
        data=json.loads(raw.strip())
        timing=json.loads(payload.strip())
        good=data.get("ok") is True and int(timing.get("http_code") or 0)==200
        record={"cycle":cycle,"ok":good,
             "external_ms":round(float(timing.get("time_starttransfer") or 0)*1000,1),
             "external_total_ms":round(float(timing.get("time_total") or 0)*1000,1),
             "external_pretransfer_ms":round(float(timing.get("time_pretransfer") or 0)*1000,1),
             "external_proto":timing.get("http_version"),
             "remote_http":timing.get("http_code"),
             "server_runtime_ms":data.get("runtime_ms"),
             "disk":data.get("disk"),
             "loopback":data.get("loopback"),
             "self_public":data.get("self_public")}
        return record
    except Exception as e:
        return {"cycle":cycle,"error":type(e).__name__}
def summary(values):
    v=sorted(x for x in values if isinstance(x,(int,float)))
    return {"valid":len(v),"median_ms":round(statistics.median(v),1) if v else None,
       "max_ms":round(v[-1],1) if v else None}
def main():
    name="ptscps-localpath-"+secrets.token_hex(15)+".php"
    path=ROOT+"/"+name
    url=PUBLIC+name
    source=PHP.encode()
    ftp=None
    created=False
    deleted=False
    rows=[]
    try:
        ftp=connect()
        ftp.cwd(ROOT)
        markers={x.rsplit("/",1)[-1] for x in ftp.nlst()}
        if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(markers):
            raise RuntimeError("unexpected WordPress root")
        if name in markers:raise RuntimeError("filename already exists")
        ftp.storbinary("STOR "+path,io.BytesIO(source))
        created=True
        if hashlib.sha256(source).digest()!=hashlib.sha256(read(ftp,path)).digest():
            raise RuntimeError("staged source mismatch")
        print("LOCALPATH_STARTED temporary server-side diagnostic installed",flush=True)
        for i in range(7):
            row=shell(url,i)
            rows.append(row)
            print("LOCALPATH_CASE "+json.dumps(row,sort_keys=True),flush=True)
        metrics=["external_ms","server_runtime_ms"]
        for key in ["loopback","self_public","disk"]:
            if key=="disk":metrics.append("disk.read_ms")
            else:metrics.extend([key+".first_byte_ms",key+".total_ms"])
        results={}
        for key in metrics:
            samples=[]
            for row in rows:
                value=row
                for part in key.split("."):
                    value=value.get(part) if isinstance(value,dict) else None
                samples.append(value)
            results[key]=summary(samples)
        results["loopback_ok"]=sum(1 for x in rows if x.get("loopback",{}).get("ok"))
        results["self_public_ok"]=sum(1 for x in rows if x.get("self_public",{}).get("ok"))
        results["external_ok"]=sum(1 for x in rows if x.get("ok"))
        (OUT/"report.json").write_text(json.dumps({"summary":results,"rows":rows},indent=2),encoding="utf-8")
        print("LOCALPATH_SUMMARY "+json.dumps(results,sort_keys=True),flush=True)
        if results["external_ok"]<6:
            raise RuntimeError("not enough valid external requests")
    finally:
        if created:
            try:
                if ftp is None:ftp=connect()
                ftp.delete(path)
                try:ftp.size(path)
                except ftplib.error_perm:deleted=True
            except Exception:
                try:
                    backup=connect()
                    try:backup.delete(path);deleted=True
                    finally:close(backup)
                except Exception as e:
                    print("LOCALPATH_CLEANUP_RETRY_FAILED "+type(e).__name__,flush=True)
        if ftp is not None:close(ftp)
        print("LOCALPATH_CLEANUP "+("SUCCESS" if deleted else "NOT_CREATED" if not created else "FAILED"),flush=True)
        if created and not deleted:sys.exit(2)
if __name__=="__main__":
    main()
