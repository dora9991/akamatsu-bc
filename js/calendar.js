/* 赤松バスケットクラブ ― 練習カレンダー
   ・予定は保護者会アプリ（hogosha）と同じ表から読む（公開してよい「練習・大会・練習試合・臨時練習」の日と時間だけ）。
     読めないとき・その月の予定がまだ入っていないときは、いつもの練習日（site-data.js の weekly）を目安として出す
   ・日にちを押すと、見学・体験会の申し込み（LINE・メール・文面のコピー）
   ・係の方（役員・予定係）は、保護者会アプリと同じアカウントでログインして、予定を入れる・直す（アプリにもそのまま出る） */
(function () {
  'use strict';

  var S = window.SITE || {};
  var C = S.calendar || {};
  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var grid = $('#calGrid');
  if (!grid) return;

  /* ---------- 小さな道具 ---------- */
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var str = function (v) { return typeof v === 'string' ? v.trim() : ''; };
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var KIND = { practice: '練習', game: '大会', match: '練習試合', extra: '臨時練習', meeting: '保護者会', other: 'その他' };
  var SHORT = { practice: '練習', game: '大会', match: '試合', extra: '臨時', meeting: '保護', other: '他', off: '休み', trial: '体験' };
  var PUBLIC_KINDS = ['practice', 'game', 'match', 'extra'];
  var ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var md = function (s) { var d = parse(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）'; };
  var hm = function (t) { return t ? String(t).slice(0, 5) : ''; };
  var range = function (a, b) { return a && b ? a + '〜' + b : a ? a + '〜' : ''; };
  var icon = function (id) { return '<svg class="ico" aria-hidden="true"><use href="#' + id + '"/></svg>'; };
  var now = function () { return new Date(); };
  var todayYmd = function () { return ymd(now()); };
  var weekly = S.weekly || {};
  var trialTime = Array.isArray(S.trialTime) ? S.trialTime : ['13:00', '14:00'];
  var trialSkip = Array.isArray(S.trialSkip) ? S.trialSkip : [];
  var firstSat = function (y, m) { var f = new Date(y, m, 1); return new Date(y, m, 1 + (6 - f.getDay() + 7) % 7); };

  /* ---------- 保護者会アプリの窓口（Supabase）につなぐ ---------- */
  var API = {
    base: str(C.url).replace(/\/+$/, ''),
    key: str(C.key),
    slug: str(C.slug),
    on: function () { return !!(this.base && this.key && this.slug); },
    call: function (method, path, body, token, extra) {
      var h = { apikey: API.key, 'Content-Type': 'application/json', 'Accept-Profile': 'hogosha', 'Content-Profile': 'hogosha' };
      if (token) h.Authorization = 'Bearer ' + token;
      if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 12000) : null;
      return fetch(API.base + path, { method: method, headers: h, body: body == null ? undefined : JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
        .then(function (res) {
          if (timer) clearTimeout(timer);
          return res.text().then(function (t) {
            var data = null;
            try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
            if (!res.ok) {
              var err = new Error((data && (data.message || data.msg || data.error_description || data.error)) || ('HTTP ' + res.status));
              err.status = res.status; err.code = data && data.code;
              throw err;
            }
            return data;
          });
        });
    }
  };

  /* ---------- ログイン（係の方だけ）。この端末の中にだけ覚えておく ---------- */
  var SKEY = 'akamatsu-bc-session';
  var session = (function () { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } })();
  var saveSession = function (s) {
    session = s;
    try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) { /* 保存できない端末でも、その場では使える */ }
  };
  var fromAuth = function (r) {
    return { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at || Math.floor(Date.now() / 1000) + (r.expires_in || 3600), user: { id: r.user && r.user.id, email: r.user && r.user.email } };
  };
  var signIn = function (email, password) {
    return API.call('POST', '/auth/v1/token?grant_type=password', { email: email, password: password }).then(function (r) { saveSession(fromAuth(r)); });
  };
  var token = function () {
    if (!session) return Promise.resolve(null);
    if (session.expires_at * 1000 - Date.now() > 60000) return Promise.resolve(session.access_token);
    return API.call('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(function (r) { saveSession(fromAuth(r)); return session.access_token; })
      .catch(function () { saveSession(null); return null; });
  };
  var signOut = function () {
    var t = session && session.access_token;
    saveSession(null);
    if (t) API.call('POST', '/auth/v1/logout', {}, t).catch(function () {});
  };

  /* ---------- 状態 ---------- */
  var st = {
    y: now().getFullYear(), m: now().getMonth(),
    cache: {},          // 'pub:2026-11' / 'edit:2026-11' → 予定の配列（読めなかったら null）
    team: null,         // ログインして編集中のチーム { team_id, team_name, can_edit, can_link }
    last: null          // 窓を開く前に押したボタン（閉じたら戻す）
  };
  var editing = function () { return !!(st.team && st.team.can_edit && session); };

  /* ---------- その月の予定を読む ---------- */
  var monthKey = function (y, m) { return y + '-' + pad(m + 1); };
  var loadMonth = function (y, m, force) {
    var k = (editing() ? 'edit:' : 'pub:') + monthKey(y, m);
    if (!force && Object.prototype.hasOwnProperty.call(st.cache, k)) return Promise.resolve(st.cache[k]);
    if (!API.on()) { st.cache[k] = null; return Promise.resolve(null); }
    var from = ymd(new Date(y, m, 1)), to = ymd(new Date(y, m + 1, 0));
    var p;
    if (editing()) {
      p = token().then(function (t) {
        return API.call('GET', '/rest/v1/events?team_id=eq.' + st.team.team_id + '&date=gte.' + from + '&date=lte.' + to +
          '&select=id,kind,title,date,start_time,end_time,place,cancelled,series_id&order=date,start_time', null, t);
      }).then(function (rows) {
        return (rows || []).map(function (r) {
          return { id: r.id, day: r.date, kind: r.kind, start: hm(r.start_time), end: hm(r.end_time), cancelled: !!r.cancelled, title: r.title || '', place: r.place || '', series: r.series_id };
        });
      });
    } else {
      p = API.call('POST', '/rest/v1/rpc/site_calendar', { p_slug: API.slug, p_from: from, p_to: to }).then(function (rows) {
        return (rows || []).map(function (r) { return { day: r.day, kind: r.kind, start: hm(r.start_time), end: hm(r.end_time), cancelled: !!r.cancelled }; });
      });
    }
    return p.then(function (list) { st.cache[k] = list; return list; }, function () { st.cache[k] = null; return null; });
  };

  /* その月の「出すもの」：予定が入っていれば予定、無ければいつもの練習日（目安） */
  var monthView = function (y, m, list) {
    var days = {};
    var mode;
    if (editing()) mode = 'edit';
    else if (list && list.length) mode = 'db';
    else mode = list ? 'empty' : 'off';
    var last = new Date(y, m + 1, 0).getDate();
    for (var d = 1; d <= last; d++) days[ymd(new Date(y, m, d))] = [];
    if (mode === 'db' || mode === 'edit') {
      list.forEach(function (e) { if (days[e.day]) days[e.day].push(e); });
    } else {
      Object.keys(days).forEach(function (k) {
        var w = weekly[parse(k).getDay()];
        if (w) days[k].push({ day: k, kind: 'practice', start: w[0], end: w[1], cancelled: false, guess: true });
      });
    }
    // 体験会：第1土曜日に練習があり、大会でなく、お休みの日として書かれていないとき
    var fs = ymd(firstSat(y, m));
    var trial = null;
    var evs = days[fs] || [];
    var hasPractice = evs.some(function (e) { return e.kind === 'practice' && !e.cancelled; });
    var hasGame = evs.some(function (e) { return (e.kind === 'game' || e.kind === 'match') && !e.cancelled; });
    if (hasPractice && !hasGame && trialSkip.indexOf(fs) === -1) trial = fs;
    return { mode: mode, days: days, trial: trial };
  };

  /* ---------- カレンダーを描く ---------- */
  var monthEl = $('#calMonth'), noteEl = $('#calNote'), calEl = $('#cal');
  var lastView = null;
  var render = function (view) {
    lastView = view;
    var y = st.y, m = st.m;
    monthEl.textContent = y + '年' + (m + 1) + '月';
    var first = new Date(y, m, 1).getDay();
    var html = [];
    for (var i = 0; i < first; i++) html.push('<span class="cal-day blank" aria-hidden="true"></span>');
    var today = todayYmd();
    Object.keys(view.days).forEach(function (k) {
      var d = parse(k);
      var evs = view.days[k];
      var shown = editing() ? evs : evs.filter(function (e) { return PUBLIC_KINDS.indexOf(e.kind) !== -1; });
      var cls = ['cal-day'];
      var tags = [];
      var words = [];
      shown.forEach(function (e) {
        var t = e.cancelled ? 'off' : e.kind;
        var label = e.cancelled ? 'お休み' : KIND[e.kind];
        cls.push('has-' + t);
        tags.push('<span class="tag t-' + t + '"><b data-s="' + SHORT[t] + '">' + esc(label) + '</b>' + (e.start && !e.cancelled ? '<i>' + esc(e.start) + '</i>' : '') + '</span>');
        words.push(label + (e.start && !e.cancelled ? ' ' + range(e.start, e.end) : ''));
      });
      if (view.trial === k) {
        cls.push('is-trial');
        tags.push('<span class="tag t-trial"><b data-s="体験">体験会</b><i>' + esc(trialTime[0]) + '</i></span>');
        words.push('体験会 ' + range(trialTime[0], trialTime[1]));
      }
      if (k === today) cls.push('is-today');
      if (k < today) cls.push('is-past');
      if (d.getDay() === 0) cls.push('sun');
      if (d.getDay() === 6) cls.push('sat');
      html.push('<button type="button" class="' + cls.join(' ') + '" data-day="' + k + '"' + (k === today ? ' aria-current="date"' : '') +
        ' aria-label="' + esc(md(k) + (words.length ? '、' + words.join('、') : '、予定なし')) + '">' +
        '<span class="cd-num">' + d.getDate() + '</span><span class="cd-tags">' + tags.join('') + '</span></button>');
    });
    grid.innerHTML = html.join('');
    var note = '';
    if (view.mode === 'empty') note = 'この月の予定は、まだ入っていません。いつもの練習日を目安として出しています。';
    else if (view.mode === 'off') note = 'いつもの練習日を出しています（大会などで変わることがあります）。';
    noteEl.textContent = note;
    noteEl.hidden = !note;
    calEl.classList.toggle('is-guess', view.mode === 'empty' || view.mode === 'off');
    calEl.classList.toggle('is-editing', editing());
  };

  var showMonth = function (force) {
    var y = st.y, m = st.m;
    calEl.classList.add('is-loading');
    // 読むまでの間も、いつもの練習日で形を出しておく（読めたら差しかえる）
    if (!lastView || lastView.key !== monthKey(y, m)) { var tmp = monthView(y, m, null); tmp.key = monthKey(y, m); render(tmp); }
    return loadMonth(y, m, force).then(function (list) {
      if (st.y !== y || st.m !== m) return;             // 途中で別の月に移った
      var v = monthView(y, m, list); v.key = monthKey(y, m);
      render(v);
      calEl.classList.remove('is-loading');
      updateNav();
    });
  };

  // 前の月は1か月前まで、先は半年先まで（係の方は1年前後）
  var limits = function () {
    var t = now(), base = t.getFullYear() * 12 + t.getMonth();
    return editing() ? [base - 12, base + 12] : [base - 1, base + 6];
  };
  var prevBtn = $('#calPrev'), nextBtn = $('#calNext');
  var updateNav = function () {
    var cur = st.y * 12 + st.m, lim = limits();
    prevBtn.disabled = cur <= lim[0];
    nextBtn.disabled = cur >= lim[1];
  };
  var move = function (n) {
    var cur = st.y * 12 + st.m + n, lim = limits();
    if (cur < lim[0] || cur > lim[1]) return;
    st.y = Math.floor(cur / 12); st.m = cur % 12;
    updateNav();
    showMonth();
  };
  prevBtn.addEventListener('click', function () { move(-1); });
  nextBtn.addEventListener('click', function () { move(1); });

  /* ---------- 次の体験会（体験会のカード・申し込みボタン用） ---------- */
  var nextTrials = [];
  var findTrials = function () {
    var t = now(), out = [], jobs = [];
    for (var i = 0; i < 6; i++) jobs.push([new Date(t.getFullYear(), t.getMonth() + i, 1)]);
    var step = function (i) {
      if (i >= jobs.length || out.length >= 2) return Promise.resolve(out);
      var d = jobs[i][0], y = d.getFullYear(), m = d.getMonth();
      var key = 'pub:' + monthKey(y, m);
      var get = Object.prototype.hasOwnProperty.call(st.cache, key) ? Promise.resolve(st.cache[key])
        : (API.on() ? API.call('POST', '/rest/v1/rpc/site_calendar', { p_slug: API.slug, p_from: ymd(new Date(y, m, 1)), p_to: ymd(new Date(y, m + 1, 0)) })
          .then(function (rows) {
            var list = (rows || []).map(function (r) { return { day: r.day, kind: r.kind, start: hm(r.start_time), end: hm(r.end_time), cancelled: !!r.cancelled }; });
            st.cache[key] = list; return list;
          }, function () { st.cache[key] = null; return null; }) : Promise.resolve(null));
      return get.then(function (list) {
        var saved = st.team; st.team = null;               // 公開の見え方で決める
        var v = monthView(y, m, list);
        st.team = saved;
        if (v.trial) {
          var end = parse(v.trial); var hhmm = (trialTime[1] || '14:00').split(':');
          end.setHours(+hhmm[0], +hhmm[1] || 0, 0, 0);
          if (end > now()) out.push(v.trial);
        }
        return step(i + 1);
      });
    };
    return step(0);
  };
  var showTrialCard = function () {
    var dateEl = $('#nextDate');
    if (!dateEl) return;
    if (!nextTrials.length) { dateEl.textContent = '第1土曜日'; $('#nextChip').hidden = true; $('#nextAfter').hidden = true; return; }
    var first = nextTrials[0];
    var t = now(); var today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    var days = Math.round((parse(first) - today) / 864e5);
    dateEl.textContent = md(first);
    var chip = $('#nextChip');
    chip.textContent = days === 0 ? 'きょう！' : days === 1 ? 'あした！' : 'あと' + days + '日';
    chip.hidden = false;
    var after = $('#nextAfter');
    if (nextTrials[1]) { after.textContent = 'その次は ' + md(nextTrials[1]); after.hidden = false; } else after.hidden = true;
  };

  /* ---------- 下から出てくる窓 ---------- */
  var sheet = $('#sheet'), body = $('#sheetBody');
  var closeTimer = null;
  var openSheet = function (html) {
    // 閉じている途中にまた開いたときは、閉じる処理をやめる（あとから窓が消えないように）
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    body.innerHTML = html;
    if (sheet.hidden || !sheet.classList.contains('open')) {
      if (sheet.hidden) st.last = doc.activeElement;
      sheet.hidden = false;
      doc.body.classList.add('sheet-open');
      // 一度描いてから開く（動きをつけるため）
      void sheet.offsetWidth;
      sheet.classList.add('open');
    }
    body.scrollTop = 0;
    var f = $('[autofocus]', body) || $('.sh-title', body);
    if (f) { if (!f.hasAttribute('tabindex') && f.classList.contains('sh-title')) f.setAttribute('tabindex', '-1'); try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
  };
  var closeSheet = function () {
    if (sheet.hidden || !sheet.classList.contains('open')) return;
    sheet.classList.remove('open');
    doc.body.classList.remove('sheet-open');
    closeTimer = setTimeout(function () { closeTimer = null; sheet.hidden = true; body.innerHTML = ''; }, 260);
    if (st.last && st.last.focus) { try { st.last.focus({ preventScroll: true }); } catch (e) { /* なし */ } }
  };
  $$('[data-close]', sheet).forEach(function (el) { el.addEventListener('click', closeSheet); });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

  var toastEl = null, toastTimer = null;
  var toast = function (msg) {
    if (!toastEl) { toastEl = doc.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); doc.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  };

  /* ---------- 日にちを押したとき（見る人） ---------- */
  var dayEvents = function (k) {
    if (lastView && lastView.days[k]) return lastView.days[k];
    return [];
  };
  var upcomingPractices = function (from, n) {
    if (!lastView) return [];
    return Object.keys(lastView.days).filter(function (k) {
      return k > from && k >= todayYmd() && lastView.days[k].some(function (e) { return e.kind === 'practice' && !e.cancelled; });
    }).slice(0, n);
  };
  var openDay = function (k) {
    if (editing()) { openEditDay(k); return; }
    var evs = dayEvents(k).filter(function (e) { return PUBLIC_KINDS.indexOf(e.kind) !== -1; });
    var isTrial = lastView && lastView.trial === k;
    var past = k < todayYmd();
    var practice = evs.filter(function (e) { return e.kind === 'practice' && !e.cancelled; })[0] || evs.filter(function (e) { return e.kind === 'extra' && !e.cancelled; })[0];
    var guess = evs.some(function (e) { return e.guess; });
    var items = evs.map(function (e) {
      var t = e.cancelled ? 'off' : e.kind;
      return '<li class="ev ev-' + t + '"><b>' + esc(e.cancelled ? KIND[e.kind] + '（お休み）' : KIND[e.kind]) + '</b><span>' + esc(e.cancelled ? '' : range(e.start, e.end)) + '</span></li>';
    });
    if (isTrial) items.push('<li class="ev ev-trial"><b>体験会</b><span>' + esc(range(trialTime[0], trialTime[1])) + '</span></li>');
    var acts = [];
    if (past) {
      acts.push('<p class="sh-sub">過ぎた日です。</p>');
    } else {
      if (isTrial) acts.push('<button type="button" class="btn btn-gold btn-block" data-act="apply" data-kind="trial" data-day="' + k + '" autofocus>この日の体験会に申し込む' + icon('i-arrow') + '</button>');
      if (practice) acts.push('<button type="button" class="btn ' + (isTrial ? 'btn-line' : 'btn-primary') + ' btn-block" data-act="apply" data-kind="visit" data-day="' + k + '"' + (isTrial ? '' : ' autofocus') + '>この日に見学を申し込む' + icon('i-arrow') + '</button>');
      if (!isTrial && nextTrials[0]) {
        acts.push('<p class="sh-sub">体験会は <b>' + esc(md(nextTrials[0])) + '</b> です。<button type="button" class="link-btn" data-act="apply" data-kind="trial" data-day="' + nextTrials[0] + '">体験会に申し込む</button></p>');
      }
      if (!practice && !isTrial) {
        var next = upcomingPractices(k, 3);
        acts.unshift('<p class="sh-sub">この日は練習がありません。' + (next.length ? '近い練習日：' : '') + '</p>' +
          (next.length ? '<div class="day-jumps">' + next.map(function (n) { return '<button type="button" class="chip" data-act="day" data-day="' + n + '">' + esc(md(n)) + '</button>'; }).join('') + '</div>' : ''));
      }
    }
    openSheet('<h3 class="sh-title" id="sheetTitle">' + esc(md(k)) + '</h3>' +
      (items.length ? '<ul class="sh-events">' + items.join('') + '</ul>' : '') +
      (guess ? '<p class="sh-note">いつもの練習日の目安です。くわしくは申し込みのときにご確認ください。</p>' : '') +
      '<div class="sh-actions">' + acts.join('') + '</div>');
  };

  /* ---------- 申し込み（見学・体験会） ---------- */
  var GRADES = ['年中', '年長', '1年', '2年', '3年', '4年', '5年', '6年'];
  var EXP = ['はじめて', '少しある', 'ある'];
  var form = {};
  var openApply = function (kind, k) {
    var evs = dayEvents(k);
    var p = evs.filter(function (e) { return (e.kind === 'practice' || e.kind === 'extra') && !e.cancelled; })[0];
    var when = kind === 'trial' ? range(trialTime[0], trialTime[1]) : (p ? range(p.start, p.end) : '');
    form = { kind: kind, day: k, when: when, grade: form.grade || '', exp: form.exp || '', child: form.child || '', parent: form.parent || '', contact: form.contact || '', note: '' };
    var chips = function (name, list, val) {
      return '<div class="chips" role="radiogroup" data-field="' + name + '">' + list.map(function (g) {
        return '<button type="button" class="chip' + (val === g ? ' on' : '') + '" role="radio" aria-checked="' + (val === g) + '" data-val="' + esc(g) + '">' + esc(g) + '</button>';
      }).join('') + '</div>';
    };
    var title = kind === 'trial' ? '体験会の申し込み' : '見学の申し込み';
    var line = str(S.lineOaId) || str(S.line), mail = str(S.mail);
    openSheet(
      '<h3 class="sh-title" id="sheetTitle">' + title + '</h3>' +
      '<p class="sh-when">' + icon('i-flag') + esc(md(k)) + ' ' + esc(when) + '</p>' +
      '<form class="apply" novalidate>' +
        '<label class="fld"><span>お子さまのお名前<em>必須</em></span><input name="child" autocomplete="off" maxlength="30" value="' + esc(form.child) + '"></label>' +
        '<div class="fld"><span>学年<em>必須</em></span>' + chips('grade', GRADES, form.grade) + '</div>' +
        '<div class="fld"><span>バスケの経験</span>' + chips('exp', EXP, form.exp) + '</div>' +
        '<label class="fld"><span>保護者のお名前<em>必須</em></span><input name="parent" autocomplete="name" maxlength="30" value="' + esc(form.parent) + '"></label>' +
        '<label class="fld"><span>ご連絡先（電話かメール）<em>必須</em></span><input name="contact" autocomplete="tel" maxlength="60" value="' + esc(form.contact) + '"></label>' +
        '<label class="fld"><span>ひとこと（なくてもOK）</span><textarea name="note" rows="2" maxlength="300" placeholder="例：きょうだいで参加したいです"></textarea></label>' +
        '<p class="form-err" role="alert" hidden></p>' +
        '<div class="send">' +
          '<p class="send-title">送り方を選んでください</p>' +
          '<button type="button" class="btn btn-linegreen btn-block" data-act="send-line"' + (line ? '' : ' disabled') + '>' + icon('i-line') + (line ? 'LINEで送る' : 'LINE（準備中）') + '</button>' +
          '<button type="button" class="btn btn-mail btn-block" data-act="send-mail"' + (mail ? '' : ' disabled') + '>' + icon('i-mail') + (mail ? 'メールで送る' : 'メール（準備中）') + '</button>' +
          '<button type="button" class="btn btn-line btn-block" data-act="copy">文面をコピー</button>' +
          (!line && !mail ? '<p class="sh-note">連絡先の準備中です。「文面をコピー」して、クラブの方にお伝えください。</p>' : '') +
        '</div>' +
        '<p class="sh-note">入力した内容は、このページには残りません。LINE・メールの文面に入るだけです。</p>' +
      '</form>');
  };
  var readForm = function () {
    var f = $('form.apply', body);
    if (!f) return null;
    ['child', 'parent', 'contact', 'note'].forEach(function (n) { form[n] = str(f.elements[n].value); });
    var miss = [];
    if (!form.child) miss.push(['child', 'お子さまのお名前']);
    if (!form.grade) miss.push(['grade', '学年']);
    if (!form.parent) miss.push(['parent', '保護者のお名前']);
    if (!form.contact) miss.push(['contact', 'ご連絡先']);
    $$('.fld', f).forEach(function (el) { el.classList.remove('bad'); });
    var err = $('.form-err', f);
    if (miss.length) {
      miss.forEach(function (x) {
        var el = f.elements[x[0]] ? f.elements[x[0]].closest('.fld') : $('[data-field="' + x[0] + '"]', f).closest('.fld');
        if (el) el.classList.add('bad');
      });
      err.textContent = 'まだ入っていない所があります：' + miss.map(function (x) { return x[1]; }).join('・');
      err.hidden = false;
      var firstBad = $('.fld.bad input, .fld.bad .chip', f);
      if (firstBad) firstBad.focus();
      return null;
    }
    err.hidden = true;
    return form;
  };
  var message = function (x) {
    return [
      '【' + (x.kind === 'trial' ? '体験会' : '見学') + 'の申し込み】赤松バスケットクラブ',
      '日にち：' + md(x.day) + ' ' + x.when,
      'お子さま：' + x.child + '（' + x.grade + '）',
      x.exp ? 'バスケの経験：' + x.exp : '',
      '保護者：' + x.parent,
      '連絡先：' + x.contact,
      x.note ? 'ひとこと：' + x.note : '',
      '',
      'よろしくお願いします。'
    ].filter(function (l, i, a) { return l !== '' || (i > 0 && a[i - 1] !== ''); }).join('\n');
  };
  var copyText = function (t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fallbackCopy(t); });
    return Promise.resolve(fallbackCopy(t));
  };
  var fallbackCopy = function (t) {
    var ta = doc.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    doc.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
    doc.body.removeChild(ta);
    return ok;
  };

  /* ---------- 係の方：ログイン・予定を入れる・直す ---------- */
  var adminBar = $('#calAdminBar');
  var showAdminBar = function () {
    if (editing()) {
      adminBar.innerHTML = '<p class="cal-editing">' + icon('i-board') + '<span><b>予定の入力中</b>：' + esc(st.team.team_name) + '</span></p>' +
        '<button type="button" class="cal-admin-btn" data-act="logout">ログアウト</button>';
    } else {
      adminBar.innerHTML = '<button type="button" class="cal-admin-btn" data-act="login">係の方：予定を入れる・直す</button>';
    }
  };
  var openLogin = function (msg) {
    openSheet('<h3 class="sh-title" id="sheetTitle">係の方のログイン</h3>' +
      '<p class="sh-sub">保護者会アプリと同じメールアドレスとパスワードで入れます。予定を入れられるのは、役員と予定・出欠係の方です。</p>' +
      '<form class="login" novalidate>' +
        '<label class="fld"><span>メールアドレス</span><input name="email" type="email" autocomplete="username" inputmode="email" autofocus></label>' +
        '<label class="fld"><span>パスワード</span><input name="pw" type="password" autocomplete="current-password"></label>' +
        '<p class="form-err" role="alert"' + (msg ? '' : ' hidden') + '>' + esc(msg || '') + '</p>' +
        '<button type="submit" class="btn btn-primary btn-block">ログイン</button>' +
      '</form>');
  };
  var afterLogin = function (quiet) {
    return token().then(function (t) {
      if (!t) throw new Error('ログインが切れました');
      return API.call('POST', '/rest/v1/rpc/site_my_team', { p_slug: API.slug }, t).then(function (rows) {
        var row = rows && rows[0];
        if (row) {
          st.team = row;
          if (!row.can_edit) {
            st.team = null;
            if (quiet) return false;
            openSheet('<h3 class="sh-title" id="sheetTitle">予定を入れられません</h3><p class="sh-sub">このアカウント（' + esc(session.user.email) + '）では、予定を入れられません。役員か予定・出欠係の方がログインしてください。</p>' +
              '<div class="sh-actions"><button type="button" class="btn btn-line btn-block" data-act="logout">ログアウト</button></div>');
            return false;
          }
          return true;
        }
        // まだこのサイトにつながったチームが無い → 代表・役員なら、ここでつなげる
        if (quiet) return false;
        return API.call('GET', '/rest/v1/team_members?user_id=eq.' + session.user.id + '&role=in.(owner,admin)&select=team_id,role,teams(name)', null, t).then(function (mine) {
          var list = (mine || []).filter(function (r) { return r.teams; });
          openSheet('<h3 class="sh-title" id="sheetTitle">サイトとチームをつなぐ</h3>' +
            (list.length
              ? '<p class="sh-sub">このサイトのカレンダーに、どのチームの予定を出しますか？（つなぐと、練習・大会などの日にちと時間だけがサイトに出ます。題名・場所・出欠・配車は出ません）</p><div class="sh-actions">' +
                list.map(function (r) { return '<button type="button" class="btn btn-primary btn-block" data-act="link" data-team="' + esc(r.team_id) + '">「' + esc(r.teams.name) + '」をつなぐ</button>'; }).join('') + '</div>'
              : '<p class="sh-sub">このサイトにつながったチームがありません。チームの代表・役員の方がログインすると、つなげられます。</p>') +
            '<div class="sh-actions"><button type="button" class="btn btn-line btn-block" data-act="logout">ログアウト</button></div>');
          return false;
        });
      });
    });
  };
  var enterEdit = function () {
    st.cache = {};
    showAdminBar();
    updateNav();
    return showMonth(true);
  };
  var leaveEdit = function () {
    signOut();
    st.team = null;
    st.cache = {};
    showAdminBar();
    updateNav();
    showMonth(true);
  };

  var openEditDay = function (k) {
    var evs = dayEvents(k);
    openSheet('<h3 class="sh-title" id="sheetTitle">' + esc(md(k)) + ' の予定</h3>' +
      (evs.length ? '<ul class="sh-events edit">' + evs.map(function (e) {
        var t = e.cancelled ? 'off' : e.kind;
        return '<li class="ev ev-' + t + '"><button type="button" data-act="edit-ev" data-id="' + esc(e.id) + '"><b>' + esc(KIND[e.kind] + (e.cancelled ? '（中止）' : '')) + '</b><span>' + esc(range(e.start, e.end)) + '</span>' +
          (e.title || e.place ? '<small>' + esc([e.title, e.place].filter(Boolean).join('・')) + '</small>' : '') + '<em>直す</em></button></li>';
      }).join('') + '</ul>' : '<p class="sh-sub">この日の予定はありません。</p>') +
      '<div class="sh-actions"><button type="button" class="btn btn-primary btn-block" data-act="new-ev" data-day="' + k + '"' + (evs.length ? '' : ' autofocus') + '>＋ この日に予定を足す</button></div>' +
      '<p class="sh-note">ここで入れた予定は、保護者会アプリのカレンダーにもそのまま出ます。サイトに出るのは、練習・大会・練習試合・臨時練習の日にちと時間だけです。</p>');
  };
  var evForm = null;
  var openEventForm = function (k, ev) {
    var dow = parse(k).getDay();
    var w = weekly[dow] || ['', ''];
    evForm = ev ? { id: ev.id, day: k, kind: ev.kind, start: ev.start, end: ev.end, title: ev.title, place: ev.place, cancelled: ev.cancelled, series: ev.series }
      : { id: null, day: k, kind: 'practice', start: w[0], end: w[1], title: '', place: str(S.place), cancelled: false, series: null };
    var kinds = Object.keys(KIND).map(function (x) {
      return '<button type="button" class="chip' + (evForm.kind === x ? ' on' : '') + '" role="radio" aria-checked="' + (evForm.kind === x) + '" data-val="' + x + '">' + KIND[x] + '</button>';
    }).join('');
    openSheet('<h3 class="sh-title" id="sheetTitle">' + (ev ? '予定を直す' : '予定を足す') + '</h3>' +
      '<p class="sh-when">' + icon('i-flag') + esc(md(k)) + '</p>' +
      '<form class="evf" novalidate>' +
        '<div class="fld"><span>種類</span><div class="chips" role="radiogroup" data-field="kind">' + kinds + '</div></div>' +
        '<div class="fld-row"><label class="fld"><span>はじまり</span><input name="start" type="time" step="300" value="' + esc(evForm.start) + '"></label>' +
        '<label class="fld"><span>おわり</span><input name="end" type="time" step="300" value="' + esc(evForm.end) + '"></label></div>' +
        '<label class="fld"><span>題名（なくてもOK）</span><input name="title" maxlength="60" value="' + esc(evForm.title) + '" placeholder="例：秋季大会"></label>' +
        '<label class="fld"><span>場所（なくてもOK）</span><input name="place" maxlength="60" value="' + esc(evForm.place) + '"></label>' +
        (ev ? '<label class="check"><input type="checkbox" name="cancelled"' + (evForm.cancelled ? ' checked' : '') + '><span>この日は中止（お休み）</span></label>' : '') +
        '<p class="sh-note">題名・場所は保護者会アプリだけに出ます（サイトには出ません）。</p>' +
        '<p class="form-err" role="alert" hidden></p>' +
        '<button type="submit" class="btn btn-primary btn-block">保存する</button>' +
        (ev ? '<button type="button" class="btn btn-danger btn-block" data-act="ask-delete">この予定を消す</button>' : '') +
        '<button type="button" class="btn btn-line btn-block" data-act="day" data-day="' + k + '">もどる</button>' +
      '</form>');
  };
  var saveEvent = function (f) {
    var err = $('.form-err', f);
    var start = f.elements.start.value, end = f.elements.end.value;
    if (start && end && end < start) { err.textContent = 'おわりの時間が、はじまりより前になっています。'; err.hidden = false; return; }
    var row = { kind: evForm.kind, title: str(f.elements.title.value), start_time: start || null, end_time: end || null, place: str(f.elements.place.value) };
    if (f.elements.cancelled) row.cancelled = f.elements.cancelled.checked;
    var btn = $('button[type="submit"]', f); btn.disabled = true;
    token().then(function (t) {
      if (!t) throw Object.assign(new Error('ログインが切れました。もう一度ログインしてください。'), { status: 401 });
      if (evForm.id) {
        if (evForm.series) row.series_edited = true;     // くり返しの予定の1日だけを直した（アプリと同じ）
        return API.call('PATCH', '/rest/v1/events?id=eq.' + evForm.id, row, t, { Prefer: 'return=representation' });
      }
      row.team_id = st.team.team_id; row.date = evForm.day; row.created_by = session.user.id;
      row.rsvp = evForm.kind === 'meeting' ? 'parents' : 'players';   // アプリと同じ決め方
      return API.call('POST', '/rest/v1/events', row, t, { Prefer: 'return=representation' });
    }).then(function (rows) {
      if (!rows || !rows.length) throw Object.assign(new Error('保存できませんでした（予定を入れる係ではないかもしれません）'), { status: 403 });
      delete st.cache['edit:' + monthKey(st.y, st.m)];
      closeSheet();
      toast('保存しました。保護者会アプリにも出ます。');
      showMonth(true);
    }).catch(function (e) {
      btn.disabled = false;
      err.textContent = e.status === 401 ? 'ログインが切れました。もう一度ログインしてください。' : '保存できませんでした：' + e.message;
      err.hidden = false;
    });
  };
  var deleteEvent = function () {
    token().then(function (t) {
      if (!t) throw new Error('ログインが切れました');
      // くり返しの予定は「この日をとばす」（アプリと同じ。あとでくり返しを作り直しても戻ってこない）
      return evForm.series ? API.call('POST', '/rest/v1/rpc/skip_series_date', { p_event: evForm.id }, t)
        : API.call('DELETE', '/rest/v1/events?id=eq.' + evForm.id, null, t, { Prefer: 'return=representation' });
    }).then(function (rows) {
      if (Array.isArray(rows) && !rows.length && !evForm.series) throw new Error('予定を消す係ではないかもしれません');
      delete st.cache['edit:' + monthKey(st.y, st.m)];
      closeSheet();
      toast('予定を消しました。');
      showMonth(true);
    }).catch(function (e) {
      var err = $('.form-err', body);
      if (err) { err.textContent = '消せませんでした：' + e.message; err.hidden = false; }
    });
  };

  /* ---------- 押したときの動き（まとめて受ける） ---------- */
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('.cal-day[data-day]');
    if (b) openDay(b.getAttribute('data-day'));
  });
  adminBar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.getAttribute('data-act') === 'login') {
      if (session) {
        afterLogin().then(function (ok) { if (ok) enterEdit(); }).catch(function () { saveSession(null); openLogin(); });
      } else openLogin();
    }
    if (b.getAttribute('data-act') === 'logout') { leaveEdit(); toast('ログアウトしました。'); }
  });
  body.addEventListener('click', function (e) {
    var chip = e.target.closest('.chips .chip');
    if (chip) {
      var box = chip.closest('.chips'), field = box.getAttribute('data-field');
      $$('.chip', box).forEach(function (c) { var on = c === chip; c.classList.toggle('on', on); c.setAttribute('aria-checked', String(on)); });
      if (evForm && field === 'kind') evForm.kind = chip.getAttribute('data-val');
      else form[field] = chip.getAttribute('data-val');
      var fld = box.closest('.fld'); if (fld) fld.classList.remove('bad');
      return;
    }
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'apply') { evForm = null; openApply(b.getAttribute('data-kind'), b.getAttribute('data-day')); }
    else if (act === 'day') openDay(b.getAttribute('data-day'));
    else if (act === 'send-line' || act === 'send-mail' || act === 'copy') {
      var x = readForm();
      if (!x) return;
      var text = message(x);
      if (act === 'copy') {
        copyText(text).then(function (ok) { toast(ok ? '文面をコピーしました。' : 'コピーできませんでした。'); });
      } else if (act === 'send-mail') {
        location.href = 'mailto:' + str(S.mail) + '?subject=' + encodeURIComponent('【' + (x.kind === 'trial' ? '体験会' : '見学') + 'の申し込み】赤松バスケットクラブ') + '&body=' + encodeURIComponent(text.replace(/\n/g, '\r\n'));
      } else {
        var oa = str(S.lineOaId);
        if (oa) {
          window.open('https://line.me/R/oaMessage/' + encodeURIComponent(oa) + '/?' + encodeURIComponent(text), '_blank', 'noopener');
        } else {
          copyText(text).then(function () {
            toast('文面をコピーしました。LINE のトークに貼りつけて送ってください。');
            window.open(str(S.line), '_blank', 'noopener');
          });
        }
      }
    }
    else if (act === 'logout') { closeSheet(); leaveEdit(); toast('ログアウトしました。'); }
    else if (act === 'link') {
      b.disabled = true;
      token().then(function (t) {
        return API.call('POST', '/rest/v1/rpc/set_site_link', { p_team: b.getAttribute('data-team'), p_slug: API.slug }, t);
      }).then(function () { return afterLogin(); }).then(function (ok) {
        if (ok) { closeSheet(); toast('チームをサイトにつなぎました。'); enterEdit(); }
      }).catch(function (er) { b.disabled = false; toast('つなげませんでした：' + er.message); });
    }
    else if (act === 'new-ev') openEventForm(b.getAttribute('data-day'), null);
    else if (act === 'edit-ev') {
      var id = b.getAttribute('data-id');
      var k = null, found = null;
      Object.keys(lastView.days).some(function (d) { return lastView.days[d].some(function (ev) { if (ev.id === id) { k = d; found = ev; return true; } return false; }); });
      if (found) openEventForm(k, found);
    }
    else if (act === 'ask-delete') {
      var box2 = doc.createElement('div');
      box2.className = 'confirm';
      box2.innerHTML = '<p><b>この予定を消しますか？</b><br>出欠などの記録も一緒に消え、元に戻せません。' + (evForm && evForm.series ? '（くり返しの予定は、この日だけをとばします）' : '') + '</p>' +
        '<button type="button" class="btn btn-danger btn-block" data-act="delete">消す</button><button type="button" class="btn btn-line btn-block" data-act="keep">やめる</button>';
      b.replaceWith(box2);
      $('[data-act="keep"]', box2).focus();
    }
    else if (act === 'delete') { b.disabled = true; deleteEvent(); }
    else if (act === 'keep') { openEventForm(evForm.day, findById(evForm.id)); }
  });
  var findById = function (id) {
    var out = null;
    Object.keys(lastView.days).some(function (d) { return lastView.days[d].some(function (ev) { if (ev.id === id) { out = ev; return true; } return false; }); });
    return out;
  };
  body.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    if (f.classList.contains('login')) {
      var err = $('.form-err', f), email = str(f.elements.email.value), pw = f.elements.pw.value;
      if (!email || !pw) { err.textContent = 'メールアドレスとパスワードを入れてください。'; err.hidden = false; return; }
      var btn = $('button[type="submit"]', f); btn.disabled = true;
      signIn(email, pw).then(afterLogin).then(function (ok) {
        if (ok) { closeSheet(); toast('ログインしました。日にちを押すと、予定を入れられます。'); enterEdit(); }
      }).catch(function (er) {
        btn.disabled = false;
        err.textContent = er.status === 400 ? 'メールアドレスかパスワードが違います。' : 'ログインできませんでした：' + er.message;
        err.hidden = false;
      });
    } else if (f.classList.contains('evf')) {
      saveEvent(f);
    }
  });
  // 「体験会に申し込む」のボタン（体験会の欄・下に出るボタン）→ 次の体験会の申し込みをすぐ開く
  $$('[data-apply="trial"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (!nextTrials[0]) return;          // 分からないときは、カレンダーへ移るだけ
      e.preventDefault();
      evForm = null;
      openApply('trial', nextTrials[0]);
    });
  });

  /* ---------- はじめ ---------- */
  // 読む前の目安で、次の体験会を先に出しておく
  (function () {
    var t = now(), out = [];
    for (var i = 0; i < 6 && out.length < 2; i++) {
      var y = new Date(t.getFullYear(), t.getMonth() + i, 1);
      var v = monthView(y.getFullYear(), y.getMonth(), null);
      if (v.trial) { var end = parse(v.trial); end.setHours(14, 0, 0, 0); if (end > t) out.push(v.trial); }
    }
    nextTrials = out;
    showTrialCard();
  })();
  showAdminBar();
  updateNav();
  var start = session ? afterLogin(true).then(function (ok) { if (ok) { showAdminBar(); updateNav(); } }).catch(function () { saveSession(null); }) : Promise.resolve();
  start.then(function () { return showMonth(); }).then(function () {
    return findTrials().then(function (list) { nextTrials = list; showTrialCard(); });
  });
})();
