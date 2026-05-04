import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const base = env.BASE_PATH ?? '/kids-study/';
  return {
    base,
    plugins: [preact()],
    build: {
      target: 'es2022',
      emptyOutDir: true,
    },
    server: {
      host: true,
      port: 5173,
    },
  };
});
