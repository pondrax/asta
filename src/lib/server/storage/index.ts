import { promises as fs } from "fs";
import path from "path";
import { env } from "$env/dynamic/private";
import { createId } from "$lib/utils";

// Type definitions
export interface StorageConfig {
  provider?: "local" | "vercel";
  baseDir?: string;
}

export interface StorageResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

// Determine provider from environment or config
function getProvider(config?: StorageConfig): "local" | "vercel" {
  if (config?.provider) return config.provider;
  const envProvider = env.STORAGE_PROVIDER as "local" | "vercel" | undefined;
  return envProvider || "local";
}

function getBaseDir(config?: StorageConfig): string {
  return config?.baseDir || env.STORAGE_BASE_DIR || "./uploads";
}

function getVercelToken(): string {
  return env.BLOB_READ_WRITE_TOKEN || "";
}

// Local file storage implementation
class LocalStorage {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async save(
    filename: string,
    content: Buffer | string,
  ): Promise<StorageResult> {
    try {
      // Create full directory path including any subdirectories in the filename
      const fullPath = path.join(this.baseDir, filename);
      const dirname = path.dirname(fullPath);

      // Recursively create directory structure if it doesn't exist
      await fs.mkdir(dirname, { recursive: true });

      const suffix = createId(4);
      filename = filename.replace(/(\.[^/.]+)$/, `.${suffix}$1`);

      const filepath = path.join(this.baseDir, filename);
      const buffer =
        typeof content === "string" ? Buffer.from(content) : content;

      await fs.writeFile(filepath, buffer);

      return {
        success: true,
        path: filepath,
        url: `/uploads/${filename}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Local storage error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  async read(filename: string): Promise<ArrayBuffer> {
    try {
      const filepath = path.join(this.baseDir, filename);
      return (await fs.readFile(filepath)).buffer;
    } catch (error) {
      throw new Error(
        `Local storage read error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async delete(filename: string): Promise<StorageResult> {
    try {
      const filepath = path.join(this.baseDir, filename);
      await fs.unlink(filepath);

      return {
        success: true,
        path: filepath,
      };
    } catch (error) {
      return {
        success: false,
        error: `Local storage delete error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }
}

// Vercel Blob storage implementation
class VercelBlobStorage {
  private token: string;
  private apiUrl = "https://blob.vercel-storage.com";

  constructor(token: string) {
    if (!token) {
      throw new Error(
        "Vercel Blob token not found. Set BLOB_READ_WRITE_TOKEN env var.",
      );
    }
    this.token = token;
  }

  async save(
    filename: string,
    content: Buffer | string,
  ): Promise<StorageResult> {
    try {
      const buffer =
        typeof content === "string" ? Buffer.from(content) : content;

      const response = await fetch(`${this.apiUrl}/${filename}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/octet-stream",
        },
        // @ts-expect-error
        body: buffer,
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Vercel Blob API error: ${response.status} - ${errorData}`,
        );
      }

      const data = (await response.json()) as { url: string };

      return {
        success: true,
        url: data.url,
      };
    } catch (error) {
      return {
        success: false,
        error: `Vercel Blob error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  async read(filename: string): Promise<ArrayBuffer> {
    try {
      const response = await fetch(`${this.apiUrl}/get/${filename}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to read file: ${response.status}`);
      }
      return await response.arrayBuffer();
      // return {
      //   success: true,
      //   url: `${this.apiUrl}/get/${filename}`,
      // };
    } catch (error) {
      throw new Error(
        `Vercel Blob read error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async delete(filename: string): Promise<StorageResult> {
    try {
      const response = await fetch(`${this.apiUrl}/delete/${filename}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.status}`);
      }

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: `Vercel Blob delete error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }
}

// Main storage factory with global env config
export class FileStorage {
  private storage: LocalStorage | VercelBlobStorage;
  private provider: "local" | "vercel";

  constructor(config?: StorageConfig) {
    this.provider = getProvider(config);

    if (this.provider === "vercel") {
      const token = getVercelToken();
      this.storage = new VercelBlobStorage(token);
    } else {
      const baseDir = getBaseDir(config);
      this.storage = new LocalStorage(baseDir);
    }
  }

  async save(
    filename: string,
    content: Buffer | ArrayBuffer | string,
  ): Promise<StorageResult> {
    return this.storage.save(filename, content as Buffer);
  }

  async read(filename: string): Promise<ArrayBuffer> {
    return this.storage.read(filename);
  }

  async delete(filename: string): Promise<StorageResult> {
    return this.storage.delete(filename);
  }
}

// Usage
export async function example() {
  // Uses global env config automatically
  const storage = new FileStorage();

  const result = await storage.save("test.txt", "Hello, World!");
  console.log("Save result:", result);

  // Or override with local config
  const customStorage = new FileStorage({
    provider: "local",
    baseDir: "./custom-uploads",
  });

  const customResult = await customStorage.save("custom.txt", "Custom storage");
  console.log("Custom save result:", customResult);
}
