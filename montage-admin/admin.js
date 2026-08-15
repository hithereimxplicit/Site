(() => {
  const login = document.querySelector("#login");
  const library = document.querySelector("#library");
  const container = document.querySelector("#submissions");
  const status = document.querySelector("#status");
  const zipButton = document.querySelector("#zip");
  const all = document.querySelector("#select-all");
  const logout = document.querySelector("#logout");
  let token = "";
  let files = [];
  const human = (n) => n < 1048576 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const checked = () => files.filter((file) => file.box.checked);
  function sync() {
    const picked = checked().length;
    zipButton.disabled = !picked;
    zipButton.textContent = picked ? `Download ZIP (${picked})` : "Download ZIP";
    all.checked = files.length > 0 && picked === files.length;
    all.indeterminate = picked > 0 && picked < files.length;
  }
  async function api(path = "") {
    const response = await fetch(`/.netlify/functions/montage-admin${path}`, { headers: { authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Request failed.");
    return data;
  }
  const fileUrl = (id) => api(`?file=${encodeURIComponent(id)}`);
  function render(submissions) {
    container.replaceChildren(); files = [];
    if (!submissions.length) { container.innerHTML = '<p class="empty">No uploads yet.</p>'; return; }
    submissions.forEach((sub) => {
      const card = document.createElement("article"); card.className = "submission";
      const date = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : "";
      card.innerHTML = `<div class="submission-head"><div><h2></h2><p></p></div><time>${date}</time></div><div class="files"></div>`;
      card.querySelector("h2").textContent = sub.display_name;
      card.querySelector("p").textContent = sub.message || "No message";
      const list = card.querySelector(".files");
      (sub.montage_files || []).forEach((file) => {
        const row = document.createElement("div"); row.className = "file";
        row.innerHTML = `<input type="checkbox" aria-label="Select file"><span><strong></strong><small>${file.media_kind.toUpperCase()} · ${human(file.byte_size)}${file.duration_seconds ? ` · ${Number(file.duration_seconds).toFixed(1)} sec` : ""}</small></span><button class="download">Download</button>`;
        row.querySelector("strong").textContent = file.original_name;
        const box = row.querySelector("input"); box.onchange = sync;
        row.querySelector("button").onclick = async () => {
          try { status.textContent = `Preparing ${file.original_name}…`; const signed = await fileUrl(file.id); const a = document.createElement("a"); a.href = signed.url; a.download = signed.name; document.body.append(a); a.click(); a.remove(); status.textContent = ""; }
          catch (error) { status.textContent = error.message; }
        };
        files.push({ ...file, box }); list.append(row);
      });
      container.append(card);
    }); sync();
  }
  document.querySelector("#login-form").onsubmit = async (event) => {
    event.preventDefault(); const note = document.querySelector("#login-status");
    try {
      note.textContent = "Signing in…";
      const response = await fetch("/.netlify/functions/montage-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: document.querySelector("#email").value, password: document.querySelector("#password").value }) });
      const session = await response.json(); if (!response.ok) throw Error(session.error || "Login failed.");
      token = session.accessToken; const data = await api();
      login.hidden = true; library.hidden = false; logout.hidden = false; render(data.submissions);
    } catch (error) { note.textContent = error.message; }
  };
  logout.onclick = () => location.reload();
  all.onchange = () => { files.forEach((file) => { file.box.checked = all.checked; }); sync(); };
  zipButton.onclick = async () => {
    const chosen = checked(); if (!chosen.length) return; zipButton.disabled = true;
    try {
      status.textContent = `Downloading 0 of ${chosen.length}…`; const zip = new JSZip();
      for (let i = 0; i < chosen.length; i += 1) {
        const file = chosen[i], signed = await fileUrl(file.id), response = await fetch(signed.url);
        if (!response.ok) throw Error(`Could not download ${file.original_name}.`);
        let name = file.original_name, n = 2;
        while (zip.file(name)) { const dot = file.original_name.lastIndexOf("."); name = dot > 0 ? `${file.original_name.slice(0, dot)}-${n}${file.original_name.slice(dot)}` : `${file.original_name}-${n}`; n += 1; }
        zip.file(name, await response.blob()); status.textContent = `Downloading ${i + 1} of ${chosen.length}…`;
      }
      status.textContent = "Building ZIP…"; const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `montage-files-${new Date().toISOString().slice(0, 10)}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); status.textContent = "ZIP ready.";
    } catch (error) { status.textContent = error.message; } finally { zipButton.disabled = false; }
  };
})();
