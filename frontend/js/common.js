const Utils = {
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  escapeAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  formatDate(date) {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  formatExpireTime(expireAt) {
    const diff = new Date(expireAt) - Date.now();
    if (diff <= 0) return '已过期';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);

    if (hours >= 24) return '>1天';
    if (hours > 0) return `${hours}小时${minutes}分后过期`;
    return `${minutes}分钟后过期`;
  },

  formatDurationLabel(d) {
    if (d === 0) return '永不过期';
    const hours = Math.floor(d / 60);
    const mins = d % 60;
    if (hours > 0) return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
    return `${mins}分钟`;
  }
};

const Toast = {
  element: null,

  init() {
    this.element = document.getElementById('toast');
  },

  show(message) {
    if (!this.element) this.init();
    this.element.textContent = message;
    this.element.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
      this.element.classList.add('translate-y-20', 'opacity-0');
    }, 2500);
  }
};

const Theme = {
  toggleBtn: null,
  moonIcon: null,
  lightIcon: null,
  onChangeCallbacks: [],

  init() {
    this.toggleBtn = document.getElementById('theme-toggle');
    this.moonIcon = document.getElementById('theme-icon-moon');
    this.lightIcon = document.getElementById('theme-icon-light');
    this.apply();

    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggle());
    }
  },

  onChange(callback) {
    this.onChangeCallbacks.push(callback);
  },

  triggerChange() {
    this.onChangeCallbacks.forEach(cb => cb());
  },

  isDark() {
    return document.documentElement.classList.contains('dark');
  },

  apply() {
    const isDark = localStorage.theme === 'dark' ||
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('bg-gradient-to-b', 'from-dark-900', 'to-dark-800', 'text-white');
      document.body.classList.remove('bg-gray-50', 'text-gray-900');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.add('bg-gray-50', 'text-gray-900');
      document.body.classList.remove('bg-gradient-to-b', 'from-dark-900', 'to-dark-800', 'text-white');
      this.switchGlassClass('glass', 'glass-light');
    }

    this.updateIcon();
    this.applyThemeInputs();
  },

  toggle() {
    const dark = !this.isDark();

    if (dark) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
      document.body.classList.add('bg-gradient-to-b', 'from-dark-900', 'to-dark-800', 'text-white');
      document.body.classList.remove('bg-gray-50', 'text-gray-900');
      this.switchGlassClass('glass-light', 'glass');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
      document.body.classList.add('bg-gray-50', 'text-gray-900');
      document.body.classList.remove('bg-gradient-to-b', 'from-dark-900', 'to-dark-800', 'text-white');
      this.switchGlassClass('glass', 'glass-light');
    }

    this.updateIcon();
    this.applyThemeInputs();
    this.triggerChange();
  },

  switchGlassClass(fromClass, toClass) {
    document.querySelectorAll(`.${fromClass}`).forEach(el => {
      el.classList.remove(fromClass);
      el.classList.add(toClass);
    });
  },

  updateIcon() {
    const dark = this.isDark();
    if (this.moonIcon) this.moonIcon.classList.toggle('hidden', dark);
    if (this.lightIcon) this.lightIcon.classList.toggle('hidden', !dark);
  },

  applyThemeInputs() {
    const dark = this.isDark();
    document.querySelectorAll('.theme-input').forEach(el => {
      el.style.backgroundColor = dark ? '#334155' : '#f9fafb';
      el.style.borderColor = dark ? '#475569' : '#d1d5db';
      el.style.color = dark ? '#ffffff' : '#111827';
    });
  },

  getCardClass() {
    return this.isDark() ? 'glass' : 'glass-light';
  },

  getThemeColors() {
    const dark = this.isDark();
    return {
      title: dark ? '#ffffff' : '#000000',
      text: dark ? '#d1d5db' : '#374151',
      highlight: dark ? '#ffffff' : '#000000',
      cancelBg: dark ? '#374155' : '#e5e7eb',
      cancelText: dark ? '#ffffff' : '#1f2937',
      filename: dark ? '#d1d5db' : '#1f2937',
      info: dark ? '#9ca3af' : '#6b7280',
    };
  }
};

const Clipboard = {
  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      Toast.show('复制成功！');
      return true;
    } catch {
      Toast.show('复制失败');
      return false;
    }
  },

  async copyFromInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return false;

    try {
      await navigator.clipboard.writeText(input.value);
      Toast.show('复制成功！');
      return true;
    } catch {
      input.select();
      input.setSelectionRange(0, 99999);
      document.execCommand('copy');
      Toast.show('复制成功！');
      return true;
    }
  }
};

window.Utils = Utils;
window.Toast = Toast;
window.Theme = Theme;
window.Clipboard = Clipboard;
