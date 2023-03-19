import TurndownService from "turndown";
import { turndownPluginGfm } from "./turndown-plugin-gfm.js";
import moment from "moment/moment.js";
import { getOptions } from "./default-options.js";
import { mimedb } from "./apache-mime-types.js";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

TurndownService.prototype.defaultEscape = TurndownService.prototype.escape;

// function to convert the article content to markdown using Turndown
/**
 * この関数 turndown() は、記事のコンテンツ（HTML形式）を受け取り、TurndownServiceを使用してMarkdown形式に変換します。
 * また、オプションや記事の情報も引数として受け取ります。主な処理は以下の通りです。
 *
 * 1. TurndownService のインスタンスを作成し、オプションを適用します。
 * 2. オプションによって、画像やリンクの変換方法をカスタマイズするためのルールを追加します。
 * 3. 数式やコードブロックに対応するルールを追加します。
 * 4. 最後に、turndownService.turndown(content) を使用して、HTMLコンテンツをMarkdownに変換し、必要に応じてフロントマターやバックマターを追加します。
 *
 * この関数は、HTML形式の記事コンテンツをMarkdown形式に変換し、変換後のMarkdown文字列と画像リストを返します。
 */
function turndown(content, options, article) {
  if (options.turndownEscape)
    TurndownService.prototype.escape = TurndownService.prototype.defaultEscape;
  else TurndownService.prototype.escape = (s) => s;

  var turndownService = new TurndownService(options);

  turndownService.use(turndownPluginGfm.gfm);

  turndownService.keep(["iframe", "sub", "sup"]);

  let imageList = {};
  // add an image rule
  turndownService.addRule("images", {
    filter: function (node, tdopts) {
      // if we're looking at an img node with a src
      if (node.nodeName == "IMG" && node.getAttribute("src")) {
        // get the original src
        let src = node.getAttribute("src");
        // set the new src
        node.setAttribute("src", validateUri(src, article.baseURI));

        // if we're downloading images, there's more to do.
        if (options.downloadImages) {
          // generate a file name for the image
          let imageFilename = getImageFilename(src, options, false);
          if (!imageList[src] || imageList[src] != imageFilename) {
            // if the imageList already contains this file, add a number to differentiate
            let i = 1;
            while (Object.values(imageList).includes(imageFilename)) {
              const parts = imageFilename.split(".");
              if (i == 1) parts.splice(parts.length - 1, 0, i++);
              else parts.splice(parts.length - 2, 1, i++);
              imageFilename = parts.join(".");
            }
            // add it to the list of images to download later
            imageList[src] = imageFilename;
          }
          // check if we're doing an obsidian style link
          const obsidianLink = options.imageStyle.startsWith("obsidian");
          // figure out the (local) src of the image
          const localSrc =
            options.imageStyle === "obsidian-nofolder"
              ? // if using "nofolder" then we just need the filename, no folder
                imageFilename.substring(imageFilename.lastIndexOf("/") + 1)
              : // otherwise we may need to modify the filename to uri encode parts for a pure markdown link
                imageFilename
                  .split("/")
                  .map((s) => (obsidianLink ? s : encodeURI(s)))
                  .join("/");

          // set the new src attribute to be the local filename
          if (
            options.imageStyle != "originalSource" &&
            options.imageStyle != "base64"
          )
            node.setAttribute("src", localSrc);
          // pass the filter if we're making an obsidian link (or stripping links)
          return true;
        } else return true;
      }
      // don't pass the filter, just output a normal markdown link
      return false;
    },
    replacement: function (content, node, tdopts) {
      // if we're stripping images, output nothing
      if (options.imageStyle == "noImage") return "";
      // if this is an obsidian link, so output that
      else if (options.imageStyle.startsWith("obsidian"))
        return `![[${node.getAttribute("src")}]]`;
      // otherwise, output the normal markdown link
      else {
        var alt = cleanAttribute(node.getAttribute("alt"));
        var src = node.getAttribute("src") || "";
        var title = cleanAttribute(node.getAttribute("title"));
        var titlePart = title ? ' "' + title + '"' : "";
        if (options.imageRefStyle == "referenced") {
          var id = this.references.length + 1;
          this.references.push("[fig" + id + "]: " + src + titlePart);
          return "![" + alt + "][fig" + id + "]";
        } else return src ? "![" + alt + "]" + "(" + src + titlePart + ")" : "";
      }
    },
    references: [],
    append: function (options) {
      var references = "";
      if (this.references.length) {
        references = "\n\n" + this.references.join("\n") + "\n\n";
        this.references = []; // Reset references
      }
      return references;
    },
  });

  // add a rule for links
  turndownService.addRule("links", {
    filter: (node, tdopts) => {
      // check that this is indeed a link
      if (node.nodeName == "A" && node.getAttribute("href")) {
        // get the href
        const href = node.getAttribute("href");
        // set the new href
        node.setAttribute("href", validateUri(href, article.baseURI));
        // if we are to strip links, the filter needs to pass
        return options.linkStyle == "stripLinks";
      }
      // we're not passing the filter, just do the normal thing.
      return false;
    },
    // if the filter passes, we're stripping links, so just return the content
    replacement: (content, node, tdopts) => content,
  });

  // handle multiple lines math
  turndownService.addRule("mathjax", {
    filter(node, options) {
      const id = node.id || "";
      return id.startsWith("MathJax-Element");
    },
    replacement(content, node, options) {
      const mathId = node.id.match(/MathJax-Element-(\d+)/)[1];
      const math = article.math[mathId];
      if (math.inline) return `$${math.tex}$`;
      else return `$$\n${math.tex}\n$$`;
    },
  });

  // handle <pre> as code blocks
  turndownService.addRule("pre", {
    filter: (node, tdopts) =>
      node.nodeName == "PRE" &&
      (!node.firstChild || node.firstChild.nodeName != "CODE"),
    replacement: (content, node, tdopts) => {
      const langMatch = node.id?.match(/code-lang-(.+)/);
      const lang = langMatch?.length > 0 ? langMatch[1] : "";
      return (
        "\n\n" +
        options.fence +
        (lang || "") +
        "\n" +
        node.textContent +
        "\n" +
        options.fence +
        "\n\n"
      );
    },
  });

  let markdown =
    options.frontmatter +
    turndownService.turndown(content) +
    options.backmatter;

  // strip out non-printing special characters which CodeMirror displays as a red dot
  // see: https://codemirror.net/doc/manual.html#option_specialChars
  markdown = markdown.replace(
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff\ufff9-\ufffc]/g,
    ""
  );

  return { markdown: markdown, imageList: imageList };
}

/**
 * cleanAttribute() 関数は、渡された属性値をクリーニングするために使用されます。
 * この関数は、属性値内の改行と空白をまとめて1つの改行に置き換えます。
 * 属性値が存在しない場合、空の文字列が返されます。
 *
 * 例えば、属性値に改行や余分な空白が含まれている場合、この関数を使用してクリーニングし、Markdownに変換されたときに適切なフォーマットが維持されるようにします。
 */
function cleanAttribute(attribute) {
  return attribute ? attribute.replace(/(\n+\s*)+/g, "\n") : "";
}

/**
 * validateUri() 関数は、与えられた href と baseURI を使用して、正しい完全修飾URLを返す目的で使用されます。
 * この関数は、特に相対URLがHTMLドキュメントに存在する場合に役立ちます。
 *
 * 関数は次の手順に従って動作します：
 *
 * 1. まず、href が有効なURLかどうかを確認します。有効な場合、そのまま返します。
 * 2. href が無効な場合、baseURI を使って正しいURLを生成しようとします。
 * 3. href が / で始まる場合、baseUri.origin を使用して、オリジンからの絶対URLを生成します。
 * 4. それ以外の場合、baseUri.href とローカルフォルダからの相対URLを組み合わせて、完全なURLを生成します。
 *
 * この関数は、リンクや画像のような要素のURLが正しく解決されることを保証するために使用されます。
 */
function validateUri(href, baseURI) {
  // check if the href is a valid url
  try {
    new URL(href);
  } catch {
    // if it's not a valid url, that likely means we have to prepend the base uri
    const baseUri = new URL(baseURI);

    // if the href starts with '/', we need to go from the origin
    if (href.startsWith("/")) {
      href = baseUri.origin + href;
    }
    // otherwise we need to go from the local folder
    else {
      href = baseUri.href + (baseUri.href.endsWith("/") ? "/" : "") + href;
    }
  }
  return href;
}

/**
 * getImageFilename()関数は、与えられたsrc、options、およびオプションのprependFilePath引数に基づいて、有効な画像ファイル名を生成するために使用されます。
 * この関数は、ファイル名が適切にフォーマットされ、必要なプレフィックスやファイルパス情報が含まれることを確認します。
 *
 * 関数の動作は以下の通りです。
 *
 * 1. srcで最後のスラッシュ/と最初のクエリ?の位置を見つけます。
 * 2. 前のステップで見つかった位置を使用して、srcからファイル名を抽出します。
 * 3. prependFilePathがtrueでoptions.titleに/が含まれている場合、ファイルパスをimagePrefixに追加します。それ以外の場合、prependFilePathがtrueであれば、options.titleとスラッシュをimagePrefixに追加します。
 * 4. ファイル名に;base64,が含まれている場合、画像がbase64でエンコードされていることを意味します。この場合、ファイル名を'image.'に続く適切なファイルタイプの拡張子に設定します。
 * 5. ファイル名から拡張子を抽出します。拡張子がない場合、後で処理するためのプレースホルダー拡張子（例：'.idunno'）を追加します。
 * 6. generateValidFileName()関数を使用して、有効なファイル名を生成します。この関数は、ファイル名からoptions.disallowedCharsを削除します。
 * 7. 連結されたimagePrefixと生成されたfilenameを返します。
 *
 * この関数は、マークダウン変換プロセスで画像を扱う際に役立ち、生成されたファイル名が有効で正しくフォーマットされていることを保証します。
 */
function getImageFilename(src, options, prependFilePath = true) {
  const slashPos = src.lastIndexOf("/");
  const queryPos = src.indexOf("?");
  let filename = src.substring(
    slashPos + 1,
    queryPos > 0 ? queryPos : src.length
  );

  let imagePrefix = options.imagePrefix || "";

  if (prependFilePath && options.title.includes("/")) {
    imagePrefix =
      options.title.substring(0, options.title.lastIndexOf("/") + 1) +
      imagePrefix;
  } else if (prependFilePath) {
    imagePrefix =
      options.title + (imagePrefix.startsWith("/") ? "" : "/") + imagePrefix;
  }

  if (filename.includes(";base64,")) {
    // this is a base64 encoded image, so what are we going to do for a filename here?
    filename = "image." + filename.substring(0, filename.indexOf(";"));
  }

  let extension = filename.substring(filename.lastIndexOf("."));
  if (extension == filename) {
    // there is no extension, so we need to figure one out
    // for now, give it an 'idunno' extension and we'll process it later
    filename = filename + ".idunno";
  }

  filename = generateValidFileName(filename, options.disallowedChars);

  return imagePrefix + filename;
}

// function to replace placeholder strings with article info
/**
 * textReplace()関数は、与えられた文字列内のプレースホルダー文字列を、指定されたarticleオブジェクトの情報で置き換えるために使用されます。
 * また、disallowedChars引数をオプションで受け取り、ファイル名に不適切な文字が含まれていないことを確認できます。
 * この関数は以下の手順で動作します。
 *
 * 1. articleオブジェクトの各キーに対して、keyが"content"でない場合、文字列sをarticle[key]に設定します。
 * disallowedCharsが指定されている場合、generateValidFileName()関数を使用してファイル名を検証します。
 * 2. プレースホルダー文字列をarticleオブジェクトの対応する値で置き換えます。
 * また、{key:kebab}、{key:snake}、{key:camel}、および{key:pascal}のような形式で指定された特殊な変換もサポートされます。
 * 3. 日付形式を置き換えます。
 * {date:format}形式のプレースホルダーを使用して、現在の日付を特定のフォーマットで表示できます。
 * momentライブラリを使用して日付フォーマットを生成します。
 * 4. キーワードを置き換えます。{keywords}または{keywords:separator}形式のプレースホルダーを使用して、article.keywords配列を特定の区切り文字で結合した文字列で置き換えます。
 * 5. カーリーブラケットで囲まれた残りのプレースホルダー文字列を空文字列で置き換えます。
 *
 * この関数は、マークダウンテンプレートや出力ファイル名など、プレースホルダー文字列を実際の記事情報で置き換える必要がある場合に役立ちます。
 */
function textReplace(string, article, disallowedChars = null) {
  for (const key in article) {
    if (article.hasOwnProperty(key) && key != "content") {
      let s = (article[key] || "") + "";
      if (s && disallowedChars) s = generateValidFileName(s, disallowedChars);

      string = string
        .replace(new RegExp("{" + key + "}", "g"), s)
        .replace(
          new RegExp("{" + key + ":kebab}", "g"),
          s.replace(/ /g, "-").toLowerCase()
        )
        .replace(
          new RegExp("{" + key + ":snake}", "g"),
          s.replace(/ /g, "_").toLowerCase()
        )
        .replace(
          new RegExp("{" + key + ":camel}", "g"),
          s
            .replace(/ ./g, (str) => str.trim().toUpperCase())
            .replace(/^./, (str) => str.toLowerCase())
        )
        .replace(
          new RegExp("{" + key + ":pascal}", "g"),
          s
            .replace(/ ./g, (str) => str.trim().toUpperCase())
            .replace(/^./, (str) => str.toUpperCase())
        );
    }
  }

  // replace date formats
  const now = new Date();
  const dateRegex = /{date:(.+?)}/g;
  const matches = string.match(dateRegex);
  if (matches && matches.forEach) {
    matches.forEach((match) => {
      const format = match.substring(6, match.length - 1);
      const dateString = moment(now).format(format);
      string = string.replaceAll(match, dateString);
    });
  }

  // replace keywords
  const keywordRegex = /{keywords:?(.*)?}/g;
  const keywordMatches = string.match(keywordRegex);
  if (keywordMatches && keywordMatches.forEach) {
    keywordMatches.forEach((match) => {
      let seperator = match.substring(10, match.length - 1);
      try {
        seperator = JSON.parse(
          JSON.stringify(seperator).replace(/\\\\/g, "\\")
        );
      } catch {
        /* empty */
      }
      const keywordsString = (article.keywords || []).join(seperator);
      string = string.replace(
        new RegExp(match.replace(/\\/g, "\\\\"), "g"),
        keywordsString
      );
    });
  }

  // replace anything left in curly braces
  const defaultRegex = /{(.*?)}/g;
  string = string.replace(defaultRegex, "");

  return string;
}

/**
 * convertArticleToMarkdown()関数は、与えられたarticle情報オブジェクトをマークダウン形式に変換します。
 * この関数は、オプションを取得し、必要に応じて画像をダウンロードして、フロントマターやバックマターを含めることができます。
 *
 * 関数の手順は以下の通りです。
 *
 * 1. getOptions()を使用してオプションを取得します。downloadImages引数がnullでない場合、オプションのdownloadImagesプロパティにdownloadImages引数を設定します。
 * 2. options.includeTemplateがtrueの場合、フロントマターとバックマターのテンプレートを記事情報で置き換えます。そうでない場合、フロントマターとバックマターは空文字列になります。
 * 3. options.imagePrefixを記事情報で置き換え、不適切な文字を削除します。
 * 4. turndown()関数を使用して、記事のコンテンツをマークダウン形式に変換します。オプションと記事情報も渡されます。
 * 5. options.downloadImagesがtrueで、options.downloadModeがdownloadsApiの場合、preDownloadImages()関数を使用して画像を事前にダウンロードします。
 *
 * この関数は、記事情報オブジェクトをマークダウン形式に変換し、必要に応じて画像をダウンロードして記事の前後に追加情報を含めるために使用されます。
 */
export async function convertArticleToMarkdown(article, downloadImages = null) {
  const options = await getOptions();
  if (downloadImages != null) {
    options.downloadImages = downloadImages;
  }

  // substitute front and backmatter templates if necessary
  if (options.includeTemplate) {
    options.frontmatter = textReplace(options.frontmatter, article) + "\n";
    options.backmatter = "\n" + textReplace(options.backmatter, article);
  } else {
    options.frontmatter = options.backmatter = "";
  }

  options.imagePrefix = textReplace(
    options.imagePrefix,
    article,
    options.disallowedChars
  )
    .split("/")
    .map((s) => generateValidFileName(s, options.disallowedChars))
    .join("/");

  let result = turndown(article.content, options, article);
  if (options.downloadImages && options.downloadMode == "downloadsApi") {
    // pre-download the images
    result = await preDownloadImages(result.imageList, result.markdown);
  }
  return result;
}

// function to turn the title into a valid file name
/**
 * generateValidFileName()関数は、与えられたタイトルを有効なファイル名に変換します。disallowedChars引数は、ファイル名から削除すべき追加の不適切な文字を指定することができます。
 *
 * 関数は以下の手順で動作します。
 *
 * 1. タイトルが存在しない場合は、そのまま返します。存在する場合は、タイトルを文字列に変換します。
 * 2. <、>、:、"、/、\、|、?、*を含むすべての不適切な文字を削除します。
 * 3. ノンブレーキングスペースを通常のスペースに置き換えます。
 * 4. disallowedCharsが指定されている場合、その文字をファイル名から削除します。正規表現で特殊な意味を持つ文字はエスケープされます。
 *
 * この関数は、与えられたタイトルを適切なファイル名に変換し、不適切な文字を削除するために使用されます。
 */
function generateValidFileName(title, disallowedChars = null) {
  if (!title) return title;
  else title = title + "";
  // remove < > : " / \ | ? *
  // eslint-disable-next-line no-useless-escape
  var illegalRe = /[\/\?<>\\:\*\|":]/g;
  // and non-breaking spaces (thanks @Licat)
  var name = title
    .replace(illegalRe, "")
    .replace(new RegExp("\u00A0", "g"), " ");

  if (disallowedChars) {
    for (let c of disallowedChars) {
      if (`[\\^$.|?*+()`.includes(c)) c = `\\${c}`;
      name = name.replace(new RegExp(c, "g"), "");
    }
  }

  return name;
}

/**
 * preDownloadImages()関数は、画像リストとマークダウンを受け取り、画像を事前にダウンロードし、必要に応じてマークダウン内のURLを更新します。これにより、ダウンロードした画像の適切なファイル拡張子をマークダウンに含めることができます。
 *
 * 関数は以下の手順で動作します。
 *
 * 1. 現在のオプションを取得します。
 * 2. 画像リスト内の各画像に対して、XHRリクエストを作成して画像を取得し、Blobとして保存します。
 * 3. 画像がbase64形式で保存される場合、BlobをDataURLに変換し、マークダウン内の対応する画像URLを置き換えます。
 * 4. 画像がbase64以外の形式で保存される場合、不明なファイル拡張子を、MIMEタイプに基づいて適切な拡張子に置き換えます。マークダウン内の画像URLも、新しいファイル名に置き換えます。
 * 5. BlobをオブジェクトURLに変換し、新しい画像リストに追加します。
 *
 * この関数は、画像のダウンロードとマークダウン内のURLの更新を管理するために使用されます。最終的に、新しい画像リストと更新されたマークダウンが返されます。
 */
export async function preDownloadImages(imageList, markdown) {
  const options = await getOptions();
  let newImageList = {};
  // originally, I was downloading the markdown file first, then all the images
  // however, in some cases we need to download images *first* so we can get the
  // proper file extension to put into the markdown.
  // so... here we are waiting for all the downloads and replacements to complete
  await Promise.all(
    Object.entries(imageList).map(
      ([src, filename]) =>
        new Promise((resolve, reject) => {
          // we're doing an xhr so we can get it as a blob and determine filetype
          // before the final save
          const xhr = new XMLHttpRequest();
          xhr.open("GET", src);
          xhr.responseType = "blob";
          xhr.onload = async function () {
            // here's the returned blob
            const blob = xhr.response;

            if (options.imageStyle == "base64") {
              var reader = new FileReader();
              reader.onloadend = function () {
                markdown = markdown.replaceAll(src, reader.result);
                resolve();
              };
              reader.readAsDataURL(blob);
            } else {
              let newFilename = filename;
              if (newFilename.endsWith(".idunno")) {
                // replace any unknown extension with a lookup based on mime type
                newFilename = filename.replace(
                  ".idunno",
                  "." + mimedb[blob.type]
                );

                // and replace any instances of this in the markdown
                // remember to url encode for replacement if it's not an obsidian link
                if (!options.imageStyle.startsWith("obsidian")) {
                  markdown = markdown.replaceAll(
                    filename
                      .split("/")
                      .map((s) => encodeURI(s))
                      .join("/"),
                    newFilename
                      .split("/")
                      .map((s) => encodeURI(s))
                      .join("/")
                  );
                } else {
                  markdown = markdown.replaceAll(filename, newFilename);
                }
              }

              // create an object url for the blob (no point fetching it twice)
              const blobUrl = URL.createObjectURL(blob);

              // add this blob into the new image list
              newImageList[blobUrl] = newFilename;

              // resolve this promise now
              // (the file might not be saved yet, but the blob is and replacements are complete)
              resolve();
            }
          };
          xhr.onerror = function () {
            reject("A network error occurred attempting to download " + src);
          };
          xhr.send();
        })
    )
  );

  return { imageList: newImageList, markdown: markdown };
}

// get Readability article info from the dom passed in
/**
 * この関数は、与えられたDOM文字列から記事情報を取得する機能を提供します。
 * 関数では、DOMParserを使用してDOMを解析し、さまざまなタグを検出して処理します。
 * その後、Readabilityライブラリを使用して記事を抽出し、記事情報を整理して返します。
 *
 * 1. DOMParser インスタンスを作成し、domString を解析して dom に格納します。
 * 2. MathJax、KaTeX、コードハイライトなどの要素を見つけて情報を保存します。
 * 3. <pre> タグの中の <br> タグを保持するために、<br-keep> タグに置き換えます。
 * 4. Readabilityライブラリを使用して、DOMを簡略化した記事に変換し、article に格納します。
 * 5. 記事に関連するさまざまな情報（ベースURI、ページタイトル、URL情報など）を抽出し、article オブジェクトに追加します。
 * 6. 記事のキーワードとメタタグを取得し、article オブジェクトに追加します。
 * 7. 最後に、article オブジェクトを返します。
 *
 * この関数を使用することで、与えられたDOM文字列から記事の情報を効率的に抽出し、整理することができます。
 */
export async function getArticleFromDom(domString) {
  // parse the dom
  const { window } = new JSDOM(domString);
  const { document } = window;

  if (document.documentElement.nodeName == "parsererror") {
    console.error("error while parsing");
  }

  const math = {};
  document.body
    .querySelectorAll("script[id^=MathJax-Element-]")
    ?.forEach((mathSource) => {
      const mathId = mathSource.id.match(/MathJax-Element-(\d+)/)[1];
      if (mathId) {
        let tex = mathSource.innerText.trim();
        tex = tex.replaceAll("\xa0", " ");

        const type = mathSource.attributes.type.value;
        math[mathId] = {
          tex,
          inline: type ? !type.includes("mode=display") : false,
        };
      }
    });

  document.body
    .querySelectorAll("[class*=highlight-text],[class*=highlight-source]")
    ?.forEach((codeSource) => {
      const language = codeSource.className.match(
        /highlight-(?:text|source)-([a-z0-9]+)/
      )?.[1];
      if (codeSource.firstChild.nodeName == "PRE") {
        codeSource.firstChild.id = `code-lang-${language}`;
      }
    });

  // simplify the dom into an article
  const article = new Readability(document).parse();
  // get the base uri from the dom and attach it as important article info
  article.baseURI = document.baseURI;
  // also grab the page title
  article.pageTitle = document.title;
  // and some URL info
  const url = new URL(document.baseURI);
  article.hash = url.hash;
  article.host = url.host;
  article.origin = url.origin;
  article.hostname = url.hostname;
  article.pathname = url.pathname;
  article.port = url.port;
  article.protocol = url.protocol;
  article.search = url.search;

  // make sure the dom has a head
  if (document.head) {
    // and the keywords, should they exist, as an array
    article.keywords = document.head
      .querySelector('meta[name="keywords"]')
      ?.content?.split(",")
      ?.map((s) => s.trim());

    // add all meta tags, so users can do whatever they want
    document.head
      .querySelectorAll("meta[name][content], meta[property][content]")
      ?.forEach((meta) => {
        const key = meta.getAttribute("name") || meta.getAttribute("property");
        const val = meta.getAttribute("content");
        if (key && val && !article[key]) {
          article[key] = val;
        }
      });
  }

  article.math = math;

  // return the article
  return article;
}

// function to apply the title template
/**
 * この関数は、記事タイトルにタイトルテンプレートを適用する機能を提供します。
 * 記事タイトルは、オプションで指定された不許可文字とスラッシュ（/）を置換・削除した後、適切なファイル名として生成されます。
 *
 * 1. まず、getOptions() を使用してオプションを取得します。
 * 2. textReplace() 関数を使用して、オプションで指定された不許可文字とスラッシュ（/）を置換・削除し、タイトルを生成します。
 * 3. タイトルをスラッシュで分割し、各部分に対して generateValidFileName() 関数を適用して、不許可文字を削除します。最後に、部分をスラッシュで再び結合して、適切なファイル名を生成します。
 * 4. 最後に、生成されたタイトルを返します。
 *
 * この関数を使用することで、記事タイトルにタイトルテンプレートを適用し、適切なファイル名として生成できます。
 */
export async function formatTitle(article) {
  let options = await getOptions();

  let title = textReplace(
    options.title,
    article,
    options.disallowedChars + "/"
  );
  title = title
    .split("/")
    .map((s) => generateValidFileName(s, options.disallowedChars))
    .join("/");
  return title;
}

/**
 * String.prototype.replaceAll() polyfill
 * https://gomakethings.com/how-to-replace-a-section-of-a-string-with-another-one-with-vanilla-js/
 * @author Chris Ferdinandi
 * @license MIT
 */
if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function (str, newStr) {
    // If a regex pattern
    if (
      Object.prototype.toString.call(str).toLowerCase() === "[object regexp]"
    ) {
      return this.replace(str, newStr);
    }

    // If a string
    return this.replace(new RegExp(str, "g"), newStr);
  };
}
