import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// casper-js-sdk expects Node globals (Buffer/process) in some paths.
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  // Dev-only proxy so the browser can read CSPR.cloud without CORS.
  // In dev, casper.ts calls /cspr-testnet/* and Vite forwards it server-side.
  server: {
    proxy: {
      '/cspr-testnet': {
        target: 'https://api.testnet.cspr.cloud',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/cspr-testnet/, ''),
      },
      '/cspr-mainnet': {
        target: 'https://api.cspr.cloud',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/cspr-mainnet/, ''),
      },
      // Casper JSON-RPC nodes also block direct browser calls (CORS) — proxy them.
      // Public Casper Association nodes (no auth):
      '/rpc-testnet': {
        target: 'https://node.testnet.casper.network',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/rpc-testnet/, ''),
      },
      '/rpc-mainnet': {
        target: 'https://node.mainnet.casper.network',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/rpc-mainnet/, ''),
      },
      // CSPR.cloud node RPC (needs the Authorization header — added by tx.ts):
      '/csprnode-testnet': {
        target: 'https://node.testnet.cspr.cloud',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/csprnode-testnet/, ''),
      },
      '/csprnode-mainnet': {
        target: 'https://node.mainnet.cspr.cloud',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/csprnode-mainnet/, ''),
      },
    },
  },
})
