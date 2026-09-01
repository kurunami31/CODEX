async function check() {
  const r = await fetch('https://bsitcodex.vercel.app/');
  const t = await r.text();

  // Find all script chunks
  const scripts = [...t.matchAll(/src="\/assets\/([^"]+\.js)"/g)].map(m => m[1]);
  console.log('Scripts found:', scripts.length);
  scripts.forEach(s => console.log(' -', s));

  // Check main bundle
  const mainBundle = scripts.find(s => s.startsWith('index-'));
  if (mainBundle) {
    const b = await (await fetch('https://bsitcodex.vercel.app/assets/' + mainBundle)).text();
    console.log('\nMain bundle:', mainBundle);
    console.log('Has formatTime:', b.includes('formatTime'));
    console.log('Has time_in_am:', b.includes('time_in_am'));
  }

  // Check for EventDetail chunk
  const edChunk = scripts.find(s => s.startsWith('EventDetail-'));
  if (edChunk) {
    const b = await (await fetch('https://bsitcodex.vercel.app/assets/' + edChunk)).text();
    console.log('\nEventDetail chunk:', edChunk);
    console.log('Has time_in_am:', b.includes('time_in_am'));
    console.log('Has year_level:', b.includes('year_level'));
    console.log('Has formatTime:', b.includes('formatTime'));
    console.log('Has scanned_by_profile:', b.includes('scanned_by_profile'));
  } else {
    console.log('\nEventDetail chunk not found (may be in main bundle)');
  }
}
check();