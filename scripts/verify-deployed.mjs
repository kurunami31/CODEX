async function check() {
  const r = await fetch('https://bsitcodex.vercel.app/');
  const t = await r.text();
  const m = t.match(/src="\/assets\/([^"]+)"/);
  if (m) {
    const b = await (await fetch('https://bsitcodex.vercel.app/' + m[1])).text();
    console.log('Bundle:', m[1]);
    console.log('Has EventDetail:', b.includes('EventDetail'));
    console.log('Has formatTime:', b.includes('formatTime'));
    console.log('Has time_in_am:', b.includes('time_in_am'));
  } else {
    console.log('No bundle found');
  }
}
check();