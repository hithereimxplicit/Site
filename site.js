// site.js - scroll reveal (no libraries)
(() => {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    items.forEach(el => el.classList.add("show"));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("show");
      io.unobserve(entry.target);
    });
  }, { threshold: 0.15 });

  items.forEach((el, i) => {
    // subtle stagger (feels premium)
    el.style.transitionDelay = `${Math.min(i * 40, 220)}ms`;
    io.observe(el);
  });
})();

// -----------------------------
// Simple local comments (no backend)
// Stores comments in localStorage per-page.
// -----------------------------
(function initLocalComments() {
  const root = document.querySelector('[data-comments-root]');
  if (!root) return;

  const listEl = root.querySelector('[data-comments-list]');
  const formEl = root.querySelector('[data-comments-form]');
  const nameEl = root.querySelector('[data-comments-name]');
  const textEl = root.querySelector('[data-comments-text]');
  const countEl = root.querySelector('[data-comments-count]');
  const emptyEl = root.querySelector('[data-comments-empty]');

  // Key is unique per page path
  const storageKey = `comments:v1:${location.pathname}`;

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  function render() {
    const items = load();
    if (countEl) countEl.textContent = String(items.length);

    if (!listEl) return;
    listEl.innerHTML = '';

    if (emptyEl) emptyEl.style.display = items.length ? 'none' : 'block';

    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'comment-item';
      li.innerHTML = `
        <div class="comment-head">
          <span class="comment-name">${escapeHtml(item.name || 'Anonymous')}</span>
          <span class="comment-time">${escapeHtml(formatTime(item.createdAt || ''))}</span>
        </div>
        <p class="comment-body">${escapeHtml(item.text || '')}</p>
      `;
      listEl.appendChild(li);
    }
  }

  if (formEl) {
    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (nameEl?.value || '').trim();
      const text = (textEl?.value || '').trim();

      if (!text) {
        textEl?.focus();
        return;
      }

      const items = load();
      items.unshift({
        name: name || 'Anonymous',
        text,
        createdAt: new Date().toISOString()
      });
      save(items);

      if (textEl) textEl.value = '';
      render();
    });
  }

  // Clear button (optional)
  const clearBtn = root.querySelector('[data-comments-clear]');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      localStorage.removeItem(storageKey);
      render();
    });
  }

  render();
})();