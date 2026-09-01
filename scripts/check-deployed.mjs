async function check() {
  const r = await fetch('https://bsitcodex.vercel.app/');
  const t = await r.text();
  const scripts = [...t.matchAll(/src="\/assets\/([^"]+)"/g)].map(m => m[1]);
  console.log('Scripts:', scripts);
  for (const s of scripts) {
    const b = await (await fetch('https://bsitcodex.vercel.app/assets/' + s)).text();
    console.log(s, '- Has sidebar-collapse:', b.includes('sidebar-collapse'));
    console.log(s, '- Has About:', b.includes('About'));
    console.log(s, '- Has sidebar--collapsed:', b.includes('sidebar--collapsed'));
  }
}
check();
