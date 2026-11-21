'use strict';
/* lib/fh.js — fleethub-core(作戦室 jervis 同核) 无头入口
 *   const { core, master, mkShip, canEquip, checkDeck } = require('./lib/fh');
 *   mkShip(623, 97, [407, [139, 2], 41], { gx: 42, luck: 30 })   // 装备: id 或 [id, ★]
 *   canEquip(623, 58, 'g4') → false   (含逐格位规则: 夕張改二系第4/5格、改二補形态等)
 * CLI:
 *   node lib/fh.js update                 重新下载主数据 master_data.json (brotli)
 *   node lib/fh.js check <deckbuilder.json>  逐舰逐格校验装备合法性, 有非法项退出码 1
 */
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const MASTER = path.join(__dirname, '../data/fleethub_master.json');
const URL_MASTER = 'https://storage.googleapis.com/kcfleethub/data/master_data.json';

async function update() {
  const res = await fetch(URL_MASTER); if (!res.ok) throw new Error('下载失败 ' + res.status);
  let buf = Buffer.from(await res.arrayBuffer());
  try { buf = zlib.brotliDecompressSync(buf); } catch (e) { /* fetch 已自动解压 */ }
  const m = JSON.parse(buf); fs.mkdirSync(path.dirname(MASTER), { recursive: true }); fs.writeFileSync(MASTER, buf);
  return m;
}

let _core = null, _master = null;
function load() {
  if (_core) return;
  const { FhCore } = require('fleethub-core');
  _master = JSON.parse(fs.readFileSync(MASTER, 'utf8')); _core = new FhCore(_master);
}
const KEYS = ['g1', 'g2', 'g3', 'g4', 'g5'];
const gearState = e => (e == null ? undefined : Array.isArray(e) ? { gear_id: e[0], stars: e[1] || 0, ...(e[2] != null ? { exp: e[2] } : {}) } : { gear_id: e });
/** 造舰: equips 按格位顺序, opt.gx=增设, opt.luck=运(绝对值) */
function mkShip(shipId, level, equips = [], opt = {}) {
  load(); const st = { ship_id: shipId, level };
  equips.forEach((e, i) => { const g = gearState(e); if (g) st[KEYS[i]] = g; });
  if (opt.gx != null) st.gx = gearState(opt.gx);
  const ship = _core.create_ship(st); if (!ship) throw new Error('无此舰 ' + shipId);
  return ship;
}
const shipName = id => { load(); const s = _master.ships.find(x => x.ship_id === id); return s ? s.name : '#' + id; };
const gearName = id => { load(); const g = _master.gears.find(x => x.gear_id === id); return g ? g.name : '#' + id; };
/** key: g1..g5 / gx */
function canEquip(shipId, gearId, key) {
  load(); const tmp = _core.create_ship({ ship_id: shipId, level: 99, g1: { gear_id: gearId } });
  const ship = _core.create_ship({ ship_id: shipId, level: 99 }); const gear = tmp && tmp.get_gear ? tmp.get_gear('g1') : null;
  if (!ship || !gear) throw new Error(`canEquip: 无法构造 ${shipId}/${gearId}`);
  return ship.can_equip(gear, key);
}
/** deckbuilder v4 JSON → 非法项列表 [{fleet, pos, ship, key, gear}] */
function checkDeck(deck) {
  load(); const bad = [];
  for (const f of ['f1', 'f2', 'f3', 'f4']) for (const [sk, s] of Object.entries(deck[f] || {})) {
    if (!s || !s.id) continue; const nslot = (_master.ships.find(x => x.ship_id === s.id) || {}).slotnum;
    for (const [ik, it] of Object.entries(s.items || {})) {
      if (!it || !it.id) continue; const key = ik === 'ix' ? 'gx' : 'g' + ik.slice(1);
      let ok; try { ok = canEquip(s.id, it.id, key); } catch (e) { ok = false; }
      if (ok && key !== 'gx' && nslot != null && +ik.slice(1) > nslot) ok = false;
      if (!ok) bad.push({ fleet: f, pos: sk, ship: shipName(s.id), key, gear: gearName(it.id) });
    }
  }
  return bad;
}
module.exports = { get core() { load(); return _core; }, get master() { load(); return _master; }, mkShip, canEquip, checkDeck, shipName, gearName, update };

if (require.main === module) (async () => {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'update') { const m = await update(); console.log('master_data.json 已更新: 舰', m.ships.length, '装备', m.gears.length, '数据时间', new Date(m.created_at).toISOString().slice(0, 10)); }
  else if (cmd === 'check') { const bad = checkDeck(JSON.parse(fs.readFileSync(arg, 'utf8'))); if (!bad.length) console.log('全部合法'); else { for (const b of bad) console.log(`非法 ${b.fleet} ${b.pos} ${b.ship} ${b.key}: ${b.gear}`); process.exit(1); } }
  else console.log('用法: node lib/fh.js update | check <deckbuilder.json>');
})().catch(e => { console.error(e.message); process.exit(2); });
