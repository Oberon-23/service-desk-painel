import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Os cabeçalhos de segurança da Vercel valem também no `vite preview`, para os testes pegarem bloqueios da CSP.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
const prodHeaders = Object.fromEntries((vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? []).map((h) => [h.key, h.value]));

export default defineConfig({
  plugins: [react()],
  preview: { headers: prodHeaders },
  build: {
    rollupOptions: {
      output: {
        // bibliotecas em pacotes separados: mudam pouco e ficam no cache do navegador entre os deploys
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'react';
          if (id.includes('node_modules/lucide-react')) return 'icones';
        },
      },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
