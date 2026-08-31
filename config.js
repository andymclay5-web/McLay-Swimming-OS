window.MCLAY_CONFIG = {
  supabaseUrl: "https://cwoqjxiniuwmslltsfgi.supabase.co",
  supabaseAnonKey: "sb_publishable_hIbrRMsL9OYXY02zD1esLQ_sNpwAmDU",
  appName: "McLay Swimming OS",
  mediaBucket: "swimming-media"
};
// Load the operational live-state authority before app boot. The authority waits
// for MSOS4.live and installs at DOMContentLoaded before app.js boot runs.
document.write('<script src="engines/live-training-authority.js?v=20260901a" defer><\/script>');
