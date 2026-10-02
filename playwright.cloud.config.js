import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',testMatch:'cloud-*.spec.js',timeout:60000,workers:1,retries:0,
  use:{...devices['Pixel 7'],baseURL:'http://127.0.0.1:4174',trace:'retain-on-failure'},
  webServer:[
    {command:'node integration/supabaseHarnessServer.js',url:'http://127.0.0.1:54329/health',reuseExistingServer:false},
    {command:'npm run dev -- --port 4174',url:'http://127.0.0.1:4174',reuseExistingServer:false,
      env:{VITE_BOPLI_MODE:'cloud',VITE_SUPABASE_URL:'http://127.0.0.1:54329',VITE_SUPABASE_PUBLISHABLE_KEY:'local-public-key'}},
  ]
});
