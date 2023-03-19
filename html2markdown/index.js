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
const outDirPath = argv.outputDir + "/md";
const isLocal = argv.local;

fs.access(outDirPath, fs.constants.F_OK, (err) => {
  if (err) {
    console.log("Directory does not exist, creating...");
    fs.mkdir(outDirPath, { recursive: true }, (err) => {
      if (err) {
        console.error("Error creating directory:", err);
      } else {
        console.log("Directory created successfully");
      }
    });
  }
});

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

  const { markdown, imageList } = await convertArticleToMarkdown(
    article,
    options
  );
  // format the title
  article.title = await formatTitle(article);

  const fileNameWithoutExtension = path.parse(htmlFilePath).name;
  fs.writeFile(
    `${outDirPath}/${fileNameWithoutExtension}.md`,
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
