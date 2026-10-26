(function() {
  // Set global flag to prevent re-injection
  if (window.__TRANSLATION_LOADED__) {
    console.log('[TRANSLATOR] Already loaded, skipping...');
    return;
  }
  window.__TRANSLATION_LOADED__ = true;

  // Translation script loaded!
  console.log('%c[TRANSLATOR] Script loaded and executing!', 'color: lime; font-size: 20px; font-weight: bold');

  // Show toast notification
  (function showToast() {
    const toast = document.createElement('div');
    toast.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">Translated by GIBOo_</div>
      <div style="font-size: 12px;">If it doesn't work, go back to CN version. GL</div>
    `;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      max-width: 300px;
      opacity: 0;
      transform: translateX(400px);
      transition: all 0.5s ease;
    `;
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    }, 100);

    // Fade out and remove after 7 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(400px)';
      setTimeout(() => toast.remove(), 500);
    }, 7000);
  })();

  // Translation map will be injected by main.js
  // This is a placeholder - the actual translations come from translations.json
  const translationsData = window.__TRANSLATIONS_DATA__ || {};

  // Flatten the nested JSON structure into a single key-value map
  const translations = {};
  Object.values(translationsData).forEach(section => {
    Object.assign(translations, section);
  });

  // Precompute substring-match entries once: longest key first (so specific
  // phrases win over their fragments) with regex-escaped keys (so keys that
  // contain regex metacharacters can't crash or mis-match).
  const translationEntries = Object.entries(translations)
    .filter(([zh]) => zh)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([zh, en]) => [new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), en, zh]);

  // Track untranslated text
  const untranslatedTexts = new Set();

  // Function to check if text contains Chinese characters
  function containsChinese(text) {
    return /[\u4e00-\u9fff]/.test(text);
  }

// Function to translate text
function translateText(text) {
  if (!text || typeof text !== 'string') return text;

  const originalText = text.trim();

  // Skip if no Chinese characters
  if (!containsChinese(originalText)) return text;

  if (originalText === '困兽') {
    const roll = Math.random();
    if (roll < 0.01) return "Mia's Kitchen";
    if (roll < 0.02) return "Milky's Cellar";
    if (roll < 0.03) return "Fubgun's Bedroom";
  }

  // Try exact match first
  if (translations[originalText]) {
    return translations[originalText];
  }

  // Pattern-based replacements for dynamic content
  let result = text;

  // Pattern: "NUM🔥/分 用时：00:00" -> "NUM🔥/min Time: 00:00"
  result = result.replace(/🔥\/分 用时：/g, '🔥/min Time: ');

  // Pattern: "NUM🔥/分 Time Spent：00:00" -> "NUM🔥/min Time Spent: 00:00"
  result = result.replace(/🔥\/分 Time Spent：/g, '🔥/min Time Spent: ');

  // Pattern: "NUM火" -> "NUM FE"
  result = result.replace(/(\d+\.?\d*)火/g, '$1 FE');

  // Pattern: "NUM火/时" -> "NUM FE/hr"
  result = result.replace(/火\/时/g, 'FE/hr');

  // Pattern: "NUM火/Hour" -> "NUM FE/Hour"
  result = result.replace(/火\/Hour/g, 'FE/Hour');

  // Pattern: "NUM火/小时" -> "NUM FE/Hour"
  result = result.replace(/火\/小时/g, 'FE/Hour');

  // Pattern: "NUMMoon NUMth日" -> "Month Day"
  result = result.replace(/1Moon (\d+)日/g, 'Jan $1');
  result = result.replace(/2Moon (\d+)日/g, 'Feb $1');
  result = result.replace(/3Moon (\d+)日/g, 'Mar $1');
  result = result.replace(/4Moon (\d+)日/g, 'Apr $1');
  result = result.replace(/5Moon (\d+)日/g, 'May $1');
  result = result.replace(/6Moon (\d+)日/g, 'Jun $1');
  result = result.replace(/7Moon (\d+)日/g, 'Jul $1');
  result = result.replace(/8Moon (\d+)日/g, 'Aug $1');
  result = result.replace(/9Moon (\d+)日/g, 'Sep $1');
  result = result.replace(/10Moon (\d+)日/g, 'Oct $1');
  result = result.replace(/11Moon (\d+)日/g, 'Nov $1');
  result = result.replace(/12Moon (\d+)日/g, 'Dec $1');

  // Pattern: "NUM月NUM日" -> "Month Day"
  result = result.replace(/1月(\d+)日/g, 'Jan $1');
  result = result.replace(/2月(\d+)日/g, 'Feb $1');
  result = result.replace(/3月(\d+)日/g, 'Mar $1');
  result = result.replace(/4月(\d+)日/g, 'Apr $1');
  result = result.replace(/5月(\d+)日/g, 'May $1');
  result = result.replace(/6月(\d+)日/g, 'Jun $1');
  result = result.replace(/7月(\d+)日/g, 'Jul $1');
  result = result.replace(/8月(\d+)日/g, 'Aug $1');
  result = result.replace(/9月(\d+)日/g, 'Sep $1');
  result = result.replace(/10月(\d+)日/g, 'Oct $1');
  result = result.replace(/11月(\d+)日/g, 'Nov $1');
  result = result.replace(/12月(\d+)日/g, 'Dec $1');

  // Pattern: weekdays
  result = result.replace(/周一/g, 'Mon');
  result = result.replace(/周二/g, 'Tue');
  result = result.replace(/周三/g, 'Wed');
  result = result.replace(/周四/g, 'Thu');
  result = result.replace(/周五/g, 'Fri');
  result = result.replace(/周六/g, 'Sat');
  result = result.replace(/周日/g, 'Sun');

  // Pattern: "NUM 件Items" or "Items: NUM 件" -> "NUM Items" or "Items: NUM"
  result = result.replace(/(\d+) 件Items/g, '$1 Items');
  result = result.replace(/Items: (\d+) 件/g, 'Items: $1');
  result = result.replace(/(\d+) 件物品/g, '$1 Items');
  result = result.replace(/物品: (\d+) 件/g, 'Items: $1');

  // Pattern: "已选 X 天 / Y 轮" -> "Selected: X Days / Y Rounds"
  result = result.replace(/已选 (\d+) 天 \/ (\d+) 轮/g, 'Selected: $1 Day(s) / $2 Round(s)');

  // Pattern: "Netherrealm关卡中" -> "In Netherrealm stages"
  result = result.replace(/Netherrealm关卡中/g, 'In Netherrealm stages');
  result = result.replace(/关卡中/g, 'in stages');

  // Pattern: "X%概率获得" -> "X% chance to get"
  result = result.replace(/(\d+)%概率获得/g, '$1% chance to get');
  result = result.replace(/概率获得/g, 'chance to get');

  // Pattern: "摧毁" -> "destroy"
  result = result.replace(/摧毁/g, 'destroy');

  // Pattern: common Chinese words in descriptions
  result = result.replace(/鲜红/g, 'scarlet');
  result = result.replace(/中着/g, 'with');

  // Pattern: "等X种" -> "and X types", "等X个" -> "and X items"
  result = result.replace(/等(\d+)种/g, 'and $1 types');
  result = result.replace(/等(\d+)个/g, 'and $1 items');

  // Pattern: "囚笼×36" -> "Cage ×36", "罗盘×31" -> "Compass ×31"
  result = result.replace(/囚笼×/g, 'Cage ×');
  result = result.replace(/罗盘×/g, 'Compass ×');

  // Pattern: "你的 X 只剩NUM个啦，请及时补充哦~" -> "Your X is running low (NUM left), please restock~"
  result = result.replace(/你的 (.+?) 只剩(\d+)个啦，请及时补充哦~/g, 'Your $1 is running low ($2 left), please restock~');

  // Pattern: "占比 NUM%" -> "Share NUM%"
  result = result.replace(/占比 /g, 'Share ');

  // Pattern: "共 NUM 条" -> "Total NUM records"
  result = result.replace(/共 (\d+) 条/g, 'Total $1 records');

  // Pattern: "NUM 次" -> "NUM times"
  result = result.replace(/(\d+) 次/g, '$1 times');

  // Pattern: "共 NUM 种" -> "Total NUM types"
  result = result.replace(/共 (\d+) 种/g, 'Total $1 types');

  // Pattern: "共 NUM Entries" -> "Total NUM Entries"
  result = result.replace(/共 (\d+) Entries/g, 'Total $1 Entries');

  // Pattern: "更新Time:" -> "Updated:"
  result = result.replace(/更新Time:/g, 'Updated:');

  // Pattern: "-Infinity🔥/分 用时：" -> "-Infinity🔥/min Time: "
  result = result.replace(/-Infinity🔥\/分 用时：/g, '-Infinity🔥/min Time: ');

  // Pattern: "-Infinity🔥/分 Time Spent：" -> "-Infinity🔥/min Time Spent: "
  result = result.replace(/-Infinity🔥\/分 Time Spent：/g, '-Infinity🔥/min Time Spent: ');

  // ===== v1.2 season: dynamic placeholder patterns (runtime-filled templates) =====
  // Numeric-filled templates
  result = result.replace(/赛季 (\d+)/g, 'Season $1');
  result = result.replace(/第 (\d+) 天/g, 'Day $1');
  result = result.replace(/第 (\d+) 周/g, 'Week $1');
  result = result.replace(/共 (\d+) 张/g, 'Total $1');
  result = result.replace(/约 (\d+) 次/g, '~$1 times');
  result = result.replace(/再显示 (\d+) 条/g, 'Show $1 more');
  result = result.replace(/缺 (\d+) 项价格/g, 'Missing $1 prices');
  result = result.replace(/其中 (\d+) 项暂无价格/g, '$1 items have no price');
  result = result.replace(/有 (\d+) 种物品暂无价格，当前收益和预算可能不完整。/g, '$1 item types have no price; current profit and budget may be incomplete.');
  result = result.replace(/已加载 (\d+) 个天赋树/g, 'Loaded $1 talent trees');
  result = result.replace(/已选 (\d+)\/(\d+) 个策略/g, '$1/$2 strategies selected');
  result = result.replace(/已选 (\d+) 个策略/g, '$1 strategies selected');
  result = result.replace(/已选 (\d+) 项/g, 'Selected $1');
  result = result.replace(/其他 (\d+) 项/g, '$1 more');
  result = result.replace(/总览展示 (\d+) 条/g, 'Showing $1 in overview');
  result = result.replace(/已排除 (\d+)\/5 项/g, 'Excluded $1/5');
  result = result.replace(/对比阶段 (\d+)/g, 'Compare phase $1');
  result = result.replace(/至少 (\d+) 张图参与统计/g, 'At least $1 maps included in stats');
  result = result.replace(/最多同时对比 (\d+) 个策略/g, 'Compare up to $1 strategies at once');
  result = result.replace(/我先安静 (\d+) 分钟/g, "I'll stay quiet for $1 min");
  result = result.replace(/(\d+) 小时 (\d+) 分/g, '$1 h $2 min');
  // Text-filled templates (tightly anchored)
  result = result.replace(/疑似(.+?)，请选择/g, 'Likely $1, please select');
  result = result.replace(/当前主题：(.+?) · 自定义配色/g, 'Current Theme: $1 · Custom Colors');
  result = result.replace(/上次：(.+)$/g, 'Last: $1');
  result = result.replace(/天赋树：(.+)$/g, 'Talent Tree: $1');
  result = result.replace(/编辑物品: (.+)$/g, 'Edit Item: $1');
  result = result.replace(/当前主题：(.+)$/g, 'Current Theme: $1');
  result = result.replace(/实际颜色 (.+)$/g, 'Actual Color: $1');
  result = result.replace(/下钻视图：(.+)$/g, 'Drill-down: $1');
  result = result.replace(/(.+?) 赛季物价/g, '$1 Season Prices');
  result = result.replace(/(.+?) - 物价波动/g, '$1 - Price Fluctuation');
  result = result.replace(/主城已挂机 (.+?)，该去刷图啦！/g, 'Idle in town for $1 — time to farm!');
  result = result.replace(/挂机 (.+?) 啦，我想出去冒险～/g, "Idle for $1 — let's go adventuring~");
  result = result.replace(/你在主城发呆了 (.+?)，要不要动一动？/g, "You've been idling in town for $1 — fancy a move?");
  result = result.replace(/我数到 (.+?) 了，别忘了刷图哦。/g, "I've counted to $1 — don't forget to farm.");

  // ===== v1.3 season: dynamic placeholder patterns (generated from {placeholder} templates) =====
  result = result.replace(/综合平均净收益、净收益效率、波动和样本量，今天更适合继续尝试“(.+?)”：([-+]?[\d.,]+) 局，平均净收益 (.+?)，净收益效率 (.+?)。/g, "Based on average Net Profit, Net Profit efficiency, volatility and sample size, it's better to keep trying \"$1\" today: $2 run(s), average Net Profit $3, Net Profit efficiency $4.");
  result = result.replace(/检测到上次角色属于 (.+?)，但当前角色尚未确认。游戏软件全关，管理员启动，开日志选角色进游戏/g, "Detected that the last character belongs to $1, but the current character is not yet confirmed. Close all game software, launch as administrator, enable logging, select a character and enter the game");
  result = result.replace(/正在使用 (.+?) 赛季当前物价重估 (.+?) 赛季策略。这是跨赛季预估，不会修改原始历史数据。/g, "Re-evaluating $2 Season Strategy using current $1 Season prices. This is a cross-Season estimate and will not modify the original historical data.");
  result = result.replace(/检测到上次角色属于已结束的 (.+?)。游戏软件全关，管理员启动，开日志选角色进游戏/g, "Detected that the last character belongs to the ended $1. Close all game software, launch as administrator, enable logging, select a character and enter the game");
  result = result.replace(/目前“(.+?)”只有 ([-+]?[\d.,]+) 局记录，暂时只能作为观察对象，建议再积累几局后判断。/g, "\"$1\" has only $2 run(s) recorded, so it can only be observed for now. Accumulate a few more runs before judging.");
  result = result.replace(/每 (.+?) 分钟采样，在线人数按最近 (.+?) 分钟内的去重玩家计算。/g, "Sampled every $1 min; online count uses unique players from the last $2 min.");
  result = result.replace(/今天完成 ([-+]?[\d.,]+) 局，掉落价值 (.+?)，实际收益 (.+?)。/g, "Completed $1 run(s) today, drop value $2, actual Profit $3.");
  result = result.replace(/^(\s*)(.+?)已有 ([-+]?[\d.,]+)\/([-+]?[\d.,]+) 个，快去使用，避免溢出(\s*)$/g, "$1$2: $3/$4 owned, use them soon to avoid overflow$5");
  result = result.replace(/^(\s*)精确数据覆盖：当前 ([-+]?[\d.,]+)，对比 (.+?)(\s*)$/g, "$1Exact data coverage: current $2, comparison $3$4");
  result = result.replace(/冰封寒渊的碎星（时刻 (.+?)）/g, "Glacial Abyss Shattered Star (Timemark $1)");
  result = result.replace(/沸涌炎海的碎星（时刻 (.+?)）/g, "Blistering Lava Sea Shattered Star (Timemark $1)");
  result = result.replace(/钢铁炼境的碎星（时刻 (.+?)）/g, "Steel Forge Shattered Star (Timemark $1)");
  result = result.replace(/雷鸣废土的碎星（时刻 (.+?)）/g, "Thunder Wastes Shattered Star (Timemark $1)");
  result = result.replace(/幽夜暗域的碎星（时刻 (.+?)）/g, "Voidlands Shattered Star (Timemark $1)");
  result = result.replace(/待同步 ([-+]?[\d.,]+) 天 \/ (.+?) 张图/g, "Pending sync $1 days / $2 maps");
  result = result.replace(/^(\s*)阶段样本：当前 ([-+]?[\d.,]+)，对比 (.+?)(\s*)$/g, "$1Phase samples: current $2, comparison $3$4");
  result = result.replace(/^(\s*)收益效率 (.+?) · 总耗时 (.+?)(\s*)$/g, "$1Profit efficiency $2 · Total time $3$4");
  result = result.replace(/^(\s*)掉落价值 (.+?) \/ 成本 (.+?)(\s*)$/g, "$1Drop value $2 / Cost $3$4");
  result = result.replace(/云端备份已同步（(.+?)）/g, "Cloud backup synced ($1)");
  result = result.replace(/Top 掉落 ([-+]?[\d.,]+) 条/g, "Top $1 drops");
  result = result.replace(/^(\s*)最快 (.+?) \/ 最慢 (.+?)(\s*)$/g, "$1Fastest $2 / Slowest $3$4");
  result = result.replace(/^(\s*)经验 (.+?) \/ 活跃 (.+?)(\s*)$/g, "$1EXP $2 / Active $3$4");
  result = result.replace(/覆盖 ([-+]?[\d.,]+) 个活跃日/g, "Covers $1 active days");
  result = result.replace(/效率 (.+?) 火\/小时/g, "Efficiency $1 FE/hour");
  result = result.replace(/^(\s*)累计净收益达到 (.+?)(\s*)$/g, "$1Cumulative Net Profit reached $2$3");
  result = result.replace(/重估物价：(.+?) 赛季/g, "Re-evaluating prices: $1 Season");
  result = result.replace(/请使用(.+?)扫描二维码/g, "Please scan the QR code with $1");
  result = result.replace(/^(\s*)(.+?) · 上次纪录 (.+?)(\s*)$/g, "$1$2 · Last record $3$4");
  result = result.replace(/今日刷图每(.+?)收益/g, "Today's farming profit per $1");
  result = result.replace(/^(\s*)下次自动同步：(.+?)(\s*)$/g, "$1Next auto sync: $2$3");
  result = result.replace(/平均每日 (.+?) 张/g, "Daily avg $1 maps");
  result = result.replace(/^(\s*)(.+?) 完成 ([-+]?[\d.,]+) 张图(\s*)$/g, "$1$2: completed $3 maps$4");
  result = result.replace(/玩家 ID：([-+]?[\d.,]+)/g, "Player ID: $1");
  result = result.replace(/未知地图（([-+]?[\d.,]+)）/g, "Unknown Map ($1)");
  result = result.replace(/约 (.+?) 死\/图/g, "~$1 deaths/map");
  result = result.replace(/([-+]?[\d.,]+) 分钟后重试/g, "Retry in $1 min");
  result = result.replace(/约 ([-+]?[\d.,]+) 分钟后/g, "In ~$1 min");
  result = result.replace(/^(\s*)(.+?) 起，最新 (.+?)(\s*)$/g, "$1From $2, latest $3$4");
  result = result.replace(/([-+]?[\d.,]+) 次 · ([-+]?[\d.,]+)%/g, "$1 time(s) · $2%");
  result = result.replace(/^(\s*)最佳单图 (.+?)(\s*)$/g, "$1Best per map $2$3");
  result = result.replace(/^(\s*)(.+?) 火\/分钟(\s*)$/g, "$1$2 FE/min$3");
  result = result.replace(/^(\s*)平均每日 (.+?)(\s*)$/g, "$1Daily avg $2$3");
  result = result.replace(/累计 ([-+]?[\d.,]+) 件/g, "$1 items total");
  result = result.replace(/累计 ([-+]?[\d.,]+) 死/g, "$1 deaths total");
  result = result.replace(/^(\s*)上次纪录 (.+?)(\s*)$/g, "$1Last record $2$3");
  result = result.replace(/^(\s*)(.+?)赞助二维码(\s*)$/g, "$1$2 sponsor QR code$3");
  result = result.replace(/刷图 ([-+]?[\d.,]+) 张/g, "Farmed $1 maps");
  result = result.replace(/第 ([-+]?[\d.,]+) 天/g, "Day $1");
  result = result.replace(/第 ([-+]?[\d.,]+) 周/g, "Week $1");
  result = result.replace(/^(\s*)较前日 (.+?)(\s*)$/g, "$1vs previous day $2$3");
  result = result.replace(/^(\s*)更新于 (.+?)(\s*)$/g, "$1Updated $2$3");
  result = result.replace(/数量 ×([-+]?[\d.,]+)/g, "Quantity ×$1");
  result = result.replace(/([-+]?[\d.,]+) 个节点/g, "$1 nodes");
  result = result.replace(/([-+]?[\d.,]+) 局明细/g, "$1 run(s) details");
  result = result.replace(/^(\s*)净收益 (.+?)(\s*)$/g, "$1Net Profit $2$3");
  result = result.replace(/共 ([-+]?[\d.,]+) 条/g, "$1 entries total");
  result = result.replace(/共 ([-+]?[\d.,]+) 张/g, "$1 total");
  result = result.replace(/共 ([-+]?[\d.,]+) 种/g, "$1 kinds total");
  result = result.replace(/约 ([-+]?[\d.,]+) 次/g, "~$1 time(s)");
  result = result.replace(/^(\s*)([-+]?[\d.,]+) 对比 (.+?)(\s*)$/g, "$1$2 vs $3$4");
  result = result.replace(/^(\s*)(.+?) 对比 ([-+]?[\d.,]+)(\s*)$/g, "$1$2 vs $3$4");
  result = result.replace(/每(.+?)收益/g, "Profit per $1");
  result = result.replace(/^(\s*)时区：(.+?)(\s*)$/g, "$1Time zone: $2$3");
  result = result.replace(/样本 ([-+]?[\d.,]+)/g, "Samples $1");
  result = result.replace(/^(\s*)耗时 (.+?)(\s*)$/g, "$1Time taken $2$3");
  result = result.replace(/¥(.+?)\/火/g, "¥$1/FE");
  result = result.replace(/S([-+]?[\d.,]+)独狼/g, "S$1 Lone Wolves");
  result = result.replace(/S([-+]?[\d.,]+)专家/g, "S$1 Experts");
  result = result.replace(/([-+]?[\d.,]+) 张图/g, "$1 maps");
  result = result.replace(/S([-+]?[\d.,]+)赛季/g, "S$1 Season");
  result = result.replace(/^(\s*)对比 (.+?)(\s*)$/g, "$1vs $2$3");
  result = result.replace(/^(\s*)(.+?) 天赋(\s*)$/g, "$1$2 Talents$3");
  result = result.replace(/([-+]?[\d.,]+) 局/g, "$1 run(s)");
  result = result.replace(/([-+]?[\d.,]+) 条/g, "$1 entries");
  result = result.replace(/([-+]?[\d.,]+) 类/g, "$1 types");
  result = result.replace(/^(\s*)(.+?) 火(\s*)$/g, "$1$2 FE$3");
  result = result.replace(/^(\s*)(.+?)在线(\s*)$/g, "$1$2 Online$3");
  result = result.replace(/^(\s*)([-+]?[\d.,]+) 天(.+?)(\s*)$/g, "$1$2 days $3$4");

  // Try partial match for compound strings (longest key first, escaped)
  let hadPartialMatch = false;

  for (const [re, english, chinese] of translationEntries) {
    if (result.includes(chinese)) {
      result = result.replace(re, english);
      hadPartialMatch = true;
    }
  }

  // If text still contains Chinese after translation attempts, log it as untranslated
  if (containsChinese(result) && originalText.length > 0 && originalText.length < 100) {
    untranslatedTexts.add(originalText);
  }

  return result;
}

// Function to translate all text nodes in an element
function translateElement(element) {
  if (!element) return;

  // Skip script and style elements
  if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return;

  // Translate text nodes
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const nodesToTranslate = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeValue && node.nodeValue.trim()) {
      nodesToTranslate.push(node);
    }
  }

  nodesToTranslate.forEach(node => {
    const originalText = node.nodeValue;
    const translatedText = translateText(originalText);
    if (translatedText !== originalText) {
      node.nodeValue = translatedText;
    }
  });

  // Translate common attributes
  const attributesToTranslate = ['placeholder', 'title', 'alt', 'aria-label'];
  attributesToTranslate.forEach(attr => {
    if (element.hasAttribute && element.hasAttribute(attr)) {
      const originalValue = element.getAttribute(attr);
      const translatedValue = translateText(originalValue);
      if (translatedValue !== originalValue) {
        element.setAttribute(attr, translatedValue);
      }
    }
  });

  // Recursively translate child elements
  if (element.children) {
    Array.from(element.children).forEach(child => {
      translateElement(child);
    });
  }
}

// Initialize translation
function initTranslation() {
  console.log('[Translator] Initializing English translation...');

  // Initial translation of existing content
  translateElement(document.body);

  // Watch for dynamically added content
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          translateElement(node);
        } else if (node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.trim()) {
          const originalText = node.nodeValue;
          const translatedText = translateText(originalText);
          if (translatedText !== originalText) {
            node.nodeValue = translatedText;
          }
        }
      });

      // Also handle text changes
      if (mutation.type === 'characterData') {
        const originalText = mutation.target.nodeValue;
        const translatedText = translateText(originalText);
        if (translatedText !== originalText) {
          mutation.target.nodeValue = translatedText;
        }
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  console.log('[Translator] English translation active');
}

// Wait for app to fully load, then start translation
function waitAndTranslate() {
  let attempts = 0;
  const maxAttempts = 60; // Try for 60 seconds

  const checkInterval = setInterval(() => {
    attempts++;
    console.log(`[Translator] Checking for content... attempt ${attempts}`);

    // Check if main content has loaded by looking for Chinese text
    const hasContent = document.body.innerText.includes('物品') ||
                      document.body.innerText.includes('背包') ||
                      document.body.innerText.length > 100;

    if (hasContent) {
      console.log('[Translator] Content detected! Starting translation...');
      clearInterval(checkInterval);
      initTranslation();

      // Force immediate translation multiple times to catch all content
      translateElement(document.body);
      setTimeout(() => translateElement(document.body), 100);
      setTimeout(() => translateElement(document.body), 500);
      setTimeout(() => translateElement(document.body), 1000);
    } else if (attempts >= maxAttempts) {
      console.log('[Translator] Max attempts reached, starting translation anyway');
      clearInterval(checkInterval);
      initTranslation();
    }
  }, 500); // Check twice per second
}

// Run translation when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitAndTranslate);
} else {
  waitAndTranslate();
}

// Also run translation periodically to catch any missed elements
setInterval(() => {
  translateElement(document.body);
}, 2000);

// Log and save untranslated texts every 3 seconds
setInterval(() => {
  if (untranslatedTexts.size > 0) {
    console.log('%c[UNTRANSLATED] Found ' + untranslatedTexts.size + ' untranslated Chinese texts', 'color: yellow; font-weight: bold');

    const sortedTexts = Array.from(untranslatedTexts).sort();
    const jsonOutput = {};
    sortedTexts.forEach(text => {
      jsonOutput[text] = '';
    });

    // Send to main process to save
    if (window.electronAPI && window.electronAPI.saveUntranslated) {
      window.electronAPI.saveUntranslated(jsonOutput);
    }
  }
}, 3000);

// Expose function to get untranslated texts
window.getUntranslatedTexts = () => {
  return Array.from(untranslatedTexts).sort();
};

// Expose function to export as JSON
window.exportUntranslated = () => {
  const jsonOutput = {};
  Array.from(untranslatedTexts).sort().forEach(text => {
    jsonOutput[text] = '';
  });
  console.log('Copy this to your translations.json:');
  console.log(JSON.stringify(jsonOutput, null, 2));
  return jsonOutput;
};

console.log('%c[TRANSLATOR] Run window.exportUntranslated() to get all untranslated texts as JSON', 'color: cyan');

})(); // End of IIFE
