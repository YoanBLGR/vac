import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 650
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "images/albanian-riviera.webp",
        "images/earth-clouds.png",
        "images/earth-day-nasa.webp",
        "images/earth-normal.jpg",
        "images/earth-specular.jpg",
        "images/earth-night-nasa.jpg",
        "images/locked-dreamscape-v1.webp",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-maskable.png"
      ],
      manifest: {
        name: "Notre échappée",
        short_name: "Échappée",
        description: "Une surprise à découvrir, le moment venu.",
        theme_color: "#102f38",
        background_color: "#f4efe4",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        lang: "fr",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/icons/icon-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,jpg,png,webp,svg,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true
      }
    })
  ]
});
