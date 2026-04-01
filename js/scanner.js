'use strict';

const Scanner = {
  _video: null,
  _canvas: null,
  _ctx: null,
  _isRunning: false,
  _lastCode: null,
  _lastTime: 0,
  _debounceMs: 1500,
  _containerId: null,
  _stream: null,
  _rafId: null,

  /**
   * 创建扫描聚焦框覆盖层
   */
  _createOverlay(container) {
    const overlay = document.createElement('div');
    overlay.className = 'scan-overlay';

    // 半透明遮罩 + 中心透明框
    const frame = document.createElement('div');
    frame.className = 'scan-frame';

    // 四角标记
    ['tl', 'tr', 'bl', 'br'].forEach(function(pos) {
      var corner = document.createElement('span');
      corner.className = 'scan-corner scan-corner-' + pos;
      frame.appendChild(corner);
    });

    // 扫描动画线
    var line = document.createElement('div');
    line.className = 'scan-line';
    frame.appendChild(line);

    overlay.appendChild(frame);
    container.appendChild(overlay);
  },

  /**
   * 移除覆盖层
   */
  _removeOverlay() {
    var container = document.getElementById(this._containerId);
    if (!container) return;
    var overlay = container.querySelector('.scan-overlay');
    if (overlay) overlay.remove();
  },

  /**
   * 启动摄像头扫描
   */
  async start(containerId, onSuccess) {
    this._containerId = containerId;
    await this.stop();

    var container = document.getElementById(containerId);
    if (!container) return;

    // 显示容器
    container.classList.remove('collapsed');

    // 创建 video 元素
    var video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.muted = true;
    container.appendChild(video);
    this._video = video;

    // 添加扫描聚焦框
    this._createOverlay(container);

    // 创建隐藏 canvas 用于帧分析
    this._canvas = document.createElement('canvas');
    this._canvas.style.display = 'none';
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });

    try {
      // 请求后置摄像头
      var constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      this._stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = this._stream;

      // 等待视频加载
      await new Promise(function(resolve, reject) {
        video.onloadedmetadata = function() {
          video.play();
          resolve();
        };
        video.onerror = reject;
        setTimeout(function() { reject(new Error('video load timeout')); }, 8000);
      });

      this._isRunning = true;
      this._startScanning(onSuccess);
    } catch (err) {
      App.showToast('摄像头启动失败，请检查权限', true);
      await this.stop();
    }
  },

  /**
   * 开始扫描循环
   */
  _startScanning(onSuccess) {
    const scan = () => {
      if (!this._isRunning) return;

      const video = this._video;
      const canvas = this._canvas;
      const ctx = this._ctx;

      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
          this._onScanSuccess(code.data, onSuccess);
          return;
        }
      }

      this._rafId = requestAnimationFrame(scan);
    };

    this._rafId = requestAnimationFrame(scan);
  },

  /**
   * 停止扫描
   */
  async stop() {
    this._isRunning = false;

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    if (this._stream) {
      this._stream.getTracks().forEach(function(t) { t.stop(); });
      this._stream = null;
    }

    if (this._video) {
      this._video.srcObject = null;
      this._video.remove();
      this._video = null;
    }

    // 移除扫描覆盖层
    this._removeOverlay();

    this._canvas = null;
    this._ctx = null;
  },

  _onScanSuccess(decodedText, onSuccess) {
    const now = Date.now();
    if (decodedText === this._lastCode && (now - this._lastTime) < this._debounceMs) {
      // 继续扫描循环（非重复码才触发）
      this._startScanning(onSuccess);
      return;
    }
    this._lastCode = decodedText;
    this._lastTime = now;

    const parsed = Utils.parseQR(decodedText);
    if (!parsed) {
      App.showToast('二维码格式无法识别', true);
      Utils.vibrate([100, 50, 100]);
      this._startScanning(onSuccess);
      return;
    }

    Utils.vibrate(200);

    // 停止扫描显示结果
    this.stop();

    onSuccess(parsed, decodedText);
  }
};
