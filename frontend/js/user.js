const UserPage = {
  API_BASE: '..',
  userTag: '',
  images: [],
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
    const segments = window.location.pathname.split('/').filter(s => s.length > 0);
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

      this.images = data.images || [];
      document.getElementById('image-count').textContent = this.images.length;

      if (this.images.length === 0) {
        empty.classList.remove('hidden');
        return;
      }

      grid.classList.remove('hidden');
      grid.innerHTML = '';
      this.images.forEach(img => grid.appendChild(this.createImageCard(img)));
    } catch {
      loading.classList.add('hidden');
      empty.classList.remove('hidden');
      Toast.show('加载失败');
    }
  },

  renderImages() {
    const grid = document.getElementById('images-grid');
    if (!grid || grid.classList.contains('hidden')) return;
    grid.innerHTML = '';
    this.images.forEach(img => grid.appendChild(this.createImageCard(img)));
  },

  createImageCard(img) {
    const card = document.createElement('div');
    const safeUrl = Utils.escapeAttr(img.url || '');
    const displayUrl = Utils.escapeHtml(img.url || '');
    const safeFilename = Utils.escapeAttr(img.filename || '');
    const renewCount = img.renew_count || 0;
    const canRenew = renewCount < this.renewConfig.max_count;
    const colors = Theme.getThemeColors();

    const renewBadge = renewCount > 0
      ? `<span class="text-xs" style="color: ${colors.info}">(已续${renewCount}次)</span>`
      : '';

    card.className = `${Theme.getCardClass()} rounded-xl overflow-hidden`;
    card.innerHTML = `
      <div class="relative">
        <img src="${displayUrl}" alt="资源" class="w-full h-40 object-cover" loading="lazy" onerror="this.style.display='none'">
      </div>
      <div class="p-3">
        <p class="text-xs mb-1" style="color: ${colors.info}">${Utils.formatDate(img.created_at)}</p>
        <p class="text-xs" style="color: ${colors.info}">${Utils.formatExpireTime(img.expire_at)} ${renewBadge}</p>
        <p class="text-xs mt-1" style="color: ${colors.info}">${Utils.formatBytes(img.size)}</p>
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

    card.querySelector('.btn-copy').addEventListener('click', function() { Clipboard.copy(this.dataset.url); });

    const renewBtn = card.querySelector('.btn-renew');
    if (renewBtn) {
      renewBtn.addEventListener('click', () => this.showRenewModal(img));
    }

    return card;
  },

  showRenewModal(img) {
    const maxCount = this.renewConfig.max_count;
    const currentCount = img.renew_count || 0;
    const colors = Theme.getThemeColors();

    const durationOptions = this.renewConfig.durations.map(d =>
      `<option value="${d}">${Utils.formatDurationLabel(d)}</option>`
    ).join('');

    const modalHtml = `
      <div id="renew-modal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="${Theme.getCardClass()} rounded-2xl p-6 max-w-sm mx-4 w-full">
          <h3 class="text-lg font-semibold mb-2" style="color: ${colors.title}">续期资源</h3>
          <p class="text-sm mb-4" style="color: ${colors.text}">
            剩余续期次数：<span class="font-medium" style="color: ${colors.highlight}">${maxCount - currentCount}</span> / ${maxCount}
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
        const resp = await fetch(`${UserPage.API_BASE}/renew`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: img.filename, duration, user_tag: UserPage.userTag })
        });
        const data = await resp.json();
        if (data.success) { Toast.show(data.message); closeModal(); UserPage.loadImages(); }
        else { Toast.show(data.error || '续期失败'); this.disabled = false; this.textContent = '确认续期'; }
      } catch {
        Toast.show('续期失败');
        this.disabled = false;
        this.textContent = '确认续期';
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  UserPage.init();
  Theme.onChange(() => UserPage.renderImages());
});
