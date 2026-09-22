const fs = require('fs');
const filePath = 'artifacts/fileit/src/pages/folder-share.tsx';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
  'link.href = `/api/folders/share/${token}/download`;',
  'link.href = `/api/folders/share/${token}/download${password ? `?password=${encodeURIComponent(password)}` : ""}`;'
);

fs.writeFileSync(filePath, code);
