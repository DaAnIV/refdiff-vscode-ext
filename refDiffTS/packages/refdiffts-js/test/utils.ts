import * as fs from 'fs';

export function getMapFromPaths(paths: string[]): Map<string, Buffer> {
  let files = new Map<string, Buffer>();
  paths.forEach((path) => {
    files.set(path, fs.readFileSync(path));
  });
  return files;
}
