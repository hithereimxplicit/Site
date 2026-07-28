(() => {
  const form = document.querySelector("#drop-form");
  const input = document.querySelector("#photos");
  const dropzone = document.querySelector("#file-drop");
  const list = document.querySelector("#file-list");
  const status = document.querySelector("#form-status");
  const submit = document.querySelector("#submit-drop");
  const success = document.querySelector("#success-panel");
  const startedAt = Date.now();
  const maxBytes = 50 * 1024 * 1024;
  let selected = [];

  document.querySelector("#year").textContent = new Date().getFullYear();

  const humanSize = (bytes) => bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  function renderFiles() {
    list.innerHTML = "";
    selected.forEach((file, index) => {
      const row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = `
        <span class="file-thumb">${file.type.startsWith("image/") ? "IMG" : "RAW"}</span>
        <span><strong></strong><small>${humanSize(file.size)} · original</small></span>
        <button type="button" aria-label="Remove photo">×</button>`;
      row.querySelector("strong").textContent = file.name;
      row.querySelector("button").addEventListener("click", () => {
        selected.splice(index, 1);
        renderFiles();
      });
      list.append(row);
    });
    dropzone.classList.toggle("has-files", selected.length > 0);
  }

  function takeFiles(files) {
    const incoming = [...files];
    if (incoming.some((file) => file.size > maxBytes)) {
      setStatus("Each photo must be 50 MB or smaller.", true);
      return;
    }
    const wasTrimmed = selected.length + incoming.length > 3;
    selected = [...selected, ...incoming].slice(0, 3);
    renderFiles();
    setStatus(wasTrimmed ? "You can submit up to 3 photos." : "");
    input.value = "";
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("is-error", error);
  }

  input.addEventListener("change", () => takeFiles(input.files));
  ["dragenter", "dragover"].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
  }));
  dropzone.addEventListener("drop", (event) => takeFiles(event.dataTransfer.files));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selected.length) return setStatus("Choose at least one photo.", true);
    if (!form.reportValidity()) return;

    submit.disabled = true;
    try {
      setStatus("Preparing your private upload…");
      const startResponse = await fetch("/.netlify/functions/drop-start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: document.querySelector("#display-name").value,
          handle: document.querySelector("#handle").value,
          notes: document.querySelector("#notes").value,
          consent: document.querySelector("#consent").checked,
          website: document.querySelector("#website").value,
          startedAt,
          files: selected.map(({ name, type, size }) => ({ name, type, size })),
        }),
      });
      const uploadPlan = await startResponse.json();
      if (!startResponse.ok) throw new Error(uploadPlan.error || "Upload could not start.");
      if (!uploadPlan.supabaseUrl || !uploadPlan.supabaseAnonKey) {
        throw new Error("The upload service needs its public key configured.");
      }

      const client = window.supabase.createClient(uploadPlan.supabaseUrl, uploadPlan.supabaseAnonKey, {
        auth: { persistSession: false },
      });
      for (let index = 0; index < selected.length; index += 1) {
        setStatus(`Uploading ${index + 1} of ${selected.length} — keep this page open…`);
        const target = uploadPlan.uploads[index];
        const extension = selected[index].name.split(".").pop().toLowerCase();
        const fallbackTypes = {
          heic: "image/heic", heif: "image/heif", dng: "image/dng",
          tif: "image/tiff", tiff: "image/tiff", avif: "image/avif",
        };
        const contentType = selected[index].type || fallbackTypes[extension] || "application/octet-stream";
        const { error } = await client.storage
          .from(uploadPlan.bucket)
          .uploadToSignedUrl(target.path, target.token, selected[index], {
            contentType,
            upsert: false,
          });
        if (error) throw error;
      }

      setStatus("Confirming your place in the queue…");
      const completeResponse = await fetch("/.netlify/functions/drop-complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId: uploadPlan.submissionId }),
      });
      const completed = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completed.error || "Confirmation failed.");

      form.hidden = true;
      success.hidden = false;
    } catch (error) {
      setStatus(error.message || "Upload failed. Please try again.", true);
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector("#send-another").addEventListener("click", () => window.location.reload());
})();
