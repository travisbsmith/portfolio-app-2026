// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  site: 'https://app.fully-operational.com',
  security: {
    checkOrigin: false, // allow cross-origin POST from fully-operational.com/book
  },
});
