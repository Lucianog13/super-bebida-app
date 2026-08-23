// Checkout: datos del cliente + botón "Repetir último pedido" (Pedido Fácil, estilo BEES).
// Solo toca el DOM; la lógica pura vive en js/core/.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.CheckoutUI = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  function init(opts) {
    const {
      form,
      nombreInput,
      telefonoInput,
      direccionInput,
      nroClienteInput,
      aviso,
      btnRepetir,
      loadOrders,
      loadCliente,
      onGenerar,
      onRepetir,
    } = opts;

    let ultimoPedido = null;

    // Pre-relleno con el último cliente usado
    const prev = loadCliente();
    if (prev) {
      nombreInput.value = prev.nombre || "";
      telefonoInput.value = prev.telefono || "";
      direccionInput.value = prev.direccion || "";
      if (nroClienteInput) nroClienteInput.value = prev.nroCliente || "";
    }

    function checkRepetir() {
      ultimoPedido = Order.findLastOrder(loadOrders(), nombreInput.value);
      aviso.hidden = !ultimoPedido;
    }

    nombreInput.addEventListener("input", checkRepetir);
    checkRepetir();

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
        telefono: telefonoInput.value.trim(),
        direccion: direccionInput.value.trim(),
        nroCliente: (nroClienteInput ? nroClienteInput.value.trim() : "") || "",
      });
    });
  }

  return { init };
});
