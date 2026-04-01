'use strict';

const Utils = {
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  },

  formatDate(isoString) {
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  nowISO() {
    return new Date().toISOString();
  },

  /**
   * HTML 转义，防止 XSS
   */
  esc(str) {
    if (str == null) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  },

  /**
   * 解析二维码文本
   * 格式: 数量,忽略,批次号,托盘号,零件号(空格格式)
   */
  parseQR(text) {
    if (!text || typeof text !== 'string') return null;
    const parts = text.split(',');
    if (parts.length < 5) return null;
    return {
      qrQuantity: parts[0].trim(),
      batchNumber: parts[2].trim(),
      palletNumber: parts[3].trim(),
      partNumber: parts[4].trim()
    };
  },

  /**
   * 验证并解析正整数
   */
  parsePositiveInt(value) {
    if (!value) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  },

  vibrate(ms = 100) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }
};
