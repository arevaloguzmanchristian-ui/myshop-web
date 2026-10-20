// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
// DIGISHOP v9 - Brand Carousel + Filter Bar + Offers
// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=

var SHOP_CONFIG = {
    apiBase: window.location.origin + '/api',
    orderApi: window.location.origin + '/api/myshop_api.php',
    supportPhone: '+59176219693',
    currency: 'Bs',
};

window.trackAffClick = function(codigo, sku) {
    try {
        codigo = String(codigo || '').trim().toUpperCase();
        if (!/^[A-Z0-9_-]{2,64}$/.test(codigo)) return;
        var query = 'action=track_click&codigo=' + encodeURIComponent(codigo);
        if (sku) query += '&sku=' + encodeURIComponent(sku);
        navigator.sendBeacon('/api/myshop_api.php?' + query) || fetch('/api/myshop_api.php?' + query, { method: 'GET', keepalive: true }).catch(function() {});
    } catch (e) {}
};

var products = [];
var allProducts = [];
var cart = [];
var lastOrder = null;
var _paymentConfirmed = false;
var authToken = localStorage.getItem('ms_token') || sessionStorage.getItem('ms_token') || '';
var storeAuthValidated = false;
var storeAuthMode = 'login';
var STORE_AUTH_DISMISSED_KEY = 'myshop_auth_dismissed';
var googleIdentityInitialized = false;
var googleClientConfigPromise = null;
function googleAuthError(message) { var error = document.getElementById('storeAuthError'); if (error) error.textContent = message; }
function ensureGoogleAuthStyles() {
    if (document.getElementById('storeGoogleAuthStyles')) return;
    var style = document.createElement('style'); style.id = 'storeGoogleAuthStyles';
    style.textContent = '.store-auth-google{display:flex;justify-content:center;margin:0 0 12px}.store-auth-divider{display:flex;align-items:center;gap:9px;margin:2px 0 12px;color:#94a3b8;font-size:11px}.store-auth-divider:before,.store-auth-divider:after{content:"";height:1px;background:#e2e8f0;flex:1}.store-auth-divider span{white-space:nowrap}';
    document.head.appendChild(style);
}
function getGoogleClientConfig() {
    if (!googleClientConfigPromise) {
        googleClientConfigPromise = fetch(SHOP_CONFIG.orderApi + '?action=auth_google_config', { credentials: 'same-origin' }).then(function(response) { return response.json(); }).then(function(data) {
            if (!data || !data.success || !data.enabled || !data.client_id) throw new Error('El acceso con Google no está configurado');
            return data.client_id;
        });
    }
    return googleClientConfigPromise;
}
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
}
function isInAppBrowser() {
    var ua = (navigator.userAgent || '').toLowerCase();
    return /(wv\/|okhttp|fb\/|line\/|instagram\/|linkedin\/|whatsapp\/)/.test(ua) || (/mobile/.test(ua) && /android/.test(ua) && !/chrome\//.test(ua));
}
function renderGoogleSignIn(attempt) {
    var target = document.getElementById('storeGoogleSignIn');
    if (!target || target.dataset.rendered === '1') return;
    if (isInAppBrowser()) {
        var t = document.getElementById('storeGoogleSignIn');
        if (t) { t.innerHTML = '<i style="font-size:11px;color:#94a3b8;">En este navegador no se puede usar Google, usá tu WhatsApp.</i>'; }
        return;
    }
    if (!(window.google && google.accounts && google.accounts.id)) {
        if ((attempt || 0) < 60) setTimeout(function() { renderGoogleSignIn((attempt || 0) + 1); }, 150);
        return;
    }
    getGoogleClientConfig().then(function(clientId) {
        if (!googleIdentityInitialized) {
            google.accounts.id.initialize({ client_id: clientId, callback: window.handleGoogleCredential, auto_select: false, cancel_on_tap_outside: false, itp_support: true, use_fedcm_for_prompt: false });
            googleIdentityInitialized = true;
        }
        if (!target.dataset.rendered) {
            google.accounts.id.renderButton(target, { theme: 'outline', size: 'large', text: 'continue_with', width: Math.min(target.parentNode.clientWidth || 320, 334), shape: 'rectangular' });
            target.dataset.rendered = '1';
        }
    }).catch(function() { target.style.display = 'none'; });
}
window.handleGoogleCredential = function(response) {
    if (!response || !response.credential) { googleAuthError('Google no devolvió una credencial válida'); return; }
    googleAuthError('');
    fetch(SHOP_CONFIG.orderApi + '?action=auth_google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
    }).then(function(r) { return r.text().then(function(raw) { var d; try { d = raw ? JSON.parse(raw) : null; } catch (e) { throw new Error('Respuesta inválida del servidor (' + r.status + ')'); } if (r.status === 401 || r.status === 403 || r.status === 503) throw new Error(d && d.error ? d.error : 'Error del servidor (' + r.status + ')'); if (!d) throw new Error('Sin datos del servidor'); if (!r.ok || !d.success) throw new Error(d.error || 'Error al iniciar sesión con Google'); return d; }); }).then(function(result) {
        if (!result.token) throw new Error('El servidor no devolvió una sesión válida');
        saveStoreToken(result.token);
        try { sessionStorage.removeItem(STORE_AUTH_DISMISSED_KEY); } catch (e) {}
        closeStoreAuth(); applyStoreLock(); renderProducts(); showToast('Sesión iniciada. Completa tus datos de entrega antes de pagar');
    }).catch(function(error) { googleAuthError(error.message || 'Error al conectar con Google'); });
};
function isUsableToken(token) { return !!token && !/^(?:false|null|undefined|0)$/i.test(String(token).trim()); }
function getCookieValue(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
}
function getStoreToken() {
    var token = localStorage.getItem('ms_token') || sessionStorage.getItem('ms_token') || '';
    if (!isUsableToken(token)) token = getCookieValue('ms_token');
    return isUsableToken(token) ? token : '';
}
function saveStoreToken(token) {
    authToken = isUsableToken(token) ? token : '';
    storeAuthValidated = !!authToken;
    if (authToken) {
        localStorage.setItem('ms_token', authToken);
        localStorage.setItem('aff_token', authToken);
        try { document.cookie = 'ms_token=' + encodeURIComponent(authToken) + '; path=/; max-age=2592000; SameSite=Strict; Secure'; } catch (e) {}
    }
}
function clearStoreSession() {
    authToken = '';
    storeAuthValidated = false;
    storeProfile = null;
    localStorage.removeItem('ms_token');
    localStorage.removeItem('aff_token');
    sessionStorage.removeItem('ms_token');
    try { document.cookie = 'ms_token=; path=/; max-age=0; SameSite=Strict; Secure'; } catch (e) {}
}
function handleUnauthorized() {
    clearStoreSession();
    closeStoreProfileMenu();
    applyStoreLock();
    updateAffChatVisibility();
    showStoreAuth('login');
}
function storeIsLoggedIn() { return storeAuthValidated && !!authToken; }
var storeAffPublic = (function() {
    try { return window.location.pathname.indexOf('/afiliado') !== -1 || (new URLSearchParams(window.location.search)).get('mode') === 'afiliado'; } catch (e) { return false; }
})();
if (storeAffPublic) { try { document.body.classList.add('aff-public'); } catch (e) {} }
function hideChatUI() {
    var fab = document.getElementById('chatFab');
    if (fab) fab.style.display = 'none';
    var w = document.getElementById('chatWidget');
    if (w) w.style.display = 'none';
}
function isLargeLayout() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches;}
function applyCotizSplit(open) {
    if (!isLargeLayout()) return;
    document.body.classList.toggle('cotiz-split', !!open);
    if (open) {
        var w = getChatEl('chatWidget');
        if (w && !w.classList.contains('open')) { try { openChat(); } catch (e) {} }
    }
}
function updateAffChatVisibility() {
    var fab = document.getElementById('chatFab');
    var w = document.getElementById('chatWidget');
    if (!storeIsLoggedIn()) {
        if (fab) fab.style.display = 'none';
        if (w) w.style.display = 'none';
        return;
    }
    if (fab) { fab.style.display = ''; fab.classList.remove('hidden-badge'); }
    if (w) w.style.display = '';
}
function validateStoreToken() {
    var token = getStoreToken();
    storeAuthValidated = false;
    if (!token) { authToken = ''; return Promise.resolve(false); }
    authToken = token;
    return apiOrderRequest('auth_me', null, 'GET').then(function() {
        storeAuthValidated = true;
        return true;
    }).catch(function() {
        clearStoreSession();
        return false;
    });
}
function showStoreAuth(mode) {
    storeAuthMode = mode || 'login';
    ensureGoogleAuthStyles();
    try { hideChatUI(); } catch (e) {}
    var overlay = document.getElementById('storeAuthOverlay');
    if (!overlay) {
        overlay = document.createElement('div'); overlay.id = 'storeAuthOverlay';
        overlay.innerHTML = '<div class="store-auth-modal"><button class="store-auth-close" type="button">' + (typeof AFF_ICON !== 'undefined' ? AFF_ICON.x : '×') + '</button><div class="store-auth-kicker">MI CUENTA MYSHOP</div><h2 id="storeAuthTitle"></h2><p id="storeAuthMessage">Inicia sesión o regístrate para consultar precios, comparar productos y comprar con seguridad.</p><div id="storeGoogleSignIn" class="store-auth-google" aria-label="Continuar con Google"></div><div class="store-auth-divider"><span>o continúa con WhatsApp</span></div><div id="storeAuthNameWrap"><input id="storeAuthName" placeholder="Tu nombre"></div><input id="storeAuthWhatsapp" placeholder="WhatsApp" inputmode="tel"><input id="storeAuthPassword" type="password" placeholder="Contraseña (mínimo 6 caracteres)"><button id="storeAuthSubmit" type="button"></button><button id="storeAuthSwitch" type="button" class="store-auth-switch"></button><div id="storeAuthError" class="store-auth-error"></div></div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeStoreAuth(); });
        overlay.querySelector('.store-auth-close').onclick = closeStoreAuth;
        overlay.querySelector('#storeAuthSwitch').onclick = function() { showStoreAuth(storeAuthMode === 'login' ? 'register' : 'login'); };
        overlay.querySelector('#storeAuthSubmit').onclick = submitStoreAuth;
    }
    overlay.classList.add('open');
    document.getElementById('storeAuthTitle').textContent = storeAuthMode === 'login' ? 'Inicia sesión' : 'Regístrate gratis';
    document.getElementById('storeAuthSubmit').textContent = storeAuthMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
    document.getElementById('storeAuthSwitch').textContent = storeAuthMode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión';
    document.getElementById('storeAuthNameWrap').style.display = storeAuthMode === 'login' ? 'none' : 'block';
    document.getElementById('storeAuthError').textContent = '';
    renderGoogleSignIn();
}
function closeStoreAuth() { var el = document.getElementById('storeAuthOverlay'); if (el) { el.classList.remove('open'); try { sessionStorage.setItem(STORE_AUTH_DISMISSED_KEY, '1'); } catch (e) {} }
    try {
        if (storeAffPublic) { updateAffChatVisibility(); }
        else {
            var fab = document.getElementById('chatFab'); if (fab) fab.style.display = '';
            var w = document.getElementById('chatWidget'); if (w) w.style.display = '';
        }
    } catch (e) {}
}
function submitStoreAuth() {
    var error = document.getElementById('storeAuthError');
    var body = { whatsapp: document.getElementById('storeAuthWhatsapp').value.trim(), password: document.getElementById('storeAuthPassword').value };
    if (storeAuthMode === 'register') body.nombre = document.getElementById('storeAuthName').value.trim();
    var btn = document.getElementById('storeAuthSubmit'); btn.disabled = true;
    apiOrderRequest('auth_' + storeAuthMode, body).then(function(r) { if (!r.token) throw new Error('El servidor no devolvió una sesión válida'); saveStoreToken(r.token); try { sessionStorage.removeItem(STORE_AUTH_DISMISSED_KEY); } catch (e) {} closeStoreAuth(); applyStoreLock(); renderProducts(); showToast('Sesión iniciada. Ya puedes ver precios y comprar'); }).catch(function(e) { error.textContent = e.message; }).then(function(){ btn.disabled = false; });
}

var storeProfile = null;
var storeProfileMenuOpen = false;
var storeProfileTab = 'summary';
var storeProfilePanelCloseTimer = null;
function closeStoreProfileMenu(restoreFocus) {
    var menu = document.getElementById('storeProfileMenu');
    var overlay = document.getElementById('storeProfilePanelOverlay');
    var btn = document.getElementById('profileBtn');
    storeProfileMenuOpen = false;
    if (menu) menu.style.transform = 'translateX(100%)';
    if (overlay) { overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }
    clearTimeout(storeProfilePanelCloseTimer);
    storeProfilePanelCloseTimer = setTimeout(function() {
        if (!storeProfileMenuOpen) {
            if (menu) menu.style.visibility = 'hidden';
            if (overlay) overlay.style.visibility = 'hidden';
        }
    }, 350);
    if (btn) {
        btn.setAttribute('aria-expanded', 'false');
        if (restoreFocus) btn.focus();
    }
}
function renderStoreProfileMenu() {
    var menu = document.getElementById('storeProfileMenu');
    if (!menu) {
        var overlay = document.createElement('div'); overlay.id = 'storeProfilePanelOverlay'; overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,0.5);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity 0.3s;';
        overlay.addEventListener('click', closeStoreProfileMenu); document.body.appendChild(overlay);
        menu = document.createElement('div'); menu.id = 'storeProfileMenu'; menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-modal', 'true'); menu.setAttribute('aria-labelledby', 'storeProfileMenuTitle'); menu.style.cssText = 'position:fixed;top:0;right:0;z-index:5001;width:400px;max-width:94vw;height:100vh;background:#fff;box-shadow:-4px 0 40px rgba(0,0,0,0.15);transform:translateX(100%);transition:transform 0.35s cubic-bezier(0.4,0,0.2,1);overflow:hidden;display:flex;flex-direction:column;';
        menu.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e8eaed;"><div><strong id="storeProfileMenuTitle" style="font-size:15px;color:#111;">Mi cuenta</strong><br><span id="storeProfileMenuContact" style="font-size:10px;color:#6b7280;"></span></div><button type="button" data-profile-action="close" aria-label="Cerrar" style="width:30px;height:30px;border-radius:50%;background:#f3f4f6;color:#6b7280;border:none;cursor:pointer;">' + AFF_ICON.x + '</button></div><div role="tablist" aria-label="Secciones de cuenta" style="display:flex;border-bottom:2px solid #e8eaed;overflow-x:auto;flex-shrink:0;"><button type="button" role="tab" aria-selected="true" aria-controls="storeProfileSummary" data-profile-tab="summary" style="flex:1;min-width:60px;padding:10px 4px;font-size:10px;font-weight:600;color:#1e40af;border:none;background:none;cursor:pointer;border-bottom:2px solid #1e40af;white-space:nowrap;">Resumen</button><button type="button" role="tab" aria-selected="false" aria-controls="storeProfileData" data-profile-tab="profile" style="flex:1;min-width:60px;padding:10px 4px;font-size:10px;font-weight:600;color:#6b7280;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;">Datos personales</button><button type="button" role="tab" aria-selected="false" aria-controls="storeProfileOrders" data-profile-tab="orders" style="flex:1;min-width:60px;padding:10px 4px;font-size:10px;font-weight:600;color:#6b7280;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;">Mis pedidos</button></div><div style="flex:1;overflow-y:auto;padding:16px;"><section id="storeProfileSummary" role="tabpanel" tabindex="0"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;"><div id="storeProfileInitial" style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#1e40af,#172554);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:700;"></div><div><strong id="storeProfileSummaryName" style="font-size:14px;color:#111;"></strong><br><span id="storeProfileMenuRole" style="font-size:10px;color:#6b7280;">Cliente</span></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;"><div style="background:#eff6ff;padding:8px 10px;border-radius:8px;"><div style="font-size:9px;color:#2563eb;font-weight:600;text-transform:uppercase;">Usuario</div><div id="storeProfileSummaryUser" style="font-size:12px;font-weight:700;color:#111;">-</div></div><div style="background:#f0fdf4;padding:8px 10px;border-radius:8px;"><div style="font-size:9px;color:#16a34a;font-weight:600;text-transform:uppercase;">Estado</div><div style="font-size:12px;font-weight:700;color:#111;">Sesión activa</div></div></div><button type="button" data-profile-tab="profile" style="height:32px;padding:0 10px;border-radius:6px;font-size:10px;font-weight:600;background:#1e40af;color:#fff;border:none;cursor:pointer;">Editar datos personales</button></section><section id="storeProfileData" role="tabpanel" tabindex="0" hidden><form id="storeProfileForm"><div class="store-profile-grid"><label>Nombre<input id="profileNombre" required></label><label>Email<input id="profileEmail" type="email"></label><label>WhatsApp<input id="profileWhatsapp" required inputmode="tel"></label><label>Ciudad<input id="profileCiudad"></label><label class="store-profile-wide">Dirección<input id="profileDireccion"></label></div><div id="storeProfileError" class="store-profile-error" role="alert"></div><button class="store-profile-save" id="storeProfileSave" type="submit">Guardar cambios</button></form></section><section id="storeProfileOrders" role="tabpanel" tabindex="0" hidden><div style="font-size:10px;font-weight:600;color:#6b7280;margin-bottom:8px;">Mis pedidos</div><div id="storeOrdersBody"></div></section></div><div style="padding:8px 16px;border-top:1px solid #e8eaed;display:flex;gap:6px;flex-shrink:0;"><button type="button" data-profile-action="close" style="flex:1;height:32px;border-radius:8px;font-size:11px;font-weight:600;background:#f3f4f6;color:#374151;border:none;cursor:pointer;">Tienda</button><button type="button" data-profile-action="logout" style="flex:1;height:32px;border-radius:8px;font-size:11px;font-weight:600;background:#fee2e2;color:#dc2626;border:none;cursor:pointer;">Cerrar sesión</button></div>';
        document.body.appendChild(menu); menu.addEventListener('click', function(e) { var tab = e.target.closest('[data-profile-tab]'); if (tab) { switchStoreProfileTab(tab.dataset.profileTab); return; } var action = e.target.closest('[data-profile-action]'); if (action) { if (action.dataset.profileAction === 'logout') logoutStore(); else closeStoreProfileMenu(true); } }); menu.querySelectorAll('#storeProfileForm label').forEach(function(label) { label.style.cssText = 'display:block;font-size:11px;font-weight:600;color:#374151;'; }); menu.querySelectorAll('#storeProfileForm input').forEach(function(input) { input.style.cssText = 'box-sizing:border-box;width:100%;height:36px;margin-top:4px;border:1px solid #d1d5db;border-radius:6px;padding:0 8px;font-size:12px;'; }); menu.querySelector('#storeProfileForm').onsubmit = saveStoreProfile;
    }
    var name = storeProfile && (storeProfile.nombre || storeProfile.name);
    var contact = storeProfile && (storeProfile.whatsapp || storeProfile.email);
    document.getElementById('storeProfileMenuTitle').textContent = name || 'Mi cuenta';
    document.getElementById('storeProfileMenuRole').textContent = (storeProfile && (storeProfile.rol || storeProfile.role)) || 'Cliente';
    document.getElementById('storeProfileMenuContact').textContent = contact || '';
    document.getElementById('storeProfileSummaryUser').textContent = contact || name || 'Mi cuenta';
    document.getElementById('storeProfileSummaryName').textContent = name || 'Mi cuenta';
    document.getElementById('storeProfileInitial').textContent = (name || 'M').charAt(0).toUpperCase();
    renderStoreProfileFields();
    switchStoreProfileTab(storeProfileTab, true);
    clearTimeout(storeProfilePanelCloseTimer);
    if (storeProfileMenuOpen) {
        menu.style.visibility = 'visible';
        var panelOverlay = document.getElementById('storeProfilePanelOverlay');
        if (panelOverlay) panelOverlay.style.visibility = 'visible';
    }
    menu.style.transform = storeProfileMenuOpen ? 'translateX(0)' : 'translateX(100%)';
    var panelOverlay = document.getElementById('storeProfilePanelOverlay');
    if (panelOverlay) { panelOverlay.style.opacity = storeProfileMenuOpen ? '1' : '0'; panelOverlay.style.pointerEvents = storeProfileMenuOpen ? 'auto' : 'none'; }
}
function openStoreProfileMenu() {
    if (!storeIsLoggedIn()) { closeStoreProfileMenu(); showStoreAuth('login'); return; }
    storeProfileMenuOpen = !storeProfileMenuOpen;
    renderStoreProfileMenu();
    var btn = document.getElementById('profileBtn');
    if (btn) btn.setAttribute('aria-expanded', String(storeProfileMenuOpen));
    if (!storeProfileMenuOpen) return;
    apiOrderRequest('auth_me', null, 'GET').then(function(r) {
        storeProfile = r.usuario || {};
        renderStoreProfileMenu();
        if (storeProfileTab === 'orders') loadStoreOrders();
    }).catch(function() { handleUnauthorized(); });
}
function switchStoreProfileTab(tab, silent) {
    if (!document.getElementById('storeProfileMenu')) return;
    storeProfileTab = tab || 'summary';
    document.querySelectorAll('#storeProfileMenu [role="tab"]').forEach(function(button) { var active = button.dataset.profileTab === storeProfileTab; button.setAttribute('aria-selected', String(active)); button.style.color = active ? '#1e40af' : '#6b7280'; button.style.borderBottomColor = active ? '#1e40af' : 'transparent'; });
    document.querySelectorAll('#storeProfileMenu [role="tabpanel"]').forEach(function(panel) { panel.hidden = panel.id !== ({ summary: 'storeProfileSummary', profile: 'storeProfileData', orders: 'storeProfileOrders' }[storeProfileTab] || 'storeProfileSummary'); });
    if (!silent && storeProfileTab === 'orders') loadStoreOrders();
}
function renderStoreProfileFields() {
    if (!storeProfile || !document.getElementById('profileNombre')) return;
    document.getElementById('profileNombre').value = storeProfile.nombre || '';
    document.getElementById('profileEmail').value = storeProfile.email || '';
    document.getElementById('profileWhatsapp').value = storeProfile.whatsapp || '';
    document.getElementById('profileCiudad').value = storeProfile.ciudad || '';
    document.getElementById('profileDireccion').value = storeProfile.direccion || '';
}
function openStoreOrders() { if (!storeIsLoggedIn()) { showStoreAuth('login'); return; } storeProfileTab = 'orders'; openStoreProfileMenu(); }
function openStoreProfile() { if (!storeIsLoggedIn()) { showStoreAuth('login'); return; } storeProfileTab = 'profile'; openStoreProfileMenu(); }
function renderStoreProfile() { renderStoreProfileMenu(); switchStoreProfileTab(storeProfileTab); }
function closeStoreProfile() { closeStoreProfileMenu(); }
function saveStoreProfile(e) {
    e.preventDefault();
    var btn = document.getElementById('storeProfileSave'), error = document.getElementById('storeProfileError');
    btn.disabled = true;
    apiOrderRequest('perfil_actualizar', { nombre: document.getElementById('profileNombre').value.trim(), email: document.getElementById('profileEmail').value.trim(), whatsapp: document.getElementById('profileWhatsapp').value.trim(), ciudad: document.getElementById('profileCiudad').value.trim(), direccion: document.getElementById('profileDireccion').value.trim() })
        .then(function(r) { storeProfile = r.usuario; showToast('Perfil actualizado', typeof AFF_ICON !== 'undefined' ? AFF_ICON.check : ''); renderStoreProfileMenu(); switchStoreProfileTab('profile', true); })
        .catch(function(err) { error.textContent = err.message; }).then(function() { btn.disabled = false; });
}
function loadStoreOrders() {
    var body = document.getElementById('storeOrdersBody');
    if (!body) return;
    body.innerHTML = '<div class="store-orders-loading">Cargando pedidos...</div>';
    apiOrderRequest('mis_pedidos_detalle', null, 'GET').then(function(r) {
        if (!r.pedidos || !r.pedidos.length) { body.innerHTML = '<div class="store-orders-empty">Aún no tienes pedidos.</div>'; return; }
        body.innerHTML = r.pedidos.map(function(p) {
            var completed = p.estado_pedido === 'completado';
            var items = (p.items || []).map(function(i) { return '<li>' + escapeHtml(i.nombre || i.sku || 'Producto') + ' x' + (i.cantidad || 1) + '</li>'; }).join('');
            return '<article class="store-order-card"><div><strong>' + escapeHtml(p.id) + '</strong><span>' + escapeHtml(p.fecha_creacion || '') + '</span></div><div class="store-order-items">' + (items ? '<ul>' + items + '</ul>' : 'Productos no disponibles') + '</div><div class="store-order-meta"><span>' + escapeHtml('Delivery: ' + (p.cliente_direccion || '') + (p.cliente_ciudad ? ', ' + p.cliente_ciudad : '')) + '</span><strong>Bs ' + fmtPrice(Number(p.total || 0)) + '</strong></div><div class="store-order-status"><span class="' + (completed ? 'is-paid' : '') + '">Estado: ' + (completed ? 'Completado' : 'Pendiente') + '</span></div></article>';
        }).join('');
    }).catch(function(err) { body.innerHTML = '<div class="store-profile-error">' + escapeHtml(err.message) + '</div>'; });
}
function logoutStore() {
    closeStoreProfileMenu();
    clearStoreSession();
    cart = [];
    localStorage.removeItem('ms_cart_token');
    updateCart();
    closeStoreProfile(); applyStoreLock(); updateAffChatVisibility();
    var btn = document.getElementById('profileBtn'); if (btn) { btn.setAttribute('aria-label', 'Perfil: iniciar sesión o registrarse'); btn.title = 'Perfil'; }
    showToast('Sesión cerrada');
}
function openDeliveryModal() {
    if (!storeIsLoggedIn()) { showStoreAuth('login'); return; }
    var o = document.getElementById('deliveryOverlay');
    if (!o) {
        o = document.createElement('div'); o.id = 'deliveryOverlay';
        o.innerHTML = '<div class="delivery-modal" role="dialog" aria-modal="true" aria-labelledby="deliveryTitle"><button class="delivery-close" type="button" aria-label="Cerrar">&times;</button><div class="store-profile-kicker">CHECKOUT SEGURO</div><h2 id="deliveryTitle">Datos de entrega</h2><p>Confirma dónde recibir tu pedido antes de generar el QR.</p><form id="deliveryForm"><label>Nombre<input id="deliveryNombre" required></label><label>WhatsApp<input id="deliveryWhatsapp" required inputmode="tel"></label><label>Ciudad<input id="deliveryCiudad" required></label><label>Entrega a domicilio<input id="deliveryDireccion" required></label><div id="deliveryError" class="store-profile-error"></div><button class="store-profile-save" type="submit">Continuar al QR</button></form></div>';
        document.body.appendChild(o); o.querySelector('.delivery-close').onclick = closeDeliveryModal; o.addEventListener('click', function(e) { if (e.target === o) closeDeliveryModal(); });
        o.querySelector('#deliveryForm').onsubmit = submitDelivery;
    }
    apiOrderRequest('auth_me', null, 'GET').then(function(r) { var u = r.usuario || {}; document.getElementById('deliveryNombre').value = u.nombre || ''; document.getElementById('deliveryWhatsapp').value = u.whatsapp || ''; document.getElementById('deliveryCiudad').value = u.ciudad || ''; document.getElementById('deliveryDireccion').value = u.direccion || ''; });
    o.classList.add('open'); document.body.style.overflow = 'hidden'; setTimeout(function() { document.getElementById('deliveryNombre').focus(); }, 50);
}
function closeDeliveryModal() { var o = document.getElementById('deliveryOverlay'); if (o) o.classList.remove('open'); document.body.style.overflow = ''; }
function submitDelivery(e) {
    e.preventDefault(); var err = document.getElementById('deliveryError');
    var data = { nombre: document.getElementById('deliveryNombre').value.trim(), whatsapp: document.getElementById('deliveryWhatsapp').value.trim(), ciudad: document.getElementById('deliveryCiudad').value.trim(), direccion: document.getElementById('deliveryDireccion').value.trim(), tipo_delivery: 'domicilio' };
    if (!data.nombre || !data.whatsapp || !data.ciudad || !data.direccion) { err.textContent = 'Completa nombre, WhatsApp, ciudad y dirección de entrega.'; return; }
    var btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true;
    Promise.resolve(window._affiliateRefReady).catch(function() { return ''; }).then(function() {
        var ref = typeof window.getValidAffiliateRef === 'function' ? window.getValidAffiliateRef() : '';
        if (ref) data.ref = ref;
        return syncCartToServer();
    }).then(function(token) { data.token = token; return apiOrderRequest('checkout', data); }).then(function(result) { var items = cart.map(function(c) { return { sku: c.sku, name: c.name, cantidad: c.qty, price: c.price }; }); lastOrder = { id: result.pedido.id, date: new Date().toISOString(), items: items, total: result.pedido.total, tipo_delivery: 'domicilio', status: 'pending', qr: result.qr || null }; closeDeliveryModal(); closeCart(); showQRPayment(result.pedido.id, result.pedido.total, items); }).catch(function(ex) { err.textContent = ex.message; }).then(function() { btn.disabled = false; });
}
function applyStoreLock() {
    if (!document.getElementById('storeAuthStyles')) { var style = document.createElement('style'); style.id = 'storeAuthStyles'; style.textContent = '.store-locked .product-card-price,.store-locked .offer-card-price,.store-locked .bs-card-price,.store-locked .qv-price{font-size:0!important;visibility:hidden}.store-locked .product-card-price:after,.store-locked .offer-card-price:after,.store-locked .bs-card-price:after,.store-locked .qv-price:after{content:"Inicia sesión para ver precios";font-size:11px!important;visibility:visible;color:#b71c1c;font-weight:700}.store-locked .btn-add,.store-locked .rec-card-btn.add{display:none!important}.store-locked .qv-add-btn{display:inline-flex!important;font-size:12px!important}.store-locked #cartBtn{opacity:.65}.store-locked .qv-actions .wa-btn-sm{display:none!important}#storeAuthOverlay{position:fixed;inset:0;z-index:7000;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .2s}#storeAuthOverlay.open{opacity:1;pointer-events:auto}.store-auth-modal{width:min(390px,100%);background:#fff;border-radius:20px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.28);position:relative}.store-auth-close{position:absolute;right:14px;top:14px;width:30px;height:30px;border:0;border-radius:50%;background:#f1f5f9;cursor:pointer}.store-auth-kicker{font-size:10px;font-weight:800;letter-spacing:1.5px;color:#b71c1c}.store-auth-modal h2{margin:7px 0 5px;font-size:25px;color:#0f172a}.store-auth-modal p{font-size:13px;color:#64748b;line-height:1.5;margin:0 0 18px}.store-auth-modal input{width:100%;height:43px;border:1px solid #dbe2ec;border-radius:9px;padding:0 12px;font:inherit;font-size:13px;margin:0 0 10px;box-sizing:border-box}.store-auth-modal input:focus{border-color:#b71c1c;outline:none;box-shadow:0 0 0 3px rgba(183,28,28,.1)}#storeAuthSubmit{width:100%;height:43px;border:0;border-radius:9px;background:linear-gradient(135deg,#b71c1c,#7f0f0f);color:#fff;font-weight:700;cursor:pointer;margin-top:4px}.store-auth-switch{display:block;width:100%;background:none;border:0;color:#b71c1c;font-size:12px;font-weight:700;cursor:pointer;padding:15px 0 0}.store-auth-error{min-height:18px;color:#dc2626;font-size:12px;text-align:center;margin-top:6px}.store-locked .qv-actions .wa-btn-sm{display:none!important}'; document.head.appendChild(style); }
    if (!document.getElementById('storeLockDetails')) { var detailStyle = document.createElement('style'); detailStyle.id = 'storeLockDetails'; detailStyle.textContent = '.store-locked .product-card-price:after,.store-locked .offer-card-price:after,.store-locked .bs-card-price:after,.store-locked .qv-price:after{content:"--"}.store-locked .product-card-stock,.store-locked .qv-stock{font-size:0!important;visibility:hidden}.store-locked .product-card-stock:after,.store-locked .qv-stock:after{content:"--";font-size:13px!important;visibility:visible;color:#94a3b8}.store-guide{display:flex;align-items:center;justify-content:center;gap:18px;padding:12px 20px;background:linear-gradient(100deg,#172554,#1e40af);color:#fff;font-size:12px;line-height:1.45}.store-guide strong{font-size:13px}.store-guide button{border:1px solid rgba(255,255,255,.45);border-radius:8px;background:#fff;color:#1e3a8a;padding:7px 13px;font:inherit;font-weight:700;cursor:pointer}.store-guide-close{border:0!important;background:transparent!important;color:#fff!important;font-size:18px!important;padding:0 4px!important}.store-guide-steps{opacity:.88}@media(max-width:650px){.store-guide{gap:9px;align-items:flex-start;font-size:11px;padding:10px 12px}.store-guide-steps{display:block}.store-guide button{white-space:nowrap;padding:6px 9px;font-size:11px}}</style>'; document.head.appendChild(detailStyle); }
    document.body.classList.toggle('store-locked', !storeIsLoggedIn());
    var oldGuide = document.getElementById('storeGuide');
    if (oldGuide) oldGuide.remove();
}
function apiOrderRequest(action, payload, method) {
    var opts = { method: method || 'POST', headers: { 'Content-Type': 'application/json' } };
    if (authToken) opts.headers.Authorization = 'Bearer ' + authToken;
    if (payload) opts.body = JSON.stringify(payload);
    return fetch(SHOP_CONFIG.orderApi + '?action=' + encodeURIComponent(action), opts).then(function(r) { return r.text().then(function(raw) { var d; try { d = raw ? JSON.parse(raw) : null; } catch (e) { throw new Error('El servidor devolvió una respuesta inválida (' + r.status + ')'); } if (r.status === 401) { handleUnauthorized(); throw new Error('Tu sesión expiró'); } if (!d) throw new Error('El servidor no devolvió datos (' + r.status + ')'); if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo procesar la solicitud'); return d; }); });
}
function getCartToken() {
    var token = localStorage.getItem('ms_cart_token');
    if (!token) { token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function(x){ return x.toString(16).padStart(2,'0'); }).join(''); localStorage.setItem('ms_cart_token', token); }
    return token;
}
function syncCartToServer() {
    var token = getCartToken();
    return apiOrderRequest('carrito_clear', { token: token }).then(function() { return cart.reduce(function(chain, item) { return chain.then(function() { return apiOrderRequest('carrito_add', { token: token, sku: item.sku, cantidad: item.qty }); }); }, Promise.resolve()); }).then(function() { return token; });
}
var AFF_ICON = {
    user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    home: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    chart: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
    package: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    dollar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    percent: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
    store: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    logout: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    x: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    checkCircle: '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    external: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    cart: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.4"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    inbox: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
    clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    alert: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    qr: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="3" y1="21" x2="8" y2="21"/><line x1="21" y1="14" x2="21" y2="17"/><line x1="17" y1="21" x2="21" y2="21"/></svg>',
    ticket: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    pin: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    dot: '<span style="color:#16a34a;">&#9679;</span>'
};


// =??=??=?? HELPERS =??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??
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
    str = String(str).trim();
    if (/^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(str) || /^https?:\/\//i.test(str)) return str;
    return /^[a-z0-9+/=\s]+$/i.test(str) ? 'data:image/png;base64,' + str : '';
}

function normalizeQRResponse(response) {
    if (!response || response.success === false) throw new Error((response && (response.error || response.message)) || 'Error al generar QR');
    var value = response.qr || response;
    if (value && value.success === false) throw new Error(value.error || value.message || 'Error al generar QR');
    while (value && value.data && typeof value.data === 'object') value = value.data;
    value = value || {};
    var normalized = {
        qrId: value.qrId || value.qr_id || value.id || '',
        qrImage: value.qrImage || value.qr_image || value.qr || value.imagen || '',
        referencia: value.referencia || value.reference || value.ref || '',
        uuid: value.uuid || ''
    };
    if (!normalized.qrId || !normalized.qrImage) throw new Error('La API no devolvió un QR válido');
    return normalized;
}

function disableLocalPaymentButton() {
    var button = document.getElementById('qrConfirmBtn');
    if (!button) return;
    button.style.display = 'none';
    button.disabled = true;
    button.onclick = null;
}

function showToast(msg, icon) {
    var t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast'; t.className = 'toast';
        t.innerHTML = '<span class="toast-icon"></span><span id="toastMsg"></span>';
        document.body.appendChild(t);
    }
    var iconEl = t.querySelector('.toast-icon');
    if (iconEl) iconEl.innerHTML = (icon || AFF_ICON.check).indexOf('<') === 0 ? (icon || AFF_ICON.check) : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var msgEl = t.querySelector('#toastMsg') || t.querySelector('span:last-child');
    if (msgEl) msgEl.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function(){ t.classList.remove('show'); }, 3000);
}

// =?==?==?= REGLA MyShop: solo stock LP (La Paz + El Alto + Llojeta), ignora showroom =?==?==?=
// Si stock LP < 3 =?? agotado
var LP_SUCURSALES = ['La Paz', 'El Alto', 'Llojeta'];

function getTotalStock(p) {
    var ss = p.stockSucursales || {};
    var t = 0;
    for (var k in ss) {
        if (LP_SUCURSALES.indexOf(k) === -1) continue;
        if (/show|vitrin|exhib|sala|muestra/i.test(k)) continue;
        t += ss[k];
    }
    return t;
}

function stockDisponible(stock) {
    return stock >= 4;
}

// =??=??=?? LOAD PRODUCTS =??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??
function loadProducts() {
    var grid = document.getElementById('productsGrid');
    if (grid) grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:80px 20px;text-align:center;"><div class="qr-spinner" style="margin:0 auto 12px;"></div><p style="color:#999;">Cargando productos...</p></div>';

    var loaded = [];
    function loadPage(offset) {
        return fetch(SHOP_CONFIG.apiBase + '/digicorp.php?action=products&limit=5000&offset=' + offset)
            .then(function(r) { if (!r.ok) throw new Error('Error HTTP ' + r.status); return r.json(); })
            .then(function(data) {
                if (!data.success || !Array.isArray(data.data)) throw new Error(data.error || 'Error al cargar');
                loaded = loaded.concat(data.data);
                var total = Number(data.total || loaded.length);
                if (data.data.length && loaded.length < total) return loadPage(offset + data.data.length);
                return { data: loaded, total: total, stats: data.stats || {} };
            });
    }

    loadPage(0)
        .then(function(data) {
            allProducts = data.data;
            products = allProducts.slice();
            renderBrandSidebar();
            renderProducts();
            renderOffers();
            renderBestSellers();
            // Hide splash loader
            var splash = document.getElementById('splash-loader');
            if (splash) setTimeout(function() { splash.classList.add('hidden'); }, 400);
            console.log('[MyShop] ' + data.total + ' productos (' + (data.stats.marcas || allBrands.length) + ' marcas)');
        })
        .catch(function(err) {
            console.error(err);
            if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:80px 20px;"><p style="color:#999;">Error al cargar productos</p><button onclick="loadProducts()" style="margin-top:10px;padding:8px 20px;background:#ff4b4b;color:#fff;border:none;border-radius:8px;cursor:pointer;">Reintentar</button></div>';
            var splash = document.getElementById('splash-loader');
            if (splash) splash.classList.add('hidden');
        });
}

// =??=??=?? STATE =??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??
var currentFilter = { marca: '', search: '', sort: 'default', priceRange: 'all' };
var displayedCount = 0;
var pageSize = 24;
var allBrands = [];

// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
// BRAND SIDEBAR (left column)
// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
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
            opts += '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + ' (' + brandSet[b] + ')</option>';
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
        html += '<div class="sidebar-letter-group" data-letter="' + escapeHtml(letter) + '">';
        html += '<div class="sidebar-letter-header">' + escapeHtml(letter) + '</div>';
        groups[letter].forEach(function(b) {
            html += '<div class="sidebar-brand-item" data-marca="' + escapeHtml(b) + '">' + escapeHtml(b) + ' <span class="bcount">' + brandSet[b] + '</span></div>';
        });
        html += '</div>';
    });
    container.innerHTML = html;

    // Render letter index (click to FILTER brands by letter)
    window._activeLetter = '';
    if (indexContainer) {
        var indexHtml = '<a href="#" data-letter="" class="active">' + ALL_LETTER_SVG + '</a>' + letters.map(function(l) {
            return '<a href="#" data-letter="' + escapeHtml(l) + '">' + escapeHtml(l) + '</a>';
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
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function cleanName(s) {
    return (s || '')
        .replace(/\uFFFD/g, '')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/\*/g, '')
        .replace(/\(|\)/g, '')
        .replace(/^\s+|\s+$/g, '')
        .replace(/\s{2,}/g, ' ');
}
function shortName(s) {
    var n = cleanName(s);
    var w = n.split(' ');
    var half = Math.floor(w.length / 2);
    if (half >= 3) {
        var a = w.slice(0, half).join(' ');
        var b = w.slice(half, half * 2).join(' ');
        if (a.toLowerCase() === b.toLowerCase()) n = a;
    }
    if (n.length > 65) n = n.substring(0, 65).replace(/\s+\S*$/, '') + '\u2026';
    return n;
}
function parseSpecs(raw) {
    var out = [];
    (raw || '').split('*').forEach(function(it) {
        it = it.replace(/\uFFFD/g, '').replace(/[\u0000-\u001F\u007F]/g, '')
            .replace(/["'()*]/g, '')
            .replace(/^\s+|\s+$/g, '')
            .replace(/\s{2,}/g, ' ');
        if (it && it.length >= 2 && /[A-Za-z0-9\u00C0-\u024F]/.test(it)) out.push(it);
    });
    return out;
}
function specModalTitle(raw) {
    var items = parseSpecs(raw);
    if (items.length >= 1) {
        var first = items[0];
        var looksLikeSku = first.length < 28 && /^[A-Za-z0-9#\/_.\-]+$/.test(first);
        if (!looksLikeSku) return first;
    }
    return null;
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

    // Sync mobile brands panel
    qsa('.mbp-brand').forEach(function(b) {
        b.classList.toggle('active', (b.dataset.brand || '') === (marca || ''));
    });

    // Scroll active into view
    var active = document.querySelector('.sidebar-brand-item.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
// FILTERS
// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
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
    renderBestSellers();
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
    container.innerHTML = tags.map(function(t) {
        return '<span class="active-filter-tag">' + escapeHtml(t.label) + '<span class="tag-remove" data-key="' + escapeHtml(t.key) + '">' + X_REMOVE_SVG + '</span></span>';
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

// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
// RENDER PRODUCTS (with fixed pagination)
// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
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
            + '<img class="product-card-img" src="' + (p.images && p.images[0] ? p.images[0] : '') + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onerror="this.onerror=null;this.src=IMG_FALLBACK_SRC">'
            + '<div class="product-card-body">'
            + '<div class="product-card-name" title="' + escapeHtml(cleanName(p.name)) + '">' + escapeHtml(cleanName(p.name)) + '</div>'
            + '<div class="product-card-price"><span class="current">Bs ' + fmtPrice(p.price) + '</span>' + origHtml + discHtml + '</div>'
            + '<div class="product-card-stock' + (inStock ? '' : ' agotado') + '">' + (inStock ? 'En stock (' + st + ')' : 'Agotado') + '</div>'
            + (window._affShowGanancia && window._affComision > 0 ? '<div class="product-card-ganancia">Ganancia de afiliado: <strong>Bs ' + fmtPrice(p.price * window._affComision / 100) + '</strong></div>' : '')
            + '<div class="product-card-actions">' + (inStock ? '<button class="btn-add" onclick="event.stopPropagation();addToCart(' + p.id + ');">Agregar</button>' : '<button class="btn-add" style="background:#ddd;color:#999;cursor:default;" disabled>Agotado</button>') + '</div>'
            + '</div></div>';
    }).join('');

    var loadWrap = document.getElementById('loadMoreWrap');
    if (loadWrap) {
        // Only show load more if there are more products AND more than one page worth
        loadWrap.style.display = (hasMore && products.length > pageSize) ? 'block' : 'none';
    }
}

// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
// OFFERS SECTION (featured discounts)
// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
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
            + '<img class="offer-card-img" src="' + (p.images && p.images[0] ? p.images[0] : '') + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onerror="this.onerror=null;this.src=IMG_FALLBACK_SRC">'
            + '<div class="offer-card-body">'
            + '<div class="offer-card-name">' + escapeHtml(cleanName(p.name)).substring(0, 40) + '</div>'
            + '<div class="offer-card-price"><span class="cur">Bs ' + fmtPrice(p.price) + '</span><span class="orig">Bs ' + fmtPrice(p.origPrice) + '</span><span class="disc">-' + getDisplayDiscount(p) + '%</span></div>'
            + (window._affShowGanancia && window._affComision > 0 ? '<div class="offer-card-ganancia">Ganancia: <strong>Bs ' + fmtPrice(p.price * window._affComision / 100) + '</strong></div>' : '')
            + '</div></div>';
    }).join('');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BEST SELLERS (proxy por stock: menos stock = más vendido)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function initBestSellers() {
    var section = document.getElementById('bestSellersSection');
    if (section) return section;

    var style = document.createElement('style');
    style.textContent = ''
        + '#bestSellersSection{margin-bottom:24px;display:none;}'
        + '.bs-header{display:flex;align-items:center;gap:10px;margin-bottom:12px;}'
        + '.bs-badge{background:linear-gradient(135deg,#d97706,#b45309);color:#fff;padding:4px 14px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;}'
        + '.bs-title{font-size:16px;font-weight:700;color:var(--n800,#1a1a2e);}'
        + '.bs-nav{display:flex;gap:8px;margin-left:auto;align-items:center;}'
        + '.bs-nav button{width:36px;height:36px;border-radius:50%;border:1px solid var(--n150,#e8eaed);background:#fff;color:var(--n700,#333);cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(10,25,48,0.08);transition:all .2s;}'
        + '.bs-nav button:hover{background:#fef3c7;border-color:#f59e0b;color:#b45309;}'
        + '.bs-nav button:disabled{opacity:.35;cursor:default;}'
        + '@media(max-width:768px){.bs-nav{display:none;}}'
        + '.bs-carousel{display:flex;gap:12px;overflow-x:auto;padding:6px 0 12px;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;}'
        + '.bs-carousel::-webkit-scrollbar{display:none;}'
        + '.bs-card{flex:0 0 200px;scroll-snap-align:start;background:#fff;border-radius:var(--radius-md,12px);box-shadow:var(--shadow-sm,0 1px 3px rgba(0,0,0,0.04));overflow:hidden;cursor:pointer;transition:all 0.25s;border:2px solid rgba(245,158,11,0.25);position:relative;}'
        + '.bs-card:hover{box-shadow:var(--shadow-lg,0 12px 40px rgba(0,0,0,0.1));transform:translateY(-3px);}'
        + '.bs-card-rank{position:absolute;top:8px;left:8px;z-index:2;width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(217,119,6,0.4);}'
        + '.bs-card-img{width:100%;height:130px;object-fit:contain;padding:12px;background:#fff;}'
        + '.bs-card-body{padding:10px 12px 14px;}'
        + '.bs-card-name{font-size:12px;font-weight:500;color:var(--n800,#1a1a2e);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:6px;line-height:1.4;}'
        + '.bs-card-price{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}'
        + '.bs-card-price .cur{font-size:15px;font-weight:700;color:var(--primary,#e63946);}'
        + '.bs-card-price .orig{font-size:11px;color:var(--n300,#aaa);text-decoration:line-through;}'
        + '.bs-card-price .disc{font-size:10px;font-weight:700;color:#fff;background:var(--accent,#f59e0b);padding:2px 7px;border-radius:7px;}'
        + '.bs-card-ganancia{font-size:10px;color:#16a34a;font-weight:700;padding:5px 0 0;margin-top:4px;border-top:1px dashed rgba(22,163,74,0.25);}';
    document.head.appendChild(style);

    var offersSection = document.getElementById('offersSection');
    var wrap = document.createElement('div');
    wrap.id = 'bestSellersSection';
    wrap.innerHTML = ''
        + '<div class="bs-header">'
        + '  <span class="bs-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align:-1px;margin-right:2px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>Más vendidos</span>'
        + '  <span class="bs-title">Los favoritos de la tienda</span>'
        + '  <div class="bs-nav">'
        + '    <button type="button" id="bsPrev" aria-label="Anterior"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>'
        + '    <button type="button" id="bsNext" aria-label="Siguiente"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>'
        + '  </div>'
        + '</div>'
        + '<div class="bs-carousel" id="bsCarousel"></div>';

    if (offersSection && offersSection.parentNode) {
        offersSection.parentNode.insertBefore(wrap, offersSection.nextSibling);
    } else {
        var info = document.getElementById('filterInfo');
        if (info && info.parentNode) info.parentNode.insertBefore(wrap, info.nextSibling);
    }

    var carousel = document.getElementById('bsCarousel');
    var prevBtn = document.getElementById('bsPrev');
    var nextBtn = document.getElementById('bsNext');
    if (carousel && prevBtn && nextBtn) {
        var step = function() { return Math.max(220, Math.round(carousel.clientWidth * 0.8)); };
        prevBtn.addEventListener('click', function() { carousel.scrollBy({ left: -step(), behavior: 'smooth' }); });
        nextBtn.addEventListener('click', function() { carousel.scrollBy({ left: step(), behavior: 'smooth' }); });
        var upd = function() {
            var max = carousel.scrollWidth - carousel.clientWidth;
            prevBtn.disabled = carousel.scrollLeft <= 2;
            nextBtn.disabled = max <= 0 || carousel.scrollLeft >= max - 2;
        };
        carousel.addEventListener('scroll', upd);
        window.addEventListener('resize', upd);
        new MutationObserver(upd).observe(carousel, { childList: true, subtree: true });
        upd();
    }
    return wrap;
}

function getBestSellers() {
    var list = [];
    var testSkus = ['TEST-PRUEBA-001'];
    for (var i = 0; i < allProducts.length; i++) {
        var p = allProducts[i];
        if (!p) continue;
        if (testSkus.indexOf(p.sku) !== -1) continue;
        if (!p.images || !p.images.length) continue;
        if (!stockDisponible(getTotalStock(p))) continue;
        list.push(p);
    }
    // Menos stock disponible (aun vendible) = proxy de "más vendido"
    list.sort(function(a, b) {
        var sa = getTotalStock(a), sb = getTotalStock(b);
        if (sa !== sb) return sa - sb;
        return getDisplayDiscount(b) - getDisplayDiscount(a);
    });
    return list.slice(0, 12);
}

function renderBestSellers() {
    var section = document.getElementById('bestSellersSection');
    if (!section) section = initBestSellers();
    var carousel = document.getElementById('bsCarousel');
    if (!section || !carousel) return;

    // Solo en la vista general (sin marca ni búsqueda ni filtros)
    if (currentFilter.marca || currentFilter.search || currentFilter.priceRange !== 'all') {
        section.style.display = 'none';
        return;
    }

    var best = getBestSellers();
    if (best.length < 3) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    carousel.innerHTML = best.map(function(p, idx) {
        var dd = getDisplayDiscount(p);
        var origHtml = dd > 0 ? '<span class="orig">Bs ' + fmtPrice(p.origPrice) + '</span>' : '';
        var discHtml = dd > 0 ? '<span class="disc">-' + dd + '%</span>' : '';
        var ganancia = (window._affShowGanancia && window._affComision > 0) ? '<div class="bs-card-ganancia">Ganancia: <strong>Bs ' + fmtPrice(p.price * window._affComision / 100) + '</strong></div>' : '';
        return '<div class="bs-card" onclick="openProductModal(' + p.id + ')">'
            + '<div class="bs-card-rank">' + (idx + 1) + '</div>'
            + '<img class="bs-card-img" src="' + (p.images && p.images[0] ? p.images[0] : '') + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onerror="this.onerror=null;this.src=IMG_FALLBACK_SRC">'
            + '<div class="bs-card-body">'
            + '<div class="bs-card-name">' + escapeHtml(cleanName(p.name)).substring(0, 40) + '</div>'
            + '<div class="bs-card-price"><span class="cur">Bs ' + fmtPrice(p.price) + '</span>' + origHtml + discHtml + '</div>'
            + ganancia
            + '</div></div>';
    }).join('');
}

// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
// PRODUCT MODAL (Single Image - no carousel)
// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
var IMG_PLACEHOLDER_SVG = '<span class="qv-img-ph" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:100%;height:100%;min-height:120px;color:var(--n300,#aaa);"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><span style="font-size:11px;">Imagen no disponible</span></span>';
var IMG_FALLBACK_SRC = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect fill=%27%23eef1f6%27 width=%27100%27 height=%27100%27/%3E%3Cg fill=%27none%27 stroke=%27%2394a3b8%27 stroke-width=%274%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Crect x=%2718%27 y=%2718%27 width=%2764%27 height=%2764%27 rx=%278%27/%3E%3Ccircle cx=%2738%27 cy=%2738%27 r=%278%27/%3E%3Cpath d=%27M18 66l16-16 12 12 10-10 26 26%27/%3E%3C/g%3E%3C/svg%3E';
var ALL_LETTER_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;"><path d="M3 12h18M3 12l6-6M3 12l6 6"/></svg>';
var X_REMOVE_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="vertical-align:-1px;"><path d="M18 6L6 18M6 6l12 12"/></svg>';

// Viewport real visible (excluye barra de Chrome/Samsung Internet) â†’ --msx-vvh
(function() {
    var vv = window.visualViewport;
    if (!vv) return;
    function fit() { document.documentElement.style.setProperty('--msx-vvh', vv.height + 'px'); }
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
})();

function msxCloseAll(except) {
    try {
        if (except !== 'cart') closeCart();
        if (except !== 'qv') { var qvm = document.getElementById('qvModal'); if (qvm && qvm.classList.contains('open')) closeQuickView(); }
        if (except !== 'chat') closeChat();
        if (except !== 'cotiz' && typeof getChatEl === 'function') { var co = getChatEl('cotizOverlay'); if (co && co.classList.contains('open')) closeCotizModal(); }
        if (except !== 'rec' && typeof getChatEl === 'function') { var ro = getChatEl('recOverlay'); if (ro && ro.classList.contains('open')) closeRecModal(); }
        if (except !== 'brands' && window.__msxCloseBrands) window.__msxCloseBrands();
        if (except !== 'filter' && window.__msxCloseFilter) window.__msxCloseFilter();
    } catch (e) {}
}

function openProductModal(productId) {
    msxCloseAll('qv');
    var p = allProducts.find(function(x) { return x.id === productId; });
    if (!p) { showToast('Producto no encontrado'); return; }
    if (window._affCode && typeof window.trackAffClick === 'function') { window.trackAffClick(window._affCode, p.sku || ''); }

    var overlay = document.getElementById('qvOverlay');
    var modal = document.getElementById('qvModal');
    if (!overlay || !modal) return;

    document.getElementById('qvCategory').textContent = p.marca ? p.marca.toUpperCase() : 'PRODUCTO';
    var marcaEl = document.getElementById('qvMarca');
    if (marcaEl) marcaEl.textContent = p.marca || '';
    document.getElementById('qvTitle').textContent = specModalTitle(p.spec) || cleanName(p.name);
    document.getElementById('qvSku').textContent = 'SKU: ' + p.sku;

    // â”€â”€â”€ Descripción / Especificaciones: descripción si existe, si no lista de specs â”€â”€â”€
    var desc = (p.description || '').trim();
    var specItems = parseSpecs(p.spec);
    var specEl = document.getElementById('qvSpec');
    if (specEl) {
        var specHtml = '';
        if (desc && desc !== cleanName(p.name)) {
            specHtml += '<div class="qv-desc-title">Descripción</div><div class="qv-desc-body">' + escapeHtml(desc) + '</div>';
        }
        if (specItems.length >= 1) {
            specHtml += '<ul class="qv-spec-list">'
                + (specItems.map(function(it){ return '<li>' + escapeHtml(it) + '</li>'; }).join(''))
                + '</ul>';
        }
        specEl.innerHTML = specHtml;
        specEl._specItems = specItems;
        specEl._desc = (desc && desc !== cleanName(p.name)) ? desc : '';
    }

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
        stockDetEl.innerHTML = '';
        /* Branch stock and affiliate details stay hidden in the quick view. */
        /*
        var ss = p.stockSucursales || {};
        var qvDetailHtml = '';
        if (stockDisponible(st)) {
            qvDetailHtml += '<div class="stock-sucursales">';
            for (var si = 0; si < LP_SUCURSALES.length; si++) {
                var sk = LP_SUCURSALES[si];
                var qty = ss[sk] || 0;
                if (qty > 0) qvDetailHtml += '<span class="stock-suc"><span class="suc-dot"></span>' + sk + ': ' + qty + ' u.</span>';
            }
            qvDetailHtml += '</div>';
        }
        if (window._affShowGanancia && window._affComision > 0) {
            qvDetailHtml += '<div class="qv-ganancia-modal">Ganancia de afiliado: <strong>Bs ' + fmtPrice(p.price * window._affComision / 100) + '</strong></div>';
        }
        stockDetEl.innerHTML = qvDetailHtml;
        stockDetEl.style.display = qvDetailHtml ? '' : 'none';
        */
    }

    var addBtn = document.getElementById('qvAddBtn');
    if (addBtn) {
        if (!storeIsLoggedIn()) {
            addBtn.textContent = 'Inicia sesión para comprar';
            addBtn.onclick = function() { showStoreAuth('login'); };
        } else {
            addBtn.textContent = stockDisponible(st) ? 'Agregar - Bs ' + fmtPrice(p.price) : 'Agotado';
            addBtn.onclick = function() { if (stockDisponible(st)) addToCart(p.id); };
        }
        addBtn.style.opacity = stockDisponible(st) ? '1' : '0.4';
    }

    var chatBtn = document.getElementById('qvChatBtn');
    if (chatBtn) {
        chatBtn.style.display = 'inline-flex';
        chatBtn.onclick = function() {
            openChatWithProduct(p);
        };
    }

    // Build carousel - track+dots only for 2+ images
    window._carouselIndex = 0;
    var images = p.images && p.images.length > 0 ? p.images.filter(function(x) { return x && x.length > 10 && /\.(webp|jpg|jpeg|png|gif|bmp)(\?|$)/i.test(x); }) : [];
    var hasMultiple = images.length > 1;
    var track = document.getElementById('qvCarouselTrack');
    var dots = document.getElementById('qvCarouselDots');
    var wrap = document.getElementById('qvCarouselWrap');
    var prevBtn = document.getElementById('qvCarouselPrev');
    var nextBtn = document.getElementById('qvCarouselNext');

    if (hasMultiple && track) {
        // Multiple images - show carousel
        track.style.display = '';
        track.innerHTML = images.map(function(img) {
            var imgTag = img ? '<img src="' + img + '" alt="" onerror="this.onerror=null;this.parentNode.innerHTML=IMG_PLACEHOLDER_SVG">' : IMG_PLACEHOLDER_SVG;
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
        // Single image - keep carousel structure, hide nav controls
        if (track) {
            track.style.display = '';
            track.innerHTML = '<div class="qv-carousel-slide">'
                + (images[0] ? '<img src="' + images[0] + '" alt="" onerror="this.onerror=null;this.parentNode.innerHTML=IMG_PLACEHOLDER_SVG">' : IMG_PLACEHOLDER_SVG)
                + '</div>';
        }
        if (dots) { dots.style.display = 'none'; dots.innerHTML = ''; }
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (wrap) {
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.justifyContent = 'center';
        }
    }

    window._carouselReady = -1;

    renderQvRecs(p);

    overlay.classList.add('open');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    refreshQvRecs();
}

window.toggleQvSpecs = function(btn) {
    if (!btn) return;
    var wrap = btn.parentNode;
    if (!wrap) return;
    var detail = wrap.querySelector('.qv-spec-detail');
    if (!detail) { try { window.openSpecsModal(); } catch (e) {} return; }
    var open = detail.style.display !== 'none';
    detail.style.display = open ? 'none' : 'block';
    btn.textContent = open ? 'Ver especificaciones' : 'Ocultar especificaciones';
};

window.openSpecsModal = function() {
    var specEl = document.getElementById('qvSpec');
    if (!specEl || !specEl._specItems) return;
    var items = specEl._specItems;
    var desc = specEl._desc || '';
    var existing = document.getElementById('qvSpecsOverlay');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'qvSpecsOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:6000;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.5);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;transition:opacity .25s;';
    var panel = document.createElement('div');
    panel.style.cssText = 'width:100%;max-width:480px;max-height:75vh;background:#fff;border-radius:18px 18px 0 0;overflow-y:auto;transform:translateY(100%);transition:transform .3s cubic-bezier(0.4,0,0.2,1);padding:20px 20px 32px;';
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;"><strong style="font-size:16px;color:#0f172a;">Especificaciones</strong><button onclick="closeSpecsModal()" style="width:36px;height:36px;border-radius:50%;background:#f3f4f6;border:none;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;">&times;</button></div>';
    if (desc) html += '<div style="font-size:13px;line-height:1.65;color:#334155;margin-bottom:14px;">' + escapeHtml(desc) + '</div>';
    if (items.length >= 2) {
        html += '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;">'
            + items.map(function(it) { return '<li style="position:relative;padding-left:18px;font-size:13px;line-height:1.55;color:#334155;"><span style="position:absolute;left:0;top:8px;width:7px;height:7px;border-radius:50%;background:linear-gradient(135deg,#1769e0,#0d9488);"></span>' + escapeHtml(it) + '</li>'; }).join('')
            + '</ul>';
    }
    panel.innerHTML = html;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.style.opacity = '1'; panel.style.transform = 'translateY(0)'; });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeSpecsModal(); });
};

window.closeSpecsModal = function() {
    var overlay = document.getElementById('qvSpecsOverlay');
    if (!overlay) return;
    var panel = overlay.querySelector('div');
    overlay.style.opacity = '0';
    if (panel) panel.style.transform = 'translateY(100%)';
    setTimeout(function() { overlay.remove(); }, 300);
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RECOMENDACIONES EN MODAL (misma marca primero)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function bindQvRecsCarousel(carousel, prevBtn, nextBtn) {
    if (!carousel || carousel.dataset.qvRecsBound === '1') return;
    carousel.dataset.qvRecsBound = '1';

    var update = function() {
        var max = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
        prevBtn.disabled = carousel.scrollLeft <= 2;
        nextBtn.disabled = max <= 0 || carousel.scrollLeft >= max - 2;
    };
    var step = function() { return Math.max(190, Math.round(carousel.clientWidth * 0.8)); };

    prevBtn.addEventListener('click', function() { carousel.scrollBy({ left: -step(), behavior: 'smooth' }); });
    nextBtn.addEventListener('click', function() { carousel.scrollBy({ left: step(), behavior: 'smooth' }); });
    carousel.addEventListener('scroll', update, { passive: true });
    carousel.addEventListener('wheel', function(e) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && carousel.scrollWidth > carousel.clientWidth) {
            carousel.scrollLeft += e.deltaY;
            e.preventDefault();
        }
    }, { passive: false });

    var drag = { active: false, x: 0, scroll: 0, moved: false };
    carousel.addEventListener('pointerdown', function(e) {
        if (e.pointerType === 'touch') return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        drag.active = true;
        drag.x = e.clientX;
        drag.scroll = carousel.scrollLeft;
        drag.moved = false;
        carousel.classList.add('is-dragging');
    });
    carousel.addEventListener('pointermove', function(e) {
        if (!drag.active) return;
        var delta = e.clientX - drag.x;
        if (Math.abs(delta) > 3) drag.moved = true;
        carousel.scrollLeft = drag.scroll - delta;
        if (drag.moved) e.preventDefault();
    });
    var endDrag = function(e) {
        if (!drag.active) return;
        drag.active = false;
        carousel.classList.remove('is-dragging');
        update();
    };
    carousel.addEventListener('pointerup', endDrag);
    carousel.addEventListener('pointercancel', endDrag);
    carousel.addEventListener('click', function(e) {
        if (drag.moved) {
            e.preventDefault();
            e.stopPropagation();
            drag.moved = false;
        }
    }, true);

    var observer = new MutationObserver(update);
    observer.observe(carousel, { childList: true, subtree: true });
    if (!window._qvRecsResizeBound) {
        window.addEventListener('resize', refreshQvRecs);
        window._qvRecsResizeBound = true;
    }
    carousel._qvRecsUpdate = update;
    update();
}

function refreshQvRecs() {
    var wrap = document.getElementById('qvRecs');
    if (!wrap || wrap.style.display === 'none') return;
    var carousel = wrap.querySelector('.qv-recs-carousel');
    var prevBtn = wrap.querySelector('.qv-recs-prev');
    var nextBtn = wrap.querySelector('.qv-recs-next');
    if (!carousel || !prevBtn || !nextBtn) return;
    var update = carousel._qvRecsUpdate;
    if (update) update();
    requestAnimationFrame(function() {
        if (carousel._qvRecsUpdate) carousel._qvRecsUpdate();
        requestAnimationFrame(function() {
            if (carousel._qvRecsUpdate) carousel._qvRecsUpdate();
        });
    });
}

function renderQvRecs(current) {
    var wrap = document.getElementById('qvRecs');
    if (!wrap) {
        var modal = document.getElementById('qvModal');
        if (!modal) return;
        wrap = document.createElement('div');
        wrap.id = 'qvRecs';
        modal.appendChild(wrap);

        var style = document.createElement('style');
        style.textContent = ''
            + '#qvRecs{display:none;padding:20px 22px 24px;border-top:1px solid var(--n150,#e8eaed);background:linear-gradient(180deg,#fbfcfe,#f6f8fb);}'
             + '.qv-recs-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;}'
             + '.qv-recs-nav{display:flex;align-items:center;gap:6px;margin-left:auto;}'
             + '.qv-recs-nav button{width:32px;height:32px;padding:0;border:1px solid var(--n150,#dbe2ec);border-radius:50%;background:#fff;color:var(--n700,#334155);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(15,23,42,.08);transition:all .2s;}'
             + '.qv-recs-nav button:hover{border-color:var(--primary,#1769e0);background:#eef5ff;color:var(--primary,#1769e0);}'
             + '.qv-recs-nav button:disabled{opacity:.35;cursor:default;box-shadow:none;}'
             + '@media(max-width:600px){.qv-recs-nav{display:none;}}'
            + '.qv-recs-title{font-size:15px;font-weight:700;color:var(--n900,#0f172a);letter-spacing:-0.2px;}'
            + '.qv-recs-sub{font-size:11px;color:var(--n500,#64748b);}'
            + '.qv-recs-ico{flex-shrink:0;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--primary,#e63946),var(--primary-dark,#b71c1c));display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 4px 10px rgba(230,57,70,0.25);}'
            + '.qv-recs-ico svg{width:18px;height:18px;}'
              + '.qv-recs-carousel{display:flex;gap:12px;overflow-x:auto;overflow-y:hidden;padding:4px 2px 10px;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;scrollbar-width:auto;scrollbar-color:#17345e #c4d1e3;}'
              + '.qv-recs-carousel::-webkit-scrollbar{height:11px;}'
              + '.qv-recs-carousel::-webkit-scrollbar-track{background:#c4d1e3;border:1px solid #8fa6c2;border-radius:10px;}'
              + '.qv-recs-carousel::-webkit-scrollbar-thumb{background:#17345e;border:2px solid #c4d1e3;border-radius:10px;}'
              + '.qv-recs-carousel::-webkit-scrollbar-thumb:hover{background:#071b3a;}'
             + '.qv-rec-card{flex:0 0 clamp(180px,24vw,240px);width:clamp(180px,24vw,240px);min-width:clamp(180px,24vw,240px);background:#fff;border:1px solid var(--n150,#e8eaed);border-radius:14px;overflow:hidden;cursor:pointer;transition:all 0.22s cubic-bezier(0.4,0,0.2,1);box-shadow:0 1px 3px rgba(15,23,42,0.04);}'
            + '.qv-rec-card:hover{border-color:rgba(230,57,70,0.4);box-shadow:0 10px 24px rgba(15,23,42,0.10);transform:translateY(-3px);}'
            + '.qv-rec-media{position:relative;width:100%;height:118px;background:linear-gradient(180deg,#f8fafc,#eef1f6);display:flex;align-items:center;justify-content:center;overflow:hidden;}'
            + '.qv-rec-img{max-width:100%;max-height:118px;object-fit:contain;padding:12px;display:block;transition:transform 0.25s;}'
            + '.qv-rec-card:hover .qv-rec-img{transform:scale(1.06);}'
            + '.qv-rec-body{padding:10px 11px 12px;display:flex;flex-direction:column;gap:5px;}'
            + '.qv-rec-brand{font-size:9px;font-weight:700;color:var(--primary,#e63946);text-transform:uppercase;letter-spacing:0.7px;}'
            + '.qv-rec-name{font-size:11px;font-weight:500;color:var(--n800,#1e293b);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:31px;}'
            + '.qv-rec-price{display:flex;align-items:baseline;gap:5px;flex-wrap:wrap;margin-top:2px;}'
            + '.qv-rec-price .cur{font-size:14px;font-weight:800;color:var(--primary,#e63946);}'
            + '.qv-rec-price .orig{font-size:10px;color:var(--n300,#94a3b8);text-decoration:line-through;}'
            + '.qv-rec-price .disc{font-size:9px;font-weight:700;color:#fff;background:var(--accent,#f59e0b);padding:1px 6px;border-radius:6px;}'
            + '.qv-rec-ganancia{font-size:9px;color:#16a34a;font-weight:700;margin-top:1px;background:rgba(22,163,74,0.08);padding:3px 7px;border-radius:7px;display:inline-block;width:fit-content;}'
            + '.qv-rec-empty{font-size:12px;color:var(--n500,#64748b);text-align:center;padding:14px 0;}'
            + '.qv-ganancia-modal{font-size:12px;color:#16a34a;font-weight:700;margin-top:8px;padding:7px 10px;background:rgba(22,163,74,0.08);border-radius:8px;border:1px dashed rgba(22,163,74,0.35);display:inline-block;}'
              + '.qv-modal{width:94vw;max-width:1100px;max-height:90vh;overflow:hidden;overflow-x:hidden;}'
             + '.qv-content{min-height:440px;flex-shrink:0;overflow:visible;}'
            + '.qv-carousel-wrap{flex:0 0 52%;min-height:420px;background:linear-gradient(180deg,#fafbfc,#f0f2f6);}'
            + '.qv-carousel-slide img{height:420px;padding:32px;}'
             + '.qv-info{padding:32px 30px 26px 28px;max-height:none;overflow:visible;}'
            + '.qv-category{font-size:12px;letter-spacing:1px;margin-bottom:8px;}'
            + '.qv-title{font-size:24px;line-height:1.3;margin-bottom:6px;}'
            + '.qv-marca{font-size:13px;margin-bottom:10px;}'
            + '.qv-price .current{font-size:32px;}'
            + '.qv-price .discount{font-size:12px;padding:3px 12px;border-radius:8px;margin-left:12px;box-shadow:0 3px 10px rgba(245,158,11,0.3);}'
            + '.qv-price .orig{font-size:17px;}'
            + '.qv-stock{font-size:14px;padding:8px 14px;border-radius:10px;background:rgba(22,163,74,0.08);border:1px solid rgba(22,163,74,0.2);display:inline-block;margin-bottom:8px;}'
            + '.qv-stock.agotado{background:rgba(59,130,246,0.08);border-color:rgba(59,130,246,0.25);}'
            + '.qv-spec{font-size:13px;line-height:1.7;}'
            + '.qv-spec-list{list-style:none;padding:0;margin:6px 0 0;display:flex;flex-direction:column;gap:7px;}'
            + '.qv-spec-list li{position:relative;padding-left:16px;font-size:13px;line-height:1.55;color:var(--n700,#334155);}'
            + '.qv-spec-list li::before{content:"";position:absolute;left:0;top:7px;width:6px;height:6px;border-radius:50%;background:linear-gradient(135deg,var(--primary,#e63946),var(--accent,#f59e0b));}'
            + '.qv-desc-body{font-size:13px;line-height:1.65;color:var(--n700,#334155);}'
            + '.qv-desc-title{font-size:12px;font-weight:700;color:var(--n700,#334155);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px;margin-top:10px;}'
             + '.qv-actions{margin-top:8px;padding-top:18px;position:sticky;bottom:0;background:#fff;z-index:2;}'
+ '.btn-cart-add{height:48px;font-size:15px;}'
              + '#qvRecs{padding:24px 26px 28px;max-height:min(34vh,360px);overflow:hidden;flex:0 0 auto;min-height:0;}'
            + '.qv-recs-title{font-size:17px;}'
             + '.qv-recs-carousel{gap:14px;}'
             + '.qv-rec-card{width:100%;border-radius:16px;}'
            + '.qv-rec-media{height:150px;}'
            + '.qv-rec-img{max-height:150px;padding:14px;}'
            + '.qv-rec-name{font-size:12px;min-height:34px;}'
            + '.qv-rec-price .cur{font-size:16px;}'
              + '@media(max-width:900px){.qv-modal{max-width:94vw;max-height:90vh;overflow:hidden;overflow-x:hidden;}.qv-content{overflow:visible;}.qv-carousel-wrap{flex:none;height:260px;min-height:260px;}.qv-carousel-slide img{height:260px;padding:16px;}.qv-title{font-size:19px;}.qv-price .current{font-size:24px;}.qv-info{padding:20px 18px;}.qv-rec-card{flex-basis:clamp(180px,32vw,220px);width:clamp(180px,32vw,220px);min-width:clamp(180px,32vw,220px);}}@media(max-width:520px){#qvRecs{max-height:35vh;}.qv-carousel-wrap{height:220px;min-height:220px;}.qv-carousel-slide img{height:220px;}.qv-rec-card{flex-basis:clamp(170px,68vw,220px);width:clamp(170px,68vw,220px);min-width:clamp(170px,68vw,220px);}}';
        document.head.appendChild(style);
    }

    var recs = getQvRecommendations(current);
    if (!recs.length) { wrap.style.display = 'none'; return; }

    wrap.innerHTML = '<div class="qv-recs-head">'
        + '<div class="qv-recs-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>'
         + '<div><div class="qv-recs-title">También te puede interesar</div>'
         + '<div class="qv-recs-sub">Productos recomendados para ti</div></div>'
         + '<div class="qv-recs-nav" aria-label="Navegar recomendaciones">'
         + '<button type="button" class="qv-recs-prev" aria-label="Recomendación anterior"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>'
         + '<button type="button" class="qv-recs-next" aria-label="Siguiente recomendación"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>'
         + '</div></div>'
        + '<div class="qv-recs-carousel">'
        + recs.map(function(r) {
            var dd = getDisplayDiscount(r);
            var origHtml = dd > 0 ? '<span class="orig">Bs ' + fmtPrice(r.origPrice) + '</span>' : '';
            var discHtml = dd > 0 ? '<span class="disc">-' + dd + '%</span>' : '';
            var ganancia = (window._affShowGanancia && window._affComision > 0) ? '<span class="qv-rec-ganancia">Ganancia: Bs ' + fmtPrice(r.price * window._affComision / 100) + '</span>' : '';
            return '<div class="qv-rec-card" onclick="openProductModal(' + r.id + ')">'
                + '<div class="qv-rec-media"><img class="qv-rec-img" src="' + (r.images && r.images[0] ? r.images[0] : '') + '" alt="' + escapeHtml(r.name) + '" loading="lazy" onerror="this.onerror=null;this.style.display=\'none\'"></div>'
                + '<div class="qv-rec-body">'
                + (r.marca ? '<span class="qv-rec-brand">' + escapeHtml(r.marca) + '</span>' : '')
                + '<div class="qv-rec-name">' + escapeHtml(cleanName(r.name)) + '</div>'
                + '<div class="qv-rec-price"><span class="cur">Bs ' + fmtPrice(r.price) + '</span>' + origHtml + discHtml + '</div>'
                + ganancia
                + '</div></div>';
        }).join('')
        + '</div>';
     var recCarousel = wrap.querySelector('.qv-recs-carousel');
     var recPrev = wrap.querySelector('.qv-recs-prev');
     var recNext = wrap.querySelector('.qv-recs-next');
      if (recCarousel && recPrev && recNext) bindQvRecsCarousel(recCarousel, recPrev, recNext);
      wrap.style.display = 'block';
      refreshQvRecs();
}

function getQvRecommendations(current) {
    if (!allProducts.length || !current) return [];
    var out = [];
    var seen = {};
    seen[current.id] = true;
    var sameBrand = [];
    var others = [];
    for (var i = 0; i < allProducts.length; i++) {
        var p = allProducts[i];
        if (!p || seen[p.id]) continue;
        if (p.sku === 'TEST-PRUEBA-001') continue;
        if (!p.images || !p.images.length) continue;
        if (!stockDisponible(getTotalStock(p))) continue;
        seen[p.id] = true;
        if (p.marca && p.marca === current.marca) sameBrand.push(p);
        else others.push(p);
    }
    // Misma marca primero, luego mismo rango de precio (±30%), luego otros en stock
    var pmin = current.price * 0.7;
    var pmax = current.price * 1.3;
    for (var j = 0; j < sameBrand.length && out.length < 6; j++) {
        out.push(sameBrand[j]);
    }
    if (out.length < 8) {
        for (var k = 0; k < others.length && out.length < 8; k++) {
            var o = others[k];
            if (o.price >= pmin && o.price <= pmax) out.push(o);
        }
    }
    if (out.length < 12) {
        for (var m = 0; m < sameBrand.length && out.length < 12; m++) {
            if (out.indexOf(sameBrand[m]) === -1) out.push(sameBrand[m]);
        }
    }
    if (out.length < 12) {
        for (var n = 0; n < others.length && out.length < 12; n++) {
            if (out.indexOf(others[n]) === -1) out.push(others[n]);
        }
    }
    return out;
}

function closeQuickView() {
    var overlay = document.getElementById('qvOverlay');
    var modal = document.getElementById('qvModal');
    if (overlay) overlay.classList.remove('open');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
}

// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
// CAROUSEL HELPERS
// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
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

// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
// CART
// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
function addToCart(productId) {
    if (!storeIsLoggedIn()) { showStoreAuth('login'); return; }
    var p = allProducts.find(function(x) { return x.id === productId; });
    if (!p) { showToast('Error: producto no encontrado'); return; }
    var existing = cart.find(function(x) { return x.id === productId; });
    if (existing) { existing.qty++; }
    else { cart.push({ id: p.id, sku: p.sku, name: p.name, price: p.price, images: p.images || [], qty: 1 }); }
    updateCart();
    showToast(shortName(p.name) + ' agregado al carrito');
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
            + '<img class="cart-item-img" src="' + (c.images && c.images[0] ? c.images[0] : '') + '" alt="' + escapeHtml(cleanName(c.name)) + '">'
            + '<div class="cart-item-info">'
            + '<div class="cart-item-name">' + escapeHtml(shortName(c.name)) + '</div>'
            + '<div class="cart-item-sku">' + c.sku + '</div>'
            + '<div class="cart-item-price">Bs ' + fmtPrice(c.price) + ' c/u</div>'
            + '<div class="cart-item-qty">'
            + '<button onclick="changeQty(' + c.id + ',-1)">-</button>'
            + '<span>' + c.qty + '</span>'
            + '<button onclick="changeQty(' + c.id + ',1)">+</button>'
            + '</div></div>'
            + '<div class="cart-item-right">'
            + '<div class="ci-total">Bs ' + fmtPrice(c.price * c.qty) + '</div>'
            + '<button class="ci-remove" onclick="removeFromCart(' + c.id + ')" aria-label="Quitar">' + X_REMOVE_SVG + '</button>'
            + '</div></div>';
    }).join('');
    if (totalEl) {
        totalEl.innerHTML = '<div class="cart-total-row"><span>Subtotal</span><span>Bs ' + fmtPrice(subtotal) + '</span></div>'
            + '<div class="cart-total-grand"><span>Total</span><span>Bs ' + fmtPrice(subtotal) + '</span></div>';
    }
}

function openCart() { msxCloseAll('cart'); qs('#cartModal').classList.add('open'); qs('#cartOverlay').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCart() { qs('#cartModal').classList.remove('open'); qs('#cartOverlay').classList.remove('open'); document.body.style.overflow = ''; if (window._cartPoll) clearInterval(window._cartPoll); }

// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
// QR PAYMENT (redesigned)
// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
function generatePagayaQR() {
    if (!cart.length) return;
    if (!storeIsLoggedIn()) { showStoreAuth('login'); return; }
    openDeliveryModal();
}

function showQRPayment(pedidoId, total, items) {
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
    disableLocalPaymentButton();

    if (container) { container.innerHTML = '<div class="qr-spinner"></div>'; }
    if (info) { info.innerHTML = '<div class="qr-loading">Generando QR de pago...</div>'; }
    if (timer) timer.innerHTML = AFF_ICON.clock + ' 5:00';

    modal.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    var qrRequest = lastOrder && lastOrder.qr ? Promise.resolve(lastOrder.qr) : pagayaCreateQR(total, 'MyShop ' + pedidoId, pedidoId);
    qrRequest
        .then(function(data) {
            var qrData = normalizeQRResponse(data);
            lastOrder.qrId = qrData.qrId;
            lastOrder.referencia = qrData.referencia;
            lastOrder.uuid = qrData.uuid;

            var qrSrc = ensureDataUri(qrData.qrImage || '');
            if (container) {
                container.innerHTML = '<img src="' + escapeHtml(qrSrc) + '" alt="QR Pago" id="qrImageEl" style="width:180px;max-width:100%;height:auto;aspect-ratio:1;border-radius:8px;">';
            }
            var dlBtn = document.getElementById('qrDownloadBtn');
            if (dlBtn) dlBtn.style.display = '';
            if (info) {
                info.innerHTML = '<div class="qr-order-detail">'
                    + '<div class="qr-order-pedido">Pedido <strong>' + escapeHtml(pedidoId) + '</strong></div>'
                    + '<div class="qr-order-total">Bs ' + fmtPrice(total) + '</div>'
                    + '<div class="qr-order-ref">Ref: ' + escapeHtml(qrData.referencia) + ' · Entrega a domicilio</div>'
                    + '</div>';
            }
            if (timer) timer.innerHTML = AFF_ICON.clock + ' Tiempo restante: 5:00';
            disableLocalPaymentButton();
            if (waBtn) {
                var waMsg = encodeURIComponent('Hola, ya realicé el pago de mi pedido ' + pedidoId + ' por Bs ' + fmtPrice(total) + '. Adjunto comprobante.');
                waBtn.href = 'https://wa.me/59176219693?text=' + waMsg;
            }
            var st = registerQRState(pedidoId, { total: total, qrImg: qrData.qrImage || '', qrId: qrData.qrId, referencia: qrData.referencia || '', onPaid: function(s) { handlePaymentConfirmed(s.pedidoId); } });
            openQRState(st);
        })
        .catch(function(err) {
            console.error(err);
            if (container) {
                container.innerHTML = '<div style="text-align:center;padding:10px;">'
                    + '<div style="font-size:32px;color:#999;margin-bottom:6px;">' + AFF_ICON.dollar.replace(/width="14"/g,'width="30"').replace(/height="14"/g,'height="30"') + '</div>'
                    + '<div style="font-size:13px;font-weight:600;color:#1a1a2e;">Transferencia Bancaria</div>'
                    + '</div>';
            }
            if (info) {
                info.innerHTML = '<div class="qr-order-detail">'
                    + '<div class="qr-order-pedido">Pedido <strong>' + escapeHtml(pedidoId) + '</strong></div>'
                    + '<div class="qr-order-total">Bs ' + fmtPrice(total) + '</div>'
                    + '</div>'
                    + '<div style="text-align:left;background:#f8fafc;border-radius:10px;padding:12px;margin-top:6px;font-size:12px;">'
                    + '<div style="padding:2px 0;"><span style="color:#888;">Banco:</span> <strong>BCP</strong></div>'
                    + '<div style="padding:2px 0;"><span style="color:#888;">Nro:</span> <strong>123-4567890-1-23</strong></div>'
                    + '<div style="padding:2px 0;"><span style="color:#888;">Titular:</span> <strong>MyShop Bolivia</strong></div>'
                    + '<div style="padding:2px 0;"><span style="color:#888;">Monto:</span> <strong>Bs ' + fmtPrice(total) + '</strong></div>'
                    + '<div style="padding:2px 0;"><span style="color:#888;">Ref:</span> <strong>' + escapeHtml(pedidoId) + '</strong></div>'
                    + '</div>';
            }
            if (timer) timer.textContent = 'Datos bancarios';
            disableLocalPaymentButton();
            if (waBtn) { waBtn.style.display = 'inline-flex'; waBtn.classList.add('qr-btn', 'qr-btn-wa'); }
        });
}

function pagayaCreateQR(monto, descripcion, pedidoId) {
    return Promise.reject(new Error('El QR se genera al crear el pedido'));
}

function pagayaCheckStatus(pedidoId) {
    if (!storeIsLoggedIn() || !pedidoId) return Promise.reject(new Error('Sesión no autenticada'));
    return fetch(SHOP_CONFIG.orderApi + '?action=pedido&id=' + encodeURIComponent(pedidoId), { headers: { Authorization: 'Bearer ' + authToken } })
        .then(function(r) {
            if (r.status === 401) { handleUnauthorized(); throw new Error('Tu sesión expiró'); }
            if (!r.ok) throw new Error('No se pudo consultar el pedido');
            return r.json();
        })
        .then(function(d) {
            if (!d || !d.success || !d.pedido) throw new Error((d && d.error) || 'Respuesta de pedido inválida');
            if (String(d.pedido.id) !== String(pedidoId)) throw new Error('El servidor devolvió otro pedido');
            return { authenticated: true, paid: d.pedido.estado_pago === 'pagado', pedido: d.pedido };
        });
}

function downloadQR() {
    var img = document.getElementById('qrImageEl');
    if (!img || !img.src) return;
    var link = document.createElement('a');
    link.download = 'QR_Pago_MyShop.png';
    link.href = img.src;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// ===================== QR ESTADO (minimizable, uno por pedido) =====================
window._qrStates = {};
window._activeQR = null;

function isAffiliatePage() {
    try {
        return window.location.pathname.indexOf("/afiliado") !== -1
            || (new URLSearchParams(window.location.search).get("mode") === "afiliado");
    } catch (e) { return false; }
}

function getQRState(pedidoId) { return window._qrStates[pedidoId] || null; }

function registerQRState(pedidoId, cfg) {
    cfg = cfg || {};
    var st = window._qrStates[pedidoId];
    if (!st) {
        st = { pedidoId: pedidoId, total: Number(cfg.total || 0), qrImg: cfg.qrImg || '', qrId: cfg.qrId || '', referencia: cfg.referencia || '', pInfo: cfg.pInfo || null, onPaid: cfg.onPaid || null, secs: 300, paid: false, minimized: false, pollInt: null, timerInt: null };
        window._qrStates[pedidoId] = st;
    } else {
        if (cfg.total != null) st.total = Number(cfg.total);
        if (cfg.qrImg) st.qrImg = cfg.qrImg;
        if (cfg.qrId) st.qrId = cfg.qrId;
        if (cfg.referencia) st.referencia = cfg.referencia;
        if (cfg.pInfo) st.pInfo = cfg.pInfo;
        if (cfg.onPaid) st.onPaid = cfg.onPaid;
        if (st.secs <= 0) st.secs = 300;
    }
    return st;
}

function fmtSecs(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function startStateTimer(st) {
    if (st.timerInt) clearInterval(st.timerInt);
    st.timerInt = setInterval(function() {
        st.secs--;
        if (st.secs <= 0) {
            clearInterval(st.timerInt);
            if (st.pollInt) clearInterval(st.pollInt);
            if (window._activeQR === st && !st.minimized) {
                var timerEl = document.getElementById('qrTimer');
                if (timerEl) timerEl.innerHTML = AFF_ICON.alert + ' Expirado';
            }
            return;
        }
        if (window._activeQR === st && !st.minimized) {
            var timerEl2 = document.getElementById('qrTimer');
            if (timerEl2) timerEl2.innerHTML = AFF_ICON.clock + ' ' + fmtSecs(st.secs);
        }
    }, 1000);
}

function startStatePolling(st) {
    if (st.pollInt) clearInterval(st.pollInt);
    var attempts = 0;
    st.pollInt = setInterval(function() {
        attempts++;
        if (st.paid) { clearInterval(st.pollInt); return; }
        if (attempts > 60) {
            if (window._activeQR === st && !st.minimized) {
                disableLocalPaymentButton();
                var timerEl = document.getElementById('qrTimer');
                if (timerEl && attempts === 61) timerEl.innerHTML = AFF_ICON.clock + ' Verificando pago...';
            }
        }
        checkOrderPayment(st).catch(function() {});
    }, 3000);
}

function checkOrderPayment(st) {
    if (!st || st.paid) return Promise.resolve(!!(st && st.paid));
    return pagayaCheckStatus(st.pedidoId).then(function(data) {
            if (st.paid) return;
            if (data.authenticated && data.paid) {
                clearInterval(st.pollInt);
                st.paid = true;
                st.serverConfirmed = true;
                if (st.onPaid) st.onPaid(st);
                else handlePaymentConfirmed(st.pedidoId);
            }
            return data.paid;
        });
}

// --- Chips minimizados (abajo a la derecha) ---
function ensureQRMinStack() {
    var stack = document.getElementById('qrMinStack');
    if (stack) return stack;
    stack = document.createElement('div');
    stack.id = 'qrMinStack';
    stack.style.cssText = 'position:fixed;bottom:84px;right:14px;z-index:9000;display:flex;flex-direction:column;gap:8px;align-items:flex-end;';
    document.body.appendChild(stack);
    return stack;
}

function removeQRMinChip(pedidoId) {
    var c = document.getElementById('qrMinChip-' + pedidoId);
    if (c) c.remove();
    var s = document.getElementById('qrMinStack');
    if (s && !s.children.length) s.remove();
}

function updateChipPaid(st) {
    var statusEl = document.getElementById('qrMinChipStatus-' + st.pedidoId);
    var chip = document.getElementById('qrMinChip-' + st.pedidoId);
    if (statusEl) { statusEl.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px;"><path d="M20 6 9 17l-5-5"/></svg>Pagado'; statusEl.style.color = '#16a34a'; statusEl.style.fontWeight = '700'; }
    if (chip) chip.style.borderColor = '#16a34a';
}

function renderQRMinChip(st) {
    var stack = ensureQRMinStack();
    removeQRMinChip(st.pedidoId);
    var chip = document.createElement('div');
    chip.id = 'qrMinChip-' + st.pedidoId;
    chip.style.cssText = 'display:flex;align-items:center;gap:10px;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.18);padding:8px 10px;cursor:pointer;max-width:270px;border:1px solid #e8eaed;transition:transform 0.2s,box-shadow 0.2s;';
    chip.onmouseover = function() { chip.style.transform = 'translateY(-2px)'; chip.style.boxShadow = '0 10px 34px rgba(0,0,0,0.22)'; };
    chip.onmouseout = function() { chip.style.transform = ''; chip.style.boxShadow = ''; };
    chip.innerHTML = '<img src="' + escapeHtml(ensureDataUri(st.qrImg)) + '" alt="QR de pago" style="width:44px;height:44px;border-radius:8px;border:1px solid #e5e7eb;flex-shrink:0;">'
        + '<div style="min-width:0;">'
        + '<div style="font-size:11px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;">' + escapeHtml(st.pedidoId) + '</div>'
        + '<div style="font-size:11px;color:#1e40af;font-weight:700;">Bs ' + fmtPrice(st.total) + '</div>'
        + '<div id="qrMinChipStatus-' + st.pedidoId + '" style="font-size:9px;color:#6b7280;">Esperando pago...</div>'
        + '</div>'
        + '<button id="qrMinChipX-' + st.pedidoId + '" title="Cerrar QR" style="width:22px;height:22px;border-radius:50%;background:#f3f4f6;border:none;color:#6b7280;cursor:pointer;font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;">' + AFF_ICON.x + '</button>';
    chip.addEventListener('click', function(e) {
        if (e.target.closest('#qrMinChipX-' + st.pedidoId)) return;
        window.restoreQRState(st.pedidoId);
    });
    var xBtn = chip.querySelector('#qrMinChipX-' + st.pedidoId);
    if (xBtn) xBtn.addEventListener('click', function(e) { e.stopPropagation(); window.closeQRState(st.pedidoId); });
    stack.appendChild(chip);
}

function ensureQRMinBtn() {
    var modal = document.getElementById('qrModal');
    if (!modal || document.getElementById('qrMinBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'qrMinBtn';
    btn.className = 'qr-close';
    btn.title = 'Minimizar QR';
    btn.style.right = '50px';
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    btn.onclick = function(e) { e.stopPropagation(); window.minimizeActiveQR(); };
    modal.appendChild(btn);
}

// --- Render de la info del pedido dentro del modal ---
function renderQRInfo(info, st) {
    var pInfo = st.pInfo;
    var html = '<div class="qr-order-detail">'
        + '<div class="qr-order-pedido">Pedido <strong>' + escapeHtml(st.pedidoId) + '</strong></div>'
        + '<div class="qr-order-total">Bs ' + fmtPrice(st.total) + '</div>';
    if (pInfo && pInfo.items) {
        html += '<div class="qr-order-ref">Ref: ' + escapeHtml(st.pedidoId) + '</div>';
        var itemsHtml = '';
        (pInfo.items || []).forEach(function(it) {
            itemsHtml += '<div style="display:flex;justify-content:space-between;font-size:11px;color:#374151;padding:2px 0;">'
                + '<span style="flex:1;padding-right:6px;">' + escapeHtml(it.nombre || it.sku || '') + ' <span style="color:#9ca3af;">x' + Number(it.cantidad || 1) + '</span></span>'
                + '<span style="font-weight:600;color:#111;">Bs ' + Number(it.subtotal || 0).toFixed(2) + '</span></div>';
        });
        if (itemsHtml) html += '<div style="margin-top:8px;border-top:1px dashed #e5e7eb;padding-top:6px;">' + itemsHtml + '</div>';
        var envio = Number(pInfo.envio || 0);
        var subt = Number(pInfo.subtotal || 0) || (Number(st.total) - envio);
        html += '<div style="margin-top:6px;border-top:1px dashed #e5e7eb;padding-top:6px;font-size:11px;color:#6b7280;">'
            + '<div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>Bs ' + subt.toFixed(2) + '</span></div>'
            + '<div style="display:flex;justify-content:space-between;"><span>Env&#237;o</span><span>Bs ' + envio.toFixed(2) + '</span></div>'
            + '<div style="display:flex;justify-content:space-between;font-weight:700;color:#111;margin-top:3px;"><span>Total</span><span>Bs ' + Number(st.total || 0).toFixed(2) + '</span></div>'
            + '</div>';
        var dirTxt = ((pInfo.cliente_direccion || '').trim() ? (pInfo.cliente_direccion.trim() + (pInfo.cliente_ciudad ? ', ' + pInfo.cliente_ciudad : '')) : '');
        if (dirTxt) html += '<div style="margin-top:6px;font-size:10px;color:#6b7280;">' + AFF_ICON.pin + ' ' + escapeHtml(dirTxt) + '</div>';
    } else {
        html += '<div class="qr-order-ref">Ref: ' + escapeHtml(st.referencia || st.pedidoId) + ' · Entrega a domicilio</div>';
    }
    html += '</div>';
    info.innerHTML = html;
}

// --- Abrir (o restaurar) un estado QR ---
function openQRState(st) {
    if (!st) return;
    var prev = window._activeQR;
    if (prev && prev !== st) {
        if (prev.paid) { if (!prev.minimized) window.closeQRState(prev.pedidoId); }
        else if (!prev.minimized) { prev.minimized = true; renderQRMinChip(prev); }
    }
    window._activeQR = st;
    st.minimized = false;
    removeQRMinChip(st.pedidoId);
    ensureQRMinBtn();

    var title = document.getElementById('qrTitle');
    var timer = document.getElementById('qrTimer');
    var hint = document.getElementById('qrHint');
    var container = document.getElementById('qrContainer');
    var info = document.getElementById('qrOrderInfo');
    var confirmBtn = document.getElementById('qrConfirmBtn');
    var waBtn = document.getElementById('qrWaBtn');
    var statusMsg = document.getElementById('qrStatusMsg');
    var bodyActions = document.getElementById('qrBodyActions');
    var done = document.getElementById('qrPaymentDone');
    var dlBtn = document.getElementById('qrDownloadBtn');

    if (done) done.style.display = 'none';
    if (bodyActions) bodyActions.style.display = 'flex';
    if (title) title.textContent = 'Pagar con QR';
    if (hint) hint.textContent = 'Escaneá con tu app de banco';
    if (waBtn) waBtn.style.display = 'none';
    if (statusMsg) statusMsg.textContent = '';
    disableLocalPaymentButton();
    if (dlBtn) dlBtn.style.display = '';
    if (container) container.innerHTML = '<img src="' + escapeHtml(ensureDataUri(st.qrImg)) + '" alt="QR Pago" id="qrImageEl" style="width:180px;max-width:100%;height:auto;aspect-ratio:1;border-radius:8px;">';
    if (info) renderQRInfo(info, st);
    if (timer) timer.innerHTML = AFF_ICON.clock + ' ' + fmtSecs(st.secs);
    if (waBtn) {
        var waMsg = encodeURIComponent('Hola, ya realicé el pago de mi pedido ' + st.pedidoId + ' por Bs ' + fmtPrice(st.total) + '.');
        waBtn.href = 'https://wa.me/59176219693?text=' + waMsg;
        waBtn.style.display = 'inline-flex';
    }

    var modal = document.getElementById('qrModal');
    var overlay = document.getElementById('qrOverlay');
    if (modal) modal.classList.add('open');
    if (overlay) overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    syncQROpenClass();

    if (st.paid) { renderPaymentDoneUI(st); return; }
    startStateTimer(st);
    startStatePolling(st);
}

// --- Pantalla de pago confirmado ---
function renderPaymentDoneUI(st) {
    if (!st) return;
    var pedidoId = st.pedidoId;
    var total = st.total;
    var title = document.getElementById('qrTitle');
    var timer = document.getElementById('qrTimer');
    var container = document.getElementById('qrContainer');
    var info = document.getElementById('qrOrderInfo');
    var confirmBtn = document.getElementById('qrConfirmBtn');
    var waBtn = document.getElementById('qrWaBtn');
    var statusMsg = document.getElementById('qrStatusMsg');
    var bodyActions = document.getElementById('qrBodyActions');
    var done = document.getElementById('qrPaymentDone');

    if (title) title.innerHTML = AFF_ICON.check + ' Pago Confirmado';
    if (timer) timer.innerHTML = AFF_ICON.check + ' Pagado';
    if (container) container.innerHTML = '<div style="font-size:56px;line-height:1;">' + AFF_ICON.checkCircle + '</div>';
    if (info) info.innerHTML = '';
    disableLocalPaymentButton();
    if (waBtn) waBtn.style.display = 'none';
    if (statusMsg) statusMsg.textContent = '';
    if (bodyActions) bodyActions.style.display = 'none';

    if (done) {
        var itemsHtml = '';
        if (st.pInfo && st.pInfo.items && st.pInfo.items.length) {
            itemsHtml = st.pInfo.items.map(function(it) {
                return '<div style="font-size:12px;color:#555;padding:2px 0;">' + AFF_ICON.dot + ' ' + escapeHtml(it.nombre || it.sku || '') + ' x' + (it.cantidad || 1) + ' - Bs ' + fmtPrice(it.subtotal || 0) + '</div>';
            }).join('');
        } else if (lastOrder && lastOrder.items) {
            itemsHtml = lastOrder.items.map(function(c) {
                return '<div style="font-size:12px;color:#555;padding:2px 0;">' + AFF_ICON.dot + ' ' + escapeHtml(shortName(c.name)) + ' x' + c.qty + ' - Bs ' + fmtPrice(c.price * c.qty) + '</div>';
            }).join('');
        }
        var waItems = '';
        if (st.pInfo && st.pInfo.items && st.pInfo.items.length) {
            waItems = st.pInfo.items.map(function(it) { return '• ' + (it.nombre || it.sku || '') + ' x' + (it.cantidad || 1) + ' = Bs ' + fmtPrice(it.subtotal || 0); }).join('\n');
        } else if (lastOrder && lastOrder.items) {
            waItems = lastOrder.items.map(function(c) { return '• ' + AFF_ICON.dot + ' ' + c.name + ' x' + c.qty + ' = Bs ' + fmtPrice(c.price * c.qty); }).join('\n');
        }
        var waMsg = encodeURIComponent('*Pedido Confirmado!*\n\nID: ' + pedidoId + '\n' + waItems + '\n\n*Total: Bs ' + fmtPrice(total) + '*\nEntrega: domicilio\n\nGracias!');
        done.style.display = 'block';
        done.innerHTML = '<div class="pay-check">' + AFF_ICON.checkCircle + '</div>'
            + '<div class="pay-title">¡Pago Confirmado!</div>'
            + '<div class="pay-pedido">Pedido ' + escapeHtml(pedidoId) + '</div>'
            + '<div class="pay-total">Bs ' + fmtPrice(total) + '</div>'
            + (itemsHtml ? '<div style="text-align:left;margin:6px 0;padding:8px;background:#f8fafc;border-radius:8px;">' + itemsHtml + '</div>' : '')
            + '<a class="qr-btn qr-btn-wa" href="https://wa.me/59176219693?text=' + waMsg + '" target="_blank" style="display:inline-flex;width:100%;">'
            + '  <svg class="wa-icon" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'
            + '  Enviar comprobante por WhatsApp'
            + '</a>';
    }
}

// --- Minimizar / restaurar / cerrar estados ---
window.minimizeActiveQR = function() {
    var st = window._activeQR;
    if (!st || st.paid) return;
    if (!isAffiliatePage()) {
        Object.keys(window._qrStates).forEach(function(k) {
            var s = window._qrStates[k];
            if (s !== st && s.minimized) window.closeQRState(k);
        });
    }
    st.minimized = true;
    var modal = document.getElementById('qrModal');
    var overlay = document.getElementById('qrOverlay');
    if (modal) modal.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    syncQROpenClass();
    renderQRMinChip(st);
};

window.restoreQRState = function(pedidoId) {
    var st = getQRState(pedidoId);
    if (!st) return;
    openQRState(st);
};

window.closeQRState = function(pedidoId) {
    var st = getQRState(pedidoId);
    if (!st) return;
    if (st.timerInt) clearInterval(st.timerInt);
    if (st.pollInt) clearInterval(st.pollInt);
    removeQRMinChip(pedidoId);
    if (window._activeQR === st) {
        var modal = document.getElementById('qrModal');
        var overlay = document.getElementById('qrOverlay');
        if (modal) modal.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
        syncQROpenClass();
        window._activeQR = null;
        _paymentConfirmed = false;
    }
    delete window._qrStates[pedidoId];
};

function closeQR() {
    var st = window._activeQR;
    if (st) { window.closeQRState(st.pedidoId); return; }
    var modal = document.getElementById('qrModal');
    var overlay = document.getElementById('qrOverlay');
    if (modal) modal.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    syncQROpenClass();
    _paymentConfirmed = false;
}
function closeQRModal() { closeQR(); window._pendingPayment = null; }
// ===================== EXTRAS DE TIENDA (2026-08-03) =====================
function syncQROpenClass() {
    var modal = document.getElementById('qrModal');
    var has = modal && modal.classList.contains('open');
    document.body.classList.toggle('qr-open', !!has);
}

(function() {
    var style = document.createElement('style');
    style.id = 'shopExtraCss';
    style.textContent = '#wmOverlay{display:none!important}' + '.topbar{display:none!important}'
+ '.topbar-inner,.trust-strip,.shop-layout,.footer-inner{max-width:100%!important}'
+ '.trust-strip{display:none!important}'
        + '.offers-nav{display:flex;gap:8px;margin-left:auto;align-items:center}'
        + '.offers-nav button{width:36px;height:36px;border-radius:50%;border:1px solid var(--n150);background:#fff;color:var(--n700);cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(10,25,48,0.08);transition:all .2s}'
        + '.offers-nav button:hover{background:#f0faf4;border-color:#25d366;color:#128c4a}'
        + '.offers-nav button:disabled{opacity:.35;cursor:default}'
        + '@media(max-width:768px){.offers-nav{display:none}}'
        + '.qv-desc-title{font-size:11px;font-weight:700;color:var(--primary,#e63946);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px;}';
    document.head.appendChild(style);

    var wm = document.getElementById('wmOverlay');
    if (wm) wm.remove();

    var tb = document.querySelector('.topbar');
    if (tb) tb.remove();

    var ts = document.querySelector('.trust-strip');
    if (ts) ts.remove();

    var oc = document.getElementById('offersCarousel');
    var oh = document.querySelector('.offers-header');
    if (oc && oh) {
        var nav = document.createElement('div');
        nav.className = 'offers-nav';
        nav.innerHTML = '<button type="button" id="offersPrev" aria-label="Anterior"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button><button type="button" id="offersNext" aria-label="Siguiente"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>';
        oh.appendChild(nav);
        var prevBtn = document.getElementById('offersPrev');
        var nextBtn = document.getElementById('offersNext');
        var step = function() { return Math.max(240, Math.round(oc.clientWidth * 0.8)); };
        prevBtn.addEventListener('click', function() { oc.scrollBy({ left: -step(), behavior: 'smooth' }); });
        nextBtn.addEventListener('click', function() { oc.scrollBy({ left: step(), behavior: 'smooth' }); });
        var upd = function() {
            var max = oc.scrollWidth - oc.clientWidth;
            prevBtn.disabled = oc.scrollLeft <= 2;
            nextBtn.disabled = max <= 0 || oc.scrollLeft >= max - 2;
        };
oc.addEventListener('scroll', upd);
window.addEventListener('resize', upd);
new MutationObserver(upd).observe(oc, { childList: true, subtree: true });
upd();
}
})();

/* Premium blue accents for access and the purchase guidance. */
(function() {
    var style = document.createElement('style');
    style.textContent = '.store-auth-kicker{color:#2563eb!important}.store-auth-modal input:focus{border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,.1)!important}#storeAuthSubmit{background:#1d4ed8!important}#storeAuthSubmit:hover{background:#1e40af!important}.store-guide{background:linear-gradient(100deg,#172554,#1e40af)!important}';
    document.head.appendChild(style);
})();

// ===================== MEJORAS v2 (2026-08-03) =====================

// â”€â”€â”€ LIVE SEARCH SUGGESTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(function() {
    var style = document.createElement('style');
    style.textContent = ''
        + '#searchDropdown{position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e8eaed;border-radius:0 0 10px 10px;box-shadow:0 12px 32px rgba(0,0,0,0.1);z-index:100;max-height:320px;overflow-y:auto;display:none;}'
        + '#searchDropdown.show{display:block;}'
        + '.search-sugg-item{padding:9px 16px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f5f5f8;transition:background .15s;}'
        + '.search-sugg-item:hover,.search-sugg-item.active{background:rgba(37,99,235,0.06);}'
        + '.search-sugg-item:last-child{border-bottom:none;}'
        + '.search-sugg-name{flex:1;font-weight:500;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
        + '.search-sugg-price{font-weight:700;color:#2563eb;font-size:13px;white-space:nowrap;}'
        + '.search-sugg-img{width:32px;height:32px;object-fit:contain;border-radius:4px;background:#f8f9fc;flex-shrink:0;}'
        + '.search-sugg-no{text-align:center;padding:20px;color:#999;font-size:12px;}';
    document.head.appendChild(style);

    function initSearchDropdown() {
        var inp = document.getElementById('searchInput');
        if (!inp || inp.dataset._liveInit) return;
        inp.dataset._liveInit = '1';

        var wrap = inp.closest('.header-search') || inp.parentElement;
        if (!wrap) return;
        // Make wrap relative if needed
        if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';

        var dd = document.createElement('div');
        dd.id = 'searchDropdown';
        dd.className = '';
        wrap.appendChild(dd);

        var activeIdx = -1;

        function setActive(idx) {
            var items = dd.querySelectorAll('.search-sugg-item');
            items.forEach(function(it, i) { it.classList.toggle('active', i === idx); });
            activeIdx = idx;
        }

        function showResults(items) {
            if (!items || !items.length) {
                dd.innerHTML = '<div class="search-sugg-no">No se encontraron productos</div>';
                dd.classList.add('show');
                return;
            }
            dd.innerHTML = items.map(function(p, i) {
                var img = p.images && p.images[0] ? p.images[0] : '';
                return '<div class="search-sugg-item' + (i === 0 ? ' active' : '') + '" data-id="' + p.id + '">'
                    + (img ? '<img class="search-sugg-img" src="' + img + '" loading="lazy" onerror="this.style.display=\'none\'">' : '')
                    + '<span class="search-sugg-name">' + escapeHtml(p.name) + '</span>'
                    + '<span class="search-sugg-price">Bs ' + fmtPrice(p.price) + '</span>'
                    + '</div>';
            }).join('');
            dd.classList.add('show');
            activeIdx = 0;

            // Click handler
            dd.querySelectorAll('.search-sugg-item').forEach(function(el) {
                el.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    var id = parseInt(el.dataset.id);
                    var p = allProducts.find(function(x) { return x.id === id; });
                    if (p) openProductModal(id);
                    dd.classList.remove('show');
                    inp.value = '';
                });
            });
        }

        var debounceTimer;
        inp.addEventListener('input', function() {
            clearTimeout(debounceTimer);
            var q = inp.value.trim();
            if (q.length < 2) { dd.classList.remove('show'); return; }

            debounceTimer = setTimeout(function() {
                var ql = q.toLowerCase();
                var matches = [];
                for (var i = 0; i < allProducts.length; i++) {
                    var p = allProducts[i];
                    var name = (p.name || '').toLowerCase();
                    var sku = (p.sku || '').toLowerCase();
                    var marca = (p.marca || '').toLowerCase();
                    if (name.indexOf(ql) !== -1 || sku.indexOf(ql) !== -1 || marca.indexOf(ql) !== -1) {
                        matches.push(p);
                        if (matches.length >= 8) break;
                    }
                }
                showResults(matches);
            }, 200);
        });

        inp.addEventListener('keydown', function(e) {
            var items = dd.querySelectorAll('.search-sugg-item');
            if (!dd.classList.contains('show') || !items.length) return;

            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIdx + 1, items.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIdx - 1, 0)); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                var active = dd.querySelector('.search-sugg-item.active');
                if (active) {
                    var id = parseInt(active.dataset.id);
                    var p = allProducts.find(function(x) { return x.id === id; });
                    if (p) { openProductModal(id); dd.classList.remove('show'); inp.value = ''; }
                }
            }
            else if (e.key === 'Escape') { dd.classList.remove('show'); }
        });

        // Close on click outside
        document.addEventListener('click', function(e) {
            if (!wrap.contains(e.target)) dd.classList.remove('show');
        });
    }

    // Wait for products to be ready
    var _origLoad2 = window.loadProducts;
    window.loadProducts = function() {
        _origLoad2.apply(this, arguments);
        var check2 = setInterval(function() {
            if (allProducts && allProducts.length > 0) { clearInterval(check2); initSearchDropdown(); }
        }, 300);
    };
})();


// â”€â”€â”€ BACK TO TOP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(function() {
    var style = document.createElement('style');
    style.textContent = ''
        + '#backToTop{position:fixed;right:16px;bottom:84px;z-index:8400;width:42px;height:42px;border-radius:50%;border:none;background:rgba(26,26,46,0.85);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;visibility:hidden;transition:opacity .3s,visibility .3s,transform .2s;box-shadow:0 4px 16px rgba(0,0,0,0.15);backdrop-filter:blur(4px);}'
        + '#backToTop.visible{opacity:1;visibility:visible;}'
        + '#backToTop:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(26,26,46,0.25);}'
        + '#backToTop svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}'
        + '@media(max-width:480px){#backToTop{right:12px;bottom:76px;width:38px;height:38px}#backToTop svg{width:16px;height:16px}}';
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.id = 'backToTop';
    btn.setAttribute('aria-label', 'Volver arriba');
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    btn.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.body.appendChild(btn);

    var ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(function() {
                btn.classList.toggle('visible', window.scrollY > 400);
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
})();






function handlePaymentConfirmed(pedidoId) {
    if (_paymentConfirmed) return;
    var st = getQRState(pedidoId);
    if (!st || !st.serverConfirmed) return;
    if (lastOrder && lastOrder.status === 'paid') return;
    _paymentConfirmed = true;
    if (lastOrder && lastOrder.id === pedidoId) lastOrder.status = 'paid';
    if (st) {
        st.paid = true;
        if (st.timerInt) clearInterval(st.timerInt);
        if (st.pollInt) clearInterval(st.pollInt);
        if (st.minimized) {
            updateChipPaid(st);
            if (!st.pInfo) { cart = []; updateCart(); }
            showToast('Pedido ' + pedidoId + ' confirmado', AFF_ICON.check);
            setTimeout(function() { launchConfetti(); }, 300);
            return;
        }
    } else {
        if (window._qrPoll) clearInterval(window._qrPoll);
        if (window._qrTimer) clearInterval(window._qrTimer);
    }
    renderPaymentDoneUI(st);
    if (!st.pInfo) { cart = []; updateCart(); }
    if (document.getElementById('storeOrders') && !document.getElementById('storeOrders').hidden) loadStoreOrders();
    showToast('Pedido ' + pedidoId + ' confirmado', AFF_ICON.check);
    setTimeout(function() { launchConfetti(); }, 300);
}


// =??=??=?? CONFETTI =??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??=??
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

// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
// DOM EVENTS
// =?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?==?=
// =?==?==?= Logo swap on scroll =?==?==?=
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CHAT ASISTENTE IA — v4 streaming real + cotización en vivo
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
var chatHistory = [];
var chatBusy = false;
var chatContextProduct = null;
var chatInitialized = false;
var chatMode = 'chat';
var cotizQtyMap = {};

var CHAT_SUGGESTIONS = [
    'Quiero una cámara para mi casa',
    'Parlante bluetooth hasta 300 bs',
    'Tablet para estudiar',
    'Audífonos para trabajar',
    'Necesito una alarma'
];
var COTIZACION_SUGGESTIONS = [
    'Cotizar sistema de seguridad completo',
    'Cotizar equipamiento de oficina',
    'Cotizar parlantes para evento'
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
    var modeCheck = getChatEl('chatModeCheck');

    if (fab) fab.addEventListener('click', function() {
        if (widget && widget.classList.contains('open')) closeChat(); else openChat();
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
    if (modeCheck) {
        modeCheck.addEventListener('change', function() {
            chatMode = this.checked ? 'cotizacion' : 'chat';
            switchChatMode(chatMode);
        });
    }
    var cotizClose = getChatEl('cotizClose');
    var cotizOverlay = getChatEl('cotizOverlay');
    var cotizAddAll = getChatEl('cotizAddAll');
    var cotizSendWp = getChatEl('cotizSendWp');
    var cotizResetBtn = getChatEl('cotizReset');
    if (cotizClose) cotizClose.addEventListener('click', closeCotizModal);
    if (cotizOverlay) cotizOverlay.addEventListener('click', closeCotizModal);
    if (cotizAddAll) cotizAddAll.addEventListener('click', cotizAddAllToCart);
    if (cotizSendWp) cotizSendWp.addEventListener('click', cotizSendWhatsApp);
    if (cotizResetBtn) cotizResetBtn.addEventListener('click', function() { window.cotizReset(); });
    var cotizChatToggle = getChatEl('cotizChatToggle');
    if (cotizChatToggle) cotizChatToggle.addEventListener('click', function() {
        if (document.body.classList.contains('cotiz-split')) {
            document.body.classList.remove('cotiz-split');
            cotizChatToggle.setAttribute('aria-pressed', 'false');
        } else {
            applyCotizSplit(true);
            cotizChatToggle.setAttribute('aria-pressed', 'true');
        }
    });

    var sugWrap = getChatEl('chatSuggestions');
    if (sugWrap) {
        renderSuggestions(sugWrap, CHAT_SUGGESTIONS);
        sugWrap.addEventListener('click', function(e) {
            var b = e.target.closest('.chat-suggestion');
            if (b) sendChatMessage(b.dataset.s);
        });
    }
    if (recClose) recClose.addEventListener('click', closeRecModal);
    if (overlay) overlay.addEventListener('click', closeRecModal);
    updateSwitchLabels();
    addBotMessage('¡Hola! Soy **Max**, tu asesor de ventas de MyShop Bolivia.\n\n¿Qué estás buscando? Podés decirme:\n• Quiero una cámara para mi casa\n• Parlante bluetooth hasta 300 bs\n• Necesito una tablet para estudiar\n\nTe ayudo a encontrar el producto ideal.');
}

function updateSwitchLabels() {
    var lc = getChatEl('switchLabelChat');
    var lz = getChatEl('switchLabelCotiz');
    if (lc) lc.className = 'chat-switch-label' + (chatMode === 'chat' ? ' active' : '');
    if (lz) lz.className = 'chat-switch-label' + (chatMode === 'cotizacion' ? ' active' : '');
}

function switchChatMode(mode) {
    updateSwitchLabels();
    var sugWrap = getChatEl('chatSuggestions');
    var msgs = getChatEl('chatMessages');
    var input = getChatEl('chatInput');
    if (msgs) msgs.innerHTML = '';
    if (sugWrap) renderSuggestions(sugWrap, mode === 'chat' ? CHAT_SUGGESTIONS : COTIZACION_SUGGESTIONS);
    if (mode === 'cotizacion') {
        addBotMessage('Modo **Cotización** activado.\n\nDecime qué necesitás y Max arma la cotización en vivo. Al final la agregás al carrito con un toque.');
        if (input) input.placeholder = 'Describí lo que necesitás cotizar...';
    } else {
        addBotMessage('Modo **Chat** activado.\n\n¿Qué estás buscando? Te ayudo a encontrar el producto ideal.');
        if (input) input.placeholder = 'Escribí tu consulta...';
    }
}

function renderSuggestions(el, list) {
    el.innerHTML = list.map(function(s) {
        return '<button class="chat-suggestion" data-s="' + s.replace(/"/g, '&quot;') + '">' + s + '</button>';
    }).join('');
}

function openChat() {
    msxCloseAll('chat');
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
    var fab = getChatEl('chatFab');
    if (fab) fab.classList.remove('hidden-badge');
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
            + '<button class="chat-context-clear" id="chatContextClear" aria-label="Quitar">×</button>';
        var clearBtn = getChatEl('chatContextClear');
        if (clearBtn) clearBtn.addEventListener('click', function() { chatContextProduct = null; renderChatContext(); });
    } else { ctx.style.display = 'none'; ctx.innerHTML = ''; }
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
    div.innerHTML = '<div class="chat-msg-avatar">Tú</div><div class="chat-msg-bubble">' + escapeHtml(text) + '</div>';
    msgs.appendChild(div);
    scrollChatToBottom();
}

function addBotMessage(html) {
    var msgs = getChatEl('chatMessages');
    if (!msgs) return;
    var div = document.createElement('div');
    div.className = 'chat-msg bot';
    div.innerHTML = '<div class="chat-msg-avatar">M</div><div class="chat-msg-bubble">' + formatBotText(html) + '</div>';
    msgs.appendChild(div);
    scrollChatToBottom();
}

function createStreamingBubble() {
    var msgs = getChatEl('chatMessages');
    if (!msgs) return null;
    var div = document.createElement('div');
    div.className = 'chat-msg bot';
    div.id = 'chatStreaming';
    div.innerHTML = '<div class="chat-msg-avatar">M</div><div class="chat-msg-bubble streaming"><span class="chat-streaming-cursor"></span></div>';
    msgs.appendChild(div);
    scrollChatToBottom();
    return div.querySelector('.chat-msg-bubble');
}

function updateStreamingBubble(bubble, text) {
    if (!bubble) return;
    bubble.innerHTML = formatBotText(text) + '<span class="chat-streaming-cursor"></span>';
    scrollChatToBottom();
}

function finalizeStreamingBubble(bubble, text, extraHtml) {
    if (!bubble) return;
    var html = formatBotText(text);
    if (extraHtml) html += extraHtml;
    bubble.innerHTML = html;
    bubble.classList.remove('streaming');
    var cursor = bubble.querySelector('.chat-streaming-cursor');
    if (cursor) cursor.remove();
    scrollChatToBottom();
}

function showTyping() {
    var msgs = getChatEl('chatMessages');
    if (!msgs) return;
    var div = document.createElement('div');
    div.className = 'chat-msg bot';
    div.id = 'chatTyping';
    div.innerHTML = '<div class="chat-msg-avatar">M</div><div class="chat-msg-bubble chat-typing"><span></span><span></span><span></span></div>';
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

function bindRecBodyDelegation() {
    var body = getChatEl('recBody');
    if (!body || body.dataset.recBound === '1') return;
    body.dataset.recBound = '1';
    body.addEventListener('click', function(e) {
        if (!(e.target instanceof Element)) return;
        var card = e.target.closest('[data-id]');
        if (!card) return;
        var btn = e.target.closest('button');
        if (btn && btn.getAttribute('onclick')) return; // botones con su propio onclick
        e.preventDefault();
        openProductModal(parseInt(card.getAttribute('data-id'), 10));
    });
}

function renderRecModal(ids) {
    bindRecBodyDelegation();
    var body = getChatEl('recBody');
    if (!body) return;
    if (!ids.length) { body.innerHTML = '<div class="rec-empty">No hay productos para mostrar</div>'; }
    else {
        body.innerHTML = ids.map(function(id) {
            var p = allProducts.find(function(x) { return x.id === id; });
            if (!p) return '';
            var st = getTotalStock(p);
            var ok = stockDisponible(st);
            return '<div class="rec-card" data-id="' + p.id + '">'
                + '<img class="rec-card-img" src="' + (p.images && p.images[0] ? p.images[0] : '') + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">'
                + '<div class="rec-card-body">'
                + '<div class="rec-card-marca">' + escapeHtml(p.marca || '') + '</div>'
                + '<div class="rec-card-name">' + escapeHtml(p.name) + '</div>'
                + '<div class="rec-card-price">Bs ' + fmtPrice(p.price) + '</div>'
                + ((window._affShowGanancia && window._affComision > 0) ? '<div class="rec-card-ganancia">Ganancia: <strong>Bs ' + fmtPrice(p.price * window._affComision / 100) + '</strong></div>' : '')
                + '<div class="rec-card-stock ' + (ok ? 'ok' : 'agotado') + '">' + (ok ? '\u25CF En stock (' + st + ' u.)' : '\u25CF Agotado') + '</div>'
                + '<div class="rec-card-actions">'
                + '<button class="rec-card-btn view" onclick="event.stopPropagation();openProductModal(' + p.id + ')">Ver</button>'
                + (ok ? '<button class="rec-card-btn add" onclick="event.stopPropagation();addToCart(' + p.id + ');closeRecModal();">Agregar</button>' : '')
                + '</div></div></div>';
        }).join('');
    }
    var overlay2 = getChatEl('recOverlay');
    var modal2 = getChatEl('recModal');
    msxCloseAll('rec');
    hideChatUI();
    if (overlay2) overlay2.classList.add('open');
    if (modal2) modal2.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeRecModal() {
    var overlay2 = getChatEl('recOverlay');
    var modal2 = getChatEl('recModal');
    if (overlay2) overlay2.classList.remove('open');
    if (modal2) modal2.classList.remove('open');
    document.body.style.overflow = '';
    try {
        if (storeAffPublic) { updateAffChatVisibility(); }
        else { var f2 = getChatEl('chatFab'); if (f2) f2.style.display = ''; var w2 = getChatEl('chatWidget'); if (w2) w2.style.display = ''; }
    } catch (e) {}
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
    if (!text) return '';
    var html = escapeHtml(text);
    html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    html = html.replace(/(^|\n)\s*[•·\-]\s+(.+)/g, '\n<li>$2</li>');
    html = html.replace(/((?:^|\n)(?:<li>.*?<\/li>\n?)+)/g, '\n<ul>$1</ul>\n');
    html = html.replace(/\n<b>([^<]+)<\/b>:\s*\n/g, '\n<div class="bot-section-title">$1:</div>\n');
    html = html.replace(/\n{2,}/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/<br>\s*<ul>/g, '<ul>');
    html = html.replace(/<\/ul>\s*<br>/g, '</ul>');
    html = html.replace(/<br>\s*<\/ul>/g, '</ul>');
    html = html.replace(/<ul>\s*<br>/g, '<ul>');
    return html;
}

// â•â•â• STREAM REAL: cada token del backend aparece en vivo â•â•â•
function askAssistant(text) {
    if (chatBusy) return;
    chatBusy = true;
    addUserMessage(text);
    chatHistory.push({ role: 'user', content: text });
    var sendBtn = getChatEl('chatSend');
    if (sendBtn) sendBtn.disabled = true;
    if (chatMode === 'cotizacion') openCotizLive();

    var bubble = createStreamingBubble();
    var acc = '';
    var pids = [];
    var pidsQty = null;
    var payload = {
        message: text,
        history: chatHistory.slice(-16),
        mode: chatMode,
        product: chatContextProduct ? {
            id: chatContextProduct.id, name: chatContextProduct.name,
            marca: chatContextProduct.marca || '', price: chatContextProduct.price,
            stock: getTotalStock(chatContextProduct),
            spec: chatContextProduct.description || chatContextProduct.spec || '',
            cat: chatContextProduct.cat || '', sku: chatContextProduct.sku || ''
        } : null
    };

    fetch(SHOP_CONFIG.apiBase + '/chat_stream.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        function parseLines(buf) {
            var lines = buf.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line || line.substring(0, 6) !== 'data: ') continue;
                var d = line.substring(6).trim();
                if (d === '[DONE]') continue;
                var p = null;
                try { p = JSON.parse(d); } catch (e) { continue; }
                if (p.text) { acc += p.text; updateStreamingBubble(bubble, acc); }
                if (p.product_ids && p.product_ids.length) { pids = p.product_ids.slice(0); }
                if (p.quantities && typeof p.quantities === 'object') { pidsQty = p.quantities; }
            }
        }
        function finalizeStream(qmap) {
            chatBusy = false;
            if (sendBtn) sendBtn.disabled = false;
            var extraHtml = '';
            if (pids.length) {
                extraHtml = '<div class="chat-products">' + renderChatProductCards(pids) + '</div>';
                extraHtml += '<button class="chat-open-modal" onclick="renderRecModal([' + pids.join(',') + '])">Ver recomendaciones en detalle</button>';
                if (chatMode === 'cotizacion') {
                    extraHtml += '<button class="chat-add-all-btn" onclick="openCotizKeep()">Ver cotización</button>';
                    cotizSetProducts(pids, qmap || null);
                    cotizStatusDone();
                }
            }
            chatHistory.push({ role: 'assistant', content: acc });
            finalizeStreamingBubble(bubble, acc, extraHtml);
        }
        function read() {
            return reader.read().then(function(result) {
                if (result.done) { parseLines(buffer); finalizeStream(pidsQty); return; }
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop();
                parseLines(lines.join('\n'));
                return read();
            });
        }
        return read();
    })
    .catch(function() {
        chatBusy = false;
        if (sendBtn) sendBtn.disabled = false;
        if (bubble && !acc.replace(/\s/g, '')) {
            var wrap = bubble.parentNode;
            if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
        }
        askAssistantFallback(text);
    });
}

function askAssistantFallback(text) {
    showTyping();
    var sendBtn = getChatEl('chatSend');
    var payload = {
        message: text,
        history: chatHistory.slice(-16),
        mode: chatMode,
        product: chatContextProduct ? {
            id: chatContextProduct.id, name: chatContextProduct.name,
            marca: chatContextProduct.marca || '', price: chatContextProduct.price,
            stock: getTotalStock(chatContextProduct),
            spec: chatContextProduct.description || chatContextProduct.spec || '',
            cat: chatContextProduct.cat || '', sku: chatContextProduct.sku || ''
        } : null
    };
    fetch(SHOP_CONFIG.apiBase + '/chat.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        hideTyping(); chatBusy = false; if (sendBtn) sendBtn.disabled = false;
        if (!data || !data.success) { addBotMessage('Lo siento, tuve un problema. ¿Podés repetir?'); return; }
        var respText = data.text || '';
        var ids = data.product_ids || [];
        var qtys = (data.quantities && typeof data.quantities === 'object') ? data.quantities : null;
        chatHistory.push({ role: 'assistant', content: respText });
        var html = formatBotText(respText);
        if (ids.length) {
            html += '<div class="chat-products">' + renderChatProductCards(ids) + '</div>';
            html += '<button class="chat-open-modal" onclick="renderRecModal([' + ids.join(',') + '])">Ver recomendaciones en detalle</button>';
            if (chatMode === 'cotizacion') {
                html += '<button class="chat-add-all-btn" onclick="openCotizKeep()">Ver cotización</button>';
                cotizSetProducts(ids, qtys);
                cotizStatusDone();
            }
        }
        addBotMessage(html);
    })
    .catch(function() {
        hideTyping(); chatBusy = false; if (sendBtn) sendBtn.disabled = false;
        addBotMessage('No pude conectar. Verificá tu conexión e intentá de nuevo.');
    });
}

// â•â•â• COTIZACIÓN EN VIVO â•â•â•
window.cotizQty = function(id, delta) {
    var q = (cotizQtyMap[id] || 1) + delta;
    if (q < 1) q = 1;
    cotizQtyMap[id] = q;
    renderCotizItems();
};

window.cotizRemove = function(id) {
    delete cotizQtyMap[id];
    renderCotizItems();
};

function cotizSetProducts(ids, qtys) {
    for (var i = 0; i < ids.length; i++) {
        var id = parseInt(ids[i], 10);
        var p = allProducts.find(function(x) { return x.id === id; });
        if (p && !(id in cotizQtyMap)) cotizQtyMap[id] = (qtys && qtys[id] > 1) ? qtys[id] : 1;
    }
    renderCotizItems();
}

function cotizCountInfo() {
    var keys = Object.keys(cotizQtyMap);
    var units = 0;
    keys.forEach(function(k) { units += cotizQtyMap[k]; });
    return { prods: keys.length, units: units };
}

function setTotals(total, units, prods) {
    var t = getChatEl('cotizTotal');
    if (t) t.textContent = 'Bs ' + fmtPrice(total);
    var c = getChatEl('cotizCount');
    if (c) c.textContent = units + (units === 1 ? ' unidad · ' : ' unidades · ') + prods + (prods === 1 ? ' producto' : ' productos');
}

function renderCotizItems() {
    var b = getChatEl('cotizBody');
    if (!b) return;
    var keys = Object.keys(cotizQtyMap);
    if (!keys.length) {
        b.innerHTML = '<div class="cotiz-empty"><p>Todavía no hay productos en la cotización.</p></div>';
        setTotals(0, 0, 0);
        return;
    }
    var total = 0, units = 0, html = '';
    keys.forEach(function(k) {
        var id = parseInt(k, 10);
        var p = allProducts.find(function(x) { return x.id === id; });
        if (!p) return;
        var q = cotizQtyMap[k];
        var sub = q * (parseFloat(p.price) || 0);
        total += sub;
        units += q;
        var img = (p.images && p.images[0]) ? p.images[0] : '';
        html += '<div class="cotiz-item">'
            + (img ? '<img class="cotiz-item-img" src="' + img + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '')
            + '<div class="cotiz-item-info">'
            + '<div class="cotiz-item-name">' + escapeHtml(p.name) + '</div>'
            + '<div class="cotiz-item-marca">' + escapeHtml(p.marca || '') + '</div>'
            + '<div class="cotiz-item-details">'
            + '<span class="cotiz-item-price">Bs ' + fmtPrice(p.price) + ' c/u</span>'
            + '<span class="cotiz-item-sub">Bs ' + fmtPrice(sub) + '</span>'
            + '</div></div>'
            + '<div class="qty-stepper">'
            + '<button class="qty-btn" onclick="cotizQty(' + id + ',-1)">−</button>'
            + '<span class="qty-val">' + q + '</span>'
            + '<button class="qty-btn" onclick="cotizQty(' + id + ',1)">+</button>'
            + '</div>'
            + '<button class="cotiz-remove" onclick="cotizRemove(' + id + ')" aria-label="Quitar">×</button>'
            + '</div>';
    });
    b.innerHTML = html;
    setTotals(total, units, keys.length);
}

function openCotizLive() {
    applyCotizSplit(true);
    var o = getChatEl('cotizOverlay');
    var m = getChatEl('cotizModal');
    if (o) o.classList.add('open');
    if (m) m.classList.add('open');
    document.body.style.overflow = 'hidden';
    var s = getChatEl('cotizStatus');
    if (s) s.textContent = Object.keys(cotizQtyMap).length
        ? 'Max está agregando más productos a tu cotización…'
        : 'Max está armando tu cotización…';
    var b = getChatEl('cotizBody');
    if (b && !Object.keys(cotizQtyMap).length) {
        b.innerHTML = '<div class="cotiz-loading"><div class="cotiz-skel"></div><div class="cotiz-skel"></div><div class="cotiz-skel"></div></div>';
    }
}

function cotizStatusDone() {
    var s = getChatEl('cotizStatus');
    if (s) s.textContent = 'Cotización lista · Revisá cantidades y agregá al carrito';
    renderCotizItems();
}

window.cotizReset = function() {
    cotizQtyMap = {};
    renderCotizItems();
    var s = getChatEl('cotizStatus');
    if (s) s.textContent = 'Cotización vacía · Pedile más productos a Max';
};

function openModalOnly() {
    msxCloseAll('cotiz');
    if (isLargeLayout()) {
        applyCotizSplit(true);
    } else {
        hideChatUI();
    }
    var o = getChatEl('cotizOverlay');
    var m = getChatEl('cotizModal');
    if (o) o.classList.add('open');
    if (m) m.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (!Object.keys(cotizQtyMap).length) renderCotizItems();
}

function openCotizKeep() { openModalOnly(); }

function openCotizModal(ids) {
    if (ids && ids.length) cotizSetProducts(ids);
    openModalOnly();
}

function closeCotizModal() {
    var o = getChatEl('cotizOverlay');
    var m = getChatEl('cotizModal');
    if (o) o.classList.remove('open');
    if (m) m.classList.remove('open');
    document.body.style.overflow = '';
    document.body.classList.remove('cotiz-split');
    try {
        if (storeAffPublic) { updateAffChatVisibility(); }
        else { var f2 = getChatEl('chatFab'); if (f2) f2.style.display = ''; var w2 = getChatEl('chatWidget'); if (w2) w2.style.display = ''; }
    } catch (e) {}
}

function cotizAddAllToCart() {
    var keys = Object.keys(cotizQtyMap);
    if (!keys.length) { alert('No hay productos en la cotización'); return; }
    var addedUnits = 0, addedProds = 0, skipped = 0;
    keys.forEach(function(k) {
        var id = parseInt(k, 10);
        var p = allProducts.find(function(x) { return x.id === id; });
        if (!p) { skipped++; return; }
        var q = cotizQtyMap[k];
        for (var i = 0; i < q; i++) addToCart(id);
        addedUnits += q;
        addedProds++;
    });
    if (addedUnits > 0) {
        try {
            var items = Object.keys(cotizQtyMap).map(function(k){ return { id: parseInt(k,10), qty: cotizQtyMap[k] }; });
            var totalAcc = 0;
            items.forEach(function(it) {
                var pp = allProducts.find(function(x) { return x.id === it.id; });
                if (pp) totalAcc += it.qty * (parseFloat(pp.price) || 0);
            });
            fetch(SHOP_CONFIG.apiBase + '/rag.php?action=accept', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items: items, total: Math.round(totalAcc * 100) / 100 }) }).catch(function(){});
        } catch (e) {}
    }
    var msg = 'Agregué **' + addedUnits + ' unidad' + (addedUnits === 1 ? '' : 'es') + '** de ' + addedProds + ' producto' + (addedProds === 1 ? '' : 's') + ' al carrito.'
        + (skipped ? ' ' + skipped + ' sin stock fueron omitidos.' : '');
    addBotMessage(msg);
    closeCotizModal();
}

function cotizSendWhatsApp() {
    var keys = Object.keys(cotizQtyMap);
    if (!keys.length) { alert('No hay productos en la cotización'); return; }
    var total = 0;
    var lines = ['*Cotización MyShop Bolivia*', ''];
    keys.forEach(function(k) {
        var id = parseInt(k, 10);
        var p = allProducts.find(function(x) { return x.id === id; });
        if (!p) return;
        var q = cotizQtyMap[k];
        var sub = q * (parseFloat(p.price) || 0);
        total += sub;
        lines.push('• ' + p.name + ' x' + q + ' — Bs ' + fmtPrice(sub));
    });
    lines.push('');
    lines.push('*Total: Bs ' + fmtPrice(total) + '*');
    lines.push('');
    lines.push('myshop.flaapi.com');
    window.open('https://wa.me/?text=' + encodeURIComponent(lines.join('\n')), '_blank');
}

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
openChat();
try { getGoogleClientConfig().catch(function() {}); } catch (e) {}
try {
    if (!getCookieValue('g_csrf_token')) {
        var csrf = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(function(x){ return x.toString(16).padStart(2,'0'); }).join('');
        document.cookie = 'g_csrf_token=' + csrf + '; path=/; max-age=3600; SameSite=Lax; Secure';
    }
} catch (e) {}
try {
    var urlParams = new URLSearchParams(window.location.search);
    var urlToken = urlParams.get('ms_token');
    if (urlToken && isUsableToken(urlToken)) {
        saveStoreToken(urlToken);
        window.history.replaceState({}, '', window.location.pathname);
        closeStoreAuth(); applyStoreLock(); renderProducts(); showToast('Sesión iniciada con Google');
    }
    var googleError = sessionStorage.getItem('ms_google_error');
    if (googleError) {
        sessionStorage.removeItem('ms_google_error');
        googleAuthError(googleError);
        showStoreAuth('login');
    }
} catch (e) {}

    var profileBtn = qs('#profileBtn');
    if (profileBtn) {
        profileBtn.setAttribute('aria-expanded', 'false');
        profileBtn.setAttribute('aria-controls', 'storeProfileMenu');
        var profileAnchor = document.createElement('div');
        profileAnchor.className = 'store-profile-anchor';
        profileBtn.parentNode.insertBefore(profileAnchor, profileBtn);
        profileAnchor.appendChild(profileBtn);
        renderStoreProfileMenu();
        profileBtn.addEventListener('click', function() { openStoreProfileMenu(); });
        document.addEventListener('click', function(e) {
            var profileMenu = document.getElementById('storeProfileMenu');
            if (storeProfileMenuOpen && !profileAnchor.contains(e.target) && (!profileMenu || !profileMenu.contains(e.target))) closeStoreProfileMenu();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && storeProfileMenuOpen) closeStoreProfileMenu(true);
        });
    }
    validateStoreToken().then(function(valid) {
        applyStoreLock();
        renderProducts();
        updateAffChatVisibility();
        if (!storeAffPublic && !valid && sessionStorage.getItem(STORE_AUTH_DISMISSED_KEY) !== '1') showStoreAuth('login');
    });

    // Cart
    qs('#cartBtn').addEventListener('click', function() { if (!storeIsLoggedIn()) { showStoreAuth('login'); return; } openCart(); });
    qs('#cartClose').addEventListener('click', closeCart);
    qs('#cartOverlay').addEventListener('click', closeCart);
    qs('#checkoutBtn').addEventListener('click', function() { if (!cart.length) { showToast('El carrito está vacío'); return; } generatePagayaQR(); });

    // Mobile burger â†’ left brands drawer + filters bottom-sheet
    var mobileMenuBtn = qs('#mobileMenuBtn');
    var brandsPanel = qs('#mobileBrandsPanel');
    var brandsOverlay = qs('#mbpOverlay');
    var mbpClose = qs('#mbpClose');
    var mbpBrands = qs('#mbpBrands');
    var mbpFiltersBtn = qs('#mbpFiltersBtn');
    var filterBackdrop = qs('#filterBackdrop');

    function buildMbpBrands() {
        if (!mbpBrands || mbpBrands.children.length > 1) return;
        var sidebarItems = document.querySelectorAll('#sidebarBrands .sidebar-brand-item');
        if (!sidebarItems.length) return;
        mbpBrands.innerHTML = '';
        var mbpFrag = document.createDocumentFragment();
        var lastLetter = null;
        Array.prototype.forEach.call(sidebarItems, function(item) {
            var name = item.textContent.trim();
            var letter = (name.charAt(0) || '#').toUpperCase();
            if (!/[A-Z]/.test(letter)) letter = '#';
            if (letter !== lastLetter) {
                lastLetter = letter;
                var h = document.createElement('div');
                h.className = 'mbp-letter';
                h.textContent = letter;
                mbpFrag.appendChild(h);
            }
            var b = document.createElement('button');
            b.className = 'mbp-brand' + ((item.dataset.marca || '') === '' ? ' active' : '');
            b.dataset.brand = item.dataset.marca || '';
            b.innerHTML = item.innerHTML;
            b.addEventListener('click', function() {
                setBrand(this.dataset.brand || '');
                closeBrands();
            });
            mbpFrag.appendChild(b);
        });
        mbpBrands.appendChild(mbpFrag);
    }

    function openBrands() {
        if (!brandsPanel) return;
        msxCloseAll('brands');
        buildMbpBrands();
        brandsPanel.classList.add('open');
        if (brandsOverlay) brandsOverlay.classList.add('open');
        if (mobileMenuBtn) mobileMenuBtn.classList.add('active');
    }
    function closeBrands() {
        if (!brandsPanel) return;
        brandsPanel.classList.remove('open');
        if (brandsOverlay) brandsOverlay.classList.remove('open');
        if (mobileMenuBtn) mobileMenuBtn.classList.remove('active');
    }
    function openFilterSheet() {
        msxCloseAll('filter');
        var fm = qs('#filterModal');
        if (fm) fm.classList.add('open');
        if (filterBackdrop) filterBackdrop.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closeFilterSheet() {
        var fm = qs('#filterModal');
        if (fm) fm.classList.remove('open');
        if (filterBackdrop) filterBackdrop.classList.remove('open');
        document.body.style.overflow = '';
    }
    window.__msxCloseBrands = closeBrands;
    window.__msxCloseFilter = closeFilterSheet;

    if (mobileMenuBtn && brandsPanel) {
        mobileMenuBtn.addEventListener('click', function() {
            if (brandsPanel.classList.contains('open')) closeBrands(); else openBrands();
        });
        if (brandsOverlay) brandsOverlay.addEventListener('click', closeBrands);
        if (mbpClose) mbpClose.addEventListener('click', closeBrands);

        if (mbpFiltersBtn) {
            mbpFiltersBtn.addEventListener('click', function() {
                closeBrands();
                openFilterSheet();
            });
        }
        if (filterBackdrop) filterBackdrop.addEventListener('click', closeFilterSheet);
        var fmCloseBtn = qs('#fmClose');
        if (fmCloseBtn) fmCloseBtn.addEventListener('click', closeFilterSheet);
        var clearAllM = qs('#clearAllBtn');
        if (clearAllM) clearAllM.addEventListener('click', closeFilterSheet);
    }

    // Close cart on resize (crossing 820px breakpoint)
    var wasMobile = window.innerWidth <= 820;
    window.addEventListener('resize', function() {
        var nowMobile = window.innerWidth <= 820;
        if (wasMobile !== nowMobile) {
            wasMobile = nowMobile;
            if (qs('#cartModal').classList.contains('open')) closeCart();
        }
    });

    // QV close
    qs('#qvClose').addEventListener('click', closeQuickView);
    qs('#qvOverlay').addEventListener('click', closeQuickView);

    // Carousel nav (replace mojibake symbols with SVG arrows)
    var prevBtn = qs('#qvCarouselPrev');
    if (prevBtn) prevBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    var nextBtn = qs('#qvCarouselNext');
    if (nextBtn) nextBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    qs('#qvCarouselPrev').addEventListener('click', function(e) { e.stopPropagation(); prevCarousel(); });
    qs('#qvCarouselNext').addEventListener('click', function(e) { e.stopPropagation(); nextCarousel(); });

    // Toast icon: replace any mojibake check (âÅ““) with a clean SVG check
    var toastIcon = document.querySelector('#toast .toast-icon');
    if (toastIcon) toastIcon.innerHTML = AFF_ICON.check;

    // QR close
    qs('#qrClose').addEventListener('click', closeQR);
    qs('#qrCloseBtn').addEventListener('click', closeQR);
    qs('#qrOverlay').addEventListener('click', closeQR);

    // ESC cierra la capa superior abierta
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        var fmm = document.getElementById('filterModal');
        if (fmm && fmm.classList.contains('open')) { if (window.__msxCloseFilter) window.__msxCloseFilter(); return; }
        var qrm = document.getElementById('qrModal');
        if (qrm && qrm.classList.contains('open')) { closeQR(); return; }
        var cm = document.getElementById('cartModal');
        if (cm && cm.classList.contains('open')) { closeCart(); return; }
        var qvm = document.getElementById('qvModal');
        if (qvm && qvm.classList.contains('open')) { closeQuickView(); return; }
        if (window.__msxCloseFilter) window.__msxCloseFilter();
        if (window.__msxCloseBrands) window.__msxCloseBrands();
        closeChat();
    });

    // The legacy HTML button may still say "Ya pagué"; it must never confirm locally.
    disableLocalPaymentButton();

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

    // Keyboard: Escape close modals
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (qs('#qrModal.open')) closeQR();
            else if (qs('#qvModal.open')) closeQuickView();
            else if (qs('#cartModal.open')) closeCart();
        }
    });
});

// AFFILIATE SUPPORT (store mode + ref mode)
(function() {
    var params = new URLSearchParams(window.location.search);
    var mode = params.get("mode") || "";
    var isAffiliateMode = (mode === "afiliado") || window.location.pathname.indexOf("/afiliado") !== -1;
    var reservedPaths = { afiliado: 1, api: 1, js: 1, css: 1, login: 1, admin: 1, images: 1, img: 1 };
    function normalizeAffiliateCode(code) {
        code = String(code || '').trim();
        return /^[a-z0-9_-]{2,64}$/i.test(code) ? code.toUpperCase() : '';
    }
    function getPathAffiliateCode() {
        var parts = window.location.pathname.split('/').filter(Boolean);
        if (parts.length !== 1 || reservedPaths[parts[0].toLowerCase()]) return '';
        try { return normalizeAffiliateCode(decodeURIComponent(parts[0])); } catch (e) { return ''; }
    }
    function clearReferralCookie() {
        var suffix = '; Path=/; Max-Age=0; SameSite=Lax' + (window.location.protocol === 'https:' ? '; Secure' : '');
        document.cookie = 'ms_ref=' + suffix;
        if (window.location.hostname.indexOf('.') !== -1) document.cookie = 'ms_ref=' + suffix + '; Domain=' + window.location.hostname;
    }
    function clearAffiliateRef() {
        window._affRefCode = '';
        localStorage.removeItem('ms_ref');
        clearReferralCookie();
    }
    function persistAffiliateRef(code) {
        code = normalizeAffiliateCode(code);
        if (!code) { clearAffiliateRef(); return ''; }
        window._affRefCode = code;
        localStorage.setItem('ms_ref', code);
        document.cookie = 'ms_ref=' + encodeURIComponent(code) + '; Path=/; Max-Age=2592000; SameSite=Lax' + (window.location.protocol === 'https:' ? '; Secure' : '');
        return code;
    }
    window.getValidAffiliateRef = function() { return normalizeAffiliateCode(window._affRefCode); };

    var pathRef = getPathAffiliateCode();
    var hasExplicitRef = params.has('ref') || !!pathRef;
    var explicitRef = normalizeAffiliateCode(params.get('ref')) || pathRef;
    var storedRef = normalizeAffiliateCode(localStorage.getItem('ms_ref'));
    var candidateRef = isAffiliateMode ? '' : (hasExplicitRef ? explicitRef : storedRef);
    clearReferralCookie();
    if (!candidateRef) clearAffiliateRef();
    if (isAffiliateMode && !isUsableToken(localStorage.getItem('ms_token')) && isUsableToken(localStorage.getItem('aff_token'))) {
        localStorage.setItem('ms_token', localStorage.getItem('aff_token'));
        authToken = localStorage.getItem('ms_token');
    }

    // --- Shared: afiliado_info fetch ---
    function fetchAffInfo(code, callback) {
        return fetch("/api/myshop_api.php?action=afiliado_info&codigo=" + encodeURIComponent(code))
        .then(function(r) { return r.json(); })
        .then(function(r) { if (!r.success || !r.afiliado) throw new Error('Código de afiliado inválido'); if (callback) callback(r); return r; });
    }

    window._affiliateRefReady = candidateRef ? fetchAffInfo(candidateRef).then(function(r) {
        var validCode = persistAffiliateRef((r.afiliado && r.afiliado.codigo) || candidateRef);
        window._affCode = validCode;
        window._affComision = Number(r.comision_pct || 0);
        window._affNombre = (r.afiliado && (r.afiliado.afiliado_nombre || r.afiliado.nombre)) || validCode;
        try { if (typeof renderBestSellers === 'function') renderBestSellers(); } catch (e) {}
        try { if (typeof renderOffers === 'function') renderOffers(); } catch (e) {}
        addAffBanner(window._affNombre, window._affComision);
        window.trackAffClick(validCode, '');
        return validCode;
    }).catch(function() { clearAffiliateRef(); return ''; }) : Promise.resolve('');

    // --- Banner for ref mode ---
    function addAffBanner(nombre, comisionPct) {
        window._affNombre = nombre;
        window._affComision = comisionPct;
        var banner = document.createElement("div");
        banner.id = "affBanner";
        banner.style.cssText = "background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;text-align:center;padding:8px 12px;font-size:13px;font-weight:500;position:relative;z-index:100;";
        banner.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;">' + AFF_ICON.home + ' Tienda de <strong>' + escapeHtml(nombre) + '</strong> | Ganas <strong>' + Number(comisionPct || 0) + '%</strong> de cada venta</span>';
        var header = document.querySelector(".header");
        if (header) header.after(banner);
        renderProducts();
        renderBestSellers();
    }

    // ========== AUTH HELPER ==========
    function authHeaders(token) {
        return { "Authorization": "Bearer " + token };
    }
    function affApiFetch(url, options) {
        options = options || {};
        var token = getStoreToken();
        options.headers = Object.assign({}, options.headers || {}, token ? authHeaders(token) : {});
        return fetch(url, options).then(function(r) {
            if (r.status === 401) { handleUnauthorized(); throw new Error('Tu sesión expiró'); }
            return r;
        });
    }
    function validateAndLoadAffiliate(code) {
        authToken = getStoreToken();
        storeAuthValidated = false;
        applyStoreLock();
        return apiOrderRequest('auth_me', null, 'GET').then(function() {
            storeAuthValidated = true;
            applyStoreLock();
            loadAffDashboard(code);
            return true;
        }).catch(function() {
            clearStoreSession();
            applyStoreLock();
            showStoreAuth('login');
            return false;
        });
    }

    // ========== LOGIN MODAL ==========
    function addLoginToHeader() {
        var actions = document.querySelector(".header-actions");
        if (!actions) return;
        var existing = document.getElementById('profileBtn');
        if (existing) {
            return;
        }
        var btn = document.createElement("button");
        btn.id = "affLoginBtn";
         btn.className = "header-icon-btn";
         btn.innerHTML = AFF_ICON.user;
         btn.setAttribute("aria-label", "Perfil: iniciar sesión o ver cuenta");
         btn.title = "Perfil · Iniciar sesión";
        btn.onclick = function() {
            var code = localStorage.getItem("aff_code");
            var token = getStoreToken();
            if (code && token && typeof window.toggleAffDash === 'function') { window.toggleAffDash(); }
            else { showStoreAuth('login'); }
        };
        actions.appendChild(btn);
        createLoginModal();
    }

    function createLoginModal() {
        if (document.getElementById("affLoginModal")) return;
        var overlay = document.createElement("div");
        overlay.id = "affLoginOverlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,0.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;pointer-events:none;transition:opacity 0.3s;";
        var modal = document.createElement("div");
        modal.id = "affLoginModal";
        modal.style.cssText = "position:fixed;top:50%;left:50%;z-index:5001;transform:translate(-50%,-50%) scale(0.95);background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.2);width:92vw;max-width:380px;padding:28px;opacity:0;pointer-events:none;transition:all 0.3s;";
        modal.innerHTML = ''
            + '<div style="text-align:center;margin-bottom:20px;">'
            + '  <div style="color:#1e40af;margin-bottom:6px;">' + AFF_ICON.user + '</div>'
            + '  <h3 style="font-size:18px;font-weight:700;color:#111;margin:0;">Login Afiliado</h3>'
            + '  <p style="font-size:12px;color:#6b7280;margin:4px 0 0;">Ingresa tus credenciales</p>'
            + '</div>'
            + '<div id="affLoginError" style="display:none;background:#fef2f2;color:#dc2626;font-size:12px;padding:8px 12px;border-radius:8px;margin-bottom:12px;"></div>'
            + '<div style="margin-bottom:12px;">'
            + '  <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">WhatsApp</label>'
            + '  <input id="affLoginWhatsapp" type="text" inputmode="numeric" style="width:100%;height:40px;border:1px solid #d1d5db;border-radius:8px;padding:0 12px;font-size:14px;" placeholder="ej. 62837276">'
            + '</div>'
            + '<div style="margin-bottom:16px;">'
            + '  <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Contrase&#xF1;a</label>'
            + '  <input id="affLoginPass" type="password" style="width:100%;height:40px;border:1px solid #d1d5db;border-radius:8px;padding:0 12px;font-size:14px;" placeholder="********">'
            + '</div>'
            + '<button id="affLoginSubmit" style="width:100%;height:42px;border-radius:10px;font-size:14px;font-weight:600;background:linear-gradient(135deg,#1e40af,#172554);color:#fff;border:none;transition:all 0.25s;" onclick="doAffLogin()">Ingresar</button>'
            + '<p style="text-align:center;margin-top:12px;font-size:11px;color:#9ca3af;">&#xBF;No tienes cuenta? <a href="/login" style="color:#1e40af;text-decoration:none;font-weight:600;">Registrate</a></p>'
            + '<button style="position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#6b7280;border:none;font-size:16px;cursor:pointer;" onclick="closeAffLogin()">&#x2716;</button>';
        document.body.appendChild(overlay);
        document.body.appendChild(modal);
        window._affLoginOverlay = overlay;
        window._affLoginModal = modal;
        overlay.addEventListener("click", closeAffLogin);
        document.addEventListener("keydown", function(e) { if (e.key === "Escape") closeAffLogin(); });
        var passInput = document.getElementById("affLoginPass");
        if (passInput) passInput.addEventListener("keydown", function(e) { if (e.key === "Enter") doAffLogin(); });
    }

    window.showLoginModal = function() {
        createLoginModal();
        try { hideChatUI(); } catch (e) {}
        window._affLoginOverlay.style.opacity = "1";
        window._affLoginOverlay.style.pointerEvents = "auto";
        window._affLoginModal.style.opacity = "1";
        window._affLoginModal.style.pointerEvents = "auto";
        window._affLoginModal.style.transform = "translate(-50%,-50%) scale(1)";
    };

    window.closeAffLogin = function() {
        if (!window._affLoginOverlay) return;
        window._affLoginOverlay.style.opacity = "0";
        window._affLoginOverlay.style.pointerEvents = "none";
        window._affLoginModal.style.opacity = "0";
        window._affLoginModal.style.pointerEvents = "none";
        window._affLoginModal.style.transform = "translate(-50%,-50%) scale(0.95)";
        var err = document.getElementById("affLoginError");
        if (err) { err.style.display = "none"; }
        try { updateAffChatVisibility(); } catch (e) {}
        try {
            if (!storeAffPublic) { var f = document.getElementById('chatFab'); if (f) f.style.display = ''; var w2 = document.getElementById('chatWidget'); if (w2) w2.style.display = ''; }
        } catch (e) {}
    };

    window.doAffLogin = function() {
        var whatsapp = (document.getElementById("affLoginWhatsapp") || {}).value;
        var pass = (document.getElementById("affLoginPass") || {}).value;
        var errEl = document.getElementById("affLoginError");
        var btn = document.getElementById("affLoginSubmit");
        if (!whatsapp || !pass) {
            if (errEl) { errEl.textContent = "Ingresa tu WhatsApp y contrase&#xF1;a"; errEl.style.display = "block"; }
            return;
        }
        if (btn) { btn.textContent = "Ingresando..."; btn.disabled = true; }
        var body = new URLSearchParams();
        body.set("action", "auth_login");
        body.set("whatsapp", whatsapp);
        body.set("password", pass);
        fetch("/api/myshop_api.php", { method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"}, body: body.toString() })
        .then(function(r) { return r.json(); })
        .then(function(r) {
            if (r.success && r.token) {
                saveStoreToken(r.token);
                if (r.usuario && r.usuario.whatsapp) localStorage.setItem("aff_whatsapp", r.usuario.whatsapp);
                if (r.afiliado && r.afiliado.codigo) {
                    localStorage.setItem("aff_code", r.afiliado.codigo);
                    closeAffLogin();
                    window._affCode = r.afiliado.codigo;
                    persistAffiliateRef(window._affCode);
                    window._affComision = parseFloat(r.comision_pct||6);
                    window._affShowGanancia = true;
                    window._affNombre = r.usuario.nombre;
                    localStorage.setItem('aff_show_comision', window._affComision);
                    localStorage.setItem('aff_show_code', window._affCode);
                    localStorage.setItem('aff_show_nombre', window._affNombre);
                    renderProducts();
                    renderBestSellers();
                    updateAffChatVisibility();
                    validateAndLoadAffiliate(window._affCode);
                } else {
                    handleAffLoginSuccess(r.token);
                }
            } else {
                if (errEl) { errEl.textContent = r.msg || "Credenciales inv&#xE1;lidas"; errEl.style.display = "block"; }
                if (btn) { btn.textContent = "Ingresar"; btn.disabled = false; }
            }
        })
        .catch(function(e) {
            if (errEl) { errEl.textContent = "Error de conexi&#xF3;n"; errEl.style.display = "block"; }
            if (btn) { btn.textContent = "Ingresar"; btn.disabled = false; }
        });
    };

    function handleAffLoginSuccess(token) {
        affApiFetch("/api/myshop_api.php?action=auth_me", { method: "GET", headers: authHeaders(token) })
        .then(function(r) { return r.json(); })
        .then(function(r) {
            var code = (r.afiliado && r.afiliado.codigo) || "";
            if (code) {
                localStorage.setItem("aff_code", code);
                closeAffLogin();
                window._affCode = code;
                persistAffiliateRef(code);
                window._affComision = parseFloat(r.comision_pct||6);
                window._affShowGanancia = true;
                window._affNombre = r.afiliado?.afiliado_nombre || '';
                localStorage.setItem('aff_show_comision', window._affComision);
                localStorage.setItem('aff_show_code', code);
                localStorage.setItem('aff_show_nombre', window._affNombre);
                renderProducts();
                renderBestSellers();
                updateAffChatVisibility();
                validateAndLoadAffiliate(code);
            } else {
                var errEl = document.getElementById("affLoginError");
                if (errEl) { errEl.textContent = "No tienes un perfil de afiliado activo"; errEl.style.display = "block"; }
                var btn = document.getElementById("affLoginSubmit");
                if (btn) { btn.textContent = "Ingresar"; btn.disabled = false; }
            }
        })
        .catch(function() {
            var errEl = document.getElementById("affLoginError");
            if (errEl) { errEl.textContent = "Error al verificar afiliado"; errEl.style.display = "block"; }
            var btn = document.getElementById("affLoginSubmit");
            if (btn) { btn.textContent = "Ingresar"; btn.disabled = false; }
        });
    }

    // ========== TABBED DASHBOARD PANEL ==========
    function loadAffDashboard(code) {
        window._affCode = code;
        window._affDashboardCode = code;
        var oldDash = document.getElementById("affDashboard");
        if (oldDash) oldDash.remove();
        var oldOverlay = document.getElementById("affDashOverlay");
        if (oldOverlay) oldOverlay.remove();

        var overlay = document.createElement("div");
        overlay.id = "affDashOverlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,0.5);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity 0.3s;";
        overlay.addEventListener("click", function(e) { if (e.target === overlay) toggleAffDash(); });
        document.body.appendChild(overlay);

        var dash = document.createElement("div");
        dash.id = "affDashboard";
        dash.style.cssText = "position:fixed;top:0;right:0;z-index:5001;width:400px;max-width:94vw;height:100vh;background:#fff;box-shadow:-4px 0 40px rgba(0,0,0,0.15);transform:translateX(100%);transition:transform 0.35s cubic-bezier(0.4,0,0.2,1);overflow:hidden;display:flex;flex-direction:column;";

        var tabs = [
            { id: "resumen", label: "Resumen", icon: AFF_ICON.chart },
            { id: "pedidos", label: "Pedidos", icon: AFF_ICON.package },
            { id: "ventas", label: "Ventas", icon: AFF_ICON.dollar },
            { id: "comisiones", label: "Comisiones", icon: AFF_ICON.percent },
            { id: "perfil", label: "Perfil", icon: AFF_ICON.user },
            { id: "clics", label: "Clics", icon: "&#x1F4C8;" },
            { id: "pagos", label: "Pagos", icon: "&#x1F4B3;" }
        ];

        dash.innerHTML = ''
            + '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e8eaed;">'
            + '  <div><strong style="font-size:15px;color:#111;">Panel Afiliado</strong><br><span style="font-size:10px;color:#6b7280;">C&#xF3;digo: <strong style="color:#1e40af;font-family:monospace;">' + code + '</strong></span></div>'
            + '  <button style="width:30px;height:30px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#6b7280;border:none;cursor:pointer;font-size:13px;" onclick="toggleAffDash()">' + AFF_ICON.x + '</button>'
            + '</div>'
            + '<div id="affTabBar" style="display:flex;border-bottom:2px solid #e8eaed;overflow-x:auto;flex-shrink:0;">'
            +   tabs.map(function(t,i) {
                return '<button class="affTab" data-tab="' + t.id + '" style="flex:1;min-width:60px;padding:10px 4px;font-size:10px;font-weight:600;color:' + (i===0?'#1e40af':'#6b7280') + ';border:none;background:none;cursor:pointer;border-bottom:2px solid ' + (i===0?'#1e40af':'transparent') + ';transition:all 0.2s;white-space:nowrap;">' + t.icon.replace(/width="14"/g,'width="16"').replace(/height="14"/g,'height="16"') + '<br>' + t.label + '</button>';
            }).join('')
            + '</div>'
            + '<div id="affDashBody" style="flex:1;overflow-y:auto;padding:16px;">'
            + '  <div style="text-align:center;padding:30px;"><div style="width:28px;height:28px;border:3px solid #e8eaed;border-top-color:#1e40af;border-radius:50%;-webkit-animation:spin 0.7s linear infinite;animation:spin 0.7s linear infinite;margin:0 auto 12px;"></div><span style="font-size:13px;color:#6b7280;">Cargando...</span></div>'
            + '</div>'
            + '<div id="affDashFooter" style="padding:8px 16px;border-top:1px solid #e8eaed;display:flex;gap:6px;flex-shrink:0;">'
            + '  <button style="flex:1;height:32px;border-radius:8px;font-size:11px;font-weight:600;background:#f3f4f6;color:#374151;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;" onclick="toggleAffDash();window.location.href=\'/?ref=\'+code">' + AFF_ICON.store + ' Tienda</button>'
            + '  <button style="flex:1;height:32px;border-radius:8px;font-size:11px;font-weight:600;background:#fee2e2;color:#dc2626;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;" onclick="doAffLogout()">' + AFF_ICON.logout + ' Salir</button>'
            + '</div>';
        document.body.appendChild(dash);
        window._affDash = dash;
        window._affDashOverlay = overlay;

        setTimeout(function() {
            var tabBtns = dash.querySelectorAll(".affTab");
            tabBtns.forEach(function(btn) {
                btn.addEventListener("click", function() {
                    var tabId = this.getAttribute("data-tab");
                    switchAffTab(tabId);
                });
            });
        }, 100);

        var token = getStoreToken();
        var hdrs = token ? authHeaders(token) : {};
        Promise.all([
            fetch("/api/myshop_api.php?action=afiliado_info&codigo=" + encodeURIComponent(code)).then(function(r) { return r.json(); }),
            token ? affApiFetch("/api/myshop_api.php?action=afiliado_ventas", { headers: hdrs }).then(function(r) { return r.json(); }).catch(function(){return{};}) : Promise.resolve({}),
            token ? affApiFetch("/api/myshop_api.php?action=afiliado_comisiones", { headers: hdrs }).then(function(r) { return r.json(); }).catch(function(){return{};}) : Promise.resolve({})
        ]).then(function(results) {
            renderAffResumen(results[0], results[1], results[2], code);
        }).catch(function() {
            document.getElementById("affDashBody").innerHTML = '<div style="text-align:center;color:#dc2626;font-size:13px;padding:20px;">Error al cargar datos</div>';
        });

        addAffCheckoutOption();
    }

    // --- Tab switching ---
    window.switchAffTab = function(tabId) {
        var tabBtns = document.querySelectorAll(".affTab");
        tabBtns.forEach(function(b) {
            if (b.getAttribute("data-tab") === tabId) {
                b.style.color = "#1e40af";
                b.style.borderBottomColor = "#1e40af";
            } else {
                b.style.color = "#6b7280";
                b.style.borderBottomColor = "transparent";
            }
        });
        var body = document.getElementById("affDashBody");
        if (!body) return;
        var code = window._affDashboardCode || localStorage.getItem("aff_code");
        var token = getStoreToken();

        if (tabId === "resumen") {
            body.innerHTML = '<div style="text-align:center;padding:20px;"><div style="width:24px;height:24px;border:3px solid #e8eaed;border-top-color:#1e40af;border-radius:50%;-webkit-animation:spin 0.7s linear infinite;animation:spin 0.7s linear infinite;margin:0 auto 12px;"></div></div>';
            var hdrs = token ? authHeaders(token) : {};
            Promise.all([
                fetch("/api/myshop_api.php?action=afiliado_info&codigo=" + encodeURIComponent(code)).then(function(r) { return r.json(); }),
                token ? affApiFetch("/api/myshop_api.php?action=afiliado_ventas", { headers: hdrs }).then(function(r) { return r.json(); }).catch(function(){return{};}) : Promise.resolve({}),
                token ? affApiFetch("/api/myshop_api.php?action=afiliado_comisiones", { headers: hdrs }).then(function(r) { return r.json(); }).catch(function(){return{};}) : Promise.resolve({})
            ]).then(function(results) {
                renderAffResumen(results[0], results[1], results[2], code);
            });
        } else if (tabId === "pedidos") {
            renderAffPedidos(body, code);
        } else if (tabId === "ventas") {
            renderAffVentas(body, code, token);
        } else if (tabId === "comisiones") {
            renderAffComisiones(body, code, token);
        } else if (tabId === "perfil") {
            renderAffPerfil(body, code);
        } else if (tabId === "clics") {
            renderAffClics(body, code, token);
        } else if (tabId === "pagos") {
            renderAffPagos(body, code, token);
        }
    };

    // --- Tab: Resumen ---
    function renderAffResumen(info, ventas, comisiones, code) {
        var affObj = info.afiliado || {};
        var infoNombre = affObj.afiliado_nombre || affObj.nombre || "Afiliado";
        var infoNivel = affObj.nivel || "bronce";
        var comisionPct = info.comision_pct || 3;
        var ventasArr = Array.isArray(ventas) ? ventas : (ventas.ventas || []);
        var comisArr = Array.isArray(comisiones) ? comisiones : (comisiones.comisiones || []);
        var ventasTotal = 0, ventasCount = 0;
        ventasArr.forEach(function(v) { ventasTotal += Number(v.total || 0); ventasCount++; });
        var comisPend = 0, comisAprob = 0, comisPag = 0;
        comisArr.forEach(function(c) {
            var m = Number(c.comision_monto || 0);
            if (c.estado === "pendiente") comisPend += m;
            else if (c.estado === "aprobada") comisAprob += m;
            else if (c.estado === "pagada") comisPag += m;
        });
        var refLink = "https://myshop.flaapi.com/" + code;
        var initial = infoNombre.charAt(0).toUpperCase();
        var nivelCap = infoNivel.charAt(0).toUpperCase() + infoNivel.slice(1);
        var body = document.getElementById("affDashBody");
        if (!body) return;

        window._affComision = comisionPct;
        window._affNombre = infoNombre;
        window._affCode = code;
        try { if (typeof renderBestSellers === 'function') renderBestSellers(); } catch (e) {}
        try { if (typeof renderOffers === 'function') renderOffers(); } catch (e) {}
        // Guardar para que la tienda muestre ganancias
        localStorage.setItem("aff_show_comision", comisionPct);
        localStorage.setItem("aff_show_code", code);
        localStorage.setItem("aff_show_nombre", infoNombre);
        var infoWa = affObj.whatsapp || '';
        if (infoWa) localStorage.setItem("aff_whatsapp", infoWa);
        window._affWhatsapp = infoWa;

        body.innerHTML = ''
            + '<div style="margin-bottom:12px;">'
            + '  <div style="display:flex;align-items:center;gap:10px;">'
            + '    <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#1e40af,#172554);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:700;">' + initial + '</div>'
            + '    <div><strong style="font-size:14px;color:#111;">' + infoNombre + '</strong><br><span style="font-size:10px;color:#6b7280;">Nivel ' + nivelCap + ' &#x2022; ' + comisionPct + '% comisi&#xF3;n</span></div>'
            + '  </div>'
            + '</div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">'
            + '  <div style="background:#f0fdf4;padding:8px 10px;border-radius:8px;"><div style="font-size:9px;color:#16a34a;font-weight:600;text-transform:uppercase;">Ventas</div><div style="font-size:16px;font-weight:700;color:#111;">Bs ' + ventasTotal.toFixed(2) + '</div><div style="font-size:10px;color:#6b7280;">' + ventasCount + ' pedidos</div></div>'
            + '  <div style="background:#fff7ed;padding:8px 10px;border-radius:8px;"><div style="font-size:9px;color:#ea580c;font-weight:600;text-transform:uppercase;">Pendiente</div><div style="font-size:16px;font-weight:700;color:#111;">Bs ' + comisPend.toFixed(2) + '</div></div>'
            + '  <div style="background:#f0fdf4;padding:8px 10px;border-radius:8px;"><div style="font-size:9px;color:#16a34a;font-weight:600;text-transform:uppercase;">Aprobada</div><div style="font-size:16px;font-weight:700;color:#111;">Bs ' + comisAprob.toFixed(2) + '</div></div>'
            + '  <div style="background:#eff6ff;padding:8px 10px;border-radius:8px;"><div style="font-size:9px;color:#2563eb;font-weight:600;text-transform:uppercase;">Pagada</div><div style="font-size:16px;font-weight:700;color:#111;">Bs ' + comisPag.toFixed(2) + '</div></div>'
            + '</div>'
            + '<div style="margin-bottom:12px;">'
            + '  <label style="font-size:10px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Tu enlace de referido</label>'
            + '  <div style="display:flex;gap:4px;">'
            + '    <input id="affRefLink" value="' + refLink + '" readonly style="flex:1;height:32px;border:1px solid #d1d5db;border-radius:6px;padding:0 8px;font-size:11px;background:#f9fafb;cursor:pointer;" onclick="this.select();navigator.clipboard.writeText(this.value);if(typeof showToast===\'function\')showToast(\'Enlace copiado\', AFF_ICON.check)">'
            + '    <button style="height:32px;padding:0 10px;border-radius:6px;font-size:10px;font-weight:600;background:#1e40af;color:#fff;border:none;cursor:pointer;" onclick="var el=document.getElementById(\'affRefLink\');el.select();navigator.clipboard.writeText(el.value);if(typeof showToast===\'function\')showToast(\'Enlace copiado\', AFF_ICON.check)">Copiar</button>'
            + '  </div>'
            + '  <p style="font-size:9px;color:#9ca3af;margin-top:3px;">Comparte este enlace. Cuando alguien compre, ganar&#xE1;s ' + comisionPct + '%.</p>'
            + '</div>'
            + '<div>'
            + '  <label style="font-size:10px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Compartir en WhatsApp</label>'
            + '  <a href="https://wa.me/?text=' + encodeURIComponent("Mira lo que encontr\u00e9 en MyShop! " + refLink) + '" target="_blank" style="display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:6px;font-size:11px;font-weight:600;background:#25D366;color:#fff;text-decoration:none;">' + AFF_ICON.external + ' WhatsApp</a>'
            + '</div>';
    }

    // --- Tab: Pedidos (propios del afiliado) ---
    function renderAffPedidos(body, code) {
        body.innerHTML = '<div style="text-align:center;padding:20px;"><div style="width:24px;height:24px;border:3px solid #e8eaed;border-top-color:#1e40af;border-radius:50%;-webkit-animation:spin 0.7s linear infinite;animation:spin 0.7s linear infinite;margin:0 auto 12px;"></div></div>';
        var token = getStoreToken();
        if (!token) {
            body.innerHTML = '<div style="color:#6b7280;font-size:12px;padding:16px;text-align:center;">Debes iniciar sesi&#xF3;n</div>';
            return;
        }
        affApiFetch("/api/myshop_api.php?action=afiliado_mis_pedidos", { headers: authHeaders(token) })
        .then(function(r){return r.json();})
        .then(function(r) {
            var peds = r.pedidos || [];
            window._affPedidos = peds;
            if (!peds.length) {
                body.innerHTML = '<div style="text-align:center;padding:30px;"><div style="font-size:36px;margin-bottom:8px;">' + AFF_ICON.cart + '</div><div style="font-size:13px;font-weight:600;color:#374151;">Sin pedidos a&#xFA;n</div><div style="font-size:10px;color:#9ca3af;margin-top:4px;">Compra en la tienda desde tu panel de afiliado</div></div>';
                return;
            }
            var html = '<div style="font-size:10px;font-weight:600;color:#6b7280;margin-bottom:8px;">' + peds.length + ' pedidos</div>';
            peds.forEach(function(p) {
                var estColor = '#f59e0b';
                if (p.estado_pedido === 'entregado') estColor = '#16a34a';
                if (p.estado_pedido === 'cancelado') estColor = '#dc2626';
                if (p.estado_pago === 'pagado') estColor = '#2563eb';
                html += '<div style="padding:8px 10px;border-radius:8px;border:1px solid #e8eaed;margin-bottom:6px;">'
                    +   '<div style="display:flex;justify-content:space-between;"><span style="font-size:11px;font-weight:600;color:#111;">' + (p.id || 'N/A') + '</span><span style="font-size:10px;color:' + estColor + ';font-weight:600;">' + (p.estado_pedido || 'pendiente') + '</span></div>'
                    +   '<div style="display:flex;justify-content:space-between;margin-top:2px;">'
                    +     '<span style="font-size:12px;font-weight:700;color:#1e40af;">Bs ' + Number(p.total || 0).toFixed(2) + '</span>'
                    +     '<span style="font-size:9px;color:#9ca3af;">' + (p.fecha_creacion ? p.fecha_creacion.substring(0,10) : '') + '</span>'
                    +   '</div>'
                    +   '<div style="font-size:9px;color:#6b7280;margin-top:2px;">' + (p.tipo_pedido === 'auto' ? 'Pedido propio' : '') + ' &#x2022; Pago: ' + (p.estado_pago || 'pendiente') + '</div>'
                    +   (p.estado_pago === 'pagado'
                        ? '<div style="font-size:10px;font-weight:600;color:#16a34a;margin-top:4px;">' + AFF_ICON.check + ' Pagado</div>'
                        : '<button onclick="pagarPedidoQR(\'' + p.id + '\',' + Number(p.total || 0) + ')" style="width:100%;height:32px;margin-top:6px;border-radius:8px;font-size:11px;font-weight:600;background:#1D56B8;color:#fff;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;">' + AFF_ICON.qr + ' Pagar con QR</button>')
                    + '</div>';
            });
            body.innerHTML = html;
        }).catch(function(){body.innerHTML='<div style="color:#dc2626;font-size:12px;padding:16px;">Error al cargar pedidos</div>';});
    }

    // --- Tab: Ventas ---
    function renderAffVentas(body, code, token) {
        body.innerHTML = '<div style="text-align:center;padding:20px;"><div style="width:24px;height:24px;border:3px solid #e8eaed;border-top-color:#1e40af;border-radius:50%;-webkit-animation:spin 0.7s linear infinite;animation:spin 0.7s linear infinite;margin:0 auto 12px;"></div></div>';
        if (!token) {
            body.innerHTML = '<div style="color:#6b7280;font-size:12px;padding:16px;text-align:center;">Debes iniciar sesi&#xF3;n</div>';
            return;
        }
        affApiFetch("/api/myshop_api.php?action=afiliado_ventas", { headers: authHeaders(token) })
        .then(function(r){return r.json();})
        .then(function(r) {
            var ventasArr = Array.isArray(r) ? r : (r.ventas || []);
            if (!ventasArr.length) {
                body.innerHTML = '<div style="text-align:center;padding:30px;"><div style="font-size:32px;margin-bottom:8px;">' + AFF_ICON.inbox + '</div><div style="font-size:13px;font-weight:600;color:#374151;">Sin ventas a&#xFA;n</div><div style="font-size:10px;color:#9ca3af;margin-top:4px;">Comparte tu enlace de referido para comenzar</div></div>';
                return;
            }
            var html = '<div style="font-size:10px;font-weight:600;color:#6b7280;margin-bottom:8px;">' + ventasArr.length + ' ventas</div>';
            ventasArr.forEach(function(v) {
                var estadoColor = '#f59e0b';
                if (v.estado_pedido === 'entregado') estadoColor = '#16a34a';
                if (v.estado_pedido === 'cancelado') estadoColor = '#dc2626';
                html += '<div style="padding:8px 10px;border-radius:8px;border:1px solid #e8eaed;margin-bottom:6px;">'
                    +   '<div style="display:flex;justify-content:space-between;"><span style="font-size:11px;font-weight:600;color:#111;">' + (v.pedido_id || v.id || 'N/A') + '</span><span style="font-size:10px;color:' + estadoColor + ';font-weight:600;">' + (v.estado_pedido || 'pendiente') + '</span></div>'
                    +   '<div style="font-size:10px;color:#6b7280;">' + (v.cliente_nombre || '') + '</div>'
                    +   '<div style="display:flex;justify-content:space-between;margin-top:4px;"><span style="font-size:12px;font-weight:700;color:#1e40af;">Bs ' + Number(v.total || 0).toFixed(2) + '</span><span style="font-size:9px;color:#9ca3af;">' + (v.fecha_creacion ? v.fecha_creacion.substring(0,10) : '') + '</span></div>'
                    +   '</div>';
            });
            body.innerHTML = html;
        }).catch(function(){body.innerHTML='<div style="color:#dc2626;font-size:12px;padding:16px;">Error al cargar ventas</div>';});
    }

    // --- Tab: Comisiones ---
    function renderAffComisiones(body, code, token) {
        body.innerHTML = '<div style="text-align:center;padding:20px;"><div style="width:24px;height:24px;border:3px solid #e8eaed;border-top-color:#1e40af;border-radius:50%;-webkit-animation:spin 0.7s linear infinite;animation:spin 0.7s linear infinite;margin:0 auto 12px;"></div></div>';
        if (!token) {
            body.innerHTML = '<div style="color:#6b7280;font-size:12px;padding:16px;text-align:center;">Debes iniciar sesi&#xF3;n</div>';
            return;
        }
        affApiFetch("/api/myshop_api.php?action=afiliado_comisiones", { headers: authHeaders(token) })
        .then(function(r){return r.json();})
        .then(function(r) {
            var comArr = Array.isArray(r) ? r : (r.comisiones || []);
            if (!comArr.length) {
                body.innerHTML = '<div style="text-align:center;padding:30px;"><div style="font-size:32px;margin-bottom:8px;">' + AFF_ICON.percent.replace(/width="14"/g,'width="32"').replace(/height="14"/g,'height="32"').replace(/stroke="currentColor"/g,'stroke="#d1d5db"') + '</div><div style="font-size:13px;font-weight:600;color:#374151;">Sin comisiones a&#xFA;n</div><div style="font-size:10px;color:#9ca3af;margin-top:4px;">Las comisiones se generan cuando hay ventas</div></div>';
                return;
            }
            var html = '<div style="font-size:10px;font-weight:600;color:#6b7280;margin-bottom:8px;">' + comArr.length + ' comisiones</div>';
            comArr.forEach(function(c) {
                var estColor = '#f59e0b';
                if (c.estado === 'aprobada') estColor = '#16a34a';
                if (c.estado === 'pagada') estColor = '#2563eb';
                if (c.estado === 'rechazada') estColor = '#dc2626';
                html += '<div style="padding:8px 10px;border-radius:8px;border:1px solid #e8eaed;margin-bottom:6px;">'
                    +   '<div style="display:flex;justify-content:space-between;"><span style="font-size:11px;font-weight:600;color:#111;">' + (c.pedido_id || '') + '</span><span style="font-size:10px;color:' + estColor + ';font-weight:600;">' + (c.estado || '') + '</span></div>'
                    +   '<div style="display:flex;justify-content:space-between;margin-top:2px;"><span style="font-size:12px;font-weight:700;color:#1e40af;">Bs ' + Number(c.comision_monto || 0).toFixed(2) + '</span><span style="font-size:9px;color:#9ca3af;">' + (c.fecha_generacion ? c.fecha_generacion.substring(0,10) : '') + '</span></div>'
                    +   '</div>';
            });
            body.innerHTML = html;
        }).catch(function(){body.innerHTML='<div style="color:#dc2626;font-size:12px;padding:16px;">Error al cargar comisiones</div>';});
    }

    // --- Tab: Perfil ---
    function renderAffPerfil(body, code) {
        body.innerHTML = '<div style="text-align:center;padding:20px;"><div style="width:24px;height:24px;border:3px solid #e8eaed;border-top-color:#1e40af;border-radius:50%;-webkit-animation:spin 0.7s linear infinite;animation:spin 0.7s linear infinite;margin:0 auto 12px;"></div></div>';
        fetch("/api/myshop_api.php?action=afiliado_info&codigo=" + code)
        .then(function(r){return r.json();})
        .then(function(r) {
            var a = r.afiliado || {};
            var nombre = a.afiliado_nombre || a.nombre || '--';
            var nivel = a.nivel || 'bronce';
            var nivelCap = nivel.charAt(0).toUpperCase() + nivel.slice(1);
            var comPct = r.comision_pct || 3;
            var wa = a.whatsapp || '--';
            var fb = a.facebook || '--';
            var ig = a.instagram || '--';
            var bio = a.biografia || '';
            var initial = nombre.charAt(0).toUpperCase();
            body.innerHTML = ''
                + '<div style="text-align:center;margin-bottom:16px;">'
                + '  <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#1e40af,#172554);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;margin:0 auto 8px;">' + initial + '</div>'
                + '  <div style="font-size:16px;font-weight:700;color:#111;">' + nombre + '</div>'
                + '  <div style="font-size:11px;color:#6b7280;margin-top:2px;">' + nivelCap + ' &#x2022; ' + comPct + '% comisi&#xF3;n</div>'
                + '</div>'
                + '<div style="background:#f9fafb;border-radius:10px;padding:12px;margin-bottom:12px;">'
                + '  <div style="font-size:11px;margin-bottom:6px;"><span style="color:#6b7280;">C&#xF3;digo:</span> <strong style="color:#111;font-family:monospace;">' + code + '</strong></div>'
                + '  <div style="font-size:11px;margin-bottom:6px;"><span style="color:#6b7280;">WhatsApp:</span> <strong style="color:#111;">' + wa + '</strong></div>'
                + '  <div style="font-size:11px;margin-bottom:6px;"><span style="color:#6b7280;">Facebook:</span> <strong style="color:#111;">' + fb + '</strong></div>'
                + '  <div style="font-size:11px;margin-bottom:6px;"><span style="color:#6b7280;">Instagram:</span> <strong style="color:#111;">' + ig + '</strong></div>'
                + (bio ? '<div style="font-size:11px;margin-top:6px;padding-top:6px;border-top:1px solid #e8eaed;"><span style="color:#6b7280;">Bio:</span> ' + bio + '</div>' : '')
                + '</div>'
                + '<div style="text-align:center;">'
                + '  <a href="/login" style="display:inline-block;padding:8px 20px;border-radius:8px;font-size:12px;font-weight:600;background:#f3f4f6;color:#374151;text-decoration:none;border:1px solid #d1d5db;">Editar Perfil</a>'
                + '</div>';
        }).catch(function(){body.innerHTML='<div style="color:#dc2626;font-size:12px;padding:16px;">Error al cargar perfil</div>';});
    }

    // --- Dashboard toggle ---
    window.toggleAffDash = function() {
        if (!window._affDash || !window._affDashOverlay) return;
        var isOpen = window._affDash._open || false;
        if (!isOpen) {
            window._affDash.style.transform = "translateX(0)";
            window._affDashOverlay.style.opacity = "1";
            window._affDashOverlay.style.pointerEvents = "auto";
            window._affDash._open = true;
        } else {
            window._affDash.style.transform = "translateX(100%)";
            window._affDashOverlay.style.opacity = "0";
            window._affDashOverlay.style.pointerEvents = "none";
            window._affDash._open = false;
        }
    };

    window.doAffLogout = function() {
        clearStoreSession();
        localStorage.removeItem("aff_code");
        clearAffiliateRef();
        cart = [];
        localStorage.removeItem('ms_cart_token');
        updateCart();
        window.location.href = "/";
    };

    // ========== AFFILIATE CHECKOUT OPTIONS ==========
    // Botón "Pedido sin pago" SOLO visible para afiliados logueados (modo /afiliado)
    function addAffCheckoutOption() {
        var btn = document.createElement("button");
        btn.id = "affSinPagoBtn";
        btn.type = "button";
        btn.innerHTML = AFF_ICON.ticket + ' Pedido sin pago';
        btn.style.cssText = "width:100%;height:42px;border-radius:10px;font-size:13px;font-weight:600;background:#fff;color:#1D56B8;border:2px solid #1D56B8;cursor:pointer;margin-top:8px;display:none;align-items:center;justify-content:center;gap:6px;transition:all 0.2s;font-family:inherit;";
        btn.onmouseover = function() { this.style.background = '#eef4ff'; };
        btn.onmouseout = function() { this.style.background = '#fff'; };
        btn.onclick = function() { abrirModalEntrega(); };
        document.body.appendChild(btn);

        function sync() {
            var checkoutBtn = document.getElementById("checkoutBtn");
            if (!checkoutBtn) return;
            var parent = checkoutBtn.parentNode;
            if (parent && btn.parentNode !== parent) parent.appendChild(btn);
            var esAfiliado = isAffiliateMode && window._affCode && storeIsLoggedIn();
            btn.style.display = esAfiliado ? "flex" : "none";
        }
        sync();
        var observer = new MutationObserver(sync);
        observer.observe(document.body, { childList: true, subtree: true });
        window._affCheckoutObserver = observer;
    }

    // --- Mini modal: datos de entrega del pedido sin pago ---
    function abrirModalEntrega() {
        var overlay = document.getElementById("affShipOverlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "affShipOverlay";
            overlay.style.cssText = "position:fixed;inset:0;z-index:5200;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:20px;";
            overlay.innerHTML = ''
                + '<div style="background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.2);width:100%;max-width:360px;padding:24px;position:relative;">'
                + '  <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:4px;">Pedido sin pago</div>'
                + '  <div style="font-size:12px;color:#6b7280;margin-bottom:16px;">Como afiliado puedes pedir sin pagar. Lo pagas luego desde tu secci&#243;n Pedidos.</div>'
                + '  <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Direcci&#243;n de entrega</label>'
                + '  <input id="affShipDir" type="text" style="width:100%;height:40px;border:1px solid #d1d5db;border-radius:8px;padding:0 12px;font-size:14px;margin-bottom:12px;box-sizing:border-box;" placeholder="Calle, n&#250;mero, zona">'
                + '  <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Ciudad</label>'
                + '  <input id="affShipCiudad" type="text" style="width:100%;height:40px;border:1px solid #d1d5db;border-radius:8px;padding:0 12px;font-size:14px;margin-bottom:16px;box-sizing:border-box;" value="La Paz">'
                + '  <div id="affShipError" style="display:none;background:#fef2f2;color:#dc2626;font-size:12px;padding:8px 12px;border-radius:8px;margin-bottom:12px;"></div>'
                + '  <button id="affShipOk" style="width:100%;height:42px;border-radius:10px;font-size:14px;font-weight:600;background:linear-gradient(135deg,#1D56B8,#0f2f66);color:#fff;border:none;cursor:pointer;">Confirmar pedido</button>'
                + '  <button style="position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#6b7280;border:none;cursor:pointer;" onclick="cerrarModalEntrega()">' + AFF_ICON.x + '</button>'
                + '</div>';
            document.body.appendChild(overlay);
            document.getElementById("affShipOk").onclick = function() { confirmarPedidoSinPago(); };
            overlay.addEventListener("click", function(e) { if (e.target === overlay) cerrarModalEntrega(); });
            var dir = document.getElementById("affShipDir");
            if (dir) dir.addEventListener("keydown", function(e) { if (e.key === "Enter") confirmarPedidoSinPago(); });
        }
        overlay.style.display = "flex";
        var inp = document.getElementById("affShipDir");
        if (inp) setTimeout(function() { inp.focus(); }, 60);
    }
    window.cerrarModalEntrega = function() {
        var o = document.getElementById("affShipOverlay");
        if (o) o.style.display = "none";
    };

    // --- Carrito efímero exclusivo para el pedido afiliado sin pago ---
    function createAffiliateCartToken() {
        return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function(x) { return x.toString(16).padStart(2, '0'); }).join('');
    }
    function crearCarritoEnServidor(items) {
        var cartToken = createAffiliateCartToken();
        var clearBody = new URLSearchParams();
        clearBody.set('action', 'carrito_clear');
        clearBody.set('token', cartToken);
        return fetch('/api/myshop_api.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: clearBody.toString() })
            .then(function(r) { return r.json(); })
            .then(function(r) { if (!r.success) throw new Error(r.error || 'Error al iniciar el carrito'); return cartToken; })
            .then(function() { return items.reduce(function(promise, item) {
            return promise.then(function() {
                var body = new URLSearchParams();
                body.set("action", "carrito_add");
                body.set("token", cartToken);
                body.set("sku", item.sku);
                body.set("cantidad", item.cantidad);
                return fetch("/api/myshop_api.php", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() })
                    .then(function(r) { return r.json(); })
                    .then(function(r) { if (!r.success) throw new Error(r.error || "Error al agregar al carrito"); });
            });
        }, Promise.resolve()); }).then(function() { return cartToken; });
    }

    window.confirmarPedidoSinPago = function() {
        var dir = (document.getElementById("affShipDir") || {}).value;
        var ciudad = (document.getElementById("affShipCiudad") || {}).value || "La Paz";
        var errEl = document.getElementById("affShipError");
        if (!dir) {
            if (errEl) { errEl.textContent = "Ingresa tu direcci&#243;n de entrega"; errEl.style.display = "block"; }
            return;
        }
        var items = window.cart || [];
        if (!items.length) {
            if (errEl) { errEl.textContent = "Tu carrito est&#225; vac&#237;o"; errEl.style.display = "block"; }
            return;
        }
        var token = getStoreToken();
        var okBtn = document.getElementById("affShipOk");
        if (okBtn) { okBtn.disabled = true; okBtn.textContent = "Procesando..."; }
        if (errEl) errEl.style.display = "none";

        crearCarritoEnServidor(items.map(function(c) { return { sku: c.sku, cantidad: c.qty }; }))
        .then(function(cartToken) {
            var body = new URLSearchParams();
            body.set("action", "checkout");
            body.set("token", cartToken);
            body.set("sin_pago", "1");
            body.set("tipo_delivery", "domicilio");
            body.set("nombre", window._affNombre || ("Afiliado " + window._affCode));
            var affWa = localStorage.getItem("aff_whatsapp") || window._affWhatsapp || "";
            if (affWa) body.set("whatsapp", affWa);
            body.set("direccion", dir);
            body.set("ciudad", ciudad);
            var ownRef = normalizeAffiliateCode(window._affCode);
            if (ownRef) body.set("ref", ownRef);
            var hdrs = { "Content-Type": "application/x-www-form-urlencoded" };
            if (token) hdrs.Authorization = "Bearer " + token;
            return affApiFetch("/api/myshop_api.php", { method: "POST", headers: hdrs, body: body.toString() }).then(function(r) { return r.json(); });
        })
        .then(function(r) {
            if (okBtn) { okBtn.disabled = false; okBtn.textContent = "Confirmar pedido"; }
            if (!r.success) throw new Error(r.error || "Error al crear pedido");
            cerrarModalEntrega();
            if (typeof closeCart === "function") closeCart();
            cart = [];
            if (typeof updateCart === "function") updateCart();
            showToast("Pedido creado sin pago", AFF_ICON.check);
            var code = window._affCode || localStorage.getItem("aff_code");
            if (code) {
                switchAffTab("pedidos");
            }
        })
        .catch(function(e) {
            if (okBtn) { okBtn.disabled = false; okBtn.textContent = "Confirmar pedido"; }
            if (errEl) { errEl.textContent = e.message || "Error de conexi&#243;n"; errEl.style.display = "block"; }
        });
    };

    // ========== PAGAR PEDIDO PENDIENTE CON QR (tab Pedidos) ==========
    window.pagarPedidoQR = function(pedidoId, total) {
        var token = getStoreToken();
        if (!token) { showToast("Inicia sesi&#243;n como afiliado", AFF_ICON.alert); return; }
        var btn = event && event.target;
        if (btn) { btn.disabled = true; btn.textContent = "Generando QR..."; }
        var cache = window._affPedidos || [];
        var pInfo = null;
        for (var ci = 0; ci < cache.length; ci++) { if (cache[ci].id === pedidoId) { pInfo = cache[ci]; break; } }
        total = pInfo ? Number(pInfo.total || 0) : (Number(total) || 0);
        var body = new URLSearchParams();
        body.set("action", "afiliado_pagar_pedido");
        body.set("pedido_id", pedidoId);
        affApiFetch("/api/myshop_api.php", { method: "POST", headers: Object.assign({ "Content-Type": "application/x-www-form-urlencoded" }, authHeaders(token)), body: body.toString() })
        .then(function(r) { return r.json(); })
        .then(function(r) {
            if (btn) { btn.disabled = false; btn.textContent = "Pagar con QR"; }
            if (!r.success) { showToast(r.error || "Error al generar QR", AFF_ICON.alert); return; }
            if (r.ya_pagado) { showToast("Este pedido ya est&#225; pagado", AFF_ICON.check); switchAffTab("pedidos"); return; }
            var qr = normalizeQRResponse(r.qr || r);
            mostrarQRPedido(pedidoId, total, qr.qrImage, qr.qrId, pInfo);
        })
        .catch(function() {
            if (btn) { btn.disabled = false; btn.textContent = "Pagar con QR"; }
            showToast("Error de conexi&#243;n", AFF_ICON.alert);
        });
    };

    function mostrarQRPedido(pedidoId, total, qrImg, qrId, pInfo) {
        var st = registerQRState(pedidoId, { total: total, qrImg: qrImg, qrId: qrId, pInfo: pInfo || null, onPaid: function(s) { confirmarPagoPedido(s.pedidoId, s.qrId); } });
        openQRState(st);
    }

    function confirmarPagoPedido(pedidoId, qrId) {
        var st = getQRState(pedidoId);
        if (!st || !st.serverConfirmed) return;
        handlePaymentConfirmed(pedidoId);
        var bodyEl = document.getElementById("affDashBody");
        if (bodyEl) renderAffPedidos(bodyEl, window._affCode);
    }

    
    
    // ========== MODE DISPATCH ==========
    if (isAffiliateMode) {
        var storedCode = localStorage.getItem("aff_code") || localStorage.getItem("aff_show_code") || "";
        var storedToken = getStoreToken();
        window._affShowGanancia = true;
        window._affComision = parseFloat(localStorage.getItem("aff_show_comision") || 6);
        if (storedCode) window._affCode = storedCode;
        if (storedCode && storedToken) {
            addLoginToHeader();
            authToken = storedToken;
            validateAndLoadAffiliate(storedCode).then(function(valid) {
                if (!valid) return;
                window._affCode = storedCode;
                persistAffiliateRef(storedCode);
                window._affComision = parseFloat(localStorage.getItem("aff_show_comision") || 6);
                window._affNombre = localStorage.getItem("aff_show_nombre") || "";
                try { if (typeof renderBestSellers === 'function') renderBestSellers(); } catch (e) {}
                try { if (typeof renderOffers === 'function') renderOffers(); } catch (e) {}
                try { if (typeof renderProducts === 'function') renderProducts(); } catch (e) {}
            });
        } else {
            try { if (typeof renderBestSellers === 'function') renderBestSellers(); } catch (e) {}
            try { if (typeof renderOffers === 'function') renderOffers(); } catch (e) {}
            try { if (typeof renderProducts === 'function') renderProducts(); } catch (e) {}
            addLoginToHeader();
        }
    } else {
        window._affShowGanancia = false;
    }

    // --- Tab: Clics (analitica de enlaces) ---
    function renderAffClics(body, code, token) {
        body.innerHTML = '<div style="text-align:center;padding:20px;"><div style="width:24px;height:24px;border:3px solid #e8eaed;border-top-color:#1e40af;border-radius:50%;-webkit-animation:spin 0.7s linear infinite;animation:spin 0.7s linear infinite;margin:0 auto 12px;"></div></div>';
        if (!token) { body.innerHTML = '<div style="color:#6b7280;font-size:12px;padding:16px;text-align:center;">Debes iniciar sesi&#xF3;n</div>'; return; }
        affApiFetch("/api/myshop_api.php?action=afiliado_dashboard", { headers: authHeaders(token) })
        .then(function(r){return r.json();})
        .then(function(r) {
            var ct = r.clicks_total || {};
            var total = Number(ct.total || 0);
            var conv = Number(ct.conversiones || 0);
            var pctConv = total > 0 ? (conv / total * 100).toFixed(1) : '0.0';
            var html = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">'
                + '  <div style="background:#eff6ff;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:18px;font-weight:700;color:#2563eb;">' + total + '</div><div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase;">Clicks</div></div>'
                + '  <div style="background:#f0fdf4;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:18px;font-weight:700;color:#16a34a;">' + conv + '</div><div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase;">Conversiones</div></div>'
                + '  <div style="background:#fff7ed;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:18px;font-weight:700;color:#ea580c;">' + pctConv + '%</div><div style="font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase;">Tasa</div></div>'
                + '</div>';
            var recientes = r.clicks_recientes || [];
            if (!recientes.length) {
                html += '<div style="text-align:center;padding:30px;"><div style="font-size:32px;margin-bottom:8px;">&#x1F50D;</div><div style="font-size:13px;font-weight:600;color:#374151;">A&#xFA;n no hay clicks</div><div style="font-size:10px;color:#9ca3af;margin-top:4px;">Cuando alguien abra tu enlace, aparecer&#xE1; aqu&#xED;</div></div>';
            } else {
                html += '<div style="font-size:10px;font-weight:600;color:#6b7280;margin-bottom:8px;">&#x1F4C8; Clicks recientes</div>';
                recientes.forEach(function(c) {
                    var prod = c.producto_sku || 'Tienda';
                    var icono = c.dispositivo === 'movil' ? '&#x1F4F1;' : '&#x1F5A5;&#xFE0F;';
                    html += '<div style="padding:8px 10px;border-radius:8px;border:1px solid #e8eaed;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">'
                        +   '<div><div style="font-size:11px;font-weight:600;color:#111;font-family:monospace;">' + prod + '</div>'
                        +   '<div style="font-size:9px;color:#9ca3af;margin-top:2px;">' + icono + ' ' + (c.navegador || 'desconocido') + ' &#x2022; ' + (c.fecha_click ? c.fecha_click.substring(0,16).replace('T',' ') : '') + '</div></div>'
                        + '</div>';
                });
            }
            body.innerHTML = html;
        }).catch(function(){ body.innerHTML = '<div style="color:#dc2626;font-size:12px;padding:16px;">Error al cargar clicks</div>'; });
    }

    // --- Tab: Pagos (retiros de comisiones) ---
    function renderAffPagos(body, code, token) {
        body.innerHTML = '<div style="text-align:center;padding:20px;"><div style="width:24px;height:24px;border:3px solid #e8eaed;border-top-color:#1e40af;border-radius:50%;-webkit-animation:spin 0.7s linear infinite;animation:spin 0.7s linear infinite;margin:0 auto 12px;"></div></div>';
        if (!token) { body.innerHTML = '<div style="color:#6b7280;font-size:12px;padding:16px;text-align:center;">Debes iniciar sesi&#xF3;n</div>'; return; }
        affApiFetch("/api/myshop_api.php?action=afiliado_pagos", { headers: authHeaders(token) })
        .then(function(r){return r.json();})
        .then(function(r) {
            var pagos = r.pagos || [];
            if (!pagos.length) {
                body.innerHTML = '<div style="text-align:center;padding:30px;"><div style="font-size:32px;margin-bottom:8px;">&#x1F4B3;</div><div style="font-size:13px;font-weight:600;color:#374151;">Sin pagos a&#xFA;n</div><div style="font-size:10px;color:#9ca3af;margin-top:4px;">Los retiros de comisiones aparecer&#xE1;n aqu&#xED;</div></div>';
                return;
            }
            var html = '<div style="font-size:10px;font-weight:600;color:#6b7280;margin-bottom:8px;">' + pagos.length + ' pagos</div>';
            pagos.forEach(function(p) {
                var estColor = '#f59e0b';
                if (p.estado === 'pagado') estColor = '#16a34a';
                if (p.estado === 'rechazado') estColor = '#dc2626';
                html += '<div style="padding:8px 10px;border-radius:8px;border:1px solid #e8eaed;margin-bottom:6px;">'
                    +   '<div style="display:flex;justify-content:space-between;"><span style="font-size:12px;font-weight:700;color:#1e40af;">Bs ' + Number(p.monto || 0).toFixed(2) + '</span><span style="font-size:10px;color:' + estColor + ';font-weight:600;">' + (p.estado || '') + '</span></div>'
                    +   '<div style="font-size:9px;color:#9ca3af;margin-top:2px;">' + (p.metodo || 'transferencia') + ' &#x2022; ' + (p.fecha_pago ? 'Pagado ' + p.fecha_pago.substring(0,10) : 'Solicitado ' + (p.fecha_solicitud || '').substring(0,10)) + '</div>'
                    +   '</div>';
            });
            body.innerHTML = html;
        }).catch(function(){ body.innerHTML = '<div style="color:#dc2626;font-size:12px;padding:16px;">Error al cargar pagos</div>'; });
    }


})();
