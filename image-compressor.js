'use strict';

(function () {
  const app = document.getElementById('ic-app');
  if (!app) return;

  // Elements
  const fileInput = document.getElementById('ic-file-input');
  const addBtn = document.getElementById('ic-add-btn');
  const deleteAllBtn = document.getElementById('ic-delete-all-btn');
  const listEl = document.getElementById('ic-list');

  const maxKbInput = document.getElementById('ic-max-kb');
  const applyMaxBtn = document.getElementById('ic-apply-max');

  const originalImg = document.getElementById('ic-original-img');
  const compressedImg = document.getElementById('ic-compressed-img');
  const compare = document.getElementById('ic-compare');
  const compareOverlay = document.getElementById('ic-compare-overlay');
  const handle = document.getElementById('ic-compare-handle');

  const qualityRange = document.getElementById('ic-quality-range');
  const qualityValue = document.getElementById('ic-quality-value');
  const statsEl = document.getElementById('ic-stats');

  const modal = document.getElementById('ic-confirm-modal');
  const modalCancel = document.getElementById('ic-cancel-delete');
  const modalConfirm = document.getElementById('ic-confirm-delete');
  const toast = document.getElementById('ic-toast');

  const progress = document.getElementById('ic-progress');
  const progressText = document.getElementById('ic-progress-text');

  // State
  const state = {
    images: [], // {id, name, type, originalBlob, originalUrl, width, height, quality, compressedBlob, compressedUrl}
    activeId: null,
  };

  const DEFAULT_QUALITY = 0.8; // 80%

  // Helpers
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function showProgress(message) {
    if (!progress) return;
    progressText.textContent = message || 'Processing…';
    progress.classList.add('show');
    progress.setAttribute('aria-hidden', 'false');
  }

  function hideProgress() {
    if (!progress) return;
    progress.classList.remove('show');
    progress.setAttribute('aria-hidden', 'true');
  }

  function revokeUrl(url) {
    try { if (url) URL.revokeObjectURL(url); } catch (_) {}
  }

  function blobToDataURL(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function drawToCanvas(blob) {
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    return canvas;
  }

  async function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        type,
        quality
      );
    });
  }

  async function compressBlob(originalBlob, quality = DEFAULT_QUALITY) {
    const canvas = await drawToCanvas(originalBlob);
    // Prefer WEBP, fallback to JPEG
    let type = 'image/webp';
    let out = await canvasToBlob(canvas, type, Math.max(0.05, Math.min(1, quality)));
    if (!out) {
      type = 'image/jpeg';
      out = await canvasToBlob(canvas, type, Math.max(0.05, Math.min(1, quality)));
    }
    if (!out) {
      // Last resort, return original
      return originalBlob;
    }
    return out;
  }

  async function compressToTargetKB(originalBlob, targetKB) {
    const targetBytes = targetKB * 1024;
    // If original already below target, compress slightly to WEBP/JPEG but keep size
    if (originalBlob.size <= targetBytes) {
      const result = await compressBlob(originalBlob, DEFAULT_QUALITY);
      return { blob: result, quality: DEFAULT_QUALITY };
    }

    let low = 0.05, high = 1.0;
    let bestBlob = null; let bestQ = low;

    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      const tmp = await compressBlob(originalBlob, mid);
      if (tmp && tmp.size <= targetBytes) {
        bestBlob = tmp; bestQ = mid; high = mid - 0.02;
      } else {
        low = mid + 0.02;
      }
    }

    if (!bestBlob) {
      const tmp = await compressBlob(originalBlob, low);
      bestBlob = tmp; bestQ = low;
    }

    return { blob: bestBlob, quality: Math.max(0.05, Math.min(1, bestQ)) };
  }

  function setActive(id) {
    state.activeId = id;
    renderList();
    renderActive();
  }

  function getActiveItem() {
    return state.images.find((x) => x.id === state.activeId) || state.images[0];
  }

  function sizeReductionText(originalBytes, compressedBytes) {
    if (!originalBytes || !compressedBytes) return 'Original: 0 KB | Compressed: 0 KB (0%)';
    const reduction = Math.max(0, 100 - (compressedBytes / originalBytes) * 100);
    const perc = reduction.toFixed(0);
    return `Original: ${formatBytes(originalBytes)} | Compressed: ${formatBytes(compressedBytes)} (-${perc}%)`;
  }

  function renderList() {
    listEl.innerHTML = '';
    state.images.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'ic-item' + (state.activeId === item.id ? ' active' : '');
      row.dataset.id = item.id;

      const img = document.createElement('img');
      img.className = 'ic-thumb';
      img.src = item.thumbnailUrl || item.originalUrl;
      img.alt = item.name;

      const meta = document.createElement('div');
      meta.className = 'ic-item-meta';
      const title = document.createElement('div');
      title.className = 'ic-item-title';
      title.textContent = item.name;
      const sub = document.createElement('div');
      sub.className = 'ic-item-sub';
      const originalSize = item.originalBlob ? formatBytes(item.originalBlob.size) : '—';
      const compressedSize = item.compressedBlob ? formatBytes(item.compressedBlob.size) : '—';
      sub.textContent = `${originalSize} → ${compressedSize}`;
      meta.appendChild(title);
      meta.appendChild(sub);

      const actions = document.createElement('div');
      actions.className = 'ic-item-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'ic-chip';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!item.compressedBlob) return;
        try {
          if (navigator.clipboard && window.ClipboardItem) {
            const data = new ClipboardItem({ [item.compressedBlob.type]: item.compressedBlob });
            await navigator.clipboard.write([data]);
            showToast('Copied image to clipboard');
          } else if (navigator.clipboard) {
            const dataUrl = await blobToDataURL(item.compressedBlob);
            await navigator.clipboard.writeText(dataUrl);
            showToast('Copied data URL to clipboard');
          }
        } catch (err) {
          console.error(err);
          showToast('Copy not supported in this browser');
        }
      });

      const dlBtn = document.createElement('button');
      dlBtn.className = 'ic-chip';
      dlBtn.textContent = 'Download';
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!item.compressedBlob) return;
        const url = URL.createObjectURL(item.compressedBlob);
        const a = document.createElement('a');
        const ext = item.compressedBlob.type.includes('webp') ? 'webp' : 'jpg';
        a.href = url;
        a.download = `${item.name.replace(/\.[^/.]+$/, '')}-compressed.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'ic-chip ic-remove';
      removeBtn.innerHTML = '×';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeItem(item.id);
      });

      actions.appendChild(copyBtn);
      actions.appendChild(dlBtn);
      actions.appendChild(removeBtn);

      row.appendChild(img);
      row.appendChild(meta);
      row.appendChild(actions);

      row.addEventListener('click', () => setActive(item.id));
      listEl.appendChild(row);
    });
  }

  function renderActive() {
    const item = getActiveItem();
    if (!item) {
      originalImg.removeAttribute('src');
      compressedImg.removeAttribute('src');
      statsEl.textContent = 'Original: 0 KB | Compressed: 0 KB (0%)';
      qualityRange.value = 80; qualityValue.textContent = '80%';
      return;
    }

    originalImg.src = item.originalUrl;
    if (item.compressedUrl) compressedImg.src = item.compressedUrl;
    qualityRange.value = Math.round(item.quality * 100);
    qualityValue.textContent = `${Math.round(item.quality * 100)}%`;
    statsEl.textContent = sizeReductionText(item.originalBlob.size, item.compressedBlob?.size || 0);
  }

  function removeItem(id) {
    const index = state.images.findIndex((x) => x.id === id);
    if (index === -1) return;
    const [removed] = state.images.splice(index, 1);
    revokeUrl(removed.originalUrl);
    revokeUrl(removed.thumbnailUrl);
    revokeUrl(removed.compressedUrl);
    if (state.activeId === id) {
      state.activeId = state.images[0]?.id || null;
    }
    renderList();
    renderActive();
  }

  function clearAll() {
    state.images.forEach((it) => {
      revokeUrl(it.originalUrl);
      revokeUrl(it.thumbnailUrl);
      revokeUrl(it.compressedUrl);
    });
    state.images = [];
    state.activeId = null;
    renderList();
    renderActive();
  }

  // Upload handling
  addBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    showProgress('Uploading images…');

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;

      const id = uid();
      const originalUrl = URL.createObjectURL(file);
      const thumbnailUrl = originalUrl; // simple approach
      const originalBlob = file;

      showProgress('Compressing image…');

      // Compress initially at default quality
      const compressedBlob = await compressBlob(originalBlob, DEFAULT_QUALITY);
      const compressedUrl = URL.createObjectURL(compressedBlob);

      const item = {
        id,
        name: file.name,
        type: file.type,
        originalBlob,
        originalUrl,
        thumbnailUrl,
        quality: DEFAULT_QUALITY,
        compressedBlob,
        compressedUrl,
      };

      state.images.push(item);
    }

    hideProgress();

    if (!state.activeId && state.images.length) {
      state.activeId = state.images[0].id;
    }

    renderList();
    renderActive();
    fileInput.value = '';
  });

  // Quality control
  function debounce(fn, wait) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
  }

  const applyQuality = debounce(async () => {
    const item = getActiveItem();
    if (!item) return;
    const q = Number(qualityRange.value) / 100;
    qualityValue.textContent = `${Math.round(q * 100)}%`;
    item.quality = q;

    showProgress('Recompressing…');
    // recompress
    const prevUrl = item.compressedUrl;
    const newBlob = await compressBlob(item.originalBlob, q);
    const newUrl = URL.createObjectURL(newBlob);

    item.compressedBlob = newBlob;
    item.compressedUrl = newUrl;

    compressedImg.src = newUrl;
    statsEl.textContent = sizeReductionText(item.originalBlob.size, item.compressedBlob.size);

    if (prevUrl) setTimeout(() => revokeUrl(prevUrl), 100);
    renderList();
    hideProgress();
  }, 200);

  qualityRange.addEventListener('input', applyQuality);

  // Apply max size
  applyMaxBtn.addEventListener('click', async () => {
    const item = getActiveItem();
    if (!item) return;
    const kb = Number(maxKbInput.value);
    if (!kb || kb <= 0 || !isFinite(kb)) {
      showToast('Enter a valid KB value');
      return;
    }

    showProgress('Compressing to target size…');

    const { blob, quality } = await compressToTargetKB(item.originalBlob, kb);
    const prevUrl = item.compressedUrl;
    const newUrl = URL.createObjectURL(blob);
    item.compressedBlob = blob;
    item.compressedUrl = newUrl;
    item.quality = quality;

    compressedImg.src = newUrl;
    qualityRange.value = Math.round(quality * 100);
    qualityValue.textContent = `${Math.round(quality * 100)}%`;
    statsEl.textContent = sizeReductionText(item.originalBlob.size, item.compressedBlob.size);

    if (prevUrl) setTimeout(() => revokeUrl(prevUrl), 100);
    renderList();
    hideProgress();
  });

  // Compare slider interactions
  (function initCompare() {
    let isDown = false;

    function setSplitFromEvent(evt) {
      const rect = compare.getBoundingClientRect();
      const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
      let x = clientX - rect.left;
      x = Math.max(0, Math.min(rect.width, x));
      const perc = (x / rect.width) * 100;
      compare.style.setProperty('--ic-split', `${perc}%`);
      handle.setAttribute('aria-valuenow', `${Math.round(perc)}`);
    }

    const start = (e) => { isDown = true; setSplitFromEvent(e); };
    const move = (e) => { if (!isDown) return; setSplitFromEvent(e); };
    const end = () => { isDown = false; };

    handle.addEventListener('mousedown', start);
    handle.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end);

    // Also allow dragging anywhere on the compare area for convenience
    compare.addEventListener('mousedown', start);
    compare.addEventListener('touchstart', start, { passive: true });
  })();

  // Delete all (modal)
  deleteAllBtn.addEventListener('click', () => {
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  });

  modal.addEventListener('click', (e) => {
    if (e.target.dataset.close === 'modal') {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  });

  modalCancel.addEventListener('click', () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  });

  modalConfirm.addEventListener('click', () => {
    clearAll();
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  });
})();