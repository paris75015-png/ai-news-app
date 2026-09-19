import { defineConfig } from 'vite';

export default defineConfig({
  // 相対パスでビルド → dist をどこに置いても（GitHub Pages 等のサブフォルダでも）動く
  base: './',
  server: {
    host: true,               // 同じWi-Fiのスマホからアクセス可能にする
    port: 5173,
    allowedHosts: ['.local'], // http://<Mac名>.local:5173 でのアクセスを許可
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: ['.local'],
  },
});
