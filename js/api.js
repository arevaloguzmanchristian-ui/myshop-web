// MyShop API Client
const API = (() => {
    const BASE = '/api/myshop_api.php';

    function getToken() {
        let t = localStorage.getItem('ms_token');
        if (!t) t = sessionStorage.getItem('ms_token');
        if (!t) t = localStorage.getItem('aff_token');
        return t;
    }

    function setToken(t, remember) {
        if (remember) localStorage.setItem('ms_token', t);
        else sessionStorage.setItem('ms_token', t);
        localStorage.setItem('aff_token', t);
    }

    function clearToken() {
        localStorage.removeItem('ms_token');
        localStorage.removeItem('aff_token');
        sessionStorage.removeItem('ms_token');
    }

    async function call(action, data = {}, auth = false) {
        const body = new URLSearchParams();
        body.set('action', action);
        for (const [k, v] of Object.entries(data)) {
            if (v !== undefined && v !== null) body.set(k, v);
        }

        const headers = {};
        if (auth) {
            const token = getToken();
            if (token) headers['Authorization'] = 'Bearer ' + token;
        }

        const res = await fetch(BASE + '?action=' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
            body: body.toString()
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Error desconocido');
        return json;
    }

    // Auth
    const auth = {
        login: (w, p, rem) => call('auth_login', { whatsapp: w, password: p }).then(r => { setToken(r.token, rem); return r; }),
        register: (d) => call('auth_register', d).then(r => { if (r.token) setToken(r.token, false); return r; }),
        me: () => call('auth_me', {}, true),
        logout: () => { clearToken(); window.location.href = '/login'; }
    };

    // Products
    const products = {
        list: (filters = {}) => call('productos', filters),
        get: (sku) => call('productos', { sku }),
        search: (q) => call('productos', { q, limit: 50 }),
        marcas: () => call('marcas'),
        categorias: () => call('categorias')
    };

    // Cart
    const cart = {
        add: (sku, qty = 1) => call('carrito_add', { sku, cantidad: qty }),
        remove: (itemId) => call('carrito_remove', { item_id: itemId }),
        get: () => call('carrito_get', {}, true),
        count: async () => { try { const r = await API.cart.get(); return r.items.length; } catch { return 0; } }
    };

    // Checkout
    const checkout = {
        create: (data) => call('checkout', data),
        status: (pedidoId) => call('pedido_status', { pedido_id: pedidoId })
    };

    // Admin
    const admin = {
        dashboard: () => call('admin_dashboard', {}, true),
        afiliados: () => call('admin_afiliados', {}, true),
        solicitudes: () => call('admin_solicitudes', {}, true),
        aprobarAfiliado: (id, accion) => call('admin_aprobar_afiliado', { id, accion }, true),
        pedidos: (filtro) => call('admin_pedidos', { filtro }, true),
        actualizarPedido: (id, ep, epago) => call('admin_actualizar_pedido', { pedido_id: id, estado_pedido: ep, estado_pago: epago }, true),
        comisiones: () => call('admin_comisiones', {}, true),
        aprobarComision: (id, accion) => call('admin_aprobar_comision', { id, accion }, true),
        pagarComision: (id) => call('admin_pagar_comision', { id }, true),
        pagos: () => call('admin_pagos', {}, true),
        config: () => call('admin_config', {}, true),
        guardarConfig: (data) => call('admin_guardar_config', data, true),
        reclamaciones: () => call('admin_reclamaciones', {}, true),
        resolverReclamacion: (id, accion) => call('admin_resolver_reclamacion', { id, accion }, true),
        auditoria: () => call('admin_auditoria', {}, true),
        usuarios: () => call('admin_usuarios', {}, true)
    };

    // Affiliate
    const affiliate = {
        dashboard: () => call('afiliado_dashboard', {}, true),
        links: () => call('afiliado_mis_links', {}, true),
        ventas: () => call('afiliado_ventas', {}, true),
        comisiones: () => call('afiliado_comisiones', {}, true),
        pagos: () => call('afiliado_pagos', {}, true),
        perfil: () => call('afiliado_perfil', {}, true),
        actualizarPerfil: (d) => call('afiliado_actualizar_perfil', d, true)
    };

    // Orders
    const orders = {
        mine: () => call('mis_pedidos', {}, true),
        detail: (id) => call('pedido_detalle', { pedido_id: id }, true)
    };

    return { call, getToken, setToken, clearToken, auth, products, cart, checkout, admin, affiliate, orders };
})();
