import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',testMatch:'cloud-*.spec.js',timeout:60000,workers:1,retries:0,
  use:{...devices['Pixel 7'],baseURL:'http://127.0.0.1:4174',trace:'retain-on-failure'},
  webServer:{command:'npm run dev -- --port 4174',url:'http://127.0.0.1:4174',reuseExistingServer:false,
    env:{VITE_BOPLI_MODE:'cloud',VITE_FIREBASE_EMULATORS:'true',VITE_FIREBASE_PROJECT_ID:'demo-bopli',VITE_FIREBASE_API_KEY:'demo-key',VITE_FIREBASE_APP_ID:'demo-app',VITE_FIREBASE_AUTH_DOMAIN:'demo-bopli.firebaseapp.com'}}
});
