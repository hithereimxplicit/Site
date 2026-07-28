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
    list.innerHTML = shown.map((item, index) => {
      const delivery = Array.isArray(item.drop_deliveries)
        ? item.drop_deliveries[0]
        : item.drop_deliveries;
      const shareUrl = delivery ? `${window.location.origin}/post${delivery.number}` : "";
      return `
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
          <div class="delivery-box">
            <div>
              <span class="delivery-label">Finished edit</span>
              ${shareUrl
                ? `<a class="share-link" href="${shareUrl}" target="_blank">${escapeHtml(shareUrl)}</a>`
                : `<span class="delivery-empty">Upload the edited photo to create a viewer link.</span>`}
            </div>
            <input class="edited-files" type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.tif,.tiff,.dng,.avif,image/*" multiple hidden>
            <button class="upload-edit" type="button">${shareUrl ? "Replace edit" : "Upload edit"}</button>
            ${shareUrl ? `<button class="copy-link" type="button" data-link="${shareUrl}">Copy link</button>` : ""}
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
      </article>`;
    }).join("");
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
      const editedInput = card.querySelector(".edited-files");
      card.querySelector(".upload-edit").addEventListener("click", () => editedInput.click());
      editedInput.addEventListener("change", async () => {
        const files = [...editedInput.files].slice(0, 3);
        if (!files.length) return;
        const uploadButton = card.querySelector(".upload-edit");
        uploadButton.disabled = true;
        uploadButton.textContent = "Preparing…";
        try {
          const plan = await request("", {
            method: "POST",
            body: JSON.stringify({
              id,
              action: "start-delivery",
              files: files.map(({ name, type, size }) => ({ name, type, size })),
            }),
          });
          if (!plan.supabaseUrl || !plan.supabaseAnonKey) throw new Error("Missing public Supabase key.");
          const client = window.supabase.createClient(plan.supabaseUrl, plan.supabaseAnonKey, {
            auth: { persistSession: false },
          });
          for (let index = 0; index < files.length; index += 1) {
            uploadButton.textContent = `Uploading ${index + 1}/${files.length}…`;
            const extension = files[index].name.split(".").pop().toLowerCase();
            const fallbacks = { heic: "image/heic", heif: "image/heif", dng: "image/dng", tif: "image/tiff", tiff: "image/tiff" };
            const { error } = await client.storage.from(plan.bucket).uploadToSignedUrl(
              plan.uploads[index].path,
              plan.uploads[index].token,
              files[index],
              { contentType: files[index].type || fallbacks[extension] || "application/octet-stream", upsert: false }
            );
            if (error) throw error;
          }
          await load();
          const url = window.location.origin + plan.path;
          try { await navigator.clipboard.writeText(url); } catch (_) {}
          alert(`Share link ready and copied:\n${url}`);
        } catch (error) {
          alert(error.message);
          uploadButton.disabled = false;
          uploadButton.textContent = "Try again";
        }
      });
      card.querySelector(".copy-link")?.addEventListener("click", async (event) => {
        try {
          await navigator.clipboard.writeText(event.currentTarget.dataset.link);
          const original = event.currentTarget.textContent;
          event.currentTarget.textContent = "Copied!";
          setTimeout(() => { event.currentTarget.textContent = original; }, 1400);
        } catch (_) {
          prompt("Copy this link:", event.currentTarget.dataset.link);
        }
      });
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
