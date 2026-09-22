// Punto de entrada: router de vistas, estado global, sync con Supabase.
(function () {
  const $ = (id) => document.getElementById(id);
  const Cart = window.Cart;
  const Order = window.Order;
  const Storage = window.Storage;
  const CFG = window.APP_CONFIG || null;

  // Categorías ocultas del catálogo de CLIENTES (reversible: sacar la categoría de
  // la lista para volver a mostrarla). Los productos ocultos siguen visibles y
  // editables en el panel de administración, y NO se borran de la base ni del archivo.
  const CATEGORIAS_OCULTAS = new Set(["farmacia"]);
  // Ids de farmacia para el botón "Repetir último pedido" (los items del historial
  // no traen categoría, solo el id de producto).
  const IDS_FARMACIA = new Set(
    (window.PRODUCTS || []).filter((p) => p.categoria === "farmacia").map((p) => p.id)
  );

  const EMPRESA = {
    razonSocial: "EL SUPER DE LA BEBIDA S.R.L.",
    rubro: "Distribuidora de bebidas",
    cuit: "CUIT: 30-71782512-4",
    ingBrutos: "Ing. Brutos: 30717825124",
    iva: "IVA: RESP. INSCRIPTO",
    direccion: "Domicilio: Miguel David 2119",
    cp: "C.P.: 3100 - Paraná",
    tel: "Tel: 343 518-2883",
    email: "E-Mail: elsuperdelabebida@gmail.com",
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
  let modificacion = null; // { id, token, fecha, cliente } — pedido en edición ("Modificar pedido")

  const VISTAS = ["vista-catalogo", "vista-carrito", "vista-checkout", "vista-pedido", "vista-mis-pedidos", "vista-admin"];

  function showVista(id) {
    VISTAS.forEach((v) => ($(v).hidden = v !== id));
    if (id === "vista-carrito") {
      CartUI.render($("items-carrito"), $("total-carrito"), carrito, cartHandlers);
      actualizarBotonConfirmar();
      actualizarModoModificacion();
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
      sabores: Array.isArray(row.sabores) ? row.sabores : [],
      sabores_sin_stock: Array.isArray(row.sabores_sin_stock) ? row.sabores_sin_stock : [],
      saboresPromo: Array.isArray(row.sabores_promo) ? row.sabores_promo : [],
    };
  }

  // Overlay de sabores (js/data/sabores.js): nombres limpios, listas de sabores
  // y entradas absorbidas por una familia. Idempotente: se aplica sobre nube,
  // caché y archivo local para que la vista de clientes sea siempre la misma.
  function aplicarOverlay(productos) {
    const ov = window.SABORES_OVERLAY;
    if (!ov || !Array.isArray(productos)) return (productos || []).filter((p) => !CATEGORIAS_OCULTAS.has(p.categoria));
    const ocultos = new Set(ov.ocultar || []);
    const categorias = ov.categorias || {};
    const cantidades = ov.cantidad || {};
    return productos
      .filter((p) => !ocultos.has(p.id))
      .map((p) => {
        const fam = (ov.familias || {})[p.id];
        const categoria = categorias[p.id] || p.categoria;
        const cant = cantidades[p.id];
        let out = categorias[p.id] ? { ...p, categoria } : p;
        if (fam) {
          // La nube (columna sabores) manda cuando hay datos; si no, el overlay (modo local).
          const desdeDb = Array.isArray(p.sabores) && p.sabores.length > 0;
          out = {
            ...out,
            categoria,
            nombre: desdeDb ? p.nombre : fam.nombre,
            sabores: desdeDb ? p.sabores : fam.sabores,
            activo: fam.activar ? true : p.activo,
            sabores_precios: desdeDb ? null : (fam.precios || null),
            saboresLabel: fam.saboresLabel || "",
          };
        }
        if (cant != null) {
          // "Medio cajón": el precio base del producto es el CAJÓN COMPLETO; el medio
          // cajón vale la mitad. La descripción muestra ambas opciones y el selector
          // ofrece "Cajón completo" (= precio) y "Medio cajón" (= precio / 2). Idempotente.
          const medio = "Medio cajón x" + cant;
          const completo = "Cajón completo x" + cant * 2;
          out = {
            ...out,
            cantidadMedio: cant,
            unidad: "", // vacío: el cajón va en la descripción, no se repite en carrito/WhatsApp
            descripcion: completo + " / " + medio,
            sabores: [completo, medio],
            sabores_precios: { [completo]: p.precio, [medio]: p.precio / 2 },
            saboresLabel: "Elegir Cantidad",
          };
        }
        return out;
      })
      .filter((p) => !CATEGORIAS_OCULTAS.has(p.categoria));
  }

  async function cargarCatalogo() {
    if (!CFG) {
      updateEstado("Modo local");
      return aplicarOverlay(window.PRODUCTS);
    }
    const cacheKey = "catalogo_cache";
    // La caché vence a las 24 h: si el fetch a la nube falla y la copia guardada es
    // más vieja, se descarta y se cae al archivo local. Así ningún cliente queda
    // pegado a un precio viejo (bug reportado: cliente 1000, Canciller $15.000 vs $13.500).
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    try {
      const res = await fetch(
        `${CFG.supabaseUrl}/rest/v1/productos?select=*&order=nombre.asc`,
        { headers: { apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey } }
      );
      if (!res.ok) throw new Error("HTTP " + res.status);
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) throw new Error("catálogo vacío");
      const productos = aplicarOverlay(rows.map(mapProductoDb));
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), productos }));
      } catch {}
      modoCatalogo = "nube";
      updateEstado("● En línea — catálogo sincronizado");
      return productos;
    } catch {
      try {
        const c = JSON.parse(localStorage.getItem(cacheKey) || "null");
        const cacheFresca = c && typeof c.t === "number" && (Date.now() - c.t) < CACHE_TTL_MS;
        if (cacheFresca && Array.isArray(c.productos) && c.productos.length) {
          updateEstado("● Sin conexión — catálogo en caché");
          return aplicarOverlay(c.productos);
        }
      } catch {}
      updateEstado("● Sin conexión — catálogo local");
      return aplicarOverlay(window.PRODUCTS);
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
          token: pedido.token || null,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Botón "Confirmar pedido": solo se habilita cuando se alcanza el pedido mínimo
  function actualizarBotonConfirmar() {
    const btn = $("btn-confirmar");
    if (!btn) return;
    const falta = Order.faltanteMinimo(Cart.total(carrito));
    btn.disabled = falta > 0;
    btn.title = falta > 0
      ? `Te faltan ${Order.formatMoney(falta)} para el pedido mínimo de ${Order.formatMoney(Order.MIN_PEDIDO)}`
      : "";
    const lbl = $("btn-confirmar-texto");
    if (lbl) lbl.textContent = modificacion ? "Confirmar modificación" : "Confirmar pedido";
  }

  const cartHandlers = {
    onUpdate(items) {
      carrito = items;
      Storage.saveCart(carrito);
      CartUI.render($("items-carrito"), $("total-carrito"), carrito, cartHandlers);
      updateContador();
      actualizarBotonConfirmar();
    },
    onConfirm() {
      if (modificacion) return confirmarModificacion();
      if (!carrito.length) return toast("El carrito está vacío");
      const falta = Order.faltanteMinimo(Cart.total(carrito));
      if (falta > 0) {
        return toast(`Te faltan ${Order.formatMoney(falta)} para llegar al pedido mínimo de ${Order.formatMoney(Order.MIN_PEDIDO)}`);
      }
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
      modalSabores: $("modal-sabores"),
      modalSaboresTitulo: $("modal-sabores-titulo"),
      modalSaboresSub: $("modal-sabores-sub"),
      modalSaboresLista: $("modal-sabores-lista"),
      modalSaboresTotal: $("modal-sabores-total"),
      btnConfirmarSabores: $("btn-confirmar-sabores"),
      productos,
      onAdd(producto) {
        carrito = Cart.addItem(carrito, producto);
        Storage.saveCart(carrito);
        updateContador();
        CatalogUI.refresh(productos);
        toast(`"${producto.nombre}" agregado al pedido`);
      },
      onRemove(producto) {
        carrito = Cart.removeItem(carrito, producto.id);
        Storage.saveCart(carrito);
        updateContador();
        CatalogUI.refresh(productos);
        toast(`"${producto.nombre}" quitado del pedido`);
      },
      cantidadEnCarrito(id, sabor) {
        const linea = Cart.find(carrito, id, sabor);
        return linea ? linea.cantidad : 0;
      },
      onAddSabores(producto, seleccion) {
        seleccion.forEach(({ sabor, cantidad, precio, precioAnterior }) => {
          carrito = Cart.addItem(carrito, producto, cantidad, sabor, precio != null ? precio : null, precioAnterior != null ? precioAnterior : null);
        });
        Storage.saveCart(carrito);
        updateContador();
        const unidades = seleccion.reduce((s, x) => s + x.cantidad, 0);
        toast(`${unidades} unidad${unidades === 1 ? "" : "es"} de "${producto.nombre}" agregada${unidades === 1 ? "" : "s"} al pedido`);
      },
    });
  }

  // ── Checkout ──
  CheckoutUI.init({
    form: $("form-cliente"),
    nombreInput: $("cliente-nombre"),
    direccionInput: $("cliente-direccion"),
    nroClienteInput: $("cliente-nro"),
    aviso: $("aviso-repetir"),
    btnRepetir: $("btn-repetir"),
    loadOrders: Storage.loadOrders,
    loadCliente: Storage.loadCliente,
    supabaseUrl: CFG.supabaseUrl,
    supabaseKey: CFG.supabaseKey,
    onGenerar(cliente) {
      pedidoActual = Order.buildOrder(cliente, carrito, new Date(), generarToken());
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
      carrito = items
        .filter((i) => !IDS_FARMACIA.has(i.productoId))
        .map((i) => ({ ...i }));
      Storage.saveCart(carrito);
      updateContador();
      showVista("vista-carrito");
      toast("Último pedido del cliente cargado en el carrito");
    },
  });


  // ── Modificar Pedido (cliente): agregar/quitar productos hasta las 23:59 del día ──
  function generarToken() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return "tok-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function actualizarModoModificacion() {
    const banner = $("aviso-modificacion");
    if (banner) {
      const txt = $("aviso-modificacion-texto");
      if (modificacion) {
        txt.textContent = `Modificando el pedido Nº ${modificacion.id} — agregá, quitá o cambiá cantidades. Tenés hasta las 23:59 de hoy.`;
        banner.hidden = false;
      } else {
        banner.hidden = true;
      }
    }
    actualizarBotonConfirmar();
  }

  function cancelarModificacion() {
    modificacion = null;
    carrito = [];
    Storage.saveCart(carrito);
    updateContador();
    actualizarModoModificacion();
  }

  function iniciarModificacion(orden) {
    if (!orden || !orden.token || !Order.puedeModificarse(orden.fecha)) {
      toast("Este pedido ya no se puede modificar (el plazo es hasta las 23:59 del día del pedido)", "error");
      return;
    }
    modificacion = { id: orden.id, token: orden.token, fecha: orden.fecha, cliente: orden.cliente };
    carrito = (orden.items || []).map((i) => ({ ...i }));
    Storage.saveCart(carrito);
    updateContador();
    actualizarModoModificacion();
    CartUI.render($("items-carrito"), $("total-carrito"), carrito, cartHandlers);
    showVista("vista-carrito");
    toast(`Modificando el pedido Nº ${orden.id} — tenés hasta las 23:59`);
  }

  async function modificarEnNube(pedido) {
    if (!CFG) return false;
    try {
      const res = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/modificar_pedido`, {
        method: "POST",
        headers: {
          apikey: CFG.supabaseKey,
          Authorization: "Bearer " + CFG.supabaseKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_id: pedido.id,
          p_token: pedido.token,
          p_items: pedido.items,
          p_total: pedido.total,
        }),
      });
      if (!res.ok) return false;
      return (await res.text()).trim() === "true";
    } catch {
      return false;
    }
  }

  async function confirmarModificacion() {
    if (!modificacion) return;
    if (!carrito.length) return toast("El pedido no puede quedar vacío", "error");
    const falta = Order.faltanteMinimo(Cart.total(carrito));
    if (falta > 0) {
      return toast(`Te faltan ${Order.formatMoney(falta)} para llegar al pedido mínimo de ${Order.formatMoney(Order.MIN_PEDIDO)}`, "error");
    }
    if (!Order.puedeModificarse(modificacion.fecha)) {
      cancelarModificacion();
      showVista("vista-carrito");
      return toast("El plazo para modificar venció (hasta las 23:59 del día del pedido)", "error");
    }
    const nuevo = Order.buildModificacion(modificacion, carrito);
    const ok = await modificarEnNube(nuevo);
    if (!ok) return toast("No se pudo modificar el pedido — probá de nuevo en un momento", "error");
    Storage.updateOrder(nuevo);
    pedidoActual = nuevo;
    modificacion = null;
    carrito = [];
    Storage.saveCart(carrito);
    updateContador();
    actualizarModoModificacion();
    renderPedido();
    showVista("vista-pedido");
    toast("Pedido modificado — mandalo de nuevo por WhatsApp para que el negocio vea la lista final");
  }

  // ── Navegación global ──
  $("btn-carrito").addEventListener("click", () => showVista("vista-carrito"));
  $("btn-seguir-comprando").addEventListener("click", () => showVista("vista-catalogo"));
  $("btn-confirmar").addEventListener("click", cartHandlers.onConfirm);
  $("btn-volver-carrito").addEventListener("click", () => showVista("vista-carrito"));
  $("btn-nuevo-pedido").addEventListener("click", () => {
    if (modificacion) {
      if (!window.confirm("¿Salir de la modificación del pedido actual?")) return;
      cancelarModificacion();
    }
    showVista("vista-catalogo");
  });
  $("btn-imprimir").addEventListener("click", () => {
    if (pedidoActual) imprimirRemitos([pedidoActual]);
  });
  $("btn-modificar").addEventListener("click", () => {
    if (pedidoActual) iniciarModificacion(pedidoActual);
  });
  $("btn-cancelar-modificacion").addEventListener("click", () => {
    cancelarModificacion();
    showVista("vista-catalogo");
  });

  // ── Botones "Volver" genéricos (data-volver) ──
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-volver]");
    if (b && b.dataset.volver) showVista(b.dataset.volver);
  });

  // ── Mis pedidos (búsqueda por Nº + nombre, nube + local) ──
  $("btn-mis-pedidos").addEventListener("click", () => {
    const prev = Storage.loadCliente();
    if (prev) {
      if (prev.nroCliente) $("mp-nro").value = prev.nroCliente;
      if (prev.nombre) $("mp-nombre").value = prev.nombre;
    }
    showVista("vista-mis-pedidos");
    if ($("mp-nro").value.trim()) buscarMisPedidos();
  });
  $("btn-mp-buscar").addEventListener("click", buscarMisPedidos);
  ["mp-nro", "mp-nombre"].forEach((id) =>
    $(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") buscarMisPedidos();
    })
  );
  $("mis-pedidos-lista").addEventListener("click", (e) => {
    const modBtn = e.target.closest("[data-mod-id]");
    if (modBtn) {
      const orden = misPedidosActuales.find((o) => o.id === modBtn.dataset.modId);
      if (orden) iniciarModificacion(orden);
      return;
    }
    const verBtn = e.target.closest("[data-ver-id]");
    if (verBtn) {
      const orden = misPedidosActuales.find((o) => o.id === verBtn.dataset.verId);
      if (orden) mostrarRemitoPedido(orden);
    }
  });

  // ── Copiar a WhatsApp ──
  $("btn-copiar").addEventListener("click", async () => {
    if (!pedidoActual) return;
    const texto = Order.toWhatsAppText(pedidoActual, pedidoActual.modificado);
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
        (it) => `
        <tr>
          <td>${it.nombre}</td>
          <td class="num">${it.cantidad}</td>
          <td class="num">${Order.formatMoney(it.precioUnit)}</td>
          <td class="num">${Order.formatMoney(it.precioUnit * it.cantidad)}</td>
        </tr>`
      )
      .join("");
    const ret = Order.envasesRetornables(p.items);
    return `
      <div class="remito-head">
        <div class="remito-emisor">
          <div class="remito-razon">${EMPRESA.razonSocial}</div>
          <div class="remito-sub">${EMPRESA.rubro}</div>
          <div class="remito-sub">${EMPRESA.direccion}</div>
          <div class="remito-sub">${EMPRESA.cp}</div>
          <div class="remito-sub">${EMPRESA.tel}</div>
          <div class="remito-sub">${EMPRESA.email}</div>
          <div class="remito-sub remito-iva">${EMPRESA.iva}</div>
        </div>
        <div class="remito-tipo">
          <div class="remito-tipo-caja">X</div>
          <div class="remito-tipo-texto">NO VALIDO COMO FACTURA</div>
        </div>
        <div class="remito-num">
          <div class="remito-doc">Pedido</div>
          <div class="remito-id">${p.id}</div>
          <div class="remito-sub">Fecha: ${Order.formatDate(p.fecha)}</div>
          <div class="remito-sub">${EMPRESA.cuit}</div>
          <div class="remito-sub">${EMPRESA.ingBrutos}</div>
        </div>
      </div>
      <div class="remito-cliente">
        <strong>Cliente:</strong> ${p.cliente.nombre}${p.cliente.nroCliente ? " · Nº " + p.cliente.nroCliente : ""}${p.cliente.direccion ? " · " + p.cliente.direccion : ""}
      </div>
      <table class="remito-tabla">
        <thead>
          <tr><th>Descripción</th><th class="num">Cant.</th><th class="num">P. unit.</th><th class="num">Subtotal</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="remito-total">
        <span class="detalle">${p.items.length} items${ret ? " · Envases retornables: " + ret : ""}</span>
        <strong>${Order.formatMoney(p.total)}</strong>
      </div>`;
  }

  function renderPedido() {
    if (!pedidoActual) return;
    $("resumen-pedido").innerHTML = remitoHTML(pedidoActual);
    const link = waLink(pedidoActual.cliente.telefono, Order.toWhatsAppText(pedidoActual, pedidoActual.modificado));
    const btn = $("btn-wa");
    if (link) {
      btn.href = link;
      btn.removeAttribute("disabled");
    } else {
      btn.removeAttribute("href");
      btn.setAttribute("disabled", "disabled");
    }
    const btnMod = $("btn-modificar");
    if (btnMod) btnMod.hidden = !(pedidoActual.token && Order.puedeModificarse(pedidoActual.fecha));
    renderHistorial();
  }

  function renderHistorial() {
    const orders = Storage.loadOrders().slice().reverse().slice(0, 10);
    $("lista-historial").innerHTML = orders.length
      ? orders
          .map(
            (o) =>
              `<li><span><strong>${o.cliente.nombre}</strong> · ${Order.formatDate(o.fecha)} · ${o.items.length} items` +
              (o.token && Order.puedeModificarse(o.fecha)
                ? ` <button type="button" class="btn small outline hist-modificar" data-mod-id="${o.id}">✏️ Modificar</button>`
                : "") +
              `</span><strong>${Order.formatMoney(o.total)}</strong></li>`
          )
          .join("")
      : "<li>Sin pedidos registrados.</li>";
  }

  $("lista-historial").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mod-id]");
    if (!btn) return;
    const orden = Storage.loadOrders().find((o) => o.id === btn.dataset.modId);
    if (orden) iniciarModificacion(orden);
  });

  // ── Mis pedidos ──
  let misPedidosActuales = [];

  async function buscarMisPedidos() {
    const nro = $("mp-nro").value.trim();
    const nombre = $("mp-nombre").value.trim();
    const locales = Storage.loadOrders();

    if (!nro) {
      misPedidosActuales = Order.fusionarPedidos(locales, []);
      if (!locales.length) {
        renderMisPedidos("Ingresá el Nº de cliente para ver sus pedidos.");
      } else {
        renderMisPedidos(null);
        toast("Sin Nº ingresado — mostrando los pedidos de este dispositivo");
      }
      return;
    }

    const nn = Order.normalizarTexto(nombre);
    const localesFiltrados = locales.filter(
      (o) =>
        Order.normalizarTexto(o.cliente && o.cliente.nroCliente) === Order.normalizarTexto(nro) &&
        (!nn || Order.nombreCoincide(nombre, o.cliente && o.cliente.nombre))
    );

    let nube = [];
    let nubeOk = false;
    if (CFG) {
      try {
        const res = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/mis_pedidos`, {
          method: "POST",
          headers: {
            apikey: CFG.supabaseKey,
            Authorization: "Bearer " + CFG.supabaseKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_nro: nro, p_nombre: nombre }),
        });
        if (res.ok) {
          const data = await res.json();
          nube = Array.isArray(data) ? data : [];
          nubeOk = true;
        }
      } catch {
        /* sin conexión */
      }
    }

    misPedidosActuales = Order.fusionarPedidos(localesFiltrados, nube);
    renderMisPedidos(null);
    if (!nubeOk) toast("Sin conexión — mostrando solo los pedidos de este dispositivo");
  }

  function renderMisPedidos(msg) {
    const lista = $("mis-pedidos-lista");
    const resumen = $("mis-pedidos-resumen");
    if (resumen) resumen.hidden = true;
    if (msg) {
      lista.innerHTML = `<li>${msg}</li>`;
      return;
    }
    if (!misPedidosActuales.length) {
      lista.innerHTML = "<li>No hay pedidos para esa búsqueda.</li>";
      return;
    }
    // Resumen del historial completo del cliente: cuántos pedidos + total acumulado.
    const totalAcumulado = misPedidosActuales.reduce((s, o) => s + (Number(o.total) || 0), 0);
    if (resumen) {
      resumen.textContent =
        `${misPedidosActuales.length} pedido${misPedidosActuales.length === 1 ? "" : "s"} encontrado${misPedidosActuales.length === 1 ? "" : "s"} · total acumulado ${Order.formatMoney(totalAcumulado)}`;
      resumen.hidden = false;
    }
    lista.innerHTML = misPedidosActuales
      .map(
        (o) =>
          `<li><span><strong>${o.cliente.nombre}</strong> · Nº ${o.id} · ${Order.formatDate(o.fecha)} · ${o.items.length} items` +
          ` <button type="button" class="btn small outline" data-ver-id="${o.id}">👁 Ver pedido</button>` +
          (o.token && Order.puedeModificarse(o.fecha)
            ? ` <button type="button" class="btn small outline" data-mod-id="${o.id}">✏️ Modificar</button>`
            : "") +
          `</span><strong>${Order.formatMoney(o.total)}</strong></li>`
      )
      .join("");
  }

  // ── Pedidos (vista admin: agrupar por fecha, seleccionar e imprimir) ──
  let pedidosNube = [];
  const pedidosSeleccion = new Set();
  let diaSeleccion = "hoy"; // hoy | ayer | todos — selector de día del panel Pedidos

  function fechaClave(fecha) {
    return Dia.fechaClave(fecha); // clave de día en hora argentina (js/core/dia.js)
  }

  function agruparPorFecha(pedidos) {
    const grupos = [];
    const mapa = new Map();
    pedidos.forEach((p) => {
      const clave = fechaClave(p.fecha);
      if (!mapa.has(clave)) {
        const g = { fecha: clave, pedidos: [] };
        mapa.set(clave, g);
        grupos.push(g);
      }
      mapa.get(clave).pedidos.push(p);
    });
    return grupos;
  }

  function pedidoResumen(p) {
    const n = (p.items || []).length;
    const c = p.cliente || {};
    const z = Reparto.zonaCacheada(p);
    const zBoton = (num, label) =>
      `<button class="btn mini ${z === num ? "primary" : "outline"}" data-accion="zona" data-zona="${num}">${label}</button>`;
    return `
    <div class="pedido-fila" data-id="${p.id}">
      <input type="checkbox" class="pedido-check" ${pedidosSeleccion.has(p.id) ? "checked" : ""}>
      <div class="pedido-cuerpo">
        <div class="pedido-cliente">
          <strong>${c.nombre || "—"}</strong>
          ${zonaBadgeHTML(p)}
          ${c.nroCliente ? `<span class="pedido-nro">Nº ${c.nroCliente}</span>` : ""}
          ${c.telefono ? `<span>· ${c.telefono}</span>` : ""}
          ${c.direccion ? `<span>· ${c.direccion}</span>` : ""}
        </div>
        <div class="pedido-items">${n} item${n === 1 ? "" : "s"} · ${Order.formatMoney(p.total)}</div>
        <div class="pedido-nro-editor">
          Nº de cliente
          <input type="text" class="in-nro-cliente" value="${c.nroCliente || ""}" placeholder="—">
          <button class="btn small outline" data-accion="guardar-nro">Guardar</button>
          <button class="btn small outline" data-accion="ver-pedido">👁 Ver pedido</button>
        </div>
        <div class="pedido-zona-editor">
          ${zBoton(1, "Z1")}${zBoton(2, "Z2")}
          ${z === 1 || z === 2 ? `<button class="btn mini outline" data-accion="zona" data-zona="0" title="Quitar zona manual">✕</button>` : ""}
        </div>
      </div>
    </div>`;
  }

  function grupoHTML(g) {
    const selTodos = g.pedidos.every((p) => pedidosSeleccion.has(p.id));
    return `
    <div class="pedido-grupo" data-fecha="${g.fecha}">
      <div class="pedido-fecha">
        <label><input type="checkbox" class="pedido-check-fecha" ${selTodos ? "checked" : ""}> <strong>${g.fecha}</strong></label>
        <span class="pedido-fecha-count">${g.pedidos.length} pedido${g.pedidos.length === 1 ? "" : "s"}</span>
      </div>
      ${g.pedidos.map(pedidoResumen).join("")}
    </div>`;
  }

  async function cargarPedidos() {
    if (!CFG || !Auth.getSession()) return;
    const t = await Auth.token();
    if (!t) {
      toast("Sesión vencida — cerrá sesión y volvé a entrar", "error");
      return;
    }
    const res = await fetch(`${CFG.supabaseUrl}/rest/v1/pedidos?select=*&order=fecha.desc`, {
      headers: { apikey: CFG.supabaseKey, Authorization: "Bearer " + t },
    });
    if (!res.ok) {
      toast("No se pudieron cargar los pedidos (HTTP " + res.status + ")", "error");
      return;
    }
    pedidosNube = await res.json();
    renderPedidos();
    detectarZonasFondo();
  }

  // Pedidos del día seleccionado (hoy/ayer por fecha argentina; todos = sin filtro).
  function pedidosDelDia() {
    if (diaSeleccion === "todos") return pedidosNube;
    return Dia.filtrarDia(pedidosNube, diaSeleccion === "hoy" ? 0 : -1);
  }

  function renderPedidos() {
    const el = $("lista-pedidos");
    if (!pedidosNube.length) {
      el.innerHTML = '<p class="carrito-vacio">Todavía no hay pedidos registrados.</p>';
      return;
    }
    const delDia = pedidosDelDia();
    if (!delDia.length) {
      const diaTxt = diaSeleccion === "hoy" ? "hoy" : diaSeleccion === "ayer" ? "ayer" : "mostrar";
      el.innerHTML = `<p class="carrito-vacio">No hay pedidos para ${diaTxt} todavía.</p>`;
      return;
    }
    el.innerHTML = agruparPorFecha(delDia).map(grupoHTML).join("");
  }

  function pedidosMarcados() {
    return pedidosNube.filter((p) => pedidosSeleccion.has(p.id));
  }

  function zonaLabel(z) {
    return z === 1 ? "Zona 1" : z === 2 ? "Zona 2" : "Sin zona";
  }

  function zonaBadgeHTML(p) {
    const z = Reparto.zonaCacheada(p);
    const cls = z === 1 ? "z1" : z === 2 ? "z2" : "sin";
    const txt = z ? zonaLabel(z) : ((p.cliente && p.cliente.direccion) ? "…" : "Sin zona");
    return `<span class="pedido-zona ${cls}" data-zona-for="${p.id}">${txt}</span>`;
  }

  function actualizarZonaBadge(pid, zona) {
    document.querySelectorAll(`[data-zona-for="${CSS.escape(pid)}"]`).forEach((el) => {
      el.textContent = zonaLabel(zona);
      el.className = "pedido-zona " + (zona === 1 ? "z1" : zona === 2 ? "z2" : "sin");
    });
  }

  // Geocodifica en segundo plano las direcciones que faltan y va pintando las zonas.
  function detectarZonasFondo() {
    const faltan = pedidosNube.filter(
      (p) => Reparto.zonaCacheada(p) === 0 && p.cliente && p.cliente.direccion
    );
    if (!faltan.length) return;
    Reparto.detectarZonas(pedidosNube, (pid, zona) => actualizarZonaBadge(pid, zona))
      .then((n) => { if (n) toast(`Zonas detectadas: ${n} dirección${n === 1 ? "" : "es"}`); });
  }

  // ── Hojas de carga / por cliente desde la selección de "Pedidos" ──
  async function ubicarSeleccion(sel) {
    const faltan = sel.filter(
      (p) => Reparto.zonaCacheada(p) === 0 && p.cliente && p.cliente.direccion
    );
    if (faltan.length) {
      toast(`Ubicando direcciones para detectar zonas… (${faltan.length})`);
      await Reparto.detectarZonas(sel);
    }
  }

  function separarPorZona(sel) {
    const porZona = { 1: [], 2: [], 0: [] };
    sel.forEach((p) => porZona[Reparto.zonaCacheada(p)].push(p));
    return porZona;
  }

  async function imprimirCargaSeleccion() {
    let sel = pedidosMarcados();
    if (!sel.length) sel = pedidosDelDia(); // sin selección manual → todo el día elegido
    if (!sel.length) { toast("No hay pedidos para el día seleccionado", "error"); return; }
    await ubicarSeleccion(sel);
    const porZona = separarPorZona(sel);
    const partes = [];
    if (porZona[0].length) {
      partes.push(`<div class="hc-aviso">⚠️ ${porZona[0].length} pedido${porZona[0].length === 1 ? "" : "s"} sin zona asignada — va${porZona[0].length === 1 ? "" : "n"} al final. Asignales Z1 o Z2 desde la lista y reimprimí.</div>`);
    }
    if (porZona[1].length) partes.push(Reparto.hojaCargaHTML(porZona[1], "Zona 1"));
    if (porZona[2].length) partes.push(Reparto.hojaCargaHTML(porZona[2], "Zona 2"));
    if (porZona[0].length) partes.push(Reparto.hojaIndividualHTML(porZona[0], "Sin zona — revisar dirección"));
    Reparto.imprimirHTML(partes.join(""));
  }

  function imprimirRemitos(pedidos) {
    if (!pedidos || !pedidos.length) {
      toast("No hay pedidos para imprimir", "error");
      return;
    }
    toast(`Imprimiendo ${pedidos.length} pedido${pedidos.length === 1 ? "" : "s"}…`);
    $("zona-impresion").innerHTML = pedidos
      .map((p) => `<div class="pedido-hoja">${remitoHTML(p)}</div>`)
      .join("");
    window.print();
  }

  async function guardarNroCliente(pid) {
    const p = pedidosNube.find((x) => x.id === pid);
    const fila = document.querySelector(`.pedido-fila[data-id="${CSS.escape(pid)}"]`);
    if (!p || !fila) return;
    const valor = fila.querySelector(".in-nro-cliente").value.trim();
    const t = await Auth.token();
    if (!t) {
      toast("Sesión vencida — cerrá sesión y volvé a entrar", "error");
      return;
    }
    const cliente = { ...(p.cliente || {}), nroCliente: valor };
    const res = await fetch(`${CFG.supabaseUrl}/rest/v1/pedidos?id=eq.${encodeURIComponent(pid)}`, {
      method: "PATCH",
      headers: {
        apikey: CFG.supabaseKey,
        Authorization: "Bearer " + t,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ cliente }),
    });
    if (!res.ok) {
      toast(res.status === 401 || res.status === 403 ? "No autorizado — cerrá sesión y volvé a entrar" : "Error al guardar (HTTP " + res.status + ")", "error");
      return;
    }
    p.cliente = cliente;
    toast("Nº de cliente guardado ✔");
    renderPedidos();
  }

  // Asigna/quita la zona manual de un pedido (se guarda en Supabase, campo zona).
  async function cambiarZonaPedido(pid, zona) {
    const p = pedidosNube.find((x) => x.id === pid);
    if (!p) return;
    const valor = zona === 0 ? null : zona;
    const t = await Auth.token();
    if (!t) {
      toast("Sesión vencida — cerrá sesión y volvé a entrar", "error");
      return;
    }
    const res = await fetch(`${CFG.supabaseUrl}/rest/v1/pedidos?id=eq.${encodeURIComponent(pid)}`, {
      method: "PATCH",
      headers: {
        apikey: CFG.supabaseKey,
        Authorization: "Bearer " + t,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ zona: valor }),
    });
    if (!res.ok) {
      toast(res.status === 401 || res.status === 403 ? "No autorizado — cerrá sesión y volvé a entrar" : "No se pudo guardar la zona (HTTP " + res.status + ")", "error");
      return;
    }
    p.zona = valor;
    toast(valor ? `Pedido asignado a Zona ${valor} ✔` : "Zona quitada ✔");
    renderPedidos();
  }

  /** Muestra el remito completo del pedido en el modal "Ver pedido" (sin imprimir). */
  function mostrarRemitoPedido(p) {
    if (!p) return;
    $("ver-pedido-contenido").innerHTML = `<div class="pedido-hoja">${remitoHTML(p)}</div>`;
    $("modal-ver-pedido").hidden = false;
  }

  // Desde el panel "Pedidos" del admin (busca en la lista ya cargada en pedidosNube).
  function verPedido(pid) {
    mostrarRemitoPedido(pedidosNube.find((x) => x.id === pid));
  }

  // ── Pestañas del admin (Productos | Pedidos) ──
  function mostrarPanelAdmin(panel) {
    $("panel-productos").hidden = panel !== "productos";
    $("panel-pedidos").hidden = panel !== "pedidos";
    $("panel-reparto").hidden = panel !== "reparto";
    $("panel-clientes").hidden = panel !== "clientes";
    $("tab-productos").classList.toggle("active", panel === "productos");
    $("tab-pedidos").classList.toggle("active", panel === "pedidos");
    $("tab-reparto").classList.toggle("active", panel === "reparto");
    $("tab-clientes").classList.toggle("active", panel === "clientes");
    if (panel === "pedidos") cargarPedidos();
    if (panel === "reparto") Reparto.cargar();
    if (panel === "clientes") {
      ClientesUI.cargar()
        .then(() => ClientesUI.render(""))
        .catch(() => toast("No se pudieron cargar los clientes", "error"));
    }
  }

  $("tab-productos").addEventListener("click", () => mostrarPanelAdmin("productos"));
  $("tab-pedidos").addEventListener("click", () => mostrarPanelAdmin("pedidos"));
  $("tab-reparto").addEventListener("click", () => mostrarPanelAdmin("reparto"));
  $("tab-clientes").addEventListener("click", () => mostrarPanelAdmin("clientes"));
  $("btn-imprimir-seleccion").addEventListener("click", () => imprimirRemitos(pedidosMarcados()));
  $("btn-imprimir-todo").addEventListener("click", () => imprimirRemitos(pedidosDelDia()));
  document.querySelectorAll("#dia-selector-pedidos .chip-dia").forEach((chip) =>
    chip.addEventListener("click", () => {
      diaSeleccion = chip.dataset.dia;
      document.querySelectorAll("#dia-selector-pedidos .chip-dia").forEach((x) => x.classList.toggle("active", x === chip));
      pedidosSeleccion.clear();
      $("btn-imprimir-todo").textContent = diaSeleccion === "todos" ? "🖨 Imprimir todo" : "🖨 Imprimir " + (diaSeleccion === "hoy" ? "hoy" : "ayer");
      renderPedidos();
    })
  );
  $("btn-recargar-pedidos").addEventListener("click", cargarPedidos);
  $("btn-hoja-carga").addEventListener("click", imprimirCargaSeleccion);

  $("lista-pedidos").addEventListener("change", (e) => {
    if (e.target.classList.contains("pedido-check")) {
      const fila = e.target.closest(".pedido-fila");
      if (e.target.checked) pedidosSeleccion.add(fila.dataset.id);
      else pedidosSeleccion.delete(fila.dataset.id);
      return;
    }
    if (e.target.classList.contains("pedido-check-fecha")) {
      const grupo = e.target.closest(".pedido-grupo");
      const ids = [...grupo.querySelectorAll(".pedido-fila")].map((f) => f.dataset.id);
      ids.forEach((id) => (e.target.checked ? pedidosSeleccion.add(id) : pedidosSeleccion.delete(id)));
      grupo.querySelectorAll(".pedido-check").forEach((c) => (c.checked = e.target.checked));
    }
  });

  $("lista-pedidos").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-accion]");
    if (!btn) return;
    const pid = btn.closest(".pedido-fila").dataset.id;
    if (btn.dataset.accion === "guardar-nro") guardarNroCliente(pid);
    if (btn.dataset.accion === "ver-pedido") verPedido(pid);
    if (btn.dataset.accion === "zona") cambiarZonaPedido(pid, parseInt(btn.dataset.zona, 10));
  });

  $("btn-ver-pedido-cerrar").addEventListener("click", () => {
    $("modal-ver-pedido").hidden = true;
  });
  $("modal-ver-pedido").addEventListener("click", (e) => {
    if (e.target === $("modal-ver-pedido")) $("modal-ver-pedido").hidden = true;
  });

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
  Reparto.init({ toast });
  ClientesUI.init({ lista: $("lista-clientes"), busqueda: $("cliente-busqueda"), toast });

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
