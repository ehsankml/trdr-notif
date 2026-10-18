// Cloudflare Worker — زمان‌بند چک قیمت ربات @Trdrnotifbot (tgcloud)
//
// cron trigger: دقیقه‌های ۱،۶،۱۱،… هر ۵ دقیقه (با ورک‌فلوی گیت‌هاب تداخل نکند)
// رازها (Worker secrets): TGCLOUD_TOKEN، CRON_SECRET
// تست دستی: POST به آدرس ورکر با هدر x-cron-key: <CRON_SECRET>
//
// کار: سورس‌های *دیپلوی‌شده* روی کلاد تلگرام را می‌گیرد و همان‌ها را اجرا می‌کند → بدون drift.

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'trdr-goldcheck', at: new Date().toISOString() });
    }
    const key = req.headers.get('x-cron-key') || '';
    if (key !== env.CRON_SECRET) return new Response('forbidden', { status: 403 });
    return json(await run(env));
  },
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

async function run(env) {
  const started = Date.now();
  try {
    const appId = String(env.TGCLOUD_TOKEN).split(':')[0];
    const base = `https://cloud.telegram.org/${appId}/manage`;
    const auth = { Authorization: `Bearer ${env.TGCLOUD_TOKEN}` };

    // ۱) سورس‌های دیپلوی‌شده (همان چیزی که روی کلاد اجرا می‌شود)
    const gres = await fetch(`${base}/get`, { headers: auth });
    const gj = await gres.json();
    if (!gres.ok || !gj || gj.ok !== true) {
      return { ok: false, step: 'get', http: gres.status, body: gj, ms: Date.now() - started };
    }

    // ۲) اجرای endpoints/check با همان سورس‌ها
    const body = {
      module: 'endpoints/check',
      sources: gj.result.canonical_modules,
      args: { secret: env.CRON_SECRET },
      ctx: {},
    };
    const rres = await fetch(`${base}/run`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const rj = await rres.json().catch(() => ({}));
    return {
      ok: rres.ok && rj && rj.ok === true,
      http: rres.status,
      revision: gj.result.revision,
      result: rj && rj.result ? rj.result.result : null,
      error: rj && rj.ok === false ? rj : null,
      ms: Date.now() - started,
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), ms: Date.now() - started };
  }
}
