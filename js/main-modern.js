// ═══════════════════════════════════════════════════
// DIGISHOP v9 - Brand Carousel + Filter Bar + Offers
// ═══════════════════════════════════════════════════

var SHOP_CONFIG = {
    apiBase: window.location.origin + '/api',
    orderApi: window.location.origin + '/api/myshop_api.php',
    supportPhone: '+59176219693',
    currency: 'Bs',
    sucursales: ['La Paz', 'El Alto', 'Llojeta']
};

var products = [];
var allProducts = [];
var cart = [];
var lastOrder = null;
var _paymentConfirmed = false;
var authToken = localStorage.getItem('ms_token') || '';
var storeAuthMode = 'login';
var STORE_AUTH_DISMISSED_KEY = 'myshop_auth_dismissed';

function storeIsLoggedIn() { return !!(authToken || localStorage.getItem('ms_token')); }

function applyStoreLock() {
    document.body.classList.toggle('store-locked', !storeIsLoggedIn());
}

function showStoreAuth(mode) {
    storeAuthMode = mode || 'login';
    var overlay = document.getElementById('storeAuthOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'storeAuthOverlay';
        overlay.innerHTML = '<div class="store-auth-modal" role="dialog" aria-modal="true" aria-labelledby="storeAuthTitle">'
            + '<button class="store-auth-close" type="button" aria-label="Cerrar">×</button>'
            + '<div class="store-auth-kicker">MI CUENTA MYSHOP</div><h2 id="storeAuthTitle"></h2>'
            + '<p>Inicia sesión o regístrate para consultar precios, comparar productos y comprar con seguridad.</p>'
            + '<div id="storeAuthNameWrap"><label for="storeAuthName">Nombre</label><input id="storeAuthName" autocomplete="name" placeholder="Tu nombre"></div>'
            + '<label for="storeAuthWhatsapp">WhatsApp</label><input id="storeAuthWhatsapp" autocomplete="tel" inputmode="tel" placeholder="Tu número de WhatsApp">'
            + '<label for="storeAuthPassword">Contraseña</label><input id="storeAuthPassword" type="password" autocomplete="current-password" placeholder="Mínimo 6 caracteres">'
            + '<button id="storeAuthSubmit" type="button"></button><button id="storeAuthSwitch" type="button" class="store-auth-switch"></button>'
            + '<div id="storeAuthError" class="store-auth-error" role="alert"></div></div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeStoreAuth(); });
        overlay.querySelector('.store-auth-close').addEventListener('click', closeStoreAuth);
        overlay.querySelector('#storeAuthSwitch').addEventListener('click', function() { showStoreAuth(storeAuthMode === 'login' ? 'register' : 'login'); });
        overlay.querySelector('#storeAuthSubmit').addEventListener('click', submitStoreAuth);
    }
    overlay.classList.add('open');
    document.getElementById('storeAuthTitle').textContent = storeAuthMode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta';
    document.getElementById('storeAuthSubmit').textContent = storeAuthMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
    document.getElementById('storeAuthSwitch').textContent = storeAuthMode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión';
    document.getElementById('storeAuthNameWrap').style.display = storeAuthMode === 'login' ? 'none' : 'block';
    document.getElementById('storeAuthError').textContent = '';
    setTimeout(function() { document.getElementById('storeAuthWhatsapp').focus(); }, 50);
}

function closeStoreAuth() {
    var overlay = document.getElementById('storeAuthOverlay');
    if (overlay) {
        overlay.classList.remove('open');
        try { sessionStorage.setItem(STORE_AUTH_DISMISSED_KEY, '1'); } catch (e) {}
    }
}

function submitStoreAuth() {
    var error = document.getElementById('storeAuthError');
    var body = { whatsapp: document.getElementById('storeAuthWhatsapp').value.trim(), password: document.getElementById('storeAuthPassword').value };
    if (storeAuthMode === 'register') body.nombre = document.getElementById('storeAuthName').value.trim();
    var button = document.getElementById('storeAuthSubmit');
    button.disabled = true;
    apiOrderRequest('auth_' + storeAuthMode, body).then(function(result) {
        authToken = result.token;
        localStorage.setItem('ms_token', result.token);
        try { sessionStorage.removeItem(STORE_AUTH_DISMISSED_KEY); } catch (e) {}
        applyStoreLock();
        closeStoreAuth();
        showToast('Sesión iniciada. Ya puedes comprar');
    }).catch(function(err) { error.textContent = err.message || 'No se pudo iniciar sesión'; }).then(function() { button.disabled = false; });
}

function apiOrderRequest(action, payload, method) {
    var opts = { method: method || 'POST', headers: { 'Content-Type': 'application/json' } };
    if (authToken) opts.headers.Authorization = 'Bearer ' + authToken;
    if (payload) opts.body = JSON.stringify(payload);
    return fetch(SHOP_CONFIG.orderApi + '?action=' + encodeURIComponent(action), opts).then(function(r) {
        return r.text().then(function(raw) { var data; try { data = raw ? JSON.parse(raw) : null; } catch (e) { throw new Error('El servidor devolvió una respuesta inválida (' + r.status + ')'); } if (!data) throw new Error('El servidor no devolvió datos (' + r.status + ')'); if (!r.ok || !data.success) throw new Error(data.error || 'No se pudo procesar la solicitud'); return data; });
    });
}

function getCartToken() {
    var token = localStorage.getItem('ms_cart_token');
    if (!token) { token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function(x){return x.toString(16).padStart(2,'0');}).join(''); localStorage.setItem('ms_cart_token', token); }
    return token;
}

function syncCartToServer() {
    var token = getCartToken();
    return apiOrderRequest('carrito_clear', { token: token }).then(function() {
        return cart.reduce(function(chain, item) { return chain.then(function() { return apiOrderRequest('carrito_add', { token: token, sku: item.sku, cantidad: item.qty }); }); }, Promise.resolve());
    }).then(function() { return token; });
}

// ─── HELPERS ──────────────────────────────────────
function qs(s) { return document.querySelector(s); }
function qsa(s) { return document.querySelectorAll(s); }
function getDisplayDiscount(p) {
    if (!p || !p.origPrice || p.origPrice <= p.price || p.origPrice <= 0) return 0;
    var calc = Math.round((1 - p.price / p.origPrice) * 100);
    return calc > 80 ? 0 : calc;
}
function fmtPrice(v) { return (v||0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function ensureDataUri(str) {
    if (!str) return '';
    if (str.indexOf('data:') === 0 || str.indexOf('http') === 0) return str;
    return 'data:image/png;base64,' + str;
}

// ═══ Mobile Brand Drawer helpers ═══
function closeBrandDrawer() {
  var drawer = qs('#brandDrawer');
  var overlay = qs('#brandDrawerOverlay');
  if (drawer) drawer.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  if (!qs('#filterPanel.open') && !qs('#cartModal.open') && !qs('#qvModal.open') && !qs('#qrModal.open')) {
    document.body.style.overflow = '';
  }
}

function populateBrandDrawer() {
  var body = document.getElementById('brandDrawerBody');
  if (!body || body.dataset._populated) return;

  var brandSet = {};
  allProducts.forEach(function(p) {
    var b = p.marca || 'Otros';
    brandSet[b] = (brandSet[b] || 0) + 1;
  });
  var brands = Object.keys(brandSet).sort();

  var groups = {};
  brands.forEach(function(b) {
    var letter = b.charAt(0).toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(b);
  });
  var letters = Object.keys(groups).sort();

  var html = '<div class="sidebar-brand-item active" data-marca="">Todas <span class="bcount">' + allProducts.length + '</span></div>';
  letters.forEach(function(letter) {
    html += '<div class="sidebar-letter-group" data-letter="' + letter + '">';
    html += '<div class="sidebar-letter-header">' + letter + '</div>';
    groups[letter].forEach(function(b) {
      html += '<div class="sidebar-brand-item" data-marca="' + b.replace(/'/g, "\\'") + '">' + escapeHtml(b) + ' <span class="bcount">' + brandSet[b] + '</span></div>';
    });
    html += '</div>';
  });
  body.innerHTML = html;
  body.dataset._populated = '1';
}

// ═══ Mobile Filter Panel helpers ═══
function closeFilterPanel() {
  var panel = qs('#filterPanel');
  var overlay = qs('#filterOverlay');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  if (!qs('#brandDrawer.open') && !qs('#cartModal.open') && !qs('#qvModal.open') && !qs('#qrModal.open')) {
    document.body.style.overflow = '';
  }
}

function syncMobileFilters() {
  // Stock
  var stockCb = document.getElementById('stockFilter');
  var mobStock = document.getElementById('mobileStockFilter');
  if (stockCb && mobStock) mobStock.checked = stockCb.checked;

  // Sort
  var sortSel = document.getElementById('sortSelect');
  var mobSort = document.getElementById('mobileSortSelect');
  if (sortSel && mobSort) mobSort.value = sortSel.value;

  // Price chips
  var activeChip = qs('.price-chip.active');
  if (activeChip) {
    var range = activeChip.dataset.range;
    qsa('.mchip').forEach(function(c) {
      c.classList.toggle('active', c.dataset.range === range);
    });
  }
}

function applyMobileFilters() {
  // Stock
  var mobStock = document.getElementById('mobileStockFilter');
  var stockCb = document.getElementById('stockFilter');
  if (mobStock && stockCb) stockCb.checked = mobStock.checked;

  // Sort
  var mobSort = document.getElementById('mobileSortSelect');
  var sortSel = document.getElementById('sortSelect');
  if (mobSort && sortSel) sortSel.value = mobSort.value;
  if (mobSort) currentFilter.sort = mobSort.value;

  // Price
  var activeMchip = qs('.mchip.active');
  if (activeMchip) currentFilter.priceRange = activeMchip.dataset.range;

  displayedCount = 0;
  applyFilters();
}

function showToast(msg, icon) {
    var t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast'; t.className = 'toast';
        t.innerHTML = '<span class="toast-icon">' + (icon || '✓') + '</span><span id="toastMsg"></span>';
        document.body.appendChild(t);
    }
    var msgEl = t.querySelector('#toastMsg') || t.querySelector('span:last-child');
    if (msgEl) msgEl.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function(){ t.classList.remove('show'); }, 3000);
}

// ═══ REGLA MyShop: solo stock LP (La Paz + El Alto + Llojeta), ignora showroom ═══
// Si stock LP < 3 → agotado
var LP_SUCURSALES = ['La Paz', 'El Alto', 'Llojeta'];

function getTotalStock(p) {
    var ss = p.stockSucursales || {};
    var t = 0;
    for (var k in ss) {
        if (LP_SUCURSALES.indexOf(k) !== -1) t += ss[k];
    }
    return t;
}

function stockDisponible(stock) {
    return stock >= 3;
}

// ─── LOAD PRODUCTS ────────────────────────────────
function loadProducts() {
    var grid = document.getElementById('productsGrid');
    if (grid) grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:80px 20px;text-align:center;"><div class="qr-spinner" style="margin:0 auto 12px;"></div><p style="color:#999;">Cargando productos...</p></div>';

    fetch(SHOP_CONFIG.apiBase + '/digicorp.php?action=products&limit=5000')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.success || !data.data) throw new Error(data.error || 'Error al cargar');
            allProducts = data.data;
            products = allProducts.slice();
            renderBrandSidebar();
            renderProducts();
            renderOffers();
            // Hide splash loader
            var splash = document.getElementById('splash-loader');
            if (splash) setTimeout(function() { splash.classList.add('hidden'); }, 400);
            console.log('[MyShop] ' + data.total + ' productos (' + data.stats.marcas + ' marcas)');
        })
        .catch(function(err) {
            console.error(err);
            if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:80px 20px;"><p style="color:#999;">Error al cargar productos</p><button onclick="loadProducts()" style="margin-top:10px;padding:8px 20px;background:#ff4b4b;color:#fff;border:none;border-radius:8px;cursor:pointer;">Reintentar</button></div>';
        });
}

// ─── STATE ────────────────────────────────────────
var currentFilter = { marca: '', search: '', sort: 'default', priceRange: 'all' };
var displayedCount = 0;
var pageSize = 24;
var allBrands = [];

// ═══════════════════════════════════════════════════
// BRAND SIDEBAR (left column)
// ═══════════════════════════════════════════════════
function renderBrandSidebar() {
    var container = document.getElementById('sidebarBrands');
    var indexContainer = document.getElementById('letterIndex');
    if (!container) return;

    var brandSet = {};
    allProducts.forEach(function(p) {
        var b = p.marca || 'Otros';
        brandSet[b] = (brandSet[b] || 0) + 1;
    });
    allBrands = Object.keys(brandSet).sort();

    // Populate mobile brand select
    var mobSelect = document.getElementById('mobileBrandSelect');
    if (mobSelect) {
        if (!mobSelect.dataset._bound) {
            mobSelect.addEventListener('change', function() {
                var val = this.value;
                setBrand(val === 'all' ? '' : val);
            });
            mobSelect.dataset._bound = '1';
        }
        var opts = '<option value="all">Todas las marcas</option>';
        allBrands.forEach(function(b) {
            opts += '<option value="' + b.replace(/'/g, "\\'") + '">' + escapeHtml(b) + ' (' + brandSet[b] + ')</option>';
        });
        mobSelect.innerHTML = opts;
    }

    // Group by first letter
    var groups = {};
    allBrands.forEach(function(b) {
        var letter = b.charAt(0).toUpperCase();
        if (!groups[letter]) groups[letter] = [];
        groups[letter].push(b);
    });
    var letters = Object.keys(groups).sort();

    // Render brands grouped by letter
    var html = '<div class="sidebar-brand-item active" data-marca="">Todas <span class="bcount">' + allProducts.length + '</span></div>';
    letters.forEach(function(letter) {
        html += '<div class="sidebar-letter-group" data-letter="' + letter + '">';
        html += '<div class="sidebar-letter-header">' + letter + '</div>';
        groups[letter].forEach(function(b) {
            html += '<div class="sidebar-brand-item" data-marca="' + b.replace(/'/g, "\\'") + '">' + escapeHtml(b) + ' <span class="bcount">' + brandSet[b] + '</span></div>';
        });
        html += '</div>';
    });
    container.innerHTML = html;

    // Render letter index (click to FILTER brands by letter)
    window._activeLetter = '';
    if (indexContainer) {
        var indexHtml = '<a href="#" data-letter="" class="active">✦</a>' + letters.map(function(l) {
            return '<a href="#" data-letter="' + l + '">' + l + '</a>';
        }).join('');
        indexContainer.innerHTML = indexHtml;
        indexContainer.addEventListener('click', function(e) {
            var a = e.target.closest('a');
            if (!a) return;
            e.preventDefault();
            var letter = a.dataset.letter;
            // Toggle: clicking same letter resets
            if (window._activeLetter === letter) { letter = ''; }
            window._activeLetter = letter;
            // Update visual
            qsa('#letterIndex a').forEach(function(link) {
                link.classList.toggle('active', link.dataset.letter === letter);
            });
            // Filter letter groups
            if (letter) {
                qsa('.sidebar-letter-group').forEach(function(g) {
                    g.style.display = g.dataset.letter === letter ? '' : 'none';
                });
            } else {
                qsa('.sidebar-letter-group').forEach(function(g) {
                    g.style.display = '';
                });
            }
        });
    }

    // Click handler for brand items
    container.addEventListener('click', function(e) {
        var item = e.target.closest('.sidebar-brand-item');
        if (!item) return;
        setBrand(item.dataset.marca);
    });

    // Reset mobile drawer cache for next open
    var drawerBody = document.getElementById('brandDrawerBody');
    if (drawerBody) delete drawerBody.dataset._populated;
}

function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setBrand(marca) {
    currentFilter.marca = marca;
    displayedCount = 0;
    applyFilters();

    qsa('.sidebar-brand-item').forEach(function(p) {
        p.classList.toggle('active', p.dataset.marca === marca);
    });

    // Sync mobile select
    var mobSelect = document.getElementById('mobileBrandSelect');
    if (mobSelect) mobSelect.value = marca || 'all';

    // Sync brand drawer items
    qsa('#brandDrawerBody .sidebar-brand-item').forEach(function(p) {
        p.classList.toggle('active', p.dataset.marca === marca);
    });

    // Scroll active into view
    var active = document.querySelector('.sidebar-brand-item.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ═══════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════
function applyFilters() {
    var q = (currentFilter.search || '').toLowerCase();
    var stockOnly = document.getElementById('stockFilter') ? document.getElementById('stockFilter').checked : false;

    products = allProducts.filter(function(p) {
        if (p._pending_detail) return false;
        var st = getTotalStock(p);
        if (stockOnly && !stockDisponible(st)) return false;
        if (currentFilter.marca && p.marca !== currentFilter.marca) return false;
        if (q) {
            var name = (p.name || '').toLowerCase();
            var desc = (p.description || '').toLowerCase();
            var sku = (p.sku || '').toLowerCase();
            var marca = (p.marca || '').toLowerCase();
            if (name.indexOf(q) === -1 && desc.indexOf(q) === -1 && sku.indexOf(q) === -1 && marca.indexOf(q) === -1) return false;
        }
        var pr = currentFilter.priceRange;
        if (pr && pr !== 'all') {
            if (pr === '0-500' && p.price >= 500) return false;
            if (pr === '500-1500' && (p.price < 500 || p.price >= 1500)) return false;
            if (pr === '1500-5000' && (p.price < 1500 || p.price >= 5000)) return false;
            if (pr === '5000' && p.price < 5000) return false;
        }
        return true;
    });

    var sort = currentFilter.sort;
    if (sort && sort !== 'default') {
        products.sort(function(a, b) {
            if (sort === 'price-asc') return a.price - b.price;
            if (sort === 'price-desc') return b.price - a.price;
            if (sort === 'name-asc') return (a.name || '').localeCompare(b.name || '');
            if (sort === 'name-desc') return (b.name || '').localeCompare(a.name || '');
            return 0;
        });
    }

    updateActiveFilters();
    renderOffers();
    renderProducts();
}

function updateActiveFilters() {
    var container = document.getElementById('activeFilters');
    if (!container) return;
    var tags = [];

    var stockEl = document.getElementById('stockFilter');
    if (stockEl && stockEl.checked) tags.push({ label: 'En stock', key: 'stock' });
    if (currentFilter.marca) tags.push({ label: currentFilter.marca, key: 'marca' });
    var pr = currentFilter.priceRange;
    if (pr && pr !== 'all') {
        var labels = { '0-500':'< 500', '500-1500':'500-1.5k', '1500-5000':'1.5k-5k', '5000':'5k+' };
        tags.push({ label: 'Bs ' + (labels[pr] || pr), key: 'price-' + pr });
    }
    if (currentFilter.search) tags.push({ label: '"' + currentFilter.search + '"', key: 'search' });

    if (!tags.length) { container.innerHTML = ''; return; }

    // Update filter badge on mobile toggle
    var filterToggle = document.getElementById('filterToggleBtn');
    if (filterToggle) {
      filterToggle.classList.toggle('has-active', tags.length > 0);
    }

    container.innerHTML = tags.map(function(t) {
        return '<span class="active-filter-tag">' + t.label + '<span class="tag-remove" data-key="' + t.key + '">×</span></span>';
    }).join('');

    container.querySelectorAll('.tag-remove').forEach(function(el) {
        el.addEventListener('click', function() {
            var key = this.dataset.key;
            if (key === 'stock') { var cb = document.getElementById('stockFilter'); if (cb) cb.checked = false; }
            else if (key === 'marca') { setBrand(''); return; }
            else if (key === 'search') {
                currentFilter.search = '';
                var inp = document.getElementById('searchInput');
                if (inp) inp.value = '';
            } else if (key.indexOf('price-') === 0) {
                currentFilter.priceRange = 'all';
                qsa('.price-chip').forEach(function(c) { c.classList.toggle('active', c.dataset.range === 'all'); });
            }
            applyFilters();
        });
    });
}

// ═══════════════════════════════════════════════════
// RENDER PRODUCTS (with fixed pagination)
// ═══════════════════════════════════════════════════
function renderProducts() {
    var grid = document.getElementById('productsGrid');
    if (!grid) return;

    var countEl = document.getElementById('resultCount');
    if (countEl) {
        var marca = currentFilter.marca;
        countEl.textContent = products.length + ' producto' + (products.length !== 1 ? 's' : '') + (marca ? ' · ' + marca : '');
    }

    // Determine cols per row based on viewport
    var cols = 5; if (window.innerWidth <= 820) cols = 3; if (window.innerWidth <= 480) cols = 2;

    // Fix: round displayed count to a multiple of cols so no empty slots
    var totalVisible = displayedCount + pageSize;
    if (totalVisible > products.length) totalVisible = products.length;
    // Round to nearest lower multiple of cols
    var rounded = Math.floor(totalVisible / cols) * cols;
    if (rounded === 0 && totalVisible > 0) rounded = cols; // at least show some
    displayedCount = rounded;

    var toShow = products.slice(0, displayedCount);
    var hasMore = displayedCount < products.length;

    if (!products.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#999;"><p>No se encontraron productos</p></div>';
        document.getElementById('loadMoreWrap').style.display = 'none';
        return;
    }

    grid.innerHTML = toShow.map(function(p) {
        var dd = getDisplayDiscount(p);
        var st = getTotalStock(p);
        var inStock = stockDisponible(st);
        var origHtml = dd > 0 ? '<span class="orig">Bs ' + fmtPrice(p.origPrice) + '</span>' : '';
        var discHtml = dd > 0 ? '<span class="discount">-' + dd + '%</span>' : '';
        return '<div class="product-card" onclick="openProductModal(' + p.id + ')">'
            + '<img class="product-card-img" src="' + (p.images && p.images[0] ? p.images[0] : '') + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onerror="this.src=\'data:image/svg+xml,%253Csvg xmlns=%2527http://www.w3.org/2000/svg%2527 viewBox=%25270 0 100 100%2527%253E%253Crect fill=%2527%2523eee%2527 width=%2527100%2527 height=%2527100%2527/%253E%253Ctext x=%252750%2527 y=%252755%2527 text-anchor=%2527middle%2527 fill=%2527%2523999%2527 font-size=%252736%2527%253E?%253C/text%253E%253C/svg%253E\')">'
            + '<div class="product-card-body">'
            + '<div class="product-card-name" title="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</div>'
            + '<div class="product-card-price"><span class="current">Bs ' + fmtPrice(p.price) + '</span>' + origHtml + discHtml + '</div>'
            + '<div class="product-card-stock' + (inStock ? '' : ' agotado') + '">' + (inStock ? 'En stock (' + st + ')' : 'Agotado') + '</div>'
            + '<div class="product-card-actions">' + (inStock ? '<button class="btn-add" onclick="event.stopPropagation();addToCart(' + p.id + ');">Agregar</button>' : '<button class="btn-add" style="background:#ddd;color:#999;cursor:default;" disabled>Agotado</button>') + '</div>'
            + '</div></div>';
    }).join('');

    var loadWrap = document.getElementById('loadMoreWrap');
    if (loadWrap) {
        // Only show load more if there are more products AND more than one page worth
        loadWrap.style.display = (hasMore && products.length > pageSize) ? 'block' : 'none';
    }
}

// ═══════════════════════════════════════════════════
// OFFERS SECTION (featured discounts)
// ═══════════════════════════════════════════════════
function renderOffers() {
    var section = document.getElementById('offersSection');
    var carousel = document.getElementById('offersCarousel');
    if (!section || !carousel) return;

    // Only show offers when viewing ALL brands, not a specific one
    if (currentFilter.marca) { section.style.display = 'none'; return; }

    // Get products with discounts > 0, sort by discount desc, top 12
    var offers = allProducts.filter(function(p) { return getDisplayDiscount(p) > 0 && stockDisponible(getTotalStock(p)); });
    offers.sort(function(a, b) { return getDisplayDiscount(b) - getDisplayDiscount(a); });
    offers = offers.slice(0, 12);

    if (offers.length < 3) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    carousel.innerHTML = offers.map(function(p) {
        return '<div class="offer-card" onclick="openProductModal(' + p.id + ')">'
            + '<img class="offer-card-img" src="' + (p.images && p.images[0] ? p.images[0] : '') + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onerror="this.src=\'data:image/svg+xml,%253Csvg xmlns=%2527http://www.w3.org/2000/svg%2527 viewBox=%25270 0 100 100%2527%253E%253Crect fill=%2527%2523eee%2527 width=%2527100%2527 height=%2527100%2527/%253E%253Ctext x=%252750%2527 y=%252755%2527 text-anchor=%2527middle%2527 fill=%2527%2523999%2527 font-size=%252736%2527%253E?%253C/text%253E%253C/svg%253E\')">'
            + '<div class="offer-card-body">'
            + '<div class="offer-card-name">' + escapeHtml(p.name).substring(0, 40) + '</div>'
            + '<div class="offer-card-price"><span class="cur">Bs ' + fmtPrice(p.price) + '</span><span class="orig">Bs ' + fmtPrice(p.origPrice) + '</span><span class="disc">-' + getDisplayDiscount(p) + '%</span></div>'
            + '</div></div>';
    }).join('');
}

// ═══════════════════════════════════════════════════
// PRODUCT MODAL (Single Image - no carousel)
// ═══════════════════════════════════════════════════
function openProductModal(productId) {
    var p = allProducts.find(function(x) { return x.id === productId; });
    if (!p) { showToast('Producto no encontrado'); return; }
    if (!storeIsLoggedIn()) { showStoreAuth('login'); return; }

    var overlay = document.getElementById('qvOverlay');
    var modal = document.getElementById('qvModal');
    if (!overlay || !modal) return;

    document.getElementById('qvCategory').textContent = p.marca ? p.marca.toUpperCase() : 'PRODUCTO';
    var marcaEl = document.getElementById('qvMarca');
    if (marcaEl) marcaEl.textContent = p.marca || '';
    document.getElementById('qvTitle').textContent = p.name;
    document.getElementById('qvSpec').textContent = p.description || '';
    document.getElementById('qvSku').textContent = 'SKU: ' + p.sku;

    var dd = getDisplayDiscount(p);
    var priceHtml = '<span class="current">Bs ' + fmtPrice(p.price) + '</span>';
    if (dd > 0) {
        priceHtml += ' <span class="orig">Bs ' + fmtPrice(p.origPrice) + '</span>';
        priceHtml += ' <span class="discount">-' + dd + '%</span>';
    }
    document.getElementById('qvPrice').innerHTML = priceHtml;

    var st = getTotalStock(p);
    var stockEl = document.getElementById('qvStock');
    if (stockEl) {
        stockEl.className = 'qv-stock' + (stockDisponible(st) ? '' : ' agotado');
        stockEl.textContent = stockDisponible(st) ? 'En stock (' + st + ' u.)' : 'Agotado';
    }

    var stockDetEl = document.getElementById('qvStockDetalle');
    if (stockDetEl) {
        stockDetEl.style.display = 'none';
    }
    var chatBtn = document.getElementById('qvChatBtn');
    if (chatBtn) chatBtn.style.display = 'none';

    var addBtn = document.getElementById('qvAddBtn');
    if (addBtn) {
        addBtn.textContent = stockDisponible(st) ? 'Agregar - Bs ' + fmtPrice(p.price) : 'Agotado';
        addBtn.onclick = function() { if (stockDisponible(st)) addToCart(p.id); };
        addBtn.style.opacity = stockDisponible(st) ? '1' : '0.4';
    }

    // Build carousel - track+dots only for 2+ images
    window._carouselIndex = 0;
    var images = p.images && p.images.length > 0 ? p.images.filter(function(x) { return x && x.length > 10; }) : [];
    var hasMultiple = images.length > 1;
    var track = document.getElementById('qvCarouselTrack');
    var dots = document.getElementById('qvCarouselDots');
    var wrap = document.getElementById('qvCarouselWrap');
    var prevBtn = document.getElementById('qvCarouselPrev');
    var nextBtn = document.getElementById('qvCarouselNext');

    if (hasMultiple && track) {
        // Multiple images - show carousel
        track.style.display = '';
        if (wrap) wrap.style.display = '';
        track.innerHTML = images.map(function(img) {
            var imgTag = img ? '<img src="' + img + '" alt="" onerror="this.onerror=null;this.parentNode.innerHTML=\'<span style=font-size:36px;opacity:0.4;display:flex;align-items:center;justify-content:center;height:100%>📦</span>\'">' : '<span style="font-size:36px;opacity:0.4;display:flex;align-items:center;justify-content:center;height:100%;">📦</span>';
            return '<div class="qv-carousel-slide">' + imgTag + '</div>';
        }).join('');
        if (prevBtn) prevBtn.style.display = '';
        if (nextBtn) nextBtn.style.display = '';
        if (dots) {
            dots.style.display = '';
            dots.innerHTML = images.map(function(_, i) {
                return '<button class="qv-carousel-dot' + (i === 0 ? ' active' : '') + '" onclick="goCarousel(' + i + ')"></button>';
            }).join('');
        }
    } else {
        // Single image - simple display, no carousel
        if (track) track.style.display = 'none';
        if (dots) { dots.style.display = 'none'; dots.innerHTML = ''; }
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (wrap) {
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.justifyContent = 'center';
            var src = images[0] || '';
            wrap.innerHTML = src
                ? '<div class="qv-single-image"><img src="' + src + '" alt="" onerror="this.onerror=null;this.parentNode.innerHTML=\'<span style=font-size:48px;opacity:0.4;display:flex;align-items:center;justify-content:center;height:100%>📦</span>\'"></div>'
                : '<div class="qv-single-image" style="display:flex;align-items:center;justify-content:center;height:100%;"><span style="font-size:48px;opacity:0.4;">📦</span></div>';
        }
    }

    window._carouselReady = -1;

    overlay.classList.add('open');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeQuickView() {
    var overlay = document.getElementById('qvOverlay');
    var modal = document.getElementById('qvModal');
    if (overlay) overlay.classList.remove('open');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════
// CAROUSEL HELPERS
// ═══════════════════════════════════════════════════
function goCarousel(index) {
    var track = document.getElementById('qvCarouselTrack');
    var dots = document.getElementById('qvCarouselDots');
    var loader = document.getElementById('qvLoader');
    var slides = track ? track.children.length : 0;
    if (!slides) return;
    window._carouselIndex = Math.max(0, Math.min(index, slides - 1));
    if (track) track.style.transform = 'translateX(-' + (window._carouselIndex * 100) + '%)';
    if (dots) {
        Array.prototype.forEach.call(dots.children, function(d, i) {
            d.classList.toggle('active', i === window._carouselIndex);
        });
    }
    // Show transparent loader until current image finishes loading
    if (loader && window._carouselReady !== undefined && window._carouselReady !== window._carouselIndex) {
        loader.classList.add('active');
        var slide = track ? track.children[window._carouselIndex] : null;
        var img = slide ? slide.querySelector('img') : null;
        if (img) {
            if (img.complete) {
                loader.classList.remove('active');
                window._carouselReady = window._carouselIndex;
            } else {
                var idx = window._carouselIndex;
                img.onload = function() {
                    if (window._carouselIndex === idx) {
                        loader.classList.remove('active');
                        window._carouselReady = idx;
                    }
                };
                img.onerror = function() {
                    if (window._carouselIndex === idx) loader.classList.remove('active');
                    window._carouselReady = idx;
                };
            }
        } else {
            loader.classList.remove('active');
            window._carouselReady = window._carouselIndex;
        }
    }
}
function nextCarousel() { var track = document.getElementById('qvCarouselTrack'); var s = track ? track.children.length : 0; goCarousel(window._carouselIndex + 1 >= s ? 0 : window._carouselIndex + 1); }
function prevCarousel() { var track = document.getElementById('qvCarouselTrack'); var s = track ? track.children.length : 0; goCarousel(window._carouselIndex - 1 < 0 ? s - 1 : window._carouselIndex - 1); }

// ═══════════════════════════════════════════════════
// CART
// ═══════════════════════════════════════════════════
function addToCart(productId) {
    if (!storeIsLoggedIn()) { showStoreAuth('login'); return; }
    var p = allProducts.find(function(x) { return x.id === productId; });
    if (!p) { showToast('Error: producto no encontrado'); return; }
    var existing = cart.find(function(x) { return x.id === productId; });
    if (existing) { existing.qty++; }
    else { cart.push({ id: p.id, sku: p.sku, name: p.name, price: p.price, images: p.images || [], qty: 1 }); }
    updateCart();
    showToast(p.name + ' agregado al carrito');
    var badge = document.getElementById('cartBadge');
    if (badge) { badge.classList.remove('pulse'); void badge.offsetWidth; badge.classList.add('pulse'); }
}

function removeFromCart(productId) { cart = cart.filter(function(x) { return x.id !== productId; }); updateCart(); }
function changeQty(productId, delta) {
    var item = cart.find(function(x) { return x.id === productId; });
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) { removeFromCart(productId); return; }
    updateCart();
}

function updateCart() {
    var badge = document.getElementById('cartBadge');
    var count = cart.reduce(function(s, c) { return s + c.qty; }, 0);
    if (badge) badge.textContent = count;
    var body = document.getElementById('cartItems');
    var foot = document.getElementById('cartFooter');
    var totalEl = document.getElementById('cartTotal');
    if (!body) return;
    if (!cart.length) {
        body.innerHTML = '<div class="cart-empty"><svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#ddd" stroke-width="1.2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><p>Tu carrito está vacío</p><span>Agregá productos para empezar</span></div>';
        if (foot) foot.style.display = 'none';
        return;
    }
    if (foot) foot.style.display = 'block';
    var subtotal = cart.reduce(function(s, c) { return s + c.price * c.qty; }, 0);
    body.innerHTML = cart.map(function(c) {
        return '<div class="cart-item">'
            + '<img class="cart-item-img" src="' + (c.images && c.images[0] ? c.images[0] : '') + '" alt="' + escapeHtml(c.name) + '">'
            + '<div class="cart-item-info">'
            + '<div class="cart-item-name">' + escapeHtml(c.name) + '</div>'
            + '<div class="cart-item-sku">' + c.sku + '</div>'
            + '<div class="cart-item-price">Bs ' + fmtPrice(c.price) + ' c/u</div>'
            + '<div class="cart-item-qty">'
            + '<button onclick="changeQty(' + c.id + ',-1)">-</button>'
            + '<span>' + c.qty + '</span>'
            + '<button onclick="changeQty(' + c.id + ',1)">+</button>'
            + '</div></div>'
            + '<div class="cart-item-right">'
            + '<div class="ci-total">Bs ' + fmtPrice(c.price * c.qty) + '</div>'
            + '<button class="ci-remove" onclick="removeFromCart(' + c.id + ')">✕</button>'
            + '</div></div>';
    }).join('');
    if (totalEl) {
        totalEl.innerHTML = '<div class="cart-total-row"><span>Subtotal</span><span>Bs ' + fmtPrice(subtotal) + '</span></div>'
            + '<div class="cart-total-grand"><span>Total</span><span>Bs ' + fmtPrice(subtotal) + '</span></div>';
    }
}

function openCart() { qs('#cartModal').classList.add('open'); qs('#cartOverlay').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCart() { qs('#cartModal').classList.remove('open'); qs('#cartOverlay').classList.remove('open'); document.body.style.overflow = ''; if (window._cartPoll) clearInterval(window._cartPoll); }

// ═══════════════════════════════════════════════════
// QR PAYMENT (redesigned)
// ═══════════════════════════════════════════════════
function generatePagayaQR() {
    if (!cart.length) return;
    if (!storeIsLoggedIn()) { showStoreAuth('login'); return; }
    var subtotal = cart.reduce(function(s, c) { return s + c.price * c.qty; }, 0);
    var items = cart.map(function(c) { return { sku: c.sku, name: c.name, qty: c.qty, price: c.price }; });
    var sucursal = 'La Paz';
    syncCartToServer().then(function(token) {
        return apiOrderRequest('checkout', { token: token, ciudad: sucursal, tipo_entrega: 'recojo' });
    }).then(function(result) {
        var pedido = result.pedido;
        var pedidoId = pedido.id;
        lastOrder = { id: pedidoId, date: new Date().toISOString(), items: items, total: pedido.total, sucursal: sucursal, status: 'pending', qr: result.qr || null };
        closeCart(); showQRPayment(pedidoId, pedido.total, items, sucursal);
    }).catch(function(err) { showToast(err.message || 'No se pudo crear el pedido'); });
}

function showQRPayment(pedidoId, total, items, sucursal) {
    var container = document.getElementById('qrContainer');
    var info = document.getElementById('qrOrderInfo');
    var confirmBtn = document.getElementById('qrConfirmBtn');
    var timer = document.getElementById('qrTimer');
    var modal = document.getElementById('qrModal');
    var overlay = document.getElementById('qrOverlay');
    var title = document.getElementById('qrTitle');
    var hint = document.getElementById('qrHint');
    var waBtn = document.getElementById('qrWaBtn');
    var statusMsg = document.getElementById('qrStatusMsg');
    var done = document.getElementById('qrPaymentDone');
    var bodyActions = document.getElementById('qrBodyActions');

    if (done) done.style.display = 'none';
    if (bodyActions) bodyActions.style.display = 'flex';
    if (title) title.textContent = 'Pagar con QR';
    if (hint) hint.textContent = 'Escaneá con tu app de banco';
    if (waBtn) waBtn.style.display = 'none';
    if (statusMsg) statusMsg.textContent = '';
    if (confirmBtn) confirmBtn.style.display = 'none';

    if (container) { container.innerHTML = '<div class="qr-spinner"></div>'; }
    if (info) { info.innerHTML = '<div class="qr-loading">Generando QR de pago...</div>'; }
    if (timer) timer.textContent = '⏱️ 5:00';

    modal.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    var qrRequest = lastOrder && lastOrder.qr ? Promise.resolve(lastOrder.qr) : pagayaCreateQR(total, 'MyShop ' + pedidoId, pedidoId);
    qrRequest
        .then(function(data) {
            if (!data || !data.success || !data.data) throw new Error(data && data.message || 'Error al generar QR');
            var qrData = data.data;
            lastOrder.qrId = qrData.qrId;
            lastOrder.referencia = qrData.referencia;
            lastOrder.uuid = qrData.uuid;

            var qrSrc = ensureDataUri(qrData.qrImage || '');
            if (container) {
                container.innerHTML = '<img src="' + qrSrc + '" alt="QR Pago" id="qrImageEl" style="width:180px;height:180px;border-radius:8px;">';
            }
            var dlBtn = document.getElementById('qrDownloadBtn');
            if (dlBtn) dlBtn.style.display = '';
            if (info) {
                info.innerHTML = '<div class="qr-order-detail">'
                    + '<div class="qr-order-pedido">Pedido <strong>' + pedidoId + '</strong></div>'
                    + '<div class="qr-order-total">Bs ' + fmtPrice(total) + '</div>'
                    + '<div class="qr-order-ref">Ref: ' + qrData.referencia + ' · 📍 ' + sucursal + '</div>'
                    + '</div>';
            }
            if (timer) timer.textContent = '⏱️ Tiempo restante: 5:00';
            if (confirmBtn) confirmBtn.style.display = 'none';
            if (waBtn) {
                var waMsg = encodeURIComponent('Hola, ya realicé el pago de mi pedido ' + pedidoId + ' por Bs ' + fmtPrice(total) + '. Adjunto comprobante.');
                waBtn.href = 'https://wa.me/59176219693?text=' + waMsg;
            }
            startQRTimer();
            startQRPolling(qrData.qrId, pedidoId);
        })
        .catch(function(err) {
            console.error(err);
            if (container) {
                container.innerHTML = '<div style="text-align:center;padding:10px;">'
                    + '<div style="font-size:32px;color:#999;margin-bottom:6px;">🏦</div>'
                    + '<div style="font-size:13px;font-weight:600;color:#1a1a2e;">Transferencia Bancaria</div>'
                    + '</div>';
            }
            if (info) {
                info.innerHTML = '<div class="qr-order-detail">'
                    + '<div class="qr-order-pedido">Pedido <strong>' + pedidoId + '</strong></div>'
                    + '<div class="qr-order-total">Bs ' + fmtPrice(total) + '</div>'
                    + '</div>'
                    + '<div style="text-align:left;background:#f8fafc;border-radius:10px;padding:12px;margin-top:6px;font-size:12px;">'
                    + '<div style="padding:2px 0;"><span style="color:#888;">Banco:</span> <strong>BCP</strong></div>'
                    + '<div style="padding:2px 0;"><span style="color:#888;">Nro:</span> <strong>123-4567890-1-23</strong></div>'
                    + '<div style="padding:2px 0;"><span style="color:#888;">Titular:</span> <strong>MyShop Bolivia</strong></div>'
                    + '<div style="padding:2px 0;"><span style="color:#888;">Monto:</span> <strong>Bs ' + fmtPrice(total) + '</strong></div>'
                    + '<div style="padding:2px 0;"><span style="color:#888;">Ref:</span> <strong>' + pedidoId + '</strong></div>'
                    + '</div>';
            }
            if (timer) timer.textContent = 'Datos bancarios';
            if (confirmBtn) { confirmBtn.style.display = 'none'; }
            if (waBtn) { waBtn.style.display = 'inline-flex'; waBtn.classList.add('qr-btn', 'qr-btn-wa'); }
        });
}

function pagayaCreateQR(monto, descripcion, pedidoId) {
    return Promise.reject(new Error('El QR se genera al crear el pedido'));
}

function pagayaCheckStatus(qrId) {
    return fetch(SHOP_CONFIG.orderApi + '?action=pedido&id=' + encodeURIComponent(lastOrder ? lastOrder.id : ''), { headers: authToken ? { Authorization: 'Bearer ' + authToken } : {} }).then(function(r) { return r.json(); }).then(function(d) { return { data: { estado: d.pedido && d.pedido.estado_pago === 'pagado' ? 'completado' : 'pendiente' } }; });
}

function downloadQR() {
    var img = document.getElementById('qrImageEl');
    if (!img || !img.src) return;
    var link = document.createElement('a');
    link.download = 'QR_Pago_MyShop.png';
    link.href = img.src;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function startQRTimer() {
    var secs = 300;
    var timer = document.getElementById('qrTimer');
    if (window._qrTimer) clearInterval(window._qrTimer);
    window._qrTimer = setInterval(function() {
        secs--;
        if (timer) timer.textContent = '⏱️ ' + Math.floor(secs/60) + ':' + String(secs%60).padStart(2,'0');
        if (secs <= 0) { clearInterval(window._qrTimer); if (timer) timer.textContent = '⌛ Expirado'; if (window._qrPoll) clearInterval(window._qrPoll); }
    }, 1000);
}

function startQRPolling(qrId, pedidoId) {
    if (window._qrPoll) clearInterval(window._qrPoll);
    var attempts = 0;
    window._qrPoll = setInterval(function() {
        attempts++;
        if (_paymentConfirmed) { clearInterval(window._qrPoll); return; }
        if (attempts > 60) {
            clearInterval(window._qrPoll);
            var confirmBtn = document.getElementById('qrConfirmBtn');
            if (confirmBtn) { confirmBtn.style.display = 'none'; }
            var timer = document.getElementById('qrTimer');
            if (timer) timer.textContent = '⌛ Tiempo agotado';
            return;
        }
        pagayaCheckStatus(qrId).then(function(data) {
            if (_paymentConfirmed) { clearInterval(window._qrPoll); return; }
            if (data && data.data && data.data.estado === 'completado') { clearInterval(window._qrPoll); clearInterval(window._qrTimer); handlePaymentConfirmed(pedidoId); }
        }).catch(function() {});
    }, 3000);
}

function handlePaymentConfirmed(pedidoId) {
    if (_paymentConfirmed) return;
    if (!lastOrder || lastOrder.status === 'paid') return;
    _paymentConfirmed = true;
    lastOrder.status = 'paid';
    var total = lastOrder.total;
    if (window._qrPoll) clearInterval(window._qrPoll);
    if (window._qrTimer) clearInterval(window._qrTimer);

    var title = document.getElementById('qrTitle');
    var timer = document.getElementById('qrTimer');
    var container = document.getElementById('qrContainer');
    var info = document.getElementById('qrOrderInfo');
    var confirmBtn = document.getElementById('qrConfirmBtn');
    var waBtn = document.getElementById('qrWaBtn');
    var statusMsg = document.getElementById('qrStatusMsg');
    var bodyActions = document.getElementById('qrBodyActions');
    var done = document.getElementById('qrPaymentDone');

    if (title) title.textContent = '🎉 Pago Confirmado';
    if (timer) timer.textContent = '✅ Pagado';
    if (container) container.innerHTML = '<div style="font-size:56px;line-height:1;">✅</div>';
    if (info) info.innerHTML = '';
    if (confirmBtn) confirmBtn.style.display = 'none';
    if (waBtn) waBtn.style.display = 'none';
    if (statusMsg) statusMsg.textContent = '';
    if (bodyActions) bodyActions.style.display = 'none';

    if (done) {
        var itemsHtml = lastOrder.items.map(function(c) {
            return '<div style="font-size:12px;color:#555;padding:2px 0;">• ' + escapeHtml(c.name) + ' x' + c.qty + ' - Bs ' + fmtPrice(c.price * c.qty) + '</div>';
        }).join('');
        var waMsg = encodeURIComponent('*Pedido Confirmado!*\n\nID: ' + pedidoId + '\n' + lastOrder.items.map(function(c) { return '• ' + c.name + ' x' + c.qty + ' = Bs ' + fmtPrice(c.price * c.qty); }).join('\n') + '\n\n*Total: Bs ' + fmtPrice(total) + '*\n📍 ' + lastOrder.sucursal + '\n\nGracias! 🎉');

        done.style.display = 'block';
        done.innerHTML = '<div class="pay-check">✅</div>'
            + '<div class="pay-title">¡Pago Confirmado!</div>'
            + '<div class="pay-pedido">Pedido ' + pedidoId + '</div>'
            + '<div class="pay-total">Bs ' + fmtPrice(total) + '</div>'
            + '<div style="text-align:left;margin:6px 0;padding:8px;background:#f8fafc;border-radius:8px;">' + itemsHtml + '</div>'
            + '<a class="qr-btn qr-btn-wa" href="https://wa.me/59176219693?text=' + waMsg + '" target="_blank" style="display:inline-flex;width:100%;">'
            + '  <svg class="wa-icon" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'
            + '  Enviar comprobante por WhatsApp'
            + '</a>';
    }

    cart = [];
    updateCart();
    showToast('✅ Pedido ' + pedidoId + ' confirmado');
    setTimeout(function() { launchConfetti(); }, 300);
}

function closeQR() {
    if (window._qrPoll) clearInterval(window._qrPoll);
    if (window._qrTimer) clearInterval(window._qrTimer);
    qs('#qrModal').classList.remove('open'); qs('#qrOverlay').classList.remove('open');
    document.body.style.overflow = '';
    _paymentConfirmed = false;
}
function closeQRModal() { closeQR(); window._pendingPayment = null; }

// ─── CONFETTI ────────────────────────────────────
function launchConfetti() {
    var colors = ['#ff4b4b', '#ff6b35', '#ffd93d', '#6bcb77', '#4d96ff', '#9b59b6', '#ff6b9d'];
    for (var i = 0; i < 50; i++) {
        (function() {
            var el = document.createElement('div');
            el.className = 'confetti-piece';
            var size = Math.random() * 8 + 4;
            var color = colors[Math.floor(Math.random() * colors.length)];
            var startX = Math.random() * window.innerWidth;
            el.style.cssText = 'left:' + startX + 'px;top:-10px;width:' + size + 'px;height:' + (size * 1.5) + 'px;background:' + color + ';border-radius:' + (Math.random() > 0.5 ? '50%' : '2px') + ';';
            document.body.appendChild(el);
            var duration = Math.random() * 1200 + 600;
            var startTime = Date.now();
            function fall() {
                var elapsed = Date.now() - startTime;
                var progress = Math.min(elapsed / duration, 1);
                el.style.transform = 'translateX(' + (Math.sin(progress * Math.PI * 4) * 60) + 'px) translateY(' + (progress * (Math.random() * 300 + 200)) + 'px) rotate(' + (progress * 720) + 'deg)';
                el.style.opacity = 1 - progress;
                if (progress < 1) requestAnimationFrame(fall);
                else el.remove();
            }
            requestAnimationFrame(fall);
        })();
    }
}

// ═══════════════════════════════════════════════════
// CHAT ASISTENTE IA
// ═══════════════════════════════════════════════════
var chatHistory = [];
var chatBusy = false;
var chatContextProduct = null;
var chatInitialized = false;

var CHAT_SUGGESTIONS = [
    '¿Qué tablets me recomiendan?',
    'Busco un parlante Bluetooth',
    '¿Qué cámara de seguridad comprar?',
    'Audífonos para trabajar',
    '¿Hacen envíos a todo el país?'
];

function getChatEl(id) { return document.getElementById(id); }

function initChatWidget() {
    if (chatInitialized) return;
    chatInitialized = true;

    var fab = getChatEl('chatFab');
    var widget = getChatEl('chatWidget');
    var close = getChatEl('chatClose');
    var send = getChatEl('chatSend');
    var input = getChatEl('chatInput');
    var recClose = getChatEl('recClose');
    var overlay = getChatEl('recOverlay');

    if (fab) fab.addEventListener('click', function() {
        if (widget && widget.classList.contains('open')) closeChat();
        else openChat();
    });
    if (close) close.addEventListener('click', closeChat);
    if (send) send.addEventListener('click', function() { sendChatMessage(); });

    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
        });
        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 90) + 'px';
        });
    }

    var sugWrap = getChatEl('chatSuggestions');
    if (sugWrap) {
        sugWrap.innerHTML = CHAT_SUGGESTIONS.map(function(s) {
            return '<button class="chat-suggestion" data-s="' + s.replace(/"/g, '&quot;') + '">' + s + '</button>';
        }).join('');
        sugWrap.addEventListener('click', function(e) {
            var b = e.target.closest('.chat-suggestion');
            if (b) sendChatMessage(b.dataset.s);
        });
    }

    if (recClose) recClose.addEventListener('click', closeRecModal);
    if (overlay) overlay.addEventListener('click', closeRecModal);

    addBotMessage('¡Hola! 👋 Soy el asistente de MyShop Bolivia.<br><br>Contame qué buscás: <b>tablets, parlantes, cámaras, redes, audífonos, alarmas</b>... te ayudo a elegir el producto ideal según tu presupuesto y te lo muestro al instante. 🛍️');
}

function openChat() {
    initChatWidget();
    var widget = getChatEl('chatWidget');
    var fab = getChatEl('chatFab');
    if (widget) widget.classList.add('open');
    if (fab) fab.classList.add('hidden-badge');
    renderChatContext();
    setTimeout(function() { var i = getChatEl('chatInput'); if (i) i.focus(); }, 120);
}

function closeChat() {
    var widget = getChatEl('chatWidget');
    if (widget) widget.classList.remove('open');
}

function openChatWithProduct(p) {
    if (!p) return;
    initChatWidget();
    openChat();
    chatContextProduct = p;
    renderChatContext();
    askAssistant('Explicame este producto en detalle');
}

function renderChatContext() {
    var ctx = getChatEl('chatContext');
    if (!ctx) return;
    if (chatContextProduct) {
        ctx.style.display = 'flex';
        ctx.innerHTML = '<div class="chat-context-info">'
            + '<div class="chat-context-label">Producto consultado</div>'
            + '<div class="chat-context-name">' + escapeHtml(chatContextProduct.name) + '</div>'
            + '</div>'
            + '<button class="chat-context-clear" id="chatContextClear">Quitar ✕</button>';
        var clearBtn = getChatEl('chatContextClear');
        if (clearBtn) clearBtn.addEventListener('click', function() { chatContextProduct = null; renderChatContext(); });
    } else {
        ctx.style.display = 'none';
        ctx.innerHTML = '';
    }
}

function scrollChatToBottom() {
    var msgs = getChatEl('chatMessages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function addUserMessage(text) {
    var msgs = getChatEl('chatMessages');
    if (!msgs) return;
    var div = document.createElement('div');
    div.className = 'chat-msg user';
    div.innerHTML = '<div class="chat-msg-avatar">👤</div><div class="chat-msg-bubble">' + escapeHtml(text) + '</div>';
    msgs.appendChild(div);
    scrollChatToBottom();
}

function addBotMessage(html) {
    var msgs = getChatEl('chatMessages');
    if (!msgs) return;
    var div = document.createElement('div');
    div.className = 'chat-msg bot';
    div.innerHTML = '<div class="chat-msg-avatar">🤖</div><div class="chat-msg-bubble">' + html + '</div>';
    msgs.appendChild(div);
    scrollChatToBottom();
}

function showTyping() {
    var msgs = getChatEl('chatMessages');
    if (!msgs) return;
    var div = document.createElement('div');
    div.className = 'chat-msg bot';
    div.id = 'chatTyping';
    div.innerHTML = '<div class="chat-msg-avatar">🤖</div><div class="chat-msg-bubble chat-typing"><span></span><span></span><span></span></div>';
    msgs.appendChild(div);
    scrollChatToBottom();
}

function hideTyping() {
    var t = getChatEl('chatTyping');
    if (t) t.remove();
}

function renderChatProductCards(ids) {
    var cards = '';
    ids.forEach(function(id) {
        var p = allProducts.find(function(x) { return x.id === id; });
        if (!p) return;
        var st = getTotalStock(p);
        var ok = stockDisponible(st);
        cards += '<div class="chat-product" onclick="openProductModal(' + p.id + ')">'
            + '<img class="chat-product-img" src="' + (p.images && p.images[0] ? p.images[0] : '') + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">'
            + '<div class="chat-product-info">'
            + '<div class="chat-product-name">' + escapeHtml(p.name) + '</div>'
            + '<div class="chat-product-price">Bs ' + fmtPrice(p.price) + '</div>'
            + '<div class="chat-product-stock' + (ok ? '' : ' agotado') + '">' + (ok ? 'En stock' : 'Agotado') + '</div>'
            + '</div>'
            + (ok ? '<button class="chat-product-add" onclick="event.stopPropagation();addToCart(' + p.id + ');">+</button>' : '')
            + '</div>';
    });
    return cards;
}

function renderRecModal(ids) {
    var body = getChatEl('recBody');
    if (!body) return;
    if (!ids.length) {
        body.innerHTML = '<div class="rec-empty">No hay productos para mostrar</div>';
    } else {
        body.innerHTML = ids.map(function(id) {
            var p = allProducts.find(function(x) { return x.id === id; });
            if (!p) return '';
            var st = getTotalStock(p);
            var ok = stockDisponible(st);
            return '<div class="rec-card">'
                + '<img class="rec-card-img" src="' + (p.images && p.images[0] ? p.images[0] : '') + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onclick="openProductModal(' + p.id + ')" onerror="this.style.visibility=\'hidden\'">'
                + '<div class="rec-card-body">'
                + '<div class="rec-card-marca">' + escapeHtml(p.marca || '') + '</div>'
                + '<div class="rec-card-name" onclick="openProductModal(' + p.id + ')">' + escapeHtml(p.name) + '</div>'
                + '<div class="rec-card-price">Bs ' + fmtPrice(p.price) + '</div>'
                + '<div class="rec-card-stock ' + (ok ? 'ok' : 'agotado') + '">' + (ok ? '● En stock (' + st + ' u.)' : '● Agotado') + '</div>'
                + '<div class="rec-card-actions">'
                + '<button class="rec-card-btn view" onclick="openProductModal(' + p.id + ')">Ver</button>'
                + (ok ? '<button class="rec-card-btn add" onclick="addToCart(' + p.id + ');closeRecModal();">Agregar</button>' : '')
                + '</div></div></div>';
        }).join('');
    }
    var overlay = getChatEl('recOverlay');
    var modal = getChatEl('recModal');
    if (overlay) overlay.classList.add('open');
    if (modal) modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeRecModal() {
    var overlay = getChatEl('recOverlay');
    var modal = getChatEl('recModal');
    if (overlay) overlay.classList.remove('open');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
}

function sendChatMessage(pretext) {
    if (chatBusy) return;
    var input = getChatEl('chatInput');
    var text = (pretext || '').trim() || (input ? input.value.trim() : '');
    if (!text) return;
    if (input) { input.value = ''; input.style.height = 'auto'; }
    askAssistant(text);
}

function formatBotText(text) {
    var html = escapeHtml(text || '');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/(?:^|<br>)\s*[•·]\s+/g, '<br>• ');
    return html;
}

function askAssistant(text) {
    if (chatBusy) return;
    chatBusy = true;
    addUserMessage(text);
    chatHistory.push({ role: 'user', content: text });
    showTyping();
    var sendBtn = getChatEl('chatSend');
    if (sendBtn) sendBtn.disabled = true;

    var payload = {
        message: text,
        history: chatHistory.slice(-16),
        product: chatContextProduct ? {
            id: chatContextProduct.id,
            name: chatContextProduct.name,
            marca: chatContextProduct.marca || '',
            price: chatContextProduct.price,
            stock: getTotalStock(chatContextProduct),
            spec: chatContextProduct.description || chatContextProduct.spec || '',
            cat: chatContextProduct.cat || '',
            sku: chatContextProduct.sku || ''
        } : null
    };

    fetch(SHOP_CONFIG.apiBase + '/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        hideTyping();
        chatBusy = false;
        if (sendBtn) sendBtn.disabled = false;
        if (!data || !data.success) {
            var err = (data && data.error) ? data.error : 'Error desconocido';
            addBotMessage('😕 Lo siento, tuve un problema: <b>' + escapeHtml(err) + '</b>. ¿Podés repetir tu consulta?');
            return;
        }
        var text = data.text || '';
        var ids = data.product_ids || [];
        chatHistory.push({ role: 'assistant', content: text });

        var html = formatBotText(text);
        if (ids.length) {
            html += '<div class="chat-products">' + renderChatProductCards(ids) + '</div>';
            html += '<button class="chat-open-modal" onclick="renderRecModal([' + ids.join(',') + '])">✨ Ver recomendaciones en detalle</button>';
        }
        addBotMessage(html);
    })
    .catch(function() {
        hideTyping();
        chatBusy = false;
        if (sendBtn) sendBtn.disabled = false;
        addBotMessage('😕 No pude conectar con el asistente. Verificá tu conexión e intentá de nuevo.');
    });
}

// ═══════════════════════════════════════════════════
// DOM EVENTS
// ═══════════════════════════════════════════════════
// ═══ Logo swap on scroll ═══
var lastScrollY = 0;
window.addEventListener('scroll', function() {
    var header = document.querySelector('.header');
    if (!header) return;
    if (window.scrollY > 80) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
}, { passive: true });

document.addEventListener('DOMContentLoaded', function() {
    applyStoreLock();
    loadProducts();

    if (!storeIsLoggedIn() && sessionStorage.getItem(STORE_AUTH_DISMISSED_KEY) !== '1') {
        setTimeout(function() { showStoreAuth('login'); }, 350);
    }

    var profileBtn = qs('#profileBtn');
    if (profileBtn) profileBtn.addEventListener('click', function() { showStoreAuth('login'); });

    // Cart
    qs('#cartBtn').addEventListener('click', function() { if (!storeIsLoggedIn()) { showStoreAuth('login'); return; } openCart(); });
    qs('#cartClose').addEventListener('click', closeCart);
    qs('#cartOverlay').addEventListener('click', closeCart);
    qs('#checkoutBtn').addEventListener('click', function() { if (!cart.length) { showToast('El carrito está vacío'); return; } generatePagayaQR(); });

    // QV close
    qs('#qvClose').addEventListener('click', closeQuickView);
    qs('#qvOverlay').addEventListener('click', closeQuickView);

    // Carousel nav
    qs('#qvCarouselPrev').addEventListener('click', function(e) { e.stopPropagation(); prevCarousel(); });
    qs('#qvCarouselNext').addEventListener('click', function(e) { e.stopPropagation(); nextCarousel(); });

    // QR close
    qs('#qrClose').addEventListener('click', closeQR);
    qs('#qrCloseBtn').addEventListener('click', closeQR);
    qs('#qrOverlay').addEventListener('click', closeQR);

    // QR confirm button (inside body)
    qs('#qrConfirmBtn').addEventListener('click', function() { if (lastOrder) handlePaymentConfirmed(lastOrder.id); });

    // Search
    qs('#searchToggle').addEventListener('click', function() {
        var hs = document.getElementById('headerSearch');
        hs.classList.toggle('open');
        if (hs.classList.contains('open')) setTimeout(function() { qs('#searchInput').focus(); }, 100);
    });

    var searchInput = qs('#searchInput');
    var searchClear = qs('#searchClear');
    if (searchInput && searchClear) {
        searchInput.addEventListener('input', function() {
            // Preserve brand selection - search only filters the search term
            searchClear.classList.toggle('show', searchInput.value.length > 0);
            currentFilter.search = searchInput.value.trim().toLowerCase();
            displayedCount = 0;
            applyFilters();
        });
        searchClear.addEventListener('click', function() {
            searchInput.value = '';
            searchClear.classList.remove('show');
            searchInput.focus();
            currentFilter.search = '';
            displayedCount = 0;
            // Keep marca intact
            applyFilters();
        });
    }

    // Stock filter
    qs('#stockFilter').addEventListener('change', function() { displayedCount = 0; applyFilters(); });

    // Sort
    qs('#sortSelect').addEventListener('change', function() { currentFilter.sort = this.value; displayedCount = 0; applyFilters(); });

    // Price chips
    qsa('.price-chip').forEach(function(btn) {
        btn.addEventListener('click', function() {
            qsa('.price-chip').forEach(function(c) { c.classList.remove('active'); });
            this.classList.add('active');
            currentFilter.priceRange = this.dataset.range;
            displayedCount = 0;
            applyFilters();
        });
    });

    // Clear all
    qs('#clearAllBtn').addEventListener('click', function() {
        setBrand('');
        currentFilter.priceRange = 'all';
        currentFilter.search = '';
        currentFilter.sort = 'default';
        if (qs('#searchInput')) qs('#searchInput').value = '';
        if (qs('#sortSelect')) qs('#sortSelect').value = 'default';
        qsa('.price-chip').forEach(function(c) { c.classList.toggle('active', c.dataset.range === 'all'); });
        var cb = document.getElementById('stockFilter');
        if (cb) cb.checked = false;
        displayedCount = 0;
        applyFilters();
    });

    // Load more
    qs('#loadMoreBtn').addEventListener('click', function() { renderProducts(); });

    // ═══ Mobile Brand Drawer ═══
    var menuBtn = qs('#menuBtn');
    var drawer = qs('#brandDrawer');
    var drawerOverlay = qs('#brandDrawerOverlay');
    var drawerClose = qs('#brandDrawerClose');

    if (menuBtn && drawer && drawerOverlay) {
      menuBtn.addEventListener('click', function() {
        drawerOverlay.classList.add('open');
        drawer.classList.add('open');
        document.body.style.overflow = 'hidden';
        // Populate drawer body if empty
        populateBrandDrawer();
      });
    }
    if (drawerOverlay) {
      drawerOverlay.addEventListener('click', function() {
        closeBrandDrawer();
      });
    }
    if (drawerClose) {
      drawerClose.addEventListener('click', function() {
        closeBrandDrawer();
      });
    }

    // ═══ Brand drawer item clicks (event delegation) ═══
    var drawerBody = qs('#brandDrawerBody');
    if (drawerBody) {
      drawerBody.addEventListener('click', function(e) {
        var item = e.target.closest('.sidebar-brand-item');
        if (!item) return;
        var marca = item.dataset.marca;
        setBrand(marca);
        closeBrandDrawer();
      });
    }

    // ═══ Mobile Filter Panel ═══
    var filterToggle = qs('#filterToggleBtn');
    var filterPanel = qs('#filterPanel');
    var filterOverlay = qs('#filterOverlay');
    var filterPanelClose = qs('#filterPanelClose');
    var mobileFilterApply = qs('#mobileFilterApply');

    if (filterToggle && filterPanel && filterOverlay) {
      filterToggle.addEventListener('click', function() {
        // Sync mobile filter state from current
        syncMobileFilters();
        filterOverlay.classList.add('open');
        filterPanel.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    }
    if (filterOverlay) {
      filterOverlay.addEventListener('click', function() {
        closeFilterPanel();
      });
    }
    if (filterPanelClose) {
      filterPanelClose.addEventListener('click', function() {
        closeFilterPanel();
      });
    }
    if (mobileFilterApply) {
      mobileFilterApply.addEventListener('click', function() {
        applyMobileFilters();
        closeFilterPanel();
      });
    }

    // Sync mobile price chips
    qsa('.mchip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        qsa('.mchip').forEach(function(c) { c.classList.remove('active'); });
        this.classList.add('active');
      });
    });

    // Keyboard: Escape close modals
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (qs('#qrModal.open')) closeQR();
            else if (qs('#qvModal.open')) closeQuickView();
            else if (qs('#cartModal.open')) closeCart();
        }
    });
});
