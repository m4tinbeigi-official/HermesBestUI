/**
 * HermesBestUI - Media Gallery & File Manager
 */

let _galleryItems = [];
let _galleryFilter = 'all';

async function loadGalleryPanel(force = false) {
  const container = $('galleryItemsGrid');
  const countBadge = $('galleryItemCount');
  if (!container) return;

  if (force || _galleryItems.length === 0) {
    container.innerHTML = '<div class="gallery-empty-state"><div class="loading-spinner"></div><span>در حال دریافت فایل‌های رسانه...</span></div>';
    try {
      const res = await api('/api/gallery/items');
      _galleryItems = (res && res.items) || [];
      if (countBadge) countBadge.textContent = `${_galleryItems.length} فایل`;
    } catch (err) {
      container.innerHTML = `<div class="gallery-empty-state"><span style="color:#ef4444">خطا در بارگذاری رسانه‌ها: ${err.message || err}</span></div>`;
      return;
    }
  }

  renderGalleryItems();
}

function setGalleryFilter(filter) {
  _galleryFilter = filter;
  document.querySelectorAll('.gallery-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  renderGalleryItems();
}

function _formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function _formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

function renderGalleryItems() {
  const container = $('galleryItemsGrid');
  if (!container) return;

  const filtered = _galleryItems.filter(item => {
    if (_galleryFilter === 'all') return true;
    return item.type === _galleryFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="gallery-empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4;margin-bottom:8px">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>هیچ فایلی در این دسته‌بندی یافت نشد.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(item => {
    const encPath = encodeURIComponent(item.path);
    const previewUrl = `/api/files/preview?path=${encPath}`;
    const downloadUrl = `/api/files/download?path=${encPath}`;
    let previewHtml = '';

    if (item.type === 'image') {
      previewHtml = `
        <div class="gallery-card-thumb" onclick="openFilePreviewModal('${encPath}', 'image')">
          <img src="${previewUrl}" alt="${item.name}" loading="lazy" />
        </div>
      `;
    } else if (item.type === 'audio') {
      previewHtml = `
        <div class="gallery-card-thumb gallery-audio-thumb">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          <audio controls preload="none" style="width:100%;margin-top:8px">
            <source src="${previewUrl}" type="audio/mpeg">
          </audio>
        </div>
      `;
    } else if (item.type === 'video') {
      previewHtml = `
        <div class="gallery-card-thumb gallery-video-thumb">
          <video controls preload="metadata" style="max-height:120px;width:100%">
            <source src="${previewUrl}">
          </video>
        </div>
      `;
    } else {
      previewHtml = `
        <div class="gallery-card-thumb gallery-doc-thumb" onclick="openFilePreviewModal('${encPath}', 'document')">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="gallery-ext-badge">${(item.ext || '').replace('.', '').toUpperCase()}</span>
        </div>
      `;
    }

    return `
      <div class="gallery-card" data-path="${item.path}">
        ${previewHtml}
        <div class="gallery-card-body">
          <div class="gallery-card-title" title="${item.name}">${item.name}</div>
          <div class="gallery-card-meta">
            <span>${_formatFileSize(item.size)}</span>
            <span>${_formatDate(item.mtime)}</span>
          </div>
          <div class="gallery-card-actions">
            <a href="${previewUrl}" target="_blank" class="gallery-btn preview-btn" title="نمایش در تب جدید">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>مشاهده</span>
            </a>
            <a href="${downloadUrl}" download="${item.name}" class="gallery-btn download-btn" title="دانلود فایل">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>دانلود</span>
            </a>
            <button type="button" class="gallery-btn delete-btn" onclick="deleteGalleryItem('${encPath}')" title="حذف فایل">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function deleteGalleryItem(encPath) {
  const decPath = decodeURIComponent(encPath);
  if (!confirm(`آیا از حذف این فایل مطمئن هستید؟\n${decPath}`)) {
    return;
  }
  try {
    const res = await api(`/api/gallery/item?path=${encPath}`, { method: 'DELETE' });
    if (res && res.success) {
      _galleryItems = _galleryItems.filter(i => i.path !== decPath);
      renderGalleryItems();
      const countBadge = $('galleryItemCount');
      if (countBadge) countBadge.textContent = `${_galleryItems.length} فایل`;
    } else {
      alert('خطا در حذف فایل: ' + (res.error || 'ناشناخته'));
    }
  } catch (err) {
    alert('خطا در حذف فایل: ' + (err.message || err));
  }
}

function openFilePreviewModal(encPath, type) {
  const modal = $('filePreviewModal');
  const body = $('filePreviewModalBody');
  if (!modal || !body) return;

  const previewUrl = `/api/files/preview?path=${encPath}`;
  const downloadUrl = `/api/files/download?path=${encPath}`;
  const decPath = decodeURIComponent(encPath);

  if (type === 'image') {
    body.innerHTML = `<img src="${previewUrl}" style="max-width:100%;max-height:80vh;border-radius:8px;object-fit:contain" />`;
  } else if (type === 'audio') {
    body.innerHTML = `<audio controls autoplay src="${previewUrl}" style="width:100%"></audio>`;
  } else {
    body.innerHTML = `<iframe src="${previewUrl}" style="width:100%;height:70vh;border:none;background:#fff;border-radius:8px"></iframe>`;
  }

  const title = $('filePreviewModalTitle');
  if (title) title.textContent = decPath.split('/').pop();

  const dlLink = $('filePreviewModalDownload');
  if (dlLink) {
    dlLink.href = downloadUrl;
    dlLink.setAttribute('download', decPath.split('/').pop());
  }

  modal.style.display = 'flex';
}

function closeFilePreviewModal() {
  const modal = $('filePreviewModal');
  if (modal) modal.style.display = 'none';
  const body = $('filePreviewModalBody');
  if (body) body.innerHTML = '';
}
