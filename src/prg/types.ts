export interface PrgMetadata {
  version: string;
  [key: string]: unknown;
}

export interface PrgReferences {
  sections: Record<string, string[]>;
  files: string[];
}

export interface PrgArchive {
  metadata: PrgMetadata;
  tags: string[];
  references: PrgReferences;
  stageRaw: unknown[];
  thumbnail: Uint8Array | null;
}
