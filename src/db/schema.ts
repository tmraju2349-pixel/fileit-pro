import { pgTable, text, integer, timestamp, boolean, serial } from "drizzle-orm/pg-core";

export const filesTable = pgTable("files", {
  id: text("id").primaryKey(),
  originalName: text("original_name").notNull(),
  size: integer("size").notNull(),
  mimeType: text("mime_type").notNull(),
  shareToken: text("share_token").notNull().unique(),
  storagePath: text("storage_path").notNull(),
  folderId: text("folder_id"),
  downloadCount: integer("download_count").notNull().default(0),
  isStarred: boolean("is_starred").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const foldersTable = pgTable("folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shareToken: text("share_token").unique(),
  password: text("password"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const textMessagesTable = pgTable("text_messages", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("Untitled snippet"),
  content: text("content").notNull(),
  language: text("language").notNull().default("plaintext"),
  fileId: text("file_id"),
  folderId: text("folder_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const files = filesTable;
export const folders = foldersTable;
export const textMessages = textMessagesTable;
export const users = usersTable;
