const UserPage = {
  API_BASE: '..',

  init() {
    const userTag = this.getUserTagFromUrl();
    if (userTag) {
      document.getElementById('user-tag-display').textContent = userTag;
      this.loadImages(userTag);
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

  async loadImages(userTag) {
    const loading = document.getElementById('images-loading');
    const empty = document.getElementById('images-empty');
    const grid = document.getElementById('images-grid');

    try {
      const resp = await fetch(`${this.API_BASE}/my-images?user_tag=${encodeURIComponent(userTag)}`);
      const data = await resp.json();

      loading.classList.add('hidden');

      if (!data.success) {
        Toast.show(data.error || '加载失败');
        empty.classList.remove('hidden');
        return;
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

    card.className = `${Theme.getCardClass()} rounded-xl overflow-hidden`;
    card.innerHTML = `
      <div class="relative">
        <img src="${displayUrl}" alt="图片" class="w-full h-40 object-cover" loading="lazy" onerror="this.style.display='none'">
      </div>
      <div class="p-3">
        <p class="text-xs text-gray-400 mb-1">${Utils.formatDate(img.created_at)}</p>
        <p class="text-xs text-gray-500">${Utils.formatTimeLeft(img.expire_at)}</p>
        <p class="text-xs text-gray-500 mt-1">${Utils.formatBytes(img.size)}</p>
        <button class="btn-copy mt-2 w-full bg-primary/20 text-primary text-xs px-2 py-1 rounded hover:bg-primary/30 transition-colors" data-url="${safeUrl}">
          <i class="fa fa-copy mr-1"></i>复制链接
        </button>
      </div>
    `;

    const copyBtn = card.querySelector('.btn-copy');
    copyBtn.addEventListener('click', () => Clipboard.copy(copyBtn.dataset.url));

    return card;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  UserPage.init();
});
