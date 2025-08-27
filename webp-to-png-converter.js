(function(){
  'use strict';

  // Scope by wrapper to avoid conflicts in WordPress/Elementor
  const wrapper = document.querySelector('.tsc-webp2png');
  if (!wrapper) return;
  // Prevent duplicate bindings if script is injected multiple times
  if (wrapper.dataset.bound === '1') return;
  wrapper.dataset.bound = '1';

  // Elements
  const dropzone = wrapper.querySelector('#webpDropzone');
  const fileInput = wrapper.querySelector('#webpFileInput');
  const selectBtn = wrapper.querySelector('#selectFilesBtn');
  const previewGrid = wrapper.querySelector('#previewGrid');
  const resultsGrid = wrapper.querySelector('#resultsGrid');
  const convertBtn = wrapper.querySelector('#convertBtn');
  const downloadZipBtn = wrapper.querySelector('#downloadZipBtn');
  const clearAllBtn = wrapper.querySelector('#clearAllBtn');
  const selectedCountEl = wrapper.querySelector('#selectedCount');
  const selectedPanel = wrapper.querySelector('#selectedPanel');
  const uploadLoading = wrapper.querySelector('#uploadLoading');
  const actionsContainer = wrapper.querySelector('#actionsContainer');
  const resultsPanel = wrapper.querySelector('#resultsPanel');
  const modalOverlay = wrapper.querySelector('#tscConfirmModal');
  const modalTitle = modalOverlay ? modalOverlay.querySelector('.tsc-modal-title') : null;
  const modalMessage = modalOverlay ? modalOverlay.querySelector('.tsc-modal-message') : null;
  const modalCancel = modalOverlay ? modalOverlay.querySelector('.tsc-modal-cancel') : null;
  const modalConfirm = modalOverlay ? modalOverlay.querySelector('.tsc-modal-confirm') : null;

  // Settings modal removed

  const progressSection = wrapper.querySelector('#progressSection');
  const progressBar = wrapper.querySelector('#progressBar');
  const progressText = wrapper.querySelector('#progressText');
  const uploadCard = wrapper.querySelector('#uploadCard');
  const toasts = wrapper.querySelector('#tscToasts');
  

  // State
  /** @type {File[]} */
  let selectedFiles = [];
  /** @type {{name:string, blob:Blob, url:string}[]} */
  let converted = [];
  /** @type {Set<File>} */
  const convertedFiles = new Set();
  /** @type {WeakMap<File, string>} */
  const fileIdMap = new WeakMap();
  let nextFileId = 1;
  // Per-image settings removed

  // Helpers
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function updateSelectedCount() {
    selectedCountEl.textContent = `${selectedFiles.length} selected`;
    const pendingCount = selectedFiles.filter(f => !convertedFiles.has(f)).length;
    convertBtn.disabled = pendingCount === 0;
  }

  function openSelectedPanel() {
    if (!selectedPanel) return;
    selectedPanel.classList.add('is-open');
    selectedPanel.classList.remove('is-collapsed');
  }

  function closeSelectedPanel() {
    if (!selectedPanel) return;
    selectedPanel.classList.remove('is-open');
    selectedPanel.classList.add('is-collapsed');
  }

  function openResultsPanel() {
    if (!resultsPanel) return;
    resultsPanel.classList.add('is-open');
    resultsPanel.classList.remove('is-collapsed');
  }

  function closeResultsPanel() {
    if (!resultsPanel) return;
    resultsPanel.classList.remove('is-open');
    resultsPanel.classList.add('is-collapsed');
  }

  function updateActionsVisibility() {
    if (!actionsContainer) return;
    if (selectedFiles.length > 1) actionsContainer.classList.remove('is-hidden');
    else actionsContainer.classList.add('is-hidden');
  }

  function showUploadLoading() {
    if (!uploadLoading) return;
    uploadLoading.hidden = false;
    uploadLoading.classList.add('is-visible');
  }

  function hideUploadLoading() {
    if (!uploadLoading) return;
    uploadLoading.classList.remove('is-visible');
    uploadLoading.hidden = true;
  }

  function hideUploadCard() {
    if (!uploadCard) return;
    uploadCard.style.display = 'none';
  }

  function showUploadCard() {
    if (!uploadCard) return;
    uploadCard.style.display = '';
  }

  function toast(message, type) {
    if (!toasts) return;
    const el = document.createElement('div');
    el.className = 'tsc-toast' + (type ? ` tsc-toast-${type}` : '');
    el.textContent = message;
    toasts.appendChild(el);
    setTimeout(() => { el.style.animation = 'tsc-toast-out .2s ease forwards'; }, 2500);
    setTimeout(() => { el.remove(); }, 2800);
  }

  
  // Modal utilities
  function openConfirmModal({ title, message, confirmText = 'Confirm', cancelText = 'Cancel' }) {
    if (!modalOverlay) return Promise.resolve(window.confirm(message));
    modalTitle.textContent = title || 'Confirm action';
    modalMessage.textContent = message || '';
    modalConfirm.textContent = confirmText;
    modalCancel.textContent = cancelText;
    modalOverlay.hidden = false;
    modalOverlay.classList.add('is-visible');

    return new Promise(resolve => {
      const onCancel = () => { cleanup(); resolve(false); };
      const onConfirm = () => { cleanup(); resolve(true); };
      const onOverlay = (e) => { if (e.target === modalOverlay) { cleanup(); resolve(false); } };
      const onKey = (e) => { if (e.key === 'Escape') { cleanup(); resolve(false); } };

      function cleanup() {
        modalOverlay.classList.remove('is-visible');
        modalOverlay.hidden = true;
        modalCancel.removeEventListener('click', onCancel);
        modalConfirm.removeEventListener('click', onConfirm);
        modalOverlay.removeEventListener('click', onOverlay);
        document.removeEventListener('keydown', onKey);
      }

      modalCancel.addEventListener('click', onCancel);
      modalConfirm.addEventListener('click', onConfirm);
      modalOverlay.addEventListener('click', onOverlay);
      document.addEventListener('keydown', onKey);
    });
  }

  function renderPreviews() {
    previewGrid.innerHTML = '';
    selectedFiles.forEach((file) => {
      const url = URL.createObjectURL(file);
      const item = document.createElement('div');
      item.className = 'tsc-item';
      const fid = fileIdMap.get(file);
      if (fid) item.setAttribute('data-file-id', fid);
      item.innerHTML = `
        <img class="tsc-thumb" src="${url}" alt="${file.name}" />
        <div class="tsc-filemeta">
          <div class="tsc-filename" title="${file.name}">${file.name}</div>
          <div class="tsc-filesize">${formatBytes(file.size)}</div>
        </div>
        <div class="tsc-item-actions">
          <button type="button" class="tsc-btn tsc-btn-primary tsc-btn-sm tsc-convert-one">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5v14m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>Convert To PNG</span>
          </button>
        </div>
        <button type="button" class="tsc-remove" aria-label="Remove">✕</button>
      `;

      // Remove specific file with confirm
      item.querySelector('.tsc-remove').addEventListener('click', async () => {
        const ok = await openConfirmModal({
          title: 'Remove image',
          message: `Remove "${file.name}" from the list?`,
          confirmText: 'Remove',
          cancelText: 'Cancel'
        });
        if (!ok) return;
        URL.revokeObjectURL(url);
        const idx = selectedFiles.indexOf(file);
        if (idx !== -1) selectedFiles.splice(idx, 1);
        renderPreviews();
        updateSelectedCount();
        updateActionsVisibility();
        if (selectedFiles.length === 0) closeSelectedPanel();
      });

      // Convert a single file
      const convertOneBtn = item.querySelector('.tsc-convert-one');
      // Reflect converted state if already converted
      if (convertedFiles.has(file)) {
        convertOneBtn.disabled = true;
        convertOneBtn.textContent = 'Converted';
      }
      convertOneBtn.addEventListener('click', async () => {
        const originalText = convertOneBtn.textContent;
        convertOneBtn.disabled = true;
        convertOneBtn.textContent = 'Converting...';
        convertOneBtn.classList.add('is-loading');
        try {
          const pngBlob = await convertFileToPNG(file);
          const pngName = `${file.name.replace(/\.[^/.]+$/i, '')}.png`;
          const objectUrl = appendResultsCard(pngName, pngBlob);
          converted.push({ name: pngName, blob: pngBlob, url: objectUrl });
          convertedFiles.add(file);
          downloadZipBtn.disabled = converted.length === 0;
          openResultsPanel();
          convertOneBtn.textContent = 'Converted';
          toast(`Image "${file.name}" converted`, 'success');
          updateSelectedCount();
          updateDownloadAllVisibility();
        } catch (err) {
          console.error('Conversion failed for', file.name, err);
          convertOneBtn.disabled = false;
          convertOneBtn.textContent = originalText;
          toast(`Failed to convert "${file.name}"`, 'error');
        } finally {
          convertOneBtn.classList.remove('is-loading');
        }
      });

      // settings removed

      previewGrid.appendChild(item);
    });
  }

  function appendResultsCard(name, blob) {
    const objectUrl = URL.createObjectURL(blob);
    const card = document.createElement('div');
    card.className = 'tsc-result';
    card.innerHTML = `
      <img class="tsc-result-img" src="${objectUrl}" alt="${name}" />
      <div class="tsc-result-actions">
        <a class="tsc-btn tsc-btn-secondary" download="${name.replace(/\.webp$/i, '.png').replace(/\s+/g,'_')}" href="${objectUrl}">Download PNG</a>
        <button type="button" class="tsc-btn tsc-btn-ghost tsc-copy" data-name="${name}">Copy</button>
        <span class="tsc-filesize">${formatBytes(blob.size)}</span>
      </div>
    `;
    const copyBtn = card.querySelector('.tsc-copy');
    if (copyBtn && navigator.clipboard && window.ClipboardItem) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          toast(`Copied ${name} to clipboard`, 'success');
        } catch (err) {
          console.error('Clipboard copy failed', err);
          toast('Failed to copy image to clipboard', 'error');
        }
      });
    }
    resultsGrid.appendChild(card);
    return objectUrl;
  }

  function resetProgress() {
    progressBar.style.width = '0%';
    progressText.textContent = 'Ready';
    progressSection.hidden = true;
  }

  function setProgress(current, total) {
    const pct = Math.round((current / total) * 100);
    progressBar.style.width = pct + '%';
    progressText.textContent = `${current}/${total} (${pct}%)`;
  }

  function updateDownloadAllVisibility() {
    if (!downloadZipBtn) return;
    const show = converted.length > 1;
    downloadZipBtn.style.display = show ? '' : 'none';
    downloadZipBtn.disabled = !show;
  }

  function clearAll() {
    // Revoke preview object URLs
    const imgs = previewGrid.querySelectorAll('img');
    imgs.forEach(img => URL.revokeObjectURL(img.src));

    // Revoke result object URLs and clear
    const resultImgs = resultsGrid.querySelectorAll('img');
    resultImgs.forEach(img => URL.revokeObjectURL(img.src));

    selectedFiles = [];
    converted = [];
    convertedFiles.clear();
    previewGrid.innerHTML = '';
    resultsGrid.innerHTML = '';
    updateSelectedCount();
    convertBtn.disabled = true;
    updateDownloadAllVisibility();
    clearAllBtn.disabled = true;
    resetProgress();
    closeSelectedPanel();
    closeResultsPanel();
    updateActionsVisibility();
    showUploadCard();
  }

  // File handling
  async function acceptFiles(files) {
    const arr = Array.from(files);
    const incoming = arr.filter(f => /\.webp$/i.test(f.name) || f.type === 'image/webp');
    const rejected = arr.filter(f => !incoming.includes(f));
    if (rejected.length > 0) toast('Error: Invalid File Type. Only WebP images are supported!', 'error');
    if (incoming.length === 0) return;
    showUploadLoading();
    // small delay to allow overlay to paint
    await new Promise(r => setTimeout(r, 50));
    // Assign stable IDs to new files
    incoming.forEach(f => { if (!fileIdMap.has(f)) fileIdMap.set(f, String(nextFileId++)); });
    selectedFiles = selectedFiles.concat(incoming);
    renderPreviews();
    updateSelectedCount();
    openSelectedPanel();
    hideUploadLoading();
    updateActionsVisibility();
    // Hide the upload card after first successful addition
    if (selectedFiles.length > 0) {
      uploadCard && (uploadCard.style.display = 'none');
    }
    // Toast notifications
    if (incoming.length === 1) {
      toast(`Image "${incoming[0].name}" added`, 'success');
    } else {
      toast(`${incoming.length} images added`, 'success');
    }
  }

  // Dropzone interactions
  ;['dragenter','dragover'].forEach(evt => {
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('tsc-dragover');
    });
  });
  ;['dragleave','drop'].forEach(evt => {
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('tsc-dragover');
    });
  });
  dropzone.addEventListener('drop', async e => {
    const dt = e.dataTransfer;
    if (dt && dt.files) await acceptFiles(dt.files);
  });

  dropzone.addEventListener('click', (e) => {
    if (e.target && e.target.closest('#selectFilesBtn')) return; // prevent double-open
    fileInput.click();
  });
  selectBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  const addMoreBtnEl = wrapper.querySelector('#addMoreBtn');
  if (addMoreBtnEl) {
    addMoreBtnEl.addEventListener('click', () => fileInput.click());
    // cursor-follow highlight for hover animation
    addMoreBtnEl.addEventListener('pointermove', (e) => {
      const rect = addMoreBtnEl.getBoundingClientRect();
      addMoreBtnEl.style.setProperty('--x', (e.clientX - rect.left) + 'px');
      addMoreBtnEl.style.setProperty('--y', (e.clientY - rect.top) + 'px');
    });
  }
  fileInput.addEventListener('change', async e => {
    await acceptFiles(e.target.files || []);
    fileInput.value = '';
  });
  

  // Conversion logic using canvas
  async function convertFileToPNG(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Invalid image'));
      img.src = dataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    // Draw using original dimensions and high-quality interpolation
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to generate PNG');
    return blob;
  }

  async function handleConvertAll() {
    if (selectedFiles.length === 0) return;
    // Filter to only files not already converted
    const toConvert = selectedFiles.filter(f => !convertedFiles.has(f));
    if (toConvert.length === 0) {
      toast('All selected images are already converted', 'success');
      return;
    }
    progressSection.hidden = false;
    setProgress(0, toConvert.length);
    openResultsPanel();

    let done = 0;
    for (const file of toConvert) {
      try {
        const pngBlob = await convertFileToPNG(file);
        const pngName = `${file.name.replace(/\.[^/.]+$/i, '')}.png`;
        const objectUrl = appendResultsCard(pngName, pngBlob);
        converted.push({ name: pngName, blob: pngBlob, url: objectUrl });
        convertedFiles.add(file);
        // Mark in preview as converted
        const fid = fileIdMap.get(file);
        let match = fid ? previewGrid.querySelector(`.tsc-item[data-file-id="${fid}"]`) : null;
        if (!match) {
          const items = previewGrid.querySelectorAll('.tsc-item');
          match = Array.from(items).find(el => {
            const nameEl = el.querySelector('.tsc-filename');
            return nameEl && nameEl.getAttribute('title') === file.name;
          });
        }
        if (match) {
          const btn = match.querySelector('.tsc-convert-one');
          if (btn) {
            btn.disabled = true;
            btn.textContent = 'Converted';
          }
        }
      } catch (err) {
        console.error('Conversion failed for', file.name, err);
      } finally {
        done += 1;
        setProgress(done, toConvert.length);
      }
    }

    // Single consolidated notification after all are converted
    const noun = toConvert.length === 1 ? 'image' : 'images';
    toast(`All ${toConvert.length} ${noun} converted`, 'success');

    downloadZipBtn.disabled = converted.length === 0;
    updateDownloadAllVisibility();
    clearAllBtn.disabled = selectedFiles.length === 0 && converted.length === 0;
    updateSelectedCount();
  }

  // settings modal removed

  async function downloadAllAsZip() {
    if (!window.JSZip) return;
    const zip = new JSZip();
    const folder = zip.folder('converted_pngs');
    converted.forEach(item => folder.file(item.name, item.blob));
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(content);
    a.href = url;
    a.download = 'webp-to-png.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Button handlers
  convertBtn.addEventListener('click', handleConvertAll);
  downloadZipBtn.addEventListener('click', downloadAllAsZip);
  clearAllBtn.addEventListener('click', async () => {
    const ok = await openConfirmModal({
      title: 'Reset all',
      message: 'Clear all selected images and converted results?',
      confirmText: 'Reset',
      cancelText: 'Cancel'
    });
    if (!ok) return;
    clearAll();
  });

  // Enable Clear after any selection
  const observer = new MutationObserver(() => {
    clearAllBtn.disabled = selectedFiles.length === 0 && converted.length === 0;
  });
  observer.observe(previewGrid, { childList: true, subtree: false });

  // Init
  updateSelectedCount();
  resetProgress();
  updateActionsVisibility();
  updateDownloadAllVisibility();
})();