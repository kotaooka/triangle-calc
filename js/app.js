// 画面処理：入力の読み取り、作図（SVG）、ドラッグ、結果の表示、テーマ、オフライン対応
(function () {
  'use strict';
  const { RAD, parseAngle, parseLen, toDMS, solveTriangle, solveRight, solveTaper, dirDeg, coord2, coord3 } = window.TriGeo;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let DIG = 4;
  const f = v => v == null || !Number.isFinite(v) ? '―' : (Math.abs(v) < 0.5 * 10 ** -DIG ? 0 : v).toFixed(DIG);
  const fa = v => `${f(v)}°`;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2200); }
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境 */ } } };
  const msg = (el, kind, text) => { $(el).innerHTML = text ? `<div class="msg ${kind}">${esc(text)}</div>` : ''; };
  const copies = {};

  // ---- タブ ----
  const tabs = [...document.querySelectorAll('nav.tabs button')];
  function setTab(t) {
    tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== t; });
    store.set('sankaku-tab', t);
    render();
  }
  tabs.forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

  // ---- 作図（SVG） ----
  // pts：[[x, y], ...]（数学座標、Y 上向き）。拡大して余白つきで収める
  let frozen = null; // ドラッグ中は拡大率と位置を固定する（図が動いて頂点が指から逃げないように）
  const lastFrame = {};
  function frame(pts, W = 560, H = 320, padX = 96, padY = 50) {
    if (frozen) return frozen;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sc = Math.min((W - 2 * padX) / Math.max(x1 - x0, 1e-12), (H - 2 * padY) / Math.max(y1 - y0, 1e-12));
    const ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
    return { W, H, sc, span: Math.max(x1 - x0, y1 - y0), P: p => [ox + (p[0] - x0) * sc, H - (oy + (p[1] - y0) * sc)], inv: q => [x0 + (q[0] - ox) / sc, y0 + (H - q[1] - oy) / sc] };
  }
  // ドラッグ用のつまみ（見た目の ○ と、指で触りやすい大きめの当たり判定）
  function handles(V, idx) {
    const acc = css('--accent'), sf = css('--surface');
    return idx.map(i => `<circle cx="${V[i][0]}" cy="${V[i][1]}" r="6" fill="${sf}" stroke="${acc}" stroke-width="2.2" pointer-events="none"/><circle class="hd" data-v="${i}" cx="${V[i][0]}" cy="${V[i][1]}" r="18" fill="${acc}" fill-opacity="0"><title>ドラッグして動かす</title></circle>`).join('');
  }
  // 値をきりのよい刻みに丸める（図の大きさの 1/300 以下で最大の 10 のべき）
  const stepOf = span => 10 ** Math.floor(Math.log10(span / 300));
  const snap = (v, st) => String(+(Math.round(v / st) * st).toFixed(Math.max(0, -Math.round(Math.log10(st)))));
  let drag = null;
  function enableDrag(figId, tab, onMove, onEnd) {
    const fig = $(figId);
    fig.addEventListener('pointerdown', e => {
      const h = e.target.closest('.hd'); if (!h || !lastFrame[tab]) return;
      e.preventDefault();
      drag = { tab, i: +h.dataset.v, F: lastFrame[tab] }; frozen = drag.F;
      try { fig.setPointerCapture(e.pointerId); } catch (err) { /* 古いブラウザ */ }
      fig.classList.add('dragging');
    });
    fig.addEventListener('pointermove', e => {
      if (!drag || drag.tab !== tab) return;
      const svg = fig.querySelector('svg'); if (!svg) return;
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const q = pt.matrixTransform(svg.getScreenCTM().inverse());
      onMove(drag.i, drag.F.inv([q.x, q.y]), drag.F);
    });
    const end = () => { if (!drag || drag.tab !== tab) return; drag = null; frozen = null; fig.classList.remove('dragging'); if (onEnd) onEnd(); save(); render(); };
    fig.addEventListener('pointerup', end); fig.addEventListener('pointercancel', end);
  }
  const svgOpen = (W, H, label) => `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}" font-family="${esc(css('--f-ui'))}">`;
  function grid(W, H) {
    let s = '';
    for (let x = 20; x < W; x += 20) s += `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="${css('--grid')}" stroke-width="1"/>`;
    for (let y = 20; y < H; y += 20) s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${css('--grid')}" stroke-width="1"/>`;
    return s;
  }
  // 頂点 q での角の弧（p→q→r）
  function arc(q, p, r, rad, color, right = false) {
    const a1 = Math.atan2(p[1] - q[1], p[0] - q[0]), a2 = Math.atan2(r[1] - q[1], r[0] - q[0]);
    if (right) {
      const u = [Math.cos(a1) * rad, Math.sin(a1) * rad], v = [Math.cos(a2) * rad, Math.sin(a2) * rad];
      return `<path d="M${q[0] + u[0]} ${q[1] + u[1]} L${q[0] + u[0] + v[0]} ${q[1] + u[1] + v[1]} L${q[0] + v[0]} ${q[1] + v[1]}" fill="none" stroke="${color}" stroke-width="1.4"/>`;
    }
    let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const e = a1 + d;
    return `<path d="M${q[0] + Math.cos(a1) * rad} ${q[1] + Math.sin(a1) * rad} A${rad} ${rad} 0 0 ${d > 0 ? 1 : 0} ${q[0] + Math.cos(e) * rad} ${q[1] + Math.sin(e) * rad}" fill="none" stroke="${color}" stroke-width="1.4"/>`;
  }
  const label = (x, y, t, color, anchor = 'middle', size = 13, weight = 500) =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${size}" font-weight="${weight}" fill="${color}" paint-order="stroke" stroke="${css('--bg')}" stroke-width="4" stroke-linejoin="round">${esc(t)}</text>`;
  // 三角形を描く。V：画面座標の頂点 3 つ、names：頂点名、sideText/angText：表示、known：入れた値か
  function drawTri(V, names, sideText, sideKnown, angText, angKnown, rightAt = -1) {
    const ink = css('--ink'), calc = css('--calc'), acc = css('--accent');
    const cx = (V[0][0] + V[1][0] + V[2][0]) / 3, cy = (V[0][1] + V[1][1] + V[2][1]) / 3;
    let s = `<polygon points="${V.map(p => p.join(',')).join(' ')}" fill="${css('--accent-weak')}" fill-opacity=".55" stroke="${acc}" stroke-width="2" stroke-linejoin="round"/>`;
    const minSide = Math.min(...[0, 1, 2].map(i => Math.hypot(V[(i + 1) % 3][0] - V[(i + 2) % 3][0], V[(i + 1) % 3][1] - V[(i + 2) % 3][1])));
    for (let i = 0; i < 3; i++) {
      const q = V[i], p = V[(i + 1) % 3], r = V[(i + 2) % 3];
      const rad = Math.max(10, Math.min(26, minSide * 0.28));
      s += arc(q, p, r, rad, angKnown[i] ? ink : calc, i === rightAt);
      // 頂点名は重心と反対側、角度は内側
      const ux = q[0] - cx, uy = q[1] - cy, ul = Math.hypot(ux, uy) || 1;
      s += label(q[0] + ux / ul * 16, q[1] + uy / ul * 16, names[i], ink, 'middle', 14, 700);
      if (angText[i]) {
        const bis = [(p[0] - q[0]) / Math.hypot(p[0] - q[0], p[1] - q[1]) + (r[0] - q[0]) / Math.hypot(r[0] - q[0], r[1] - q[1]), (p[1] - q[1]) / Math.hypot(p[0] - q[0], p[1] - q[1]) + (r[1] - q[1]) / Math.hypot(r[0] - q[0], r[1] - q[1])];
        const bl = Math.hypot(bis[0], bis[1]) || 1;
        const ang = Math.acos(Math.max(-1, Math.min(1, ((p[0] - q[0]) * (r[0] - q[0]) + (p[1] - q[1]) * (r[1] - q[1])) / (Math.hypot(p[0] - q[0], p[1] - q[1]) * Math.hypot(r[0] - q[0], r[1] - q[1]))))) / RAD;
        // 鋭い角は、文字が両側の辺から 14px 以上離れる位置まで頂点から離す（隣の辺の 6 割まで）
        const off = Math.max(rad + 22, Math.min(14 / Math.sin(ang / 2 * RAD), 0.6 * Math.min(Math.hypot(p[0] - q[0], p[1] - q[1]), Math.hypot(r[0] - q[0], r[1] - q[1]))));
        s += label(q[0] + bis[0] / bl * off, q[1] + bis[1] / bl * off, angText[i], angKnown[i] ? ink : calc, 'middle', 12);
      }
      // 向かいの辺のラベル（辺の外側）
      if (sideText[i]) {
        const mx = (p[0] + r[0]) / 2, my = (p[1] + r[1]) / 2;
        let nx = -(r[1] - p[1]), ny = r[0] - p[0]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
        s += label(mx + nx * 15, my + ny * 15, sideText[i], sideKnown[i] ? ink : calc, Math.abs(nx) > 0.6 ? (nx > 0 ? 'start' : 'end') : 'middle', 12.5);
      }
    }
    return s;
  }
  function resTable(rows) {
    return `<table class="res"><tbody>${rows.map(r => `<tr class="${r[3] ? 'calc' : ''}"><th>${r[0]}</th><td>${r[1]}${r[2] != null ? `<span class="dms">${r[2]}</span>` : ''}</td></tr>`).join('')}</tbody></table>`;
  }

  // ---- 一般三角形 ----
  const GIDS = ['g-a', 'g-b', 'g-c', 'g-A', 'g-B', 'g-C'];
  let gSol = 0, gGeo = null, gCur = null, gPrefer = null;
  function renderGeneral() {
    const vals = GIDS.map((id, i) => { const el = $(id); el.classList.remove('bad', 'calc'); return i < 3 ? parseLen(el.value) : parseAngle(el.value); });
    GIDS.forEach((id, i) => { if (Number.isNaN(vals[i])) $(id).classList.add('bad'); });
    const fig = $('g-fig'), res = $('g-res'), sol = $('g-sol');
    const empty = () => { fig.innerHTML = `${svgOpen(560, 320, '三角形の図')}${grid(560, 320)}${label(280, 160, '値を 3 つ入れると図が出ます', css('--muted'), 'middle', 13, 400)}</svg>`; res.innerHTML = ''; sol.hidden = true; copies.g = null; };
    GIDS.forEach(id => { $(id).placeholder = ''; });
    if (vals.some(v => Number.isNaN(v))) { msg('g-msg', 'err', '読めない値があります。数字（角は度・度分秒）で入れてください。'); return empty(); }
    const r = solveTriangle(vals.slice(0, 3), vals.slice(3));
    if (r.error) { msg('g-msg', vals.filter(v => v != null).length < 3 ? 'info' : 'err', r.error); return empty(); }
    msg('g-msg', r.length === 2 ? 'info' : '', r.length === 2 ? '二辺とその間にない角の組み合わせなので、条件に合う三角形が 2 つあります（図の上のボタンで切り替え）。' : '');
    if (gPrefer && r.length === 2) gSol = r[0].g.reduce((a, v, k) => a + Math.abs(v - gPrefer[k]), 0) <= r[1].g.reduce((a, v, k) => a + Math.abs(v - gPrefer[k]), 0) ? 0 : 1;
    if (gSol >= r.length) gSol = 0;
    sol.hidden = r.length < 2;
    sol.innerHTML = r.length < 2 ? '' : r.map((x, i) => `<button class="btn" type="button" data-sol="${i}" aria-pressed="${i === gSol}" style="${i === gSol ? `border-color:${css('--accent')};font-weight:700` : ''}">解 ${i + 1}（角 ${'ABC'[x.g.findIndex((v, k) => vals[3 + k] == null)]} = ${fa(x.g.find((v, k) => vals[3 + k] == null))}）</button>`).join('');
    const S = r[gSol];
    const known = vals.map(v => v != null);
    // 入っていない欄に計算値を薄く表示
    GIDS.forEach((id, i) => { if (!known[i]) { $(id).placeholder = i < 3 ? f(S.s[i]) : f(S.g[i - 3]); } });
    // 作図：B を原点、C を +X、A を上に
    const B = [0, 0], C = [S.s[0], 0], A = [S.s[2] * Math.cos(S.g[1] * RAD), S.s[2] * Math.sin(S.g[1] * RAD)];
    const pts = gGeo || [A, B, C];
    if (!gGeo) gCur = pts;
    const F = frame(pts), V = pts.map(F.P);
    lastFrame.general = F;
    fig.innerHTML = svgOpen(F.W, F.H, '三角形の図') + grid(F.W, F.H) +
      drawTri(V, ['A', 'B', 'C'], S.s.map((v, i) => `${'abc'[i]} = ${f(v)}`), known.slice(0, 3), S.g.map(v => fa(v)), known.slice(3)) + handles(V, [0, 1, 2]) + '</svg>';
    const rows = [
      ...[0, 1, 2].map(i => [`辺 ${'abc'[i]}`, f(S.s[i]), null, !known[i]]),
      ...[0, 1, 2].map(i => [`角 ${'ABC'[i]}`, fa(S.g[i]), `${toDMS(S.g[i])}　${(S.g[i] * RAD).toFixed(DIG + 2)} rad`, !known[3 + i]]),
      ['面積', f(S.area), null, true], ['周の長さ', f(S.per), null, true],
      ...[0, 1, 2].map(i => [`高さ（辺 ${'abc'[i]} を底辺）`, f(S.h[i]), null, true]),
      ...[0, 1, 2].map(i => [`中線（辺 ${'abc'[i]} の中点へ）`, f(S.m[i]), null, true]),
      ['外接円の半径 R', f(S.R), null, true], ['内接円の半径 r', f(S.r), null, true],
    ];
    res.innerHTML = resTable(rows);
    copies.g = rows;
  }
  GIDS.forEach(id => $(id).addEventListener('input', () => { save(); renderGeneral(); }));
  // 頂点を動かしたら、入れてある欄の値を新しい形に合わせて書き換える
  enableDrag('g-fig', 'general', (i, m) => {
    if (!gCur) return;
    const geo = (gGeo || gCur).slice(); geo[i] = m;
    const d = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
    const sd = [d(geo[1], geo[2]), d(geo[2], geo[0]), d(geo[0], geo[1])];
    const cr = (geo[1][0] - geo[0][0]) * (geo[2][1] - geo[0][1]) - (geo[1][1] - geo[0][1]) * (geo[2][0] - geo[0][0]);
    if (Math.abs(cr) < 1e-6 * Math.max(...sd) ** 2) return; // 一直線になる位置には動かさない
    const g = [0, 1, 2].map(k => Math.acos(Math.max(-1, Math.min(1, (sd[(k + 1) % 3] ** 2 + sd[(k + 2) % 3] ** 2 - sd[k] ** 2) / (2 * sd[(k + 1) % 3] * sd[(k + 2) % 3])))) / RAD);
    const st = stepOf(Math.max(...sd));
    GIDS.forEach((id, k) => { if ($(id).value.trim() !== '') $(id).value = k < 3 ? snap(sd[k], st) : snap(g[k - 3], 0.1); });
    gGeo = geo; gPrefer = g;
    renderGeneral();
  }, () => { gGeo = null; gPrefer = null; });
  $('g-sol').addEventListener('click', e => { const b = e.target.closest('[data-sol]'); if (!b) return; gSol = +b.dataset.sol; renderGeneral(); });
  $('g-clear').addEventListener('click', () => { GIDS.forEach(id => { $(id).value = ''; }); save(); renderGeneral(); });
  $('g-example').addEventListener('click', () => { const v = ['', '120', '85', '35', '', '']; GIDS.forEach((id, i) => { $(id).value = v[i]; }); save(); renderGeneral(); });

  // ---- 直角三角形 ----
  const RIDS = ['r-x', 'r-y', 'r-h', 'r-t', 'r-g'];
  let rCur = null;
  function renderRight() {
    RIDS.forEach(id => { $(id).classList.remove('bad'); $(id).placeholder = ''; });
    const x = parseLen($('r-x').value), y = parseLen($('r-y').value), r = parseLen($('r-h').value), t0 = parseAngle($('r-t').value), g = parseLen($('r-g').value);
    [['r-x', x], ['r-y', y], ['r-h', r], ['r-t', t0], ['r-g', g]].forEach(([id, v]) => { if (Number.isNaN(v)) $(id).classList.add('bad'); });
    const fig = $('r-fig'), res = $('r-res');
    const empty = () => { fig.innerHTML = `${svgOpen(560, 320, '直角三角形の図')}${grid(560, 320)}${label(280, 160, '値を 2 つ入れると図が出ます', css('--muted'), 'middle', 13, 400)}</svg>`; res.innerHTML = ''; copies.r = null; };
    if ([x, y, r, t0, g].some(v => Number.isNaN(v))) { msg('r-msg', 'err', '読めない値があります。数字で入れてください。'); return empty(); }
    if (t0 != null && g != null) { msg('r-msg', 'err', '角度 θ と勾配は同じ情報です。どちらか一方だけ入れてください。'); return empty(); }
    if (g != null && !(g > 0)) { msg('r-msg', 'err', '勾配は正の数で入れてください。'); return empty(); }
    const t = g != null ? Math.atan(g / 100) / RAD : t0;
    const S = solveRight({ x, y, r, t });
    if (S.error) { msg('r-msg', [x, y, r, t].filter(v => v != null).length < 2 ? 'info' : 'err', S.error); return empty(); }
    msg('r-msg', '', '');
    const k = { x: x != null, y: y != null, r: r != null, t: t0 != null, g: g != null };
    if (!k.x) $('r-x').placeholder = f(S.x); if (!k.y) $('r-y').placeholder = f(S.y); if (!k.r) $('r-h').placeholder = f(S.r);
    if (!k.t) $('r-t').placeholder = f(S.t); if (!k.g) $('r-g').placeholder = f(S.grade);
    const P0 = [0, 0], P1 = [S.x, 0], P2 = [S.x, S.y];
    const F = frame([P0, P1, P2]), V = [P0, P1, P2].map(F.P);
    lastFrame.right = F; rCur = { x: S.x, y: S.y };
    // drawTri の辺 i は頂点 i の向かい：0 → 高さ、1 → 斜辺、2 → 底辺
    fig.innerHTML = svgOpen(F.W, F.H, '直角三角形の図') + grid(F.W, F.H) +
      drawTri(V, ['', '', ''], [`y = ${f(S.y)}`, `r = ${f(S.r)}`, `x = ${f(S.x)}`], [k.y, k.r, k.x], [`θ = ${fa(S.t)}`, '', fa(90 - S.t)], [k.t || k.g, true, false], 1) + handles(V, [1, 2]) + '</svg>';
    const rows = [
      ['底辺 x', f(S.x), null, !k.x], ['高さ y', f(S.y), null, !k.y], ['斜辺 r', f(S.r), null, !k.r],
      ['角度 θ', fa(S.t), `${toDMS(S.t)}　${(S.t * RAD).toFixed(DIG + 2)} rad`, !k.t],
      ['もう一方の角（90° − θ）', fa(90 - S.t), toDMS(90 - S.t), true],
      ['勾配（y ÷ x）', `${f(S.grade)} %`, null, !k.g], ['勾配の比 1 : n（n = x ÷ y）', `1 : ${f(S.n)}`, null, true],
      ['sin θ', f(Math.sin(S.t * RAD)), null, true], ['cos θ', f(Math.cos(S.t * RAD)), null, true], ['tan θ', f(Math.tan(S.t * RAD)), null, true],
      ['面積', f(S.area), null, true],
    ];
    res.innerHTML = resTable(rows);
    copies.r = rows;
  }
  RIDS.forEach(id => $(id).addEventListener('input', () => { save(); renderRight(); }));
  // 直角の頂点を動かすと底辺だけ、もう一方の頂点を動かすと底辺と高さが変わる。θ の頂点は原点に固定
  enableDrag('r-fig', 'right', (i, m, F) => {
    if (!rCur) return;
    const x = m[0], y = i === 2 ? m[1] : rCur.y;
    if (!(x > F.span * 0.01 && y > F.span * 0.01)) return;
    const st = stepOf(F.span), t = Math.atan2(y, x) / RAD;
    const v = { 'r-x': snap(x, st), 'r-y': snap(y, st), 'r-h': snap(Math.hypot(x, y), st), 'r-t': snap(t, 0.1), 'r-g': snap(y / x * 100, 0.1) };
    RIDS.forEach(id => { if ($(id).value.trim() !== '') $(id).value = v[id]; });
    renderRight();
  });
  $('r-clear').addEventListener('click', () => { RIDS.forEach(id => { $(id).value = ''; }); save(); renderRight(); });
  $('r-example').addEventListener('click', () => { const v = ['50', '', '', '15', '']; RIDS.forEach((id, i) => { $(id).value = v[i]; }); save(); renderRight(); });

  const TIDS = ['t-D', 't-d', 't-L', 't-a'];
  function renderTaper() {
    TIDS.forEach(id => { $(id).classList.remove('bad'); $(id).placeholder = ''; });
    const v = { D: parseLen($('t-D').value), d: parseLen($('t-d').value), L: parseLen($('t-L').value), a: parseAngle($('t-a').value) };
    Object.entries({ D: 't-D', d: 't-d', L: 't-L', a: 't-a' }).forEach(([k, id]) => { if (Number.isNaN(v[k])) $(id).classList.add('bad'); });
    if (Object.values(v).some(x => Number.isNaN(x))) { msg('t-msg', 'err', '読めない値があります。'); $('t-res').innerHTML = ''; return; }
    const S = solveTaper(v);
    if (!S) { msg('t-msg', '', ''); $('t-res').innerHTML = ''; return; }
    if (S.error) { msg('t-msg', 'err', S.error); $('t-res').innerHTML = ''; return; }
    msg('t-msg', '', '');
    const k = { D: v.D != null, d: v.d != null, L: v.L != null, a: v.a != null };
    if (!k.D) $('t-D').placeholder = f(S.D); if (!k.d) $('t-d').placeholder = f(S.d); if (!k.L) $('t-L').placeholder = f(S.L); if (!k.a) $('t-a').placeholder = f(S.a);
    $('t-res').innerHTML = resTable([
      ['大径 D', f(S.D), null, !k.D], ['小径 d', f(S.d), null, !k.d], ['長さ L', f(S.L), null, !k.L],
      ['テーパー角（全角）', fa(S.a), toDMS(S.a), !k.a], ['半角（片側）', fa(S.half), toDMS(S.half), true],
      ['テーパー比 (D − d) ÷ L', `1 : ${f(S.inv)}`, `${f(S.ratio)}`, true],
    ]);
  }
  TIDS.forEach(id => $(id).addEventListener('input', () => { save(); renderTaper(); }));

  // ---- 座標 ----
  const CIDS = ['c-ax', 'c-ay', 'c-bx', 'c-by', 'c-cx', 'c-cy'];
  let cMode = 3;
  function syncMode() {
    document.querySelectorAll('#c-mode button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === cMode)));
    document.querySelectorAll('.c3').forEach(el => { el.hidden = cMode === 2; });
  }
  function renderCoord() {
    syncMode();
    CIDS.forEach(id => $(id).classList.remove('bad'));
    const ids = CIDS.slice(0, cMode * 2), vals = ids.map(id => parseLen($(id).value));
    ids.forEach((id, i) => { if (Number.isNaN(vals[i])) $(id).classList.add('bad'); });
    const fig = $('c-fig'), res = $('c-res');
    const empty = () => { fig.innerHTML = `${svgOpen(560, 320, '座標の図')}${grid(560, 320)}${label(280, 160, '座標を入れると図が出ます', css('--muted'), 'middle', 13, 400)}</svg>`; res.innerHTML = ''; copies.c = null; };
    if (vals.some(v => Number.isNaN(v))) { msg('c-msg', 'err', '読めない値があります。数字で入れてください。'); return empty(); }
    if (vals.some(v => v == null)) { msg('c-msg', 'info', 'すべての点の X と Y を入れてください。'); return empty(); }
    const P = []; for (let i = 0; i < cMode; i++) P.push([vals[2 * i], vals[2 * i + 1]]);
    const ink = css('--ink'), calc = css('--calc'), acc = css('--accent');
    if (cMode === 2) {
      const S = coord2(P[0], P[1]);
      if (S.dist === 0) { msg('c-msg', 'err', '2 点が同じ座標です。'); return empty(); }
      msg('c-msg', '', '');
      const F = frame([P[0], P[1], [P[1][0], P[0][1]]]), A = F.P(P[0]), B = F.P(P[1]), Cc = F.P([P[1][0], P[0][1]]);
      lastFrame.coord = F;
      fig.innerHTML = svgOpen(F.W, F.H, '2 点の図') + grid(F.W, F.H) +
        `<line x1="${A[0]}" y1="${A[1]}" x2="${Cc[0]}" y2="${Cc[1]}" stroke="${css('--muted')}" stroke-dasharray="5 4"/><line x1="${Cc[0]}" y1="${Cc[1]}" x2="${B[0]}" y2="${B[1]}" stroke="${css('--muted')}" stroke-dasharray="5 4"/>` +
        `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="${acc}" stroke-width="2.2"/>` +
        [A, B].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${ink}"/>`).join('') +
        label(A[0], A[1] + 16, 'P1', ink, 'middle', 13, 700) + label(B[0], B[1] - 16, 'P2', ink, 'middle', 13, 700) +
        label((A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 14, `距離 ${f(S.dist)}`, calc, 'middle', 12.5) +
        label((A[0] + Cc[0]) / 2, Cc[1] + 14, `ΔX ${f(S.dx)}`, calc, 'middle', 12) + label(Cc[0] + 8, (Cc[1] + B[1]) / 2, `ΔY ${f(S.dy)}`, calc, 'start', 12) + handles([A, B], [0, 1]) + '</svg>';
      const rows = [['ΔX（P2 − P1）', f(S.dx), null, true], ['ΔY（P2 − P1）', f(S.dy), null, true], ['距離', f(S.dist), null, true],
        ['方向角（+X から反時計回り）', fa(S.dir), toDMS(S.dir), true], ['勾配（ΔY ÷ ΔX）', S.grade == null ? '―（垂直）' : `${f(S.grade)} %`, null, true]];
      res.innerHTML = resTable(rows); copies.c = rows; return;
    }
    const S = coord3(P);
    if (S.error) { msg('c-msg', 'err', S.error); return empty(); }
    if (S.collinear) { msg('c-msg', 'err', '3 点が一直線上にあるので三角形になりません。'); return empty(); }
    msg('c-msg', '', '');
    const F = frame(P), V = P.map(F.P);
    lastFrame.coord = F;
    fig.innerHTML = svgOpen(F.W, F.H, '3 点の図') + grid(F.W, F.H) +
      drawTri(V, ['P1', 'P2', 'P3'], S.L.map((v, i) => f(v)), [false, false, false], S.ang.map(fa), [false, false, false]) +
      handles(V, [0, 1, 2]) + '</svg>';
    const nm = ['P2–P3', 'P3–P1', 'P1–P2'];
    const rows = [
      ...[2, 0, 1].map(i => [`辺 ${nm[i]}`, f(S.L[i]), null, true]),
      ...[0, 1, 2].map(i => [`角 P${i + 1}`, fa(S.ang[i]), toDMS(S.ang[i]), true]),
      ['面積', f(S.area), null, true], ['周の長さ', f(S.per), null, true],
      ...[[0, 1], [1, 2], [2, 0]].map(([i, j]) => [`方向角 P${i + 1}→P${j + 1}`, fa(dirDeg(P[i], P[j])), toDMS(dirDeg(P[i], P[j])), true]),
      ['点の並び', S.ccw ? 'P1→P2→P3 は反時計回り' : 'P1→P2→P3 は時計回り', null, true],
    ];
    res.innerHTML = resTable(rows); copies.c = rows;
  }
  CIDS.forEach(id => $(id).addEventListener('input', () => { save(); renderCoord(); }));
  enableDrag('c-fig', 'coord', (i, m, F) => {
    const st = stepOf(F.span);
    $(CIDS[2 * i]).value = snap(m[0], st); $(CIDS[2 * i + 1]).value = snap(m[1], st);
    renderCoord();
  });
  $('c-mode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cMode = +b.dataset.v; save(); renderCoord(); });
  $('c-clear').addEventListener('click', () => { CIDS.forEach(id => { $(id).value = ''; }); save(); renderCoord(); });
  $('c-example').addEventListener('click', () => { const v = ['0', '0', '100', '20', '40', '70']; CIDS.forEach((id, i) => { $(id).value = v[i]; }); save(); renderCoord(); });

  // ---- コピー（タブ区切り） ----
  document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => {
    const rows = copies[b.dataset.copy];
    if (!rows) { toast('先に値を入れてください'); return; }
    const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/[°%]/g, '').replace(/^1 : /, '').trim();
    const txt = rows.map(r => `${r[0]}\t${strip(r[1])}`).join('\n');
    const done = () => toast('コピーしました。Excel に貼り付けられます');
    try {
      navigator.clipboard.writeText(txt).then(done, () => fallback(txt));
    } catch (e) { fallback(txt); }
    function fallback(t) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 失敗 */ }
      ta.remove(); toast(ok ? 'コピーしました。Excel に貼り付けられます' : 'コピーできませんでした。表を選んでコピーしてください');
    }
  }));

  // ---- 表示桁・保存 ----
  $('digits').addEventListener('change', e => { DIG = +e.target.value; save(); render(); });
  function save() {
    const v = {}; [...GIDS, ...RIDS, ...TIDS, ...CIDS].forEach(id => { v[id] = $(id).value; });
    store.set('sankaku-inputs', { v, cMode, DIG });
  }
  function render() {
    const t = (tabs.find(b => b.getAttribute('aria-selected') === 'true') || tabs[0]).dataset.tab;
    if (t === 'general') renderGeneral();
    if (t === 'right') { renderRight(); renderTaper(); }
    if (t === 'coord') renderCoord();
  }
  // 色の切り替え（OS の設定・表示テーマ）で図を描き直す
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render); } catch (e) { /* 古いブラウザ */ }
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // 前回の入力を戻す。初めてなら例を入れておく
  const saved = store.get('sankaku-inputs');
  if (saved && saved.v) {
    Object.entries(saved.v).forEach(([id, v]) => { if ($(id)) $(id).value = v; });
    if (saved.cMode === 2 || saved.cMode === 3) cMode = saved.cMode;
    if ([2, 3, 4, 6, 8].includes(saved.DIG)) { DIG = saved.DIG; $('digits').value = String(DIG); }
  } else {
    const ex = { 'g-b': '120', 'g-c': '85', 'g-A': '35', 'r-x': '50', 'r-t': '15', 't-D': '20', 't-d': '15', 't-L': '40', 'c-ax': '0', 'c-ay': '0', 'c-bx': '100', 'c-by': '20', 'c-cx': '40', 'c-cy': '70' };
    Object.entries(ex).forEach(([id, v]) => { $(id).value = v; });
  }
  // ---- テーマ（QC Workbench の全ツールで共通のキー） ----
  const THEMES = ['auto', 'light', 'dark'], THEME_LABEL = { auto: '表示：自動', light: '表示：ライト', dark: '表示：ダーク' }, THEME_KEY = 'qc-workbench-theme';
  const readTheme = () => { try { const t = localStorage.getItem(THEME_KEY); return THEMES.includes(t) ? t : 'auto'; } catch (e) { return 'auto'; } };
  let theme = readTheme();
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
    $('themeBtn').textContent = THEME_LABEL[t];
  }
  $('themeBtn').addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % 3];
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 保存できない環境 */ }
    applyTheme(theme);
  });
  // 別のタブや別のツールで切り替えたら、このページにも反映する
  window.addEventListener('storage', e => { if (e.key === THEME_KEY || e.key === null) { theme = readTheme(); applyTheme(theme); } });
  applyTheme(theme);

  // ---- オフライン対応（HTTPS で開いたときだけ Service Worker を登録） ----
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing; if (!w) return;
          w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('新しい版を取り込みました。開き直すと反映されます'); });
        });
      }).catch(() => { /* 登録できなくても計算には影響しない */ });
    });
  }

  const h = (location.hash || '').slice(1), st = store.get('sankaku-tab');
  setTab(['general', 'right', 'coord'].includes(h) ? h : ['general', 'right', 'coord'].includes(st) ? st : 'general');
})();
