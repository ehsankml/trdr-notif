#!/usr/bin/env bash
# tgcloud-goldcheck — اجرای endpoints/check ربات @Trdrnotifbot روی کلاد تلگرام
#
# چرا این اسکریپت: tgcloud کرون داخلی ندارد. این اسکریپت سورس‌های *دیپلوی‌شده* را از خود
# کلاد می‌گیرد (GET /manage/get) و همان‌ها را به /manage/run می‌دهد — پس هیچ کپی/دریفتی
# نسبت به نسخهٔ روی کلاد وجود ندارد (اگر کد را push کنی، این هم خودکار جدید می‌شود).
#
# نصب:
#   1) sudo install -m 755 tgcloud-goldcheck.sh /usr/local/bin/tgcloud-goldcheck
#   2) sudo tee /etc/tgcloud-goldcheck.env >/dev/null <<'EOF'
#      export TGCLOUD_TOKEN=app<APP_ID>:<SECRET>
#      export CRON_SECRET=<همان سکرتی که endpoints/check چک می‌کند>
#      EOF
#      sudo chmod 600 /etc/tgcloud-goldcheck.env
#   3) crontab -e  →  */5 * * * *  با یک دقیقهٔ جابه‌جا (۱،۶،۱۱،...) تا با ورک‌فلوی گیت‌هاب هم‌زمان نشود:
#      echo '1-59/5 * * * * /usr/local/bin/tgcloud-goldcheck >>/var/log/tgcloud-goldcheck.log 2>&1' | crontab -
#   4) تست: sudo /usr/local/bin/tgcloud-goldcheck

set -euo pipefail

ENV_FILE="${TGCLOUD_CHECK_ENV:-/etc/tgcloud-goldcheck.env}"
[ -r "$ENV_FILE" ] || { echo "env file not readable: $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE"

: "${TGCLOUD_TOKEN:?TGCLOUD_TOKEN missing}"
: "${CRON_SECRET:?CRON_SECRET missing}"

APP_ID="${TGCLOUD_TOKEN%%:*}"
BASE="https://cloud.telegram.org/${APP_ID}/manage"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ۱) سورس‌های دیپلوی‌شده روی کلاد
curl -sS -f -m 30 -H "Authorization: Bearer ${TGCLOUD_TOKEN}" "${BASE}/get" -o "$TMP/get.json"

# ۲) ساخت بدنهٔ درخواست run (jq اگر بود، وگرنه python3)
if command -v jq >/dev/null 2>&1; then
  jq -e '.ok == true' "$TMP/get.json" >/dev/null
  jq --arg s "${CRON_SECRET}" \
    '{module:"endpoints/check", sources:.result.canonical_modules, args:{secret:$s}, ctx:{}}' \
    "$TMP/get.json" > "$TMP/run.json"
elif command -v python3 >/dev/null 2>&1; then
  CRON_SECRET="${CRON_SECRET}" python3 - "$TMP" <<'PY'
import json, os, sys
out = sys.argv[1]
d = json.load(open(os.path.join(out, 'get.json')))
assert d.get('ok') is True, d
body = {
    'module': 'endpoints/check',
    'sources': d['result']['canonical_modules'],
    'args': {'secret': os.environ['CRON_SECRET']},
    'ctx': {},
}
json.dump(body, open(os.path.join(out, 'run.json'), 'w'))
PY
else
  echo "needs jq or python3" >&2; exit 1
fi

# ۳) اجرا
HTTP="$(curl -sS -m 60 -o "$TMP/out.json" -w '%{http_code}' -X POST "${BASE}/run" \
  -H "Authorization: Bearer ${TGCLOUD_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data-binary @"$TMP/run.json")"

echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') http ${HTTP} $(head -c 400 "$TMP/out.json")"

case "$HTTP" in
  2*) ;;
  *) echo "run failed with http ${HTTP}" >&2; exit 1 ;;
esac
