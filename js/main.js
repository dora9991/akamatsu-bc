/* 赤松バスケットクラブMBC ― 画面の動き
   書きかえる内容は js/site-data.js にまとめてあります。 */
(function () {
  'use strict';

  var S = window.SITE || {};
  var doc = document;
  var root = doc.documentElement;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var str = function (v) { return typeof v === 'string' ? v.trim() : ''; };
  var icon = function (id, cls) {
    return '<svg class="' + (cls || 'ico') + '" aria-hidden="true"><use href="#' + id + '"/></svg>';
  };

  /* ---------- ヘッダー・メニュー ---------- */
  var header = $('#siteHeader');
  var menuBtn = $('#menuBtn');
  var nav = $('#gnav');

  function setMenu(open) {
    doc.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  }
  menuBtn.addEventListener('click', function () {
    setMenu(!doc.body.classList.contains('menu-open'));
  });
  $$('a', nav).forEach(function (a) {
    a.addEventListener('click', function () { setMenu(false); });
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });

  var scrolled = null;
  function onScroll() {
    var s = window.scrollY > 40;
    if (s !== scrolled) { header.classList.toggle('scrolled', s); scrolled = s; }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- トップの動画 ---------- */
  var hero = $('.hero');
  var video = $('#heroVideo');
  if (video) {
    var ok = function () { hero.classList.add('has-video'); };
    var fail = function () {
      hero.classList.remove('has-video');
      hero.classList.add('no-video');
      if (video.parentNode) video.parentNode.removeChild(video);
    };
    video.addEventListener('loadeddata', ok);
    video.addEventListener('playing', ok);
    video.addEventListener('error', fail);
    // 読み込みが始まる前の一瞬も「ソースなし（3）」になるので、networkState では判断しない
    if (video.error) fail();
    else if (video.readyState >= 2) ok();
    // 音なしなので自動で再生できる。省電力モードなどで止められたら、最初のコマを見せたままにする
    var tryPlay = function () {
      if (!video.isConnected || !video.paused) return;
      var p = video.play && video.play();
      if (p && p.catch) p.catch(function () {});
    };
    tryPlay();
    // iPhone の省電力モードなどで自動再生が止められたときは、画面に最初に触れたときに流す（音なし）
    ['touchstart', 'pointerdown', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, tryPlay, { passive: true, once: true });
    });
  }

  /* ---------- トップの写真（動画がないとき、ゆっくり切りかえる） ---------- */
  (function () {
    if (!hero) return;
    var imgs = $$('.hero-slides img[data-slide]');
    var ready = [];
    var cur = -1, timer = null;
    var show = function (i) {
      ready.forEach(function (im, k) { im.classList.toggle('on', k === i); });
      cur = i;
    };
    var start = function () {
      hero.classList.add('has-slides');
      if (cur < 0) show(0);
      if (ready.length > 1 && !timer) {
        timer = setInterval(function () { show((cur + 1) % ready.length); }, 6000);
      }
    };
    imgs.forEach(function (img) {
      var add = function () {
        if (img.naturalWidth > 0 && ready.indexOf(img) === -1) {
          ready.push(img);
          ready.sort(function (a, b) { return imgs.indexOf(a) - imgs.indexOf(b); });
          start();
        }
      };
      // 見つからない写真は、切りかえの対象にしない
      var skip = function () { img.hidden = true; };
      if (img.complete) { if (img.naturalWidth > 0) add(); else skip(); }
      img.addEventListener('load', add);
      img.addEventListener('error', skip);
    });
  })();

  /* ---------- 写真（入っていなければ、代わりの絵を出す） ---------- */
  $$('img[data-fallback]').forEach(function (img) {
    var box = img.closest('.ph');
    if (!box) return;
    var good = function () {
      if (img.naturalWidth > 0) { box.classList.remove('no-photo'); box.classList.add('has-photo'); } else bad();
    };
    var bad = function () { box.classList.add('no-photo'); };
    if (img.complete) good();
    img.addEventListener('load', good);
    img.addEventListener('error', bad);
  });

  /* ---------- 練習場所 ---------- */
  var place = str(S.place);
  if (place && $('#placeText')) $('#placeText').textContent = place;

  /* ---------- 連絡先のボタン ---------- */
  (function () {
    var box = $('#contactBtns');
    var tel = str(S.tel), mail = str(S.mail), line = str(S.line);
    // スポンサーの問い合わせ：メールがあれば件名つきで開く（スポンサーのページ）
    if (mail && $('#sponsorMail')) {
      $('#sponsorMail').href = 'mailto:' + mail + '?subject=' + encodeURIComponent('【スポンサーについて】赤松バスケットクラブMBC') +
        '&body=' + encodeURIComponent(['赤松バスケットクラブMBC ご担当者さま', '', 'スポンサーについて問い合わせます。', '', '・会社名：', '・ご担当者さま：', '・気になるプラン：', '・ご連絡先：', ''].join('\r\n'));
    }
    if (!box) return;
    var body = [
      '赤松バスケットクラブMBC ご担当者さま', '',
      '体験会・入会について問い合わせます。', '',
      '・お子さまのお名前：',
      '・学年：',
      '・バスケの経験：あり ／ なし',
      '・参加したい体験会の日：',
      '・保護者さまのお名前：',
      '・ご連絡先：', ''
    ].join('\r\n');
    var items = [
      { cls: 'c-tel', ico: 'i-phone', label: '電話する', sub: tel, href: tel ? 'tel:' + tel.replace(/[^\d+]/g, '') : '' },
      { cls: 'c-mail', ico: 'i-mail', label: 'メールする', sub: mail,
        href: mail ? 'mailto:' + mail + '?subject=' + encodeURIComponent('【体験会・入会】赤松バスケットクラブMBC') + '&body=' + encodeURIComponent(body) : '' },
      { cls: 'c-line', ico: 'i-line', label: 'LINEで聞く', sub: line ? '友だち追加して、メッセージ' : '', href: line }
    ];
    box.innerHTML = items.map(function (it) {
      var inner = '<span class="c-ico">' + icon(it.ico) + '</span>' +
        '<span class="c-text"><b>' + esc(it.label) + '</b><small>' + esc(it.sub || '準備中') + '</small></span>';
      if (!it.href) return '<div class="c-btn ' + it.cls + ' is-empty" aria-disabled="true">' + inner + '</div>';
      var ext = it.cls === 'c-line' ? ' target="_blank" rel="noopener"' : '';
      return '<a class="c-btn ' + it.cls + '" href="' + esc(it.href) + '"' + ext + '>' + inner + icon('i-arrow', 'ico c-go') + '</a>';
    }).join('');
    if (!tel && !mail && !line) {
      box.insertAdjacentHTML('afterend', '<p class="dev-hint">連絡先は js/site-data.js の tel ・ mail ・ line に書くと、ボタンが押せるようになります</p>');
    }

    var person = str(S.contactPerson);
    if (person) { var pe = $('#contactPerson'); pe.textContent = '担当：' + person; pe.hidden = false; }
  })();

  /* ---------- 応援企業 ---------- */
  (function () {
    var grid = $('#sponsorGrid');
    if (!grid) return;
    var list = (Array.isArray(S.sponsors) ? S.sponsors : []).filter(function (s) { return s && str(s.name); });
    var html = list.map(function (s) {
      var plan = /^(gold|silver|bronze)$/.test(s.plan) ? s.plan : 'bronze';
      var logo = str(s.logo);
      var face = logo
        ? '<img src="' + esc(logo) + '" alt="' + esc(s.name) + '" loading="lazy">'
        : '<span class="sp-name">' + esc(s.name) + '</span>';
      var inner = '<span class="sp-face">' + face + '</span><span class="sp-cap">' + esc(s.name) + '</span>';
      var url = str(s.url);
      return url
        ? '<a class="sp-card sp-' + plan + '" href="' + esc(url) + '" target="_blank" rel="noopener sponsored">' + inner + '</a>'
        : '<div class="sp-card sp-' + plan + '">' + inner + '</div>';
    });
    var empty = list.length ? 1 : 3;
    for (var i = 0; i < empty; i++) {
      html.push('<a class="sp-card sp-empty" href="#sponsor"><span class="sp-face"><span class="sp-your">YOUR LOGO</span></span>' +
        '<span class="sp-cap">広告募集中 ' + icon('i-arrow') + '</span></a>');
    }
    grid.innerHTML = html.join('');
    // ロゴの画像が見つからないときは、会社名の文字にする
    $$('.sp-face img', grid).forEach(function (img) {
      var swap = function () {
        var span = doc.createElement('span');
        span.className = 'sp-name';
        span.textContent = img.alt;
        if (img.parentNode) img.parentNode.replaceChild(span, img);
      };
      if (img.complete && img.naturalWidth === 0) swap();
      else img.addEventListener('error', swap);
    });
  })();

  /* ---------- スクロールで出てくる ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    root.classList.add('ready');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 申し込みボタン（トップとお問い合わせが見えている間は隠す） ---------- */
  var sticky = $('#stickyCta');
  if (sticky && 'IntersectionObserver' in window) {
    var seen = { top: true, contact: false, calendar: false, past: false };
    var update = function () {
      // トップ・カレンダー・「お問い合わせ」が見えている間と、それより下（企業向けの所）では出さない
      var show = !seen.top && !seen.contact && !seen.calendar && !seen.past;
      sticky.classList.toggle('show', show);
      sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
      sticky.tabIndex = show ? 0 : -1;
    };
    var watch = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        seen[en.target.id] = en.isIntersecting;
        if (en.target.id === 'contact') seen.past = !en.isIntersecting && en.boundingClientRect.top < 0;
      });
      update();
    }, { threshold: 0 });
    watch.observe($('#top'));
    watch.observe($('#contact'));
    if ($('#calendar')) watch.observe($('#calendar'));
  }

  /* ---------- 年 ---------- */
  if ($('#year')) $('#year').textContent = new Date().getFullYear();
})();
