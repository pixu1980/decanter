// Minimal PE reader: machine type and imported DLL names.
//
// The heuristics use it to pick a Wine runtime (a 32-bit game asserts on GPTK's
// Wine 7.7) and the D3DX winetricks (a game that imports `d3dx9_*.dll` needs the
// native redistributable, since Wine only stubs parts of D3DX).
//
// docs: docs/managing.md

import { readFile } from "node:fs/promises";

export interface PeInfo {
  /** `x86` for 32-bit, `x64` for 64-bit, `other` otherwise. */
  machine: "x86" | "x64" | "other";
  /** Imported DLL names, lower-cased (e.g. `d3dx9_29.dll`). */
  imports: string[];
}

interface Section {
  va: number;
  vsize: number;
  raw: number;
  rawSize: number;
}

/** Read the machine type and imports of a PE file, or `null`. */
export async function readPe(path: string): Promise<PeInfo | null> {
  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch {
    return null;
  }
  if (buffer.length < 0x40 || buffer.readUInt16LE(0) !== 0x5a4d) {
    return null; // not MZ
  }
  const pe = buffer.readUInt32LE(0x3c);
  if (pe + 24 > buffer.length || buffer.readUInt32LE(pe) !== 0x00004550) {
    return null; // not PE\0\0
  }

  const machine = buffer.readUInt16LE(pe + 4);
  const sections = buffer.readUInt16LE(pe + 6);
  const optionalSize = buffer.readUInt16LE(pe + 20);
  const optional = pe + 24;
  const is64 = buffer.readUInt16LE(optional) === 0x20b;
  const directories = optional + (is64 ? 112 : 96);
  const importRva = buffer.readUInt32LE(directories + 8);

  const table: Section[] = [];
  const sectionStart = optional + optionalSize;
  for (let index = 0; index < sections; index += 1) {
    const offset = sectionStart + index * 40;
    table.push({
      vsize: buffer.readUInt32LE(offset + 8),
      va: buffer.readUInt32LE(offset + 12),
      rawSize: buffer.readUInt32LE(offset + 16),
      raw: buffer.readUInt32LE(offset + 20),
    });
  }

  const toOffset = (rva: number): number => {
    for (const section of table) {
      if (rva >= section.va && rva < section.va + Math.max(section.vsize, section.rawSize)) {
        return section.raw + (rva - section.va);
      }
    }
    return -1;
  };

  const imports: string[] = [];
  let descriptor = importRva ? toOffset(importRva) : -1;
  while (descriptor >= 0 && descriptor + 20 <= buffer.length) {
    const nameRva = buffer.readUInt32LE(descriptor + 12);
    const firstThunk = buffer.readUInt32LE(descriptor + 16);
    const originalThunk = buffer.readUInt32LE(descriptor);
    if (!nameRva && !firstThunk && !originalThunk) {
      break;
    }
    const nameOffset = nameRva ? toOffset(nameRva) : -1;
    if (nameOffset >= 0) {
      let end = nameOffset;
      while (end < buffer.length && buffer[end] !== 0) {
        end += 1;
      }
      imports.push(buffer.toString("ascii", nameOffset, end).toLowerCase());
    }
    descriptor += 20;
  }

  return { machine: machine === 0x8664 ? "x64" : machine === 0x14c ? "x86" : "other", imports };
}
