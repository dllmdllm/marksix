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
  colorRed: document.getElementById("colorRed"),
  colorBlue: document.getElementById("colorBlue"),
  colorGreen: document.getElementById("colorGreen"),
  needMetal: document.getElementById("needMetal"),
  needWood: document.getElementById("needWood"),
  needWater: document.getElementById("needWater"),
  needFire: document.getElementById("needFire"),
  needEarth: document.getElementById("needEarth"),
  sumMin: document.getElementById("sumMin"),
  sumMax: document.getElementById("sumMax"),
  oddCount: document.getElementById("oddCount"),
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

function colorMaskForNum(num) {
  const color = getColorClass(num);
  if (color === "red") return 1;
  if (color === "blue") return 2;
  return 4;
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
  const colors = [els.colorRed, els.colorBlue, els.colorGreen]
    .filter((input) => input && input.checked)
    .map((input) => input.id.replace("color", "").toLowerCase());
  const elements = {
    metal: !!els.needMetal?.checked,
    wood: !!els.needWood?.checked,
    water: !!els.needWater?.checked,
    fire: !!els.needFire?.checked,
    earth: !!els.needEarth?.checked
  };

  return {
    sumMin: parseNumber(els.sumMin.value),
    sumMax: parseNumber(els.sumMax.value),
    oddCount: parseNumber(els.oddCount.value),
    bigCount: parseNumber(els.bigCount.value),
    maxConsecutive:
      parseNumber(els.maxConsecutive.value) === null
        ? 6
        : parseNumber(els.maxConsecutive.value),
    maxTail: parseNumber(els.maxTail.value),
    noAllOdd: !!els.noAllOdd?.checked,
    noAllEven: !!els.noAllEven?.checked,
    noMultiplicationCombo: !!els.noMultiplicationCombo?.checked,
    minRows: parseNumber(els.minRows?.value) || 1,
    colors,
    elements
  };
}

function getFilteredPool(filters) {
  const pool = [];
  for (let i = 1; i <= 49; i += 1) {
    if (state.excluded.has(i)) continue;
    if (filters.colors.length && !filters.colors.includes(getColorClass(i))) {
      continue;
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

function elementMaskForNum(num) {
  const tag = getElementTag(num);
  if (tag === "金") return 1;
  if (tag === "木") return 2;
  if (tag === "水") return 4;
  if (tag === "火") return 8;
  if (tag === "土") return 16;
  return 0;
}

async function countCombinations(pool, filters, token) {
  const n = pool.length;
  if (n < 6) return 0;

  const prefix = new Array(n + 1).fill(0);
  const suffixOdd = new Array(n + 1).fill(0);
  const suffixBig = new Array(n + 1).fill(0);
  const suffixRowsMask = new Array(n + 1).fill(0);
  const suffixElementsMask = new Array(n + 1).fill(0);
  const suffixColorsMask = new Array(n + 1).fill(0);

  for (let i = 0; i < n; i += 1) {
    prefix[i + 1] = prefix[i] + pool[i];
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    suffixOdd[i] = suffixOdd[i + 1] + (pool[i] % 2 === 1 ? 1 : 0);
    suffixBig[i] = suffixBig[i + 1] + (pool[i] >= 25 ? 1 : 0);
    suffixRowsMask[i] = suffixRowsMask[i + 1] | (1 << (getRowIndex(pool[i]) - 1));
    suffixElementsMask[i] = suffixElementsMask[i + 1] | elementMaskForNum(pool[i]);
    suffixColorsMask[i] = suffixColorsMask[i + 1] | colorMaskForNum(pool[i]);
  }

  const requiredElementsMask =
    (filters.elements.metal ? 1 : 0) |
    (filters.elements.wood ? 2 : 0) |
    (filters.elements.water ? 4 : 0) |
    (filters.elements.fire ? 8 : 0) |
    (filters.elements.earth ? 16 : 0);
  const needMultiColor = filters.colors.length >= 2;

  let iterations = 0;

  async function dfs(
    start,
    depth,
    sum,
    oddCount,
    bigCount,
    tails,
    lastNum,
    runLen,
    rowsMask,
    elementsMask,
    colorMask,
    currentGcd
  ) {
    if (state.countToken !== token) return 0;
    const remaining = 6 - depth;
    if (remaining === 0) {
      if (filters.sumMin !== null && sum < filters.sumMin) return 0;
      if (filters.sumMax !== null && sum > filters.sumMax) return 0;
      if (filters.oddCount !== null && oddCount !== filters.oddCount) return 0;
      if (filters.bigCount !== null && bigCount !== filters.bigCount) return 0;
      if (filters.noAllOdd && oddCount === 6) return 0;
      if (filters.noAllEven && oddCount === 0) return 0;
      if (filters.minRows > 1 && popcount(rowsMask) < filters.minRows) return 0;
      if (filters.maxTail !== null && Math.max(...tails) > filters.maxTail) return 0;
      if ((elementsMask & requiredElementsMask) !== requiredElementsMask) return 0;
      if (needMultiColor && popcount(colorMask) < 2) return 0;
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

    if (filters.bigCount !== null) {
      const maxBig = bigCount + Math.min(remaining, suffixBig[start]);
      const smallRemaining = (n - start) - suffixBig[start];
      const minBig = bigCount + Math.max(0, remaining - smallRemaining);
      if (filters.bigCount < minBig || filters.bigCount > maxBig) return 0;
    }

    if (filters.noAllOdd || filters.noAllEven) {
      if (oddCount === 0 && suffixOdd[start] === 0) return 0;
      if (oddCount === depth && (n - start - suffixOdd[start]) === 0) return 0;
    }

    if (filters.minRows > 1) {
      const possibleRows = popcount(rowsMask | suffixRowsMask[start]);
      if (possibleRows < filters.minRows) return 0;
    }

    if (((elementsMask | suffixElementsMask[start]) & requiredElementsMask) !== requiredElementsMask) {
      return 0;
    }
    if (needMultiColor && popcount(colorMask | suffixColorsMask[start]) < 2) {
      return 0;
    }

    let total = 0;
    for (let i = start; i <= n - remaining; i += 1) {
      const num = pool[i];
      const nextSum = sum + num;
      const nextOdd = oddCount + (num % 2 === 1 ? 1 : 0);
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
      const nextElements = elementsMask | elementMaskForNum(num);
      const nextColors = colorMask | colorMaskForNum(num);
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
        nextBig,
        nextTails,
        num,
        nextRun,
        nextRows,
        nextElements,
        nextColors,
        nextGcd
      );
    }
    return total;
  }

  return dfs(0, 0, 0, 0, 0, new Array(10).fill(0), null, 0, 0, 0, 0, 0);
}

function isValid(nums, filters) {
  const sum = nums.reduce((acc, n) => acc + n, 0);
  if (filters.sumMin !== null && sum < filters.sumMin) return false;
  if (filters.sumMax !== null && sum > filters.sumMax) return false;

  const oddCount = nums.filter((n) => n % 2 === 1).length;
  if (filters.oddCount !== null && oddCount !== filters.oddCount) return false;
  if (filters.noAllOdd && oddCount === 6) return false;
  if (filters.noAllEven && oddCount === 0) return false;

  const bigCount = nums.filter((n) => n >= 25).length;
  if (filters.bigCount !== null && bigCount !== filters.bigCount) return false;

  if (maxConsecutiveRun(nums) > filters.maxConsecutive) return false;
  if (filters.maxTail !== null && maxTailCount(nums) > filters.maxTail) {
    return false;
  }
  if (filters.minRows > 1) {
    const rowCount = new Set(nums.map((n) => getRowIndex(n))).size;
    if (rowCount < filters.minRows) return false;
  }
  if (filters.colors.length) {
    if (nums.some((n) => !filters.colors.includes(getColorClass(n)))) {
      return false;
    }
    if (filters.colors.length >= 2) {
      const colorSet = new Set(nums.map((n) => getColorClass(n)));
      if (colorSet.size < 2) return false;
    }
  }
  if (filters.noMultiplicationCombo) {
    for (let base = 2; base <= 9; base += 1) {
      if (nums.every((n) => n % base === 0)) return false;
    }
  }
  if (filters.elements.metal && !nums.some((n) => getElementTag(n) === "金")) {
    return false;
  }
  if (filters.elements.wood && !nums.some((n) => getElementTag(n) === "木")) {
    return false;
  }
  if (filters.elements.water && !nums.some((n) => getElementTag(n) === "水")) {
    return false;
  }
  if (filters.elements.fire && !nums.some((n) => getElementTag(n) === "火")) {
    return false;
  }
  if (filters.elements.earth && !nums.some((n) => getElementTag(n) === "土")) {
    return false;
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
    updateAvailableCount();
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
  els.oddCount,
  els.bigCount,
  els.maxConsecutive,
  els.maxTail,
  els.noAllOdd,
  els.noAllEven,
  els.noMultiplicationCombo,
  els.minRows,
  els.colorRed,
  els.colorBlue,
  els.colorGreen,
  els.needMetal,
  els.needWood,
  els.needWater,
  els.needFire,
  els.needEarth,
  els.ticketCount
].forEach((input) => {
  if (!input) return;
  input.addEventListener("input", autoUpdate);
  input.addEventListener("change", autoUpdate);
});

renderNumberBoard();
fetchDraws(parseNumber(els.lastN.value) || 0);
