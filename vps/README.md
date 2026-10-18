# زمان‌بند VPS برای ربات هشدار قیمت (tgcloud)

تا وقتی تریگر `schedule` گیت‌هاب غیرقابل‌اعتماد است، این زمان‌بند هر ۵ دقیقه چک قیمت را
از روی همان سورس‌های دیپلوی‌شده در کلاد اجرا می‌کند (بدون drift).

## نصب سریع

```bash
sudo curl -fsSL https://raw.githubusercontent.com/ehsankml/trdr-notif/main/vps/tgcloud-goldcheck.sh \
  -o /usr/local/bin/tgcloud-goldcheck
sudo chmod 755 /usr/local/bin/tgcloud-goldcheck

sudo tee /etc/tgcloud-goldcheck.env >/dev/null <<'EOF'
export TGCLOUD_TOKEN=app<APP_ID>:<SECRET>
export CRON_SECRET=<سکرت endpoints/check>
EOF
sudo chmod 600 /etc/tgcloud-goldcheck.env

sudo /usr/local/bin/tgcloud-goldcheck          # تست دستی

# کرون: دقیقه‌های ۱،۶،۱۱،... تا با ورک‌فلوی گیت‌هاب هم‌زمان نشود
( crontab -l 2>/dev/null; echo '4-59/5 * * * * /usr/local/bin/tgcloud-goldcheck >>/var/log/tgcloud-goldcheck.log 2>&1' ) | crontab -
```

نیاز: `curl` + (`jq` یا `python3`).
