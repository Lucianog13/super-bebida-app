// Punto de entrada: router de vistas, estado global, sync con Supabase.
(function () {
  const $ = (id) => document.getElementById(id);
  const Cart = window.Cart;
  const Order = window.Order;
  const Storage = window.Storage;
  const CFG = window.APP_CONFIG || null;

  const EMPRESA = {
    razonSocial: "EL SUPER DE LA BEBIDA S.R.L.",
    rubro: "Distribuidora de bebidas",
    cuit: "CUIT: 30-71782512-4",
    direccion: "Migue David 2119",
    tel: "Tel: 343 518-2883",
  };

  // ── Banner de pedido mínimo (catálogo) ──
  (function initAvisoMinimo() {
    const el = $("aviso-pedido-minimo");
    if (!el) return;
    el.innerHTML =
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>' +
      ` Pedido mínimo: <strong>${Order.formatMoney(Order.MIN_PEDIDO)}</strong> — sumá productos hasta alcanzar ese monto.`;
    el.hidden = false;
  })();

  let carrito = Storage.loadCart();
  let pedidoActual = null;
  let modoCatalogo = "local"; // "nube" | "local"

  const VISTAS = ["vista-catalogo", "vista-carrito", "vista-checkout", "vista-pedido", "vista-admin"];

  function showVista(id) {
    VISTAS.forEach((v) => ($(v).hidden = v !== id));
    if (id === "vista-carrito") {
      CartUI.render($("items-carrito"), $("total-carrito"), carrito, cartHandlers);
    }
    window.scrollTo({ top: 0 });
  }

  function toast(msg, tipo) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast no-print" + (tipo === "error" ? " toast-error" : "");
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => (t.hidden = true), tipo === "error" ? 5000 : 3200);
  }

  function updateContador() {
    $("contador-carrito").textContent = Cart.count(carrito);
  }

  function updateEstado(msg) {
    const el = $("estado-catalogo");
    if (el) el.textContent = msg;
  }

  // ── Catálogo: nube primero, caché, luego archivo local ──
  function mapProductoDb(row) {
    return {
      id: row.id,
      nombre: row.nombre,
      marca: row.marca || "",
      categoria: row.categoria || "almacen",
      presentacion: row.presentacion || "",
      unidad: row.unidad || "unidad",
      precio: row.precio,
      enPromo: !!row.en_promo,
      precioAnterior: row.precio_anterior || null,
      retornable: !!row.retornable,
      emoji: row.emoji || "📦",
      imagen: row.imagen || "",
      descripcion: row.descripcion || "",
      activo: row.activo !== false,
    };
  }

  async function cargarCatalogo() {
    if (!CFG) {
      updateEstado("Modo local");
      return window.PRODUCTS;
    }
    const cacheKey = "catalogo_cache";
    try {
      const res = await fetch(
        `${CFG.supabaseUrl}/rest/v1/productos?select=*&order=nombre.asc`,
        { headers: { apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey } }
      );
      if (!res.ok) throw new Error("HTTP " + res.status);
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) throw new Error("catálogo vacío");
      const productos = rows.map(mapProductoDb);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), productos }));
      } catch {}
      modoCatalogo = "nube";
      updateEstado("● En línea — catálogo sincronizado");
      return productos;
    } catch {
      try {
        const c = JSON.parse(localStorage.getItem(cacheKey) || "null");
        if (c && Array.isArray(c.productos) && c.productos.length) {
          updateEstado("● Sin conexión — catálogo en caché");
          return c.productos;
        }
      } catch {}
      updateEstado("● Sin conexión — catálogo local");
      return window.PRODUCTS;
    }
  }

  // ── Guardar pedido en la nube (además del localStorage) ──
  async function syncPedido(pedido) {
    if (!CFG) return false;
    try {
      const res = await fetch(`${CFG.supabaseUrl}/rest/v1/pedidos`, {
        method: "POST",
        headers: {
          apikey: CFG.supabaseKey,
          Authorization: "Bearer " + CFG.supabaseKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          id: pedido.id,
          fecha: pedido.fecha,
          cliente: pedido.cliente,
          items: pedido.items,
          total: pedido.total,
          origen: "app",
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  const cartHandlers = {
    onUpdate(items) {
      carrito = items;
      Storage.saveCart(carrito);
      CartUI.render($("items-carrito"), $("total-carrito"), carrito, cartHandlers);
      updateContador();
    },
    onConfirm() {
      if (!carrito.length) return toast("El carrito está vacío");
      showVista("vista-checkout");
    },
  };

  // ── Catálogo ──
  function initCatalog(productos) {
    CatalogUI.init({
      grid: $("grilla-productos"),
      searchInput: $("busqueda"),
      chips: $("chips-categorias"),
      resultados: $("resultados-catalogo"),
      promos: $("seccion-promos"),
      carruselPromos: $("carrusel-promos"),
      productos,
      onAdd(producto) {
        carrito = Cart.addItem(carrito, producto);
        Storage.saveCart(carrito);
        updateContador();
        toast(`"${producto.nombre}" agregado al pedido`);
      },
    });
  }

  // ── Checkout ──
  CheckoutUI.init({
    form: $("form-cliente"),
    nombreInput: $("cliente-nombre"),
    telefonoInput: $("cliente-telefono"),
    direccionInput: $("cliente-direccion"),
    aviso: $("aviso-repetir"),
    btnRepetir: $("btn-repetir"),
    loadOrders: Storage.loadOrders,
    loadCliente: Storage.loadCliente,
    onGenerar(cliente) {
      pedidoActual = Order.buildOrder(cliente, carrito);
      Storage.saveOrder(pedidoActual);
      Storage.saveCliente(cliente);
      carrito = [];
      Storage.saveCart(carrito);
      updateContador();
      renderPedido();
      showVista("vista-pedido");
      toast("Pedido generado correctamente");
      syncPedido(pedidoActual).then((ok) => {
        if (ok) toast("Pedido guardado en la nube ✔");
        else toast("Pedido guardado solo en este dispositivo");
      });
    },
    onRepetir(items) {
      const reemplazar =
        carrito.length === 0 ||
        window.confirm("¿Reemplazar el carrito actual por el último pedido del cliente?");
      if (!reemplazar) return;
      carrito = items.map((i) => ({ ...i }));
      Storage.saveCart(carrito);
      updateContador();
      showVista("vista-carrito");
      toast("Último pedido del cliente cargado en el carrito");
    },
  });

  // ── Navegación global ──
  $("btn-carrito").addEventListener("click", () => showVista("vista-carrito"));
  $("btn-seguir-comprando").addEventListener("click", () => showVista("vista-catalogo"));
  $("btn-confirmar").addEventListener("click", cartHandlers.onConfirm);
  $("btn-volver-carrito").addEventListener("click", () => showVista("vista-carrito"));
  $("btn-nuevo-pedido").addEventListener("click", () => showVista("vista-catalogo"));
  $("btn-imprimir").addEventListener("click", () => window.print());

  // ── Copiar a WhatsApp ──
  $("btn-copiar").addEventListener("click", async () => {
    if (!pedidoActual) return;
    const texto = Order.toWhatsAppText(pedidoActual);
    try {
      await navigator.clipboard.writeText(texto);
      toast("Pedido copiado al portapapeles");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Pedido copiado al portapapeles");
    }
  });

  // ── Enlace WhatsApp (wa.me) ──
  function waLink(tel, texto) {
    let d = (tel || "").replace(/\D/g, "");
    if (!d) return null;
    if (d.startsWith("0")) d = "54" + d.slice(1);
    else if (d.length === 10) d = "54" + d;
    return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
  }

  // ── Vista de pedido: remito + historial ──
  function remitoHTML(p) {
    const rows = p.items
      .map(
        (it, i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td>${it.nombre}<span class="desc">${it.presentacion}${it.unidad ? " · " + it.unidad : ""}</span></td>
          <td class="num">${it.cantidad}</td>
          <td class="num">${Order.formatMoney(it.precioUnit)}</td>
          <td class="num">${Order.formatMoney(it.precioUnit * it.cantidad)}</td>
        </tr>`
      )
      .join("");
    const ret = Order.envasesRetornables(p.items);
    return `
      <div class="remito-head">
        <div>
          <div class="remito-razon">${EMPRESA.razonSocial}</div>
          <div class="remito-sub">${EMPRESA.rubro}</div>
          <div class="remito-sub">${EMPRESA.cuit} · ${EMPRESA.direccion} · ${EMPRESA.tel}</div>
        </div>
        <div class="remito-num">
          <div class="remito-doc">Pedido</div>
          <div class="remito-id">${p.id}</div>
          <div class="remito-sub">${Order.formatDate(p.fecha)}</div>
        </div>
      </div>
      <div class="remito-cliente">
        <strong>Cliente:</strong> ${p.cliente.nombre}${p.cliente.telefono ? " · " + p.cliente.telefono : ""}${p.cliente.direccion ? " · " + p.cliente.direccion : ""}
      </div>
      <table class="remito-tabla">
        <thead>
          <tr><th>#</th><th>Descripción</th><th class="num">Cant.</th><th class="num">P. unit.</th><th class="num">Subtotal</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="remito-total">
        <span class="detalle">${p.items.length} items${ret ? " · Envases retornables: " + ret : ""}</span>
        <strong>${Order.formatMoney(p.total)}</strong>
      </div>
      <div class="remito-nota">Documento no válido como factura.</div>`;
  }

  function renderPedido() {
    if (!pedidoActual) return;
    $("resumen-pedido").innerHTML = remitoHTML(pedidoActual);
    const link = waLink(pedidoActual.cliente.telefono, Order.toWhatsAppText(pedidoActual));
    const btn = $("btn-wa");
    if (link) {
      btn.href = link;
      btn.removeAttribute("disabled");
    } else {
      btn.removeAttribute("href");
      btn.setAttribute("disabled", "disabled");
    }
    renderHistorial();
  }

  function renderHistorial() {
    const orders = Storage.loadOrders().slice().reverse().slice(0, 10);
    $("lista-historial").innerHTML = orders.length
      ? orders
          .map(
            (o) =>
              `<li><span><strong>${o.cliente.nombre}</strong> · ${Order.formatDate(o.fecha)} · ${o.items.length} items</span><strong>${Order.formatMoney(o.total)}</strong></li>`
          )
          .join("")
      : "<li>Sin pedidos registrados.</li>";
  }

  // ── Modo administrador (login real con Supabase Auth) ──
  function entrarAdmin() {
    $("modal-admin").hidden = true;
    $("admin-error").hidden = true;
    $("admin-quien").textContent = "Conectado como " + (Auth.email() || "");
    showVista("vista-admin");
    AdminUI.cargar()
      .then(() => AdminUI.render(""))
      .catch(() => toast("No se pudo cargar la lista de productos"));
  }

  $("btn-admin").addEventListener("click", () => {
    if (Auth.getSession()) {
      entrarAdmin();
      return;
    }
    $("admin-error").hidden = true;
    $("admin-pass").value = "";
    $("modal-admin").hidden = false;
    $("admin-email").focus();
  });

  async function intentarLogin() {
    const email = $("admin-email").value.trim();
    const pass = $("admin-pass").value;
    if (!email || !pass) return;
    $("admin-error").hidden = true;
    const r = await Auth.login(email, pass);
    if (!r.ok) {
      $("admin-error").textContent = r.error;
      $("admin-error").hidden = false;
      return;
    }
    $("admin-pass").value = "";
    entrarAdmin();
  }
  $("btn-admin-login").addEventListener("click", intentarLogin);
  ["admin-email", "admin-pass"].forEach((id) =>
    $(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") intentarLogin();
    })
  );
  $("btn-admin-cancelar").addEventListener("click", () => {
    $("modal-admin").hidden = true;
    $("admin-error").hidden = true;
  });

  AdminUI.init({ lista: $("lista-admin"), busqueda: $("admin-busqueda"), toast });

  $("btn-admin-cerrar").addEventListener("click", () => {
    Auth.logout();
    toast("Sesión cerrada");
    showVista("vista-catalogo");
  });

  $("btn-admin-salir").addEventListener("click", async () => {
    showVista("vista-catalogo");
    const productos = await cargarCatalogo();
    CatalogUI.refresh(productos);
    toast("Catálogo actualizado con los últimos cambios");
  });

  // ── Inicio (async: primero el catálogo) ──
  (async function boot() {
    updateContador();
    const productos = await cargarCatalogo();
    initCatalog(productos);
    showVista("vista-catalogo");
  })();
})();
