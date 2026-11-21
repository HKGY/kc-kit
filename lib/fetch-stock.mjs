// 用法: node lib/fetch-stock.mjs <kc-web 库存分享短链ID 或 stockid> accounts/<账号名>/stock-<日期>.json
// kc-web(制空権シミュレータ) 舰娘/装备页「共有」生成 kc.noro6.net/s/XXXX, XXXX 即短链ID。分享只含已锁定的舰。
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const LZ = require('../kancolle-replay/reader/lz-string.js');
const API_KEY = 'AIzaSyC_rEnvKFFlZv54xvxP8MXPht081xYol4s';
let key = process.argv[2]; const out = process.argv[3] || 'stock.json';
if (!key) { console.error('用法: node lib/fetch-stock.mjs <短链ID> <输出.json>'); process.exit(1); }
if (!key.includes('-') && key.length < 12) {
  const r = await fetch(`https://kc.noro6.net/s/${key}`, { redirect: 'manual' });
  const loc = r.headers.get('location') || '';
  const m = loc.match(/stockid=([^&]+)/); if (!m) throw new Error('no stockid in ' + loc + ' status ' + r.status);
  key = decodeURIComponent(m[1]);
}
const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }).then(r => r.json());
const tok = auth.idToken; if (!tok) throw new Error(JSON.stringify(auth));
const data = await fetch(`https://development-74af0.firebaseio.com/stocks/${key}.json?auth=${tok}`).then(r => r.json());
if (!data) throw new Error('empty stock ' + key);
const ships = JSON.parse(LZ.decompressFromEncodedURIComponent(data.ships) || '[]');
const items = JSON.parse(LZ.decompressFromEncodedURIComponent(data.items) || '[]');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ key, date: data.date, ships, items }, null, 0));
console.log('stockid', key, 'date', data.date, 'ship entries', ships.reduce((a, s) => a + s[1].length, 0), 'item ids', items.length);
