(() => {
  const feed = document.querySelector('[data-reels]');
  if (!feed) return;
  const reels = [...feed.querySelectorAll('[data-reel]')];
  const en = document.documentElement.lang === 'en';
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
    if (!video.src) video.src = video.dataset.src;
    video.muted = muted;
    delete video.dataset.autoplayMuted;
    try {
      await video.play();
      showPlaying(reel);
    } catch (error) {
      if (reels[active] !== reel || document.hidden || manuallyPaused) return;
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
    const slug = reels[index].dataset.reel;
    const prefix = en ? '/en' : '';
    history.replaceState(null, '', `${prefix}/v/${slug}/`);
    document.title = reels[index].getAttribute('aria-label') + (en ? ' | Light' : '｜有光');
    document.querySelector('.reels-language').href = `${en ? '' : '/en'}/v/${slug}/`;
    count.textContent = `${index + 1} / ${reels.length}`;
    steps.forEach(b => b.disabled = !reels[index + Number(b.dataset.reelStep)]);
    if (index > 0) hint.classList.add('is-hidden');
    if (!document.hidden && !manuallyPaused) play(reels[index]);
  }
  function step(delta) {
    const next = Math.max(0, Math.min(reels.length - 1, active + delta));
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
    video.addEventListener('pause', () => reel.classList.add('is-paused'));
    video.addEventListener('play', () => {
      reel.classList.remove('is-paused');
      if (!video.dataset.tracked) { video.dataset.tracked = '1'; window.ygTrack?.('play_video', { video: reel.dataset.reel }); }
    });
    video.addEventListener('loadedmetadata', () => {
      reel.classList.toggle('reel-portrait', video.videoHeight > video.videoWidth);
    });
    video.addEventListener('error', () => { status.textContent = t('视频暂时未能加载，点击画面重试，或打开详情。','Video could not load. Tap to retry, or open details.'); status.hidden = false; reel.classList.add('is-paused'); video.removeAttribute('src'); });
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
