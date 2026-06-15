module.exports = {
  apps: [
    {
      name: 'pos-jagad-api',
      script: 'dist/server.js',

      // ── Clustering ──────────────────────────────────────────────
      // 'max'  = pakai semua CPU core
      // angka  = jumlah instance spesifik (misal: 2, 4)
      instances: 'max',
      exec_mode: 'cluster',

      // ── Environment ─────────────────────────────────────────────
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // ── Memory & Restart ────────────────────────────────────────
      node_args: '--max-old-space-size=512',
      max_memory_restart: '400M',   // auto-restart jika RAM > 400MB per instance
      restart_delay: 3000,
      max_restarts: 10,

      // ── Logs ────────────────────────────────────────────────────
      output: './logs/pm2-out.log',
      error: './logs/pm2-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // ── Graceful Shutdown ────────────────────────────────────────
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,
    },
  ],
}
