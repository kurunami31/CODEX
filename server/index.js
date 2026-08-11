import 'dotenv/config';
import app from '../api/index.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[CODEX API] listening on http://localhost:${PORT}`);
});
