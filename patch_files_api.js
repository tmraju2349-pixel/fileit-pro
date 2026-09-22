const fs = require('fs');
const filePath = 'artifacts/api-server/src/routes/files.ts';
let code = fs.readFileSync(filePath, 'utf8');

const starRoute = `
// ── PUT /api/files/:id/star ────────────────────────────────────────────────
router.put("/files/:id/star", async (req, res) => {
  const idParsed = GetFileParams.safeParse(req.params);
  if (!idParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, idParsed.data.id));
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  const [updated] = await db
    .update(filesTable)
    .set({ isStarred: !file.isStarred })
    .where(eq(filesTable.id, idParsed.data.id))
    .returning();
  res.json(formatFile(updated));
});
`;

code = code.replace(
  '// ── PUT /api/files/:id/move',
  starRoute + '\n// ── PUT /api/files/:id/move'
);

// Fix the download route to check password from query
code = code.replace(
  'const token = req.params.token;',
  `const token = req.params.token;
  const password = req.query.password as string | undefined;`
);

code = code.replace(
  'const archive = new ZipArchive({ zlib: { level: 6 } });',
  `if (shared.folder.password && shared.folder.password !== password) {
    res.status(401).json({ error: "Password required" });
    return;
  }
  const archive = new ZipArchive({ zlib: { level: 6 } });`
);

fs.writeFileSync(filePath, code);
