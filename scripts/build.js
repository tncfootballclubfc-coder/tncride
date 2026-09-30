import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('dist', {recursive:true});
copyFileSync('public/index.html','dist/index.html');
