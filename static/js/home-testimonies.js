(() => {
  const container = document.querySelector('[data-testimony-rotator]');
  if (!container) return;

  const cards = [...container.querySelectorAll('[data-feature-testimony]')];
  if (cards.length < 2) return;

  const selectedIndex = Math.floor(Math.random() * cards.length);
  cards.forEach((card, index) => {
    card.inert = index !== selectedIndex;
  });
})();
