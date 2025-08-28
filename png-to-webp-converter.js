(function(){
  'use strict';

  const wrapper = document.querySelector('.tsc-png2webp');
  if (!wrapper) return;
  if (wrapper.dataset.bound === '1') return; wrapper.dataset.bound = '1';

  const dropzone = wrapper.querySelector('#pngDropzone');
  const fileInput = wrapper.querySelector('#pngFileInput');
  const selectBtn = wrapper.querySelector('#selectPngBtn');
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
  const uploadCard = wrapper.querySelector('#uploadCard');
  const toasts = wrapper.querySelector('#tscToasts');

  let selectedFiles = [];
  let converted = [];
  const convertedFiles = new Set();

  function toast(message, type) {
    if (!toasts) return;
    const el = document.createElement('div');
    el.className = 'tsc-toast' + (type ? ` tsc-toast-${type}` : '');
    el.textContent = message;
    toasts.appendChild(el);
    setTimeout(() => { el.style.animation = 'tsc-toast-out .2s ease forwards'; }, 2500);
    setTimeout(() => { el.remove(); }, 2800);
  }

  function updateSelectedCount() {
    selectedCountEl.textContent = `${selectedFiles.length} selected`;
    const pendingCount = selectedFiles.filter(f => !convertedFiles.has(f)).length;
    convertBtn.disabled = pendingCount === 0;
  }

  function openSelectedPanel(){ selectedPanel.classList.add('is-open'); selectedPanel.classList.remove('is-collapsed'); }
  function openResultsPanel(){ resultsPanel.classList.add('is-open'); resultsPanel.classList.remove('is-collapsed'); }
  function showUploadLoading(){ uploadLoading.hidden = false; uploadLoading.classList.add('is-visible'); }
  function hideUploadLoading(){ uploadLoading.classList.remove('is-visible'); uploadLoading.hidden = true; }
  function updateActionsVisibility(){ if (selectedFiles.length > 1) actionsContainer.classList.remove('is-hidden'); else actionsContainer.classList.add('is-hidden'); }

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
          <div class="tsc-filesize">${(file.size/1024).toFixed(1)} KB</div>
        </div>
        <div class="tsc-item-actions">
          <button type="button" class="tsc-btn tsc-btn-primary tsc-btn-sm tsc-convert-one">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5v14m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>Convert To WebP</span>
          </button>
        </div>
        <button type="button" class="tsc-remove" aria-label="Remove">✕</button>
      `;

      item.querySelector('.tsc-remove').addEventListener('click', () => {
        URL.revokeObjectURL(url);
        const idx = selectedFiles.indexOf(file);
        if (idx !== -1) selectedFiles.splice(idx, 1);
        renderPreviews(); updateSelectedCount(); updateActionsVisibility();
      });

      const convertOneBtn = item.querySelector('.tsc-convert-one');
      if (convertedFiles.has(file)) { convertOneBtn.disabled = true; convertOneBtn.textContent = 'Converted'; }
      convertOneBtn.addEventListener('click', async () => {
        const originalText = convertOneBtn.textContent;
        convertOneBtn.disabled = true; convertOneBtn.textContent = 'Converting...'; convertOneBtn.classList.add('is-loading');
        try {
          const webpBlob = await convertFileToWebP(file);
          const nameBase = file.name.replace(/\.[^/.]+$/i, '');
          const outName = `${nameBase}.webp`;
          const objectUrl = appendResultsCard(outName, webpBlob);
          converted.push({ name: outName, blob: webpBlob, url: objectUrl });
          convertedFiles.add(file);
          openResultsPanel();
          convertOneBtn.textContent = 'Converted';
          updateDownloadAllVisibility();
          toast(`Image "${file.name}" converted`, 'success');
        } catch (err) {
          console.error('Conversion failed for', file.name, err);
          convertOneBtn.disabled = false; convertOneBtn.textContent = originalText;
          toast(`Failed to convert "${file.name}"`, 'error');
        } finally {
          convertOneBtn.classList.remove('is-loading');
        }
      });

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
        <a class="tsc-btn tsc-btn-secondary" download="${name.replace(/\.png$/i, '.webp').replace(/\s+/g,'_')}" href="${objectUrl}">Download WebP</a>
        <button type="button" class="tsc-btn tsc-btn-ghost tsc-copy" data-name="${name}">Copy</button>
        <span class="tsc-filesize">${(blob.size/1024).toFixed(1)} KB</span>
      </div>
    `;
    const copyBtn = card.querySelector('.tsc-copy');
    if (copyBtn && navigator.clipboard && window.ClipboardItem) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/webp': blob })]);
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

  function updateDownloadAllVisibility() {
    const show = converted.length > 1; downloadZipBtn.style.display = show ? '' : 'none'; downloadZipBtn.disabled = !show;
  }

  function setProgress(current, total) {
    const pct = Math.round((current / total) * 100);
    wrapper.querySelector('#progressBar').style.width = pct + '%';
    wrapper.querySelector('#progressText').textContent = `${current}/${total} (${pct}%)`;
  }

  async function acceptFiles(files) {
    const arr = Array.from(files);
    const incoming = arr.filter(f => /\.png$/i.test(f.name) || f.type === 'image/png');
    const rejected = arr.filter(f => !incoming.includes(f));
    if (rejected.length > 0) toast('Error: Invalid File Type. Only PNG images are supported!', 'error');
    if (incoming.length === 0) return;
    showUploadLoading(); await new Promise(r => setTimeout(r, 50));
    selectedFiles = selectedFiles.concat(incoming);
    renderPreviews(); updateSelectedCount(); openSelectedPanel(); hideUploadLoading(); updateActionsVisibility();
    if (selectedFiles.length > 0) { uploadCard && (uploadCard.style.display = 'none'); }
    toast(`${incoming.length} image${incoming.length>1?'s':''} added`, 'success');
  }

  ;['dragenter','dragover'].forEach(evt => { dropzone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('tsc-dragover'); }); });
  ;['dragleave','drop'].forEach(evt => { dropzone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('tsc-dragover'); }); });
  dropzone.addEventListener('drop', async e => { const dt = e.dataTransfer; if (dt && dt.files) await acceptFiles(dt.files); });
  dropzone.addEventListener('click', (e) => { if (e.target && e.target.closest('#selectPngBtn')) return; fileInput.click(); });
  selectBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  const addMoreBtnEl = wrapper.querySelector('#addMoreBtn');
  if (addMoreBtnEl) {
    addMoreBtnEl.addEventListener('click', () => fileInput.click());
    addMoreBtnEl.addEventListener('pointermove', (e) => { const rect = addMoreBtnEl.getBoundingClientRect(); addMoreBtnEl.style.setProperty('--x', (e.clientX - rect.left) + 'px'); addMoreBtnEl.style.setProperty('--y', (e.clientY - rect.top) + 'px'); });
  }
  fileInput.addEventListener('change', async e => { await acceptFiles(e.target.files || []); fileInput.value = ''; });

  async function convertFileToWebP(file) {
    // Use ImageBitmap where possible; WebP encode via canvas toBlob('image/webp')
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    try {
      if ('createImageBitmap' in window) {
        const bitmap = await createImageBitmap(file, { colorSpaceConversion: 'none' }).catch(() => null);
        if (bitmap) {
          canvas.width = bitmap.width; canvas.height = bitmap.height;
          ctx.globalCompositeOperation = 'copy';
          ctx.drawImage(bitmap, 0, 0);
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.92));
          if (!blob) throw new Error('Failed to generate WebP');
          return blob;
        }
      }
    } catch (_) {}

    const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
    const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Invalid image')); img.src = dataUrl; });
    canvas.width = image.width; canvas.height = image.height; ctx.imageSmoothingEnabled = false; ctx.globalCompositeOperation = 'copy'; ctx.drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.92));
    if (!blob) throw new Error('Failed to generate WebP');
    return blob;
  }

  async function handleConvertAll() {
    if (selectedFiles.length === 0) return;
    const toConvert = selectedFiles.filter(f => !convertedFiles.has(f));
    if (toConvert.length === 0) { toast('All selected images are already converted', 'success'); return; }
    wrapper.querySelector('#progressSection').hidden = false;
    setProgress(0, toConvert.length); openResultsPanel();
    let done = 0;
    for (const file of toConvert) {
      try {
        const webpBlob = await convertFileToWebP(file);
        const nameBase = file.name.replace(/\.[^/.]+$/i, '');
        const outName = `${nameBase}.webp`;
        const objectUrl = appendResultsCard(outName, webpBlob);
        converted.push({ name: outName, blob: webpBlob, url: objectUrl });
        convertedFiles.add(file);
        // Mark preview converted
        const match = Array.from(previewGrid.querySelectorAll('.tsc-item')).find(el => (el.querySelector('.tsc-filename')?.getAttribute('title')) === file.name);
        if (match) { const btn = match.querySelector('.tsc-convert-one'); if (btn) { btn.disabled = true; btn.textContent = 'Converted'; } }
      } catch (err) {
        console.error('Conversion failed for', file.name, err);
      } finally {
        done += 1; setProgress(done, toConvert.length);
      }
    }
    toast(`All ${toConvert.length} image${toConvert.length>1?'s':''} converted`, 'success');
    updateDownloadAllVisibility();
  }

  async function ensureJSZipLoaded() {
    if (window.JSZip) return true;
    try {
      await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.async = true; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
      return !!window.JSZip;
    } catch (_) { return false; }
  }

  async function downloadAllAsZip() {
    if (converted.length < 2) { toast('Add at least 2 converted images to download all', 'error'); return; }
    const ok = await ensureJSZipLoaded(); if (!ok) { toast('Download failed: JSZip could not load', 'error'); return; }
    try {
      const zip = new JSZip(); const folder = zip.folder('converted_webps');
      converted.forEach(item => { if (item && item.blob && item.name) folder.file(item.name, item.blob, { binary: true }); });
      const content = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a'); const url = URL.createObjectURL(content); a.href = url; a.download = 'png-to-webp.zip'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err) { console.error('Zip creation failed', err); toast('Failed to create ZIP file', 'error'); }
  }

  convertBtn.addEventListener('click', handleConvertAll);
  downloadZipBtn.addEventListener('click', downloadAllAsZip);
  clearAllBtn.addEventListener('click', () => { selectedFiles = []; converted = []; convertedFiles.clear(); previewGrid.innerHTML = ''; resultsGrid.innerHTML = ''; updateSelectedCount(); updateActionsVisibility(); toast('Cleared', 'success'); });

  updateSelectedCount(); updateActionsVisibility();
})();

