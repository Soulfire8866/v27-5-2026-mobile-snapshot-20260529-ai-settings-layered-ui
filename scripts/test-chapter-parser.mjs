import {
  parseChineseNovelChapters,
  isLikelyChapterHeader,
  countContentChars,
} from "../src/utils/chapterParser.ts";

const sample = `
第一章 重生归来
这是第一章的正文内容，主角在山上修炼多年终于下山。
他说道："这一次我一定要改变命运。"
第二天清晨，阳光洒落。

第二章 初入宗门
又是一段足够长的正文，用来测试分章是否正常工作，需要超过四十个汉字才能通过校验。
`;

const r = parseChineseNovelChapters(sample);
console.log("OK sample:", r.chapters.length, "strict=", r.stats.usedStrictMode);
r.chapters.forEach((c, i) =>
  console.log(" ", i + 1, c.originalName, countContentChars(c.text))
);

const bad = `
一、第一式
二、第二式
第三章 真正的章节
${"正文".repeat(50)}
`;

const r2 = parseChineseNovelChapters(bad);
console.log("OK bad:", r2.chapters.length, r2.chapters.map((c) => [c.originalName, countContentChars(c.text)]));

console.log(
  "第一次 is header?",
  isLikelyChapterHeader("第一次见面，他说道：你好。", ["第一次见面，他说道：你好。"], 0, false)
);
