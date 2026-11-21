'use strict';
/* 示例: 任务 B41 新編「三川艦隊」ソロモン方面へ！(5-1 Boss S; 旗艦鳥海改二 + 古鷹/加古/青葉/衣笠/夕張/天龍 中 5 艘, 无自由位)
 * 路线(wikiwiki 5-1 分岐法則): 重巡級4+軽巡1 → B → C(資源) → F → G → J(Boss)
 * 结论(某中期账号实测模拟): G 点双タ級是瓶颈, 常规打法 S≈5~35%; 2~6 号带応急修理要員大破进击 + 全闪 + 双支援 S≈80%。
 *
 *   node examples/5-1-mikawa.js --virtual          不读库存, 用虚拟舰自检环境
 *   node examples/5-1-mikawa.js [--acct me]        读 accounts/me 的库存(需要有下列舰和装备, 没有就照着改)
 *   加 --deck 导出 deckbuilder 到 out/5-1-mikawa-deck.json; --sims N 改模拟次数
 */
const path = require('path'); const K = require('../lib/kit');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : d; };
const VIRTUAL = !!arg('virtual', false), SIMS = +arg('sims', 3000) || 3000;

const G3 = '20.3cm(3号)連装砲', G2 = '20.3cm(2号)連装砲', R33 = '33号対水上電探', R22 = '22号対水上電探', DC = '応急修理要員';
// 夕張改二特: 第4/5格不能装主砲·魚雷·甲標的, 第5格仅機銃/小型電探/糧食, 整舰不能装副砲 —— 导出时 fleethub 会校验
let INV = null;
const FLEET = (dc) => [
  ['鳥海改二', [G3, G3, '15.5cm三連装副砲', R33]],                       // 旗舰大破强制撤退且不会沉, 不带损管
  ['加古改二', [G3, G3, R33, dc && DC]],
  ['古鷹改二', [G2, G2, R33, dc && DC]],
  ['衣笠改二', [G2, G2, R22, dc && DC]],
  ['青葉改', [G2, G2, R22, dc && DC]],
  ['夕張改二特', ['15.2cm連装砲', '15.2cm連装砲', '甲標的 甲型', '強化型艦本式缶', R22, dc && (VIRTUAL || INV.hasEx('夕張改二特')) ? DC : null]], // 第6项=增设(没开孔就不带)
];
const SUPPORT_N = [['金剛改二', ['35.6cm連装砲', '35.6cm連装砲', R22, R22]], ['比叡改二', ['35.6cm連装砲', '35.6cm連装砲', R22, R22]], ['霧島改二', ['35.6cm連装砲', '35.6cm連装砲', R22, R22]], ['榛名改二', ['35.6cm連装砲', '35.6cm連装砲', R22, R22]], ['夕立改二', ['12.7cm連装砲', '12.7cm連装砲', R22]], ['時雨改二', ['12.7cm連装砲', '12.7cm連装砲', R22]]];
const SUPPORT_B = [['長門改', ['41cm連装砲', '41cm連装砲', R22, R22]], ['陸奥改', ['41cm連装砲', '41cm連装砲', R22, R22]], ['伊勢改', ['41cm連装砲', '41cm連装砲', R22, R22]], ['日向改', ['41cm連装砲', '41cm連装砲', R22, R22]], ['綾波改二', ['12.7cm連装砲', '12.7cm連装砲', R22]], ['潮改二', ['12.7cm連装砲', '12.7cm連装砲', R22]]];

(async () => {
  INV = VIRTUAL ? null : K.inventory(typeof arg('acct') === 'string' ? arg('acct') : undefined);
  const mk = (list, morale) => {
    if (VIRTUAL) return list.map(([n, e]) => K.virtualShip(n, e.map(x => x || null), { morale, lv: 80 }));
    const miss = []; const out = list.map(([n, e]) => { try { return INV.ship(n, e.map(x => x || null), { morale }); } catch (err) { miss.push(err.message); return null; } });
    if (miss.length) throw new Error('这份库存凑不出示例编成, 请按自己的库存改 FLEET / SUPPORT_N / SUPPORT_B:\n  ' + [...new Set(miss)].join('\n  '));
    return out;
  };
  const nodes = K.nodes('5-1', [['B', { form: 1 }], ['F', { form: 1 }], ['G', { form: 1 }], ['J', { form: 1, nb: 'always' }]]);

  const cases = [
    ['常规 无支援 不闪', { dc: false, morale: 49, sup: false }],
    ['常规 双支援 全闪', { dc: false, morale: 85, sup: true }],
    ['损管进击 双支援 全闪', { dc: true, morale: 85, sup: true }],
  ];
  let last = null;
  for (const [label, c] of cases) {
    if (INV) INV.reset();
    const ships = mk(FLEET(c.dc), c.morale); const sN = c.sup ? mk(SUPPORT_N, c.morale) : null, sB = c.sup ? mk(SUPPORT_B, c.morale) : null;
    const r = await K.run({ ships, nodes, sims: SIMS, supportN: sN, supportB: sB, damecon: c.dc ? { afterNode: 2 } : null }); // afterNode:2 = B/F 大破照撤, G 之后靠损管进
    K.report(label, r); last = { f1: ships, f2: sN, f3: sB };
  }
  if (arg('deck', false)) { const f = path.join(__dirname, '../out/5-1-mikawa-deck.json'); K.saveDeck(f, last); console.log('已导出(通过合法性校验):', f); }
})().catch(e => { console.error(e.message); process.exit(1); });
