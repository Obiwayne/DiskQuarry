// Renders scripts/icon.svg to a 1024px PNG for `tauri icon`.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng();
writeFileSync(new URL('./icon.png', import.meta.url), png);
console.log('scripts/icon.png written');
