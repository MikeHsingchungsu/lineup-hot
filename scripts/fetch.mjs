// 抓 Tinybook 前台可預約時段 → docs/slots.json
// 熱門區間：平日（一～五）完整落在 14:30–21:30 內的時段，未來 7 天
import { writeFileSync } from 'node:fs';

const BASE = 'https://tinybot.cc/lineup';
const DAYS_AHEAD = 7;
const HOT_START = 1430; // 含
const HOT_END = 2130;   // 時段須在此前結束
const WEEKDAYS = [1, 2, 3, 4, 5];
const SLOT_MIN = 60;

const SPACES = [
  {
    key: 'space1', name: '空間 1・三玉宮',
    // 三個方案共用同一空間，任一有時段即有空
    plans: [
      { label: '1–5 人', id: '965259', slug: '%E7%A9%BA%E9%96%93-1' },
      { label: '6–10 人', id: '7452591', slug: '%E7%A9%BA%E9%96%93-1-6-10%E4%BA%BA%E9%80%B2%E5%A0%B4%EF%BC%89' },
      { label: '10–15 人', id: '7452592', slug: '%E7%A9%BA%E9%96%93-1-10-15%E4%BA%BA%E9%80%B2%E5%A0%B4%EF%BC%89' },
    ],
  },
  {
    key: 'space4', name: '空間 4・天母棒球場',
    plans: [
      { label: '1–5 人', id: '13814296', slug: '%E7%A9%BA%E9%96%93-4-1-5%E4%BA%BA%E9%80%B2%E5%A0%B4%EF%BC%89' },
    ],
  },
];

function taipeiNow() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' });
  return new Date(s.replace(' ', 'T') + 'Z'); // 以 UTC 物件承載台北牆鐘時間
}
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

async function getSlots(productId, d) {
  const form = new URLSearchParams({
    'add-to-cart': productId,
    wc_appointments_field_start_date_year: String(d.getUTCFullYear()),
    wc_appointments_field_start_date_month: String(d.getUTCMonth() + 1),
    wc_appointments_field_start_date_day: String(d.getUTCDate()),
    wc_appointments_field_start_date_time: '',
  }).toString();
  const body = new URLSearchParams({ action: 'wc_appointments_get_slots', duration: '0', form });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${BASE}/wp-admin/admin-ajax.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (LINEUP hot-slots)' },
        body,
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await r.text();
      return [...html.matchAll(/data-slot="(\d{4})"/g)].map((m) => m[1]);
    } catch (e) {
      if (attempt === 1) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const toMin = (hhmm) => Math.floor(hhmm / 100) * 60 + (hhmm % 100);
const fmt = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

async function main() {
  const now = taipeiNow();
  const nowHHMM = now.getUTCHours() * 100 + now.getUTCMinutes();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const days = [];
  let errors = 0;

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    if (!WEEKDAYS.includes(d.getUTCDay())) continue;
    const date = ymd(d);
    const slots = [];
    for (const sp of SPACES) {
      const set = new Set();
      for (const p of sp.plans) {
        try { (await getSlots(p.id, d)).forEach((s) => set.add(s)); }
        catch (e) { errors++; console.error(sp.name, p.label, date, e.message); }
      }
      for (const s of [...set].sort()) {
        const n = Number(s);
        if (n < HOT_START || toMin(n) + SLOT_MIN > toMin(HOT_END)) continue;
        if (i === 0 && n <= nowHHMM) continue;
        const st = toMin(n);
        slots.push({
          space: sp.key, name: sp.name, start: fmt(st), end: fmt(st + SLOT_MIN),
          links: sp.plans.map((p) => ({ label: p.label, url: `${BASE}/product/${p.slug}/?date=${date}&time=${s}` })),
        });
      }
    }
    slots.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
    days.push({ date, weekday: d.getUTCDay(), slots });
  }

  const totalCalls = days.length * SPACES.reduce((a, s) => a + s.plans.length, 0);
  if (totalCalls > 0 && errors === totalCalls) {
    console.error('全部請求失敗，保留舊資料');
    process.exit(1);
  }
  const out = { updated: `${ymd(now)} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`, days };
  writeFileSync(new URL('../docs/slots.json', import.meta.url), JSON.stringify(out, null, 1));
  console.log('ok', out.updated, days.map((d) => `${d.date}:${d.slots.length}`).join(' '));
}
main();
