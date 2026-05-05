let currentIndex = 0;

function moveSlide(direction) {
    const slides = document.querySelectorAll('.slide');
    const track = document.querySelector('.slider-track');
    const dots = document.querySelectorAll('.dot');
    
    currentIndex += direction;

    if (currentIndex >= slides.length) currentIndex = 0;
    if (currentIndex < 0) currentIndex = slides.length - 1;

    // Move the track
    track.style.transform = `translateX(-${currentIndex * 100}%)`;

    // Update dots
    dots.forEach(dot => dot.classList.remove('active'));
    dots[currentIndex].classList.add('active');
}

function currentSlide(index) {
    currentIndex = index;
    const track = document.querySelector('.slider-track');
    const dots = document.querySelectorAll('.dot');
    
    track.style.transform = `translateX(-${currentIndex * 100}%)`;
    dots.forEach(dot => dot.classList.remove('active'));
    dots[currentIndex].classList.add('active');
}

// Auto-play (Optional: changes slide every 5 seconds)
setInterval(() => moveSlide(1), 5000);