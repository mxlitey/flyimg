import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 前端构建配置：产物输出到 dist/，由 Cloudflare Workers Assets 托管
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
})
