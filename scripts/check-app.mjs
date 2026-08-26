const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function check() {
  const r = await fetch('https://bsitcodex.vercel.app/');
  const t = await r.text();
  console.log('Title:', t.match(/<title>([^<]+)<\/title>/)?.[1]);
  console.log('Has root div:', t.includes('<div id="root"></div>'));
  console.log('Has module script:', t.includes('<script type="module"'));
}
check();