async function check() {
  const r = await fetch('https://bsitcodex.vercel.app/');
  const t = await r.text();
  const m = t.match(/src="\/assets\/([^"]+)"/);
  if (m) {
    const b = await (await fetch('https://bsitcodex.vercel.app/' + m[1])).text();
    console.log('Bundle:', m[1]);
    console.log('Is JS:', !b.startsWith('<!doctype'));
    console.log('Has React:', b.includes('React'));
    console.log('Has EditEventModal:', b.includes('EditEventModal'));
  } else {
    console.log('No bundle found');
  }
}
check();