(() => {
  let adminKey = "";
  let submissions = [];
  let filter = "all";
  const login = document.querySelector("#login-card");
  const queue = document.querySelector("#queue");
  const list = document.querySelector("#submission-list");
  const empty = document.querySelector("#empty-state");
  const loginStatus = document.querySelector("#login-status");

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
  const humanSize = (bytes) => bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  async function request(path = "", options = {}) {
    const response = await fetch(`/.netlify/functions/drop-admin${path}`, {
      ...options,
      headers: { "x-admin-key": adminKey, "content-type": "application/json", ...options.headers },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function load() {
    const data = await request();
    submissions = data.submissions;
    login.hidden = true;
    queue.hidden = false;
    render();
  }

  function render() {
    const shown = submissions.filter((item) => filter === "all" || item.status === filter);
    document.querySelector("#queue-count").textContent =
      `${submissions.length} submission${submissions.length === 1 ? "" : "s"}`;
    list.innerHTML = shown.map((item, index) => `
      <article class="submission-card" data-id="${item.id}">
        <div class="queue-number">${String(index + 1).padStart(2, "0")}</div>
        <div class="submission-main">
          <div class="submitter-line">
            <div>
              <h2>${escapeHtml(item.display_name)}</h2>
              <span>@${escapeHtml(item.tiktok_handle)}</span>
            </div>
            <time>${new Date(item.submitted_at || item.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
          </div>
          ${item.notes ? `<p class="submission-notes">“${escapeHtml(item.notes)}”</p>` : ""}
          <div class="admin-files">
            ${(item.drop_files || []).map((file) => `
              <button class="download-file" data-file="${file.id}" type="button">
                <span class="file-thumb">IMG</span>
                <span><strong>${escapeHtml(file.original_name)}</strong><small>${humanSize(file.byte_size)} · original file</small></span>
                <b>Download ↓</b>
              </button>`).join("")}
          </div>
        </div>
        <div class="submission-controls">
          <select aria-label="Submission status">
            <option value="new" ${item.status === "new" ? "selected" : ""}>New</option>
            <option value="editing" ${item.status === "editing" ? "selected" : ""}>Editing</option>
            <option value="done" ${item.status === "done" ? "selected" : ""}>Done</option>
          </select>
          <button class="delete-submission" type="button">Delete</button>
        </div>
      </article>`).join("");
    empty.hidden = shown.length > 0;

    list.querySelectorAll(".submission-card").forEach((card) => {
      const id = card.dataset.id;
      card.querySelector("select").addEventListener("change", async (event) => {
        try {
          await request("", { method: "PATCH", body: JSON.stringify({ id, status: event.target.value }) });
          submissions.find((item) => item.id === id).status = event.target.value;
          render();
        } catch (error) { alert(error.message); }
      });
      card.querySelectorAll(".download-file").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const data = await request(`?id=${encodeURIComponent(id)}&file=${encodeURIComponent(button.dataset.file)}`);
          window.location.assign(data.url);
        } catch (error) { alert(error.message); }
        finally { button.disabled = false; }
      }));
      card.querySelector(".delete-submission").addEventListener("click", async () => {
        if (!confirm("Permanently delete this submission and its original files?")) return;
        try {
          await request("", { method: "DELETE", body: JSON.stringify({ id }) });
          submissions = submissions.filter((item) => item.id !== id);
          render();
        } catch (error) { alert(error.message); }
      });
    });
  }

  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    adminKey = document.querySelector("#admin-key").value;
    loginStatus.textContent = "Opening queue…";
    loginStatus.classList.remove("is-error");
    try { await load(); }
    catch (error) {
      loginStatus.textContent = error.message;
      loginStatus.classList.add("is-error");
      adminKey = "";
    }
  });
  document.querySelector("#refresh").addEventListener("click", load);
  document.querySelector("#lock").addEventListener("click", () => window.location.reload());
  document.querySelector("#filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
})();

