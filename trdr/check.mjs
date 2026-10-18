import fs from 'node:fs';

const ALARMS = 'trdr/alarms.json';
const LAST   = 'trdr/last_price.json';

// ---- Asset definitions: each has a list of (url, parse) sources ----
const ASSETS = {
  XAU: {
    label: 'طلا (XAU/USD)',
    sources: [
      { url: 'https://api.gold-api.com/price/XAU', parse: j => typeof j?.price === 'number' ? j.price : null },
    ],
  },
  BTC: {
    label: 'بیت‌کوین (BTC/USD)',
    sources: [
      { url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot', parse: j => j?.data?.amount ? parseFloat(j.data.amount) : null },
      { url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', parse: j => j?.bitcoin?.usd ? parseFloat(j.bitcoin.usd) : null },
    ],
  },
  EUR: {
    label: 'یورو (EUR/USD)',
    sources: [
      { url: 'https://open.er-api.com/v6/latest/USD', parse: j => j?.rates?.EUR ? parseFloat(j.rates.EUR) : null },
      { url: 'https://api.frankfurter.app/latest?from=USD&to=EUR', parse: j => j?.rates?.EUR ? parseFloat(j.rates.EUR) : null },
    ],
  },
};

function crossed(prev, now, target) {
  if (prev == null || !isFinite(prev)) return false;
  if (prev === now) return false;
  if (prev === target || now === target) return true;
  return (prev < target && now > target) || (prev > target && now < target);
}
const fmt = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fetchAssetPrice(asset) {
  const def = ASSETS[asset];
  if (!def) throw new Error('unknown asset: ' + asset);
  for (const s of def.sources) {
    try {
      const r = await fetch(s.url, { headers: { accept: 'application/json' } });
      if (!r.ok) continue;
      const j = await r.json();
      const p = s.parse(j);
      if (typeof p === 'number' && isFinite(p) && p > 0) return p;
    } catch {}
  }
  throw new Error('price fetch failed for ' + asset);
}

async function send(chatId, text, token) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) console.error('sendMessage failed', j);
  return j.ok;
}

(async () => {
  const token = process.env.BOT_TOKEN;
  const owner = process.env.OWNER_ID;
  if (!token || !owner) { console.error('BOT_TOKEN/OWNER_ID missing'); process.exit(1); }

  let alarms = [];
  try { alarms = JSON.parse(fs.readFileSync(ALARMS, 'utf8')); } catch {}
  let last = {};
  try { last = JSON.parse(fs.readFileSync(LAST, 'utf8')); } catch {}

  const prices = {};
  for (const asset of Object.keys(ASSETS)) {
    try {
      prices[asset] = await fetchAssetPrice(asset);
      console.log(asset, prices[asset]);
    } catch (e) {
      console.error('SKIP', asset, e.message);
    }
  }

  const remaining = [];
  for (const a of alarms) {
    const asset = a.asset;
    const target = Number(a.target);
    const now = prices[asset];
    if (!asset || !isFinite(target) || now == null) { remaining.push(a); continue; }
    if (crossed(last[asset], now, target)) {
      const msg = `اسی، ${ASSETS[asset].label} *${fmt(target)}* رو رد کرد! (فعلی: *${fmt(now)}* دلار) 📢`;
      console.log('TRIGGER', asset, target, '->', now);
      await send(owner, msg, token);
      // one-shot alarm: dropped
    } else {
      remaining.push(a);
    }
  }

  fs.writeFileSync(LAST, JSON.stringify({ ...last, ...prices, updated_at: new Date().toISOString() }, null, 2) + '\n');
  if (remaining.length !== alarms.length) {
    fs.writeFileSync(ALARMS, JSON.stringify(remaining, null, 2) + '\n');
    console.log('alarms updated:', alarms.length, '->', remaining.length);
  }
})();