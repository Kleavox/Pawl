import { vi } from "vitest";

export interface MockFetcher {
  fetch: ReturnType<typeof vi.fn>;
}

export interface MockD1Database {
  prepare: ReturnType<typeof vi.fn>;
  bind: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  batch: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
}

export interface MockKVNamespace {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  getWithMetadata: ReturnType<typeof vi.fn>;
}

export interface MockR2Bucket {
  get: ReturnType<typeof vi.fn>;
  head: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  createMultipartUpload: ReturnType<typeof vi.fn>;
  resumeMultipartUpload: ReturnType<typeof vi.fn>;
}

export function createMockFetcher(): MockFetcher {
  return {
    fetch: vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
  };
}

export function createMockD1Database(): MockD1Database {
  return {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  };
}

export function createMockKVNamespace(): MockKVNamespace {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  };
}

export function createMockR2Bucket(): MockR2Bucket {
  return {
    get: vi.fn(),
    head: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  };
}
