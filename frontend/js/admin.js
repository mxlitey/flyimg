const Admin = {
  API_BASE: '..',
  adminToken: '',
  allImages: [],
  selectedFilenames: new Set(),
  confirmCallback: null,
  renewConfig: { max_count: 3, durations: [60, 180, 360, 720] },

  init() {
    this.adminToken = sessionStorage.getItem('adminToken') || '';
    if (this.adminToken) {
      this.showPanel();
    }
  },

  login() {
    const input = document.getElementById('admin-token-input');
    const token = input.value.trim();
    if (!token) {
      Toast.show('请输入管理密钥');
      return;
    }
    this.adminToken = token;
    sessionStorage.setItem('adminToken', this.adminToken);
    this.showPanel();
    Toast.show('登录成功');
  },

  logout() {
    this.adminToken = '';
    sessionStorage.removeItem('adminToken');
    document.getElementById('admin-login').classList.remove('hidden');
    document.getElementById('admin-panel').classList.add('hidden');
    document.getElementById('admin-token-input').value = '';
    this.allImages = [];
    this.selectedFilenames.clear();
    Toast.show('已退出登录');
  },

  showPanel() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    this.loadImages();
  },

  async loadImages() {
    const loading = document.getElementById('admin-images-loading');
    const grid = document.getElementById('admin-images-grid');

    loading.classList.remove('hidden');
    grid.innerHTML = '';
    this.selectedFilenames.clear();
    this.updateBatchDeleteBtn();

    try {
      const resp = await fetch(`${this.API_BASE}/all-images`, {
        headers: { 'X-Cron-Secret': this.adminToken }
      });

      if (resp.status === 401) {
        this.adminToken = '';
        sessionStorage.removeItem('adminToken');
        document.getElementById('admin-login').classList.remove('hidden');
        document.getElementById('admin-panel').classList.add('hidden');
        Toast.show('密钥无效，请重新登录');
        return;
      }

      const data = await resp.json();
      loading.classList.add('hidden');

      this.allImages = data.images || [];

      if (data.renew_config) {
        this.renewConfig = data.renew_config;
      }

      if (data.storage_info) {
        document.getElementById('stat-total-space').textContent = data.storage_info.maxStorageFormatted;
      }

      this.updateUserFilter();
      this.renderImages();
      this.updateStats();
    } catch {
      loading.classList.add('hidden');
      Toast.show('加载失败');
    }
  },

  updateUserFilter() {
    const userSet = new Set();
    this.allImages.forEach(img => {
      if (img.user_tag) userSet.add(img.user_tag);
    });

    const filter = document.getElementById('admin-user-filter');
    const currentVal = filter.value;
    filter.innerHTML = '<option value="">全部用户</option>';
    [...userSet].sort().forEach(u => {
      const opt = document.createElement('option');
      opt.value = u;
      opt.textContent = u;
      filter.appendChild(opt);
    });
    filter.value = currentVal;
  },

  getFilteredImages() {
    const filterVal = document.getElementById('admin-user-filter').value;
    if (!filterVal) return this.allImages;
    return this.allImages.filter(img => img.user_tag === filterVal);
  },

  filterByUser() {
    this.selectedFilenames.clear();
    this.updateBatchDeleteBtn();
    this.renderImages();
  },

  renderImages() {
    const grid = document.getElementById('admin-images-grid');
    grid.innerHTML = '';
    const images = this.getFilteredImages();

    if (images.length === 0) {
      grid.innerHTML = '<p class="text-center text-gray-600 dark:text-gray-400 py-8">暂无文件</p>';
      return;
    }

    images.forEach(img => {
      grid.appendChild(this.createImageRow(img));
    });
  },

  createImageRow(img) {
    const row = document.createElement('div');
    const isExpired = img.expired;
    const colors = Theme.getThemeColors();
    const safeFilename = Utils.escapeAttr(img.filename || '');
    const displayFilename = Utils.escapeHtml(img.filename || '');
    const safeUserTag = Utils.escapeHtml(img.user_tag || '');
    const displayUrl = Utils.escapeHtml(img.url || '');
    const isChecked = this.selectedFilenames.has(img.filename) ? 'checked' : '';
    const renewCount = img.renew_count || 0;
    const renewBadge = renewCount > 0
      ? `<span class="text-xs" style="color: ${colors.info}">(已续${renewCount}次)</span>`
      : '';

    row.className = `${Theme.getCardClass()} rounded-xl p-4 flex items-center space-x-4 ${isExpired ? 'border-l-4 border-danger' : 'border-l-4 border-success'}`;
    row.innerHTML = `
      <input type="checkbox" class="admin-file-checkbox w-4 h-4 flex-shrink-0 cursor-pointer accent-primary" data-filename="${displayFilename}" ${isChecked}>
      <img src="${displayUrl}" alt="资源" class="w-16 h-16 object-cover rounded-lg ${isExpired ? 'opacity-50' : ''}" loading="lazy"
           onerror="this.style.display='none'">
      <div class="flex-grow min-w-0">
        <p class="text-sm font-mono truncate" style="color: ${colors.filename}">${displayFilename}</p>
        <p class="text-xs" style="color: ${colors.info}">用户: ${safeUserTag} · ${Utils.formatBytes(img.size)} · ${Utils.formatDate(img.created_at)}</p>
        <p class="text-xs ${isExpired ? 'text-danger' : 'text-success'}">${Utils.formatExpireTime(img.expire_at)} ${renewBadge}</p>
      </div>
      <div class="flex gap-2 flex-shrink-0">
        <button class="btn-renew bg-success/20 text-success px-3 py-2 rounded-lg hover:bg-success/30 transition-colors text-sm" data-filename="${safeFilename}">
          <i class="fa fa-clock-o"></i>
        </button>
        <button class="btn-delete bg-danger/20 text-danger px-3 py-2 rounded-lg hover:bg-danger/30 transition-colors text-sm" data-filename="${safeFilename}">
          <i class="fa fa-trash"></i>
        </button>
      </div>
    `;

    row.querySelector('.admin-file-checkbox').addEventListener('change', (e) => this.toggleFileSelect(e.target));
    row.querySelector('.btn-delete').addEventListener('click', function() { Admin.deleteFile(this.dataset.filename); });
    row.querySelector('.btn-renew').addEventListener('click', () => this.showRenewModal(img));

    return row;
  },

  updateStats() {
    let expiredCount = 0;
    let activeCount = 0;
    let totalSize = 0;

    this.allImages.forEach(img => {
      if (img.expired) expiredCount++;
      else { activeCount++; totalSize += img.size || 0; }
    });

    document.getElementById('stat-total').textContent = this.allImages.length;
    document.getElementById('stat-expired').textContent = expiredCount;
    document.getElementById('stat-active').textContent = activeCount;
    document.getElementById('stat-used-space').textContent = Utils.formatBytes(totalSize);
  },

  toggleFileSelect(checkbox) {
    if (checkbox.checked) {
      this.selectedFilenames.add(checkbox.dataset.filename);
    } else {
      this.selectedFilenames.delete(checkbox.dataset.filename);
    }
    this.updateBatchDeleteBtn();
  },

  toggleSelectAll() {
    const images = this.getFilteredImages();
    const allSelected = images.length > 0 && images.every(img => this.selectedFilenames.has(img.filename));

    if (allSelected) {
      images.forEach(img => this.selectedFilenames.delete(img.filename));
    } else {
      images.forEach(img => this.selectedFilenames.add(img.filename));
    }

    document.querySelectorAll('.admin-file-checkbox').forEach(cb => {
      cb.checked = this.selectedFilenames.has(cb.dataset.filename);
    });
    this.updateBatchDeleteBtn();
  },

  updateBatchDeleteBtn() {
    const btn = document.getElementById('btn-batch-delete');
    const count = this.selectedFilenames.size;
    document.getElementById('selected-count').textContent = count;
    btn.disabled = count === 0;
    btn.classList.toggle('opacity-50', count === 0);
    btn.classList.toggle('cursor-not-allowed', count === 0);
  },

  async batchDelete() {
    const count = this.selectedFilenames.size;
    if (count === 0) return;

    this.showConfirm('批量删除', `确定要删除选中的 ${count} 个文件吗？此操作不可恢复。`, async (confirmed) => {
      if (!confirmed) return;

      let successCount = 0;
      let failCount = 0;

      for (const filename of this.selectedFilenames) {
        try {
          const resp = await fetch(`${this.API_BASE}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': this.adminToken },
            body: JSON.stringify({ filename })
          });
          const data = await resp.json();
          if (data.success) successCount++; else failCount++;
        } catch { failCount++; }
      }

      this.selectedFilenames.clear();
      Toast.show(`删除完成：成功 ${successCount} 个${failCount > 0 ? `，失败 ${failCount} 个` : ''}`);
      this.loadImages();
    });
  },

  async deleteByUser() {
    const filterVal = document.getElementById('admin-user-filter').value;
    if (!filterVal) { Toast.show('请先选择一个用户'); return; }

    const userImages = this.allImages.filter(img => img.user_tag === filterVal);
    if (userImages.length === 0) { Toast.show('该用户没有文件'); return; }

    this.showConfirm('按用户删除', `确定要删除用户「${filterVal}」的所有 ${userImages.length} 个文件吗？此操作不可恢复。`, async (confirmed) => {
      if (!confirmed) return;

      let successCount = 0;
      let failCount = 0;

      for (const img of userImages) {
        try {
          const resp = await fetch(`${this.API_BASE}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': this.adminToken },
            body: JSON.stringify({ filename: img.filename })
          });
          const data = await resp.json();
          if (data.success) successCount++; else failCount++;
        } catch { failCount++; }
      }

      Toast.show(`删除完成：成功 ${successCount} 个${failCount > 0 ? `，失败 ${failCount} 个` : ''}`);
      this.loadImages();
    });
  },

  async deleteFile(filename) {
    try {
      const resp = await fetch(`${this.API_BASE}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': this.adminToken },
        body: JSON.stringify({ filename })
      });
      const data = await resp.json();
      if (data.success) { Toast.show('删除成功'); this.loadImages(); }
      else Toast.show(data.error || '删除失败');
    } catch { Toast.show('删除失败'); }
  },

  async cleanExpired() {
    this.showConfirm('清理过期文件', '确定要清理所有过期文件吗？此操作不可恢复。', async (confirmed) => {
      if (!confirmed) return;

      try {
        const resp = await fetch(`${this.API_BASE}/clean`, {
          method: 'POST',
          headers: { 'X-Cron-Secret': this.adminToken }
        });
        const data = await resp.json();
        if (data.success) { Toast.show(data.message); this.loadImages(); }
        else Toast.show(data.error || '清理失败');
      } catch { Toast.show('清理失败'); }
    });
  },

  showConfirm(title, message, callback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-modal').classList.remove('hidden');
    this.confirmCallback = callback;
  },

  confirmAction(result) {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (this.confirmCallback) {
      this.confirmCallback(result);
      this.confirmCallback = null;
    }
  },

  showRenewModal(img) {
    const durations = this.renewConfig.durations;
    const currentCount = img.renew_count || 0;
    const colors = Theme.getThemeColors();

    const durationOptions = durations.map(d =>
      `<option value="${d}">${Utils.formatDurationLabel(d)}</option>`
    ).join('');

    const modalHtml = `
      <div id="renew-modal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="${Theme.getCardClass()} rounded-2xl p-6 max-w-sm mx-4 w-full">
          <h3 class="text-lg font-semibold mb-2" style="color: ${colors.title}">续期资源（管理员）</h3>
          <p class="text-sm mb-2" style="color: ${colors.text}">
            文件: <span class="font-mono" style="color: ${colors.highlight}">${Utils.escapeHtml(img.filename)}</span>
          </p>
          <p class="text-sm mb-4" style="color: ${colors.text}">
            已续期次数: <span class="font-medium" style="color: ${colors.highlight}">${currentCount}</span>（管理员无限制）
          </p>
          <div class="mb-4">
            <label class="block text-sm mb-2 font-medium" style="color: ${colors.text}">选择续期时长</label>
            <select id="renew-duration" class="theme-input w-full px-3 py-2 border rounded-lg text-sm">
              ${durationOptions}
            </select>
          </div>
          <div class="flex gap-3">
            <button id="renew-cancel" class="flex-1 px-4 py-2 rounded-lg transition-colors" style="background-color: ${colors.cancelBg}; color: ${colors.cancelText}">取消</button>
            <button id="renew-confirm" class="flex-1 bg-success text-white px-4 py-2 rounded-lg hover:bg-success/90 transition-colors">确认续期</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    Theme.applyThemeInputs();

    const modal = document.getElementById('renew-modal');
    const closeModal = () => modal.remove();

    document.getElementById('renew-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    document.getElementById('renew-confirm').addEventListener('click', async function() {
      const duration = parseInt(document.getElementById('renew-duration').value, 10);
      this.disabled = true;
      this.textContent = '处理中...';

      try {
        const resp = await fetch(`${Admin.API_BASE}/renew`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': Admin.adminToken },
          body: JSON.stringify({ filename: img.filename, duration, user_tag: img.user_tag })
        });
        const data = await resp.json();
        if (data.success) { Toast.show(data.message); closeModal(); Admin.loadImages(); }
        else { Toast.show(data.error || '续期失败'); this.disabled = false; this.textContent = '确认续期'; }
      } catch {
        Toast.show('续期失败');
        this.disabled = false;
        this.textContent = '确认续期';
      }
    });
  }
};

function adminLogin() { Admin.login(); }
function adminLogout() { Admin.logout(); }
function loadAllImages() { Admin.loadImages(); }
function filterByUser() { Admin.filterByUser(); }
function toggleSelectAll() { Admin.toggleSelectAll(); }
function batchDelete() { Admin.batchDelete(); }
function deleteByUser() { Admin.deleteByUser(); }
function cleanExpired() { Admin.cleanExpired(); }
function confirmAction(result) { Admin.confirmAction(result); }

document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  Admin.init();
  Theme.onChange(() => Admin.renderImages());
});
