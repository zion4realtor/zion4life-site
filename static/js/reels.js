(() => {
  const feed = document.querySelector('[data-reels]');
  if (!feed) return;
  const reels = [...feed.querySelectorAll('[data-reel]')];
  const en = document.documentElement.lang === 'en';
  const t = (zh, english) => en ? english : zh;
  let active = -1, muted = false, manuallyPaused = false;
  try { muted = window.sessionStorage?.getItem('reels-muted') === '1'; } catch {}
  const steps = [...document.querySelectorAll('[data-reel-step]')];
  const count = document.querySelector('[data-reel-count]');
  const hint = document.querySelector('.reels-hint');
  const motion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function soundLabels() {
    reels.forEach(reel => {
      const button = reel.querySelector('.reel-mute');
      const isMuted = reel.querySelector('video').muted;
      const label = isMuted ? t('开启声音', 'Sound on') : t('静音', 'Mute');
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(!isMuted));
      button.querySelector('small').textContent = label;
      button.querySelector('span').textContent = isMuted ? '♪' : '♫';
    });
  }
  function showPlaying(reel) {
    const video = reel.querySelector('video');
    if (reels[active] !== reel || document.hidden || manuallyPaused) { video.pause(); return; }
    reel.classList.remove('is-paused');
    reel.querySelector('.reel-status').hidden = true;
    soundLabels();
  }
  async function play(reel) {
    const video = reel.querySelector('video');
    if (video.error || !video.hasAttribute('src')) {
      // Reset Safari's failed media resource selection before retrying the URL.
      video.removeAttribute('src');
      video.load();
      video.src = video.dataset.src;
      video.load();
    }
    video.muted = muted;
    delete video.dataset.autoplayMuted;
    try {
      await video.play();
      showPlaying(reel);
    } catch (error) {
      if (reels[active] !== reel || document.hidden || manuallyPaused || error.name === 'AbortError') return;
      // Browsers may reject sound before a gesture. Keep the picture playing automatically.
      if (error.name === 'NotAllowedError' && !muted) {
        video.muted = true;
        video.dataset.autoplayMuted = '1';
        try { await video.play(); showPlaying(reel); return; } catch {}
      }
      reel.classList.add('is-paused');
      const status = reel.querySelector('.reel-status');
      status.textContent = t('轻点画面继续播放', 'Tap the video to continue playing');
      status.hidden = false;
      status.style.pointerEvents = 'none';
      soundLabels();
    }
  }
  function activate(index) {
    if (index === active || !reels[index]) return;
    active = index; manuallyPaused = false;
    reels.forEach((reel, i) => {
      const video = reel.querySelector('video');
      if (i !== index) {
        video.pause();
        if (Math.abs(i-index) > 1 && video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
      }
      reel.classList.toggle('is-paused', i === index && manuallyPaused);
    });
    // A document owns exactly one video and immutable share metadata.
    // Never use replaceState to make another video impersonate this URL.
    count.textContent = `${feed.dataset.position} / ${feed.dataset.total}`;
    steps.forEach(b => b.disabled = !feed.dataset.next);
    if (!document.hidden && !manuallyPaused) play(reels[index]);
  }
  let navigating = false;
  function step(delta) {
    const url = delta > 0 ? feed.dataset.next : feed.dataset.previous;
    if (!url || navigating) return;
    navigating = true;
    reels.forEach(reel => reel.querySelector('video').pause());
    location.assign(url);
  }
  let touch;
  feed.addEventListener('touchstart', event => {
    if (event.touches.length !== 1 || event.target.closest('input,a,.reel-actions button')) { touch = null; return; }
    touch = {x:event.touches[0].clientX, y:event.touches[0].clientY};
  }, {passive:true});
  feed.addEventListener('touchend', event => {
    if (!touch || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touch.x;
    const dy = event.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.3) { event.preventDefault(); step(dx < 0 ? 1 : -1); }
  }, {passive:false});
  feed.addEventListener('touchcancel', () => { touch = null; }, {passive:true});
  let wheelX = 0, wheelTime = 0;
  feed.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    const now = Date.now();
    wheelX = now - wheelTime > 200 ? event.deltaX : wheelX + event.deltaX;
    wheelTime = now;
    if (Math.abs(wheelX) > 60) step(wheelX > 0 ? 1 : -1);
  }, {passive:false});
  steps.forEach(b => b.addEventListener('click', () => step(Number(b.dataset.reelStep))));
  document.addEventListener('keydown', event => {
    if (event.target.matches('input,textarea,select,button,a') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (['ArrowRight','PageDown','ArrowLeft','PageUp'].includes(event.key)) { event.preventDefault(); step(['ArrowRight','PageDown'].includes(event.key) ? 1 : -1); }
    if (event.code === 'Space') { event.preventDefault(); reels[active]?.querySelector('.reel-toggle').click(); }
  });
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= .6) activate(reels.indexOf(entry.target));
  }, { root: feed, threshold: [.6] });
  reels.forEach(reel => {
    observer.observe(reel);
    const video = reel.querySelector('video');
    const slider = reel.querySelector('input');
    const status = reel.querySelector('.reel-status');
    reel.querySelector('.reel-toggle').addEventListener('click', () => {
      if (video.dataset.autoplayMuted) { manuallyPaused = false; muted = false; play(reel); return; }
      if (video.paused) { manuallyPaused = false; play(reel); }
      else { manuallyPaused = true; video.pause(); }
    });
    video.addEventListener('ended', () => {
      if (reels[active] !== reel || document.hidden) return;
      step(1);
    });
    video.addEventListener('pause', () => reel.classList.add('is-paused'));
    video.addEventListener('play', () => {
      reel.classList.remove('is-paused');
      if (!video.dataset.tracked) { video.dataset.tracked = '1'; window.ygTrack?.('play_video', { video: reel.dataset.reel }); }
    });
    video.addEventListener('loadedmetadata', () => {
      reel.classList.toggle('reel-portrait', video.videoHeight > video.videoWidth);
    });
    video.addEventListener('error', () => {
      if (!video.hasAttribute('src') || reels[active] !== reel) return;
      status.textContent = t('视频暂时未能加载，点击画面重试。','Video could not load. Tap the video to retry.');
      status.hidden = false;
      status.style.pointerEvents = 'none';
      reel.classList.add('is-paused');
    });
    video.addEventListener('timeupdate', () => { if (Number.isFinite(video.duration) && video.duration > 0) slider.value = String(video.currentTime / video.duration * 100); });
    slider.addEventListener('input', () => { if (Number.isFinite(video.duration)) video.currentTime = video.duration * Number(slider.value) / 100; });
    reel.querySelector('.reel-mute').addEventListener('click', () => {
      muted = !video.muted;
      try { window.sessionStorage?.setItem('reels-muted', muted ? '1' : '0'); } catch {}
      reels.forEach(r => r.querySelector('video').muted = muted);
      soundLabels();
      if (!manuallyPaused) play(reel);
    });
    reel.querySelector('.reel-fullscreen').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (feed.requestFullscreen) await feed.requestFullscreen();
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
        else { status.textContent = t('此浏览器暂不支持全屏，请继续左右滑动观看。','Fullscreen is unavailable in this browser. Swipe left or right to keep watching.'); status.hidden = false; }
      } catch { status.textContent = t('请点击视频后再尝试全屏。','Tap the video, then try fullscreen again.'); status.hidden = false; }
    });

  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reels.forEach(r => r.querySelector('video').pause());
    else if (reels[active] && !manuallyPaused) play(reels[active]);
  });
  window.addEventListener('pagehide', () => reels.forEach(r => r.querySelector('video').pause()));
  soundLabels();
  if (reels.length) activate(0);
  window.addEventListener('pageshow', event => { navigating = false; if (event.persisted && reels[active] && !manuallyPaused) play(reels[active]); });
  setTimeout(() => hint.classList.add('is-hidden'), 6000);
})();
