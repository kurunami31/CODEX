import 'dotenv/config';

async function check() {
  const idx = await (await fetch('https://bsitcodex.vercel.app/index.html')).text();
  const main = idx.match(/index-[A-Za-z0-9_-]+\.js/)[0];
  const b = await (await fetch('https://bsitcodex.vercel.app/' + main)).text();
  
  // Search for the actual chunk files in the build output
  // Try to find the IdCardModal chunk by looking at the network
  const distIndex = await (await fetch('https://bsitcodex.vercel.app/index.html')).text();
  console.log('Main entry:', main);
  
  // Try to fetch the actual built files
  const possibleNames = [
    'IdCardModal', 'drawIdCard', 'id-card', 'idcard'
  ];
  
  for (const name of possibleNames) {
    // Try to find the chunk by searching in the main bundle
    const regex = new RegExp(name + '-[A-Za-z0-9_-]+\\.js');
    const match = b.match(regex);
    if (match) {
      console.log('Found:', match[0]);
      const chunk = await (await fetch('https://bsitcodex.vercel.app/assets/' + match[0])).text();
      console.log('  cbLogo:', chunk.includes('cbLogo'));
      console.log('  cb-logo.png:', chunk.includes('cb-logo.png'));
      console.log('  opacity:', chunk.includes('opacity'));
    }
  }
}

check();