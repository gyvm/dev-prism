// Tailwind v4 + daisyUI via PostCSS (not @tailwindcss/vite, which breaks on
// Astro 6's rolldown-vite — see astro.config.mjs / withastro/astro#16542).
// Astro resolves this from the project root (src/web, set via `astro --root`).
export default { plugins: { "@tailwindcss/postcss": {} } };
