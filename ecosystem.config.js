module.exports = {
  apps: [
    {
      name: 'autolight',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
