import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "data", "db.json");
const backupDir = path.join(root, "data", "backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupDir, `db-${stamp}.json`);

await mkdir(backupDir, { recursive: true });
await stat(source);
await copyFile(source, target);

console.log(`Backup criado em ${target}`);
