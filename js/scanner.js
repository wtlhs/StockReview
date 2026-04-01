'use strict';

const Scanner = {
  _scanner: null,
  _isRunning: false,
  _lastCode: null,
  _lastTime: 0,
  _debounceMs: 1500,
  _containerId: null,

  /**
   * 启动摄像头扫描
   */
  async start(containerId, onSuccess) {
    this._containerId = containerId;

    // 确保先完全停止旧实例
    await this.stop();

    this._scanner = new Html5Qrcode(containerId);
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    };

    try {
      await this._scanner.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => this._onScanSuccess(decodedText, onSuccess),
        () => {}
      );
      this._isRunning = true;
    } catch (err) {
      App.showToast('摄像头启动失败，请检查权限', true);
    }
  },

  /**
   * 停止扫描（等待完成）
   */
  async stop() {
    if (this._scanner && this._isRunning) {
      try {
        await this._scanner.stop();
      } catch (_) {
        // 扫描器可能已停止
      }
      this._isRunning = false;
    }
    if (this._scanner) {
      try {
        this._scanner.clear();
      } catch (_) {}
      this._scanner = null;
    }
  },

  _onScanSuccess(decodedText, onSuccess) {
    const now = Date.now();
    if (decodedText === this._lastCode && (now - this._lastTime) < this._debounceMs) {
      return;
    }
    this._lastCode = decodedText;
    this._lastTime = now;

    const parsed = Utils.parseQR(decodedText);
    if (!parsed) {
      App.showToast('二维码格式无法识别', true);
      Utils.vibrate([100, 50, 100]);
      return;
    }

    Utils.vibrate(200);

    // 停止扫描显示结果（fire-and-forget，因为 _onScanSuccess 不会重入）
    this.stop();

    onSuccess(parsed, decodedText);
  }
};
