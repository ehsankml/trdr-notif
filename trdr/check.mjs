import fs from 'node:fs';

const ALARMS = 'trdr/alarms.json';
const LAST   = 'trdr/last_price.json';

function crossed(prev, now, target) {
  if (prev == null || !isFinite(prev)) return false;
  if (prev === now) return false;
  if (prev === target) return true;
  if (now === target) return true;
  return (prev < target && now > target) || (prev > target && now < target);
}
const fmt = n => Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

async function getPrice() {
  // gold-api primary, fallback to metals-api style
  const urls = [
    { url: 'https://api.gold-api.com/price/XAU', parse: j => typeof j?.price==='number'?j.price:null },
  ];
  for (const s of urls) {
    try {
      const r = await fetch(s.url, { headers: { accept: 'application/json' } });
      if (!r.ok) continue;
      const j = await r.json();
      const p = s.parse(j);
      if (typeof p==='number' && p>0) return p;
    } catch {}
  }
  throw new Error('price fetch failed');
}

async function send(chatId, text, token) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
  const j = await r.json().catch(()=>({}));
  if (!j.ok) console.error('sendMessage failed', j);
  return j.ok;
}

(async () => {
  const token = process.env.BOT_TOKEN;
  const owner = process.env.OWNER_ID;
  if (!token || !owner) { console.error('BOT_TOKEN/OWNER_ID missing'); process.exit(1); }

  const price = await getPrice();
  console.log('price', price);

  let alarms = [];
  try { alarms = JSON.parse(fs.readFileSync(ALARMS,'utf8')); } catch {}
  let last = null;
  try { last = JSON.parse(fs.readFileSync(LAST,'utf8')).price; } catch {}

  console.log('prev', last, 'alarms', alarms.length);

  const remaining = [];
  for (const a of alarms) {
    const target = Number(a.target);
    if (!isFinite(target)) continue;
    if (crossed(last, price, target)) {
      const msg = `اسی، قیمت طلا *${fmt(target)}* رو رد کرد! (فعلی: *${fmt(price)}* دلار) 📢`;
      console.log('TRIGGER', target, '->', price);
      await send(owner, msg, token);
      // آلارم یک‌بارمصرف: حذف می‌شود (به remaining اضافه نمی‌کنیم)
    } else {
      remaining.push(a);
    }
  }

  // ذخیره وضعیت
  fs.writeFileSync(LAST, JSON.stringify({ price, updated_at: new Date().toISOString() }, null, 2) + '\n');
  if (remaining.length !== alarms.length) {
    fs.writeFileSync(ALARMS, JSON.stringify(remaining, null, 2) + '\n');
    console.log('alarms updated:', alarms.length, '->', remaining.length);
  }
})();
