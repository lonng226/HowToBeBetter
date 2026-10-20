// 统计数字检查：README 里的条目数、A/B/C 各多少、争议几条、原始文献链接多少条，
// 这些数字是读者判断这本书分量和硬度的唯一依据。数字一旦和正文脱节，
// README 就在骗人，而且没人会去核。所以每次改完正文都跑一遍，让 CI 也跑。
//
//   node tools/check-stats.mjs          # 校验，只读不改，有对不上的退出码 1
//   node tools/check-stats.mjs --write  # 把 README 里的数字改成实际值
//
// 性价比档的算法照 CLAUDE.md：钱/时间/毅力三项成本都在最低档，且收益量级为大，
// 是「极高」；收益量大且成本不高，或收益中等且成本全在最低档，是「高」；其余「一般」。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');

const files = readdirSync(resolve(ROOT, 'book')).filter(f => /^\d\d-.*\.md$/.test(f)).sort();

const COST = { 钱: { 0: 0, 少: 1, 中: 2, 多: 3 }, 时间: { 少: 0, 中: 1, 多: 2 }, 毅力: { 否: 0, 些: 1, 是: 2 } };

let entries = 0;
const grades = { A: 0, B: 0, C: 0 };
let disputes = 0;
let links = 0;
const ratio = { 极高: 0, 高: 0, 一般: 0 };

for (const f of files) {
  const text = readFileSync(resolve(ROOT, 'book', f), 'utf8');
  links += (text.match(/https?:\/\//g) ?? []).length;
  for (const block of text.split(/^### /m).slice(1)) {
    entries++;
    const g = /^- 证据等级：([ABC])$/m.exec(block);
    if (g) grades[g[1]]++;
    if (/^- 备注：争议/m.test(block)) disputes++;
    const tag = /<!-- 成本标签: 钱=(\S+) 时间=(\S+) 毅力=(\S+) 收益=(\S+) 口径=(\S+) -->/.exec(block);
    if (tag) {
      const cost = COST.钱[tag[1]] + COST.时间[tag[2]] + COST.毅力[tag[3]];
      const zero = tag[1] === '0' && tag[2] === '少' && tag[3] === '否';
      const big = tag[4] === '大';
      if (big && zero) ratio.极高++;
      else if (big && cost <= 2) ratio.高++;
      else if (tag[4] === '中' && zero) ratio.高++;
      else ratio.一般++;
    }
  }
}

const actual = {
  条目数: entries,
  A级: grades.A,
  B级: grades.B,
  C级: grades.C,
  争议: disputes,
  文献链接: links,
  极高: ratio.极高,
  高: ratio.高,
  一般: ratio.一般,
};

console.log('正文实际统计：');
for (const [k, v] of Object.entries(actual)) console.log(`  ${k}: ${v}`);

// README 里出现的这些写法。每一项给一组正则，全部命中才算对上。
const CHECKS = [
  { name: '条目总数', value: entries, pats: [/全书 (\d+) 条中/, /(\d+) 条建议，每条写明/, /badge\/[^)]*%E6%9D%A1%E7%9B%AE-(\d+)%20%E6%9D%A1-/] },
  { name: 'A级', value: grades.A, pats: [/A级 (\d+) 条/, /A (\d+) · B (\d+) · C (\d+)/, /%E8%AF%81%E6%8D%AE%E5%88%86%E7%BA%A7-A%20(\d+)/] },
  { name: 'B级', value: grades.B, pats: [/B 级 (\d+) 条/, /A \d+ · B (\d+) · C \d+/] },
  { name: 'C级', value: grades.C, pats: [/C 级 (\d+) 条/, /A \d+ · B \d+ · C (\d+)/] },
  { name: '争议条数', value: disputes, pats: [/另有 (\d+) 条标注了争议/] },
  { name: '文献链接数', value: links, pats: [/(\d+) 条链接/] },
];

const readmePath = resolve(ROOT, 'README.md');
let readme = readFileSync(readmePath, 'utf8');
const problems = [];

for (const c of CHECKS) {
  for (const pat of c.pats) {
    const m = pat.exec(readme);
    if (!m) continue;
    const groups = m.slice(1).map(Number);
    const found = pat.source.includes('%E') ? groups[0] : groups.find(g => !Number.isNaN(g));
    if (found !== c.value) {
      problems.push(`${c.name}：README 写 ${found}，正文实际 ${c.value}（${pat}）`);
    }
    break;
  }
}

// 性价比档在 README 里出现两次（正文叙述和链接表），两处都要对上。
// 「极高」「高」「一般」连着写时（「极高 4 条、高 33 条、一般 27 条」），
// 高和一般之间没有分隔，所以只按「档名 + 数字 + 条」匹配，不管前后顺序。
for (const [label, total] of [['极高', ratio.极高], ['高', ratio.高], ['一般', ratio.一般]]) {
  const pats = [
    new RegExp(`${label}\\s*${total}\\s*条`),
    new RegExp(`「${label}」[^。，]{0,12}${total}\\s*条`),
    new RegExp(`${label}[^。，]{0,12}${total}\\s*条`),
  ];
  if (!pats.some(p => p.test(readme))) {
    problems.push(`性价比 ${label}：README 里找不到 ${total} 条的写法`);
  }
}

if (WRITE) {
  readme = readme
    .replace(/全书 \d+ 条中 A 级 \d+ 条、B 级 \d+ 条、C 级 \d+ 条/, `全书 ${entries} 条中 A 级 ${grades.A} 条、B 级 ${grades.B} 条、C 级 ${grades.C} 条`)
    .replace(/证据等级 A 的一共 \d+ 条/, `证据等级 A 的一共 ${grades.A} 条`)
    .replace(/另有 \d+ 条标注了争议/, `另有 ${disputes} 条标注了争议`)
    .replace(/全书 \d+ 条中性价比极高 \d+ 条（\d+%）、高 \d+ 条（\d+%）、一般 \d+ 条（\d+%）/,
      `全书 ${entries} 条中性价比极高 ${ratio.极高} 条（${Math.round((ratio.极高 / entries) * 100)}%）、高 ${ratio.高} 条（${Math.round((ratio.高 / entries) * 100)}%）、一般 ${ratio.一般} 条（${Math.round((ratio.一般 / entries) * 100)}%）`);
  writeFileSync(readmePath, readme, 'utf8');
  console.log('已按正文实际值改写 README');
  process.exit(0);
}

if (problems.length) {
  console.log('');
  console.log('README 里的数字和正文对不上：');
  for (const p of problems) console.log('  ' + p);
  console.log('');
  console.log('跑 node tools/check-stats.mjs --write 可以按正文实际值改写 README。');
  process.exit(1);
}

console.log('');
console.log(`统计检查通过：条目 ${entries}，A ${grades.A} / B ${grades.B} / C ${grades.C}，争议 ${disputes}，链接 ${links}，性价比 ${ratio.极高} / ${ratio.高} / ${ratio.一般}`);
