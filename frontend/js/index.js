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
    const savedTag = localStorage.getItem('userTag');
    if (savedTag && savedTag !== 'default' && savedTag !== '[usertag]') {
      this.currentUserTag = savedTag;
      this.elements.userTagInput.value = savedTag;
      this.elements.navMy.classList.remove('hidden');
    }
  },

  navigateTo(page) {
    if (page === 'my-images') {
      const tag = this.elements.userTagInput.value.trim();
      if (!tag) {
        Toast.show('请先输入用户名');
        this.elements.userTagInput.focus();
        return;
      }
      window.location.href = `/${encodeURIComponent(tag)}/`;
      return;
    }

    if (page === 'upload') {
      window.location.href = '/';
      return;
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

    if (userTag !== 'default' && userTag !== '[usertag]') {
      this.currentUserTag = userTag;
      localStorage.setItem('userTag', userTag);
      this.elements.navMy.classList.remove('hidden');
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
        try {
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
        } catch (e) {
          console.error('Parse response failed:', e, xhr.responseText);
          Toast.show('解析响应失败');
          this.resetUpload();
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          Toast.show(error.error || '上传失败');
        } catch {
          console.error('Upload failed:', xhr.status, xhr.responseText);
          Toast.show(`上传失败 (${xhr.status})`);
        }
        this.resetUpload();
      }
    });

    xhr.addEventListener('error', () => {
      console.error('Network error');
      Toast.show('上传失败，请检查网络连接');
      this.resetUpload();
    });

    xhr.addEventListener('timeout', () => {
      console.error('Request timeout');
      Toast.show('上传超时，请重试');
      this.resetUpload();
    });

    xhr.timeout = 60000;
    xhr.open('POST', `${this.API_BASE}/upload`);
    xhr.send(formData);
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
