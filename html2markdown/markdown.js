// import { TurndownService } from "./turndown_cloned.js";
import TurndownService from "turndown";
import { turndownPluginGfm } from "./turndown-plugin-gfm.js";
import moment from "moment/moment.js";
import { getOptions } from "./default-options.js";
import { mimedb } from "./apache-mime-types.js";
import { Readability } from "./Readability.js";
import { JSDOM } from "jsdom";

const browser = {};
const chrome = {};

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

  // どの要素を保持し、HTMLとしてレンダリングするかを決定します。
  // デフォルトでは、Turndownはいかなる要素も保持しません。
  turndownService.keep(["iframe", "sub", "sup", "u", "ins", "small", "big"]);

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
      return article.math.hasOwnProperty(node.id);
    },
    replacement(content, node, options) {
      const math = article.math[node.id];
      let tex = math.tex.trim().replaceAll("\xa0", "");

      if (math.inline) {
        tex = tex.replaceAll("\n", " ");
        return `$${tex}$`;
      } else return `$$\n${tex}\n$$`;
    },
  });

  function repeat(character, count) {
    return Array(count + 1).join(character);
  }

  function stripHTMLTags(str) {
    return str.replace(/<\/?[^>]+(>|$)/g, "");
  }

  /**
   * この関数は、指定されたDOMノード（node）をMarkdown形式のフェンス付きコードブロックに変換する役割を持ちます。以下で各部分の機能について説明します。
   *
   * 1. まず、node.innerHTML内の<br-keep></br-keep>タグを通常の<br>タグに置換します。これにより、以前削除された<br>タグが復元されます。
   * 2. 次に、node.idを使って、指定されたノードが持つコード言語を特定します。正規表現/code-lang-(.+)/を使用して、コード言語が含まれるIDを探し、言語名をlanguage変数に格納します。
   * 3. language変数が存在する場合、一時的にdiv要素を作成し、nodeをその子要素として追加します。これにより、nodeのテキスト内容をcode変数に取得できます。言語名が存在しない場合、node.innerHTMLを直接code変数に格納します。
   * 4. オプションからフェンスの文字を取得し、フェンスサイズを初期値3に設定します。正規表現を使って、コード内に既に存在するフェンス文字列を探します。
   * 5. コード内のフェンス文字列の長さがフェンスサイズ以上である場合、フェンスサイズを現在のフェンス文字列の長さ+1に更新します。これにより、新しく追加されるフェンス文字列がコード内のフェンス文字列と衝突しないようにします。
   * 6. 更新されたフェンスサイズをもとに、フェンス文字を繰り返して新しいフェンス文字列を生成します。
   * 7. 最後に、フェンス文字列、言語名、コード本体を組み合わせて、Markdown形式のフェンス付きコードブロックを生成し、返します。
   *
   * この関数は、与えられたDOMノードを適切なMarkdown形式のフェンス付きコードブロックに変換することで、Markdownファイル内でのコード表示を綺麗に整形する役割があります。
   */
  function convertToFencedCodeBlock(node, options) {
    node.innerHTML = node.innerHTML.replaceAll("<br-keep></br-keep>", "<br>");
    const langMatch = node.id?.match(/code-lang-(.+)/);
    const language = langMatch?.length > 0 ? langMatch[1] : "";

    var code;

    if (language) {
      var div = document.createElement("div");
      document.body.appendChild(div);
      div.appendChild(node);
      code = node.innerText;
      div.remove();
    } else {
      code = node.innerHTML;
    }

    var fenceChar = options.fence.charAt(0);
    var fenceSize = 3;
    var fenceInCodeRegex = new RegExp("^" + fenceChar + "{3,}", "gm");

    var match;
    while ((match = fenceInCodeRegex.exec(code))) {
      if (match[0].length >= fenceSize) {
        fenceSize = match[0].length + 1;
      }
    }

    var fence = repeat(fenceChar, fenceSize);

    return (
      "\n\n" +
      fence +
      language +
      "\n" +
      stripHTMLTags(code.replace(/\n$/, "")) +
      "\n" +
      fence +
      "\n\n"
    );
  }

  /**
   * このコードは、Turndownサービス（HTMLをMarkdownに変換するツール）にカスタムルール「fencedCodeBlock」を追加しています。このルールは、フェンス付きコードブロックの変換方法を指定することを目的としています。
   *
   * 1. filter関数：この関数は、指定されたノードがカスタムルールに適用されるべきかどうかを判断します。次の条件がすべて満たされる場合、このルールを適用します。
   *     - options.codeBlockStyleが"fenced"であること。
   *     - 対象のノード（node）の名前が"PRE"であること。
   *     - ノードに子要素が存在すること。
   *     - 子要素の名前が"CODE"であること。
   * 2. replacement関数：この関数は、filter関数で適用が認められたノードに対して実際に行う変換処理を定義します。この場合、convertToFencedCodeBlock関数を呼び出して、対象ノードの最初の子要素（node.firstChild）をMarkdown形式のフェンス付きコードブロックに変換します。変換オプションも引数として渡します
   *
   * このカスタムルールをTurndownサービスに追加することで、HTML内の<pre>タグで囲まれた<code>タグを持つ要素をMarkdownのフェンス付きコードブロックに適切に変換することができます。
   */
  turndownService.addRule("fencedCodeBlock", {
    filter: function (node, options) {
      return (
        options.codeBlockStyle === "fenced" &&
        node.nodeName === "PRE" &&
        node.firstChild &&
        node.firstChild.nodeName === "CODE"
      );
    },
    replacement: function (content, node, options) {
      return convertToFencedCodeBlock(node.firstChild, options);
    },
  });

  // handle <pre> as code blocks
  turndownService.addRule("pre", {
    filter: (node, tdopts) =>
      node.nodeName == "PRE" &&
      (!node.firstChild || node.firstChild.nodeName != "CODE"),
    replacement: (content, node, tdopts) => {
      return convertToFencedCodeBlock(node, tdopts);
    },
  });

  let markdown =
    options.frontmatter +
    turndownService.turndown(content) +
    options.backmatter;

  // CodeMirrorが赤い点として表示する非印刷の特殊文字を取り除く
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

// function to actually download the markdown file
/**
 * downloadMarkdown() 関数は、マークダウンテキスト、タイトル、タブID、画像リスト、およびmdClipsフォルダを受け取り、マークダウンファイルをダウンロードします。
 * この関数は、ダウンロードモードに応じて、異なる方法でダウンロードを実行します。
 *
 * 1. ダウンロードAPI（downloadsApi）を使用してダウンロードする場合:
 * - マークダウンデータのBlobからオブジェクトURLを作成します。
 * - ダウンロードを開始し、ダウンロードの完了をリスナーに通知します。
 * - オプションで画像のダウンロードが有効になっている場合、画像をダウンロードします。
 * - ダウンロードの完了をリスナーに通知します。
 * 2. コンテンツリンクを介してダウンロードする場合:
 * - タブIDでスクリプトを実行できることを確認します。
 * - タイトルを適切なファイル名に変換し、拡張子を追加します。
 * - マークダウンをBase64形式でエンコードし、ダウンロード関数を実行するコードを作成します。
 * - タブでスクリプトを実行し、ダウンロードを開始します。
 *
 * 関数は、指定されたダウンロードモードに応じて、マークダウンファイルをダウンロードし、ダウンロードが完了したらリスナーに通知します。
 */
export async function downloadMarkdown(
  markdown,
  title,
  tabId,
  imageList = {},
  mdClipsFolder = ""
) {
  // get the options
  const options = await getOptions();

  // download via the downloads API
  if (options.downloadMode == "downloadsApi" && browser.downloads) {
    // create the object url with markdown data as a blob
    const url = URL.createObjectURL(
      new Blob([markdown], {
        type: "text/markdown;charset=utf-8",
      })
    );

    try {
      if (mdClipsFolder && !mdClipsFolder.endsWith("/")) mdClipsFolder += "/";
      // start the download
      const id = await browser.downloads.download({
        url: url,
        filename: mdClipsFolder + title + ".md",
        saveAs: options.saveAs,
      });

      // add a listener for the download completion
      browser.downloads.onChanged.addListener(downloadListener(id, url));

      // download images (if enabled)
      if (options.downloadImages) {
        // get the relative path of the markdown file (if any) for image path
        let destPath =
          mdClipsFolder + title.substring(0, title.lastIndexOf("/"));
        if (destPath && !destPath.endsWith("/")) destPath += "/";
        Object.entries(imageList).forEach(async ([src, filename]) => {
          // start the download of the image
          const imgId = await browser.downloads.download({
            url: src,
            // set a destination path (relative to md file)
            filename: destPath ? destPath + filename : filename,
            saveAs: false,
          });
          // add a listener (so we can release the blob url)
          browser.downloads.onChanged.addListener(downloadListener(imgId, src));
        });
      }
    } catch (err) {
      console.error("Download failed", err);
    }
  }
  // // download via obsidian://new uri
  // else if (options.downloadMode == 'obsidianUri') {
  //   try {
  //     await ensureScripts(tabId);
  //     let uri = 'obsidian://new?';
  //     uri += `${options.obsidianPathType}=${encodeURIComponent(title)}`;
  //     if (options.obsidianVault) uri += `&vault=${encodeURIComponent(options.obsidianVault)}`;
  //     uri += `&content=${encodeURIComponent(markdown)}`;
  //     let code = `window.location='${uri}'`;
  //     await browser.tabs.executeScript(tabId, {code: code});
  //   }
  //   catch (error) {
  //     // This could happen if the extension is not allowed to run code in
  //     // the page, for example if the tab is a privileged page.
  //     console.error("Failed to execute script: " + error);
  //   };

  // }
  // download via content link
  else {
    try {
      await ensureScripts(tabId);
      const filename =
        mdClipsFolder +
        generateValidFileName(title, options.disallowedChars) +
        ".md";
      const code = `downloadMarkdown("${filename}","${base64EncodeUnicode(
        markdown
      )}");`;
      await browser.tabs.executeScript(tabId, { code: code });
    } catch (error) {
      // This could happen if the extension is not allowed to run code in
      // the page, for example if the tab is a privileged page.
      console.error("Failed to execute script: " + error);
    }
  }
}

/**
 * downloadListener 関数は、指定されたダウンロードIDとURLを受け取り、ダウンロードが完了したことを検出するリスナーを返します。
 * このリスナーは、対応するダウンロードの状態が「完了」になった場合に次のことを行います。
 *
 * 1. リスナー自体をブラウザのダウンロード変更イベントリスナーから削除します。これにより、他のダウンロードが完了したときにリスナーが誤って実行されることを防ぎます。
 * 2. Blob用に作成されたオブジェクトURLを解放します。これにより、ブラウザのメモリが解放され、リソースが適切に破棄されます。
 *
 * この関数は、ダウンロードが完了したときにリソースを解放し、リスナーの削除を行うために使用されます。これにより、ダウンロードの完了を監視し、不要になったリソースを解放することができます。
 */
function downloadListener(id, url) {
  const self = (delta) => {
    if (delta.id === id && delta.state && delta.state.current == "complete") {
      // detatch this listener
      browser.downloads.onChanged.removeListener(self);
      //release the url for the blob
      URL.revokeObjectURL(url);
    }
  };
  return self;
}

/**
 * base64EncodeUnicode関数は、与えられたUnicode文字列strをBase64にエンコードするために使用されます。この関数は以下の手順で動作します：
 *
 * 1. encodeURIComponentを使用して文字列をエスケープし、文字のUTF-8エンコーディングを取得します。
 * 2. パーセントエンコーディングを生のバイトに変換し、それをbtoa()関数に追加します。
 *
 * encodeURIComponentは、非ASCII文字を含む文字列を正しくエンコードするために使用されます。
 * これは、Base64エンコーディングがASCII文字のみをサポートしているため、特に重要です。
 * 最終的に、btoa()関数がUTF-8エンコーディングされたバイトをBase64文字列に変換します。
 * この関数は、Base64エンコーディングが必要な場合に使用されます（たとえば、データURLで画像データをエンコードする場合など）。
 */
export function base64EncodeUnicode(str) {
  // Firstly, escape the string using encodeURIComponent to get the UTF-8 encoding of the characters,
  // Secondly, we convert the percent encodings into raw bytes, and add it to btoa() function.
  const utf8Bytes = encodeURIComponent(str).replace(
    /%([0-9A-F]{2})/g,
    function (match, p1) {
      return String.fromCharCode("0x" + p1);
    }
  );

  return btoa(utf8Bytes);
}

//function that handles messages from the injected script into the site
/**
 * notify関数は、サイトにインジェクトされたスクリプトからのメッセージを処理します。この関数は主に2種類のメッセージに対応しています。
 *
 * 1. "clip"メッセージ:
 * - これは、DOMのクリッピングを開始するためのメッセージです。
 * - まず、getArticleFromDom関数を使用して、渡されたDOMから記事情報を取得します。
 * - 次に、選択した内容が渡され、選択範囲をクリップするように指示された場合、記事の内容を置き換えます。
 * - 記事をMarkdown形式に変換し、記事のタイトルを整形し、mdClipsフォルダのフォーマットを整えます。
 * - 最後に、ポップアップにデータを表示するようにbrowser.runtime.sendMessageを呼び出します。
 * 2. "download"メッセージ:
 * - これは、ダウンロードをトリガーするためのメッセージです。
 * - downloadMarkdown関数を呼び出して、Markdownファイルをダウンロードします。この関数は、Markdownデータ、タイトル、タブID、画像リスト、およびmdClipsフォルダを引数として受け取ります。
 *
 * この関数は、Webページからの情報を受け取り、Markdown形式に変換して表示およびダウンロードするために使用されます。
 */
export async function notify(message) {
  const options = await this.getOptions();
  // message for initial clipping of the dom
  if (message.type == "clip") {
    // get the article info from the passed in dom
    const article = await getArticleFromDom(message.dom);

    // if selection info was passed in (and we're to clip the selection)
    // replace the article content
    if (message.selection && message.clipSelection) {
      article.content = message.selection;
    }

    // convert the article to markdown
    const { markdown, imageList } = await convertArticleToMarkdown(article);

    // format the title
    article.title = await formatTitle(article);

    // format the mdClipsFolder
    const mdClipsFolder = await formatMdClipsFolder(article);

    // display the data in the popup
    await browser.runtime.sendMessage({
      type: "display.md",
      markdown: markdown,
      article: article,
      imageList: imageList,
      mdClipsFolder: mdClipsFolder,
    });
  }
  // message for triggering download
  else if (message.type == "download") {
    downloadMarkdown(
      message.markdown,
      message.title,
      message.tab.id,
      message.imageList,
      message.mdClipsFolder
    );
  }
}

/**
 * このコードは、browser.commands.onCommandイベントリスナーを使用して、コマンドに基づいて異なる機能を実行します。
 * コマンドは、拡張機能のショートカットキーによってトリガーされます。
 * このリスナーは、次のコマンドに対応しています。
 *
 * 1. "download_tab_as_markdown":
 * - タブ全体をMarkdown形式でダウンロードします。
 * - downloadMarkdownFromContext関数を呼び出します。
 * 2. "copy_tab_as_markdown":
 * - タブ全体をMarkdown形式でクリップボードにコピーします。
 * - copyMarkdownFromContext関数を呼び出します。
 * 3. "copy_selection_as_markdown":
 * - 選択範囲をMarkdown形式でクリップボードにコピーします。
 * - copyMarkdownFromContext関数を呼び出します。
 * 4. "copy_tab_as_markdown_link":
 * - タブ全体をMarkdownリンクとしてクリップボードにコピーします。
 * - copyTabAsMarkdownLink関数を呼び出します。
 * 5. "copy_selection_to_obsidian":
 * - 選択範囲をMarkdown形式でObsidianにコピーします。
 * - copyMarkdownFromContext関数を呼び出します。
 * 6. "copy_tab_to_obsidian":
 * - タブ全体をMarkdown形式でObsidianにコピーします。
 * - copyMarkdownFromContext関数を呼び出します。
 *
 * 各コマンドは、それに対応する関数を呼び出すために使用されます。
 * これにより、ユーザーはショートカットキーを使用して、Webページ全体または選択範囲をMarkdown形式でダウンロード、コピー、またはObsidianに転送できます。
 */
// browser.commands.onCommand.addListener(function (command) {
//   const tab = browser.tabs.getCurrent();
//   if (command == "download_tab_as_markdown") {
//     const info = { menuItemId: "download-markdown-all" };
//     downloadMarkdownFromContext(info, tab);
//   } else if (command == "copy_tab_as_markdown") {
//     const info = { menuItemId: "copy-markdown-all" };
//     copyMarkdownFromContext(info, tab);
//   } else if (command == "copy_selection_as_markdown") {
//     const info = { menuItemId: "copy-markdown-selection" };
//     copyMarkdownFromContext(info, tab);
//   } else if (command == "copy_tab_as_markdown_link") {
//     copyTabAsMarkdownLink(tab);
//   } else if (command == "copy_selection_to_obsidian") {
//     const info = { menuItemId: "copy-markdown-obsidian" };
//     copyMarkdownFromContext(info, tab);
//   } else if (command == "copy_tab_to_obsidian") {
//     const info = { menuItemId: "copy-markdown-obsall" };
//     copyMarkdownFromContext(info, tab);
//   }
// });

// click handler for the context menus
/**
 * このコードスニペットは、ブラウザのコンテキストメニューのクリックイベントリスナーです。
 * クリックイベントをリッスンし、クリックされたメニューアイテムに基づいて適切な関数を呼び出します。
 * このリスナーで処理されるメニューアイテムのアクションは次のとおりです。
 * 1. "copy-markdown"：
 * - クリップボードへのコピーを処理します。
 * - copyMarkdownFromContext関数を呼び出します。
 * 2. "download-markdown-alltabs"と"tab-download-markdown-alltabs"：
 * - すべてのタブのマークダウンをダウンロードします。
 * - downloadMarkdownForAllTabs関数を呼び出します。
 * 3. "download-markdown"：
 * - ダウンロードコマンドを処理します。
 * - downloadMarkdownFromContext関数を呼び出します。
 * 4. "copy-tab-as-markdown-link-all"と"copy-tab-as-markdown-link"：
 * - タブをマークダウンリンクとしてコピーします。
 * - すべてのタブに対してcopyTabAsMarkdownLinkAll関数を呼び出すか、現在のタブに対してcopyTabAsMarkdownLink関数を呼び出します。
 * 5. "toggle-"と"tabtoggle-"：
 * - 設定を切り替えます。
 * - toggleSetting関数を呼び出します。
 *
 * ユーザーがコンテキストメニューの項目をクリックすると、このリスナーは適切なアクションを特定し、対応する関数を呼び出します。
 * これにより、ユーザーは必要に応じてダウンロード、コピー、または設定を変更できます。
 */
// browser.contextMenus.onClicked.addListener(function (info, tab) {
//   // one of the copy to clipboard commands
//   if (info.menuItemId.startsWith("copy-markdown")) {
//     copyMarkdownFromContext(info, tab);
//   } else if (
//     info.menuItemId == "download-markdown-alltabs" ||
//     info.menuItemId == "tab-download-markdown-alltabs"
//   ) {
//     downloadMarkdownForAllTabs(info);
//   }
//   // one of the download commands
//   else if (info.menuItemId.startsWith("download-markdown")) {
//     downloadMarkdownFromContext(info, tab);
//   }
//   // copy tab as markdown link
//   else if (info.menuItemId.startsWith("copy-tab-as-markdown-link-all")) {
//     copyTabAsMarkdownLinkAll(tab);
//   } else if (info.menuItemId.startsWith("copy-tab-as-markdown-link")) {
//     copyTabAsMarkdownLink(tab);
//   }
//   // a settings toggle command
//   else if (
//     info.menuItemId.startsWith("toggle-") ||
//     info.menuItemId.startsWith("tabtoggle-")
//   ) {
//     toggleSetting(info.menuItemId.split("-")[1]);
//   }
// });

// this function toggles the specified option
/**
 * この関数は、指定されたオプションを切り替える機能を提供します。
 * オプションオブジェクトが渡されていない場合は、関数内で新しいオプションオブジェクトを取得します。
 *
 * 1. setting パラメータには、切り替えるべきオプション名が渡されます。
 * 2. options パラメータは、オプションオブジェクトを含みます。このオブジェクトが指定されていない場合は、getOptions関数を使ってオプションを取得します。
 * 3. 関数内で、指定された設定をトグルし、それをブラウザストレージに保存します。
 * 4. includeTemplate または downloadImages の設定が切り替えられた場合、関連するコンテキストメニュー項目も更新されます。browser.contextMenus.updateを使用して、checkedプロパティをオプションの新しい値に設定します。これにより、メニューのチェックマークが正確に反映されます。
 *
 * この関数を使用することで、アプリケーションのオプションを容易に切り替えることができます。
 */
export async function toggleSetting(setting, options = null) {
  // if there's no options object passed in, we need to go get one
  if (options == null) {
    // get the options from storage and toggle the setting
    await toggleSetting(setting, await getOptions());
  } else {
    // toggle the option and save back to storage
    options[setting] = !options[setting];
    await browser.storage.sync.set(options);
    if (setting == "includeTemplate") {
      browser.contextMenus.update("toggle-includeTemplate", {
        checked: options.includeTemplate,
      });
      try {
        browser.contextMenus.update("tabtoggle-includeTemplate", {
          checked: options.includeTemplate,
        });
      } catch {
        /* empty */
      }
    }

    if (setting == "downloadImages") {
      browser.contextMenus.update("toggle-downloadImages", {
        checked: options.downloadImages,
      });
      try {
        browser.contextMenus.update("tabtoggle-downloadImages", {
          checked: options.downloadImages,
        });
      } catch {
        /* empty */
      }
    }
  }
}

// this function ensures the content script is loaded (and loads it if it isn't)
/**
 * この関数は、content scriptが読み込まれていることを確認し、もし読み込まれていなければ読み込む機能を提供します。
 * content scriptは、ウェブページ上で実行されるJavaScriptコードで、ウェブページのDOM操作や情報の取得に使用されます。
 *
 * 1. tabId パラメータには、現在のタブのIDが渡されます。
 * 2. browser.tabs.executeScript を使用して、getSelectionAndDom という関数が定義されているかどうかをチェックします。結果はresultsに格納されます。
 * 3. results が存在し、results[0] がtrueである場合、content scriptがすでに読み込まれていると判断します。
 * 4. content scriptが読み込まれていない場合、browser.tabs.executeScript を使用してcontentScript.jsを読み込みます。これにより、getSelectionAndDom関数が定義されます。
 *
 * この関数を使用することで、content scriptが必要に応じて正確に読み込まれることを確認できます。
 */
export async function ensureScripts(tabId) {
  const results = await browser.tabs.executeScript(tabId, {
    code: "typeof getSelectionAndDom === 'function';",
  });
  // The content script's last expression will be true if the function
  // has been defined. If this is not the case, then we need to run
  // pageScraper.js to define function getSelectionAndDom.
  if (!results || results[0] !== true) {
    await browser.tabs.executeScript(tabId, {
      file: "/contentScript/contentScript.js",
    });
  }
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

  const storeMathInfo = (el, mathInfo) => {
    let randomId = URL.createObjectURL(new Blob([]));
    randomId = randomId.substring(randomId.length - 36);
    el.id = randomId;
    math[randomId] = mathInfo;
  };

  document.body
    .querySelectorAll("script[id^=MathJax-Element-]")
    ?.forEach((mathSource) => {
      const type = mathSource.attributes.type.value;
      storeMathInfo(mathSource, {
        tex: mathSource.innerText,
        inline: type ? !type.includes("mode=display") : false,
      });
    });

  document.body.querySelectorAll(".katex-mathml")?.forEach((kaTeXNode) => {
    storeMathInfo(kaTeXNode, {
      tex: kaTeXNode.querySelector("annotation").textContent,
      inline: true,
    });
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

  document.body
    .querySelectorAll("[class*=language-]")
    ?.forEach((codeSource) => {
      const language = codeSource.className.match(/language-([a-z0-9]+)/)?.[1];
      codeSource.id = `code-lang-${language}`;
    });

  document.body.querySelectorAll("pre br")?.forEach(
    (br) =>
      // we need to keep <br> tags because they are removed by Readability.js
      (br.outerHTML = "<br-keep></br-keep>")
  );

  document.body.querySelectorAll(".codehilite > pre")?.forEach((codeSource) => {
    if (
      codeSource.firstChild.nodeName !== "CODE" &&
      !codeSource.className.includes("language")
    ) {
      codeSource.id = `code-lang-text`;
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

// get Readability article info from the content of the tab id passed in
// `selection` is a bool indicating whether we should just get the selected text
/**
 * この関数は、指定されたタブIDのコンテンツから記事情報を取得する機能を提供します。
 * 選択したテキストのみを取得するかどうかを指定する selection パラメータがあります。
 *
 * 1. タブIDを使用して、コンテンツスクリプト関数 getSelectionAndDom() を実行します。結果は results に格納されます。
 * 2. 結果が有効であることを確認します。有効であれば、getArticleFromDom() 関数を使用して、記事情報を取得します。
 * 3. selection が true であり、選択したテキストがある場合、記事のコンテンツを選択したテキストに置き換えます。
 * 4. 最後に、記事情報が格納された article オブジェクトを返します。
 *
 * この関数を使用することで、指定されたタブIDのコンテンツから記事情報を取得し、選択したテキストを含めるかどうかを制御できます。
 */
export async function getArticleFromContent(tabId, selection = false) {
  // run the content script function to get the details
  const results = await browser.tabs.executeScript(tabId, {
    code: "getSelectionAndDom()",
  });

  // make sure we actually got a valid result
  if (results && results[0] && results[0].dom) {
    const article = await getArticleFromDom(results[0].dom, selection);

    // if we're to grab the selection, and we've selected something,
    // replace the article content with the selection
    if (selection && results[0].selection) {
      article.content = results[0].selection;
    }

    //return the article
    return article;
  } else return null;
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
 * この関数は、記事情報に基づいてMarkdownクリップフォルダのパスを生成・フォーマットする機能を提供します。
 * 生成されたフォルダパスは、ダウンロードAPIを使用する場合に使用されます。
 *
 * 1. まず、getOptions() を使用してオプションを取得します。
 * 2. オプションで mdClipsFolder が設定されており、ダウンロードモードが downloadsApi の場合に以下の処理を行います。
 *     1. textReplace() 関数を使用して、オプションで指定された不許可文字を置換・削除し、フォルダパスを生成します。
 *     2. フォルダパスをスラッシュで分割し、各部分に対して generateValidFileName() 関数を適用して、不許可文字を削除します。最後に、部分をスラッシュで再び結合して、適切なフォルダパスを生成します。
 *     3. フォルダパスがスラッシュで終わっていない場合、スラッシュを追加します。
 * 3. 最後に、生成されたMarkdownクリップフォルダのパスを返します。
 *
 * この関数を使用することで、記事情報に基づいてMarkdownクリップフォルダのパスを適切に生成・フォーマットできます。
 */
export async function formatMdClipsFolder(article) {
  let options = await getOptions();

  let mdClipsFolder = "";
  if (options.mdClipsFolder && options.downloadMode == "downloadsApi") {
    mdClipsFolder = textReplace(
      options.mdClipsFolder,
      article,
      options.disallowedChars
    );
    mdClipsFolder = mdClipsFolder
      .split("/")
      .map((s) => generateValidFileName(s, options.disallowedChars))
      .join("/");
    if (!mdClipsFolder.endsWith("/")) mdClipsFolder += "/";
  }

  return mdClipsFolder;
}

// function to download markdown, triggered by context menu
/**
 * この関数は、コンテキストメニューからトリガーされるMarkdownのダウンロードを処理します。
 *
 * 1. ensureScripts() 関数を呼び出して、コンテンツスクリプトが読み込まれていることを確認します。
 * 2. getArticleFromContent() 関数を使用して、タブIDから記事情報を取得します。info.menuItemId が "download-markdown-selection" の場合、選択されたテキストのみを取得します。
 * 3. formatTitle() 関数を使って、記事のタイトルをフォーマットします。
 * 4. convertArticleToMarkdown() 関数を使用して、記事をMarkdownに変換し、Markdownテキストと画像リストを取得します。
 * 5. formatMdClipsFolder() 関数を使用して、Markdownクリップフォルダのパスをフォーマットします。
 * 6. 最後に、downloadMarkdown() 関数を呼び出して、Markdownファイルと画像リストをダウンロードします。
 *
 * この関数を使用することで、コンテキストメニューからMarkdownのダウンロードを簡単に処理できます。
 */
export async function downloadMarkdownFromContext(info, tab) {
  await ensureScripts(tab.id);
  const article = await getArticleFromContent(
    tab.id,
    info.menuItemId == "download-markdown-selection"
  );
  const title = await formatTitle(article);
  const { markdown, imageList } = await convertArticleToMarkdown(article);
  // format the mdClipsFolder
  const mdClipsFolder = await formatMdClipsFolder(article);
  await downloadMarkdown(markdown, title, tab.id, imageList, mdClipsFolder);
}

// function to copy a tab url as a markdown link
/**
 * この関数は、タブのURLをMarkdownリンクとしてクリップボードにコピーするために使用されます。
 *
 * 1. ensureScripts() 関数を呼び出して、コンテンツスクリプトが読み込まれていることを確認します。
 * 2. getArticleFromContent() 関数を使用して、タブIDから記事情報を取得します。
 * 3. formatTitle() 関数を使って、記事のタイトルをフォーマットします。
 * 4. タブIDのコンテキストでスクリプトを実行して、フォーマットされたタイトルと記事の基本URIを使用して、Markdownリンクをクリップボードにコピーします。
 *
 * この関数は、タブのURLをフォーマットされたMarkdownリンクとしてクリップボードにコピーすることを目的としています。
 * エラーが発生した場合（例えば、拡張機能がページでコードを実行できない場合）、コンソールにエラーメッセージが表示されます。
 */
export async function copyTabAsMarkdownLink(tab) {
  try {
    await ensureScripts(tab.id);
    const article = await getArticleFromContent(tab.id);
    const title = await formatTitle(article);
    await browser.tabs.executeScript(tab.id, {
      code: `copyToClipboard("[${title}](${article.baseURI})")`,
    });
    // await navigator.clipboard.writeText(`[${title}](${article.baseURI})`);
  } catch (error) {
    // This could happen if the extension is not allowed to run code in
    // the page, for example if the tab is a privileged page.
    console.error("Failed to copy as markdown link: " + error);
  }
}

// function to copy all tabs as markdown links
/**
 * この関数は、すべてのタブのURLをMarkdownリンクとしてクリップボードにコピーするために使用されます。
 *
 * 1. getOptions() 関数を使ってオプションを取得し、frontmatter と backmatter を空に設定します。
 * 2. browser.tabs.query() 関数を使用して、現在のウィンドウのすべてのタブを取得します。
 * 3. tabs 配列をループし、各タブに対して以下の操作を行います。
 *     - ensureScripts() 関数を呼び出して、コンテンツスクリプトが読み込まれていることを確認します。
 *     - getArticleFromContent() 関数を使用して、タブIDから記事情報を取得します。
 *     - formatTitle() 関数を使って、記事のタイトルをフォーマットします。
 *     - options.bulletListMarker、フォーマットされたタイトル、および記事の基本URIを使用して、Markdownリンクを作成し、links 配列に追加します。
 * 4. links 配列を改行で連結し、Markdown形式のリンクのリストを作成します。
 * 5. タブIDのコンテキストでスクリプトを実行して、Markdownリンクのリストをクリップボードにコピーします。
 *
 * この関数は、すべてのタブのURLをフォーマットされたMarkdownリンクとしてクリップボードにコピーすることを目的としています。エラーが発生した場合（例えば、拡張機能がページでコードを実行できない場合）、コンソールにエラーメッセージが表示されます。
 */
export async function copyTabAsMarkdownLinkAll(tab) {
  try {
    const options = await getOptions();
    options.frontmatter = options.backmatter = "";
    const tabs = await browser.tabs.query({
      currentWindow: true,
    });

    const links = [];
    for (const tab of tabs) {
      await ensureScripts(tab.id);
      const article = await getArticleFromContent(tab.id);
      const title = await formatTitle(article);
      const link = `${options.bulletListMarker} [${title}](${article.baseURI})`;
      links.push(link);
    }

    const markdown = links.join(`\n`);
    await browser.tabs.executeScript(tab.id, {
      code: `copyToClipboard(${JSON.stringify(markdown)})`,
    });
  } catch (error) {
    // This could happen if the extension is not allowed to run code in
    // the page, for example if the tab is a privileged page.
    console.error("Failed to copy as markdown link: " + error);
  }
}

// function to copy markdown to the clipboard, triggered by context menu
/**
 * この関数は、コンテキストメニューからMarkdownをクリップボードにコピーするために使用されます。
 *
 * 1. ensureScripts() 関数を呼び出して、コンテンツスクリプトが読み込まれていることを確認します。
 * 2. プラットフォームのOSをチェックし、フォルダーセパレーター（Windowsの場合はバックスラッシュ、それ以外の場合はスラッシュ）を設定します。
 * 3. メニューアイテムIDに応じて、以下の操作を行います。
 *     - "copy-markdown-link": オプションを取得し、frontmatter と backmatter を空に設定します。タブIDから記事情報を取得し、ターンダウン関数でMarkdownに変換します。その後、クリップボードにコピーします。
 *     - "copy-markdown-image": クリップボードに画像のMarkdown形式をコピーします。
 *     - "copy-markdown-obsidian" および "copy-markdown-obsall": タブIDから記事情報を取得し、記事のタイトルを取得します。オプションからObsidianの設定を取得し、記事をMarkdownに変換します。クリップボードにコピーし、Obsidianで新しいファイルを作成するためのURLを開きます。
 *     - それ以外の場合: タブIDから記事情報を取得し、記事をMarkdownに変換します。その後、クリップボードにコピーします。
 *
 * この関数は、クリップボードにテキストをコピーすることを目的としています。
 * ただし、拡張機能がページでコードを実行できない場合（例えば、タブが特権ページの場合）、コンソールにエラーメッセージが表示されます。
 */
export async function copyMarkdownFromContext(info, tab) {
  try {
    await ensureScripts(tab.id);

    const platformOS = navigator.platform;
    var folderSeparator = "";
    if (platformOS.indexOf("Win") === 0) {
      folderSeparator = "\\";
    } else {
      folderSeparator = "/";
    }

    if (info.menuItemId == "copy-markdown-link") {
      const options = await getOptions();
      options.frontmatter = options.backmatter = "";
      const article = await getArticleFromContent(tab.id, false);
      const { markdown } = turndown(
        `<a href="${info.linkUrl}">${info.linkText || info.selectionText}</a>`,
        { ...options, downloadImages: false },
        article
      );
      await browser.tabs.executeScript(tab.id, {
        code: `copyToClipboard(${JSON.stringify(markdown)})`,
      });
    } else if (info.menuItemId == "copy-markdown-image") {
      await browser.tabs.executeScript(tab.id, {
        code: `copyToClipboard("![](${info.srcUrl})")`,
      });
    } else if (info.menuItemId == "copy-markdown-obsidian") {
      const article = await getArticleFromContent(
        tab.id,
        info.menuItemId == "copy-markdown-obsidian"
      );
      const title = article.title;
      const options = await getOptions();
      const obsidianVault = options.obsidianVault;
      const obsidianFolder = options.obsidianFolder;
      // イジった
      const { markdown } = await convertArticleToMarkdown(article, false);
      await browser.tabs.executeScript(tab.id, {
        code: `copyToClipboard(${JSON.stringify(markdown)})`,
      });
      await chrome.tabs.update({
        url:
          "obsidian://advanced-uri?vault=" +
          obsidianVault +
          "&clipboard=true&mode=new&filepath=" +
          obsidianFolder +
          folderSeparator +
          generateValidFileName(title),
      });
    } else if (info.menuItemId == "copy-markdown-obsall") {
      const article = await getArticleFromContent(
        tab.id,
        info.menuItemId == "copy-markdown-obsall"
      );
      const title = article.title;
      const options = await getOptions();
      const obsidianVault = options.obsidianVault;
      const obsidianFolder = options.obsidianFolder;
      const { markdown } = await convertArticleToMarkdown(article, false);
      await browser.tabs.executeScript(tab.id, {
        code: `copyToClipboard(${JSON.stringify(markdown)})`,
      });
      await browser.tabs.update({
        url:
          "obsidian://advanced-uri?vault=" +
          obsidianVault +
          "&clipboard=true&mode=new&filepath=" +
          obsidianFolder +
          folderSeparator +
          generateValidFileName(title),
      });
    } else {
      const article = await getArticleFromContent(
        tab.id,
        info.menuItemId == "copy-markdown-selection"
      );
      const { markdown } = await convertArticleToMarkdown(article, false);
      await browser.tabs.executeScript(tab.id, {
        code: `copyToClipboard(${JSON.stringify(markdown)})`,
      });
    }
  } catch (error) {
    // This could happen if the extension is not allowed to run code in
    // the page, for example if the tab is a privileged page.
    console.error("Failed to copy text: " + error);
  }
}

/**
 * この関数は、現在のウィンドウ内のすべてのタブに対してMarkdownのダウンロードを実行するために使用されます。
 *
 * 1. browser.tabs.query() を使用して、現在のウィンドウ内のすべてのタブを取得します。
 * 2. forEach を使用して、各タブに対して downloadMarkdownFromContext() 関数を呼び出します。
 *
 * この関数は、現在のウィンドウ内のすべてのタブでコンテキストメニューからMarkdownのダウンロードをトリガーすることを目的としています。
 * ただし、拡張機能がページでコードを実行できない場合（例えば、タブが特権ページの場合）、関数内の downloadMarkdownFromContext() でエラーが発生する可能性があります。
 */
export async function downloadMarkdownForAllTabs(info) {
  const tabs = await browser.tabs.query({
    currentWindow: true,
  });
  tabs.forEach((tab) => {
    downloadMarkdownFromContext(info, tab);
  });
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
