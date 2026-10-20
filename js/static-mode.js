/* static-mode.js — MyShop demo estática (solo activa en *.github.io)
 * En producción (myshop.flaapi.com) este archivo NO se carga: el seed del
 * showcase público inyecta su <script> únicamente en el espejo de Pages.
 */
(function () {
  var host = (window.location.hostname || '');
  if (host.indexOf('.github.io') === -1) { return; }
  if (window.MYSHOP_STATIC) { return; }
  window.MYSHOP_STATIC = true;

  function addBanner() {
    var css = document.createElement('style');
    css.textContent = '#myshop-demo-banner{all:unset;position:fixed;top:0;left:0;right:0;z-index:99999;background:#0b7285;color:#fff;padding:8px 12px;text-align:center;font:14px/1.4 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.25)}#myshop-demo-banner a{color:#fff;text-decoration:underline;font-weight:600}body{padding-top:40px !important}';
    document.head.appendChild(css);
    var b = document.createElement('div');
    b.id = 'myshop-demo-banner';
    b.innerHTML = '🧪 <strong>Demostatic</strong> (vista del tema público). Para comprar, chatear y pagar real: <a href="https://myshop.flaapi.com/" target="_blank" rel="noopener">myshop.flaapi.com</a>';
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addBanner);
  } else {
    addBanner();
  }

  var realFetch = window.fetch.bind(window);
  function jsonOut(data) {
    return Promise.resolve(new Response(JSON.stringify(data === null ? {} : data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }

  window.fetch = function (input, init) {
    var url = '';
    try {
      if (typeof input === 'string') { url = input; }
      else if (input && typeof input.url === 'string') { url = input.url; }
      else { url = String(input || ''); }
    } catch (e) { url = ''; }

    if (url.indexOf('/api/digicorp.php') !== -1 && url.indexOf('action=products') !== -1) {
      var base = window.location.href.replace(/[^/]*$/, '');
      return realFetch(base + 'api/products.json', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (lista) {
          var arr = Array.isArray(lista) ? lista : [];
          var marcas = {};
          arr.forEach(function (p) { if (p && p.marca) { marcas[p.marca] = 1; } });
          return jsonOut({ success: true, ok: true, access_code: 'static', data: arr, total: arr.length, stats: { marcas: Object.keys(marcas).length } });
        })
        .catch(function () { return jsonOut({ data: [] }); });
    }

    if (url.indexOf('/api/') !== -1) {
      return jsonOut({ ok: false, demo: true, error: 'modo-demo-static', data: [] });
    }

    return realFetch(input, init);
  };
})();
