#!/usr/bin/env python3
"""دیپلوی ورکر زمان‌بند روی Cloudflare Workers (بدون wrangler، فقط REST API).

استفاده:
  export CF_API_TOKEN=...        # توکن با دسترسی Account > Workers Scripts > Edit
  python3 deploy_worker.py [account_id]

خروجی: نام ورکر، آدرس workers.dev، و نتیجهٔ تست دستی.
"""
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

API = "https://api.cloudflare.com/client/v4"
SCRIPT = "trdr-goldcheck"
CRONS = ["1-59/5 * * * *"]  # دقیقه‌های ۱،۶،۱۱،… (با ورک‌فلوی گیت‌هاب تداخل نکند)
WORKER_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "worker.js")


def cf(method, path, body=None, token=None, raw=None, ctype="application/json"):
    token = token or os.environ["CF_API_TOKEN"]
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": ctype,
        "User-Agent": "hermes-tgcloud-deploy",
    })
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt.strip() else {})
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, {"raw": txt}


def multipart(fields, files):
    boundary = "----hermes" + uuid.uuid4().hex
    out = b""
    for name, value in fields.items():
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
    for name, filename, content, ctype in files:
        out += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n"
        ).encode() + content + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return out, f"multipart/form-data; boundary={boundary}"


def main():
    token = os.environ["CF_API_TOKEN"]
    if os.environ.get("TGCLOUD_TOKEN") and os.environ.get("CRON_SECRET"):
        tgcloud_token, cron_secret = os.environ["TGCLOUD_TOKEN"], os.environ["CRON_SECRET"]
    else:
        tg = dict(l.strip().split("=", 1) for l in open(os.path.expanduser("~/.tgcloud-bot.env")) if "=" in l)
        tgcloud_token, cron_secret = tg["TGCLOUD_TOKEN"], tg["CRON_SECRET"]

    # ۱) حساب
    account_id = sys.argv[1] if len(sys.argv) > 1 else None
    if not account_id:
        st, res = cf("GET", "/accounts", token=token)
        accs = res.get("result") or []
        if not accs:
            print("no account visible with this token:", st, json.dumps(res)[:300])
            return 1
        account_id = accs[0]["id"]
        print("account:", account_id, accs[0].get("name"))

    # ۲) آپلود ورکر + سکرت‌ها
    src = open(WORKER_SRC, "rb").read()
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": "2026-01-01",
        "bindings": [
            {"type": "secret_text", "name": "TGCLOUD_TOKEN", "text": tgcloud_token},
            {"type": "secret_text", "name": "CRON_SECRET", "text": cron_secret},
        ],
    }
    body, ctype = multipart({"metadata": json.dumps(metadata)}, [("worker.js", "worker.js", src, "application/javascript+module")])
    st, res = cf("PUT", f"/accounts/{account_id}/workers/scripts/{SCRIPT}", token=token, raw=body, ctype=ctype)
    print("upload:", st, "ok" if res.get("success") else json.dumps(res)[:400])
    if st >= 300:
        return 1

    # ۳) فعال‌سازی workers.dev
    st, res = cf("POST", f"/accounts/{account_id}/workers/scripts/{SCRIPT}/subdomain", {"enabled": True}, token=token)
    print("subdomain:", st, "ok" if res.get("success") else json.dumps(res)[:200])

    # ۴) زمان‌بند
    st, res = cf("PUT", f"/accounts/{account_id}/workers/scripts/{SCRIPT}/schedules", {"crons": CRONS}, token=token)
    print("schedule:", st, json.dumps(res.get("result", res))[:200])

    # ۵) آدرس نهایی
    st, res = cf("GET", f"/accounts/{account_id}/workers/subdomain", token=token)
    sub = (res.get("result") or {}).get("subdomain")
    url = f"https://{SCRIPT}.{sub}.workers.dev" if sub else None
    print("url:", url)

    # ۶) تست دستی
    if url:
        req = urllib.request.Request(url, method="POST", headers={"x-cron-key": cron_secret})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                print("test:", r.status, r.read().decode()[:400])
        except urllib.error.HTTPError as e:
            print("test failed:", e.code, e.read().decode()[:300])
    return 0


if __name__ == "__main__":
    sys.exit(main())
