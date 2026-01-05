const API_URL = "https://info.cld.hkjc.com/graphql/base/";

const DRAW_FRAGMENT = `fragment lotteryDrawsFragment on LotteryDraw {
    id
    year
    no
    openDate
    closeDate
    drawDate
    status
    snowballCode
    snowballName_en
    snowballName_ch
    lotteryPool {
      sell
      status
      totalInvestment
      jackpot
      unitBet
      estimatedPrize
      derivedFirstPrizeDiv
      lotteryPrizes {
        type
        winningUnit
        dividend
      }
    }
    drawResult {
      drawnNo
      xDrawnNo
    }
  }`;

const QUERY = `${DRAW_FRAGMENT}

        query marksixResult($lastNDraw: Int, $startDate: String, $endDate: String, $drawType: LotteryDrawType) {
            lotteryDraws(lastNDraw: $lastNDraw, startDate: $startDate, endDate: $endDate, drawType: $drawType) {
              ...lotteryDrawsFragment
            }
        }
    `;

const NEXT_QUERY = `${DRAW_FRAGMENT}

        query marksixDraw {
            timeOffset {
                m6  
                ts  
            }
            lotteryDraws {
                ...lotteryDrawsFragment
            }
        }
    `;

const els = {
  lastN: document.getElementById("lastN"),
  fetchStatus: document.getElementById("fetchStatus"),
  numberBoard: document.getElementById("numberBoard"),
  comboCount: document.getElementById("comboCount"),
  excludedSummary: document.getElementById("excludedSummary"),
  heroJackpot: document.getElementById("heroJackpot"),
  noAllOdd: document.getElementById("noAllOdd"),
  noAllEven: document.getElementById("noAllEven"),
  noMultiplicationCombo: document.getElementById("noMultiplicationCombo"),
  minRows: document.getElementById("minRows"),
  redCount: document.getElementById("redCount"),
  blueCount: document.getElementById("blueCount"),
  greenCount: document.getElementById("greenCount"),
  oddList: document.getElementById("oddList"),
  evenList: document.getElementById("evenList"),
  smallList: document.getElementById("smallList"),
  bigList: document.getElementById("bigList"),
  redList: document.getElementById("redList"),
  blueList: document.getElementById("blueList"),
  greenList: document.getElementById("greenList"),
  metalList: document.getElementById("metalList"),
  woodList: document.getElementById("woodList"),
  waterList: document.getElementById("waterList"),
  fireList: document.getElementById("fireList"),
  earthList: document.getElementById("earthList"),
  metalCount: document.getElementById("metalCount"),
  woodCount: document.getElementById("woodCount"),
  waterCount: document.getElementById("waterCount"),
  fireCount: document.getElementById("fireCount"),
  earthCount: document.getElementById("earthCount"),
  sumMin: document.getElementById("sumMin"),
  sumMax: document.getElementById("sumMax"),
  sumRange: document.getElementById("sumRange"),
  sumMinLabel: document.getElementById("sumMinLabel"),
  sumMaxLabel: document.getElementById("sumMaxLabel"),
  oddCount: document.getElementById("oddCount"),
  evenCount: document.getElementById("evenCount"),
  smallCount: document.getElementById("smallCount"),
  bigCount: document.getElementById("bigCount"),
  maxConsecutive: document.getElementById("maxConsecutive"),
  maxTail: document.getElementById("maxTail"),
  generateBtn: document.getElementById("generateBtn"),
  ticketCount: document.getElementById("ticketCount"),
  generateStatus: document.getElementById("generateStatus"),
  resultList: document.getElementById("resultList"),
  availableCount: document.getElementById("availableCount")
};

const state = {
  draws: [],
  excluded: new Set(),
  lastGenerated: null,
  countToken: 0,
  latestInfo: null
};

const COLOR_GROUPS = {
  red: new Set([1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46]),
  blue: new Set([3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48]),
  green: new Set([5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49])
};

function pad2(num) {
  return String(num).padStart(2, "0");
}

function formatNumber(num) {
  if (num === null || num === undefined || num === "") return "-";
  const n = Number(num);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-US");
}

function formatAverage(sum, count) {
  if (!count) return "-";
  const avg = sum / count;
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
}

function formatPrizeZh(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return "-";
  const parts = [];
  const yi = Math.floor(n / 100000000);
  let rest = n % 100000000;
  const wan = Math.floor(rest / 10000);
  rest = rest % 10000;
  const qian = Math.floor(rest / 1000);
  rest = rest % 1000;
  const bai = Math.floor(rest / 100);

  if (yi > 0) parts.push(`${yi}億`);
  if (wan > 0) parts.push(`${wan}萬`);
  if (qian > 0) parts.push(`${qian}千`);
  if (bai > 0) parts.push(`${bai}百`);
  if (!parts.length) parts.push("0");
  return `約${parts.join("")}`;
}

function formatDateDmy(dateStr) {
  const dt = new Date(normalizeDateString(dateStr));
  if (Number.isNaN(dt.getTime())) return "-";
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatWeekday(dateStr) {
  const dt = new Date(normalizeDateString(dateStr));
  if (Number.isNaN(dt.getTime())) return "";
  const names = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return names[dt.getDay()];
}

function formatTime(dateStr) {
  const dt = new Date(normalizeDateString(dateStr));
  if (Number.isNaN(dt.getTime())) return "-";
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalizeDateString(dateStr) {
  if (!dateStr) return "";
  if (dateStr.includes("T")) return dateStr;
  const dateOnlyWithOffset = /^(\d{4}-\d{2}-\d{2})\+(\d{2}:\d{2})$/;
  if (dateOnlyWithOffset.test(dateStr)) {
    const [, datePart, offset] = dateStr.match(dateOnlyWithOffset);
    return `${datePart}T00:00:00+${offset}`;
  }
  if (/^\d{4}-\d{2}-\d{2}\+\d{2}:\d{2}/.test(dateStr)) {
    const [datePart, offset] = dateStr.split("+");
    return `${datePart}T00:00:00+${offset}`;
  }
  return dateStr;
}

function formatDrawNo(draw) {
  const no = String(draw.no ?? "").padStart(3, "0");
  const year = String(draw.year ?? "");
  return `${year}/${no}`;
}

function formatYmdHK(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" });
  return fmt.format(date).replace(/-/g, "");
}

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getSelectedCount(container) {
  if (!container) return null;
  const checked = container.querySelector("input[type=checkbox]:checked");
  if (!checked) return null;
  const n = Number(checked.dataset.count);
  return Number.isFinite(n) ? n : null;
}

function setSelectedCount(container, value) {
  if (!container) return;
  const inputs = [...container.querySelectorAll("input[type=checkbox]")];
  inputs.forEach((input) => {
    input.checked = Number(input.dataset.count) === value;
  });
}

function setCountDisabled(container, maxAllowed) {
  if (!container) return;
  const inputs = [...container.querySelectorAll("input[type=checkbox]")];
  let cleared = false;
  inputs.forEach((input) => {
    const value = Number(input.dataset.count);
    const disabled = maxAllowed !== null && value > maxAllowed;
    input.disabled = disabled;
    if (disabled && input.checked) {
      input.checked = false;
      cleared = true;
    }
  });
  return cleared;
}

function getRowIndex(num) {
  if (num >= 1 && num <= 10) return 1;
  if (num >= 11 && num <= 20) return 2;
  if (num >= 21 && num <= 30) return 3;
  if (num >= 31 && num <= 40) return 4;
  return 5;
}

function buildExcluded() {
  const set = new Set();
  state.draws.forEach((draw) => {
    (draw.drawResult?.drawnNo || []).forEach((n) => set.add(n));
    if (draw.drawResult?.xDrawnNo) {
      set.add(draw.drawResult.xDrawnNo);
    }
  });
  state.excluded = set;
  updateAvailableCount();
  renderNumberBoard();
  renderExcludedSummary();
  renderCategoryLists();
}

function updateAvailableCount() {
  const filters = readFilters();
  const pool = getFilteredPool(filters);
  els.availableCount.textContent = `可用號碼：${pool.length}`;
}

function setComboCount(message) {
  if (!els.comboCount) return;
  els.comboCount.textContent = message;
}

function setFetchStatus(message) {
  els.fetchStatus.textContent = message;
}

function updateSumRangeUI() {
  if (!els.sumMin || !els.sumMax || !els.sumRange) return;
  const min = Number(els.sumMin.min || 0);
  const max = Number(els.sumMin.max || 200);
  const minVal = Number(els.sumMin.value);
  const maxVal = Number(els.sumMax.value);
  const low = Math.min(minVal, maxVal);
  const high = Math.max(minVal, maxVal);
  if (els.sumMinLabel) els.sumMinLabel.textContent = String(low);
  if (els.sumMaxLabel) els.sumMaxLabel.textContent = String(high);
  const minPct = ((low - min) / (max - min)) * 100;
  const maxPct = ((high - min) / (max - min)) * 100;
  els.sumRange.style.setProperty("--sum-min", `${minPct}%`);
  els.sumRange.style.setProperty("--sum-max", `${maxPct}%`);
}

function renderExcludedSummary() {
  if (!els.excludedSummary) return;
  els.excludedSummary.innerHTML = "";
  if (!state.draws.length) {
    els.excludedSummary.textContent = "未排除";
    return;
  }
  state.draws.forEach((draw) => {
    const line = document.createElement("div");
    line.className = "excluded-line";
    const dateText = draw.drawDate?.split("+")[0] || "";
    const metaWrap = document.createElement("div");
    metaWrap.className = "excluded-meta";
    const meta = document.createElement("div");
    meta.textContent = `${dateText} 第${draw.year}/${draw.no}期`;

    const numsWrap = document.createElement("div");
    numsWrap.className = "excluded-numbers";
    const drawnNums = draw.drawResult?.drawnNo || [];
    const allNums = [...drawnNums];
    drawnNums.forEach((n) => {
      const ball = document.createElement("span");
      ball.className = `ball ${getColorClass(n)} with-element`;
      ball.innerHTML = `
        <span>${pad2(n)}</span>
        <span class="element-inner">${getElementTag(n)}</span>
      `;
      numsWrap.appendChild(ball);
    });
    if (draw.drawResult?.xDrawnNo) {
      const ball = document.createElement("span");
      const special = draw.drawResult.xDrawnNo;
      allNums.push(special);
      ball.className = "ball special with-element";
      ball.innerHTML = `
        <span>${pad2(special)}</span>
        <span class="element-inner">${getElementTag(special)}</span>
      `;
      numsWrap.appendChild(ball);
    }

    const sum = allNums.reduce((acc, n) => acc + n, 0);
    const stats = document.createElement("div");
    stats.className = "excluded-stats";
    stats.textContent = `總和 ${sum}，平均數 ${formatAverage(sum, allNums.length)}`;

    metaWrap.appendChild(meta);
    metaWrap.appendChild(stats);
    line.appendChild(metaWrap);
    line.appendChild(numsWrap);
    els.excludedSummary.appendChild(line);
  });
}

function pickNextDraw(draws) {
  if (!draws.length) return null;
  const now = new Date();
  const upcoming = draws
    .filter((draw) => {
      const dt = new Date(normalizeDateString(draw.closeDate || draw.drawDate || ""));
      return !Number.isNaN(dt.getTime()) && dt >= now && draw.status !== "Result";
    })
    .sort(
      (a, b) =>
        new Date(normalizeDateString(a.closeDate || a.drawDate || "")) -
        new Date(normalizeDateString(b.closeDate || b.drawDate || ""))
    );
  if (upcoming.length) return upcoming[0];
  return draws.find((draw) => draw.status !== "Result") || draws[0];
}

async function fetchLatestInfo() {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: NEXT_QUERY,
        variables: {},
        operationName: "marksixDraw"
      })
    });
    const data = await res.json();
    if (data.errors) {
      throw new Error(data.errors.map((e) => e.message).join(" | "));
    }
    const draws = data.data?.lotteryDraws || [];
    state.latestInfo = pickNextDraw(draws);
    renderDraws();
  } catch (err) {
    if (els.heroJackpot) els.heroJackpot.textContent = "-";
  }
}

function setGenerateStatus(message) {
  els.generateStatus.textContent = message;
}

async function fetchDraws(n) {
  setFetchStatus("更新中…");
  try {
    if (n === 0) {
      state.draws = [];
      renderDraws();
      buildExcluded();
      setFetchStatus("已更新：0 期");
      autoUpdate();
      fetchLatestInfo();
      return;
    }
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: { lastNDraw: n, drawType: "All" },
        operationName: "marksixResult"
      })
    });
    const data = await res.json();
    if (data.errors) {
      throw new Error(data.errors.map((e) => e.message).join(" | "));
    }
    state.draws = data.data?.lotteryDraws || [];
    renderDraws();
    buildExcluded();
    setFetchStatus(`已更新：${state.draws.length} 期`);
    autoUpdate();
    fetchLatestInfo();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setFetchStatus(`${msg} ➜ ✨ 拉取失敗，請稍後再試或手動刷新。`);
  }
}

function renderDraws() {
  if (els.heroJackpot) {
    if (!state.latestInfo) {
      els.heroJackpot.textContent = "-";
      return;
    }
    const latest = state.latestInfo;
    const drawDate = latest.drawDate || "";
    const closeDate = latest.closeDate || "";
    const dateText = formatDateDmy(drawDate);
    const weekday = formatWeekday(drawDate);
    const closeTime = formatTime(closeDate);
    const investment =
      latest.lotteryPool?.totalInvestment ||
      latest.lotteryPool?.jackpot ||
      latest.lotteryPool?.derivedFirstPrizeDiv ||
      "-";
    const formattedInvestment = formatNumber(investment);
    const zhInvestment = formatPrizeZh(investment);
    const snowballParts = [];
    if (latest.snowballCode) snowballParts.push(latest.snowballCode);
    if (latest.snowballName_ch) snowballParts.push(latest.snowballName_ch);
    const snowballText = snowballParts.length ? ` ${snowballParts.join(" ")}` : "";
    const drawNo = formatDrawNo(latest);
    const dateLine = weekday ? `${dateText} (${weekday})` : dateText;

    els.heroJackpot.innerHTML = `
      <span>金多寶攪珠期數 ${drawNo}${snowballText}</span>
      <span>攪珠日期 ${dateLine}</span>
      <span>截止售票時間 ${closeTime}</span>
      <span>投注額 $${formattedInvestment}（${zhInvestment}）</span>
    `;
  }
}

function getColorClass(num) {
  if (COLOR_GROUPS.red.has(num)) return "red";
  if (COLOR_GROUPS.blue.has(num)) return "blue";
  return "green";
}

function getElementTag(num) {
  if ([1, 2, 9, 10, 23, 24, 31, 32, 39, 40].includes(num)) return "金";
  if ([5, 6, 13, 14, 21, 22, 35, 36, 43, 44].includes(num)) return "木";
  if ([11, 12, 19, 20, 27, 28, 41, 42, 49].includes(num)) return "水";
  if ([7, 8, 15, 16, 29, 30, 37, 38, 45, 46].includes(num)) return "火";
  if ([3, 4, 17, 18, 25, 26, 33, 34, 47, 48].includes(num)) return "土";
  return "";
}

function renderNumberBoard() {
  if (!els.numberBoard) return;
  if (!els.numberBoard.children.length) {
    for (let i = 1; i <= 49; i += 1) {
      const cell = document.createElement("div");
      cell.className = "number-cell";

      const item = document.createElement("span");
      item.className = `ball ${getColorClass(i)} with-element`;
      item.dataset.number = String(i);
      item.innerHTML = `
        <span>${pad2(i)}</span>
        <span class="element-inner">${getElementTag(i)}</span>
      `;

      cell.appendChild(item);
      els.numberBoard.appendChild(cell);
    }
  }
  els.numberBoard.querySelectorAll(".ball").forEach((ball) => {
    const num = Number(ball.dataset.number);
    if (state.excluded.has(num)) {
      ball.classList.add("excluded");
    } else {
      ball.classList.remove("excluded");
    }
  });
}

function renderCategoryLists() {
  const basePool = [];
  for (let i = 1; i <= 49; i += 1) {
    if (!state.excluded.has(i)) basePool.push(i);
  }

  const renderList = (container, nums) => {
    if (!container) return;
    container.innerHTML = "";
    nums.forEach((n) => {
      const ball = document.createElement("span");
      ball.className = `ball ${getColorClass(n)} with-element`;
      ball.innerHTML = `
        <span>${pad2(n)}</span>
        <span class="element-inner">${getElementTag(n)}</span>
      `;
      container.appendChild(ball);
    });
  };

  renderList(els.oddList, basePool.filter((n) => n % 2 === 1));
  renderList(els.evenList, basePool.filter((n) => n % 2 === 0));
  renderList(els.smallList, basePool.filter((n) => n <= 24));
  renderList(els.bigList, basePool.filter((n) => n >= 25));
  renderList(els.redList, basePool.filter((n) => getColorClass(n) === "red"));
  renderList(els.blueList, basePool.filter((n) => getColorClass(n) === "blue"));
  renderList(els.greenList, basePool.filter((n) => getColorClass(n) === "green"));
  renderList(els.metalList, basePool.filter((n) => getElementTag(n) === "金"));
  renderList(els.woodList, basePool.filter((n) => getElementTag(n) === "木"));
  renderList(els.waterList, basePool.filter((n) => getElementTag(n) === "水"));
  renderList(els.fireList, basePool.filter((n) => getElementTag(n) === "火"));
  renderList(els.earthList, basePool.filter((n) => getElementTag(n) === "土"));
}

function pickRandomSet(pool) {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, 6).sort((a, b) => a - b);
}

function maxConsecutiveRun(nums) {
  let maxRun = 1;
  let run = 1;
  for (let i = 1; i < nums.length; i += 1) {
    if (nums[i] === nums[i - 1] + 1) {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 1;
    }
  }
  return maxRun;
}

function maxTailCount(nums) {
  const counts = new Map();
  nums.forEach((n) => {
    const tail = n % 10;
    counts.set(tail, (counts.get(tail) || 0) + 1);
  });
  return Math.max(...counts.values());
}

function readFilters() {
  const colorCounts = {
    red: getSelectedCount(els.redCount),
    blue: getSelectedCount(els.blueCount),
    green: getSelectedCount(els.greenCount)
  };
  const elementCounts = {
    metal: getSelectedCount(els.metalCount),
    wood: getSelectedCount(els.woodCount),
    water: getSelectedCount(els.waterCount),
    fire: getSelectedCount(els.fireCount),
    earth: getSelectedCount(els.earthCount)
  };
  const colorEntries = Object.entries(colorCounts).filter(([, value]) => value !== null);
  if (colorEntries.length === 2) {
    const sum = colorEntries.reduce((acc, [, value]) => acc + value, 0);
    const remaining = 6 - sum;
    const missing = Object.keys(colorCounts).find((key) => colorCounts[key] === null);
    if (missing) colorCounts[missing] = remaining;
  }
  const elementEntries = Object.entries(elementCounts).filter(([, value]) => value !== null);
  if (elementEntries.length === 4) {
    const sum = elementEntries.reduce((acc, [, value]) => acc + value, 0);
    const remaining = 6 - sum;
    const missing = Object.keys(elementCounts).find((key) => elementCounts[key] === null);
    if (missing) elementCounts[missing] = remaining;
  }

  const sumMinValue = parseNumber(els.sumMin.value);
  const sumMaxValue = parseNumber(els.sumMax.value);
  const sumMin = sumMinValue !== null && sumMaxValue !== null ? Math.min(sumMinValue, sumMaxValue) : sumMinValue;
  const sumMax = sumMinValue !== null && sumMaxValue !== null ? Math.max(sumMinValue, sumMaxValue) : sumMaxValue;

  return {
    sumMin,
    sumMax,
    oddCount: getSelectedCount(els.oddCount),
    evenCount: getSelectedCount(els.evenCount),
    smallCount: getSelectedCount(els.smallCount),
    bigCount: getSelectedCount(els.bigCount),
    maxConsecutive:
      parseNumber(els.maxConsecutive.value) === null
        ? 6
        : parseNumber(els.maxConsecutive.value),
    maxTail: parseNumber(els.maxTail.value),
    noAllOdd: !!els.noAllOdd?.checked,
    noAllEven: !!els.noAllEven?.checked,
    noMultiplicationCombo: !!els.noMultiplicationCombo?.checked,
    minRows: parseNumber(els.minRows?.value) || 1,
    colorCounts,
    elementCounts
  };
}

function getFilteredPool(filters) {
  const pool = [];
  const colorCounts = filters.colorCounts;
  const hasColorLimit = Object.values(colorCounts).some((val) => val !== null);
  const elementCounts = filters.elementCounts;
  const hasElementLimit = Object.values(elementCounts).some((val) => val !== null);
  for (let i = 1; i <= 49; i += 1) {
    if (state.excluded.has(i)) continue;
    if (hasColorLimit) {
      const color = getColorClass(i);
      if (color === "red" && colorCounts.red === 0) continue;
      if (color === "blue" && colorCounts.blue === 0) continue;
      if (color === "green" && colorCounts.green === 0) continue;
    }
    if (hasElementLimit) {
      const tag = getElementTag(i);
      if (tag === "金" && elementCounts.metal === 0) continue;
      if (tag === "木" && elementCounts.wood === 0) continue;
      if (tag === "水" && elementCounts.water === 0) continue;
      if (tag === "火" && elementCounts.fire === 0) continue;
      if (tag === "土" && elementCounts.earth === 0) continue;
    }
    pool.push(i);
  }
  return pool;
}

function gcd(a, b) {
  let x = a;
  let y = b;
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function popcount(mask) {
  let count = 0;
  let m = mask;
  while (m) {
    m &= m - 1;
    count += 1;
  }
  return count;
}

async function countCombinations(pool, filters, token) {
  const n = pool.length;
  if (n < 6) return 0;

  const prefix = new Array(n + 1).fill(0);
  const suffixOdd = new Array(n + 1).fill(0);
  const suffixEven = new Array(n + 1).fill(0);
  const suffixBig = new Array(n + 1).fill(0);
  const suffixSmall = new Array(n + 1).fill(0);
  const suffixRowsMask = new Array(n + 1).fill(0);
  const suffixRed = new Array(n + 1).fill(0);
  const suffixBlue = new Array(n + 1).fill(0);
  const suffixGreen = new Array(n + 1).fill(0);
  const suffixMetal = new Array(n + 1).fill(0);
  const suffixWood = new Array(n + 1).fill(0);
  const suffixWater = new Array(n + 1).fill(0);
  const suffixFire = new Array(n + 1).fill(0);
  const suffixEarth = new Array(n + 1).fill(0);

  for (let i = 0; i < n; i += 1) {
    prefix[i + 1] = prefix[i] + pool[i];
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    suffixOdd[i] = suffixOdd[i + 1] + (pool[i] % 2 === 1 ? 1 : 0);
    suffixEven[i] = suffixEven[i + 1] + (pool[i] % 2 === 0 ? 1 : 0);
    suffixBig[i] = suffixBig[i + 1] + (pool[i] >= 25 ? 1 : 0);
    suffixSmall[i] = suffixSmall[i + 1] + (pool[i] <= 24 ? 1 : 0);
    suffixRowsMask[i] = suffixRowsMask[i + 1] | (1 << (getRowIndex(pool[i]) - 1));
    const color = getColorClass(pool[i]);
    suffixRed[i] = suffixRed[i + 1] + (color === "red" ? 1 : 0);
    suffixBlue[i] = suffixBlue[i + 1] + (color === "blue" ? 1 : 0);
    suffixGreen[i] = suffixGreen[i + 1] + (color === "green" ? 1 : 0);
    const element = getElementTag(pool[i]);
    suffixMetal[i] = suffixMetal[i + 1] + (element === "金" ? 1 : 0);
    suffixWood[i] = suffixWood[i + 1] + (element === "木" ? 1 : 0);
    suffixWater[i] = suffixWater[i + 1] + (element === "水" ? 1 : 0);
    suffixFire[i] = suffixFire[i + 1] + (element === "火" ? 1 : 0);
    suffixEarth[i] = suffixEarth[i + 1] + (element === "土" ? 1 : 0);
  }

  const { red: redTarget, blue: blueTarget, green: greenTarget } = filters.colorCounts;
  const {
    metal: metalTarget,
    wood: woodTarget,
    water: waterTarget,
    fire: fireTarget,
    earth: earthTarget
  } = filters.elementCounts;

  let iterations = 0;

  async function dfs(
    start,
    depth,
    sum,
    oddCount,
    smallCount,
    bigCount,
    tails,
    lastNum,
    runLen,
    rowsMask,
    redCount,
    blueCount,
    greenCount,
    metalCount,
    woodCount,
    waterCount,
    fireCount,
    earthCount,
    currentGcd
  ) {
    if (state.countToken !== token) return 0;
    const remaining = 6 - depth;
    if (remaining === 0) {
      if (filters.sumMin !== null && sum < filters.sumMin) return 0;
      if (filters.sumMax !== null && sum > filters.sumMax) return 0;
      if (filters.oddCount !== null && oddCount !== filters.oddCount) return 0;
      if (filters.evenCount !== null && (6 - oddCount) !== filters.evenCount) return 0;
      if (filters.smallCount !== null && smallCount !== filters.smallCount) return 0;
      if (filters.bigCount !== null && bigCount !== filters.bigCount) return 0;
      if (redTarget !== null && redCount !== redTarget) return 0;
      if (blueTarget !== null && blueCount !== blueTarget) return 0;
      if (greenTarget !== null && greenCount !== greenTarget) return 0;
      if (metalTarget !== null && metalCount !== metalTarget) return 0;
      if (woodTarget !== null && woodCount !== woodTarget) return 0;
      if (waterTarget !== null && waterCount !== waterTarget) return 0;
      if (fireTarget !== null && fireCount !== fireTarget) return 0;
      if (earthTarget !== null && earthCount !== earthTarget) return 0;
      if (filters.noAllOdd && oddCount === 6) return 0;
      if (filters.noAllEven && oddCount === 0) return 0;
      if (filters.minRows > 1 && popcount(rowsMask) < filters.minRows) return 0;
      if (filters.maxTail !== null && Math.max(...tails) > filters.maxTail) return 0;
      if (filters.noMultiplicationCombo) {
        for (let base = 2; base <= 9; base += 1) {
          if (currentGcd % base === 0) return 0;
        }
      }
      return 1;
    }

    if (start + remaining > n) return 0;

    if (filters.sumMax !== null) {
      const minSum = prefix[start + remaining] - prefix[start];
      if (sum + minSum > filters.sumMax) return 0;
    }
    if (filters.sumMin !== null) {
      const maxSum = prefix[n] - prefix[n - remaining];
      if (sum + maxSum < filters.sumMin) return 0;
    }

    if (filters.oddCount !== null) {
      const maxOdd = oddCount + Math.min(remaining, suffixOdd[start]);
      const evenCountRemaining = (n - start) - suffixOdd[start];
      const minOdd = oddCount + Math.max(0, remaining - evenCountRemaining);
      if (filters.oddCount < minOdd || filters.oddCount > maxOdd) return 0;
    }
    if (filters.evenCount !== null) {
      const maxEven = (depth - oddCount) + Math.min(remaining, suffixEven[start]);
      const oddRemaining = (n - start) - suffixEven[start];
      const minEven = (depth - oddCount) + Math.max(0, remaining - oddRemaining);
      if (filters.evenCount < minEven || filters.evenCount > maxEven) return 0;
    }

    if (filters.bigCount !== null) {
      const maxBig = bigCount + Math.min(remaining, suffixBig[start]);
      const smallRemaining = (n - start) - suffixBig[start];
      const minBig = bigCount + Math.max(0, remaining - smallRemaining);
      if (filters.bigCount < minBig || filters.bigCount > maxBig) return 0;
    }
    if (filters.smallCount !== null) {
      const maxSmall = smallCount + Math.min(remaining, suffixSmall[start]);
      const bigRemaining = (n - start) - suffixSmall[start];
      const minSmall = smallCount + Math.max(0, remaining - bigRemaining);
      if (filters.smallCount < minSmall || filters.smallCount > maxSmall) return 0;
    }
    if (redTarget !== null) {
      const maxRed = redCount + Math.min(remaining, suffixRed[start]);
      const nonRedRemaining = (n - start) - suffixRed[start];
      const minRed = redCount + Math.max(0, remaining - nonRedRemaining);
      if (redTarget < minRed || redTarget > maxRed) return 0;
    }
    if (blueTarget !== null) {
      const maxBlue = blueCount + Math.min(remaining, suffixBlue[start]);
      const nonBlueRemaining = (n - start) - suffixBlue[start];
      const minBlue = blueCount + Math.max(0, remaining - nonBlueRemaining);
      if (blueTarget < minBlue || blueTarget > maxBlue) return 0;
    }
    if (greenTarget !== null) {
      const maxGreen = greenCount + Math.min(remaining, suffixGreen[start]);
      const nonGreenRemaining = (n - start) - suffixGreen[start];
      const minGreen = greenCount + Math.max(0, remaining - nonGreenRemaining);
      if (greenTarget < minGreen || greenTarget > maxGreen) return 0;
    }
    if (metalTarget !== null) {
      const maxMetal = metalCount + Math.min(remaining, suffixMetal[start]);
      const nonMetalRemaining = (n - start) - suffixMetal[start];
      const minMetal = metalCount + Math.max(0, remaining - nonMetalRemaining);
      if (metalTarget < minMetal || metalTarget > maxMetal) return 0;
    }
    if (woodTarget !== null) {
      const maxWood = woodCount + Math.min(remaining, suffixWood[start]);
      const nonWoodRemaining = (n - start) - suffixWood[start];
      const minWood = woodCount + Math.max(0, remaining - nonWoodRemaining);
      if (woodTarget < minWood || woodTarget > maxWood) return 0;
    }
    if (waterTarget !== null) {
      const maxWater = waterCount + Math.min(remaining, suffixWater[start]);
      const nonWaterRemaining = (n - start) - suffixWater[start];
      const minWater = waterCount + Math.max(0, remaining - nonWaterRemaining);
      if (waterTarget < minWater || waterTarget > maxWater) return 0;
    }
    if (fireTarget !== null) {
      const maxFire = fireCount + Math.min(remaining, suffixFire[start]);
      const nonFireRemaining = (n - start) - suffixFire[start];
      const minFire = fireCount + Math.max(0, remaining - nonFireRemaining);
      if (fireTarget < minFire || fireTarget > maxFire) return 0;
    }
    if (earthTarget !== null) {
      const maxEarth = earthCount + Math.min(remaining, suffixEarth[start]);
      const nonEarthRemaining = (n - start) - suffixEarth[start];
      const minEarth = earthCount + Math.max(0, remaining - nonEarthRemaining);
      if (earthTarget < minEarth || earthTarget > maxEarth) return 0;
    }

    if (filters.noAllOdd || filters.noAllEven) {
      if (oddCount === 0 && suffixOdd[start] === 0) return 0;
      if (oddCount === depth && (n - start - suffixOdd[start]) === 0) return 0;
    }

    if (filters.minRows > 1) {
      const possibleRows = popcount(rowsMask | suffixRowsMask[start]);
      if (possibleRows < filters.minRows) return 0;
    }

    let total = 0;
    for (let i = start; i <= n - remaining; i += 1) {
      const num = pool[i];
      const color = getColorClass(num);
      const nextSum = sum + num;
      const nextOdd = oddCount + (num % 2 === 1 ? 1 : 0);
      const nextRed = redCount + (color === "red" ? 1 : 0);
      const nextBlue = blueCount + (color === "blue" ? 1 : 0);
      const nextGreen = greenCount + (color === "green" ? 1 : 0);
      const element = getElementTag(num);
      const nextMetal = metalCount + (element === "金" ? 1 : 0);
      const nextWood = woodCount + (element === "木" ? 1 : 0);
      const nextWater = waterCount + (element === "水" ? 1 : 0);
      const nextFire = fireCount + (element === "火" ? 1 : 0);
      const nextEarth = earthCount + (element === "土" ? 1 : 0);
      const nextSmall = smallCount + (num <= 24 ? 1 : 0);
      const nextBig = bigCount + (num >= 25 ? 1 : 0);
      const tail = num % 10;
      const nextTails = tails.slice();
      nextTails[tail] += 1;
      if (filters.maxTail !== null && nextTails[tail] > filters.maxTail) {
        continue;
      }
      const nextRun = lastNum !== null && num === lastNum + 1 ? runLen + 1 : 1;
      if (nextRun > filters.maxConsecutive) continue;
      const nextRows = rowsMask | (1 << (getRowIndex(num) - 1));
      const nextGcd = currentGcd === 0 ? num : gcd(currentGcd, num);

      iterations += 1;
      if (iterations % 2000 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (state.countToken !== token) return 0;
      }

      total += await dfs(
        i + 1,
        depth + 1,
        nextSum,
        nextOdd,
        nextSmall,
        nextBig,
        nextTails,
        num,
        nextRun,
        nextRows,
        nextRed,
        nextBlue,
        nextGreen,
        nextMetal,
        nextWood,
        nextWater,
        nextFire,
        nextEarth,
        nextGcd
      );
    }
    return total;
  }

  return dfs(0, 0, 0, 0, 0, 0, new Array(10).fill(0), null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}

function isValid(nums, filters) {
  const sum = nums.reduce((acc, n) => acc + n, 0);
  if (filters.sumMin !== null && sum < filters.sumMin) return false;
  if (filters.sumMax !== null && sum > filters.sumMax) return false;

  const oddCount = nums.filter((n) => n % 2 === 1).length;
  if (filters.oddCount !== null && oddCount !== filters.oddCount) return false;
  if (filters.evenCount !== null && (6 - oddCount) !== filters.evenCount) return false;
  if (filters.noAllOdd && oddCount === 6) return false;
  if (filters.noAllEven && oddCount === 0) return false;

  const bigCount = nums.filter((n) => n >= 25).length;
  if (filters.bigCount !== null && bigCount !== filters.bigCount) return false;
  const smallCount = nums.filter((n) => n <= 24).length;
  if (filters.smallCount !== null && smallCount !== filters.smallCount) return false;

  const colorCounts = {
    red: nums.filter((n) => getColorClass(n) === "red").length,
    blue: nums.filter((n) => getColorClass(n) === "blue").length,
    green: nums.filter((n) => getColorClass(n) === "green").length
  };
  if (filters.colorCounts.red !== null && colorCounts.red !== filters.colorCounts.red) {
    return false;
  }
  if (filters.colorCounts.blue !== null && colorCounts.blue !== filters.colorCounts.blue) {
    return false;
  }
  if (filters.colorCounts.green !== null && colorCounts.green !== filters.colorCounts.green) {
    return false;
  }

  const elementCounts = {
    metal: nums.filter((n) => getElementTag(n) === "金").length,
    wood: nums.filter((n) => getElementTag(n) === "木").length,
    water: nums.filter((n) => getElementTag(n) === "水").length,
    fire: nums.filter((n) => getElementTag(n) === "火").length,
    earth: nums.filter((n) => getElementTag(n) === "土").length
  };
  if (filters.elementCounts.metal !== null && elementCounts.metal !== filters.elementCounts.metal) {
    return false;
  }
  if (filters.elementCounts.wood !== null && elementCounts.wood !== filters.elementCounts.wood) {
    return false;
  }
  if (filters.elementCounts.water !== null && elementCounts.water !== filters.elementCounts.water) {
    return false;
  }
  if (filters.elementCounts.fire !== null && elementCounts.fire !== filters.elementCounts.fire) {
    return false;
  }
  if (filters.elementCounts.earth !== null && elementCounts.earth !== filters.elementCounts.earth) {
    return false;
  }

  if (maxConsecutiveRun(nums) > filters.maxConsecutive) return false;
  if (filters.maxTail !== null && maxTailCount(nums) > filters.maxTail) {
    return false;
  }
  if (filters.minRows > 1) {
    const rowCount = new Set(nums.map((n) => getRowIndex(n))).size;
    if (rowCount < filters.minRows) return false;
  }
  if (filters.noMultiplicationCombo) {
    for (let base = 2; base <= 9; base += 1) {
      if (nums.every((n) => n % base === 0)) return false;
    }
  }
  return true;
}

function generateSets() {
  buildExcluded();
  const filters = readFilters();
  const pool = getFilteredPool(filters);
  if (pool.length < 6) {
    setGenerateStatus("可用號碼唔夠 6 個。請減少排除條件。");
    return [];
  }

  const total = Math.min(
    Math.max(parseNumber(els.ticketCount?.value) || 10, 10),
    100
  );
  const resultSets = [];
  const maxAttempts = 20000;

  for (let i = 0; i < total; i += 1) {
    let found = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const nums = pickRandomSet(pool);
      if (isValid(nums, filters)) {
        found = nums;
        break;
      }
    }
    if (!found) {
      setGenerateStatus("搵唔到符合條件嘅組合，試下放鬆條件。");
      break;
    }
    resultSets.push(found);
  }

  state.lastGenerated = { filters, total };
  return resultSets;
}

function renderResults(sets) {
  els.resultList.innerHTML = "";
  if (!sets.length) return;
  sets.forEach((nums, idx) => {
    const sum = nums.reduce((acc, n) => acc + n, 0);
    const avgText = formatAverage(sum, nums.length);
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="numbers">
        ${nums
          .map(
            (n) => `
              <span class="ball ${getColorClass(n)} with-element">
                <span>${pad2(n)}</span>
                <span class="element-inner">${getElementTag(n)}</span>
              </span>
            `
          )
          .join("")}
      </div>
      <div class="result-stats">總和 ${sum}，平均數 ${avgText}</div>
    `;
    els.resultList.appendChild(card);
  });
}

function reroll() {
  if (!state.lastGenerated) {
    setGenerateStatus("未有上一組設定。先生成一次。");
    return;
  }
  renderResults(generateSets());
}

els.lastN.addEventListener("change", () => {
  const value = Math.min(Math.max(parseNumber(els.lastN.value) || 0, 0), 5);
  els.lastN.value = value;
  fetchDraws(value);
});

let syncingSize = false;

function updateCountConstraints(source) {
  if (syncingSize) return;
  syncingSize = true;
  const smallVal = getSelectedCount(els.smallCount);
  const bigVal = getSelectedCount(els.bigCount);
  const oddVal = getSelectedCount(els.oddCount);
  const evenVal = getSelectedCount(els.evenCount);
  const redVal = getSelectedCount(els.redCount);
  const blueVal = getSelectedCount(els.blueCount);
  const greenVal = getSelectedCount(els.greenCount);
  const metalVal = getSelectedCount(els.metalCount);
  const woodVal = getSelectedCount(els.woodCount);
  const waterVal = getSelectedCount(els.waterCount);
  const fireVal = getSelectedCount(els.fireCount);
  const earthVal = getSelectedCount(els.earthCount);

  let maxBig = smallVal !== null ? 6 - smallVal : null;
  let maxSmall = bigVal !== null ? 6 - bigVal : null;
  let maxEven = oddVal !== null ? 6 - oddVal : null;
  let maxOdd = evenVal !== null ? 6 - evenVal : null;
  let maxRed = 6 - (blueVal ?? 0) - (greenVal ?? 0);
  let maxBlue = 6 - (redVal ?? 0) - (greenVal ?? 0);
  let maxGreen = 6 - (redVal ?? 0) - (blueVal ?? 0);
  let maxMetal = 6 - (woodVal ?? 0) - (waterVal ?? 0) - (fireVal ?? 0) - (earthVal ?? 0);
  let maxWood = 6 - (metalVal ?? 0) - (waterVal ?? 0) - (fireVal ?? 0) - (earthVal ?? 0);
  let maxWater = 6 - (metalVal ?? 0) - (woodVal ?? 0) - (fireVal ?? 0) - (earthVal ?? 0);
  let maxFire = 6 - (metalVal ?? 0) - (woodVal ?? 0) - (waterVal ?? 0) - (earthVal ?? 0);
  let maxEarth = 6 - (metalVal ?? 0) - (woodVal ?? 0) - (waterVal ?? 0) - (fireVal ?? 0);

  if (source === "small" && smallVal !== null && bigVal === null && maxBig !== null) {
    setSelectedCount(els.bigCount, maxBig);
    maxSmall = 6 - maxBig;
  } else if (source === "big" && bigVal !== null && smallVal === null && maxSmall !== null) {
    setSelectedCount(els.smallCount, maxSmall);
    maxBig = 6 - maxSmall;
  } else if (source === "odd" && oddVal !== null && evenVal === null && maxEven !== null) {
    setSelectedCount(els.evenCount, maxEven);
    maxOdd = 6 - maxEven;
  } else if (source === "even" && evenVal !== null && oddVal === null && maxOdd !== null) {
    setSelectedCount(els.oddCount, maxOdd);
    maxEven = 6 - maxOdd;
  }

  const cleared =
    setCountDisabled(els.bigCount, maxBig) ||
    setCountDisabled(els.smallCount, maxSmall) ||
    setCountDisabled(els.evenCount, maxEven) ||
    setCountDisabled(els.oddCount, maxOdd) ||
    setCountDisabled(els.redCount, maxRed) ||
    setCountDisabled(els.blueCount, maxBlue) ||
    setCountDisabled(els.greenCount, maxGreen) ||
    setCountDisabled(els.metalCount, maxMetal) ||
    setCountDisabled(els.woodCount, maxWood) ||
    setCountDisabled(els.waterCount, maxWater) ||
    setCountDisabled(els.fireCount, maxFire) ||
    setCountDisabled(els.earthCount, maxEarth);
  syncingSize = false;
  if (cleared) updateCountConstraints();
}

function bindCountGroup(container, source) {
  if (!container) return;
  container.addEventListener("change", (event) => {
    const input = event.target;
    if (!input || input.type !== "checkbox") return;
    if (input.checked) {
      container.querySelectorAll("input[type=checkbox]").forEach((other) => {
        if (other !== input) other.checked = false;
      });
    }
    updateCountConstraints(source);
    autoUpdate();
  });
}

bindCountGroup(els.smallCount, "small");
bindCountGroup(els.bigCount, "big");
bindCountGroup(els.oddCount, "odd");
bindCountGroup(els.evenCount, "even");
bindCountGroup(els.redCount, "red");
bindCountGroup(els.blueCount, "blue");
bindCountGroup(els.greenCount, "green");
bindCountGroup(els.metalCount, "metal");
bindCountGroup(els.woodCount, "wood");
bindCountGroup(els.waterCount, "water");
bindCountGroup(els.fireCount, "fire");
bindCountGroup(els.earthCount, "earth");

function handleExcludeChange() {
  buildExcluded();
  autoUpdate();
}

let autoTimer = null;
let countTimer = null;

function scheduleComboCount() {
  clearTimeout(countTimer);
  countTimer = setTimeout(async () => {
    const token = state.countToken + 1;
    state.countToken = token;
    setComboCount("可組合：計算中…");
    const filters = readFilters();
    const pool = getFilteredPool(filters);
    const count = await countCombinations(pool, filters, token);
    if (state.countToken !== token) return;
    setComboCount(`可組合：${count.toLocaleString("en-US")}`);
  }, 200);
}

function autoUpdate() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    setGenerateStatus("計算中…");
    updateSumRangeUI();
    updateAvailableCount();
    renderCategoryLists();
    const sets = generateSets();
    if (sets.length) {
      renderResults(sets);
      setGenerateStatus("");
    }
    scheduleComboCount();
  }, 250);
}

els.generateBtn.addEventListener("click", autoUpdate);

[
  els.sumMin,
  els.sumMax,
  els.maxConsecutive,
  els.maxTail,
  els.noAllOdd,
  els.noAllEven,
  els.noMultiplicationCombo,
  els.minRows,
  els.ticketCount
].forEach((input) => {
  if (!input) return;
  input.addEventListener("input", autoUpdate);
  input.addEventListener("change", autoUpdate);
});

renderNumberBoard();
updateCountConstraints();
updateSumRangeUI();
fetchDraws(parseNumber(els.lastN.value) || 0);
