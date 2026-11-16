#!/usr/bin/env python3
"""Read-only structure inventory for an existing WordPress installation over FTPS.
Never downloads wp-config, .env, databases, uploads, backup archives or media.
The report contains architecture metadata only, not file bodies or credentials.
"""
import ftplib
import http.cookiejar
import json
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request
from collections import Counter
from html.parser import HTMLParser

ROOT = os.environ.get("FTP_DIRECTORY", "").rstrip("/")
URL = os.environ.get("WP_URL", "").rstrip("/")
SKIP = {"uploads", "cache", "caches", "backup", "backups", "ai1wm-backups",
        "upgrade", "upgrade-temp-backup", "wflogs", "node_modules", "vendor",
        ".git", "tmp", "temp", "logs", "log", "litespeed", "et-cache"}
READ_MAX = 250000
MAX_PLUGIN_DIRS = 100
MAX_FILES = 240
report = {
    "site": URL, "root": ROOT,
    "excluded": ["wp-content/uploads/**", "backup/cache/log/vendor and generated artifacts"],
    "root_markers": [], "root_other_directories": [], "root_custom_files": [],
    "wp_content": {}, "themes": [], "plugins": [], "mu_plugins": [],
    "dropins": [], "admin": {}, "errors": [],
    "scanned_file_counts": {"php_css": 0},
}
def safe_name(n):
    return n and re.fullmatch(r"[A-Za-z0-9_.-]+", n) and n not in {".", ".."}

class FTPScan:
    def __init__(self):
        from urllib.parse import urlsplit
        server = os.environ.get("FTP_SERVER", "")
        u = urlsplit(server if "://" in server else "//" + server)
        if not u.hostname:
            raise RuntimeError("FTP server hostname is missing")
        self.ftp = ftplib.FTP_TLS()
        self.ftp.connect(u.hostname, u.port or 21, timeout=25)
        self.ftp.auth()
        self.ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
        self.ftp.prot_p()
        self.ftp.set_pasv(True)
        self.ftp.cwd(ROOT)
        self.listcache = {}

    def listdir(self, relative="", limit=MAX_FILES):
        relative = relative.strip("/")
        if relative in self.listcache:
            return self.listcache[relative]
        # No recursion; caller must explicitly choose each directory.
        if relative.split("/")[0] == "uploads" or "/uploads" in "/" + relative:
            raise RuntimeError("Refusing to enumerate uploads")
        target = ROOT + ("/" + relative if relative else "")
        try:
            pairs = list(self.ftp.mlsd(target))
            entries = [{"name": name.rstrip("/").split("/")[-1],
                        "type": facts.get("type", ""),
                        "size": int(facts.get("size", 0) or 0)}
                       for name, facts in pairs]
        except ftplib.all_errors:
            self.ftp.cwd(target)
            names = self.ftp.nlst()
            entries = [{"name": n.rstrip("/").split("/")[-1], "type": "unknown", "size": 0}
                       for n in names]
        entries = [e for e in entries if safe_name(e["name"])]
        entries.sort(key=lambda e: e["name"].lower())
        if len(entries) > limit:
            report["errors"].append("Large listing capped: " + relative)
            entries = entries[:limit]
        self.listcache[relative] = entries
        return entries

    def read_text(self, relative, max_bytes=READ_MAX):
        relative = relative.strip("/")
        # Tight allowlist: theme CSS/PHP, plugin bootstrap PHP, WordPress version.
        if not relative.endswith((".php", ".css", ".json")):
            return ""
        if any(x in relative.split("/") for x in SKIP) or relative.startswith("."):
            return ""
        if relative.split("/")[-1] in {"wp-config.php", "db.php", "object-cache.php", "advanced-cache.php"}:
            return ""
        full = ROOT + "/" + relative
        try:
            self.ftp.voidcmd("TYPE I")
            length = self.ftp.size(full)
            if length is not None and length > max_bytes:
                return ""
        except ftplib.all_errors:
            # Avoid a potentially huge transfer if the server cannot report size.
            return ""
        chunks = []
        n = 0
        def add(chunk):
            nonlocal n
            n += len(chunk)
            if n <= max_bytes:
                chunks.append(chunk)
        self.ftp.retrbinary("RETR " + full, add)
        if n > max_bytes:
            return ""
        report["scanned_file_counts"]["php_css"] += 1
        return b"".join(chunks).decode("utf-8", "replace")

    def close(self):
        try:
            self.ftp.quit()
        except Exception:
            self.ftp.close()

def meta_value(source, key):
    found = re.search(r"(?im)^\s*(?:/\*+|\*+|//|#)?\s*" +
                      re.escape(key) + r"\s*:\s*(.*?)\s*(?:\*/)?$", source[:16000])
    return found.group(1).strip()[:130] if found else ""

def analyze_php(source):
    return {
        "function_names": list(dict.fromkeys(re.findall(
            r"\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", source)))[:30],
        "class_names": list(dict.fromkeys(re.findall(
            r"\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b", source)))[:20],
        "action_hooks": list(dict.fromkeys(re.findall(
            r"\badd_action\s*\(\s*['\"]([^'\"]{1,65})", source)))[:25],
        "filter_hooks": list(dict.fromkeys(re.findall(
            r"\badd_filter\s*\(\s*['\"]([^'\"]{1,65})", source)))[:25],
        "shortcodes": list(dict.fromkeys(re.findall(
            r"\badd_shortcode\s*\(\s*['\"]([^'\"]{1,65})", source)))[:18],
        "local_includes": list(dict.fromkeys(re.findall(
            r"(?:require|include)(?:_once)?\s*\(?\s*(?:get_template_directory\(\)|get_stylesheet_directory\(\)|__DIR__|dirname\(__FILE__\))?\s*\.?\s*['\"]([^'\"]{1,95}\.php)", source)))[:20],
        "indicators": [token for token, pattern in {
            "elementor": r"\belementor\b", "woocommerce": r"\bwoocommerce\b",
            "polylang": r"\bpll_", "acf": r"\bacf_", "rest_api": r"register_rest_route",
            "custom_post_types": r"register_post_type",
            "custom_taxonomies": r"register_taxonomy",
            "enqueue_assets": r"wp_enqueue_(script|style)",
            "navigation_menus": r"register_nav_menus?",
            "widgets": r"register_sidebar",
            "ajax": r"wp_ajax_",
        }.items() if re.search(pattern, source, re.I)],
    }

def scan():
    ftp = FTPScan()
    try:
        root = ftp.listdir("")
        found = {x["name"] for x in root}
        required = {"wp-admin", "wp-content", "wp-includes", "index.php"}
        if not required.issubset(found):
            raise RuntimeError("Unexpected document root: missing WordPress markers")
        report["root_markers"] = sorted(required)
        report["root_other_directories"] = [x["name"] for x in root
            if x["name"] not in {"wp-admin", "wp-content", "wp-includes"}
            and x["type"] == "dir"]
        report["root_custom_files"] = [x["name"] for x in root
            if x["type"] != "dir" and x["name"].endswith((".php", ".html", ".htaccess"))
            and not x["name"].startswith(".") and
            not x["name"].startswith("wp-") and x["name"] not in {"index.php"}][:35]
        try:
            text = ftp.read_text("wp-includes/version.php", 30000)
            m = re.search(r"\$wp_version\s*=\s*['\"]([^'\"]+)", text)
            report["wordpress_version"] = m.group(1) if m else "unknown"
        except Exception:
            report["wordpress_version"] = "unavailable"

        content = ftp.listdir("wp-content")
        report["wp_content"] = {
            "directories": [x["name"] for x in content if
                x["type"] == "dir" or x["name"] in {"plugins", "themes", "mu-plugins", "uploads"}],
            "root_files": [x["name"] for x in content if
                x["type"] != "dir" and x["name"].endswith(".php")][:35],
        }
        for dropin in ["advanced-cache.php", "object-cache.php", "db.php", "sunrise.php", "maintenance.php"]:
            if dropin in {x["name"] for x in content}:
                report["dropins"].append(dropin)

        themes = ftp.listdir("wp-content/themes", limit=100)
        for e in themes:
            name = e["name"]
            if name in SKIP or name.startswith(".") or name in {"index.php"}:
                continue
            try:
                listing = ftp.listdir("wp-content/themes/" + name, limit=220)
                visible = [x["name"] for x in listing]
                if "style.css" not in visible and "functions.php" not in visible:
                    continue
                style = ftp.read_text("wp-content/themes/" + name + "/style.css", 80000) if "style.css" in visible else ""
                meta = {
                    "slug": name,
                    "theme_name": meta_value(style, "Theme Name") or name,
                    "parent_template": meta_value(style, "Template"),
                    "top_directories": [x["name"] for x in listing if x["type"] == "dir"][:55],
                    "php_files": [x["name"] for x in listing if x["name"].endswith(".php")][:90],
                    "css_js_files": [x["name"] for x in listing if x["name"].endswith((".css", ".js"))][:35],
                    "sources": {},
                }
                for f in ["functions.php", "front-page.php", "home.php", "header.php", "footer.php",
                          "page.php", "single.php", "archive.php", "index.php", "woocommerce.php"]:
                    if f in visible:
                        code = ftp.read_text("wp-content/themes/" + name + "/" + f)
                        if code:
                            meta["sources"][f] = analyze_php(code)
                report["themes"].append(meta)
            except Exception as e:
                report["errors"].append("Theme scan issue: " + name + " (" + type(e).__name__ + ")")

        plugins = ftp.listdir("wp-content/plugins", limit=MAX_PLUGIN_DIRS + 50)
        for e in plugins:
            slug = e["name"]
            if slug in SKIP or slug.startswith(".") or not safe_name(slug):
                continue
            if slug.endswith(".php"):
                # standalone plugin
                code = ftp.read_text("wp-content/plugins/" + slug, 60000)
                info = {"slug": slug, "main": slug,
                        "name": meta_value(code, "Plugin Name") or slug}
                if any(x in slug.lower() for x in ["ptsc", "custom", "site-", "esc", "nvn"]):
                    info["code_map"] = analyze_php(code)
                report["plugins"].append(info)
                continue
            try:
                listing = ftp.listdir("wp-content/plugins/" + slug, limit=125)
                candidates = [x["name"] for x in listing if x["name"].lower().endswith(".php")]
                candidates.sort(key=lambda n: (n not in {slug + ".php", "plugin.php"}, n))
                main = ""
                display = slug
                snippet = ""
                for f in candidates[:5]:
                    code = ftp.read_text("wp-content/plugins/" + slug + "/" + f, 80000)
                    name = meta_value(code, "Plugin Name")
                    if name:
                        main, display, snippet = f, name, code
                        break
                info = {"slug": slug, "name": display, "main": main,
                        "php_top_level_count": len(candidates),
                        "subdirectories": [x["name"] for x in listing if x["type"] == "dir"][:16]}
                if any(x in slug.lower() for x in ["ptsc", "custom", "site-", "esc", "nvn", "snippet"]):
                    if not snippet and candidates:
                        snippet = ftp.read_text("wp-content/plugins/" + slug + "/" + candidates[0])
                    if snippet:
                        info["code_map"] = analyze_php(snippet)
                report["plugins"].append(info)
            except Exception as e:
                report["errors"].append("Plugin scan issue: " + slug + " (" + type(e).__name__ + ")")

        if "mu-plugins" in {x["name"] for x in content}:
            try:
                mus = ftp.listdir("wp-content/mu-plugins", limit=140)
                report["mu_plugins"] = [e["name"] for e in mus if
                    e["name"].endswith(".php") and not e["name"].startswith(".")][:70]
            except Exception as e:
                report["errors"].append("mu-plugins inaccessible: " + type(e).__name__)
    finally:
        ftp.close()

class AdminRowParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.plugin_active = []
        self.plugin_inactive = []
        self.active_theme = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        css = (a.get("class") or "").split()
        if tag == "tr" and a.get("data-plugin"):
            target = self.plugin_active if "active" in css else self.plugin_inactive
            target.append(a["data-plugin"])
        if tag == "div" and "theme" in css and "active" in css:
            self.active_theme.append(a.get("data-slug", ""))

def inspect_admin():
    username = os.environ.get("WP_ADMIN_USERNAME", "")
    password = os.environ.get("WP_ADMIN_PASSWORD", "")
    if not username or not password:
        report["admin"] = {"status": "no_credentials"}
        return
    host = urllib.parse.urlparse(URL).hostname
    class SameHostOnly(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            u = urllib.parse.urlparse(newurl)
            if u.scheme != "https" or u.hostname != host:
                raise ValueError("Redirect escaped approved HTTPS host")
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        SameHostOnly())
    def fetch(path, data=None):
        url = URL + path
        req = urllib.request.Request(url, data=data,
            headers={"User-Agent": "Mozilla/5.0 (compatible; PTSCPSReadOnlyStructureScan/1.0)",
                     "Content-Type": "application/x-www-form-urlencoded"})
        with opener.open(req, timeout=25) as res:
            return res.url, res.read(1250000).decode("utf-8", "replace")
    try:
        fetch("/wp-login.php")
        form = urllib.parse.urlencode({"log": username, "pwd": password,
            "wp-submit": "Log In", "redirect_to": URL + "/wp-admin/",
            "testcookie": "1"}).encode()
        fetch("/wp-login.php", form)
        if not any(c.name.startswith(("wordpress_logged_in_", "wordpress_sec_")) for c in jar):
            report["admin"] = {"status": "login_restricted"}
            return
        p = AdminRowParser()
        url, html = fetch("/wp-admin/plugins.php")
        if urllib.parse.urlparse(url).path.endswith("/wp-admin/plugins.php"):
            p.feed(html)
            report["admin"]["plugins_page"] = "accessible"
            report["admin"]["active_plugin_files"] = p.plugin_active[:140]
            report["admin"]["inactive_plugin_count"] = len(p.plugin_inactive)
        else:
            report["admin"]["plugins_page"] = "restricted"
        url, html = fetch("/wp-admin/themes.php")
        if urllib.parse.urlparse(url).path.endswith("/wp-admin/themes.php"):
            p2 = AdminRowParser()
            p2.feed(html)
            report["admin"]["themes_page"] = "accessible"
            report["admin"]["active_theme_slugs"] = [x for x in p2.active_theme if x][:8]
        else:
            report["admin"]["themes_page"] = "restricted"
    except Exception as exc:
        report["admin"]["error_type"] = type(exc).__name__

if __name__ == "__main__":
    try:
        scan()
        inspect_admin()
        # Never print raw retrieved source, HTML, auth cookies or URL query parameters.
        print("PTSCPS_SOURCE_REPORT=" + json.dumps(report, ensure_ascii=False, separators=(",", ":")), flush=True)
        print("SUCCESS: Read-only structural inventory completed; uploads not enumerated.", flush=True)
    except Exception as exc:
        print("FAIL: Read-only structural inventory could not complete (" + type(exc).__name__ + ").", flush=True)
        sys.exit(1)
