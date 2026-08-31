let RAW_JOBS = [];

let state = {
  search: "",
  location: "all",
  discipline: "all",
  contract: "all",
  ats: "all",
  selectedPills: new Set(),
  sort: "bcn_first",
  page: 1,
  pageSize: 12,
};

// Initialize & Load Data
async function init() {
  try {
    const embeddedEl = document.getElementById("raw-jobs-json");
    if (embeddedEl && embeddedEl.textContent.trim()) {
      RAW_JOBS = JSON.parse(embeddedEl.textContent);
    } else {
      const res = await fetch("jobs_data.json");
      RAW_JOBS = await res.json();
    }
  } catch (err) {
    console.error("Failed to load jobs data:", err);
  }

  // Update total count
  const statCount = document.getElementById("stat-count");
  if (statCount) statCount.innerText = RAW_JOBS.length || "423";

  // Setup Event Listeners
  setupEventListeners();

  // Initial Filter & Render
  applyFilters();
}

function setupEventListeners() {
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.search = e.target.value;
      state.page = 1;
      applyFilters();
    });
  }

  const filterDisc = document.getElementById("filter-discipline");
  if (filterDisc) {
    filterDisc.addEventListener("change", (e) => {
      state.discipline = e.target.value;
      state.page = 1;
      applyFilters();
    });
  }

  const filterCont = document.getElementById("filter-contract");
  if (filterCont) {
    filterCont.addEventListener("change", (e) => {
      state.contract = e.target.value;
      state.page = 1;
      applyFilters();
    });
  }

  const filterAts = document.getElementById("filter-ats");
  if (filterAts) {
    filterAts.addEventListener("change", (e) => {
      state.ats = e.target.value;
      state.page = 1;
      applyFilters();
    });
  }

  const sortSelect = document.getElementById("sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      state.sort = e.target.value;
      applyFilters();
    });
  }
}

function setLocationFilter(loc) {
  state.location = loc;
  state.page = 1;

  document.querySelectorAll("#location-tabs button").forEach((b) => b.classList.remove("tab-active"));
  const btn = document.getElementById("loc-" + (loc === "erasmus_eu" ? "erasmus" : loc));
  if (btn) btn.classList.add("tab-active");

  applyFilters();
}

function togglePill(pill) {
  const btn = document.getElementById("pill-" + pill);
  if (state.selectedPills.has(pill)) {
    state.selectedPills.delete(pill);
    if (btn) btn.classList.remove("tab-active", "border-emerald-500");
  } else {
    state.selectedPills.add(pill);
    if (btn) btn.classList.add("tab-active", "border-emerald-500");
  }
  state.page = 1;
  applyFilters();
}

function resetAllFilters() {
  state.search = "";
  state.location = "all";
  state.discipline = "all";
  state.contract = "all";
  state.ats = "all";
  state.selectedPills.clear();
  state.sort = "bcn_first";
  state.page = 1;

  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";

  const filterDisc = document.getElementById("filter-discipline");
  if (filterDisc) filterDisc.value = "all";

  const filterCont = document.getElementById("filter-contract");
  if (filterCont) filterCont.value = "all";

  const filterAts = document.getElementById("filter-ats");
  if (filterAts) filterAts.value = "all";

  const sortSelect = document.getElementById("sort-select");
  if (sortSelect) sortSelect.value = "bcn_first";

  document.querySelectorAll("#location-tabs button").forEach((b) => b.classList.remove("tab-active"));
  const locAll = document.getElementById("loc-all");
  if (locAll) locAll.classList.add("tab-active");

  document.querySelectorAll('[id^="pill-"]').forEach((b) => b.classList.remove("tab-active", "border-emerald-500"));

  applyFilters();
}

function applyFilters() {
  const query = state.search.toLowerCase().trim();

  const filtered = RAW_JOBS.filter((job) => {
    const titleLower = (job.title || "").toLowerCase();
    const compLower = (job.company || "").toLowerCase();
    const locLower = (job.location || "").toLowerCase();
    const descLower = (job.description || "").toLowerCase();
    const contractLower = (job.contract || "").toLowerCase();

    // 1. Search Query
    if (query) {
      const inTitle = titleLower.includes(query);
      const inComp = compLower.includes(query);
      const inLoc = locLower.includes(query);
      const inTools = (job.tools || []).some((t) => t.toLowerCase().includes(query));
      if (!inTitle && !inComp && !inLoc && !inTools) return false;
    }

    // 2. Location Filter
    if (state.location === "barcelona") {
      if (!locLower.includes("barcelona") && !locLower.includes("cataluña") && !locLower.includes("catalonia")) {
        return false;
      }
    } else if (state.location === "spain") {
      if (!locLower.includes("spain") && !locLower.includes("barcelona") && !locLower.includes("madrid") && !locLower.includes("valència")) {
        return false;
      }
    } else if (state.location === "erasmus_eu") {
      if (!contractLower.includes("erasmus") && !locLower.includes("remote") && !locLower.includes("europe")) {
        return false;
      }
    }

    // 3. Discipline Filter
    if (state.discipline === "ux_ui") {
      const isUxUi = titleLower.includes("ux") || titleLower.includes("ui") || titleLower.includes("product") || descLower.includes("ux");
      if (!isUxUi) return false;
    } else if (state.discipline === "graphic") {
      const isGraphic = titleLower.includes("graphic") || titleLower.includes("visual") || titleLower.includes("digital design") || titleLower.includes("diseño");
      if (!isGraphic) return false;
    } else if (state.discipline === "ai_tech") {
      const isAi = titleLower.includes("ai") || titleLower.includes("data") || titleLower.includes("automation") || titleLower.includes("scientist");
      if (!isAi) return false;
    } else if (state.discipline === "engineering") {
      const isEng = titleLower.includes("frontend") || titleLower.includes("engineer") || titleLower.includes("developer") || titleLower.includes("software");
      if (!isEng) return false;
    }

    // 4. Contract Filter
    if (state.contract === "erasmus") {
      if (!contractLower.includes("erasmus")) return false;
    } else if (state.contract === "convenio") {
      if (!contractLower.includes("convenio") && !contractLower.includes("prácticas")) return false;
    }

    // 5. ATS Filter
    if (state.ats !== "all") {
      if ((job.ats || "").toUpperCase() !== state.ats.toUpperCase()) return false;
    }

    // 6. Skill Pills
    if (state.selectedPills.size > 0) {
      for (const pill of state.selectedPills) {
        const pLower = pill.toLowerCase();
        const hasTool = (job.tools || []).some((t) => t.toLowerCase().includes(pLower));
        const hasText = titleLower.includes(pLower) || descLower.includes(pLower) || locLower.includes(pLower);
        if (!hasTool && !hasText) return false;
      }
    }

    return true;
  });

  // Sorting
  if (state.sort === "score_desc") {
    filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
  } else if (state.sort === "bcn_first") {
    filtered.sort((a, b) => {
      const aBcn = (a.location || "").toLowerCase().includes("barcelona") ? 1 : 0;
      const bBcn = (b.location || "").toLowerCase().includes("barcelona") ? 1 : 0;
      if (aBcn !== bBcn) return bBcn - aBcn;
      return (b.score || 0) - (a.score || 0);
    });
  } else if (state.sort === "company_asc") {
    filtered.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
  }

  renderUI(filtered);
}

function renderUI(jobs) {
  const grid = document.getElementById("job-grid");
  const countBadge = document.getElementById("results-count-badge");
  const pageIndicator = document.getElementById("page-indicator");

  if (countBadge) {
    countBadge.innerText = `Showing ${jobs.length} matching internships`;
  }

  const totalPages = Math.ceil(jobs.length / state.pageSize) || 1;
  if (state.page > totalPages) state.page = totalPages;

  if (pageIndicator) {
    pageIndicator.innerText = `Page ${state.page} of ${totalPages}`;
  }

  const btnPrev = document.getElementById("btn-prev");
  if (btnPrev) btnPrev.disabled = state.page <= 1;

  const btnNext = document.getElementById("btn-next");
  if (btnNext) btnNext.disabled = state.page >= totalPages;

  renderPaginationButtons(totalPages);

  const startIndex = (state.page - 1) * state.pageSize;
  const pageJobs = jobs.slice(startIndex, startIndex + state.pageSize);

  if (!grid) return;
  grid.innerHTML = "";

  if (pageJobs.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center space-y-3 glass-card rounded-2xl">
        <i class="fa-solid fa-filter-circle-xmark text-4xl text-gray-600"></i>
        <h3 class="text-base font-bold text-gray-300">No matching internships found</h3>
        <p class="text-xs text-gray-500">Try adjusting your filters, location tabs, or search terms.</p>
        <button onclick="resetAllFilters()" class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-white transition">Reset All Filters</button>
      </div>
    `;
    return;
  }

  pageJobs.forEach((job) => {
    const isBcn = (job.location || "").toLowerCase().includes("barcelona");
    const bcnBadge = isBcn
      ? `<span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">📍 Barcelona</span>`
      : "";

    const score = job.score || 85;
    const scoreBadge =
      score >= 90
        ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🔥 ${score}%</span>`
        : `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40">✨ ${score}%</span>`;

    const tools = job.tools || ["UI/UX", "Figma", "English"];

    const card = document.createElement("div");
    card.className = "glass-card p-5 rounded-2xl flex flex-col justify-between space-y-4 transition duration-200";
    card.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider">${escapeHtml(job.company)}</span>
            ${bcnBadge}
          </div>
          ${scoreBadge}
        </div>

        <h3 class="text-base font-bold text-white group-hover:text-emerald-400 transition leading-snug">
          ${escapeHtml(job.title)}
        </h3>

        <div class="flex flex-wrap gap-1.5 text-[11px] text-gray-400">
          <span class="inline-flex items-center gap-1 bg-gray-800/90 px-2 py-0.5 rounded-md">
            <i class="fa-solid fa-location-dot text-emerald-400"></i> ${escapeHtml(job.location)}
          </span>
          <span class="inline-flex items-center gap-1 bg-gray-800/90 px-2 py-0.5 rounded-md">
            <i class="fa-solid fa-id-card text-teal-400"></i> ${escapeHtml(job.ats)}
          </span>
        </div>

        <div class="text-xs text-gray-300 bg-gray-900/60 p-2.5 rounded-xl border border-gray-800/80 flex items-center gap-2">
          <i class="fa-solid fa-graduation-cap text-emerald-400 text-sm"></i>
          <span class="font-medium text-[11px] truncate">${escapeHtml(job.contract)}</span>
        </div>

        <div class="flex flex-wrap gap-1 pt-1">
          ${tools.map((t) => `<span class="text-[10px] font-semibold bg-gray-800/90 text-gray-300 px-2 py-0.5 rounded-md border border-gray-700/50">${escapeHtml(t)}</span>`).join("")}
        </div>
      </div>

      <div class="pt-3 border-t border-gray-800 flex items-center justify-between gap-2">
        <button onclick="openModal('${escapeJsString(job.id)}')" class="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition flex items-center gap-1.5">
          <i class="fa-solid fa-circle-info text-emerald-400"></i> Details
        </button>
        <a href="${escapeHtml(job.applyUrl)}" target="_blank" rel="noopener noreferrer" class="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-500/10">
          <span>Apply</span>
          <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
        </a>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderPaginationButtons(totalPages) {
  const container = document.getElementById("pagination-pages");
  if (!container) return;
  container.innerHTML = "";

  let start = Math.max(1, state.page - 2);
  let end = Math.min(totalPages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);

  for (let i = start; i <= end; i++) {
    const btn = document.createElement("button");
    btn.className = `w-8 h-8 rounded-lg ${
      i === state.page ? "bg-emerald-500 text-white font-bold" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
    } transition text-xs`;
    btn.innerText = i;
    btn.onclick = () => {
      state.page = i;
      applyFilters();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    container.appendChild(btn);
  }
}

function prevPage() {
  if (state.page > 1) {
    state.page--;
    applyFilters();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function nextPage() {
  state.page++;
  applyFilters();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openModal(jobId) {
  const job = RAW_JOBS.find((j) => j.id === jobId);
  if (!job) return;

  const modalContent = document.getElementById("modal-content");
  if (!modalContent) return;

  const tools = job.tools || ["UI/UX", "Figma", "English"];

  modalContent.innerHTML = `
    <div class="space-y-5">
      <div class="border-b border-gray-800 pb-4">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-bold text-emerald-400 uppercase">${escapeHtml(job.company)} • ${escapeHtml(job.location)}</span>
          <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">🔥 ${job.score || 85}% Match</span>
        </div>
        <h2 class="text-xl font-extrabold text-white">${escapeHtml(job.title)}</h2>
      </div>

      <div class="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
        <h4 class="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
          <i class="fa-solid fa-brain"></i> OpenCode AI Fit Breakdown for PoliTo Student:
        </h4>
        <p class="text-xs text-gray-200 leading-relaxed">${escapeHtml(job.description)}</p>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="p-3 rounded-xl bg-gray-900/60 border border-gray-800">
          <span class="text-gray-400 block mb-1">Contract / Agreement:</span>
          <span class="font-bold text-white">${escapeHtml(job.contract)}</span>
        </div>
        <div class="p-3 rounded-xl bg-gray-900/60 border border-gray-800">
          <span class="text-gray-400 block mb-1">ATS Platform:</span>
          <span class="font-bold text-emerald-400">${escapeHtml(job.ats)}</span>
        </div>
      </div>

      <div>
        <span class="text-xs text-gray-400 block mb-2 font-medium">Matching Skill & Tool Stack:</span>
        <div class="flex flex-wrap gap-1.5">
          ${tools.map((t) => `<span class="text-xs font-semibold bg-gray-800 text-emerald-300 px-2.5 py-1 rounded-lg border border-gray-700">${escapeHtml(t)}</span>`).join("")}
        </div>
      </div>

      <div class="pt-4 flex items-center justify-end gap-3 border-t border-gray-800">
        <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-300">Close</button>
        <a href="${escapeHtml(job.applyUrl)}" target="_blank" rel="noopener noreferrer" class="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-white shadow-lg shadow-emerald-500/20">Apply on Official Portal ↗</a>
      </div>
    </div>
  `;

  const modal = document.getElementById("detail-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeModal() {
  const modal = document.getElementById("detail-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJsString(str) {
  if (!str) return "";
  return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// Kickoff
window.addEventListener("DOMContentLoaded", init);
