async function check() {
  try {
    const r = await fetch('https://bsitcodex.vercel.app/assets/index-DPK_QKel.js');
    const t = await r.text();
    console.log('Has About:', t.includes('About'));
    console.log('Has About-DBwdUiIC:', t.includes('About-DBwdUiIC'));
    console.log('Has sidebar-collapse:', t.includes('sidebar-collapse'));
    console.log('Has toggleCollapse:', t.includes('toggleCollapse'));
    console.log('Has collapsed:', t.includes('collapsed'));
    console.log('Has about:', t.includes('about'));
    console.log('Length:', t.length);
  } catch(e) {
    console.log('Error:', e.message);
  }
}
check();