import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
mkdirSync('dist', {recursive:true});
copyFileSync('public/index.html','dist/index.html');
// This browser key is public by design. Restrict it to Maps Embed API and your website.
const key = (process.env.GOOGLE_MAPS_EMBED_KEY || '').trim();
writeFileSync('dist/maps-config.js', 'window.TNC_MAPS_EMBED_KEY = ' + JSON.stringify(key) + ';\n');
