"use strict";

let transactions = [];
let spendingLimit = 0;
let customCategories = [];
let selectedCategory = "";

let chart = null;const BASE_CAT_COLORS = {
  Food:      "#e67e22",
  Transport: "#2980b9",
  Fun:       "#8e44ad",
};
const EXTRA_COLORS = [
  "#27ae60", "#e91e63", "#009688", "#ff5722",
  "#607d8b", "#795548", "#f44336", "#3f51b5"
];

function getCatColor(cat) {
  if (BASE_CAT_COLORS[cat]) return BASE_CAT_COLORS[cat];
  const idx = customCategories.indexOf(cat);
  return EXTRA_COLORS[idx % EXTRA_COLORS.length] || "#888";
}

function getCatClass(cat) {
  const map = { Food: "food", Transport: "transport", Fun: "fun" };
  return map[cat] || "other";
}

function save() {
  localStorage.setItem("spendly_txns", JSON.stringify(transactions));
  localStorage.setItem("spendly_limit", spendingLimit);
  localStorage.setItem("spendly_custom_cats", JSON.stringify(customCategories));
  localStorage.setItem("spendly_theme", document.documentElement.getAttribute("data-theme") || "light");
}
function load() {
  try {
    const txns = localStorage.getItem("spendly_txns");
    if (txns) transactions = JSON.parse(txns);
    const lim = localStorage.getItem("spendly_limit");
    if (lim) spendingLimit = parseFloat(lim) || 0;
    const cats = localStorage.getItem("spendly_custom_cats");
    if (cats) customCategories = JSON.parse(cats);
    const theme = localStorage.getItem("spendly_theme");
    if (theme) applyTheme(theme);
  } catch (e) {
    console.warn("Could not load saved data:", e);
  }
}

function formatRp(n) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function getTotal() {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

function updateBalance() {
  const total = getTotal();
  document.getElementById("totalBalance").textContent = formatRp(total);
  const sub = document.getElementById("balanceSub");
  const count = transactions.length;
  sub.textContent = count === 0
    ? "No transactions yet"
    : `${count} transaction${count > 1 ? "s" : ""}`;

  updateLimitBar(total);
}

function updateLimitBar(total) {
  const barWrap = document.getElementById("limitBarWrap");
  const warning = document.getElementById("limitWarning");
  if (!spendingLimit || spendingLimit <= 0) {
    barWrap.style.display = "none";
    warning.style.display = "none";
    return;
  }
  barWrap.style.display = "flex";
  const pct = Math.min((total / spendingLimit) * 100, 100);
  const fill = document.getElementById("limitBarFill");
  const pctEl = document.getElementById("limitPct");
  fill.style.width = pct + "%";
  fill.classList.remove("warn", "over");
  if (total > spendingLimit) {
    fill.classList.add("over");
    warning.style.display = "block";
  } else if (pct >= 80) {
    fill.classList.add("warn");
    warning.style.display = "none";
  } else {
    warning.style.display = "none";
  }
  pctEl.textContent = Math.round((total / spendingLimit) * 100) + "%";
}

function buildChartData() {
  const catTotals = {};
  for (const t of transactions) {
    catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
  }
  const labels = Object.keys(catTotals);
  const data = Object.values(catTotals);
  const colors = labels.map(getCatColor);
  return { labels, data, colors };
}

function updateChart() {
  const ctx = document.getElementById("expenseChart").getContext("2d");
  const empty = document.getElementById("chartEmpty");
  const { labels, data, colors } = buildChartData();

  if (transactions.length === 0) {
    empty.style.display = "flex";
    if (chart) { chart.destroy(); chart = null; }
    return;
  }
  empty.style.display = "none";

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[0].backgroundColor = colors;
    chart.update();
    return;
  }

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: isDark ? "#1e1810" : "#ffffff",
        borderWidth: 3,
        hoverOffset: 10,
      }]
    },
    options: {
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: isDark ? "#b09a7a" : "#7a6a52",
            font: { family: "'Sora', sans-serif", size: 12 },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10,
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${formatRp(ctx.parsed)} (${Math.round(ctx.parsed / getTotal() * 100)}%)`
          }
        }
      },
      responsive: true,
      maintainAspectRatio: true,
    }
  });
}

function refreshChartTheme() {
  if (!chart) return;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  chart.options.plugins.legend.labels.color = isDark ? "#b09a7a" : "#7a6a52";
  chart.data.datasets[0].borderColor = isDark ? "#1e1810" : "#ffffff";
  chart.update();
}

function getSortedTransactions() {
  const sort = document.getElementById("sortSelect").value;
  const arr = [...transactions];
  switch (sort) {
    case "oldest": return arr.sort((a, b) => a.ts - b.ts);
    case "amount-high": return arr.sort((a, b) => b.amount - a.amount);
    case "amount-low": return arr.sort((a, b) => a.amount - b.amount);
    case "category": return arr.sort((a, b) => a.category.localeCompare(b.category));
    default: return arr.sort((a, b) => b.ts - a.ts);
  }
}

function renderList() {
  const list = document.getElementById("transactionList");
  const empty = document.getElementById("emptyState");
  const sorted = getSortedTransactions();

  const existing = list.querySelectorAll(".txn-item");
  existing.forEach(el => el.remove());

  if (transactions.length === 0) {
    empty.style.display = "flex";
    return;
  }
  empty.style.display = "none";

  const isOver = spendingLimit > 0 && getTotal() > spendingLimit;

  for (const t of sorted) {
    const item = document.createElement("div");
    item.className = "txn-item" + (isOver ? " over-limit" : "");
    item.dataset.id = t.id;

    const catClass = getCatClass(t.category);

    item.innerHTML = `
      <span class="txn-dot ${catClass}"></span>
      <div class="txn-info">
        <div class="txn-name">${escapeHtml(t.name)}${isOver ? '<span class="over-limit-badge">⚠ Over limit</span>' : ''}</div>
        <div class="txn-meta">
          <span class="txn-badge ${catClass}">${escapeHtml(t.category)}</span>
          &nbsp;·&nbsp; ${formatDate(t.ts)}
        </div>
      </div>
      <span class="txn-amount">${formatRp(t.amount)}</span>
      <button class="txn-delete" data-id="${t.id}" aria-label="Delete">✕</button>
    `;
    list.appendChild(item);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function deleteTransaction(id) {
  const item = document.querySelector(`.txn-item[data-id="${id}"]`);
  if (item) {
    item.style.transition = "all 0.2s";
    item.style.opacity = "0";
    item.style.transform = "scale(0.95) translateX(10px)";
    setTimeout(() => {
      transactions = transactions.filter(t => t.id !== id);
      save();
      renderAll();
    }, 200);
  }
}

function renderAll() {
  updateBalance();
  updateChart();
  renderList();
}

function renderPills() {
  const container = document.getElementById("categoryPills");
  const existing = container.querySelectorAll(".pill");
  existing.forEach(p => {
    if (!["Food", "Transport", "Fun"].includes(p.dataset.value)) p.remove();
  });
  for (const cat of customCategories) {
    if (!container.querySelector(`[data-value="${CSS.escape(cat)}"]`)) {
      const pill = document.createElement("button");
      pill.className = "pill";
      pill.dataset.value = cat;
      pill.textContent = "🏷 " + cat;
      container.appendChild(pill);
    }
  }
}

function selectPill(value) {
  selectedCategory = value;
  document.getElementById("selectedCategory").value = value;
  document.querySelectorAll(".pill").forEach(p => {
    p.classList.toggle("active", p.dataset.value === value);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("themeToggle").querySelector(".theme-icon").textContent =
    theme === "dark" ? "🌙" : "☀️";
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  const next = cur === "light" ? "dark" : "light";
  applyTheme(next);
  refreshChartTheme();
  save();
}

function validateForm() {
  let valid = true;
  const name = document.getElementById("itemName").value.trim();
  const amount = document.getElementById("itemAmount").value.trim();
  const cat = document.getElementById("selectedCategory").value;

  clearErrors();

  if (!name) {
    showError("itemName", "nameError");
    valid = false;
  }
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    showError("itemAmount", "amountError");
    valid = false;
  }
  if (!cat) {
    document.getElementById("categoryError").classList.add("show");
    valid = false;
  }
  return valid;
}

function showError(inputId, errorId) {
  document.getElementById(inputId).classList.add("invalid");
  document.getElementById(errorId).classList.add("show");
}

function clearErrors() {
  ["itemName", "itemAmount"].forEach(id => {
    document.getElementById(id).classList.remove("invalid");
  });
  ["nameError", "amountError", "categoryError"].forEach(id => {
    document.getElementById(id).classList.remove("show");
  });
}

function addTransaction() {
  if (!validateForm()) return;

  const name = document.getElementById("itemName").value.trim();
  const amount = parseFloat(document.getElementById("itemAmount").value);
  const category = document.getElementById("selectedCategory").value;

  const txn = {
    id: Date.now().toString(),
    name,
    amount,
    category,
    ts: Date.now(),
  };

  transactions.unshift(txn);
  save();
  renderAll();

  // Reset form
  document.getElementById("itemName").value = "";
  document.getElementById("itemAmount").value = "";
  selectPill("");
  clearErrors();

  const newItem = document.querySelector(".txn-item");
  if (newItem) {
    newItem.style.outline = "2px solid var(--accent)";
    setTimeout(() => { newItem.style.outline = ""; }, 600);
  }
}

function setLimit() {
  const val = parseFloat(document.getElementById("spendingLimit").value);
  if (!isNaN(val) && val >= 0) {
    spendingLimit = val;
    save();
    updateBalance();
  }
}

function bindEvents() {
  document.getElementById("addBtn").addEventListener("click", addTransaction);

  ["itemName", "itemAmount"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", e => {
      if (e.key === "Enter") addTransaction();
    });
  });

  document.getElementById("categoryPills").addEventListener("click", e => {
    const pill = e.target.closest(".pill");
    if (pill) selectPill(pill.dataset.value);
  });

  document.getElementById("customToggle").addEventListener("click", () => {
    const row = document.getElementById("customCatRow");
    const show = row.classList.toggle("show");
    document.getElementById("customToggle").textContent =
      show ? "✕ Cancel" : "＋ Add custom category";
    if (show) document.getElementById("customCategory").focus();
  });

  document.getElementById("addCatBtn").addEventListener("click", addCustomCategory);
  document.getElementById("customCategory").addEventListener("keydown", e => {
    if (e.key === "Enter") addCustomCategory();
  });

  document.getElementById("transactionList").addEventListener("click", e => {
    const btn = e.target.closest(".txn-delete");
    if (btn) deleteTransaction(btn.dataset.id);
  });

  document.getElementById("sortSelect").addEventListener("change", renderList);

  document.getElementById("setLimitBtn").addEventListener("click", setLimit);
  document.getElementById("spendingLimit").addEventListener("keydown", e => {
    if (e.key === "Enter") setLimit();
  });

  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
}

function addCustomCategory() {
  const input = document.getElementById("customCategory");
  const name = input.value.trim();
  if (!name) return;
  if (customCategories.includes(name) || ["Food", "Transport", "Fun"].includes(name)) {
    input.value = "";
    selectPill(name);
    return;
  }
  customCategories.push(name);
  save();
  renderPills();
  input.value = "";
  selectPill(name);

  document.getElementById("customCatRow").classList.remove("show");
  document.getElementById("customToggle").textContent = "＋ Add custom category";
}

function init() {
  load();
  renderPills();

  if (spendingLimit > 0) {
    document.getElementById("spendingLimit").value = spendingLimit;
  }

  bindEvents();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);