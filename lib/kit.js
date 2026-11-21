'use strict';
/* lib/kit.js — 无头加载 kancolle-replay 模拟内核 + 按 kc-web 库存搭舰队 + 跑统计 + 导出 deckbuilder
 *
 *   const K = require('../lib/kit');
 *   const inv = K.inventory('me');                         // 读 accounts/me/stock-*.json(最新)
 *   const ships = [ inv.ship('鳥海改二', ['20.3cm(3号)連装砲', '20.3cm(3号)連装砲', null, '応急修理要員'], { morale: 85 }), ... ];
 *   const nodes = K.nodes('5-1', [['B', {}], ['F', {}], ['G', {}], ['J', { nb: 'always' }]]);
 *   const r = await K.run({ ships, nodes, sims: 3000, supportN, supportB, smokeAt, damecon: { afterNode: 2 } });
 *   K.report('标签', r);  K.toDeck({ f1: ships, f2: supportN, f3: supportB })
 *
 * 舰名/装备名一律用游戏内日文原名(api_start2 的 api_name)。装备项: '名字' | ['名字', 指定★] | null(空格)。
 * 装备数组顺序 = 格位顺序; 超出该舰格数的第一项进增设(需库存里该舰已开孔)。
 */
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, 'kancolle-replay');

/* ---------- 模拟内核 ---------- */
let SB = null;
function sim() {
  if (SB) return SB;
  if (!fs.existsSync(path.join(REPO, 'js/kcsim.js'))) throw new Error('未找到 kancolle-replay, 先运行 ./setup.sh');
  const sb = { console: { log() {}, warn() {}, error: console.error.bind(console) }, setTimeout, clearTimeout, setInterval, clearInterval, Math, JSON, Date };
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  sb.navigator = { hardwareConcurrency: require('os').cpus().length }; // 内核读线程数, 无头给桩
  sb.fetch = url => { try { const t = fs.readFileSync(path.join(REPO, url), 'utf8'); return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); } catch (e) { return Promise.resolve({ ok: false }); } };
  // 装备蓝字(可见加成)表靠 XHR 加载; 不垫这个会静默失败 → 蓝字全丢、结果系统性偏低
  sb.XMLHttpRequest = class { open(_m, url) { this._url = url; } send() { this.response = fs.readFileSync(path.join(REPO, this._url), 'utf8'); this.onload && this.onload(); } };
  vm.createContext(sb);
  for (const f of ['js/kcSHIPDATA.js', 'js/kcEQDATA.js', 'js/kcENEMYCOMP.js', 'js/shared.js', 'js/kcships.js', 'js/kcsim.js', 'js/kcsimcombined.js', 'js/simulator-ui/common.js', 'js/simulator-ui/sim-interface.js'])
    vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), sb, { filename: f });
  vm.runInContext('initEQDATA()', sb);
  return (SB = sb);
}

/* ---------- 主数据 ---------- */
let MD = null;
function master() {
  if (MD) return MD;
  const f = path.join(ROOT, 'data/api_start2.json'); if (!fs.existsSync(f)) throw new Error('未找到 data/api_start2.json, 先运行 ./setup.sh');
  let a = JSON.parse(fs.readFileSync(f, 'utf8')); a = a.api_data || a;
  const MS = Object.fromEntries(a.api_mst_ship.map(s => [s.api_id, s])), MI = Object.fromEntries(a.api_mst_slotitem.map(s => [s.api_id, s]));
  const SID = {}, IID = {};
  for (const s of a.api_mst_ship) if (s.api_id < 1500 && !(s.api_name in SID)) SID[s.api_name] = s.api_id; // 只收我方舰
  for (const s of a.api_mst_slotitem) if (s.api_id < 1500 && !(s.api_name in IID)) IID[s.api_name] = s.api_id;
  return (MD = { MS, MI, SID, IID });
}
const shipId = n => { const { SID } = master(); if (typeof n === 'number') return n; if (!(n in SID)) throw new Error('舰名不存在(要日文原名): ' + n); return SID[n]; };
const itemId = n => { const { IID } = master(); if (typeof n === 'number') return n; if (!(n in IID)) throw new Error('装备名不存在(要日文原名): ' + n); return IID[n]; };
const shipName = id => (master().MS[id] || {}).api_name || '#' + id;
const itemName = id => (master().MI[id] || {}).api_name || '#' + id;
const PLANE_T2 = new Set([6, 7, 8, 9, 10, 11, 25, 26, 41, 45, 47, 48, 56, 57, 58, 59, 94]);
const isPlane = id => PLANE_T2.has(master().MI[id].api_type[2]);
const marryHP = h => (h < 30 ? 4 : h < 40 ? 5 : h < 50 ? 6 : h < 70 ? 7 : h < 90 ? 8 : 9);

/* ---------- 库存 ---------- */
/** 读 accounts/<acct>/stock-*.json 最新一份(由 lib/fetch-stock.mjs 生成)。同一 inventory 对象内装备按库存数量扣减, 不会超配。 */
function inventory(acct = process.env.KC_ACCT || 'me') {
  const dir = path.join(ROOT, 'accounts', acct);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^stock-.*\.json$/.test(f)).sort() : [];
  if (!files.length) throw new Error(`accounts/${acct}/ 下没有 stock-*.json, 先跑: node lib/fetch-stock.mjs <短链ID> accounts/${acct}/stock-<日期>.json`);
  const stock = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8'));
  const { MS } = master();
  const byMid = Object.fromEntries(stock.ships.map(([mid, lst]) => [mid, lst.slice().sort((x, y) => y[1] - x[1])]));
  const items = Object.fromEntries(stock.items.map(([mid, stars]) => [mid, stars])); // mid → [★0数, ★1数, ...]
  const used = {};
  function take(name, wantStar) {
    const mid = itemId(name); const stars = items[mid];
    if (!stars) throw new Error('库存无此装备: ' + itemName(mid));
    let star = -1;
    if (wantStar != null && (stars[wantStar] || 0) - (used[mid + '*' + wantStar] || 0) > 0) star = wantStar;
    if (star < 0) for (let s = stars.length - 1; s >= 0; s--) if ((stars[s] || 0) - (used[mid + '*' + s] || 0) > 0) { star = s; break; }
    if (star < 0) throw new Error('库存数量不够: ' + itemName(mid));
    used[mid + '*' + star] = (used[mid + '*' + star] || 0) + 1;
    return { masterId: mid, improve: star, proficiency: isPlane(mid) ? 7 : 0 };
  }
  /** opt: { morale=49, idx=0(同名第几艘, 按等级降序) } */
  function ship(name, equips = [], opt = {}) {
    const mid = shipId(name); const lst = byMid[mid];
    if (!lst || !lst.length) throw new Error('库存无此舰(注意改造形态要完全一致, 且分享只含已锁定舰): ' + shipName(mid));
    const [, lv, , st, , ex] = lst[opt.idx || 0]; const m = MS[mid]; // st = 近代化改修 [火,雷,空,甲,运,耐,潜]
    const nslot = m.api_slot_num + (ex ? 1 : 0);
    if (equips.length > nslot) throw new Error(`${m.api_name} 只有 ${m.api_slot_num} 格${ex ? '+增设' : '(未开增设)'}, 给了 ${equips.length} 件`);
    const eq = equips.map((e, i) => (e ? { ...(Array.isArray(e) ? take(e[0], e[1]) : take(e)), _slot: i < m.api_slot_num ? i + 1 : 'x' } : null)).filter(Boolean);
    const hp0 = m.api_taik[0]; const HP = Math.min(hp0 + (st[5] || 0) + (lv >= 100 ? marryHP(hp0) : 0), m.api_taik[1]);
    return { masterId: mid, LVL: lv, morale: opt.morale ?? 49, equips: eq, stats: { HP, FP: m.api_houg[0] + st[0], TP: m.api_raig[0] + st[1], AA: m.api_tyku[0] + st[2], AR: m.api_souk[0] + st[3], LUK: m.api_luck[0] + st[4] } };
  }
  const hasEx = (name, idx = 0) => { const l = byMid[shipId(name)] || []; return !!(l[idx] && l[idx][5]); };
  const has = name => { try { return !!(byMid[shipId(name)] || []).length; } catch (e) { return false; } };
  const count = name => { const s = items[itemId(name)] || []; return s.reduce((a, b) => a + b, 0); };
  const reset = () => { for (const k in used) delete used[k]; };
  function summary() {
    const rows = []; for (const [mid, lst] of Object.entries(byMid)) for (const s of lst) rows.push([shipName(+mid), s[1], s[5] ? '增设' : '']);
    rows.sort((a, b) => b[1] - a[1]);
    return { date: stock.date, ships: rows, items: Object.entries(items).map(([mid, st]) => [itemName(+mid), st.map((n, s) => (n ? (s ? `★${s}x${n}` : `x${n}`) : '')).filter(Boolean).join(' ')]) };
  }
  return { ship, has, hasEx, count, reset, summary, stock };
}

/** 虚拟舰(不依赖库存, 面板取满改修值): 用于复现他人配置或自检。opt: { lv=99, morale=49, star=0, luck } */
function virtualShip(name, equips = [], opt = {}) {
  const mid = shipId(name); const m = master().MS[mid]; const lv = opt.lv ?? 99; const hp0 = m.api_taik[0];
  const eq = equips.map((e, i) => { if (!e) return null; const id = itemId(Array.isArray(e) ? e[0] : e); return { masterId: id, improve: Array.isArray(e) ? e[1] || 0 : opt.star || 0, proficiency: isPlane(id) ? 7 : 0, _slot: i < m.api_slot_num ? i + 1 : 'x' }; }).filter(Boolean);
  return { masterId: mid, LVL: lv, morale: opt.morale ?? 49, equips: eq, stats: { HP: lv >= 100 ? Math.min(hp0 + marryHP(hp0), m.api_taik[1]) : hp0, FP: m.api_houg[1], TP: m.api_raig[1], AA: m.api_tyku[1], AR: m.api_souk[1], LUK: opt.luck ?? m.api_luck[0] } };
}

/* ---------- 节点 ---------- */
/** 常规海域敌编成取自内核自带 ENEMYCOMPS。spec: [['点名', {form, sub, air, nb, night, pick}], ...] 只列战斗点。
 *  form: 我方阵型 1単縦 2複縦 3輪形 4梯形 5単横 6警戒(仅活动图可用)
 *  sub:1 潜水点(不耗弹药——漏设会让 Boss 吃弹药惩罚, S 率虚低 20~30pp)   air:1 空袭点
 *  nb:'always' 必追夜战 | 'B' 等: 评价不足该档才追   night:1 开幕夜战点   pick:[编成序号] 只取部分敌编成 */
function nodes(map, spec) {
  const sb = sim(); const world = 'World ' + map.split('-')[0]; const C = (sb.ENEMYCOMPS[world] || {})[map];
  if (!C) throw new Error(`内核无 ${map} 敌编成数据`);
  return spec.map(([L, o]) => {
    o = o || {}; if (!C[L]) throw new Error(`${map} 无 ${L} 点 (可用: ${Object.keys(C).join(' ')})`);
    const n = { _node: L, fleetEComps: Object.entries(C[L]).filter(([k]) => !o.pick || o.pick.includes(+k)).map(([, p]) => ({ weight: 1, fleet: { ships: p.c.map(m => ({ masterId: m })), formation: p.f } })) };
    if (o.form) n.formationOverride = o.form; if (o.sub) n.noAmmo = 1; if (o.air) n.airRaid = 1; if (o.night) n.NBOnly = 1;
    if (o.nb) { n.doNB = 1; if (o.nb !== 'always') n.doNBCond = o.nb; }
    return n;
  });
}
function describeNodes(nds) { const sb = sim(); return nds.map(nd => `${nd._node}: ` + nd.fleetEComps.map(c => c.fleet.ships.map(s => (sb.SHIPDATA[s.masterId] || {}).name || s.masterId).join(', ')).join('\n   ')).join('\n'); }
function describeFleet(ships) { return ships.map(s => `${shipName(s.masterId)} Lv${s.LVL} [${s.equips.map(e => itemName(e.masterId) + (e.improve ? '★' + e.improve : '')).join(', ')}]`).join('\n'); }

/* ---------- 运行 ---------- */
/** o: { ships, nodes, sims=3000, formation=1, supportN, supportB, smokeAt(节点序号,1起), damecon:{afterNode, maxTaiha}, carryOverHP, extra }
 *  damecon: 带応急修理的大破舰可进击。afterNode=n 表示前 n 战大破仍照常撤退; maxTaiha: 带损管的大破舰数≥此值仍撤。旗舰大破强制撤退内核已建模。 */
function run(o) {
  const sb = sim(); const nds = JSON.parse(JSON.stringify(o.nodes));
  const data = { numSims: o.sims || 3000, fleetF: { formation: o.formation || 1, ships: o.ships }, nodes: nds, continueOnTaiha: 0, carryOverHP: o.carryOverHP ? 1 : 0, bucketHPPercent: 50, ...(o.extra || {}) };
  if (o.supportN) data.fleetSupportN = { formation: 1, ships: o.supportN };
  if (o.supportB) data.fleetSupportB = { formation: 1, ships: o.supportB };
  if (o.smokeAt) { nds[o.smokeAt - 1].useSmoke = 1; data.consts = { smokeChanceUseFormula: 1, ...sb.SIMCONSTS.smokeEst }; }
  if (o.damecon) { data.settingsFCF = { dameconNode: o.damecon.afterNode || 0 }; if (o.damecon.maxTaiha) data.dameconNumTaiha = o.damecon.maxTaiha; }
  return new Promise((resolve, reject) => {
    sb.SIM.resetStats();
    sb.SIM.runStats(JSON.parse(JSON.stringify(data)), msg => { if (msg.errors) return reject(new Error('模拟器报错: ' + JSON.stringify(msg.errors))); if (msg.result) resolve(msg.result); });
  });
}
/** 汇总: 最后一个节点视为 Boss */
function summarize(r) {
  const n = r.totalnum, b = r.nodes[r.nodes.length - 1];
  return { sorties: n, S: b.ranks.S / n, A: b.ranks.A / n, B: b.ranks.B / n, reach: b.num / n, SafterReach: b.ranks.S / Math.max(1, b.num),
    pass: r.nodes.slice(0, -1).map((x, i) => r.nodes[i + 1].num / Math.max(1, x.num)), dameconPerSortie: (r.totalDamecon || 0) / n,
    fuel: (r.totalFuelS + r.totalFuelR) / n, ammo: r.totalAmmoS / n, steel: r.totalSteelR / n, bauxite: (r.totalBauxS || 0) / n, buckets: r.totalBuckets / n };
}
function report(label, r) {
  const s = summarize(r), p = x => (100 * x).toFixed(1).padStart(5) + '%';
  console.log(label.padEnd(30), 'S', p(s.S), ' 到达Boss', p(s.reach), ' 到达后S', p(s.SafterReach), ' 各点通过', s.pass.map(p).join('/'), s.dameconPerSortie ? ` 损管/次 ${s.dameconPerSortie.toFixed(2)}` : '');
  return s;
}

/* ---------- deckbuilder ---------- */
/** { f1: ships, f2: ships, ... } → 艦隊シミュレーター&デッキビルダー v4 JSON (kc-web/airsim、作戦室均可读) */
function toDeck(fleets, hqlv = 120) {
  const deck = { version: 4, hqlv };
  for (const [fk, ships] of Object.entries(fleets)) if (ships) deck[fk] = Object.fromEntries(ships.map((sh, i) => {
    const items = {}; for (const e of sh.equips) { const it = { id: e.masterId, rf: e.improve || 0 }; if (e.proficiency) it.mas = e.proficiency; items[e._slot === 'x' ? 'ix' : 'i' + e._slot] = it; }
    return ['s' + (i + 1), { id: sh.masterId, lv: sh.LVL, luck: sh.stats.LUK, hp: sh.stats.HP, items }];
  }));
  return deck;
}
/** 写出 deckbuilder 文件; 先用 fleethub 做装备合法性校验, 有非法项抛错不写文件 */
function saveDeck(file, fleets) {
  const deck = toDeck(fleets); const bad = require('./fh').checkDeck(deck);
  if (bad.length) throw new Error('存在非法装备, 未导出:\n' + bad.map(b => `  ${b.fleet} ${b.pos} ${b.ship} ${b.key}: ${b.gear}`).join('\n'));
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, JSON.stringify(deck)); return deck;
}

module.exports = { sim, master, inventory, virtualShip, nodes, describeNodes, describeFleet, run, summarize, report, toDeck, saveDeck, shipId, itemId, shipName, itemName };

if (require.main === module) {
  const [cmd, acct] = process.argv.slice(2);
  if (cmd === 'stock') { const s = inventory(acct).summary(); console.log('库存时间', s.date, '| 舰', s.ships.length, '| 装备种类', s.items.length); console.log(s.ships.map(r => `${r[0]} ${r[1]}${r[2] ? '+' : ''}`).join(' | ')); console.log(); console.log(s.items.map(r => r.join(' ')).join(' | ')); }
  else if (cmd === 'enemy') console.log(describeNodes(nodes(acct, Object.keys(sim().ENEMYCOMPS['World ' + acct.split('-')[0]][acct]).map(L => [L, {}]))));
  else console.log('用法: node lib/kit.js stock [账号名]   列出库存\n      node lib/kit.js enemy 5-1        列出某海域各点敌编成');
}
