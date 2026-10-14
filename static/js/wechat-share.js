(function () {
  'use strict';
  if (!/micromessenger/i.test(navigator.userAgent)) return;
  var box = document.querySelector('[data-share]');
  if (!box) return;
  var sdk = document.createElement('script');
  sdk.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
  sdk.onload = function () {
    var pageUrl = new URL(window.location.href);
    pageUrl.hash = '';
    fetch('/api/wechat/signature?url=' + encodeURIComponent(pageUrl.href), { credentials: 'same-origin' })
      .then(function (res) { if (!res.ok) throw new Error('signature unavailable'); return res.json(); })
      .then(function (config) {
        if (!config.appId || !config.signature || !window.wx) return;
        var share = {
          title: box.getAttribute('data-title') || document.title,
          link: box.getAttribute('data-url') || pageUrl.href,
          imgUrl: 'https://zion4life.faith/img/prayer-share-en.png'
        };
        window.wx.config({
          debug: false,
          appId: config.appId,
          timestamp: config.timestamp,
          nonceStr: config.nonceStr,
          signature: config.signature,
          jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData', 'onMenuShareAppMessage', 'onMenuShareTimeline']
        });
        window.wx.ready(function () {
          window.wx.updateTimelineShareData(share);
          window.wx.updateAppMessageShareData(Object.assign({ desc: document.querySelector('meta[name="description"]')?.content || '' }, share));
          // Older WeChat clients expose only the original menu handlers.
          if (window.wx.onMenuShareTimeline) window.wx.onMenuShareTimeline(share);
          if (window.wx.onMenuShareAppMessage) window.wx.onMenuShareAppMessage(Object.assign({ desc: document.querySelector('meta[name="description"]')?.content || '' }, share));
        });
      })
      .catch(function () { /* Existing link sharing remains available if SDK setup is incomplete. */ });
  };
  document.head.appendChild(sdk);
})();