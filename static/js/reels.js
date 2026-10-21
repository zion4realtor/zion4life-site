(() => {
  const feed = document.querySelector('[data-reels]');
  if (!feed) return;
  const reels = [...feed.querySelectorAll('[data-reel]')];
  const en = document.documentElement.lang === 'en';
  const wechat = /MicroMessenger/i.test(navigator.userAgent);
  const t = (zh, english) => en ? english : zh;
  let active = -1, muted = false, manuallyPaused = false;
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
    // WeChat's menu can retain the entry document's share card despite history
    // and meta updates. Load the selected video's own document in that browser.
    if (wechat && index !== 0) {
      reels.forEach(reel => reel.querySelector('video').pause());
      location.replace(`${en ? '/en' : ''}/v/${reels[index].dataset.reel}/?share=video2`);
      return;
    }
    active = index; manuallyPaused = false;
    reels.forEach((reel, i) => {
      const video = reel.querySelector('video');
      if (i !== index) {
        video.pause();
        if (Math.abs(i-index) > 1 && video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
      }
      reel.classList.toggle('is-paused', i === index && manuallyPaused);
    });
    const slug = reels[index].dataset.reel;
    const prefix = en ? '/en' : '';
    history.replaceState(null, '', `${prefix}/v/${slug}/${wechat ? '?share=video2' : ''}`);
    document.title = reels[index].getAttribute('aria-label') + (en ? ' | Light' : '｜有光');
    // The native share menu must follow the video currently on screen.
    const current = reels[index];
    const title = current.getAttribute('aria-label');
    const description = current.dataset.shareDescription || title;
    const image = new URL(current.dataset.shareImage, location.origin).href;
    const url = `${location.origin}${prefix}/v/${slug}/`;
    for (const [selector, value] of [
      ['meta[name="description"]', description],
      ['meta[property="og:title"]', title],
      ['meta[property="og:description"]', description],
      ['meta[property="og:url"]', url],
      ['meta[property="og:image"]', image],
      ['meta[property="og:image:secure_url"]', image],
      ['meta[property="og:image:alt"]', title],
      ['meta[name="twitter:title"]', title],
      ['meta[name="twitter:description"]', description],
      ['meta[name="twitter:image"]', image],
    ]) document.querySelector(selector)?.setAttribute('content', value);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', url);
    document.querySelector('link[rel="image_src"]')?.setAttribute('href', image);
    document.querySelector('.reels-language').href = `${en ? '' : '/en'}/v/${slug}/`;
    count.textContent = `${index + 1} / ${reels.length}`;
    steps.forEach(b => b.disabled = reels.length < 2);
    if (index > 0) hint.classList.add('is-hidden');
    if (!document.hidden && !manuallyPaused) play(reels[index]);
  }
  function step(delta) {
    const next = (active + delta + reels.length) % reels.length;
    reels[next]?.scrollIntoView({ behavior: motion ? 'instant' : 'smooth', block: 'nearest', inline: 'start' });
  }
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
      if (reels[active] !== reel || document.hidden || reels.length < 2) return;
      const next = (active + 1) % reels.length;
      reels[next].scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'start' });
      activate(next);
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
  window.addEventListener('pageshow', event => { if (event.persisted && reels[active] && !manuallyPaused) play(reels[active]); });
  setTimeout(() => hint.classList.add('is-hidden'), 6000);
})();
