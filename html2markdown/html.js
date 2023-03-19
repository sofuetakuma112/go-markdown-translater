import { JSDOM } from "jsdom";
import path from "path";
import { copyFile, createDirIfNotExist } from "./file.js";
import { fullPathToRelativePath } from "./path.js";

export function copyAllImagesFromHtmlString(htmlString, options) {
  const dom = new JSDOM(htmlString);
  const document = dom.window.document;
  const imgElements = document.querySelectorAll("img");

  return Promise.all(
    Array.from(imgElements).map((imgElement) => {
      const imgSrc = imgElement.getAttribute("src");

      // eslint-disable-next-line no-undef
      const currentDirectory = process.cwd();

      const fullPath = path.join(currentDirectory, options.htmlDirPath, imgSrc);
      const ourDirFullpath = path.join(currentDirectory, options.mdImgsDirPath);

      // 画像をコピーする
      createDirIfNotExist(ourDirFullpath);
      return copyFile(fullPath, ourDirFullpath);
    })
  );
}
