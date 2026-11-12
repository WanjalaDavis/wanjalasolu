document.addEventListener('DOMContentLoaded', () => {
  // Add a small visual state to the navbar after scrolling.
  const nav = document.querySelector('.site-nav');
  const updateNav = () => {
    if (nav) nav.classList.toggle('nav-scrolled', window.scrollY > 20);
  };
  updateNav();
  window.addEventListener('scroll', updateNav, { passive: true });
});
