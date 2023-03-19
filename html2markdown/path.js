import path from "path";

export function fullPathToRelativePath(fullPath, basePath) {
  return path.relative(basePath, fullPath);
}
