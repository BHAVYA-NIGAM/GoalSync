module.exports = {
  apps: [
    {
      name: "goalsync-portal",
      script: "./server/server.js",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 5000
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      merge_logs: true,
      max_restarts: 10,
      min_uptime: 5000
    }
  ]
};
