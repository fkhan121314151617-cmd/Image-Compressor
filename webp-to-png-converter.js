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

  // Settings modal
  const settingsOverlay = wrapper.querySelector('#tscSettingsModal');
  const settingsTitle = settingsOverlay ? settingsOverlay.querySelector('#tscSettingsTitle') : null;
  const settingsInput = settingsOverlay ? settingsOverlay.querySelector('.tsc-setting-name') : null;
  const settingsCancel = settingsOverlay ? settingsOverlay.querySelector('.tsc-settings-cancel') : null;
  const settingsSave = settingsOverlay ? settingsOverlay.querySelector('.tsc-settings-save') : null;

  const progressSection = wrapper.querySelector('#progressSection');
  const progressBar = wrapper.querySelector('#progressBar');
  const progressText = wrapper.querySelector('#progressText');
  const uploadCard = wrapper.querySelector('#uploadCard');
  const toasts = wrapper.querySelector('#tscToasts');
  const addMethodSelect = wrapper.querySelector('#addMethodSelect');
  const urlInputRow = wrapper.querySelector('#urlInputRow');
  const addUrlInput = wrapper.querySelector('#addUrlInput');
  const addUrlBtn = wrapper.querySelector('#addUrlBtn');

  // State
  /** @type {File[]} */
  let selectedFiles = [];
  /** @type {{name:string, blob:Blob, url:string}[]} */
  let converted = [];
  /** @type {Map<File, {outputName?: string}>} */
  const perImageSettings = new Map();

  // Helpers
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function updateSelectedCount() {
    selectedCountEl.textContent = `${selectedFiles.length} selected`;
    convertBtn.disabled = selectedFiles.length === 0;
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
          <button type="button" class="tsc-btn tsc-btn-ghost tsc-btn-sm tsc-settings" title="Image settings">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10.325 4.317a1 1 0 01.965-.317l.66.132a1 1 0 00.99-.39l.396-.528a1 1 0 011.62 0l.396.528a1 1 0 00.99.39l.66-.132a1 1 0 011.192.99v.792a1 1 0 00.436.82l.528.352a1 1 0 010 1.64l-.528.352a1 1 0 00-.436.82v.792a1 1 0 01-1.192.99l-.66-.132a1 1 0 00-.99.39l-.396.528a1 1 0 01-1.62 0l-.396-.528a1 1 0 00-.99-.39l-.66.132a1 1 0 01-1.192-.99v-.792a1 1 0 00-.436-.82l-.528-.352a1 1 0 010-1.64l.528-.352a1 1 0 00.436-.82v-.792a1 1 0 01.227-.673z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.2"/></svg>
          </button>
          <button type="button" class="tsc-remove" aria-label="Remove">✕</button>
        </div>
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
      convertOneBtn.addEventListener('click', async () => {
        const originalText = convertOneBtn.textContent;
        convertOneBtn.disabled = true;
        convertOneBtn.textContent = 'Converting...';
        convertOneBtn.classList.add('is-loading');
        try {
          const pngBlob = await convertFileToPNG(file);
          const custom = perImageSettings.get(file);
          const pngName = (custom && custom.outputName) ? custom.outputName : `${file.name.replace(/\.[^/.]+$/i, '')}.png`;
          const objectUrl = appendResultsCard(pngName, pngBlob);
          converted.push({ name: pngName, blob: pngBlob, url: objectUrl });
          downloadZipBtn.disabled = converted.length === 0;
          openResultsPanel();
          convertOneBtn.textContent = 'Converted';
          toast(`Image "${file.name}" converted`, 'success');
        } catch (err) {
          console.error('Conversion failed for', file.name, err);
          convertOneBtn.disabled = false;
          convertOneBtn.textContent = originalText;
          toast(`Failed to convert "${file.name}"`, 'error');
        } finally {
          convertOneBtn.classList.remove('is-loading');
        }
      });

      // Open settings modal for this item
      const settingsBtn = item.querySelector('.tsc-settings');
      if (settingsBtn && settingsOverlay) {
        settingsBtn.addEventListener('click', () => {
          const current = perImageSettings.get(file);
          settingsInput.value = current && current.outputName ? current.outputName : `${file.name.replace(/\.[^/.]+$/i, '')}.png`;
          openSettingsModal(file);
        });
      }

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
        <span class="tsc-filesize">${formatBytes(blob.size)}</span>
      </div>
    `;
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

  function clearAll() {
    // Revoke preview object URLs
    const imgs = previewGrid.querySelectorAll('img');
    imgs.forEach(img => URL.revokeObjectURL(img.src));

    // Revoke result object URLs and clear
    const resultImgs = resultsGrid.querySelectorAll('img');
    resultImgs.forEach(img => URL.revokeObjectURL(img.src));

    selectedFiles = [];
    converted = [];
    previewGrid.innerHTML = '';
    resultsGrid.innerHTML = '';
    updateSelectedCount();
    convertBtn.disabled = true;
    downloadZipBtn.disabled = true;
    clearAllBtn.disabled = true;
    resetProgress();
    closeSelectedPanel();
    closeResultsPanel();
    updateActionsVisibility();
    showUploadCard();
  }

  // File handling
  async function acceptFiles(files) {
    const incoming = Array.from(files).filter(f => /\.webp$/i.test(f.name) || f.type === 'image/webp');
    if (incoming.length === 0) return;
    showUploadLoading();
    // small delay to allow overlay to paint
    await new Promise(r => setTimeout(r, 50));
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
    if (!addMethodSelect || addMethodSelect.value === 'upload') {
      fileInput.click();
    }
  });
  selectBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  const addMoreBtnEl = wrapper.querySelector('#addMoreBtn');
  if (addMoreBtnEl) {
    addMoreBtnEl.addEventListener('click', () => {
      if (!addMethodSelect || addMethodSelect.value === 'upload') {
        fileInput.click();
      } else {
        addUrlInput && addUrlInput.focus();
      }
    });
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

  // Add by URL support
  async function acceptUrl(url) {
    try {
      const u = (url || '').trim();
      if (!u) { toast('Please enter an image URL', 'error'); return; }
      if (!/\.webp($|\?)/i.test(u)) { toast('URL must point to a .webp image', 'error'); return; }
      const res = await fetch(u, { mode: 'cors' });
      if (!res.ok) throw new Error('Network error');
      const contentType = res.headers.get('content-type') || '';
      if (!/image\/webp/i.test(contentType)) { toast('URL is not a WebP image', 'error'); return; }
      const blob = await res.blob();
      const nameGuess = u.split('/').pop().split('?')[0] || 'image.webp';
      const file = new File([blob], nameGuess, { type: 'image/webp' });
      await acceptFiles([file]);
      addUrlInput && (addUrlInput.value = '');
    } catch (err) {
      console.error('Add by URL failed', err);
      toast('Failed to fetch image from URL', 'error');
    }
  }
  if (addUrlBtn) addUrlBtn.addEventListener('click', () => acceptUrl(addUrlInput && addUrlInput.value));
  if (addUrlInput) addUrlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); acceptUrl(addUrlInput.value); } });

  // Method switching
  if (addMethodSelect) {
    addMethodSelect.addEventListener('change', () => {
      const useUrl = addMethodSelect.value === 'url';
      if (useUrl) {
        urlInputRow && urlInputRow.classList.remove('is-hidden');
      } else {
        urlInputRow && urlInputRow.classList.add('is-hidden');
      }
    });
  }

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
    progressSection.hidden = false;
    setProgress(0, selectedFiles.length);
    openResultsPanel();

    // Clean previous results
    const prevImgs = resultsGrid.querySelectorAll('img');
    prevImgs.forEach(img => URL.revokeObjectURL(img.src));
    resultsGrid.innerHTML = '';
    converted = [];

    let done = 0;
    for (const file of selectedFiles) {
      try {
        const pngBlob = await convertFileToPNG(file);
        const custom = perImageSettings.get(file);
        const pngName = (custom && custom.outputName) ? custom.outputName : `${file.name.replace(/\.[^/.]+$/i, '')}.png`;
        const objectUrl = appendResultsCard(pngName, pngBlob);
        converted.push({ name: pngName, blob: pngBlob, url: objectUrl });
        // Mark in preview as converted
        const items = previewGrid.querySelectorAll('.tsc-item');
        const match = Array.from(items).find(el => {
          const nameEl = el.querySelector('.tsc-filename');
          return nameEl && nameEl.getAttribute('title') === file.name;
        });
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
        setProgress(done, selectedFiles.length);
      }
    }

    // Single consolidated notification after all are converted
    if (selectedFiles.length > 0) {
      const noun = selectedFiles.length === 1 ? 'image' : 'images';
      toast(`All ${selectedFiles.length} ${noun} converted`, 'success');
    }

    downloadZipBtn.disabled = converted.length === 0;
    clearAllBtn.disabled = selectedFiles.length === 0 && converted.length === 0;
  }

  // Settings modal behavior
  function openSettingsModal(forFile) {
    if (!settingsOverlay) return;
    settingsOverlay.hidden = false;
    settingsOverlay.classList.add('is-visible');

    function onOverlay(e) { if (e.target === settingsOverlay) close(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      settingsOverlay.classList.remove('is-visible');
      settingsOverlay.hidden = true;
      settingsOverlay.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
      settingsCancel && settingsCancel.removeEventListener('click', onCancel);
      settingsSave && settingsSave.removeEventListener('click', onSave);
    }
    function onCancel() { close(); }
    function onSave() {
      const value = (settingsInput.value || '').trim();
      if (!/\.png$/i.test(value)) {
        toast('Please use a .png filename', 'error');
        return;
      }
      perImageSettings.set(forFile, { outputName: value });
      close();
      toast('Settings saved for this image', 'success');
    }

    settingsOverlay.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);
    settingsCancel && settingsCancel.addEventListener('click', onCancel);
    settingsSave && settingsSave.addEventListener('click', onSave);
  }

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
})();