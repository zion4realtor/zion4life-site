(() => {
  const rotator = document.querySelector('[data-testimony-rotator]');
  if (!rotator) return;

  const slides = [...rotator.querySelectorAll('[data-feature-testimony]')];
  if (slides.length < 2) return;

  const controls = rotator.querySelector('.home-testimony-controls');
  const position = controls.querySelector('[data-testimony-position]');
  const toggle = controls.querySelector('[data-testimony-toggle]');
  let active = 0;
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer;

  function show(index) {
    active = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => { slide.inert = i !== active; });
    position.textContent = (active + 1) + ' / ' + slides.length;
  }

  function schedule() {
    clearTimeout(timer);
    if (playing && !document.hidden && !rotator.matches(':hover, :focus-within')) {
      timer = setTimeout(() => {
        show(active + 1);
        schedule();
      }, 12000);
    }
  }

  function updateToggle() {
    toggle.textContent = playing ? toggle.dataset.pauseLabel : toggle.dataset.playLabel;
    schedule();
  }

  controls.querySelector('[data-testimony-prev]').onclick = () => show(active - 1);
  controls.querySelector('[data-testimony-next]').onclick = () => show(active + 1);
  toggle.onclick = () => {
    playing = !playing;
    updateToggle();
  };

  for (const event of ['mouseenter', 'mouseleave', 'focusin', 'focusout']) {
    rotator.addEventListener(event, () => setTimeout(schedule, 0));
  }
  document.addEventListener('visibilitychange', schedule);
  controls.hidden = false;
  show(0);
  updateToggle();
})();
