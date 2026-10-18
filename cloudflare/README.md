# زمان‌بند Cloudflare Worker (جایگزین مطمئن GitHub schedule)

تریگر زمان‌بند گیت‌هاب برای این ریپو عملاً هیچ اجرایی نداشت (فقط `workflow_dispatch` سبز می‌شد)،
پس زمان‌بند اصلی رفت روی **Cloudflare Worker + Cron Trigger**:
کاملاً آنلاین، رایگان، بدون درگیری گوشی، و بدون مصرف دقیقه‌های Actions.

ورکر هر ۵ دقیقه (دقیقه‌های ۱،۶،۱۱،…):

1. `GET https://cloud.telegram.org/<app_id>/manage/get` → سورس‌های **دیپلوی‌شده** روی کلاد
2. `POST .../manage/run` با همان سورس‌ها و `module=endpoints/check`

یعنی هیچ کد کپی‌شده‌ای اینجا نگه‌داری نمی‌شود و هیچ drift نسبت به نسخهٔ روی کلاد وجود ندارد.

- نام ورکر: `trdr-goldcheck`
- آدرس: `https://trdr-goldcheck.<subdomain>.workers.dev`
- رازها: `TGCLOUD_TOKEN` و `CRON_SECRET`
- کرون: `1-59/5 * * * *` (با ورک‌فلوی گیت‌هاب که `*/5` است هم‌زمان نمی‌شود)
- تست دستی: `curl -X POST <url> -H "x-cron-key: $CRON_SECRET"`
- سلامت: `GET <url>/health`

## دیپلوی / به‌روزرسانی

```bash
export CF_API_TOKEN=...            # Account > Workers Scripts > Edit
export TGCLOUD_TOKEN=app...:...    # توکن کلاد تلگرام
export CRON_SECRET=...
python3 deploy.py <account_id>
```

نکته: API زمان‌بندِ Cloudflare بدنهٔ آرایه‌ای می‌خواهد: `[{"cron":"1-59/5 * * * *"}]`
(شکل `{"crons":[...]}` خطای `10026 Could not parse request body` می‌دهد).
