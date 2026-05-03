const UserPage = {
  API_BASE: '..',
  userTag: '',
  renewConfig: { max_count: 3, durations: [60, 180, 360, 720] },

  init() {
    this.userTag = this.getUserTagFromUrl();
    if (this.userTag) {
      document.getElementById('user-tag-display').textContent = this.userTag;
      this.loadImages();
    } else {
      document.getElementById('images-loading').classList.add('hidden');
      document.getElementById('images-empty').classList.remove('hidden');
    }
  },

  getUserTagFromUrl() {
    const path = window.location.pathname;
    const segments = path.split('/').filter(s => s.length > 0);
    if (segments.length >= 1) {
      return segments[segments.length - 1] || segments[0];
    }
    return null;
  },

  async loadImages() {
    const loading = document.getElementById('images-loading');
    const empty = document.getElementById('images-empty');
    const grid = document.getElementById('images-grid');

    try {
      const resp = await fetch(`${this.API_BASE}/my-images?user_tag=${encodeURIComponent(this.userTag)}`);
      const data = await resp.json();

      loading.classList.add('hidden');

      if (!data.success) {
        Toast.show(data.error || '加载失败');
        empty.classList.remove('hidden');
        return;
      }

      if (data.renew_config) {
        this.renewConfig = data.renew_config;
      }

      const images = data.images || [];
      document.getElementById('image-count').textContent = images.length;

      if (images.length === 0) {
        empty.classList.remove('hidden');
        return;
      }

      grid.classList.remove('hidden');
      grid.innerHTML = '';

      images.forEach(img => {
        grid.appendChild(this.createImageCard(img));
      });
    } catch {
      loading.classList.add('hidden');
      empty.classList.remove('hidden');
      Toast.show('加载失败');
    }
  },

  createImageCard(img) {
    const card = document.createElement('div');
    const safeUrl = Utils.escapeAttr(img.url || '');
    const displayUrl = Utils.escapeHtml(img.url || '');
    const safeFilename = Utils.escapeAttr(img.filename || '');
    const renewCount = img.renew_count || 0;
    const canRenew = renewCount < this.renewConfig.max_count;

    const renewBadge = renewCount > 0 
      ? `<span class="text-xs text-gray-500 dark:text-gray-400">(已续${renewCount}次)</span>` 
      : '';

    card.className = `${Theme.getCardClass()} rounded-xl overflow-hidden`;
    card.innerHTML = `
      <div class="relative">
        <img src="${displayUrl}" alt="资源" class="w-full h-40 object-cover" loading="lazy" onerror="this.style.display='none'">
      </div>
      <div class="p-3">
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">${Utils.formatDate(img.created_at)}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400">${Utils.formatExpireTime(img.expire_at)} ${renewBadge}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${Utils.formatBytes(img.size)}</p>
        <div class="flex gap-2 mt-2">
          <button class="btn-copy flex-1 bg-primary/20 text-primary text-xs px-2 py-1 rounded hover:bg-primary/30 transition-colors" data-url="${safeUrl}">
            <i class="fa fa-copy mr-1"></i>复制
          </button>
          ${canRenew ? `<button class="btn-renew flex-1 bg-success/20 text-success text-xs px-2 py-1 rounded hover:bg-success/30 transition-colors" data-filename="${safeFilename}">
            <i class="fa fa-clock-o mr-1"></i>续期
          </button>` : ''}
        </div>
      </div>
    `;

    const copyBtn = card.querySelector('.btn-copy');
    copyBtn.addEventListener('click', () => Clipboard.copy(copyBtn.dataset.url));

    const renewBtn = card.querySelector('.btn-renew');
    if (renewBtn) {
      renewBtn.addEventListener('click', () => this.showRenewModal(img));
    }

    return card;
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
          <h3 class="text-lg font-semibold mb-2 text-black dark:text-white">续期资源</h3>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-4">
            剩余续期次数：<span class="font-medium text-black dark:text-white">${maxCount - currentCount}</span> / ${maxCount}
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: img.filename,
            duration: duration,
            user_tag: this.userTag
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

document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  UserPage.init();
});
