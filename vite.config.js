import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 設定 GitHub Pages 的儲存庫名稱作為基礎路徑
  base: '/202605292/',
})
