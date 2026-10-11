// 三角形の計算（ブラウザ・Node 共通、外部ライブラリなし）。tests/test.js で検算している
(function (root) {
  'use strict';
  // ---- 角度の読み取りと表示 ----
  const RAD = Math.PI / 180;
  // 「35」「35.5」「35°30′15″」「35°30'15"」「35 30 15」「35度30分15秒」を度に直す。読めなければ NaN
  function parseAngle(s) {
    s = String(s).trim().replace(/[，,]/g, '.').replace(/[０-９．－]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    if (s === '') return null;
    const neg = /^-/.test(s);
    const parts = s.replace(/^-/, '').split(/[°度′'’分″"”秒\s]+/).filter(p => p !== '');
    if (!parts.length || parts.length > 3 || !parts.every(p => /^\d+(\.\d+)?$|^\.\d+$/.test(p))) return NaN;
    const [d, m = 0, sec = 0] = parts.map(Number);
    if (parts.length > 1 && (m >= 60 || sec >= 60)) return NaN;
    const v = d + m / 60 + sec / 3600;
    return neg ? -v : v;
  }
  function parseLen(s) {
    s = String(s).trim().replace(/[０-９．－]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/,/g, '');
    if (s === '') return null;
    return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) ? Number(s) : NaN;
  }
  // 度分秒の表示（秒は小数 sd 桁）
  function toDMS(deg, sd = 2) {
    const neg = deg < 0; let a = Math.abs(deg);
    let d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = +((mf - m) * 60).toFixed(sd);
    if (s >= 60) { s = 0; m++; } if (m >= 60) { m = 0; d++; }
    return `${neg ? '−' : ''}${d}° ${String(m).padStart(2, '0')}′ ${s.toFixed(sd).padStart(sd ? sd + 3 : 2, '0')}″`;
  }

  // ---- 一般三角形 ----
  // s[i]：辺、g[i]：角（度、s[i] の対角）。null は未知。解の配列を返す（0〜2 個）か、{error}
  function solveTriangle(sIn, gIn) {
    const s = sIn.slice(), g = gIn.slice();
    const ns = s.filter(v => v != null).length, ng = g.filter(v => v != null).length;
    if (s.some(v => v != null && !(v > 0))) return { error: '辺の長さは正の数で入れてください。' };
    if (g.some(v => v != null && !(v > 0 && v < 180))) return { error: '角度は 0° より大きく 180° より小さい値で入れてください。' };
    if (ns + ng < 3) return { error: `あと ${3 - ns - ng} つ値を入れてください。` };
    if (ns + ng > 3) return { error: '値が 4 つ以上入っています。わかっている値を 3 つだけ残してください（多いと矛盾することがあるため）。' };
    if (ns === 0) return { error: '角だけでは大きさが決まりません。辺を 1 つ以上入れてください。' };
    const sin = d => Math.sin(d * RAD), cos = d => Math.cos(d * RAD);
    const acosD = x => Math.acos(Math.max(-1, Math.min(1, x))) / RAD;
    const finish = (s, g) => {
      const area = 0.5 * s[1] * s[2] * sin(g[0]), per = s[0] + s[1] + s[2];
      return { s, g, area, per, R: s[0] / (2 * sin(g[0])), r: 2 * area / per,
        h: s.map(v => 2 * area / v),
        m: s.map((v, i) => 0.5 * Math.sqrt(2 * s[(i + 1) % 3] ** 2 + 2 * s[(i + 2) % 3] ** 2 - v * v)) };
    };
    // 3 辺から角（余弦定理）
    const fromSides = s => [0, 1, 2].map(i => acosD((s[(i + 1) % 3] ** 2 + s[(i + 2) % 3] ** 2 - s[i] ** 2) / (2 * s[(i + 1) % 3] * s[(i + 2) % 3])));
    if (ns === 3) {
      const [a, b, c] = s, mx = Math.max(a, b, c);
      if (mx >= a + b + c - mx) return { error: '三角形になりません。いちばん長い辺は、残り 2 辺の和より短い必要があります。' };
      return [finish(s, fromSides(s))];
    }
    if (ng === 2) {
      const k = g.findIndex(v => v == null);
      g[k] = 180 - g[(k + 1) % 3] - g[(k + 2) % 3];
      if (!(g[k] > 1e-12)) return { error: '2 つの角の和が 180° 以上なので三角形になりません。' };
      const j = s.findIndex(v => v != null), k2 = s[j] / sin(g[j]);
      return [finish([0, 1, 2].map(i => i === j ? s[i] : k2 * sin(g[i])), g)];
    }
    // 角 1 つ・辺 2 つ
    const i = g.findIndex(v => v != null);
    if (s[i] == null) {
      // 挟む角（二辺挟角）：余弦定理で残りの辺
      s[i] = Math.sqrt(s[(i + 1) % 3] ** 2 + s[(i + 2) % 3] ** 2 - 2 * s[(i + 1) % 3] * s[(i + 2) % 3] * cos(g[i]));
      const gg = fromSides(s); gg[i] = g[i];
      return [finish(s, gg)];
    }
    // 挟まない角（二辺と対角）：解が 0・1・2 個
    const j = s.findIndex((v, k) => v != null && k !== i), k = 3 - i - j;
    const sj = s[j] * sin(g[i]) / s[i];
    if (sj > 1 + 1e-12) return { error: `この値では三角形になりません（辺 ${'abc'[i]} が短すぎて、角 ${'ABC'[i]} の向かいに届きません）。` };
    const cands = Math.abs(sj - 1) <= 1e-12 ? [90] : [Math.asin(sj) / RAD, 180 - Math.asin(sj) / RAD];
    const out = [];
    for (const gj of cands) {
      const gk = 180 - g[i] - gj;
      if (!(gk > 1e-9)) continue;
      const ss = s.slice(), gg = g.slice();
      gg[j] = gj; gg[k] = gk; ss[k] = s[i] * sin(gk) / sin(g[i]);
      out.push(finish(ss, gg));
    }
    if (!out.length) return { error: 'この値では三角形になりません（角の和が 180° を超えます）。' };
    return out;
  }

  // ---- 直角三角形 ----
  // x：底辺、y：高さ、r：斜辺、t：底辺と斜辺の角（度）。わかっている 2 つから残り
  function solveRight({ x, y, r, t }) {
    const nl = [x, y, r].filter(v => v != null).length, na = t != null ? 1 : 0;
    if ([x, y, r].some(v => v != null && !(v > 0))) return { error: '長さは正の数で入れてください。' };
    if (na && !(t > 0 && t < 90)) return { error: '角度 θ は 0° より大きく 90° より小さい値で入れてください。' };
    if (nl + na < 2) return { error: `あと ${2 - nl - na} つ値を入れてください。` };
    if (nl + na > 2) return { error: '値が 3 つ以上入っています。わかっている値を 2 つだけ残してください。' };
    if (!nl) return { error: '長さを 1 つ以上入れてください。' };
    if (na) {
      const c = Math.cos(t * RAD), s = Math.sin(t * RAD);
      if (x != null) { r = x / c; y = x * Math.tan(t * RAD); }
      else if (y != null) { r = y / s; x = y / Math.tan(t * RAD); }
      else { x = r * c; y = r * s; }
    } else {
      if (r != null && ((x != null && x >= r) || (y != null && y >= r))) return { error: '斜辺は底辺・高さより長い必要があります。' };
      if (r == null) r = Math.hypot(x, y);
      else if (x == null) x = Math.sqrt(r * r - y * y);
      else y = Math.sqrt(r * r - x * x);
      t = Math.atan2(y, x) / RAD;
    }
    return { x, y, r, t, area: x * y / 2, grade: y / x * 100, n: x / y };
  }

  // ---- テーパー ----
  // D：大径、d：小径、L：長さ、a：全角（度）。3 つから残り 1 つ
  function solveTaper({ D, d, L, a }) {
    const n = [D, d, L, a].filter(v => v != null).length;
    if (n < 3) return null;
    if (n > 3) return { error: '4 つとも入っています。3 つだけ残してください。' };
    if ([D, L].some(v => v != null && !(v > 0)) || (d != null && !(d >= 0))) return { error: '大径・長さは正の数、小径は 0 以上で入れてください。' };
    if (a != null && !(a > 0 && a < 180)) return { error: 'テーパー角は 0° より大きく 180° より小さい値で入れてください。' };
    const tn = v => Math.tan(v / 2 * RAD);
    if (a == null) {
      if (!(D > d)) return { error: '大径は小径より大きい必要があります。' };
      a = 2 * Math.atan((D - d) / (2 * L)) / RAD;
    } else if (D == null) D = d + 2 * L * tn(a);
    else if (d == null) { d = D - 2 * L * tn(a); if (d < -1e-12) return { error: 'この長さと角度では小径が負になります。' }; d = Math.max(0, d); }
    else { if (!(D > d)) return { error: '大径は小径より大きい必要があります。' }; L = (D - d) / (2 * tn(a)); }
    return { D, d, L, a, half: a / 2, ratio: (D - d) / L, inv: L / (D - d) };
  }

  // ---- 座標 ----
  const dirDeg = (p, q) => { const v = Math.atan2(q[1] - p[1], q[0] - p[0]) / RAD; return v < 0 ? v + 360 : v; };
  function coord2(p, q) {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    return { dx, dy, dist: Math.hypot(dx, dy), dir: dirDeg(p, q), grade: dx !== 0 ? dy / dx * 100 : null };
  }
  function coord3(P) {
    const d = (i, j) => Math.hypot(P[j][0] - P[i][0], P[j][1] - P[i][1]);
    const cross = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]);
    const L = [d(1, 2), d(2, 0), d(0, 1)]; // 各点の向かいの辺
    if (L.some(v => v === 0)) return { error: '同じ座標の点があります。' };
    const area = Math.abs(cross) / 2;
    const ang = [0, 1, 2].map(i => {
      const a = P[(i + 1) % 3], b = P[(i + 2) % 3], o = P[i];
      const u = [a[0] - o[0], a[1] - o[1]], v = [b[0] - o[0], b[1] - o[1]];
      return Math.atan2(Math.abs(u[0] * v[1] - u[1] * v[0]), u[0] * v[0] + u[1] * v[1]) / RAD;
    });
    const per = L[0] + L[1] + L[2];
    return { L, ang, area, per, collinear: area <= 1e-12 * Math.max(1, per * per), ccw: cross > 0 };
  }

  const api = { RAD, parseAngle, parseLen, toDMS, solveTriangle, solveRight, solveTaper, dirDeg, coord2, coord3 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TriGeo = api;
})(typeof window !== 'undefined' ? window : globalThis);
