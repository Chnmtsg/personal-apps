import { defineConfig } from 'vite';

export default defineConfig({
  // Relative, so the built app runs from any path - a project page, a
  // subfolder, or straight off a phone's home screen - without a rebuild.
  base: './',
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5180 },
});
