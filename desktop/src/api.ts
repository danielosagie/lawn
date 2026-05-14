/**
 * Typed wrapper around the preload bridge (window.api). All Electron IPC
 * goes through here so the React code can pretend it's just calling async
 * functions.
 */

export interface DesktopSettings {
  convexUrl: string;
  convexAuthToken: string;
  storage: {
    provider: "r2" | "railway";
    bucket: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  };
  rootDir: string;
  /** Which project the Resolve snapshot/restore actions push to / pull from. */
  activeProjectId?: string;
}

export interface SyncProgress {
  kind: "pull" | "push";
  current: number;
  total: number;
  file: string | null;
  done?: boolean;
}

export type MountStatus = "unmounted" | "mounting" | "mounted" | "unmounting" | "error";

export interface MountState {
  status: MountStatus;
  mountPath: string | null;
  pid: number | null;
  lastError: string | null;
  log: string[];
}

export interface MountPrereqs {
  platform: NodeJS.Platform;
  rclone: boolean;
  fuse: boolean;
  installHint: string;
}

export interface ResolveStatus {
  ok: boolean;
  error?: string;
  message?: string;
  project_name?: string | null;
  project_id?: string | null;
  timeline_name?: string | null;
  timeline_id?: string | null;
  timeline_count?: number;
  resolve_product?: string | null;
  resolve_version?: string | null;
}

interface DesktopApi {
  settings: {
    get: () => Promise<DesktopSettings>;
    set: (next: DesktopSettings) => Promise<DesktopSettings>;
  };
  dialog: {
    pickFolder: () => Promise<string | null>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    openFolder: (path: string) => Promise<void>;
  };
  sync: {
    pull: (args: { s3Prefix: string; localPath: string }) => Promise<{ fileCount: number }>;
    push: (args: { s3Prefix: string; localPath: string }) => Promise<{
      fileCount: number;
      sizeBytes: number;
    }>;
    onProgress: (handler: (progress: SyncProgress) => void) => () => void;
  };
  mount: {
    status: () => Promise<MountState>;
    prereqs: () => Promise<MountPrereqs>;
    start: (args: { mountPath?: string }) => Promise<{ status: MountStatus; mountPath: string }>;
    stop: () => Promise<{ status: MountStatus }>;
    onStatus: (handler: (state: MountState) => void) => () => void;
  };
  resolve: {
    status: () => Promise<ResolveStatus>;
    snapshot: (args: { message: string; branch?: string }) => Promise<{
      value?: { _id: string; branch: string };
    }>;
    restore: (args: { fcpxml: string }) => Promise<{
      ok: boolean;
      imported_as?: string;
      timeline_id?: string;
    }>;
    setActiveProject: (args: { projectId: string }) => Promise<{ ok: boolean }>;
  };
  premiere: {
    pickFile: () => Promise<string | null>;
    snapshot: (args: {
      filePath: string;
      message: string;
      branch?: string;
    }) => Promise<unknown>;
    restoreDownload: (args: {
      fcpxml: string;
      suggestedName?: string;
    }) => Promise<{ ok: boolean; cancelled?: boolean; path?: string }>;
  };
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}

export const api: DesktopApi = window.api;
