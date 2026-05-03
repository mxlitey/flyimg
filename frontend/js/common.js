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
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/</g, '\\x3C')
      .replace(/>/g, '\\x3E');
  },

  formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  formatTimeLeft(expireAt) {
    const expireDate = new Date(expireAt);
    const hoursLeft = Math.round((expireDate - Date.now()) / (1000 * 60 * 60));
    return hoursLeft > 0 ? `${hoursLeft}小时后过期` : '已过期';
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

  init() {
    this.toggleBtn = document.getElementById('theme-toggle');
    this.moonIcon = document.getElementById('theme-icon-moon');
    this.lightIcon = document.getElementById('theme-icon-light');

    this.apply();

    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggle());
    }
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
    const isDark = document.documentElement.classList.contains('dark');

    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
      document.body.classList.add('bg-gray-50', 'text-gray-900');
      document.body.classList.remove('bg-gradient-to-b', 'from-dark-900', 'to-dark-800', 'text-white');
      this.switchGlassClass('glass', 'glass-light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
      document.body.classList.add('bg-gradient-to-b', 'from-dark-900', 'to-dark-800', 'text-white');
      document.body.classList.remove('bg-gray-50', 'text-gray-900');
      this.switchGlassClass('glass-light', 'glass');
    }

    this.updateIcon();
    this.applyThemeInputs();
  },

  switchGlassClass(fromClass, toClass) {
    document.querySelectorAll(`.${fromClass}`).forEach(el => {
      el.classList.remove(fromClass);
      el.classList.add(toClass);
    });
  },

  updateIcon() {
    const isDark = document.documentElement.classList.contains('dark');
    if (this.moonIcon) this.moonIcon.classList.toggle('hidden', isDark);
    if (this.lightIcon) this.lightIcon.classList.toggle('hidden', !isDark);
  },

  applyThemeInputs() {
    const isDark = document.documentElement.classList.contains('dark');
    document.querySelectorAll('.theme-input').forEach(el => {
      if (isDark) {
        el.style.backgroundColor = '#334155';
        el.style.borderColor = '#475569';
        el.style.color = '#ffffff';
      } else {
        el.style.backgroundColor = '#f9fafb';
        el.style.borderColor = '#d1d5db';
        el.style.color = '#111827';
      }
    });
  },

  getCardClass() {
    return document.documentElement.classList.contains('dark') ? 'glass' : 'glass-light';
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
