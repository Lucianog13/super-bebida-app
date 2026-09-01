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

  const VISTAS = ["vista-catalogo", "vista-carrito", "vista-checkout", "vista-pedido", "vista-admin"];

  function showVista(id) {
    VISTAS.forEach((v) => ($(v).hidden = v !== id));
    if (id === "vista-carrito") {
      CartUI.render($("items-carrito"), $("total-carrito"), carrito, cartHandlers);
      actualizarBotonConfirmar();
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
    };
  }

  // Overlay de sabores (js/data/sabores.js): nombres limpios, listas de sabores
  // y entradas absorbidas por una familia. Idempotente: se aplica sobre nube,
  // caché y archivo local para que la vista de clientes sea siempre la misma.
  function aplicarOverlay(productos) {
    const ov = window.SABORES_OVERLAY;
    if (!ov || !Array.isArray(productos)) return productos;
    const ocultos = new Set(ov.ocultar || []);
    return productos
      .filter((p) => !ocultos.has(p.id))
      .map((p) => {
        const fam = (ov.familias || {})[p.id];
        if (!fam) return p;
        return { ...p, nombre: fam.nombre, sabores: fam.sabores };
      });
  }

  async function cargarCatalogo() {
    if (!CFG) {
      updateEstado("Modo local");
      return aplicarOverlay(window.PRODUCTS);
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
        if (c && Array.isArray(c.productos) && c.productos.length) {
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
      esAdmin: () => !!Auth.getSession(),
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
        seleccion.forEach(({ sabor, cantidad }) => {
          carrito = Cart.addItem(carrito, producto, cantidad, sabor);
        });
        Storage.saveCart(carrito);
        updateContador();
        const unidades = seleccion.reduce((s, x) => s + x.cantidad, 0);
        toast(`${unidades} unidad${unidades === 1 ? "" : "es"} de "${producto.nombre}" agregada${unidades === 1 ? "" : "s"} al pedido`);
      },
      async onToggleSaborStock(producto, sabor) {
        const t = await Auth.token();
        if (!t) {
          toast("Sesión vencida — cerrá sesión y volvé a entrar", "error");
          return false;
        }
        const actual = Array.isArray(producto.sabores_sin_stock) ? producto.sabores_sin_stock : [];
        const nuevo = actual.includes(sabor) ? actual.filter((x) => x !== sabor) : actual.concat(sabor);
        const res = await fetch(`${CFG.supabaseUrl}/rest/v1/productos?id=eq.${encodeURIComponent(producto.id)}`, {
          method: "PATCH",
          headers: {
            apikey: CFG.supabaseKey,
            Authorization: "Bearer " + t,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ sabores_sin_stock: nuevo }),
        });
        if (!res.ok) {
          toast("No se pudo actualizar el stock del sabor", "error");
          return false;
        }
        producto.sabores_sin_stock = nuevo;
        return true;
      },
    });
  }

  // ── Checkout ──
  CheckoutUI.init({
    form: $("form-cliente"),
    nombreInput: $("cliente-nombre"),
    telefonoInput: $("cliente-telefono"),
    direccionInput: $("cliente-direccion"),
    nroClienteInput: $("cliente-nro"),
    aviso: $("aviso-repetir"),
    btnRepetir: $("btn-repetir"),
    loadOrders: Storage.loadOrders,
    loadCliente: Storage.loadCliente,
    supabaseUrl: CFG.supabaseUrl,
    supabaseKey: CFG.supabaseKey,
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
  $("btn-imprimir").addEventListener("click", () => {
    if (pedidoActual) imprimirRemitos([pedidoActual]);
  });

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

  // ── Pedidos (vista admin: agrupar por fecha, seleccionar e imprimir) ──
  let pedidosNube = [];
  const pedidosSeleccion = new Set();

  function fechaClave(fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric" }).format(d);
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
    return `
    <div class="pedido-fila" data-id="${p.id}">
      <input type="checkbox" class="pedido-check" ${pedidosSeleccion.has(p.id) ? "checked" : ""}>
      <div class="pedido-cuerpo">
        <div class="pedido-cliente">
          <strong>${c.nombre || "—"}</strong>
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
  }

  function renderPedidos() {
    const el = $("lista-pedidos");
    if (!pedidosNube.length) {
      el.innerHTML = '<p class="carrito-vacio">Todavía no hay pedidos registrados.</p>';
      return;
    }
    el.innerHTML = agruparPorFecha(pedidosNube).map(grupoHTML).join("");
  }

  function pedidosMarcados() {
    return pedidosNube.filter((p) => pedidosSeleccion.has(p.id));
  }

  function imprimirRemitos(pedidos) {
    if (!pedidos || !pedidos.length) {
      toast("No hay pedidos para imprimir");
      return;
    }
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

  /** Muestra el remito completo del pedido en un modal (sin imprimir). */
  function verPedido(pid) {
    const p = pedidosNube.find((x) => x.id === pid);
    if (!p) return;
    $("ver-pedido-contenido").innerHTML = `<div class="pedido-hoja">${remitoHTML(p)}</div>`;
    $("modal-ver-pedido").hidden = false;
  }

  // ── Pestañas del admin (Productos | Pedidos) ──
  function mostrarPanelAdmin(panel) {
    $("panel-productos").hidden = panel !== "productos";
    $("panel-pedidos").hidden = panel !== "pedidos";
    $("panel-reparto").hidden = panel !== "reparto";
    $("tab-productos").classList.toggle("active", panel === "productos");
    $("tab-pedidos").classList.toggle("active", panel === "pedidos");
    $("tab-reparto").classList.toggle("active", panel === "reparto");
    if (panel === "pedidos") cargarPedidos();
    if (panel === "reparto") Reparto.cargar();
  }

  $("tab-productos").addEventListener("click", () => mostrarPanelAdmin("productos"));
  $("tab-pedidos").addEventListener("click", () => mostrarPanelAdmin("pedidos"));
  $("tab-reparto").addEventListener("click", () => mostrarPanelAdmin("reparto"));
  $("btn-imprimir-seleccion").addEventListener("click", () => imprimirRemitos(pedidosMarcados()));
  $("btn-imprimir-todo").addEventListener("click", () => imprimirRemitos(pedidosNube));
  $("btn-recargar-pedidos").addEventListener("click", cargarPedidos);

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
