(function (root) {
  "use strict";

  function createWorkspace(doc, win) {
    const names = { choose: "揀號碼", filters: "設條件", results: "睇結果", history: "歷史分析" };
    const ids = Object.keys(names);
    const tabs = ids.map((id) => doc.getElementById(`${id}Tab`));
    const panels = ids.map((id) => doc.getElementById(`${id}View`));
    if (tabs.some((tab) => !tab) || panels.some((panel) => !panel)) return null;
    const mobile = doc.getElementById("mobileActions");
    const back = doc.getElementById("returnToWorkflow");
    const cleanup = [];
    let current = "choose";
    let lastWorkflow = "choose";
    let lastConflict = "";
    let lastNumberFocus = null;

    const listen = (target, event, handler) => {
      if (!target) return;
      target.addEventListener(event, handler);
      cleanup.push(() => target.removeEventListener(event, handler));
    };
    function measureMobileBar() {
      const height = mobile && !mobile.hidden ? Math.ceil(mobile.getBoundingClientRect().height) : 0;
      doc.documentElement.style.setProperty("--mobile-action-height", `${height}px`);
    }
    function activateView(id, focusPanel = false) {
      if (!ids.includes(id)) return false;
      current = id;
      if (id !== "history") lastWorkflow = id;
      ids.forEach((name, index) => {
        const selected = name === id;
        tabs[index].setAttribute("aria-selected", String(selected));
        tabs[index].tabIndex = selected ? 0 : -1;
        panels[index].hidden = !selected;
      });
      if (mobile) mobile.hidden = id === "history";
      if (back) back.textContent = `返回${names[lastWorkflow]}`;
      if (focusPanel) {
        const panel = panels[ids.indexOf(id)];
        panel.focus({ preventScroll: true });
        panel.scrollIntoView({ block: "start", behavior: "auto" });
      }
      measureMobileBar();
      return true;
    }
    tabs.forEach((tab, index) => {
      listen(tab, "click", () => activateView(ids[index]));
      listen(tab, "keydown", (event) => {
        const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        let next = offset ? (index + offset + ids.length) % ids.length : index;
        if (event.key === "Home") next = 0;
        else if (event.key === "End") next = ids.length - 1;
        else if (!offset) return;
        event.preventDefault();
        activateView(ids[next]);
        tabs[next].focus();
      });
    });
    doc.querySelectorAll("[data-view-target]").forEach((button) => {
      listen(button, "click", () => activateView(button.dataset.viewTarget, true));
    });
    listen(back, "click", () => activateView(lastWorkflow, true));
    listen(doc.getElementById("mobileGenerate"), "click", () => {
      doc.getElementById("generateBtn").click();
      activateView("results", true);
    });

    function decorateNumbers() {
      const picking = doc.querySelector('input[name="historyMode"]:checked')?.value === "include";
      for (const [area, action] of [["numberBoard", "拖碼"], ["excludedSummary", "膽號"]]) {
        const container = doc.getElementById(area);
        if (!container) continue;
        container.querySelectorAll(".ball[data-number]").forEach((ball) => {
          const selected = ball.classList.contains(action === "拖碼" ? "dragged" : "included");
          const disabled = area === "numberBoard" && ball.classList.contains("included");
          ball.setAttribute("aria-label", `號碼 ${ball.dataset.number}；${selected ? "已選" : picking ? "選取" : "查看"}${action}`);
          ball.tabIndex = picking && !disabled ? 0 : -1;
          if (picking) {
            ball.setAttribute("role", "button");
            ball.setAttribute("aria-pressed", String(selected));
            ball.setAttribute("aria-disabled", String(disabled));
          } else {
            ball.removeAttribute("role");
            ball.removeAttribute("aria-pressed");
            ball.removeAttribute("aria-disabled");
          }
        });
      }
      // app.js rebuilds historical cards on recalculation; retain keyboard focus
      // only when the focused number was removed, never over another control.
      if (current === "choose" && lastNumberFocus && !lastNumberFocus.node.isConnected && doc.activeElement === doc.body) {
        const replacement = doc.getElementById(lastNumberFocus.area)?.querySelector(`[data-number="${lastNumberFocus.number}"]`);
        lastNumberFocus = null;
        if (replacement && replacement.tabIndex === 0) replacement.focus({ preventScroll: true });
      }
    }
    listen(doc, "focusin", (event) => {
      const target = event.target;
      const container = target.closest?.("#numberBoard, #excludedSummary");
      lastNumberFocus = container && target.dataset.number
        ? { node: target, area: container.id, number: target.dataset.number } : null;
    });
    listen(doc, "keydown", (event) => {
      const target = event.target;
      if ((event.key === "Enter" || event.key === " ") && target.dataset?.number
          && target.getAttribute("role") === "button" && target.getAttribute("aria-disabled") !== "true"
          && target.closest?.("#numberBoard, #excludedSummary")) {
        event.preventDefault();
        target.click();
      }
    });

    function syncCount() {
      const text = doc.getElementById("comboCount")?.textContent || "可組合：未計算";
      for (const id of ["workflowCount", "mobileComboCount"]) {
        const target = doc.getElementById(id);
        if (target) target.textContent = text;
      }
    }
    function syncData() {
      const text = doc.getElementById("analysisMeta")?.textContent || "資料載入中…";
      const cutoff = text.match(/截至 \d{4}-\d{2}-\d{2}/);
      const source = text.match(/資料：([^｜；]+)/);
      const summary = doc.getElementById("dataSummary");
      if (!summary) return;
      summary.textContent = cutoff
        ? `${source ? source[1] + "｜" : ""}${cutoff[0]}${text.includes("取數時間未記錄") ? "｜取數時間未記錄" : ""}${text.includes("請核對") ? "｜請核對更新" : ""}`
        : text;
    }
    function syncFeedback() {
      const constraint = doc.getElementById("constraintStatus")?.textContent.trim() || "";
      const message = doc.getElementById("generateStatus")?.textContent.trim() || "";
      const conflict = constraint && !constraint.startsWith("單項及基本交互檢查通過");
      const summary = doc.querySelector(".active-summary");
      if (summary) {
        summary.classList.toggle("has-conflict", Boolean(conflict));
        if (conflict && constraint !== lastConflict) summary.open = true;
      }
      lastConflict = conflict ? constraint : "";
      const feedback = doc.getElementById("workflowFeedback");
      if (feedback) feedback.textContent = conflict ? constraint : message;
    }
    function syncAdvanced() {
      const advanced = doc.getElementById("advancedFilters");
      const summary = doc.getElementById("advancedSummary");
      if (!advanced || !summary) return;
      const selected = advanced.querySelectorAll("input:checked").length
        + [...advanced.querySelectorAll("select")].filter((select) => select.value !== "").length;
      summary.textContent = `進階條件：顏色、連號、同尾、區間及五行${selected ? `（已選 ${selected} 項）` : "（未選）"}`;
    }
    const sync = () => { syncCount(); syncData(); syncFeedback(); syncAdvanced(); decorateNumbers(); };
    listen(doc, "change", () => { syncAdvanced(); decorateNumbers(); });
    listen(doc, "input", syncAdvanced);
    listen(win, "resize", measureMobileBar);
    const observer = typeof win.MutationObserver === "function" ? new win.MutationObserver(sync) : null;
    for (const id of ["comboCount", "analysisMeta", "constraintStatus", "generateStatus"]) {
      const source = doc.getElementById(id);
      if (source) observer?.observe(source, { childList: true, subtree: true, characterData: true });
    }
    for (const id of ["numberBoard", "excludedSummary"]) {
      const source = doc.getElementById(id);
      if (source) observer?.observe(source, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }
    const resizer = typeof win.ResizeObserver === "function" ? new win.ResizeObserver(measureMobileBar) : null;
    if (mobile) resizer?.observe(mobile);
    activateView("choose");
    sync();
    return {
      activateView, sync, measureMobileBar,
      get currentView() { return current; },
      destroy() { cleanup.forEach((remove) => remove()); observer?.disconnect(); resizer?.disconnect(); }
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { createWorkspace };
  else {
    const start = () => { root.markSixWorkspace = createWorkspace(root.document, root); };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof window !== "undefined" ? window : globalThis);
