(function () {
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;

  const images = document.querySelectorAll('.gallery-img');
  const lightboxImg = lightbox.querySelector('.lightbox-content img');
  let currentIndex = 0;
  let fullUrls = [];

  images.forEach((img, i) => {
    fullUrls.push(img.dataset.full);
    img.addEventListener('click', () => {
      currentIndex = i;
      openLightbox();
    });
  });

  function openLightbox() {
    lightboxImg.src = fullUrls[currentIndex];
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  lightbox.querySelector('.lightbox-prev').addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + fullUrls.length) % fullUrls.length;
    lightboxImg.src = fullUrls[currentIndex];
  });

  lightbox.querySelector('.lightbox-next').addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % fullUrls.length;
    lightboxImg.src = fullUrls[currentIndex];
  });

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') {
      currentIndex = (currentIndex - 1 + fullUrls.length) % fullUrls.length;
      lightboxImg.src = fullUrls[currentIndex];
    }
    if (e.key === 'ArrowRight') {
      currentIndex = (currentIndex + 1) % fullUrls.length;
      lightboxImg.src = fullUrls[currentIndex];
    }
  });
})();
