const App = {
  API_BASE: '',
  currentUserTag: '',

  elements: {},

  init() {
    this.cacheElements();
    this.bindEvents();
    this.initRouter();
    this.initDisplayConfig();
  },

  cacheElements() {
    this.elements = {
      uploadArea: document.getElementById('upload-area'),
      fileInput: document.getElementById('file-input'),
      uploadProgress: document.getElementById('upload-progress'),
      progressBar: document.getElementById('progress-bar'),
      uploadStatus: document.getElementById('upload-status'),
      uploadStatusText: document.getElementById('upload-status-text'),
      uploadResult: document.getElementById('upload-result'),
      previewImage: document.getElementById('preview-image'),
      directLink: document.getElementById('direct-link'),
      markdownLink: document.getElementById('markdown-link'),
      htmlLink: document.getElementById('html-link'),
      expireTime: document.getElementById('expire-time'),
      userTagInput: document.getElementById('user-tag-input'),
      pageUpload: document.getElementById('page-upload'),
      pageMyImages: document.getElementById('page-my-images'),
      myTagDisplay: document.getElementById('my-tag-display'),
      myImagesLoading: document.getElementById('my-images-loading'),
      myImagesEmpty: document.getElementById('my-images-empty'),
      myImagesGrid: document.getElementById('my-images-grid'),
      navMy: document.getElementById('nav-my')
    };
  },

  bindEvents() {
    this.elements.uploadArea.addEventListener('click', () => this.elements.fileInput.click());

    this.elements.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) this.uploadFile(e.target.files[0]);
    });

    this.elements.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.elements.uploadArea.classList.add('border-primary', 'bg-primary/10');
    });

    this.elements.uploadArea.addEventListener('dragleave', () => {
      this.elements.uploadArea.classList.remove('border-primary', 'bg-primary/10');
    });

    this.elements.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.elements.uploadArea.classList.remove('border-primary', 'bg-primary/10');
      if (e.dataTransfer.files.length > 0) this.uploadFile(e.dataTransfer.files[0]);
    });

    document.addEventListener('paste', (e) => {
      if (e.clipboardData.files.length > 0) this.uploadFile(e.clipboardData.files[0]);
    });
  },

  initDisplayConfig() {
    if (typeof DISPLAY_CONFIG !== 'undefined') {
      document.getElementById('expire-hours-text').textContent = DISPLAY_CONFIG.expireHours;
      document.getElementById('allowed-types-text').textContent = DISPLAY_CONFIG.allowedTypesDisplay;
      document.getElementById('max-size-text').textContent = DISPLAY_CONFIG.maxFileSizeMB;
      document.getElementById('footer-expire-hours').textContent = DISPLAY_CONFIG.expireHours;
    }
  },

  initRouter() {
    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get('user');

    if (userParam) {
      this.currentUserTag = userParam;
      this.elements.userTagInput.value = this.currentUserTag;
      this.navigateTo('my-images');
      return;
    }

    const savedTag = localStorage.getItem('userTag');
    if (savedTag && savedTag !== 'default') {
      this.currentUserTag = savedTag;
      this.elements.userTagInput.value = savedTag;
    }

    this.updateNavButtons();
  },

  navigateTo(page) {
    this.elements.pageUpload.classList.add('hidden');
    this.elements.pageMyImages.classList.add('hidden');

    if (page === 'upload') {
      this.resetUpload();
      this.elements.pageUpload.classList.remove('hidden');
    } else if (page === 'my-images') {
      const tag = this.elements.userTagInput.value.trim();
      if (tag) {
        this.currentUserTag = tag;
        localStorage.setItem('userTag', tag);
      }
      if (!this.currentUserTag) {
        Toast.show('请先输入用户名');
        this.elements.userTagInput.focus();
        this.elements.pageUpload.classList.remove('hidden');
        return;
      }
      this.elements.pageMyImages.classList.remove('hidden');
      this.elements.myTagDisplay.textContent = this.currentUserTag;
      this.loadMyImages();
    }

    this.updateNavButtons();
  },

  updateNavButtons() {
    if (this.currentUserTag) {
      this.elements.navMy.classList.remove('hidden');
    }
  },

  async uploadFile(file) {
    this.elements.uploadArea.classList.add('hidden');
    this.elements.uploadProgress.classList.remove('hidden');
    this.elements.progressBar.style.width = '0%';
    this.elements.uploadStatusText.textContent = '正在上传...';
    this.elements.uploadStatus.classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', file);

    const userTag = this.elements.userTagInput.value.trim() || 'default';
    formData.append('user_tag', userTag);

    if (userTag !== 'default') {
      this.currentUserTag = userTag;
      localStorage.setItem('userTag', userTag);
      this.updateNavButtons();
    }

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = 10 + (e.loaded / e.total) * 80;
        this.elements.progressBar.style.width = `${percent}%`;
      }
    });

    xhr.addEventListener('load', () => {
      this.elements.progressBar.style.width = '100%';

      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);

        this.elements.uploadProgress.classList.add('hidden');
        this.elements.uploadResult.classList.remove('hidden');

        this.elements.previewImage.src = result.url;
        this.elements.directLink.value = result.url;
        this.elements.markdownLink.value = result.markdown;
        this.elements.htmlLink.value = result.html;

        const hoursLeft = Math.round((new Date(result.expireAt) - Date.now()) / (1000 * 60 * 60));
        this.elements.expireTime.textContent = `${hoursLeft}小时后过期`;

        Toast.show('上传成功！');
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          Toast.show(error.error || '上传失败');
        } catch {
          Toast.show('上传失败');
        }
        this.resetUpload();
      }
    });

    xhr.addEventListener('error', () => {
      Toast.show('上传失败，请检查网络连接');
      this.resetUpload();
    });

    xhr.open('POST', `${this.API_BASE}/upload`);
    xhr.send(formData);
  },

  async loadMyImages() {
    const { myImagesLoading, myImagesEmpty, myImagesGrid } = this.elements;

    myImagesLoading.classList.remove('hidden');
    myImagesEmpty.classList.add('hidden');
    myImagesGrid.innerHTML = '';

    try {
      const resp = await fetch(`${this.API_BASE}/my-images?user_tag=${encodeURIComponent(this.currentUserTag)}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();

      myImagesLoading.classList.add('hidden');

      if (!data.success) {
        Toast.show(data.error || '加载失败');
        return;
      }

      if (!data.images || data.images.length === 0) {
        myImagesEmpty.classList.remove('hidden');
        return;
      }

      data.images.forEach(img => {
        myImagesGrid.appendChild(this.createImageCard(img));
      });
    } catch (error) {
      console.error('加载文件列表失败:', error);
      myImagesLoading.classList.add('hidden');
      Toast.show('加载文件列表失败，请检查网络连接');
    }
  },

  createImageCard(img) {
    const card = document.createElement('div');
    const isExpired = img.expired;
    const safeUrl = Utils.escapeAttr(img.url || '');
    const displayUrl = Utils.escapeHtml(img.url || '');

    card.className = `${Theme.getCardClass()} rounded-xl overflow-hidden ${isExpired ? 'border-2 border-danger' : ''}`;
    card.innerHTML = `
      <div class="relative">
        <img src="${displayUrl}" alt="图片" class="w-full h-40 object-cover ${isExpired ? 'opacity-50' : ''}" loading="lazy"
             onerror="this.style.display='none'">
        ${isExpired ? '<span class="absolute top-2 right-2 bg-danger text-white text-xs px-2 py-1 rounded">已过期</span>' : ''}
      </div>
      <div class="p-3">
        <p class="text-xs text-gray-400 mb-1">${Utils.formatDate(img.created_at)}</p>
        <p class="text-xs ${isExpired ? 'text-danger' : 'text-gray-500'}">${Utils.formatTimeLeft(img.expire_at)}</p>
        <p class="text-xs text-gray-500 mt-1">${Utils.formatBytes(img.size)}</p>
        <button class="mt-2 w-full bg-primary/20 text-primary text-xs px-2 py-1 rounded hover:bg-primary/30 transition-colors" data-url="${safeUrl}">
          <i class="fa fa-copy mr-1"></i>复制链接
        </button>
      </div>
    `;

    const copyBtn = card.querySelector('button[data-url]');
    copyBtn.addEventListener('click', () => Clipboard.copy(copyBtn.dataset.url));

    return card;
  },

  resetUpload() {
    this.elements.uploadProgress.classList.add('hidden');
    this.elements.uploadResult.classList.add('hidden');
    this.elements.uploadArea.classList.remove('hidden');
    this.elements.fileInput.value = '';
  }
};

function navigateTo(page) {
  App.navigateTo(page);
}

function copyLink(inputId) {
  Clipboard.copyFromInput(inputId);
}

function resetUpload() {
  App.resetUpload();
}

document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  App.init();
});
