// 三角形の計算の検算（node tests/test.js）。不一致が1件でもあれば終了コード 1
// 参照値は教科書の例題の値と、別の解き方で求め直した値（例：二辺挟角で解いた3辺を三辺で解き直す）
const G = require('../js/geometry.js');
const RAD = Math.PI / 180;
let n = 0; const fails = [];
function check(name, got, exp, tol = 1e-9) {
  n++;
  const ok = got === exp || (typeof got === 'number' && typeof exp === 'number' && Math.abs(got - exp) <= tol * Math.max(1, Math.abs(exp)));
  if (!ok) fails.push(`${name}: 計算 ${got} / 期待 ${exp}`);
}
const same = (name, got, exp) => check(name, JSON.stringify(got), JSON.stringify(exp));

// ---- 一般三角形 ----
// 3-4-5（直角三角形）：角・面積・外接円・内接円・中線
{
  const r = G.solveTriangle([3, 4, 5], [null, null, null])[0];
  check('3-4-5 角C', r.g[2], 90); check('3-4-5 角A', r.g[0], Math.atan2(3, 4) / RAD);
  check('3-4-5 面積', r.area, 6); check('3-4-5 外接円R', r.R, 2.5); check('3-4-5 内接円r', r.r, 1);
  check('3-4-5 高さ(c)', r.h[2], 2.4); check('3-4-5 中線(a)', r.m[0], Math.sqrt(2 * 16 + 2 * 25 - 9) / 2);
}
// 正三角形
{
  const r = G.solveTriangle([2, 2, 2], [null, null, null])[0];
  [0, 1, 2].forEach(i => check(`正三角形 角${i}`, r.g[i], 60)); check('正三角形 面積', r.area, Math.sqrt(3));
}
// 二辺挟角：余弦定理の値、得た3辺で解き直して一致
{
  const r = G.solveTriangle([null, 120, 85], [35, null, null])[0];
  check('二辺挟角 a', r.s[0], Math.sqrt(120 ** 2 + 85 ** 2 - 2 * 120 * 85 * Math.cos(35 * RAD)));
  check('二辺挟角 角の和', r.g[0] + r.g[1] + r.g[2], 180);
  const r2 = G.solveTriangle(r.s, [null, null, null])[0];
  [0, 1, 2].forEach(i => check(`二辺挟角→三辺 角${i}`, r2.g[i], r.g[i]));
  check('二辺挟角 面積 = ½bc sinA', r.area, 0.5 * 120 * 85 * Math.sin(35 * RAD));
  check('二辺挟角 面積（ヘロン）', r.area, (() => { const [a, b, c] = r.s, s = (a + b + c) / 2; return Math.sqrt(s * (s - a) * (s - b) * (s - c)); })());
}
// 一辺両端角・二角と対辺
{
  const r = G.solveTriangle([10, null, null], [null, 50, 60])[0];
  check('二角 A', r.g[0], 70); check('二角 b（正弦定理）', r.s[1], 10 * Math.sin(50 * RAD) / Math.sin(70 * RAD));
  const r2 = G.solveTriangle([null, null, 7], [80, 40, null])[0];
  check('二角 C', r2.g[2], 60); check('二角 a', r2.s[0], 7 * Math.sin(80 * RAD) / Math.sin(60 * RAD));
}
// 二辺と挟まない角：2 解・1 解・直角ちょうど・解なし
{
  const r = G.solveTriangle([8, 10, null], [40, null, null]);
  check('2解 個数', r.length, 2);
  check('2解 B1', r[0].g[1], Math.asin(10 * Math.sin(40 * RAD) / 8) / RAD); check('2解 B2', r[1].g[1], 180 - Math.asin(10 * Math.sin(40 * RAD) / 8) / RAD);
  r.forEach((x, i) => { const y = G.solveTriangle(x.s, [null, null, null])[0]; check(`2解 ${i} 三辺で解き直した角A`, y.g[0], 40); });
  check('1解（a > b）', G.solveTriangle([12, 10, null], [40, null, null]).length, 1);
  const rr = G.solveTriangle([5, 10, null], [30, null, null]);
  check('直角ちょうど 個数', rr.length, 1); check('直角ちょうど B', rr[0].g[1], 90);
  check('解なし', !!G.solveTriangle([4, 10, null], [40, null, null]).error, true);
  check('鈍角で解なし（a ≤ b）', !!G.solveTriangle([9, 10, null], [100, null, null]).error, true);
}
// 入力の誤り
for (const [name, s, g] of [['三角不等式', [1, 2, 3], [null, null, null]], ['角だけ', [null, null, null], [60, 60, 60]], ['値が4つ', [3, 4, 5], [90, null, null]],
  ['値が2つ', [3, 4, null], [null, null, null]], ['角の和が180以上', [5, null, null], [100, 80, null]], ['負の辺', [-1, 2, 2], [null, null, null]], ['角180', [2, 2, null], [180, null, null]]]) {
  check(`エラー：${name}`, !!G.solveTriangle(s, g).error, true);
}

// ---- 直角三角形 ----
{
  let r = G.solveRight({ x: 3, y: 4 }); check('直角 3-4 斜辺', r.r, 5); check('直角 θ', r.t, Math.atan2(4, 3) / RAD); check('直角 面積', r.area, 6);
  check('直角 勾配%', r.grade, 400 / 3); check('直角 1:n', r.n, 0.75);
  r = G.solveRight({ x: 50, t: 15 }); check('直角 x+θ → y', r.y, 50 * Math.tan(15 * RAD)); check('直角 x+θ → r', r.r, 50 / Math.cos(15 * RAD));
  r = G.solveRight({ y: 3, r: 5 }); check('直角 y+r → x', r.x, 4);
  r = G.solveRight({ r: 10, t: 30 }); check('直角 r+θ → y', r.y, 5); check('直角 r+θ → x', r.x, 10 * Math.cos(30 * RAD));
  r = G.solveRight({ y: 1, t: 45 }); check('直角 y+θ → x', r.x, 1);
  check('エラー：斜辺が短い', !!G.solveRight({ x: 5, r: 4 }).error, true);
  check('エラー：θ=90', !!G.solveRight({ x: 5, t: 90 }).error, true);
  check('エラー：長さなし', !!G.solveRight({ t: 30 }).error, true);
}

// ---- テーパー ----
{
  const a = 2 * Math.atan(5 / 80) / RAD;
  let r = G.solveTaper({ D: 20, d: 15, L: 40 }); check('テーパー 1:x', r.inv, 8); check('テーパー 全角', r.a, a); check('テーパー 半角', r.half, a / 2);
  r = G.solveTaper({ d: 15, L: 40, a }); check('テーパー D', r.D, 20);
  r = G.solveTaper({ D: 20, L: 40, a }); check('テーパー d', r.d, 15);
  r = G.solveTaper({ D: 20, d: 15, a }); check('テーパー L', r.L, 40);
  // 1/50 テーパー（テーパーピン）：全角 ≒ 1.1458°
  r = G.solveTaper({ D: 10.2, d: 10, L: 10 }); check('テーパー 1/50 全角', r.a, 2 * Math.atan(0.01) / RAD); check('テーパー 1/50 比', r.inv, 50);
  check('テーパー 値が2つは null', G.solveTaper({ D: 20, d: 15 }), null);
  check('エラー：D ≤ d', !!G.solveTaper({ D: 10, d: 15, L: 40 }).error, true);
}

// ---- 角度の読み取り・表示 ----
check('角度 35°30′15″', G.parseAngle('35°30′15″'), 35 + 30 / 60 + 15 / 3600);
check("角度 35°30'", G.parseAngle("35°30'"), 35.5);
check('角度 35 30 15', G.parseAngle('35 30 15'), 35 + 30 / 60 + 15 / 3600);
check('角度 ３５度３０分（全角）', G.parseAngle('３５度３０分'), 35.5);
check('角度 小数', G.parseAngle('12.25'), 12.25);
check('角度 空欄', G.parseAngle(''), null);
check('角度 分が60以上は読まない', Number.isNaN(G.parseAngle('35 70')), true);
check('長さ 1,234.5', G.parseLen('1,234.5'), 1234.5);
check('長さ 読めない', Number.isNaN(G.parseLen('12a')), true);
same('度分秒 35.5041666…', G.toDMS(35 + 30 / 60 + 15 / 3600), '35° 30′ 15.00″');
same('度分秒 繰り上がり', G.toDMS(29.99999999), '30° 00′ 00.00″');

// ---- 座標 ----
{
  let c = G.coord2([0, 0], [100, 20]); check('2点 距離', c.dist, Math.hypot(100, 20)); check('2点 方向角', c.dir, Math.atan2(20, 100) / RAD); check('2点 勾配', c.grade, 20);
  check('2点 方向角（第3象限）', G.coord2([0, 0], [-1, -1]).dir, 225); check('2点 方向角（真下）', G.coord2([0, 0], [0, -5]).dir, 270);
  check('2点 垂直は勾配なし', G.coord2([1, 1], [1, 5]).grade, null);
  c = G.coord3([[0, 0], [100, 20], [40, 70]]);
  check('3点 面積（座標法）', c.area, Math.abs(100 * 70 - 20 * 40) / 2); check('3点 角の和', c.ang[0] + c.ang[1] + c.ang[2], 180); check('3点 反時計回り', c.ccw, true);
  const t = G.solveTriangle(c.L, [null, null, null])[0];
  [0, 1, 2].forEach(i => check(`3点 角${i}（三辺で解き直し）`, c.ang[i], t.g[i]));
  check('3点 一直線', G.coord3([[0, 0], [1, 1], [2, 2]]).collinear, true);
  check('3点 同じ点', !!G.coord3([[0, 0], [0, 0], [2, 2]]).error, true);
}

for (const f of fails) console.log('NG ' + f);
console.log(fails.length ? `${fails.length} 件不一致 / ${n} 件` : `全 ${n} 件一致`);
process.exitCode = fails.length ? 1 : 0;
