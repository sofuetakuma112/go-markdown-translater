import fs from "fs";
import path from "path";

export const createDirIfNotExist = (dirPath) => {
  fs.access(dirPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.log("Directory does not exist, creating...");
      fs.mkdir(dirPath, { recursive: true }, (err) => {
        if (err) {
          console.error("Error creating directory:", err);
        } else {
          console.log("Directory created successfully");
        }
      });
    }
  });
};

export const copyFile = (srcPath, destFolder) => {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(srcPath);
    const destPath = path.join(destFolder, fileName);

    fs.copyFile(srcPath, destPath, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`File ${srcPath} copied to ${destPath}`);
        resolve(destPath);
      }
    });
  });
};
