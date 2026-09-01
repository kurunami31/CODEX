async function check() {
  try {
    const r = await fetch('https://bsitcodex.vercel.app/');
    const t = await r.text();
    const m = [...t.matchAll(/src="\/assets\/([^"]+)"/g)].map(x => x[1]);
    console.log('Assets:', m);
    for (const a of m) {
      try {
        const res = await fetch('https://bsitcodex.vercel.app/assets/' + a);
        const content = await res.text();
        const name = a.includes('index-') ? 'main bundle' : a.includes('About') ? 'About' : a.includes('EventDetail') ? 'EventDetail' : a.includes('AppShell') ? 'AppShell' : a;
        console.log(name + ': ' + a + ' (' + content.length + ' bytes)');
      } catch(e) {
        console.log(a + ': FETCH ERROR - ' + e.message);
      }
    }
  } catch(e) {
    console.log('Error:', e.message);
  }
}
check();