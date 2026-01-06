const API_URL = "https://info.cld.hkjc.com/graphql/base/";
const LOCAL_API = "http://127.0.0.1:5177/api/marksix";
const STATIC_API = "data/marksix.json";
const LOCAL_IMPORT_API = "http://127.0.0.1:5177/api/marksix/import";
const AUTO_SYNC_LATEST = 100;
const AUTO_SYNC_INTERVAL_HOURS = 24;

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
  repeatInfo: document.getElementById("repeatInfo"),
  numberBoard: document.getElementById("numberBoard"),
  comboCount: document.getElementById("comboCount"),
  excludedSummary: document.getElementById("excludedSummary"),
  heroJackpot: document.getElementById("heroJackpot"),
  rowLimit: document.getElementById("rowLimit"),
  redCount: document.getElementById("redCount"),
  blueCount: document.getElementById("blueCount"),
  greenCount: document.getElementById("greenCount"),
  oddList: document.getElementById("oddList"),
  evenList: document.getElementById("evenList"),
  oddNote: document.getElementById("oddNote"),
  evenNote: document.getElementById("evenNote"),
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
  row1List: document.getElementById("row1List"),
  row2List: document.getElementById("row2List"),
  row3List: document.getElementById("row3List"),
  row4List: document.getElementById("row4List"),
  row5List: document.getElementById("row5List"),
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
  availableCount: document.getElementById("availableCount"),
  analysisN: document.getElementById("analysisN"),
  analysisStatus: document.getElementById("analysisStatus"),
  analysisCold: document.getElementById("analysisCold"),
  analysisHot: document.getElementById("analysisHot"),
  analysisCounts: document.getElementById("analysisCounts"),
  syncAll: document.getElementById("syncAll"),
  syncLatest: document.getElementById("syncLatest"),
  syncStatus: document.getElementById("syncStatus"),
  syncProgress: document.getElementById("syncProgress"),
  syncProgressText: document.getElementById("syncProgressText"),
  repeatStatus: document.querySelector("#repeatInfo .repeat-status"),
  pickDan: document.getElementById("pickDan"),
  danList: document.getElementById("danList"),
  danStatus: document.getElementById("danStatus"),
  danReason: document.getElementById("danReason")
};

const state = {
  draws: [],
  excluded: new Set(),
  lastGenerated: null,
  lastGeneratedKey: null,
  countToken: 0,
  latestInfo: null,
  analysisDraws: [],
  lastComboKey: null,
  lastComboCount: null,
  lastExcludedKey: null,
  suggested: new Set()
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
  els.availableCount.textContent = `（可用號碼：${pool.length}）`;
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
    const dateText = draw.drawDate?.split("+")[0] || "";
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

    const { sumText, detailText } = formatSummaryLine(allNums);
    const card = document.createElement("div");
    card.className = "result-card excluded-card";
    const metaLine = document.createElement("div");
    metaLine.className = "excluded-meta-line";
    metaLine.textContent = `${dateText} 第${draw.year}/${draw.no}期`;
    const stats = document.createElement("div");
    stats.className = "result-stats";
    stats.textContent = sumText;
    const detail = document.createElement("div");
    detail.className = "result-detail";
    detail.textContent = detailText;

    card.appendChild(metaLine);
    card.appendChild(numsWrap);
    card.appendChild(stats);
    card.appendChild(detail);
    els.excludedSummary.appendChild(card);
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

function filterResultDraws(draws) {
  return (draws || []).filter(
    (draw) => draw?.status === "Result" && (draw.drawResult?.drawnNo || []).length
  );
}

async function requestDraws(variables) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables,
      operationName: "marksixResult"
    })
  });
  const data = await res.json();
  if (data.errors) {
    throw new Error(data.errors.map((e) => e.message).join(" | "));
  }
  return data.data?.lotteryDraws || [];
}

async function postLocalImport(draws) {
  const res = await fetch(LOCAL_IMPORT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draws })
  });
  if (!res.ok) {
    throw new Error(`本地匯入失敗 (${res.status})`);
  }
  return res.json();
}

function setSyncStatus(message) {
  if (!els.syncStatus) return;
  els.syncStatus.textContent = message;
}

function setSyncProgress(value) {
  if (els.syncProgress) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    els.syncProgress.value = clamped;
  }
  if (els.syncProgressText) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    els.syncProgressText.textContent = `${clamped}%`;
  }
}

function setSyncDisabled(disabled) {
  if (els.syncAll) els.syncAll.disabled = disabled;
  if (els.syncLatest) els.syncLatest.disabled = disabled;
}

let isSyncing = false;

async function syncAllDraws() {
  if (isSyncing) return;
  isSyncing = true;
  setSyncDisabled(true);
  setSyncProgress(0);
  try {
    const startYear = 1993;
    const endYear = new Date().getFullYear();
    let appendedTotal = 0;
    const totalYears = endYear - startYear + 1;
    for (let year = startYear; year <= endYear; year += 1) {
      setSyncStatus(`同步中…${year}`);
      const progress = ((year - startYear) / totalYears) * 100;
      setSyncProgress(progress);
      const start = `${year}0101`;
      const end = `${year}1231`;
      const draws = await requestDraws({
        lastNDraw: null,
        startDate: start,
        endDate: end,
        drawType: "All"
      });
      const resultDraws = filterResultDraws(draws);
      if (resultDraws.length) {
        const res = await postLocalImport(resultDraws);
        appendedTotal += res.appended || 0;
      }
    }
    setSyncStatus(`同步完成，新增 ${appendedTotal} 期`);
    setSyncProgress(100);
    fetchAnalysisData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setSyncStatus(`${msg} ➜ ✨ 同步失敗，請確認本地服務已開。`);
  } finally {
    isSyncing = false;
    setSyncDisabled(false);
  }
}

async function syncLatestDraws(targetCount = AUTO_SYNC_LATEST) {
  if (isSyncing) return;
  isSyncing = true;
  setSyncDisabled(true);
  setSyncProgress(0);
  try {
    setSyncStatus(`同步最新 ${targetCount} 期…`);
    const draws = await requestDraws({
      lastNDraw: targetCount,
      startDate: null,
      endDate: null,
      drawType: "All"
    });
    const resultDraws = filterResultDraws(draws);
    const res = await postLocalImport(resultDraws);
    setSyncStatus(`同步完成，新增 ${res.appended || 0} 期`);
    setSyncProgress(100);
    fetchAnalysisData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setSyncStatus(`${msg} ➜ ✨ 同步失敗，請確認本地服務已開。`);
  } finally {
    isSyncing = false;
    setSyncDisabled(false);
  }
}

function scheduleAutoSync() {
  syncLatestDraws(AUTO_SYNC_LATEST);
  const intervalMs = AUTO_SYNC_INTERVAL_HOURS * 60 * 60 * 1000;
  setInterval(() => {
    syncLatestDraws(AUTO_SYNC_LATEST);
  }, intervalMs);
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
    state.draws = await requestDraws({ lastNDraw: n, drawType: "All" });
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

function renderBallList(container, nums) {
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
    if (state.suggested.has(num)) {
      ball.classList.add("suggested");
    } else {
      ball.classList.remove("suggested");
    }
  });
}

function renderCategoryLists() {
  const basePool = [];
  for (let i = 1; i <= 49; i += 1) {
    if (!state.excluded.has(i)) basePool.push(i);
  }

  renderBallList(els.oddList, basePool.filter((n) => n % 2 === 1));
  renderBallList(els.evenList, basePool.filter((n) => n % 2 === 0));
  renderBallList(els.smallList, basePool.filter((n) => n <= 24));
  renderBallList(els.bigList, basePool.filter((n) => n >= 25));
  renderBallList(els.redList, basePool.filter((n) => getColorClass(n) === "red"));
  renderBallList(els.blueList, basePool.filter((n) => getColorClass(n) === "blue"));
  renderBallList(els.greenList, basePool.filter((n) => getColorClass(n) === "green"));
  renderBallList(els.metalList, basePool.filter((n) => getElementTag(n) === "金"));
  renderBallList(els.woodList, basePool.filter((n) => getElementTag(n) === "木"));
  renderBallList(els.waterList, basePool.filter((n) => getElementTag(n) === "水"));
  renderBallList(els.fireList, basePool.filter((n) => getElementTag(n) === "火"));
  renderBallList(els.earthList, basePool.filter((n) => getElementTag(n) === "土"));
  renderBallList(els.row1List, basePool.filter((n) => n >= 1 && n <= 10));
  renderBallList(els.row2List, basePool.filter((n) => n >= 11 && n <= 20));
  renderBallList(els.row3List, basePool.filter((n) => n >= 21 && n <= 30));
  renderBallList(els.row4List, basePool.filter((n) => n >= 31 && n <= 40));
  renderBallList(els.row5List, basePool.filter((n) => n >= 41 && n <= 49));
}

function renderEmptyMessage(container, message) {
  if (!container) return;
  container.innerHTML = "";
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = message;
  container.appendChild(hint);
}

function renderCountChips(container, entries) {
  if (!container) return;
  container.innerHTML = "";
  entries.forEach(({ num, count }) => {
    const chip = document.createElement("div");
    chip.className = "count-chip";
    chip.innerHTML = `
      <span class="ball ${getColorClass(num)} with-element">
        <span>${pad2(num)}</span>
        <span class="element-inner">${getElementTag(num)}</span>
      </span>
      <span class="count-num">×${count}</span>
    `;
    container.appendChild(chip);
  });
}

function computeRepeatRates(draws, maxN = 5) {
  const sorted = draws
    .filter((draw) => Array.isArray(draw.numbers) && draw.numbers.length === 6)
    .filter((draw) => draw.drawDate)
    .slice()
    .sort((a, b) => {
      const dtA = new Date(normalizeDateString(a.drawDate || "")).getTime() || 0;
      const dtB = new Date(normalizeDateString(b.drawDate || "")).getTime() || 0;
      return dtA - dtB;
    });
  const rates = [];
  for (let n = 1; n <= maxN; n += 1) {
    const total = sorted.length - n;
    if (total <= 0) {
      rates.push(null);
      continue;
    }
    let hit = 0;
    let hit2 = 0;
    let hit3 = 0;
    let hit4 = 0;
    let hit5 = 0;
    let hit6 = 0;
    let hit7 = 0;
    let overlapSum = 0;
    for (let i = n; i < sorted.length; i += 1) {
      const current = new Set(sorted[i].numbers);
      if (sorted[i].special) current.add(sorted[i].special);
      const prevUnion = new Set();
      for (let j = i - n; j < i; j += 1) {
        sorted[j].numbers.forEach((num) => prevUnion.add(num));
        if (sorted[j].special) prevUnion.add(sorted[j].special);
      }
      let overlap = 0;
      current.forEach((num) => {
        if (prevUnion.has(num)) overlap += 1;
      });
      overlapSum += overlap;
      if (overlap >= 1) hit += 1;
      if (overlap >= 2) hit2 += 1;
      if (overlap >= 3) hit3 += 1;
      if (overlap >= 4) hit4 += 1;
      if (overlap >= 5) hit5 += 1;
      if (overlap >= 6) hit6 += 1;
      if (overlap >= 7) hit7 += 1;
    }
    rates.push({
      total,
      atLeast1: hit / total,
      atLeast2: hit2 / total,
      atLeast3: hit3 / total,
      atLeast4: hit4 / total,
      atLeast5: hit5 / total,
      atLeast6: hit6 / total,
      atLeast7: hit7 / total,
      avgOverlap: overlapSum / total
    });
  }
  return rates;
}

function updateRepeatInfo() {
  if (!els.repeatInfo) return;
  const cells = els.repeatInfo.querySelectorAll(".repeat-cell");
  const status = els.repeatStatus;
  if (!state.analysisDraws.length) {
    cells.forEach((cell) => {
      cell.textContent = "-";
    });
    if (status) status.textContent = "連接本地資料後先會顯示歷史比例。";
    return;
  }
  const rates = computeRepeatRates(state.analysisDraws, 5);
  if (!rates.filter((value) => value !== null).length) {
    cells.forEach((cell) => {
      cell.textContent = "-";
    });
    if (status) status.textContent = "歷史比例未有足夠資料。";
    return;
  }
  const keys = [
    "atLeast1",
    "atLeast2",
    "atLeast3",
    "atLeast4",
    "atLeast5",
    "atLeast6",
    "atLeast7",
    "avgOverlap"
  ];
  keys.forEach((key) => {
    const rowCells = els.repeatInfo.querySelectorAll(`.repeat-cell[data-repeat="${key}"]`);
    rowCells.forEach((cell, idx) => {
      const rate = rates[idx];
      if (!rate) {
        cell.textContent = "-";
        cell.classList.remove("repeat-high");
      } else {
        if (key === "avgOverlap") {
          cell.textContent = rate.avgOverlap.toFixed(2);
          cell.classList.remove("repeat-high");
        } else {
          const value = rate[key] * 100;
          cell.textContent = `${value.toFixed(1)}%`;
          cell.classList.toggle("repeat-high", value >= 80);
        }
      }
    });
  });
  if (status) status.textContent = "已載入本地歷史數據";
}

function getRecentAnalysisDraws(count) {
  if (!state.analysisDraws.length) return [];
  return [...state.analysisDraws]
    .filter((draw) => Array.isArray(draw.numbers) && draw.numbers.length === 6)
    .sort((a, b) => {
      const dtA = new Date(normalizeDateString(a.drawDate || "")).getTime() || 0;
      const dtB = new Date(normalizeDateString(b.drawDate || "")).getTime() || 0;
      return dtB - dtA;
    })
    .slice(0, count);
}

function computeHotCounts(draws, windowSize) {
  const sorted = [...draws].sort((a, b) => {
    const dtA = new Date(normalizeDateString(a.drawDate || "")).getTime() || 0;
    const dtB = new Date(normalizeDateString(b.drawDate || "")).getTime() || 0;
    return dtB - dtA;
  });
  const slice = sorted.slice(0, windowSize);
  const counts = new Map();
  slice.forEach((draw) => {
    (draw.numbers || []).forEach((num) => {
      counts.set(num, (counts.get(num) || 0) + 1);
    });
  });
  return counts;
}

function pickDanNumbers() {
  if (!els.danList || !els.danStatus) return;
  if (els.danReason) els.danReason.textContent = "";
  const recent = getRecentAnalysisDraws(2);
  if (recent.length < 2) {
    els.danStatus.textContent = "最近 2 期資料不足。";
    els.danList.innerHTML = "";
    state.suggested = new Set();
    if (els.danReason) els.danReason.textContent = "";
    renderNumberBoard();
    return;
  }

  const pool = new Set();
  recent.forEach((draw) => {
    draw.numbers.forEach((num) => pool.add(num));
  });
  const candidates = [...pool];
  if (candidates.length < 2) {
    els.danStatus.textContent = "候選號碼不足。";
    els.danList.innerHTML = "";
    state.suggested = new Set();
    if (els.danReason) els.danReason.textContent = "";
    renderNumberBoard();
    return;
  }

  const hotCounts = computeHotCounts(state.analysisDraws, parseNumber(els.analysisN?.value) || 20);
  const scored = candidates.map((num) => ({ num, count: hotCounts.get(num) || 0 }));
  scored.sort((a, b) => b.count - a.count || a.num - b.num);
  const hot = scored.slice(0, 3).map((item) => item.num);
  const cold = scored.slice(-3).map((item) => item.num);

  const isConsecutive = (a, b) => Math.abs(a - b) === 1;
  const sameColor = (a, b) => getColorClass(a) === getColorClass(b);
  const sameSize = (a, b) => (a <= 24) === (b <= 24);

  const tryPairs = (listA, listB, rules, reason) => {
    for (const a of listA) {
      for (const b of listB) {
        if (a === b) continue;
        if (rules.noConsecutive && isConsecutive(a, b)) continue;
        if (rules.diffColor && sameColor(a, b)) continue;
        if (rules.diffSize && sameSize(a, b)) continue;
        return { pair: [a, b].sort((x, y) => x - y), reason };
      }
    }
    return null;
  };

  const rulesets = [
    { noConsecutive: true, diffColor: true, diffSize: true },
    { noConsecutive: true, diffColor: true, diffSize: false },
    { noConsecutive: true, diffColor: false, diffSize: true },
    { noConsecutive: false, diffColor: true, diffSize: true },
    { noConsecutive: false, diffColor: false, diffSize: true },
    { noConsecutive: false, diffColor: true, diffSize: false },
    { noConsecutive: false, diffColor: false, diffSize: false }
  ];

  let chosen = null;
  let reason = "";
  for (const rules of rulesets) {
    const picked = tryPairs(hot, cold, rules, "熱 + 冷（過去 N 期）");
    if (picked) {
      chosen = picked.pair;
      reason = picked.reason;
      break;
    }
  }

  if (!chosen) {
    const allNums = scored.map((item) => item.num);
    for (const rules of rulesets) {
      const picked = tryPairs(allNums, allNums, rules, "過去 2 期隨機配對");
      if (picked) {
        chosen = picked.pair;
        reason = picked.reason;
        break;
      }
    }
  }

  if (!chosen) {
    chosen = candidates.slice(0, 2).sort((a, b) => a - b);
    reason = "過去 2 期號碼（預設取前 2 個）";
  }

  state.suggested = new Set(chosen);
  renderBallList(els.danList, chosen);
  els.danStatus.textContent = "已根據過去 2 期建議 2 個膽。";
  if (els.danReason) {
    const detail = chosen
      .map((num) => {
        const tag = `${getColorClass(num)}｜${num <= 24 ? "細" : "大"}`;
        return `${pad2(num)}（${tag}）`;
      })
      .join("、");
    const consecutive = Math.abs(chosen[0] - chosen[1]) === 1 ? "有連號" : "無連號";
    els.danReason.textContent = `原因：${reason}，${detail}，${consecutive}`;
  }
  renderNumberBoard();
}

function computeColdHotSets() {
  if (!state.analysisDraws.length) return null;
  const n = parseNumber(els.analysisN?.value) || 20;
  const sorted = [...state.analysisDraws].sort((a, b) => {
    const dtA = new Date(normalizeDateString(a.drawDate || "")).getTime() || 0;
    const dtB = new Date(normalizeDateString(b.drawDate || "")).getTime() || 0;
    return dtB - dtA;
  });
  const slice = sorted.slice(0, n);
  if (!slice.length) return null;
  const counts = Array.from({ length: 50 }, () => 0);
  slice.forEach((draw) => {
    (draw.numbers || []).forEach((num) => {
      if (num >= 1 && num <= 49) counts[num] += 1;
    });
  });
  const cold = new Set();
  const ranked = [];
  for (let i = 1; i <= 49; i += 1) {
    if (counts[i] === 0) cold.add(i);
    ranked.push({ num: i, count: counts[i] });
  }
  ranked.sort((a, b) => b.count - a.count || a.num - b.num);
  const nonZero = ranked.filter((item) => item.count > 0);
  if (!nonZero.length) return { cold, hot: new Set() };
  const cutoff = nonZero.length >= 10 ? nonZero[9].count : nonZero[nonZero.length - 1].count;
  const hot = new Set(nonZero.filter((item) => item.count >= cutoff).map((item) => item.num));
  return { cold, hot };
}

function summarizeNumbers(nums) {
  const summary = {
    sum: nums.reduce((acc, n) => acc + n, 0),
    odd: 0,
    even: 0,
    small: 0,
    big: 0,
    red: 0,
    blue: 0,
    green: 0,
    metal: 0,
    wood: 0,
    water: 0,
    fire: 0,
    earth: 0
  };
  nums.forEach((n) => {
    if (n % 2 === 1) summary.odd += 1;
    else summary.even += 1;
    if (n <= 24) summary.small += 1;
    else summary.big += 1;
    const color = getColorClass(n);
    if (color === "red") summary.red += 1;
    else if (color === "blue") summary.blue += 1;
    else summary.green += 1;
    const element = getElementTag(n);
    if (element === "金") summary.metal += 1;
    else if (element === "木") summary.wood += 1;
    else if (element === "水") summary.water += 1;
    else if (element === "火") summary.fire += 1;
    else summary.earth += 1;
  });
  return summary;
}

function formatSummaryLine(nums) {
  const { sum, odd, even, small, big, red, blue, green, metal, wood, water, fire, earth } =
    summarizeNumbers(nums);
  const avg = formatAverage(sum, nums.length);
  const parts = [
    `單${odd} 雙${even}`,
    `細${small} 大${big}`,
    `紅${red} 藍${blue} 綠${green}`,
    `金${metal} 木${wood} 水${water} 火${fire} 土${earth}`
  ];
  const coldHot = computeColdHotSets();
  if (coldHot) {
    const coldCount = nums.filter((n) => coldHot.cold.has(n)).length;
    const hotCount = nums.filter((n) => coldHot.hot.has(n)).length;
    parts.push(`冷${coldCount} 熱${hotCount}`);
  } else {
    parts.push("冷- 熱-");
  }
  return {
    sumText: `總和 ${sum}，平均數 ${avg}`,
    detailText: parts.join("／")
  };
}

function updateAnalysisView() {
  if (!els.analysisCold || !els.analysisHot || !els.analysisCounts) return;
  if (!state.analysisDraws.length) {
    renderEmptyMessage(els.analysisCold, "未有資料");
    renderEmptyMessage(els.analysisHot, "未有資料");
    renderEmptyMessage(els.analysisCounts, "未有資料");
    return;
  }

  const n = parseNumber(els.analysisN?.value) || 20;
  const sorted = [...state.analysisDraws].sort((a, b) => {
    const dtA = new Date(normalizeDateString(a.drawDate || "")).getTime() || 0;
    const dtB = new Date(normalizeDateString(b.drawDate || "")).getTime() || 0;
    return dtB - dtA;
  });
  const slice = sorted.slice(0, n);
  const counts = Array.from({ length: 50 }, () => 0);
  slice.forEach((draw) => {
    (draw.numbers || []).forEach((num) => {
      if (num >= 1 && num <= 49) counts[num] += 1;
    });
  });

  const cold = [];
  const ranked = [];
  for (let i = 1; i <= 49; i += 1) {
    if (counts[i] === 0) cold.push(i);
    ranked.push({ num: i, count: counts[i] });
  }

  ranked.sort((a, b) => b.count - a.count || a.num - b.num);
  const nonZeroRanked = ranked.filter((item) => item.count > 0);
  const cutoff = nonZeroRanked.length >= 10 ? nonZeroRanked[9].count : 1;
  const hot = nonZeroRanked.filter((item) => item.count >= cutoff).map((item) => item.num);
  const topCounts = nonZeroRanked.slice(0, 15);

  if (cold.length) {
    renderBallList(els.analysisCold, cold);
  } else {
    renderEmptyMessage(els.analysisCold, "最近已全部出現過");
  }

  if (hot.length) {
    renderBallList(els.analysisHot, hot);
  } else {
    renderEmptyMessage(els.analysisHot, "未有熱門");
  }

  if (topCounts.length) {
    renderCountChips(els.analysisCounts, topCounts);
  } else {
    renderEmptyMessage(els.analysisCounts, "未有次數");
  }

  if (els.analysisStatus) {
    els.analysisStatus.textContent = `已載入 ${state.analysisDraws.length} 期｜最近 ${slice.length} 期`;
  }
}

async function fetchAnalysisData() {
  if (!els.analysisStatus) return;
  els.analysisStatus.textContent = "連接中…";
  try {
    let data = null;
    try {
      const response = await fetch(LOCAL_API, { cache: "no-store" });
      if (response.ok) {
        data = await response.json();
      }
    } catch (err) {
      data = null;
    }
    if (!data) {
      const response = await fetch(STATIC_API, { cache: "no-store" });
      if (!response.ok) throw new Error("fetch_failed");
      data = await response.json();
    }
    state.analysisDraws = Array.isArray(data.draws) ? data.draws : [];
    updateAnalysisView();
    updateRepeatInfo();
    if (els.danStatus) {
      els.danStatus.textContent = "可點選自動揀膽。";
    }
  } catch (err) {
    state.analysisDraws = [];
    if (els.analysisStatus) {
      els.analysisStatus.textContent = "未連接本地資料";
    }
    updateAnalysisView();
    updateRepeatInfo();
    if (els.danStatus) {
      els.danStatus.textContent = "連接本地資料後先會有建議。";
    }
  }
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

function getSelectedRows(container) {
  if (!container) return [];
  return [...container.querySelectorAll("input[type=checkbox]:checked")]
    .map((input) => parseNumber(input.dataset.row))
    .filter((value) => value !== null);
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
  const rowLimit = getSelectedRows(els.rowLimit);
  const rowLimitSet = rowLimit.length ? new Set(rowLimit) : null;

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
    noAllOdd: false,
    noAllEven: false,
    rowLimit,
    rowLimitSet,
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
  const rowLimitSet = filters.rowLimitSet;
  for (let i = 1; i <= 49; i += 1) {
    if (state.excluded.has(i)) continue;
    if (rowLimitSet && !rowLimitSet.has(getRowIndex(i))) continue;
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

function getPoolStats(pool) {
  const stats = {
    odd: 0,
    even: 0,
    small: 0,
    big: 0,
    red: 0,
    blue: 0,
    green: 0,
    metal: 0,
    wood: 0,
    water: 0,
    fire: 0,
    earth: 0
  };
  pool.forEach((num) => {
    if (num % 2 === 1) stats.odd += 1;
    else stats.even += 1;
    if (num <= 24) stats.small += 1;
    else stats.big += 1;
    const color = getColorClass(num);
    if (color === "red") stats.red += 1;
    else if (color === "blue") stats.blue += 1;
    else stats.green += 1;
    const element = getElementTag(num);
    if (element === "金") stats.metal += 1;
    else if (element === "木") stats.wood += 1;
    else if (element === "水") stats.water += 1;
    else if (element === "火") stats.fire += 1;
    else stats.earth += 1;
  });
  return stats;
}

function checkFeasibility(filters, pool) {
  if (pool.length < 6) {
    return { ok: false, message: "可用號碼唔夠 6 個。" };
  }
  const stats = getPoolStats(pool);
  if (filters.oddCount !== null && filters.oddCount > stats.odd) {
    return { ok: false, message: "單數號碼唔夠用。" };
  }
  if (filters.evenCount !== null && filters.evenCount > stats.even) {
    return { ok: false, message: "雙數號碼唔夠用。" };
  }
  if (filters.smallCount !== null && filters.smallCount > stats.small) {
    return { ok: false, message: "細號碼唔夠用。" };
  }
  if (filters.bigCount !== null && filters.bigCount > stats.big) {
    return { ok: false, message: "大號碼唔夠用。" };
  }
  if (filters.colorCounts.red !== null && filters.colorCounts.red > stats.red) {
    return { ok: false, message: "紅色號碼唔夠用。" };
  }
  if (filters.colorCounts.blue !== null && filters.colorCounts.blue > stats.blue) {
    return { ok: false, message: "藍色號碼唔夠用。" };
  }
  if (filters.colorCounts.green !== null && filters.colorCounts.green > stats.green) {
    return { ok: false, message: "綠色號碼唔夠用。" };
  }
  if (filters.elementCounts.metal !== null && filters.elementCounts.metal > stats.metal) {
    return { ok: false, message: "金屬號碼唔夠用。" };
  }
  if (filters.elementCounts.wood !== null && filters.elementCounts.wood > stats.wood) {
    return { ok: false, message: "木屬號碼唔夠用。" };
  }
  if (filters.elementCounts.water !== null && filters.elementCounts.water > stats.water) {
    return { ok: false, message: "水屬號碼唔夠用。" };
  }
  if (filters.elementCounts.fire !== null && filters.elementCounts.fire > stats.fire) {
    return { ok: false, message: "火屬號碼唔夠用。" };
  }
  if (filters.elementCounts.earth !== null && filters.elementCounts.earth > stats.earth) {
    return { ok: false, message: "土屬號碼唔夠用。" };
  }
  return { ok: true };
}

function buildFilterKey(filters, pool) {
  const parts = [
    pool.join(","),
    filters.sumMin ?? "",
    filters.sumMax ?? "",
    filters.oddCount ?? "",
    filters.evenCount ?? "",
    filters.smallCount ?? "",
    filters.bigCount ?? "",
    filters.maxConsecutive ?? "",
    filters.maxTail ?? "",
    (filters.rowLimit || []).join(","),
    filters.colorCounts.red ?? "",
    filters.colorCounts.blue ?? "",
    filters.colorCounts.green ?? "",
    filters.elementCounts.metal ?? "",
    filters.elementCounts.wood ?? "",
    filters.elementCounts.water ?? "",
    filters.elementCounts.fire ?? "",
    filters.elementCounts.earth ?? ""
  ];
  return parts.join("|");
}

async function countCombinations(pool, filters, token) {
  const n = pool.length;
  if (n < 6) return 0;
  const feasibility = checkFeasibility(filters, pool);
  if (!feasibility.ok) return 0;

  const prefix = new Array(n + 1).fill(0);
  const suffixOdd = new Array(n + 1).fill(0);
  const suffixEven = new Array(n + 1).fill(0);
  const suffixBig = new Array(n + 1).fill(0);
  const suffixSmall = new Array(n + 1).fill(0);
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
    redCount,
    blueCount,
    greenCount,
    metalCount,
    woodCount,
    waterCount,
    fireCount,
    earthCount
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
      if (filters.maxTail !== null && Math.max(...tails) > filters.maxTail) return 0;
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
        nextRed,
        nextBlue,
        nextGreen,
        nextMetal,
        nextWood,
        nextWater,
        nextFire,
        nextEarth
      );
    }
    return total;
  }

  return dfs(0, 0, 0, 0, 0, 0, new Array(10).fill(0), null, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}

function isValid(nums, filters) {
  const sum = nums.reduce((acc, n) => acc + n, 0);
  if (filters.sumMin !== null && sum < filters.sumMin) return false;
  if (filters.sumMax !== null && sum > filters.sumMax) return false;

  const oddCount = nums.filter((n) => n % 2 === 1).length;
  if (filters.oddCount !== null && oddCount !== filters.oddCount) return false;
  if (filters.evenCount !== null && (6 - oddCount) !== filters.evenCount) return false;

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
  if (filters.rowLimitSet) {
    for (const num of nums) {
      if (!filters.rowLimitSet.has(getRowIndex(num))) return false;
    }
  }
  return true;
}

function generateSets(poolOverride, filtersOverride) {
  buildExcluded();
  const filters = filtersOverride || readFilters();
  const pool = poolOverride || getFilteredPool(filters);
  const feasibility = checkFeasibility(filters, pool);
  if (!feasibility.ok) {
    setGenerateStatus(`${feasibility.message}請減少排除條件。`);
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
    const { sumText, detailText } = formatSummaryLine(nums);
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
      <div class="result-stats">${sumText}</div>
      <div class="result-detail">${detailText}</div>
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

if (els.analysisN) {
  els.analysisN.addEventListener("change", updateAnalysisView);
}

if (els.syncAll) {
  els.syncAll.addEventListener("click", syncAllDraws);
}

if (els.syncLatest) {
  els.syncLatest.addEventListener("click", syncLatestDraws);
}

if (els.pickDan) {
  els.pickDan.addEventListener("click", pickDanNumbers);
}

let syncingSize = false;

function updateOddEvenNotes() {
  if (!els.oddNote || !els.evenNote) return;
  const oddVal = getSelectedCount(els.oddCount);
  const evenVal = getSelectedCount(els.evenCount);
  let oddText = "";
  let evenText = "";

  if (oddVal === 6) oddText = "全單數";
  else if (oddVal === 0) oddText = "全雙數";

  if (evenVal === 6) evenText = "全雙數";
  else if (evenVal === 0) evenText = "全單數";

  els.oddNote.textContent = oddText ? `(${oddText})` : "";
  els.evenNote.textContent = evenText ? `(${evenText})` : "";
}

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
  } else if (source === "odd" && oddVal !== null) {
    const other = 6 - oddVal;
    setSelectedCount(els.evenCount, other);
    maxEven = other;
    maxOdd = oddVal;
  } else if (source === "even" && evenVal !== null) {
    const other = 6 - evenVal;
    setSelectedCount(els.oddCount, other);
    maxOdd = other;
    maxEven = evenVal;
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
  updateOddEvenNotes();
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

if (els.rowLimit) {
  els.rowLimit.addEventListener("change", autoUpdate);
}

function handleExcludeChange() {
  buildExcluded();
  autoUpdate();
}

let autoTimer = null;
let countTimer = null;

function scheduleComboCount(filters, pool, key) {
  clearTimeout(countTimer);
  countTimer = setTimeout(async () => {
    const token = state.countToken + 1;
    state.countToken = token;
    const activeFilters = filters || readFilters();
    const activePool = pool || getFilteredPool(activeFilters);
    const comboKey = key || buildFilterKey(activeFilters, activePool);
    if (comboKey === state.lastComboKey && state.lastComboCount !== null) {
      setComboCount(`可組合：${state.lastComboCount.toLocaleString("en-US")}`);
      return;
    }
    setComboCount("可組合：計算中…");
    const count = await countCombinations(activePool, activeFilters, token);
    if (state.countToken !== token) return;
    state.lastComboKey = comboKey;
    state.lastComboCount = count;
    setComboCount(`可組合：${count.toLocaleString("en-US")}`);
  }, 200);
}

function autoUpdate() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    setGenerateStatus("計算中…");
    updateSumRangeUI();
    updateAvailableCount();
    const filters = readFilters();
    const pool = getFilteredPool(filters);
    const key = buildFilterKey(filters, pool);
    const excludedKey = [...state.excluded].sort((a, b) => a - b).join(",");
    if (excludedKey !== state.lastExcludedKey) {
      renderCategoryLists();
      state.lastExcludedKey = excludedKey;
    }
    if (key !== state.lastGeneratedKey) {
      const sets = generateSets(pool, filters);
      if (sets.length) {
        renderResults(sets);
        setGenerateStatus("");
      }
      state.lastGeneratedKey = key;
    } else {
      setGenerateStatus("");
    }
    scheduleComboCount(filters, pool, key);
  }, 250);
}

els.generateBtn.addEventListener("click", autoUpdate);

[
  els.sumMin,
  els.sumMax,
  els.maxConsecutive,
  els.maxTail,
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
fetchAnalysisData();
scheduleAutoSync();
