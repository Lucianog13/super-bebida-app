# 🛒 El Súper de la Bebida — App Web de Pedidos

## 🌐 Link de la app (en vivo)

👉 **[Entrar a la app: https://lucianog13.github.io/super-bebida-app/](https://lucianog13.github.io/super-bebida-app/)**

Aplicación web para que los clientes de la distribuidora **"El Super de la Bebida S.R.L."** (Paraná, Entre Ríos) armen su pedido solos desde el celular. Interfaz visual e intuitiva, pensada para usarse sin explicaciones: se eligen los productos con fotos, se arma el carrito y el pedido sale por WhatsApp. Sin instalar nada.

---

## ✨ Características

* **Catálogo real con fotos de marca:** el catálogo completo de la lista de precios (585 productos, agosto 2026) más los que se agregan desde el panel admin, cada uno con su foto e investigado por marca. Búsqueda y filtros por 15 categorías.
* **Variedades por sabor:** productos como Biscochito Don Satur, 9 de Oro, Obleas Tym, Formis, Polvoritas, Manaos, Planet, Sáladix (tira y caja) y aguas saborizadas abren un selector de sabores (botón **"Elegir sabores"**) donde se elige la cantidad de cada variedad; cada sabor entra al pedido como línea propia (ej: *"Biscochito Don Satur — Dulce ×2"*). Las listas de sabores viven en `js/data/sabores.js` y en la columna `sabores` de Supabase.
* **Promociones:** badge PROMO, precio anterior tachado, **carrusel destacado** en la portada y **filtro "Ofertas"** en el catálogo para ver todas las promos juntas.
* **Carrito con mínimo de compra:** edición de cantidades (con tope por producto), **botón Agregar que cambia a Quitar** cuando el producto ya está en el pedido, y botón de confirmar **bloqueado hasta alcanzar el pedido mínimo ($80.000)**.
* **Stock en vivo:** los productos sin stock se ven en gris y no se pueden agregar. **Por sabor:** desde el selector de sabores (con sesión de admin) se tilda qué variedad no hay; queda en gris y bloqueada para todos los clientes (sincronizado a la nube).
* **Envases retornables:** conteo automático en el resumen del pedido.
* **Pedido por WhatsApp:** texto formal con el detalle completo (ítems con viñetas •, sin numeración para evitar confusiones), link directo precargado, y **remito imprimible** compacto que entra en una sola hoja A4.
* **Funciona sin conexión:** el catálogo queda en caché y la app sigue operativa offline.
* **Panel de administración con login real** (Supabase Auth, solo usuarios habilitados): editar precios, promos, fotos, nombre y descripción, agregar productos, marcar stock, gestionar clientes y ver/imprimir los pedidos recibidos.
* **Reparto con mapa:** pestaña "Reparto" con mapa (OpenStreetMap) que ubica los pedidos del día por su dirección, los divide automáticamente en **Zona 1** y **Zona 2** (con ajuste manual por pedido), y genera las **hojas de carga** — Control de Carga (productos) y Hoja de Clientes (con total de carga) — por zona, listas para imprimir en A4. Incluye **unificación en una sola carga** cuando una zona trae poco.
* **Gestión de clientes:** pestaña "Clientes" en el admin para agregar, buscar, editar y eliminar clientes (N°, nombre y apellido, dirección, número de domicilio y teléfono celular). El checkout los autocompleta por nombre, dirección o N° al tipear.

---

## 🛠️ Tecnologías

* **HTML5 + CSS3:** estructura semántica y estilos responsive mobile-first (paleta corporativa navy + dorado).
* **JavaScript (Vanilla):** sin frameworks ni build — lógica de carrito, catálogo y comunicación con la API separada en módulos puros y testeables.
* **Supabase:** backend como servicio (PostgreSQL, autenticación y almacenamiento de fotos) con seguridad por RLS.
* **GitHub Pages:** hosting público del proyecto.
* **Node.js (≥18):** solo para correr los tests (`node:test`, sin librerías externas).

---

## 📁 Estructura del repositorio

```text
distribuidora-bebidas/
├── index.html              # SPA: 3 vistas (catálogo / carrito / pedido final)
├── css/
│   └── style.css           # estilos corporativos, mobile-first + @media print
├── assets/
│   ├── logo.png            # logo de la empresa
│   └── img/                # fotos de producto (una por id)
├── js/
│   ├── app.js              # router de vistas e inicialización
│   ├── config.js           # credenciales públicas de Supabase
│   ├── core/               # lógica PURA (sin DOM → testeable): auth, cart, order, storage
│   ├── data/
│   │   ├── products.js     # catálogo local (fallback offline)
│   │   ├── sabores.js      # overlay de sabores (productos con variedades)
│   │   └── zonas.js        # zonas de reparto
│   └── ui/                 # capa de presentación: admin, clientes, catalog, cartView, checkout, reparto
├── scripts/                # parseo de lista de precios, deploy, Supabase, imágenes
├── tests/                  # tests de lógica (node:test)
├── docs/                   # lista de precios PDF, análisis de referencia
├── MEMORY.md               # arquitectura técnica (fuente de verdad para desarrollo)
└── CONTEXT.md              # contexto del negocio
```

---

## 🧪 Cómo probar en local

1. Abrir `index.html` con doble clic (funciona desde `file://`) o servirlo con un servidor estático.
2. Correr los tests de lógica: `node --test tests/*.test.js`

---

## 🚀 Deploy a producción

```bash
python scripts/deploy_github.py "mensaje del cambio"
```

Copia la app al repo clonado, commitea y pushea a GitHub Pages (propaga en ~1 min). Antes de publicar, **bumpear `?v=N` en `index.html`** (cache-busting, los navegadores cachean los assets ~10 min).

---

## 📌 Notas

* Pedido mínimo: **$80.000** (configurable en `js/core/order.js`).
* El catálogo se sincroniza desde Supabase; sin conexión usa la copia local.
* El admin se abre con el botón "Administrar" del encabezado (usuarios habilitados por Supabase Auth).
* Las fotos de producto se comprimen automáticamente (máx. 800px, JPEG) antes de subirse, para que carguen rápido y no llenen el storage.
* Razón social y CUIT en el pie de página y en el remito.
