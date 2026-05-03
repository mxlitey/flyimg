const Admin = {
  API_BASE: '..',
  adminToken: '',
  allImages: [],
  selectedFilenames: new Set(),
  confirmCallback: null,
  renewConfig: { max_count: 3, durations: [60, 180, 360, 720] },

  init() {
    this.adminToken = localStorage.getItem('adminToken') || '';
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
    localStorage.setItem('adminToken', this.adminToken);
    this.showPanel();
    Toast.show('登录成功');
  },

  logout() {
    this.adminToken = '';
    localStorage.removeItem('adminToken');
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
        localStorage.removeItem('adminToken');
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

      this.updateUserFilter();
      this.renderImages();
      this.updateStats();
    } catch (error) {
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
    const safeFilename = Utils.escapeAttr(img.filename || '');
    const displayFilename = Utils.escapeHtml(img.filename || '');
    const safeUserTag = Utils.escapeHtml(img.user_tag || '');
    const displayUrl = Utils.escapeHtml(img.url || '');
    const isChecked = this.selectedFilenames.has(img.filename) ? 'checked' : '';
    const renewCount = img.renew_count || 0;
    const renewBadge = renewCount > 0 
      ? `<span class="text-xs text-gray-500 dark:text-gray-400">(已续${renewCount}次)</span>` 
      : '';

    row.className = `${Theme.getCardClass()} rounded-xl p-4 flex items-center space-x-4 ${isExpired ? 'border-l-4 border-danger' : 'border-l-4 border-success'}`;
    row.innerHTML = `
      <input type="checkbox" class="admin-file-checkbox w-4 h-4 flex-shrink-0 cursor-pointer accent-primary" data-filename="${displayFilename}" ${isChecked}>
      <img src="${displayUrl}" alt="资源" class="w-16 h-16 object-cover rounded-lg ${isExpired ? 'opacity-50' : ''}" loading="lazy"
           onerror="this.style.display='none'">
      <div class="flex-grow min-w-0">
        <p class="text-sm font-mono truncate text-gray-800 dark:text-gray-300">${displayFilename}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400">用户: ${safeUserTag} · ${Utils.formatBytes(img.size)} · ${Utils.formatDate(img.created_at)}</p>
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

    const checkbox = row.querySelector('.admin-file-checkbox');
    checkbox.addEventListener('change', (e) => this.toggleFileSelect(e.target));

    const deleteBtn = row.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', () => this.deleteFile(deleteBtn.dataset.filename));

    const renewBtn = row.querySelector('.btn-renew');
    if (renewBtn) {
      renewBtn.addEventListener('click', () => this.showRenewModal(img));
    }

    return row;
  },

  updateStats() {
    let expiredCount = 0;
    let activeCount = 0;
    let totalSize = 0;

    this.allImages.forEach(img => {
      if (img.expired) expiredCount++;
      else {
        activeCount++;
        totalSize += img.size || 0;
      }
    });

    document.getElementById('stat-total').textContent = this.allImages.length;
    document.getElementById('stat-expired').textContent = expiredCount;
    document.getElementById('stat-active').textContent = activeCount;
    document.getElementById('stat-used-space').textContent = Utils.formatBytes(totalSize);
  },

  toggleFileSelect(checkbox) {
    const filename = checkbox.dataset.filename;
    if (checkbox.checked) {
      this.selectedFilenames.add(filename);
    } else {
      this.selectedFilenames.delete(filename);
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

    if (count > 0) {
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    }
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
            headers: {
              'Content-Type': 'application/json',
              'X-Cron-Secret': this.adminToken
            },
            body: JSON.stringify({ filename })
          });
          const data = await resp.json();
          if (data.success) successCount++;
          else failCount++;
        } catch {
          failCount++;
        }
      }

      this.selectedFilenames.clear();
      Toast.show(`删除完成：成功 ${successCount} 个${failCount > 0 ? `，失败 ${failCount} 个` : ''}`);
      this.loadImages();
    });
  },

  async deleteByUser() {
    const filterVal = document.getElementById('admin-user-filter').value;
    if (!filterVal) {
      Toast.show('请先选择一个用户');
      return;
    }

    const userImages = this.allImages.filter(img => img.user_tag === filterVal);
    if (userImages.length === 0) {
      Toast.show('该用户没有文件');
      return;
    }

    this.showConfirm('按用户删除', `确定要删除用户「${filterVal}」的所有 ${userImages.length} 个文件吗？此操作不可恢复。`, async (confirmed) => {
      if (!confirmed) return;

      let successCount = 0;
      let failCount = 0;

      for (const img of userImages) {
        try {
          const resp = await fetch(`${this.API_BASE}/delete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Cron-Secret': this.adminToken
            },
            body: JSON.stringify({ filename: img.filename })
          });
          const data = await resp.json();
          if (data.success) successCount++;
          else failCount++;
        } catch {
          failCount++;
        }
      }

      Toast.show(`删除完成：成功 ${successCount} 个${failCount > 0 ? `，失败 ${failCount} 个` : ''}`);
      this.loadImages();
    });
  },

  async deleteFile(filename) {
    try {
      const resp = await fetch(`${this.API_BASE}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': this.adminToken
        },
        body: JSON.stringify({ filename })
      });
      const data = await resp.json();

      if (data.success) {
        Toast.show('删除成功');
        this.loadImages();
      } else {
        Toast.show(data.error || '删除失败');
      }
    } catch {
      Toast.show('删除失败');
    }
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
        if (data.success) {
          Toast.show(data.message);
          this.loadImages();
        } else {
          Toast.show(data.error || '清理失败');
        }
      } catch {
        Toast.show('清理失败');
      }
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
    const maxCount = this.renewConfig.max_count;
    const currentCount = img.renew_count || 0;

    const durationOptions = durations.map(d => {
      if (d === 0) {
        return `<option value="0">永不过期</option>`;
      }
      const hours = Math.floor(d / 60);
      const mins = d % 60;
      const label = hours > 0 
        ? (mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`)
        : `${mins}分钟`;
      return `<option value="${d}">${label}</option>`;
    }).join('');

    const modalHtml = `
      <div id="renew-modal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="${Theme.getCardClass()} rounded-2xl p-6 max-w-sm mx-4 w-full">
          <h3 class="text-lg font-semibold mb-2 text-black dark:text-white">续期资源（管理员）</h3>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">
            文件: <span class="font-mono text-black dark:text-white">${Utils.escapeHtml(img.filename)}</span>
          </p>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-4">
            已续期次数: <span class="font-medium text-black dark:text-white">${currentCount}</span>（管理员无限制）
          </p>
          <div class="mb-4">
            <label class="block text-sm text-gray-700 dark:text-gray-200 mb-2 font-medium">选择续期时长</label>
            <select id="renew-duration" class="theme-input w-full px-3 py-2 border rounded-lg text-sm">
              ${durationOptions}
            </select>
          </div>
          <div class="flex gap-3">
            <button id="renew-cancel" class="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">取消</button>
            <button id="renew-confirm" class="flex-1 bg-success text-white px-4 py-2 rounded-lg hover:bg-success/90 transition-colors">确认续期</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    Theme.applyThemeInputs();

    const modal = document.getElementById('renew-modal');
    const cancelBtn = document.getElementById('renew-cancel');
    const confirmBtn = document.getElementById('renew-confirm');
    const durationSelect = document.getElementById('renew-duration');

    const closeModal = () => modal.remove();

    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    confirmBtn.addEventListener('click', async () => {
      const duration = parseInt(durationSelect.value, 10);
      confirmBtn.disabled = true;
      confirmBtn.textContent = '处理中...';

      try {
        const resp = await fetch(`${this.API_BASE}/renew`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Cron-Secret': this.adminToken
          },
          body: JSON.stringify({
            filename: img.filename,
            duration: duration,
            user_tag: img.user_tag
          })
        });

        const data = await resp.json();

        if (data.success) {
          Toast.show(data.message);
          closeModal();
          this.loadImages();
        } else {
          Toast.show(data.error || '续期失败');
          confirmBtn.disabled = false;
          confirmBtn.textContent = '确认续期';
        }
      } catch {
        Toast.show('续期失败');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '确认续期';
      }
    });
  }
};

function adminLogin() {
  Admin.login();
}

function adminLogout() {
  Admin.logout();
}

function loadAllImages() {
  Admin.loadImages();
}

function filterByUser() {
  Admin.filterByUser();
}

function toggleSelectAll() {
  Admin.toggleSelectAll();
}

function batchDelete() {
  Admin.batchDelete();
}

function deleteByUser() {
  Admin.deleteByUser();
}

function cleanExpired() {
  Admin.cleanExpired();
}

function confirmAction(result) {
  Admin.confirmAction(result);
}

document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  Admin.init();
});
