import {
  pgTable,
  integer,
  text,
  timestamp,
  json,
  customType,
} from "drizzle-orm/pg-core";
import { id, created, updated, encryptedJson } from "./utils";
import { boolean, index } from "drizzle-orm/gel-core";

export const users = pgTable("users", {
  id,
  email: text("email").unique(),
  password: text("password"),
  created,
  updated,
});

export const posts = pgTable("posts", {
  id,
  created,
  updated,
  title: text("title"),
  content: text("content"),
  user_id: text("user_id").references(() => users.id),
});

export const signers = pgTable("signers", {
  id,
  nik: text("nik").unique(),
  nip: text("nip"),
  email: text("email").unique(),
  name: text("name"),
  position: text("position"),
  rank: text("rank"),
  organizations: text("organizations"),
  phone: text("phone"),
  created,
  updated,
});

export const documents = pgTable(
  "documents",
  {
    id,
    owner: text("owner"),
    signer: text("signer"),
    title: text("title"),
    files: text("files").array(),
    signatures: text("signatures").array(),
    checksums: text("checksums").array(),
    metadata: encryptedJson("metadata"),
    status: text("status")
      .default("draft")
      .$type<"draft" | "queue" | "failed" | "signed">(),
    esign: boolean("esign").default(true),
    signatureProperties: json("signature_properties"),
    to: text("to").array(),
    created,
    updated,
  },
  (table) => [
    index("documents_owner_idx").on(table.owner),
    index("documents_signer_idx").on(table.signer),
    index("documents_checksums_idx").on(table.checksums),
    index("documents_esign_idx").on(table.esign),
    index("documents_to_idx").on(table.to),
    index("documents_status_idx").on(table.status),
  ],
);

export const documentStatistics = pgTable("document_statistics", {
  id,
  // date: date('date').defaultNow(),
  type: text("type")
    .default("signed")
    .$type<
      "signed" | "verified" | "new-request" | "reset-email" | "reset-passphrase"
    >(),
  value: integer("value").default(0),
  created,
  updated,
});
export const templates = pgTable("templates", {
  id,
  name: text("name").unique(),
  file: text("file"),
  properties: json("properties").$type<{
    description: string;
    type: string;
    to?: string[];
  }>(),
  created,
  updated,
});
export const organizations = pgTable("organizations", {
  id,
  name: text("name").unique(),
  short_name: text("short_name").unique(),
  created,
  updated,
});

export const ranks = pgTable("ranks", {
  id,
  rank: text("rank").unique(),
  grade: text("grade").unique(),
  created,
  updated,
});

export const __logs = pgTable("__logs", {
  id,
  level: text("level").default("info").$type<"info" | "error" | "warn">(),
  url: text("url"),
  method: text("method"),
  message: text("message"),
  metadata: json("metadata"),
  created,
  updated,
});
