(() => {
  const rotator = document.querySelector('[data-testimony-rotator]');
  if (!rotator) return;

  const slides = [...rotator.querySelectorAll('[data-feature-testimony]')];
  if (slides.length < 2) return;

  let active = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer;

  function show(index) {
    active = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => { slide.inert = i !== active; });
  }

  function schedule() {
    clearTimeout(timer);
    if (!reducedMotion.matches && !document.hidden && !rotator.matches(':hover, :focus-within')) {
      timer = setTimeout(() => {
        show(active + 1);
        schedule();
      }, 12000);
    }
  }

  for (const event of ['mouseenter', 'mouseleave', 'focusin', 'focusout']) {
    rotator.addEventListener(event, () => setTimeout(schedule, 0));
  }
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', schedule);
  schedule();
})();
