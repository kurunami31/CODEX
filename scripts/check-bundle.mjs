async function check() {
  const r = await fetch('https://bsitcodex.vercel.app/');
  const t = await r.text();
  const m = t.match(/src="\/assets\/([^"]+)"/);
  console.log('Bundle:', m ? m[1] : 'not found');
}
check();