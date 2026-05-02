// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  future: {
    compatibilityVersion: 4,
  },
  devtools: { enabled: true },
  ssr: true,
  typescript: {
    strict: true,
    typeCheck: false,
  },
  runtimeConfig: {
    // Default API base assumes a local `wrangler dev` on port 8787. For a
    // deployed build, override at build/runtime via `NUXT_PUBLIC_API_BASE`,
    // e.g. by creating `apps/web/.env` with:
    //   NUXT_PUBLIC_API_BASE=https://your-worker.example.workers.dev
    public: {
      apiBase: 'http://localhost:8787',
    },
  },
  app: {
    head: {
      title: 'Earth',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Real-time 3D Earth visualization with surrounding asteroids, satellites, the ISS, plus active hurricanes and earthquakes.',
        },
        { name: 'theme-color', content: '#000010' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
      htmlAttrs: { lang: 'en' },
    },
  },
  css: ['~/assets/css/global.css'],
  vite: {
    optimizeDeps: {
      include: ['three', 'satellite.js', 'astronomy-engine'],
    },
  },
})
