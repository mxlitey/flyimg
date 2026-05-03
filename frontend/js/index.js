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
      navMy: document.getElementById('nav-my'),
    };
  },

  bindEvents() {
    const { uploadArea, fileInput } = this.elements;

    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) this.uploadFile(e.target.files[0]);
    });

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('border-primary', 'bg-primary/10');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('border-primary', 'bg-primary/10');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('border-primary', 'bg-primary/10');
      if (e.dataTransfer.files.length > 0) this.uploadFile(e.dataTransfer.files[0]);
    });

    document.addEventListener('paste', (e) => {
      if (e.clipboardData.files.length > 0) this.uploadFile(e.clipboardData.files[0]);
    });
  },

  initDisplayConfig() {
    if (typeof DISPLAY_CONFIG === 'undefined') return;
    document.getElementById('expire-hours-text').textContent = DISPLAY_CONFIG.expireHours;
    document.getElementById('allowed-types-text').textContent = DISPLAY_CONFIG.allowedTypesDisplay;
    document.getElementById('max-size-text').textContent = DISPLAY_CONFIG.maxFileSizeMB;
    document.getElementById('footer-expire-hours').textContent = DISPLAY_CONFIG.expireHours;
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
    }
  },

  async uploadFile(file) {
    const el = this.elements;
    el.uploadArea.classList.add('hidden');
    el.uploadProgress.classList.remove('hidden');
    el.progressBar.style.width = '0%';
    el.uploadStatusText.textContent = '正在上传...';
    el.uploadStatus.classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', file);

    const userTag = el.userTagInput.value.trim() || 'default';
    formData.append('user_tag', userTag);

    if (userTag !== 'default' && userTag !== '[usertag]') {
      this.currentUserTag = userTag;
      localStorage.setItem('userTag', userTag);
      el.navMy.classList.remove('hidden');
    }

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        el.progressBar.style.width = `${10 + (e.loaded / e.total) * 80}%`;
      }
    });

    xhr.addEventListener('load', () => {
      el.progressBar.style.width = '100%';

      if (xhr.status === 200) {
        try {
          const result = JSON.parse(xhr.responseText);
          el.uploadProgress.classList.add('hidden');
          el.uploadResult.classList.remove('hidden');

          el.previewImage.src = result.url;
          el.directLink.value = result.url;
          el.markdownLink.value = result.markdown;
          el.htmlLink.value = result.html;

          const hoursLeft = Math.round((new Date(result.expireAt) - Date.now()) / 3600000);
          el.expireTime.textContent = `${hoursLeft}小时后过期`;
          Toast.show('上传成功！');
        } catch {
          Toast.show('解析响应失败');
          this.resetUpload();
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          Toast.show(error.error || '上传失败');
        } catch {
          Toast.show(`上传失败 (${xhr.status})`);
        }
        this.resetUpload();
      }
    });

    xhr.addEventListener('error', () => {
      Toast.show('上传失败，请检查网络连接');
      this.resetUpload();
    });

    xhr.addEventListener('timeout', () => {
      Toast.show('上传超时，请重试');
      this.resetUpload();
    });

    xhr.timeout = 60000;
    xhr.open('POST', `${this.API_BASE}/upload`);
    xhr.send(formData);
  },

  resetUpload() {
    const el = this.elements;
    el.uploadProgress.classList.add('hidden');
    el.uploadResult.classList.add('hidden');
    el.uploadArea.classList.remove('hidden');
    el.fileInput.value = '';
  }
};

function navigateTo(page) { App.navigateTo(page); }
function copyLink(inputId) { Clipboard.copyFromInput(inputId); }
function resetUpload() { App.resetUpload(); }

document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  App.init();
});
