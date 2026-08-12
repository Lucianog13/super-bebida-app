// Configuración Supabase — "El Super de la Bebida" (proyecto pedidos-super-bebida)
// La publishable key es pública por diseño; la seguridad la da RLS en la base.
// Proyecto: https://supabase.com/dashboard/project/unpgoljxrvfoabspxmfn
(function (root) {
  root.APP_CONFIG = {
    supabaseUrl: "https://unpgoljxrvfoabspxmfn.supabase.co",
    supabaseKey: "sb_publishable_NOgwon8sHYlq32Gf8mMsAg_JQRxknWo",
    // PIN del panel de administración (cambiarlo acá y volver a publicar la app)
    adminPin: "2026",
  };
})(typeof window !== "undefined" ? window : globalThis);
