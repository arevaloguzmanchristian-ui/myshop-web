// ============================================
// DIGISHOP — Mejoras UI no conflictivas
// ============================================

document.addEventListener('DOMContentLoaded', () => {

    // ─── 1. ANIMATED COUNTER ─────────────────
    function animateCounter() {
        var counters = document.querySelectorAll('.stat-number');
        counters.forEach(function(el) {
            var target = parseInt(el.textContent.replace(/\D/g, '')) || 0;
            if (target === 0 || target === 1) return;
            var current = 0;
            var step = Math.max(1, Math.floor(target / 40));
            var interval = setInterval(function() {
                current += step;
                if (current >= target) {
                    current = target;
                    clearInterval(interval);
                    el.textContent = current;
                } else {
                    el.textContent = current;
                }
            }, 30);
        });
    }

    var statsSection = document.querySelector('.stats-section');
    if (statsSection) {
        var counted = false;
        var obs = new IntersectionObserver(function(entries) {
            if (entries[0].isIntersecting && !counted) {
                counted = true;
                animateCounter();
                obs.unobserve(statsSection);
            }
        }, { threshold: 0.3 });
        obs.observe(statsSection);
    }

    // ─── 2. PARALLAX HERO ────────────────────
    var heroShape = document.querySelector('.hero-shape');
    var heroBg = document.querySelector('.hero-bg');
    if (heroShape || heroBg) {
        window.addEventListener('scroll', function() {
            var scrollY = window.scrollY;
            var maxScroll = window.innerHeight;
            var progress = Math.min(scrollY / maxScroll, 1);
            if (heroShape) {
                heroShape.style.transform = 'translateY(' + (progress * 40) + 'px) scale(' + (1 + progress * 0.05) + ')';
                heroShape.style.opacity = Math.max(0, 0.08 - progress * 0.06);
            }
            if (heroBg) {
                heroBg.style.transform = 'translateY(' + (progress * 15) + 'px)';
            }
        }, { passive: true });
    }

    // ─── 3. SKELETON LOADING ─────────────────
    document.querySelectorAll('.bg-jbl img').forEach(function(img) {
        if (img.complete && img.naturalWidth > 0) return;
        img.style.opacity = '0';
        var skeleton = document.createElement('div');
        skeleton.className = 'img-skeleton';
        if (img.parentElement) img.parentElement.appendChild(skeleton);

        img.addEventListener('load', function() {
            img.style.opacity = '1';
            if (skeleton.parentElement) skeleton.remove();
        });
        img.addEventListener('error', function() {
            if (skeleton.parentElement) skeleton.remove();
        });
    });

    // ─── 4. PRICE ANIMATION ──────────────────
    document.querySelectorAll('.product-price').forEach(function(el) {
        var text = el.textContent;
        el.textContent = '';
        el.style.visibility = 'visible';
        var chars = 0;
        var interval = setInterval(function() {
            chars++;
            el.textContent = text.substring(0, chars);
            if (chars >= text.length) clearInterval(interval);
        }, 35);
    });

    // ─── 5. CART TOTAL ANIMATION ─────────────
    var totalEl = document.getElementById('cartTotal');
    if (totalEl) {
        var observer = new MutationObserver(function() {
            totalEl.style.transition = 'transform 0.2s ease';
            totalEl.style.transform = 'scale(1.1)';
            setTimeout(function() { totalEl.style.transform = 'scale(1)'; }, 200);
        });
        observer.observe(totalEl, { childList: true, characterData: true, subtree: true });
    }

    console.log('[DigiShop] Mejoras aplicadas');
});
