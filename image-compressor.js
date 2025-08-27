// Perfect WordPress-Compatible Image Compressor JavaScript - Use with WP Code Inserter
// This version maintains EXACTLY the same functionality, drag divider, and all features as our original files

(function() {
  'use strict';
  
  // Wait for DOM to be ready
  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else if (document.addEventListener) {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      document.attachEvent('onreadystatechange', function() {
        if (document.readyState !== 'loading') {
          fn();
        }
      });
    }
  }

  ready(function() {
    // Check if our container exists
    const container = document.querySelector('.wp-container');
    if (!container) {
      return;
    }

    // Get all elements with WordPress-safe IDs
    const iconAdd = document.getElementById('wp-icon-add');
    const deleteAllBtn = document.getElementById('wp-icon-delete-all');
    const downloadAllBtn = document.getElementById('wp-download-all');
    const filterButton = document.getElementById('wp-icon-filter');
    const filterMenu = document.getElementById('wp-filter-menu');
    const resetToolBtn = document.getElementById('wp-reset-tool');

    const fileInput = document.getElementById('wp-file-input');
    const imageListEl = document.getElementById('wp-image-list');
    const emptyState = document.getElementById('wp-empty-state');
    const template = document.getElementById('wp-image-card-template');

    const baseImg = document.getElementById('wp-base-img');
    const overlayImg = document.getElementById('wp-overlay-img');
    const originalMeta = document.getElementById('wp-original-meta');
    const compressedMeta = document.getElementById('wp-compressed-meta');
    const statsEl = document.getElementById('wp-stats');

    const qualityRange = document.getElementById('wp-quality-range');
    const qualityValueInput = document.getElementById('wp-quality-value');

    const maxSizeInput = document.getElementById('wp-max-size');
    const applyMaxBtn = document.getElementById('wp-apply-max');
    const uploadCountEl = document.getElementById('wp-upload-count');
    const uploadCountBottomEl = document.getElementById('wp-upload-count-bottom');
    const bottomDownloadAllBtn = document.getElementById('wp-bottom-download-all');
    const bottomDeleteAllBtn = document.getElementById('wp-bottom-delete-all');

    const reloadModal = document.getElementById('wp-reload-modal');
    const cancelReloadBtn = document.getElementById('wp-cancel-reload');
    const confirmReloadBtn = document.getElementById('wp-confirm-reload');

    const confirmModal = document.getElementById('wp-confirm-modal');
    const cancelDelete = document.getElementById('wp-cancel-delete');
    const confirmDelete = document.getElementById('wp-confirm-delete');
    const confirmTitle = confirmModal ? confirmModal.querySelector('h3') : null;
    const confirmMessage = confirmModal ? confirmModal.querySelector('p') : null;

    const dragDivider = document.getElementById('wp-drag-divider');
    const handle = dragDivider ? dragDivider.querySelector('.wp-handle') : null;
    const compareViewport = document.getElementById('wp-compare-viewport');
    const uploadFrame = document.getElementById('wp-upload-frame');
    const processingEl = document.getElementById('wp-processing');
    const processingText = document.getElementById('wp-processing-text');

    if (!iconAdd || !imageListEl || !template) {
      return;
    }

    /** State */
    const images = [];
    let selectedId = null;
    let pendingDeleteAll = false;
    let pendingDeleteId = null;
    let pendingReset = false;

    let sharedCanvas = document.createElement('canvas');
    let sharedCtx = sharedCanvas.getContext('2d');
    
    function prepareCanvas(width, height) {
      if (sharedCanvas.width !== width) sharedCanvas.width = width;
      if (sharedCanvas.height !== height) sharedCanvas.height = height;
      sharedCtx.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);
    }

    function generateId() { 
      return Math.random().toString(36).slice(2) + Date.now().toString(36); 
    }
    
    function formatBytes(bytes) { 
      if (bytes < 1024) return `${bytes} B`; 
      const kb = bytes / 1024; 
      if (kb < 1024) return `${kb.toFixed(1)} KB`; 
      const mb = kb / 1024; 
      return `${mb.toFixed(2)} MB`; 
    }
    
    function computeReduction(originalBytes, compressedBytes) { 
      if (!originalBytes || !compressedBytes) return '—'; 
      const reduction = (1 - compressedBytes / originalBytes) * 100; 
      return `${reduction.toFixed(1)}% smaller`; 
    }

    function toast(message) { 
      const existingToasts = document.querySelectorAll('.wp-toast');
      existingToasts.forEach(toast => toast.remove());
      const div = document.createElement('div'); 
      div.className = 'wp-toast';
      div.textContent = message; 
      div.style.position = 'fixed'; 
      div.style.left = '50%'; 
      div.style.bottom = '24px'; 
      div.style.transform = 'translateX(-50%)'; 
      div.style.background = 'linear-gradient(90deg, #6300E2, #8E43F0)'; 
      div.style.color = '#fff'; 
      div.style.padding = '10px 14px'; 
      div.style.borderRadius = '12px'; 
      div.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; 
      div.style.zIndex = '99999'; 
      div.style.fontFamily = 'inherit';
      div.style.fontSize = '14px';
      div.style.fontWeight = '600';
      div.style.whiteSpace = 'nowrap';
      div.style.minWidth = '200px';
      div.style.textAlign = 'center';
      div.style.pointerEvents = 'none';
      document.body.appendChild(div); 
      setTimeout(() => { if (div.parentNode) div.remove(); }, 3000);
    }

    // Load JSZip for Download All
    let jszipPromise = null;
    function ensureJSZipLoaded() {
      if (window.JSZip) return Promise.resolve(window.JSZip);
      if (jszipPromise) return jszipPromise;
      jszipPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
        script.async = true;
        script.onload = () => resolve(window.JSZip);
        script.onerror = reject;
        document.head.appendChild(script);
      });
      return jszipPromise;
    }

    async function zipAndDownload(imagesToZip) {
      try {
        const JSZip = await ensureJSZipLoaded();
        const zip = new JSZip();
        for (const item of imagesToZip) {
          const name = item.name.replace(/(\.[^.]+)$/, '-compressed$1');
          const arrayBuffer = await item.cachedCompressed.blob.arrayBuffer();
          zip.file(name, arrayBuffer);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = 'compressed-images.zip';
        link.click();
        URL.revokeObjectURL(link.href);
        toast('Downloaded compressed images ZIP');
      } catch (e) {
        console.error('ZIP creation failed, falling back to individual downloads:', e);
        await downloadImages(imagesToZip, 'Downloading images...');
      }
    }

    function setEmptyState() { 
      const has = images.length > 0; 
      const hasAtLeastTwo = images.length >= 2;
      if (emptyState) emptyState.style.display = has ? 'none' : ''; 
      if (uploadCountEl) {
        uploadCountEl.textContent = `Images: ${images.length}`;
        uploadCountEl.style.display = hasAtLeastTwo ? '' : 'none';
      }
      if (uploadCountBottomEl) {
        uploadCountBottomEl.textContent = `Images: ${images.length}`;
        uploadCountBottomEl.style.display = hasAtLeastTwo ? '' : 'none';
      }
      if (deleteAllBtn) {
        deleteAllBtn.disabled = !has; 
        deleteAllBtn.style.display = hasAtLeastTwo ? '' : 'none';
      }
      if (bottomDeleteAllBtn) {
        bottomDeleteAllBtn.disabled = !has;
        bottomDeleteAllBtn.style.display = hasAtLeastTwo ? '' : 'none';
      }
      if (downloadAllBtn) {
        downloadAllBtn.disabled = !hasAtLeastTwo; 
        downloadAllBtn.style.display = hasAtLeastTwo ? '' : 'none';
      }
      if (bottomDownloadAllBtn) {
        bottomDownloadAllBtn.disabled = !hasAtLeastTwo;
        bottomDownloadAllBtn.style.display = hasAtLeastTwo ? '' : 'none';
      }
      const compressAllBtn = document.getElementById('wp-compress-all');
      if (compressAllBtn) {
        compressAllBtn.disabled = !hasAtLeastTwo;
        compressAllBtn.style.display = hasAtLeastTwo ? '' : 'none';
      }
      if (filterButton) {
        filterButton.style.display = hasAtLeastTwo ? '' : 'none';
      }
    }

    function toggleFrame(showFrame) { 
      if (uploadFrame) uploadFrame.style.display = showFrame ? '' : 'none'; 
      if (compareViewport) compareViewport.style.display = showFrame ? 'none' : ''; 
    }

    function clearPreview() { 
      if (baseImg) baseImg.src = ''; 
      if (overlayImg) overlayImg.src = ''; 
      if (originalMeta) originalMeta.textContent = '—'; 
      if (compressedMeta) compressedMeta.textContent = '—'; 
      if (statsEl) statsEl.textContent = '—'; 
      toggleFrame(true); 
    }

    function getSelected() { 
      return images.find(i => i.id === selectedId); 
    }

    function showProcessing(message) {
      if (processingEl && processingText) {
        processingText.textContent = message || 'Processing...';
        processingEl.style.display = 'flex';
      }
    }

    function hideProcessing() {
      if (processingEl) {
        processingEl.style.display = 'none';
      }
    }

    async function compressBitmapToMime(bitmap, qualityPercent, mime) {
      prepareCanvas(bitmap.width, bitmap.height);
      sharedCtx.drawImage(bitmap, 0, 0);
      const q = mime === 'image/jpeg' ? Math.min(Math.max(qualityPercent / 100, 0.01), 1) : 1;
      const blob = await new Promise(resolve => sharedCanvas.toBlob(resolve, mime, q));
      return blob;
    }

    async function compressFile(file, qualityPercent) {
      const bitmap = await createImageBitmap(file);
      try {
        const isPng = file.type.includes('png');
        if (qualityPercent >= 100) {
          if (isPng) {
            const pngBlob = await compressBitmapToMime(bitmap, 100, 'image/png');
            if (pngBlob && pngBlob.size < file.size) return pngBlob;
          }
          const jpegBlob = await compressBitmapToMime(bitmap, 100, 'image/jpeg');
          if (jpegBlob && jpegBlob.size < file.size) return jpegBlob;
          return file;
        } else {
          const mimeType = isPng && qualityPercent < 100 ? 'image/jpeg' : (isPng ? 'image/png' : 'image/jpeg');
          const blob = await compressBitmapToMime(bitmap, qualityPercent, mimeType);
          return blob || file;
        }
      } finally { 
        try { bitmap.close && bitmap.close(); } catch {}
      }
    }

    async function ensureCompressed(item, quality) {
      if (item.cachedCompressed && item.cachedCompressed.quality === quality) return item.cachedCompressed;
      showProcessing('Compressing image...');
      const trial = await compressFile(item.file, quality);
      hideProcessing();
      const resultBlob = trial || item.file;
      if (item.cachedCompressed && item.cachedCompressed.url) URL.revokeObjectURL(item.cachedCompressed.url);
      const url = URL.createObjectURL(resultBlob);
      item.cachedCompressed = { quality, blob: resultBlob, url };
      updateImageCardStatus(item);
      return item.cachedCompressed;
    }

    function updateStats(item, compressedBlob) { 
      if (compressedMeta) compressedMeta.textContent = `${item.name.replace(/(\.[^.]+)$/,'-compressed$1')} • ${formatBytes(compressedBlob.size)}`; 
      if (statsEl) statsEl.textContent = `${computeReduction(item.originalBytes, compressedBlob.size)} • Original: ${formatBytes(item.originalBytes)} → Compressed: ${formatBytes(compressedBlob.size)}`; 
    }

    function updateImageCardStatus(item) {
      const card = document.querySelector(`[data-id="${item.id}"]`);
      if (!card) return;
      card.classList.remove('compressed', 'uncompressed');
      card.style.borderColor = '';
      card.style.boxShadow = '';
      const status = (item.cachedCompressed && item.cachedCompressed.blob) ? 'compressed' : 'uncompressed';
      if (status === 'compressed') {
        card.classList.add('compressed');
        card.style.borderColor = 'var(--primary)';
        card.style.boxShadow = '0 0 0 1px var(--primary)';
      } else {
        card.classList.add('uncompressed');
        card.style.borderColor = '#ff6b6b';
        card.style.boxShadow = '0 0 0 1px #ff6b6b';
      }
      const sizeElement = card.querySelector('.wp-size');
      if (sizeElement) {
        if (status === 'compressed' && item.cachedCompressed && item.cachedCompressed.blob) {
          const originalSize = formatBytes(item.originalBytes);
          const compressedSize = formatBytes(item.cachedCompressed.blob.size);
          const reduction = Math.round(((item.originalBytes - item.cachedCompressed.blob.size) / item.originalBytes) * 100);
          sizeElement.textContent = `${originalSize} → ${compressedSize} (${reduction}% smaller)`;
        } else {
          sizeElement.textContent = formatBytes(item.originalBytes);
        }
      }
    }

    function syncQualityInputs(val) { 
      const v = Math.max(1, Math.min(100, parseInt(val || '50', 10))); 
      if (qualityRange) qualityRange.value = String(v); 
      if (qualityValueInput) qualityValueInput.value = String(v); 
      const percentageEl = document.getElementById('wp-quality-percentage');
      if (percentageEl) percentageEl.textContent = v + '%';
      const current = getSelected(); 
      if (current) ensureCompressed(current, v).then(c => { 
        if (overlayImg) overlayImg.src = c.url; 
        updateStats(current, c.blob); 
      }); 
    }

    function renderList() {
      if (!imageListEl) return;
      imageListEl.innerHTML = '';
      if (images.length === 0) { setEmptyState(); return; }
      images.forEach(item => {
        const template = document.getElementById('wp-image-card-template');
        if (!template) return;
        const card = template.content.cloneNode(true);
        const cardEl = card.querySelector('.wp-image-card');
        if (!cardEl) return;
        cardEl.dataset.id = item.id;
        const thumb = cardEl.querySelector('.wp-thumb');
        if (thumb) thumb.src = item.url;
        const name = cardEl.querySelector('.wp-name');
        if (name) name.textContent = item.name;
        const size = cardEl.querySelector('.wp-size');
        if (size) size.textContent = formatBytes(item.originalBytes);
        const status = (item.cachedCompressed && item.cachedCompressed.blob) ? 'compressed' : 'uncompressed';
        if (status === 'compressed') {
          cardEl.classList.add('compressed');
          cardEl.style.borderColor = 'var(--primary)';
          cardEl.style.boxShadow = '0 0 0 1px var(--primary)';
        } else {
          cardEl.classList.add('uncompressed');
          cardEl.style.borderColor = '#ff6b6b';
          cardEl.style.boxShadow = '0 0 0 1px #ff6b6b';
        }
        if (item.id === selectedId) cardEl.classList.add('selected');
        cardEl.addEventListener('click', () => { selectImage(item.id); });
        const remove = cardEl.querySelector('.wp-remove');
        if (remove) {
          remove.addEventListener('click', (e) => {
            e.stopPropagation();
            pendingDeleteAll = false;
            pendingDeleteId = item.id;
            if (confirmTitle) confirmTitle.textContent = 'Delete this image?';
            if (confirmMessage) confirmMessage.textContent = 'This will remove only the selected image.';
            if (confirmDelete) confirmDelete.textContent = 'Delete';
            if (confirmModal) confirmModal.showModal();
          });
        }
        imageListEl.appendChild(card);
      });
      setEmptyState();
    }

    async function selectImage(id) { 
      selectedId = id; 
      const item = getSelected(); 
      if (!item) return; 
      if (baseImg) baseImg.src = item.url; 
      if (originalMeta) originalMeta.textContent = `${item.name} • ${formatBytes(item.originalBytes)}`; 
      toggleFrame(false); 
      const quality = qualityRange ? parseInt(qualityRange.value, 10) : 50; 
      const c = await ensureCompressed(item, quality); 
      if (overlayImg) overlayImg.src = c.url; 
      updateStats(item, c.blob); 
      if (imageListEl) {
        imageListEl.querySelectorAll('.wp-image-card').forEach(card => { 
          card.classList.toggle('selected', card.dataset.id === id); 
        }); 
      }
      updateImageCardStatus(item);
    }

    async function updatePreview() {
      const item = getSelected();
      if (!item) return;
      if (!qualityRange) return;
      const quality = parseInt(qualityRange.value);
      const compressed = await ensureCompressed(item, quality);
      if (overlayImg) overlayImg.src = compressed.url;
      updateStats(item, compressed.blob);
      updateImageCardStatus(item);
    }

    // Event Listeners
    if (iconAdd) iconAdd.addEventListener('click', () => { if (fileInput) fileInput.click(); });

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        showProcessing('Uploading...');
        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          const id = generateId();
          const url = URL.createObjectURL(file);
          images.push({ id, file, url, originalBytes: file.size, name: file.name, type: file.type });
        }
        hideProcessing();
        setEmptyAndRender();
        fileInput.value = '';
        toast(`Uploaded ${files.length} image${files.length > 1 ? 's' : ''}`);
      });
    }

    if (deleteAllBtn) {
      deleteAllBtn.addEventListener('click', () => {
        pendingDeleteAll = true;
        if (confirmTitle) confirmTitle.textContent = 'Delete all images?';
        if (confirmMessage) confirmMessage.textContent = 'This action will remove all uploaded images.';
        if (confirmDelete) confirmDelete.textContent = 'Delete';
        if (confirmModal) confirmModal.showModal();
      });
    }

    async function onDownloadAllClick() {
      if (images.length < 2) { toast('Add at least 2 images to use Download All'); return; }
      const uncompressedImages = images.filter(i => !i.cachedCompressed || !i.cachedCompressed.blob);
      if (uncompressedImages.length) {
        const message = `Found ${uncompressedImages.length} uncompressed image(s). Compress now?`;
        const choice = confirm(`${message}\n\nClick OK to compress all now, or Cancel to proceed with already compressed ones.`);
        if (choice) await compressAllImages(parseInt(qualityRange.value));
      }
      const readyImages = images.filter(i => i.cachedCompressed && i.cachedCompressed.blob);
      if (readyImages.length === 0) { toast('No compressed images to download'); return; }
      showProcessing('Preparing ZIP...');
      await zipAndDownload(readyImages);
      hideProcessing();
    }

    if (downloadAllBtn) downloadAllBtn.addEventListener('click', onDownloadAllClick);
    if (bottomDownloadAllBtn) bottomDownloadAllBtn.addEventListener('click', onDownloadAllClick);
    if (bottomDeleteAllBtn) {
      bottomDeleteAllBtn.addEventListener('click', () => {
        if (deleteAllBtn && getComputedStyle(deleteAllBtn).display !== 'none') { deleteAllBtn.click(); return; }
        pendingDeleteAll = true;
        if (confirmTitle) confirmTitle.textContent = 'Delete all images?';
        if (confirmMessage) confirmMessage.textContent = 'This action will remove all uploaded images.';
        if (confirmDelete) confirmDelete.textContent = 'Delete';
        if (confirmModal) confirmModal.showModal();
      });
    }

    if (filterButton && filterMenu) {
      filterButton.addEventListener('click', () => {
        const expanded = filterButton.getAttribute('aria-expanded') === 'true';
        filterButton.setAttribute('aria-expanded', !expanded);
        if (expanded) {
          filterMenu.classList.remove('show');
          filterMenu.style.position = '';
          filterMenu.style.top = '';
          filterMenu.style.left = '';
          filterMenu.style.right = '';
          filterMenu.style.bottom = '';
          filterMenu.style.maxHeight = '';
          filterMenu.style.overflow = '';
        } else {
          filterMenu.classList.add('show');
          const btnRect = filterButton.getBoundingClientRect();
          filterMenu.style.position = 'fixed';
          filterMenu.style.top = Math.round(btnRect.bottom + 6) + 'px';
          filterMenu.style.left = Math.round(btnRect.left) + 'px';
          filterMenu.style.right = 'auto';
          filterMenu.style.bottom = 'auto';
          filterMenu.style.maxHeight = 'none';
          filterMenu.style.overflow = 'visible';
        }
      });
      document.addEventListener('click', (e) => {
        if (!filterButton.contains(e.target) && !filterMenu.contains(e.target)) {
          filterMenu.classList.remove('show');
          filterButton.setAttribute('aria-expanded', 'false');
        }
      });
    }

    if (filterMenu) {
      filterMenu.addEventListener('click', (e) => {
        if (!e.target.matches('.wp-menu-item')) return;
        const sort = e.target.dataset.sort;
        filterMenu.classList.remove('show');
        filterButton.setAttribute('aria-expanded', 'false');
        if (sort === 'az') images.sort((a, b) => a.name.localeCompare(b.name));
        else if (sort === 'za') images.sort((a, b) => b.name.localeCompare(a.name));
        else if (sort === 'big') images.sort((a, b) => b.originalBytes - a.originalBytes);
        else if (sort === 'small') images.sort((a, b) => a.originalBytes - b.originalBytes);
        renderList();
        if (selectedId) {
          const selectedCard = imageListEl.querySelector(`[data-id="${selectedId}"]`);
          if (selectedCard) selectedCard.classList.add('selected');
        }
        toast(`Sorted by ${e.target.textContent}`);
      });
    }

    if (resetToolBtn) {
      resetToolBtn.addEventListener('click', () => {
        if (images.length === 0) { toast('Tool is already reset'); return; }
        pendingReset = true;
        if (confirmTitle) confirmTitle.textContent = 'Reset The Tool?';
        if (confirmMessage) confirmMessage.textContent = 'This action will remove all images & reset the Tool.';
        if (confirmDelete) confirmDelete.textContent = 'Reset';
        if (confirmModal) confirmModal.showModal();
      });
    }

    const compressAllBtn = document.getElementById('wp-compress-all');
    if (compressAllBtn) {
      compressAllBtn.addEventListener('click', () => {
        if (images.length < 2) { toast('Add at least 2 images to compress all'); return; }
        const compressModal = document.getElementById('wp-compress-all-modal');
        if (compressModal) compressModal.showModal();
      });
    }

    const compressModal = document.getElementById('wp-compress-all-modal');
    const compressQualityRange = document.getElementById('wp-compress-quality-range');
    const compressQualityValue = document.getElementById('wp-compress-quality-value');
    const compressQualityPercentage = document.getElementById('wp-compress-quality-percentage');
    const cancelCompressBtn = document.getElementById('wp-cancel-compress');
    const confirmCompressBtn = document.getElementById('wp-confirm-compress');

    if (compressModal && compressQualityRange && compressQualityValue && compressQualityPercentage) {
      compressQualityRange.addEventListener('input', (e) => {
        const value = e.target.value;
        compressQualityValue.value = value;
        compressQualityPercentage.textContent = value + '%';
      });
      compressQualityValue.addEventListener('input', () => {
        if (!compressQualityValue.value) return;
        const value = compressQualityValue.value;
        compressQualityRange.value = value;
        compressQualityPercentage.textContent = value + '%';
      });
      if (cancelCompressBtn) cancelCompressBtn.addEventListener('click', () => { compressModal.close(); });
      if (confirmCompressBtn) {
        confirmCompressBtn.addEventListener('click', async () => {
          const quality = parseInt(compressQualityRange.value);
          compressModal.close();
          if (qualityRange) qualityRange.value = String(quality);
          if (qualityValueInput) qualityValueInput.value = String(quality);
          const percentageEl = document.getElementById('wp-quality-percentage');
          if (percentageEl) percentageEl.textContent = quality + '%';
          await compressAllImages(quality);
          const current = getSelected();
          if (current) {
            const c = await ensureCompressed(current, quality);
            if (overlayImg) overlayImg.src = c.url;
            updateStats(current, c.blob);
          }
        });
      }
    }

    if (qualityRange) qualityRange.addEventListener('input', (e) => { const value = e.target.value; syncQualityInputs(value); updatePreview(); });
    if (qualityValueInput) qualityValueInput.addEventListener('input', () => { if (!qualityValueInput.value) return; const value = qualityValueInput.value; syncQualityInputs(value); updatePreview(); });

    if (applyMaxBtn && maxSizeInput) {
      applyMaxBtn.addEventListener('click', async () => {
        const sanitized = (maxSizeInput.value || '').toString().replace(/[^0-9]/g, '');
        maxSizeInput.value = sanitized;
        const maxSize = parseInt(sanitized, 10);
        if (isNaN(maxSize) || maxSize < 1) { toast('Enter valid KB'); return; }
        const item = getSelected();
        if (!item) { toast('Select an image'); return; }
        const targetBytes = Math.round(maxSize * 1024);
        if (targetBytes >= item.file.size) {
          if (item.cachedCompressed && item.cachedCompressed.url) URL.revokeObjectURL(item.cachedCompressed.url);
          const url = item.url;
          item.cachedCompressed = { quality: 100, blob: item.file, url };
          if (overlayImg) overlayImg.src = url;
          if (qualityRange) qualityRange.value = '100';
          if (qualityValueInput) qualityValueInput.value = '100';
          updateStats(item, item.file);
          toast('Optimized');
          return;
        }
        showProcessing('Optimizing...');
        try {
          const tolerance = Math.max(1024, Math.round(targetBytes * 0.02));
          const bitmap = await createImageBitmap(item.file);
          async function searchForTarget(mime, bmp = bitmap) {
            let low = 1, high = 100;
            let bestBelow = null, bestAbove = null;
            for (let i = 0; i < 12; i++) {
              const mid = Math.round((low + high) / 2);
              const blob = await compressBitmapToMime(bmp, mid, mime);
              const diff = Math.abs(blob.size - targetBytes);
              if (diff <= tolerance) return { q: mid, blob };
              if (blob.size <= targetBytes) { if (!bestBelow || blob.size > bestBelow.blob.size) bestBelow = { q: mid, blob }; high = mid - 1; }
              else { if (!bestAbove || blob.size < bestAbove.blob.size) bestAbove = { q: mid, blob }; low = mid + 1; }
              await new Promise(r => setTimeout(r, 0));
            }
            return bestBelow || bestAbove;
          }
          const originalMime = item.file.type.includes('png') ? 'image/png' : 'image/jpeg';
          let chosen = await searchForTarget(originalMime);
          if (chosen && chosen.blob.size > targetBytes && originalMime === 'image/png') {
            const jpegTry = await searchForTarget('image/jpeg');
            if (jpegTry && (!chosen || jpegTry.blob.size < chosen.blob.size)) chosen = jpegTry;
          }
          if (!chosen || chosen.blob.size > targetBytes) {
            let scale = 0.9;
            let best = chosen || null;
            const originalWidth = bitmap.width;
            const originalHeight = bitmap.height;
            while (scale >= 0.4) {
              prepareCanvas(Math.max(1, Math.round(originalWidth * scale)), Math.max(1, Math.round(originalHeight * scale)));
              sharedCtx.drawImage(bitmap, 0, 0, sharedCanvas.width, sharedCanvas.height);
              const downBlob = await new Promise(resolve => sharedCanvas.toBlob(resolve, 'image/jpeg', 0.92));
              if (downBlob) {
                const downBitmap = await createImageBitmap(downBlob);
                let downChosen = await searchForTarget('image/jpeg', downBitmap);
                downBitmap.close();
                if (downChosen && downChosen.blob.size <= targetBytes) { best = downChosen; break; }
                if (!best || (downChosen && downChosen.blob.size < best.blob.size)) { best = downChosen || best; }
              }
              scale -= 0.1;
              await new Promise(r => setTimeout(r, 0));
            }
            if (best) { chosen = best; }
          }
          if (chosen) {
            const url = URL.createObjectURL(chosen.blob);
            if (item.cachedCompressed && item.cachedCompressed.url) URL.revokeObjectURL(item.cachedCompressed.url);
            item.cachedCompressed = { quality: chosen.q ?? 100, blob: chosen.blob, url };
            if (overlayImg) overlayImg.src = url;
            if (qualityRange && chosen.q) qualityRange.value = String(chosen.q);
            if (qualityValueInput && chosen.q) qualityValueInput.value = String(chosen.q);
            updateStats(item, chosen.blob);
            updateImageCardStatus(item);
            toast(chosen.blob.size <= targetBytes ? 'Optimized' : 'Optimized (closest possible)');
          } else {
            toast('Could not meet target size');
          }
          bitmap.close();
        } catch (err) {
          console.error('Optimization error:', err);
          toast('Optimization failed');
        }
        hideProcessing();
      });
      maxSizeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyMaxBtn.click(); } });
    }

    if (confirmModal) confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) confirmModal.close(); });
    if (cancelDelete) cancelDelete.addEventListener('click', () => { if (confirmModal) confirmModal.close(); pendingDeleteAll = false; pendingDeleteId = null; pendingReset = false; });

    if (confirmDelete) {
      confirmDelete.addEventListener('click', () => {
        if (pendingDeleteAll) {
          images.forEach(item => { URL.revokeObjectURL(item.url); if (item.cachedCompressed) URL.revokeObjectURL(item.cachedCompressed.url); });
          images.length = 0; selectedId = null; renderList(); setEmptyState(); clearPreview(); toast('All images deleted');
        } else if (pendingDeleteId) {
          const index = images.findIndex(item => item.id === pendingDeleteId);
          if (index > -1) {
            const item = images[index];
            URL.revokeObjectURL(item.url);
            if (item.cachedCompressed) URL.revokeObjectURL(item.cachedCompressed.url);
            images.splice(index, 1);
            if (selectedId === pendingDeleteId) { selectedId = null; clearPreview(); }
            renderList(); setEmptyState();
            if (images.length > 0 && !selectedId) {
              const firstCard = imageListEl.querySelector('.wp-image-card');
              if (firstCard) { firstCard.click(); selectedId = images[0].id; selectImage(images[0].id); }
            }
            toast('Image deleted');
          }
        } else if (pendingReset) {
          images.forEach(item => { URL.revokeObjectURL(item.url); if (item.cachedCompressed) URL.revokeObjectURL(item.cachedCompressed.url); });
          images.length = 0; selectedId = null; renderList(); setEmptyState(); clearPreview();
          if (qualityRange) qualityRange.value = 50; if (qualityValueInput) qualityValueInput.value = 50; syncQualityInputs(50);
          if (maxSizeInput) maxSizeInput.value = '';
          toast('Tool reset successfully');
        }
        if (confirmModal) confirmModal.close();
        pendingDeleteAll = false; pendingDeleteId = null; pendingReset = false;
      });
    }

    if (uploadFrame) {
      uploadFrame.addEventListener('dragover', (e) => { e.preventDefault(); uploadFrame.classList.add('wp-drag-over'); });
      uploadFrame.addEventListener('dragleave', () => { uploadFrame.classList.remove('wp-drag-over'); });
      uploadFrame.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadFrame.classList.remove('wp-drag-over');
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;
        showProcessing('Uploading...');
        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          const id = generateId();
          const url = URL.createObjectURL(file);
          images.push({ id, file, url, originalBytes: file.size, name: file.name, type: file.type });
        }
        hideProcessing();
        setEmptyAndRender();
        toast(`Added ${files.length} image${files.length > 1 ? 's' : ''}`);
      });
      uploadFrame.addEventListener('click', () => { if (fileInput) fileInput.click(); });
    }

    // Robust image copy helper
    async function tryCopyBlobToClipboardRobust(blob) {
      // 1) Direct write of original type
      if (navigator.clipboard && navigator.clipboard.write && typeof window.ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          return 'copied';
        } catch {}
      }
      // 2) Convert to PNG via canvas and try write
      try {
        const img = await blobToImage(blob);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (pngBlob && navigator.clipboard && navigator.clipboard.write && typeof window.ClipboardItem !== 'undefined') {
          try {
            await navigator.clipboard.write([new ClipboardItem({ [pngBlob.type]: pngBlob })]);
            return 'copied';
          } catch {}
        }
      } catch {}
      // 3) URL text via clipboard.writeText
      try {
        const url = URL.createObjectURL(blob);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          return 'url';
        }
        // 4) execCommand fallback for URL text
        const input = document.createElement('input');
        input.value = url;
        input.setAttribute('readonly', '');
        input.style.position = 'absolute';
        input.style.left = '-9999px';
        document.body.appendChild(input);
        input.select();
        input.setSelectionRange(0, input.value.length);
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(input);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        if (ok) return 'url';
      } catch {}
      return 'failed';
    }

    function blobToImage(blob) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = reject;
        img.src = url;
      });
    }

    // Copy/Download handlers split
    if (imageListEl) {
      imageListEl.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;
        const action = actionBtn.dataset.action;
        const card = actionBtn.closest('.wp-image-card');
        if (!card) return;
        const id = card.dataset.id;
        const item = images.find(i => i.id === id);
        if (!item) return;
        if (!qualityRange) return;
        const quality = parseInt(qualityRange.value);

        try {
          const compressed = await ensureCompressed(item, quality);
          const outName = item.name.replace(/(\.[^.]+)$/, '-compressed$1');
          if (action === 'copy') {
            const copyResult = await tryCopyBlobToClipboardRobust(compressed.blob);
            if (copyResult === 'copied') toast('Compressed image copied to clipboard!');
            else if (copyResult === 'url') toast('Compressed image URL copied');
            else toast('Copy not supported in this browser');
          } else if (action === 'download') {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(compressed.blob);
            link.download = outName;
            link.click();
            URL.revokeObjectURL(link.href);
            toast('Compressed image downloaded');
          }
        } catch (err) {
          console.error(`${action} error:`, err);
          toast(`Failed to ${action} image`);
        }
      });
    }

    if (dragDivider && handle && compareViewport) {
      let isDragging = false;
      handle.addEventListener('mousedown', () => { isDragging = true; });
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = compareViewport.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        compareViewport.style.setProperty('--split', percent + '%');
      });
      document.addEventListener('mouseup', () => { isDragging = false; });
      handle.addEventListener('touchstart', () => { isDragging = true; });
      document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = compareViewport.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        compareViewport.style.setProperty('--split', percent + '%');
      });
      document.addEventListener('touchend', () => { isDragging = false; });
    }

    function setEmptyAndRender() { 
      setEmptyState(); 
      renderList(); 
      setTimeout(() => { images.length && selectImage(images[images.length - 1].id); }, 0);
    }

    // Initialize
    setEmptyState();
    syncQualityInputs(50);
  });
})();