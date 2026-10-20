# 🛍️ MyShop — Showcase público del tema

<p align="center">
  <img src="assets/banner.jpg" alt="MyShop banner" width="800">
</p>

**Demo estática** de la landing/tienda de **MyShop Bolivia**.

- 🌐 **Ver la demo (GitHub Pages):** https://arevaloguzmanchristian-ui.github.io/myshop-web/
- 🏪 **Tienda real (producción):** https://myshop.flaapi.com/

## ¿Qué es y qué NO es?

| En la demo (esta página) | Solo en producción |
|---|---|
| Identidad visual completa (banner, logo, tipografía, colores) | Carrito y checkout real (pago QR) |
| Catálogo navegable cargado desde `api/products.json` fijo | API PHP (productos en vivo, orden, afiliados) |
| Flujo visual de login / afiliado / admin (sin backend) | Chat con IA, notificaciones, WhatsApp integrado |
| Banner «Demo estática» arriba | Config real del servidor (nunca en este repo) |

## 🧩 Contribuir / mejorar el tema

¡PRs bienvenidos! El objetivo de este repo es que la comunidad y el equipo puedan **mejorar la presentación** (HTML/CSS/JS):

1. Fork / branch → edita `index.html`, `css/styles.css`, `js/…` o los assets.
2. Abre un **Pull Request** describiendo la mejora.
3. El mantenedor (dueño) revisa y acepta; la demo se reconstruye en algunos segundos.
4. Para que la mejora llegue a **producción**, el mantenedor la incorpora al repo privado (fuente de verdad) que se despliega a cPanel con GitHub Actions:
   ```bash
   git remote add publico https://github.com/arevaloguzmanchristian-ui/myshop-web.git
   git fetch publico
   git merge publico/main   # absorbe tu PR aceptado
   git push                 # ya en el repo privado → auto-deploy a cPanel
   ```

> ⚠️ **Reglas:** nada de secretos (claves, tokens, `.bak`s, dumps de datos) — el repo privado los filtra por diseño y aquí no deben entrar.

## 🔧 Rebuild

El espejo se construye con un builder determinista (no necesitas PHP):

```bash
node scripts/build-showcase.js <carpeta-origen-fuente> <carpeta-salida>
```

La sincronización automática se hace con GitHub Actions desde el repo privado (trigger: push a `main` + botón manual).
