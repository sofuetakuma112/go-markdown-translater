import fs from "fs";
import path from "path";
import {
  getArticleFromDom,
  convertArticleToMarkdown,
  formatTitle,
} from "./articleMarkdownConverter.js";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { getOptions } from "./default-options.js";
import { createDirIfNotExist } from "./file.js";
import { copyAllImagesFromHtmlString } from "./html.js";

// eslint-disable-next-line no-undef
const argv = yargs(hideBin(process.argv))
  .option("htmlFile", {
    alias: "f",
    description: "Path to the HTML file",
    type: "string",
    demandOption: true,
  })
  .option("outputDir", {
    alias: "o",
    description: "Output directory path for the generated Markdown file",
    type: "string",
    demandOption: true,
  })
  .option("local", {
    alias: "l",
    type: "boolean",
    description: "A local html file or",
  })
  .help()
  .alias("help", "h").argv;

const htmlFilePath = argv.htmlFile;
const mdDirPath = argv.outputDir + "/md";
const isLocal = argv.local;

createDirIfNotExist(mdDirPath);

fs.readFile(htmlFilePath, "utf8", async (err, html) => {
  if (err) {
    console.error("Error reading the HTML file:", err);
    // eslint-disable-next-line no-undef
    process.exit(1);
  }

  const htmlDirPath = path.dirname(htmlFilePath);

  const article = await getArticleFromDom(html);

  // convert the article to markdown
  const options = await getOptions();
  options.isLocal = isLocal;
  options.htmlDirPath = htmlDirPath;
  options.mdDirPath = mdDirPath;

  const mdImgsDirPath = path.join(mdDirPath, "/images");
  options.mdImgsDirPath = mdImgsDirPath;

  await copyAllImagesFromHtmlString(article.content, options);

  const { markdown, imageList } = await convertArticleToMarkdown(
    article,
    options
  );
  // format the title
  article.title = await formatTitle(article);

  const fileNameWithoutExtension = path.parse(htmlFilePath).name;
  fs.writeFile(
    `${mdDirPath}/${fileNameWithoutExtension}.md`,
    markdown,
    (err) => {
      if (err) {
        console.error("Error writing the HTML file:", err);
        // eslint-disable-next-line no-undef
        process.exit(1);
      }
    }
  );
});
