// Checkout: datos del cliente + autocompletar por nombre/código + botón "Repetir último pedido".
// Solo toca el DOM; la lógica pura vive en js/core/.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.CheckoutUI = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  // Número fijo de la empresa: el pedido sale siempre a este WhatsApp (no editable).
  const TELEFONO_EMPRESA = "343 518-2883";

  function norm(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function init(opts) {
    const {
      form,
      nombreInput,
      direccionInput,
      nroClienteInput,
      aviso,
      btnRepetir,
      loadOrders,
      loadCliente,
      onGenerar,
      onRepetir,
      supabaseUrl,
      supabaseKey,
    } = opts;

    let ultimoPedido = null;

    // Pre-relleno con el último cliente usado
    const prev = loadCliente();
    if (prev) {
      nombreInput.value = prev.nombre || "";
      direccionInput.value = prev.direccion || "";
      if (nroClienteInput) nroClienteInput.value = prev.nroCliente || "";
    }

    function checkRepetir() {
      ultimoPedido = Order.findLastOrder(loadOrders(), nombreInput.value);
      aviso.hidden = !ultimoPedido;
    }

    // ── Autocompletar cliente por nombre / dirección / código ──
    let caja = null;
    let timer = null;

    function getCaja() {
      if (!caja) {
        caja = document.createElement("div");
        caja.className = "autocomplete-clientes";
        caja.hidden = true;
        (nombreInput.parentElement || nombreInput).appendChild(caja);
      }
      return caja;
    }

    function cerrar() {
      if (caja) caja.hidden = true;
    }

    async function buscar(q) {
      const nq = norm(q);
      if (nq.length < 2) { cerrar(); return; }
      const url =
        `${supabaseUrl}/rest/v1/clientes?select=codigo,nombre,direccion` +
        `&or=(nombre_norm.ilike.*${nq}*,direccion_norm.ilike.*${nq}*,codigo.ilike.*${nq}*)` +
        `&limit=8`;
      try {
        const res = await fetch(url, {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        });
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        const lista = Array.isArray(data) ? data : [];
        // Autocompletar solo: si hay UNA única coincidencia exacta de nombre → rellenar
        const exactos = lista.filter((c) => norm(c.nombre) === nq);
        if (exactos.length === 1) {
          const c = exactos[0];
          nombreInput.value = c.nombre;
          if (nroClienteInput) nroClienteInput.value = c.codigo;
          if (direccionInput && !direccionInput.value && c.direccion) {
            direccionInput.value = c.direccion;
          }
          cerrar();
          checkRepetir();
          return;
        }
        pintar(lista);
      } catch (e) {
        cerrar();
      }
    }

    function pintar(lista) {
      const box = getCaja();
      if (!lista.length) { cerrar(); return; }
      box.innerHTML = lista.map((c) => {
        const nombre = c.nombre || c.direccion || "(sin nombre)";
        const dir = c.direccion && c.nombre ? ` · ${c.direccion}` : "";
        return (
          `<button type="button" class="sugerencia" data-codigo="${esc(c.codigo)}" ` +
          `data-nombre="${esc(nombre)}" data-direccion="${esc(c.direccion || "")}">` +
          `<span class="sug-nombre">${esc(nombre)}</span>` +
          (dir ? `<span class="sug-dir">${esc(dir)}</span>` : "") +
          `<span class="sug-nro">N° ${esc(c.codigo)}</span>` +
          `</button>`
        );
      }).join("");
      box.hidden = false;
      box.querySelectorAll(".sugerencia").forEach((btn) => {
        btn.addEventListener("click", () => {
          nombreInput.value = btn.dataset.nombre;
          if (nroClienteInput) nroClienteInput.value = btn.dataset.codigo;
          if (direccionInput && !direccionInput.value && btn.dataset.direccion) {
            direccionInput.value = btn.dataset.direccion;
          }
          cerrar();
          checkRepetir();
        });
      });
    }

    nombreInput.addEventListener("input", () => {
      checkRepetir();
      clearTimeout(timer);
      const q = nombreInput.value.trim();
      if (!q) { cerrar(); return; }
      timer = setTimeout(() => buscar(q), 250);
    });

    document.addEventListener("click", (e) => {
      if (caja && !caja.hidden && !caja.contains(e.target) && e.target !== nombreInput) {
        cerrar();
      }
    });

    btnRepetir.addEventListener("click", () => {
      if (!ultimoPedido) return;
      onRepetir(ultimoPedido.items);
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      onGenerar({
        nombre: nombreInput.value.trim(),
        telefono: TELEFONO_EMPRESA,
        direccion: direccionInput.value.trim(),
        nroCliente: (nroClienteInput ? nroClienteInput.value.trim() : "") || "",
      });
    });

    checkRepetir();
  }

  return { init };
});
