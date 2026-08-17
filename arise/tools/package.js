/* Assemble exactly what ships, and refuse to ship anything else.
   Run: node tools/package.js   →   dist/

   This is a *packaging* step, not a build step, and the difference is the whole
   point. Every file is copied byte for byte: nothing is bundled, minified,
   inlined or transformed, so `dist/index.html` is the same shell the browser
   gets from `serve.cmd` and the same one both suites load `js/` beside. The app
   still has no build step — `arise/` is servable as-is, and always must be.

   It exists because the publish directory is a whole folder. Pointing a host at
   `arise/` uploads `tools/`, `knowledge/`, `CLAUDE.md` and the rest of the
   development scaffolding, which CLAUDE.md says must not be uploaded. Listing
   what ships is the only way to be sure, and a list a machine checks beats a
   list a person is asked to remember.

   It also runs the two checks CLAUDE.md asks a human to do before uploading:
   every asset named in `sw.js` ASSETS really exists in what is being shipped,
   and `index.html` is still a shell rather than a self-extracting bundle. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/* The runtime set, and nothing else. Adding a file to the app means adding it
   here too — the sw.js ASSETS check below is what catches forgetting. */
const SHIP = [
  'index.html',
  'styles.css',
  'sw.js',
  'manifest.webmanifest',
  '_headers',
  'js',
  'icons',
  'fonts'
];

/* Never shipped, even if one is ever added to SHIP by accident. Development
   scaffolding on a public URL is not a secret leak — this app has no secrets —
   but it is still every reviewer's notes served to the world. */
const NEVER = new Set(['tools', 'knowledge', '.claude', 'node_modules', 'dist']);

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src).sort()) {
      if (NEVER.has(name)) throw new Error(`refusing to ship ${name}`);
      copy(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.copyFileSync(src, dest);
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const shipped = [];
  for (const name of SHIP) {
    const src = path.join(ROOT, name);
    if (!fs.existsSync(src)) {
      console.error(`  MISSING  ${name} — it is in SHIP but not on disk`);
      process.exitCode = 1;
      continue;
    }
    copy(src, path.join(DIST, name));
    shipped.push(name);
  }

  /* CLAUDE.md: "check every asset in sw.js ASSETS exists in the folder being
     shipped — a missing precache entry makes cache.add fail silently for that
     one file, and the app still installs." Silently is the problem; the app
     works until the user goes offline, which is the one moment it must not. */
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const block = sw.slice(sw.indexOf('const ASSETS = ['), sw.indexOf('];'));
  const assets = (block.match(/'\.\/[^']*'/g) || []).map((s) => s.slice(3, -1));
  const missing = assets.filter((a) => a && !fs.existsSync(path.join(DIST, a)));

  const version = (sw.match(/const VERSION = '([^']+)'/) || [])[1];

  /* The 440KB self-extracting bundle that once replaced index.html served js/
     from blob: URLs built from a stale snapshot, and both suites stayed green
     because they load js/ from disk. Shipping is the one place that can notice. */
  const shell = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const inlined = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(shell);
  const scripts = (shell.match(/<script src="\.\/js\/[^"]+"><\/script>/g) || [])
    .map((m) => m.replace(/.*js\//, '').replace(/".*/, ''));
  /* Counted against sw.js rather than against a number written here — a literal
     6 failed the moment run.js landed, which is a check reporting its own
     staleness rather than a problem. This is the pair that can disagree without
     either suite noticing: a file the shell loads but the worker never
     precaches works perfectly online and vanishes the first time offline. */
  const swScripts = assets.filter((a) => a.startsWith('js/')).map((a) => a.slice(3));

  /* The no-network invariant, enforced by the browser rather than by review.
     It lived in `_headers` until the app moved to GitHub Pages, which ignores
     that file — so it is a meta tag now, and a meta tag is one careless edit
     from being gone with nothing failing. Nothing else would notice: the app
     works perfectly without a policy, right up until something starts making
     requests it should not.

     Each directive below is checked because each one is load-bearing.
     `img-src data:` carries the exercise pictures and `style-src
     'unsafe-inline'` carries the style attributes; dropping either breaks a
     working screen, so a policy that has quietly lost one must not ship. */
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(shell);
  const cspNeeds = ["default-src 'self'", "script-src 'self'", "img-src 'self' data:",
                    "font-src 'self'", "style-src 'self' 'unsafe-inline'", "object-src 'none'"];
  const cspMissing = csp ? cspNeeds.filter((d) => csp[1].indexOf(d) < 0) : cspNeeds;
  /* Above the first thing it governs, or it governs nothing. */
  const cspLate = csp && shell.indexOf(csp[0]) > shell.search(/<link[^>]+href/);

  console.log(`\n  ${shipped.join(', ')}`);
  console.log(`  service worker  ${version}`);
  console.log(`  index.html      ${(shell.length / 1024).toFixed(1)} KB, ${scripts.length} scripts linked`);

  let bad = 0;
  if (missing.length) {
    console.log(`\n  FAIL  sw.js precaches files that are not being shipped: ${missing.join(', ')}`);
    bad++;
  }
  if (inlined) {
    console.log('\n  FAIL  index.html carries an inline script — it must stay a shell');
    bad++;
  }
  if (!csp) {
    console.log("\n  FAIL  index.html has no Content-Security-Policy meta tag — the app's" +
                '\n        no-network invariant would ship unenforced');
    bad++;
  } else if (cspMissing.length) {
    console.log(`\n  FAIL  the Content-Security-Policy has lost: ${cspMissing.join('; ')}`);
    bad++;
  } else if (cspLate) {
    console.log('\n  FAIL  the Content-Security-Policy meta tag sits below a <link> it should' +
                '\n        govern; a policy declared after a resource does not apply to it');
    bad++;
  }
  const onlyShell = scripts.filter((f) => !swScripts.includes(f));
  const onlyWorker = swScripts.filter((f) => !scripts.includes(f));
  if (onlyShell.length || onlyWorker.length) {
    console.log('\n  FAIL  index.html and sw.js disagree about js/:' +
      (onlyShell.length ? ` loaded but not precached: ${onlyShell.join(', ')}` : '') +
      (onlyWorker.length ? ` precached but not loaded: ${onlyWorker.join(', ')}` : ''));
    bad++;
  }
  if (!scripts.length) {
    console.log('\n  FAIL  index.html links no js/ files at all');
    bad++;
  }
  if (!version) {
    console.log('\n  FAIL  sw.js has no VERSION to bust the old cache with');
    bad++;
  }

  console.log(bad ? `\n  ${bad} problem(s) — not safe to publish\n` : '\n  ready to publish: dist/\n');
  process.exitCode = bad ? 1 : process.exitCode || 0;
}

main();
