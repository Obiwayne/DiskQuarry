// Builds ui/catalog.json from the RepoQuarry catalogue so DiskQuarry can
// suggest open-source alternatives for paid apps it finds installed.
//
//   node scripts/build-catalog.mjs [path-to-RepoQuarry/data]
//
// Defaults to ../RepoQuarry/data, or REPOQUARRY_DATA when set.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

const dataDir = resolve(process.argv[2] ?? process.env.REPOQUARRY_DATA ?? '../RepoQuarry/data');

// Paid products that ship a Windows desktop app, and the installed-program names
// (Settings > Apps) that identify them. Products with no desktop app are left out:
// there is nothing on the drive to find.
const DESKTOP = {
  '1password': ['^1Password\\b'],
  'adobe-creative-cloud': [
    '^Adobe (Creative Cloud|Creative Suite|Photoshop|Illustrator|Lightroom|Premiere Pro|After Effects|InDesign|Acrobat|Audition|Animate|Media Encoder|Substance)',
  ],
  'box': ['^Box( Drive| Tools| Edit)?$'],
  'canva': ['^Canva\\b'],
  'chatgpt-plus': ['^ChatGPT\\b'],
  'clickup': ['^ClickUp\\b'],
  'dashlane': ['^Dashlane\\b'],
  'descript': ['^Descript\\b'],
  'dropbox': ['^Dropbox$', '^Dropbox (?!Sign|Redeem)'],
  'evernote': ['^Evernote\\b'],
  'figma': ['^Figma\\b'],
  'grammarly': ['^Grammarly\\b'],
  'granola': ['^Granola\\b'],
  'ida-pro': ['^IDA (Pro|Home|Freeware|Free)\\b'],
  'keeper': ['^Keeper (Password Manager|Desktop)\\b'],
  'lastpass': ['^LastPass\\b'],
  'linear': ['^Linear$'],
  'loom': ['^Loom\\b'],
  'microsoft-365': ['^Microsoft (365|Office)\\b', '^Microsoft (Word|Excel|PowerPoint|Outlook)\\b'],
  'miro': ['^Miro\\b'],
  'nordpass': ['^NordPass\\b'],
  'notion': ['^Notion\\b'],
  'perplexity-pro': ['^Perplexity\\b'],
  'quickbooks': ['^QuickBooks\\b'],
  'slack': ['^Slack\\b'],
  'todoist': ['^Todoist\\b'],
  'topaz-gigapixel': ['^Topaz Gigapixel'],
  'trello': ['^Trello$'],
  'zoom': ['^Zoom( Workplace)?\\b'],
};

const readYaml = (dir) =>
  readdirSync(join(dataDir, dir))
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => parse(readFileSync(join(dataDir, dir, f), 'utf8')));

const products = readYaml('products');
const projects = readYaml('projects');
const metrics = JSON.parse(readFileSync(join(dataDir, 'metrics.json'), 'utf8'));

const out = { generated_at: new Date().toISOString().slice(0, 10), source: 'https://repoquarry.dev', products: [] };

for (const [id, patterns] of Object.entries(DESKTOP)) {
  const p = products.find((x) => x.id === id);
  if (!p) {
    console.warn(`! ${id} is not in the RepoQuarry catalogue, skipped`);
    continue;
  }
  const alternatives = projects
    .flatMap((proj) =>
      (proj.alternatives ?? [])
        .filter((a) => a.product === id)
        .map((a) => ({
          id: proj.id,
          name: proj.name,
          repo: proj.repo,
          description: proj.description ?? '',
          coverage: a.coverage ?? 'unknown',
          note: a.note ?? '',
          license: proj.facts?.code_license?.spdx ?? proj.facts?.code_license?.value ?? 'unknown',
          stars: metrics[proj.id]?.stars ?? null,
        })),
    )
    .sort((a, b) => (a.coverage === b.coverage ? (b.stars ?? 0) - (a.stars ?? 0) : a.coverage === 'full' ? -1 : 1));
  if (!alternatives.length) continue;
  out.products.push({
    id,
    name: p.name,
    category: p.category,
    pricing: p.pricing,
    summary: p.summary,
    patterns,
    alternatives,
  });
}

writeFileSync(new URL('../ui/catalog.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`ui/catalog.json: ${out.products.length} products, ${out.products.reduce((n, p) => n + p.alternatives.length, 0)} alternatives`);
