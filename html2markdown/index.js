import fs from "fs";
import path from "path";
import {
  getArticleFromDom,
  convertArticleToMarkdown,
  formatTitle,
} from "./articleMarkdownConverter.js";

// eslint-disable-next-line no-undef
const htmlFilePath = process.argv[2];
// eslint-disable-next-line no-undef
const outDirPath = process.argv[3] + "/md";

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

  const article = await getArticleFromDom(html);
  // convert the article to markdown
  const { markdown, imageList } = await convertArticleToMarkdown(article);
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
