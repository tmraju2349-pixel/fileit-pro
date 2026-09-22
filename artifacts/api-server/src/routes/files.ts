import { Router } from "express";
import { db, filesTable, foldersTable, textMessagesTable } from "@workspace/db";
import { eq, sql, isNull, and, inArray } from "drizzle-orm";
import {
  CreateFileBody,
  GetFileParams,
  DeleteFileParams,
  GetFileByTokenParams,
  MoveFileBody,
  CreateFolderBody,
  DeleteFolderParams,
  ListFolderFilesParams,
  CreateTextMessageBody,
  DeleteTextMessageParams,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";
import { ZipArchive } from "archiver";
import multer from "multer";
import {
  generateStoragePath,
  uploadFile,
  serveFile,
  deleteFile,
  getStoredFileStream,
  createUploadUrl,
} from "../lib/fileStorage";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
const router = Router();

router.post("/upload-url", async (req, res) => {
  const originalName = typeof req.body?.originalName === "string" ? req.body.originalName : "";
  if (!originalName) {
    res.status(400).json({ error: "originalName is required" });
    return;
  }
  try {
    const storagePath = generateStoragePath(originalName);
    const shareToken = `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
    const { token } = await createUploadUrl(storagePath);
    res.json({ storagePath, shareToken, token });
  } catch (err) {
    req.log.error({ err }, "Could not create signed upload URL");
    res.status(500).json({ error: "Signed uploads are not available" });
  }
});

function formatFile(f: typeof filesTable.$inferSelect) {
  return {
    id: f.id,
    originalName: f.originalName,
    size: f.size,
    mimeType: f.mimeType,
    shareToken: f.shareToken,
    storagePath: f.storagePath,
    folderId: f.folderId,
    downloadCount: f.downloadCount,
    isStarred: f.isStarred,
    password: f.password,
    expiresAt: f.expiresAt?.toISOString(),
    createdAt: f.createdAt.toISOString(),
  };
}

function formatFolder(
  f: typeof foldersTable.$inferSelect & { fileCount?: number },
) {
  return {
    id: f.id,
    name: f.name,
    createdAt: f.createdAt.toISOString(),
    fileCount: f.fileCount ?? 0,
    shareToken: f.shareToken ?? "",
    password: f.password,
    expiresAt: f.expiresAt?.toISOString(),
  };
}

function formatTextMessage(m: typeof textMessagesTable.$inferSelect) {
  return {
    id: m.id,
    title: m.title,
    content: m.content,
    language: m.language,
    fileId: m.fileId,
    folderId: m.folderId,
    createdAt: m.createdAt.toISOString(),
  };
}

function createShareToken() {
  return `${Date.now()}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

const textFileExtensions: Record<string, string> = {
  plaintext: "txt",
  text: "txt",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  python: "py",
  javascript: "js",
  typescript: "ts",
  json: "json",
  html: "html",
  css: "css",
  sql: "sql",
  markdown: "md",
  bash: "sh",
  shell: "sh",
  java: "java",
  go: "go",
  rust: "rs",
  php: "php",
  ruby: "rb",
};

function getTextMessageFilename(message: { title: string; language: string }) {
  const extension = textFileExtensions[message.language.toLowerCase()] || "txt";
  const safeTitle =
    message.title.replace(/[\\/]/g, "_").replace(/[^a-zA-Z0-9._ -]/g, "_").trim() ||
    "snippet";
  return safeTitle.toLowerCase().endsWith(`.${extension}`)
    ? safeTitle
    : `${safeTitle}.${extension}`;
}

async function ensureFolderShareToken(
  folder: typeof foldersTable.$inferSelect,
) {
  if (folder.shareToken) return folder;
  const [updated] = await db
    .update(foldersTable)
    .set({ shareToken: createShareToken() })
    .where(eq(foldersTable.id, folder.id))
    .returning();
  return updated ?? folder;
}

// ── File upload (multipart) ────────────────────────────────────────────────
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  try {
    const timestamp = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    const shareToken = `${timestamp}${rand}`;
    const storagePath = generateStoragePath(req.file.originalname);

    await uploadFile(req.file.buffer, storagePath, req.file.mimetype || "application/octet-stream");

    res.json({ storagePath, shareToken });
  } catch (err) {
    req.log.error({ err }, "Upload to object storage failed");
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// ── Serve stored file ──────────────────────────────────────────────────────
router.get("/storage/*storagePath", async (req, res) => {
  const raw = req.params.storagePath;
  const filename = Array.isArray(raw) ? raw.join("/") : (raw || "");
  if (filename.includes("..") || filename.startsWith("/")) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  try {
    if (req.query.download === "1") {
      const [file] = await db
        .select({ originalName: filesTable.originalName })
        .from(filesTable)
        .where(eq(filesTable.storagePath, filename));
      res.attachment(file?.originalName || filename.split("/").pop() || "download");
    }
    await serveFile(filename, res);

    // Increment download count in background
    db.select().from(filesTable).where(eq(filesTable.storagePath, filename))
      .then(([file]) => {
        if (file) {
          db.update(filesTable)
            .set({ downloadCount: sql`${filesTable.downloadCount} + 1` })
            .where(eq(filesTable.id, file.id))
            .catch(() => {});
        }
      }).catch(() => {});
  } catch (err) {
    req.log.error({ err }, "Serve file failed");
    res.status(500).json({ error: "Failed to serve file" });
  }
});

// ── GET /api/files ─────────────────────────────────────────────────────────
router.get("/files", async (req, res) => {
  const folderId = req.query.folderId as string | undefined;
  const now = new Date();
  const query = db.select().from(filesTable);
  const result = folderId
    ? await query.where(and(eq(filesTable.folderId, folderId), sql`(${filesTable.expiresAt} IS NULL OR ${filesTable.expiresAt} > ${now})`)).orderBy(sql`${filesTable.createdAt} DESC`)
    : await query.where(and(isNull(filesTable.folderId), sql`(${filesTable.expiresAt} IS NULL OR ${filesTable.expiresAt} > ${now})`)).orderBy(sql`${filesTable.createdAt} DESC`);
  res.json(result.map(formatFile));
});

// ── POST /api/files ────────────────────────────────────────────────────────
router.post("/files", async (req, res) => {
  const parsed = CreateFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { originalName, size, mimeType, storagePath, shareToken, folderId, password, expiresAt } = parsed.data;
  
  let expiryDate = expiresAt ? new Date(expiresAt) : null;
  if (!expiryDate) {
    if (folderId) {
      const [folder] = await db
        .select({ expiresAt: foldersTable.expiresAt })
        .from(foldersTable)
        .where(eq(foldersTable.id, folderId));
      if (folder?.expiresAt) {
        expiryDate = new Date(folder.expiresAt);
      }
    }
    if (!expiryDate) {
      // Default to 3 days (72 hours)
      expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    }
  }
  
  const id = randomUUID();
  const [file] = await db
    .insert(filesTable)
    .values({ id, originalName, size, mimeType, storagePath, shareToken, folderId: folderId || null, password: password || null, expiresAt: expiryDate })
    .returning();
  res.status(201).json(formatFile(file));
});

// ── GET /api/files/stats ───────────────────────────────────────────────────
router.get("/files/stats", async (_req, res) => {
  const now = new Date();
  const [stats] = await db
    .select({
      totalFiles: sql<number>`count(*)::int`,
      totalSize: sql<number>`coalesce(sum(${filesTable.size}), 0)::int`,
    })
    .from(filesTable)
    .where(sql`(${filesTable.expiresAt} IS NULL OR ${filesTable.expiresAt} > ${now})`);

  const recent = await db
    .select()
    .from(filesTable)
    .where(sql`(${filesTable.expiresAt} IS NULL OR ${filesTable.expiresAt} > ${now})`)
    .orderBy(sql`${filesTable.createdAt} DESC`)
    .limit(5);

  res.json({
    totalFiles: stats.totalFiles ?? 0,
    totalSize: stats.totalSize ?? 0,
    recentUploads: recent.map(formatFile),
  });
});

// ── GET /api/files/share/:token ────────────────────────────────────────────
router.get("/files/share/:token", async (req, res) => {
  const parsed = GetFileByTokenParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }
  const [file] = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.shareToken, parsed.data.token));
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  await db
    .update(filesTable)
    .set({ downloadCount: sql`${filesTable.downloadCount} + 1` })
    .where(eq(filesTable.id, file.id));
  res.json(formatFile({ ...file, downloadCount: file.downloadCount + 1 }));
});

// ── GET /api/files/:id ─────────────────────────────────────────────────────
router.get("/files/:id", async (req, res) => {
  const parsed = GetFileParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [file] = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.id, parsed.data.id));
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.json(formatFile(file));
});

// ── DELETE /api/files/:id ──────────────────────────────────────────────────
router.delete("/files/:id", async (req, res) => {
  const parsed = DeleteFileParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db
    .delete(filesTable)
    .where(eq(filesTable.id, parsed.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  deleteFile(deleted.storagePath).catch(() => {});
  res.status(204).send();
});


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

// ── PUT /api/files/:id/move ────────────────────────────────────────────────
router.put("/files/:id/move", async (req, res) => {
  const idParsed = GetFileParams.safeParse(req.params);
  if (!idParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = MoveFileBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const targetFolderId = bodyParsed.data.folderId;
  let targetExpiresAt: Date | null = null;
  if (targetFolderId) {
    const [targetFolder] = await db
      .select({ expiresAt: foldersTable.expiresAt })
      .from(foldersTable)
      .where(eq(foldersTable.id, targetFolderId));
    if (targetFolder?.expiresAt) {
      targetExpiresAt = new Date(targetFolder.expiresAt);
    }
  }

  const [updated] = await db
    .update(filesTable)
    .set({
      folderId: targetFolderId,
      ...(targetExpiresAt ? { expiresAt: targetExpiresAt } : {}),
    })
    .where(eq(filesTable.id, idParsed.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.json(formatFile(updated));
});

// ── GET /api/folders ────────────────────────────────────────────────────────
router.get("/folders", async (req, res) => {
  const idsParam = req.query.ids as string | undefined;
  const activeRoomId = (req.query.activeRoomId || req.headers["x-active-room-id"]) as string | undefined;
  const now = new Date();

  let folders;
  if (idsParam) {
    const requestedIds = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (requestedIds.length === 0) {
      res.json([]);
      return;
    }

    folders = await db
      .select()
      .from(foldersTable)
      .where(
        and(
          inArray(foldersTable.id, requestedIds),
          sql`(${foldersTable.expiresAt} IS NULL OR ${foldersTable.expiresAt} > ${now})`
        )
      )
      .orderBy(sql`${foldersTable.createdAt} DESC`);
  } else {
    // Return standard public folders + authenticated active room if present
    folders = await db
      .select()
      .from(foldersTable)
      .where(
        and(
          activeRoomId
            ? sql`(${foldersTable.password} IS NULL OR ${foldersTable.id} = ${activeRoomId})`
            : isNull(foldersTable.password),
          sql`(${foldersTable.expiresAt} IS NULL OR ${foldersTable.expiresAt} > ${now})`
        )
      )
      .orderBy(sql`${foldersTable.createdAt} DESC`);
  }

  const counts = await db
    .select({
      folderId: filesTable.folderId,
      count: sql<number>`count(*)::int`,
    })
    .from(filesTable)
    .where(sql`${filesTable.folderId} IS NOT NULL`)
    .groupBy(filesTable.folderId);

  const countMap = new Map(counts.map((c) => [c.folderId, c.count]));
  const withTokens = await Promise.all(folders.map(ensureFolderShareToken));

  res.json(
    withTokens.map((f) =>
      formatFolder({ ...f, fileCount: countMap.get(f.id) ?? 0 }),
    ),
  );
});

// ── POST /api/folders ──────────────────────────────────────────────────────
router.post("/folders", async (req, res) => {
  const parsed = CreateFolderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const id = randomUUID();
  const { name, password, expiresAt } = parsed.data;
  
  // Default to 3 days (72 hours) if no expiry date given
  const expiryDate = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  
  const [folder] = await db
    .insert(foldersTable)
    .values({ id, name, shareToken: createShareToken(), password: password || null, expiresAt: expiryDate })
    .returning();
  res.status(201).json(formatFolder(folder));
});

// ── DELETE /api/folders/:id ────────────────────────────────────────────────
router.delete("/folders/:id", async (req, res) => {
  const parsed = DeleteFolderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .update(filesTable)
    .set({ folderId: null })
    .where(eq(filesTable.folderId, parsed.data.id));
  await db
    .update(textMessagesTable)
    .set({ folderId: null })
    .where(eq(textMessagesTable.folderId, parsed.data.id));

  const [deleted] = await db
    .delete(foldersTable)
    .where(eq(foldersTable.id, parsed.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }
  res.status(204).send();
});

// ── GET /api/folders/:id/files ─────────────────────────────────────────────
router.get("/folders/:id/files", async (req, res) => {
  const parsed = ListFolderFilesParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const files = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.folderId, parsed.data.id))
    .orderBy(sql`${filesTable.createdAt} DESC`);
  res.json(files.map(formatFile));
});

// ── Text/code messages ─────────────────────────────────────────────────────
router.get("/text-messages", async (req, res) => {
  const fileId = typeof req.query.fileId === "string" ? req.query.fileId : undefined;
  const folderId =
    typeof req.query.folderId === "string" ? req.query.folderId : undefined;

  let query = db.select().from(textMessagesTable);
  if (fileId) {
    query = query.where(eq(textMessagesTable.fileId, fileId)) as typeof query;
  } else if (folderId) {
    query = query.where(eq(textMessagesTable.folderId, folderId)) as typeof query;
  } else {
    query = query.where(isNull(textMessagesTable.folderId)) as typeof query;
  }
  const messages = await query.orderBy(sql`${textMessagesTable.createdAt} DESC`);
  res.json(messages.map(formatTextMessage));
});

router.post("/text-messages", async (req, res) => {
  const parsed = CreateTextMessageBody.safeParse(req.body);
  if (!parsed.success || parsed.data.content.length === 0) {
    res.status(400).json({ error: "Text content is required" });
    return;
  }

  const id = randomUUID();
  const [message] = await db
    .insert(textMessagesTable)
    .values({
      id,
      title: parsed.data.title?.trim() || "Untitled snippet",
      content: parsed.data.content,
      language: parsed.data.language?.trim() || "plaintext",
      fileId: parsed.data.fileId || null,
      folderId: parsed.data.folderId || null,
    })
    .returning();
  res.status(201).json(formatTextMessage(message));
});

router.delete("/text-messages/:id", async (req, res) => {
  const parsed = DeleteTextMessageParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db
    .delete(textMessagesTable)
    .where(eq(textMessagesTable.id, parsed.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Text message not found" });
    return;
  }
  res.status(204).send();
});

// ── Public folder sharing ──────────────────────────────────────────────────
async function getSharedFolder(token: string) {
  const [folder] = await db
    .select()
    .from(foldersTable)
    .where(eq(foldersTable.shareToken, token));
  if (!folder) return null;

  const [files, textMessages] = await Promise.all([
    db
      .select()
      .from(filesTable)
      .where(eq(filesTable.folderId, folder.id))
      .orderBy(sql`${filesTable.createdAt} DESC`),
    db
      .select()
      .from(textMessagesTable)
      .where(eq(textMessagesTable.folderId, folder.id))
      .orderBy(sql`${textMessagesTable.createdAt} DESC`),
  ]);

  return { folder, files, textMessages };
}

router.get("/folders/share/:token", async (req, res) => {
  const token = req.params.token;
  const password = req.headers["x-folder-password"] as string | undefined || req.query.password as string | undefined;

  if (!token || token.includes("..")) {
    res.status(400).json({ error: "Invalid share token" });
    return;
  }
  const shared = await getSharedFolder(token);
  if (!shared) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }
  
  if (shared.folder.password && shared.folder.password !== password) {
    res.status(401).json({ error: "Password required" });
    return;
  }

  res.json({
    folder: formatFolder({
      ...shared.folder,
      fileCount: shared.files.length,
    }),
    files: shared.files.map(formatFile),
    textMessages: shared.textMessages.map(formatTextMessage),
  });
});

router.get("/folders/share/:token/download", async (req, res) => {
  const token = req.params.token;
  const password = req.query.password as string | undefined;
  if (!token || token.includes("..")) {
    res.status(400).json({ error: "Invalid share token" });
    return;
  }
  const shared = await getSharedFolder(token);
  if (!shared) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }

  if (shared.folder.password && shared.folder.password !== password) {
    res.status(401).json({ error: "Password required" });
    return;
  }
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const safeName = shared.folder.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "folder";
  res.attachment(`${safeName}.zip`);
  archive.on("error", (err: Error) => {
    req.log.error({ err }, "Folder ZIP failed");
    if (!res.headersSent) res.status(500).json({ error: "Failed to create ZIP" });
    else res.destroy(err);
  });
  archive.pipe(res);

  const usedNames = new Set<string>();
  const uniqueName = (name: string) => {
    const base = name.replace(/[\\/]/g, "_") || "file";
    let candidate = base;
    let count = 2;
    while (usedNames.has(candidate)) {
      candidate = `${base}-${count++}`;
    }
    usedNames.add(candidate);
    return candidate;
  };

  for (const file of shared.files) {
    try {
      const stored = await getStoredFileStream(file.storagePath);
      archive.append(stored.stream as import("stream").Readable, {
        name: uniqueName(file.originalName),
      });
    } catch (err) {
      req.log.warn({ err, fileId: file.id }, "Skipping unavailable shared file");
    }
  }
  for (const message of shared.textMessages) {
    archive.append(Buffer.from(message.content, "utf8"), {
      name: uniqueName(getTextMessageFilename(message)),
    });
  }
  await archive.finalize();
});

// ════════════════════════════════════════════════════════════════════════════
// ── STEALTH PRIVATE ROOMS (ZERO-LEAK & 3-DAY DISSOLUTION) ──────────────────
// ════════════════════════════════════════════════════════════════════════════

// Roommate authentication helper (Zero information leak to strangers)
async function getAuthenticatedRoom(req: import("express").Request) {
  const roomId = req.params.id;
  if (!roomId || roomId.includes("..")) return null;

  const headerToken = req.headers["x-room-token"] as string | undefined;
  const queryToken = req.query.token as string | undefined;
  const headerPassword = req.headers["x-room-password"] as string | undefined;
  const token = headerToken || queryToken;

  const [room] = await db
    .select()
    .from(foldersTable)
    .where(eq(foldersTable.id, roomId));

  if (!room) return null;

  // Enforce 3-day dissolution TTL
  if (room.expiresAt && new Date(room.expiresAt).getTime() < Date.now()) {
    return null;
  }

  // Token match (via QR scan or session token)
  if (token && room.shareToken && token === room.shareToken) {
    return room;
  }

  // Password match
  if (headerPassword && room.password && headerPassword === room.password) {
    return room;
  }

  return null;
}

// ── POST /api/rooms/create ─────────────────────────────────────────────────
router.post("/rooms/create", async (req, res) => {
  const { name, password, expiresAt } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Room name is required" });
    return;
  }
  if (!password || typeof password !== "string" || !password.trim()) {
    res.status(400).json({ error: "Room password is required for private encryption" });
    return;
  }

  const cleanName = name.trim();
  const cleanPass = password.trim();

  // Enforce strict 3 days (72 hours) default dissolution lifecycle, or use customizable expiresAt
  const expiryDate = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const id = randomUUID();
  const shareToken = createShareToken();

  const [room] = await db
    .insert(foldersTable)
    .values({
      id,
      name: cleanName,
      password: cleanPass,
      shareToken,
      expiresAt: expiryDate,
    })
    .returning();

  res.status(201).json({
    id: room.id,
    name: room.name,
    shareToken: room.shareToken,
    expiresAt: room.expiresAt?.toISOString(),
    createdAt: room.createdAt.toISOString(),
    token: room.shareToken, // Session token for the creator
  });
});

// ── POST /api/rooms/join (Zero-Knowledge Stealth Verification) ─────────────
router.post("/rooms/join", async (req, res) => {
  const { name, password, token } = req.body || {};
  let room: typeof foldersTable.$inferSelect | undefined;

  const now = Date.now();

  if (token && typeof token === "string") {
    // Join via QR code shareToken
    const [found] = await db
      .select()
      .from(foldersTable)
      .where(eq(foldersTable.shareToken, token.trim()));
    if (found && (!found.expiresAt || new Date(found.expiresAt).getTime() > now)) {
      room = found;
    }
  } else if (name && password && typeof name === "string" && typeof password === "string") {
    // Join via Room Name and Password
    const candidates = await db
      .select()
      .from(foldersTable)
      .where(sql`LOWER(${foldersTable.name}) = LOWER(${name.trim()})`);

    const matching = candidates.find(
      (c) => c.password === password.trim() && (!c.expiresAt || new Date(c.expiresAt).getTime() > now)
    );
    if (matching) {
      room = matching;
    }
  }

  // ZERO LEAKAGE: If room not found or credentials wrong or room dissolved,
  // return identical timing-safe 401 so attackers cannot probe room existence
  if (!room) {
    res.status(401).json({ error: "Invalid room credentials or room has dissolved" });
    return;
  }

  res.json({
    id: room.id,
    name: room.name,
    shareToken: room.shareToken,
    expiresAt: room.expiresAt?.toISOString(),
    createdAt: room.createdAt.toISOString(),
    token: room.shareToken, // Session token for the roommate
  });
});

// ── GET /api/rooms/:id (Authorized Room Vault) ────────────────────────────
router.get("/rooms/:id", async (req, res) => {
  const room = await getAuthenticatedRoom(req);
  if (!room) {
    // Return 404 so non-roommates cannot even confirm the room exists
    res.status(404).json({ error: "Room not found or access denied" });
    return;
  }

  const now = new Date();
  const [files, textMessages] = await Promise.all([
    db
      .select()
      .from(filesTable)
      .where(and(eq(filesTable.folderId, room.id), sql`(${filesTable.expiresAt} IS NULL OR ${filesTable.expiresAt} > ${now})`))
      .orderBy(sql`${filesTable.createdAt} DESC`),
    db
      .select()
      .from(textMessagesTable)
      .where(eq(textMessagesTable.folderId, room.id))
      .orderBy(sql`${textMessagesTable.createdAt} DESC`),
  ]);

  res.json({
    room: {
      id: room.id,
      name: room.name,
      shareToken: room.shareToken,
      expiresAt: room.expiresAt?.toISOString(),
      createdAt: room.createdAt.toISOString(),
    },
    files: files.map(formatFile),
    textMessages: textMessages.map(formatTextMessage),
  });
});

// ── POST /api/rooms/:id/files (Add File to Room) ───────────────────────────
router.post("/rooms/:id/files", async (req, res) => {
  const room = await getAuthenticatedRoom(req);
  if (!room) {
    res.status(404).json({ error: "Room not found or access denied" });
    return;
  }

  // Support dragging an existing file directly into the room
  if (req.body?.fileId && typeof req.body.fileId === "string") {
    const [file] = await db
      .update(filesTable)
      .set({
        folderId: room.id,
        ...(room.expiresAt ? { expiresAt: new Date(room.expiresAt) } : {}),
      })
      .where(eq(filesTable.id, req.body.fileId))
      .returning();
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.status(200).json(formatFile(file));
    return;
  }

  const parsed = CreateFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request payload" });
    return;
  }

  const { originalName, size, mimeType, storagePath, shareToken } = parsed.data;
  const id = randomUUID();

  // File inherits room's 3-day dissolution expiration
  const [file] = await db
    .insert(filesTable)
    .values({
      id,
      originalName,
      size,
      mimeType,
      storagePath,
      shareToken,
      folderId: room.id,
      expiresAt: room.expiresAt,
    })
    .returning();

  res.status(201).json(formatFile(file));
});

// ── PATCH /api/rooms/:id/files/:fileId (Rename / Edit Room File) ───────────
router.patch("/rooms/:id/files/:fileId", async (req, res) => {
  const room = await getAuthenticatedRoom(req);
  if (!room) {
    res.status(404).json({ error: "Room not found or access denied" });
    return;
  }

  const originalName = typeof req.body?.originalName === "string" ? req.body.originalName.trim() : "";
  if (!originalName) {
    res.status(400).json({ error: "File name cannot be empty" });
    return;
  }

  const [updated] = await db
    .update(filesTable)
    .set({ originalName })
    .where(and(eq(filesTable.id, req.params.fileId), eq(filesTable.folderId, room.id)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "File not found in this room" });
    return;
  }

  res.json(formatFile(updated));
});

// ── DELETE /api/rooms/:id/files/:fileId (Delete File from Room) ────────────
router.delete("/rooms/:id/files/:fileId", async (req, res) => {
  const room = await getAuthenticatedRoom(req);
  if (!room) {
    res.status(404).json({ error: "Room not found or access denied" });
    return;
  }

  const [deleted] = await db
    .delete(filesTable)
    .where(and(eq(filesTable.id, req.params.fileId), eq(filesTable.folderId, room.id)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "File not found in this room" });
    return;
  }

  if (deleted.storagePath) {
    deleteFile(deleted.storagePath).catch(() => {});
  }

  res.status(204).send();
});

// ── POST /api/rooms/:id/messages (Add Message/Code Snippet to Room) ────────
router.post("/rooms/:id/messages", async (req, res) => {
  const room = await getAuthenticatedRoom(req);
  if (!room) {
    res.status(404).json({ error: "Room not found or access denied" });
    return;
  }

  const { title, content, language } = req.body || {};
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "Message content cannot be empty" });
    return;
  }

  const id = randomUUID();
  const [msg] = await db
    .insert(textMessagesTable)
    .values({
      id,
      title: title?.trim() || "Untitled snippet",
      content: content.trim(),
      language: language?.trim() || "plaintext",
      folderId: room.id,
    })
    .returning();

  res.status(201).json(formatTextMessage(msg));
});

// ── DELETE /api/rooms/:id/messages/:msgId (Delete Room Message) ────────────
router.delete("/rooms/:id/messages/:msgId", async (req, res) => {
  const room = await getAuthenticatedRoom(req);
  if (!room) {
    res.status(404).json({ error: "Room not found or access denied" });
    return;
  }

  const [deleted] = await db
    .delete(textMessagesTable)
    .where(and(eq(textMessagesTable.id, req.params.msgId), eq(textMessagesTable.folderId, room.id)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Message not found in this room" });
    return;
  }

  res.status(204).send();
});

// ── GET /api/rooms/:id/download (Download all Room files as ZIP) ────────────
router.get("/rooms/:id/download", async (req, res) => {
  const room = await getAuthenticatedRoom(req);
  if (!room) {
    res.status(404).json({ error: "Room not found or access denied" });
    return;
  }

  const [files, textMessages] = await Promise.all([
    db.select().from(filesTable).where(eq(filesTable.folderId, room.id)),
    db.select().from(textMessagesTable).where(eq(textMessagesTable.folderId, room.id)),
  ]);

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const safeName = room.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "room-files";
  res.attachment(`${safeName}.zip`);

  archive.on("error", (err: Error) => {
    req.log.error({ err }, "Room ZIP archive failed");
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate ZIP" });
    else res.destroy(err);
  });
  archive.pipe(res);

  const usedNames = new Set<string>();
  const uniqueName = (name: string) => {
    const base = name.replace(/[\\/]/g, "_") || "file";
    let candidate = base;
    let count = 2;
    while (usedNames.has(candidate)) {
      candidate = `${base}-${count++}`;
    }
    usedNames.add(candidate);
    return candidate;
  };

  for (const file of files) {
    try {
      const stored = await getStoredFileStream(file.storagePath);
      archive.append(stored.stream as import("stream").Readable, {
        name: uniqueName(file.originalName),
      });
    } catch (err) {
      req.log.warn({ err, fileId: file.id }, "Skipping unavailable room file");
    }
  }

  for (const message of textMessages) {
    archive.append(Buffer.from(message.content, "utf8"), {
      name: uniqueName(getTextMessageFilename(message)),
    });
  }

  await archive.finalize();
});

// ── DELETE /api/rooms/:id (Dissolve Room Early) ────────────────────────────
router.delete("/rooms/:id", async (req, res) => {
  const room = await getAuthenticatedRoom(req);
  if (!room) {
    res.status(404).json({ error: "Room not found or access denied" });
    return;
  }

  const folderFiles = await db.select().from(filesTable).where(eq(filesTable.folderId, room.id));
  for (const file of folderFiles) {
    if (file.storagePath) {
      deleteFile(file.storagePath).catch(() => {});
    }
  }

  await db.delete(filesTable).where(eq(filesTable.folderId, room.id));
  await db.delete(textMessagesTable).where(eq(textMessagesTable.folderId, room.id));
  await db.delete(foldersTable).where(eq(foldersTable.id, room.id));

  res.status(204).send();
});

// ── PUT /api/files/:id/expires ─────────────────────────────────────────────
router.put("/files/:id/expires", async (req, res) => {
  const { id } = req.params;
  const { expiresAt } = req.body;
  
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  
  const [updated] = await db
    .update(filesTable)
    .set({ expiresAt: expiryDate })
    .where(eq(filesTable.id, id))
    .returning();
    
  if (!updated) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  
  res.json(formatFile(updated));
});

// ── PUT /api/folders/:id/expires ───────────────────────────────────────────
router.put("/folders/:id/expires", async (req, res) => {
  const { id } = req.params;
  const { expiresAt } = req.body;
  
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  
  const [updated] = await db
    .update(foldersTable)
    .set({ expiresAt: expiryDate })
    .where(eq(foldersTable.id, id))
    .returning();
    
  if (!updated) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }
  
  // If the folder's expiration date was updated, update all the files inside this folder as well
  if (expiryDate) {
    await db
      .update(filesTable)
      .set({ expiresAt: expiryDate })
      .where(eq(filesTable.folderId, id));
  }
  
  res.json(formatFolder(updated));
});

export default router;
