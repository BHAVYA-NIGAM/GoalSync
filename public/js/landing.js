document.addEventListener("DOMContentLoaded", () => {
  const counters = document.querySelectorAll("[data-count]");

  const animateValue = (element) => {
    const target = Number(element.dataset.count || 0);
    const suffix = target > 90 ? "%" : "+";
    const duration = 1400;
    const start = performance.now();

    const step = (timestamp) => {
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(target * eased);
      element.textContent = `${current}${suffix}`;

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  };

  counters.forEach((counter) => animateValue(counter));

  const parallaxCard = document.querySelector("[data-parallax-card]");
  if (!parallaxCard) {
    return;
  }

  const resetCard = () => {
    parallaxCard.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg) translate3d(0, 0, 0)";
  };

  parallaxCard.addEventListener("mousemove", (event) => {
    const rect = parallaxCard.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const rotateY = ((offsetX / rect.width) - 0.5) * 10;
    const rotateX = (0.5 - (offsetY / rect.height)) * 10;

    parallaxCard.style.transform =
      `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translate3d(0, -4px, 0)`;
  });

  parallaxCard.addEventListener("mouseleave", resetCard);
  parallaxCard.addEventListener("blur", resetCard);
});
