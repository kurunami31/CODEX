import 'dotenv/config';

async function check() {
  const idx = await (await fetch('https://bsitcodex.vercel.app/index.html')).text();
  const main = idx.match(/index-[A-Za-z0-9_-]+\.js/)[0];
  const b = await (await fetch('https://bsitcodex.vercel.app/' + main)).text();
  
  // Find all chunk references
  const chunkMatches = b.match(/"([^"]*\.js)"/g) || [];
  const idCardChunks = chunkMatches
    .map(m => m.slice(1, -1))
    .filter(c => c.includes('IdCardModal') || c.includes('drawIdCard'));
  
  console.log('IdCard/drawIdCard chunks:', idCardChunks);
  
  for (const c of idCardChunks) {
    try {
      const x = await (await fetch('https://bsitcodex.vercel.app/assets/' + c)).text();
      console.log(`\nChunk: ${c}`);
      console.log('  has cbLogo import:', x.includes('cbLogo'));
      console.log('  has cb-logo.png:', x.includes('cb-logo.png'));
      console.log('  has opacity style:', x.includes('opacity'));
    } catch (e) {
      console.log(`  Failed to fetch ${c}:`, e.message);
    }
  }
}

check();