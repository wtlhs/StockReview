'use strict';

/* ===== App State ===== */
const App = {
  currentSessionId: null,
  currentPage: 'home',
  pendingScanData: null,
  editingRecordId: null,

  /* ===== Page Navigation ===== */
  showPage(pageId) {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    this.currentPage = pageId;
  },

  /* ===== Toast ===== */
  showToast(message, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast' + (isError ? ' error' : '');
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  },

  /* ===== Home: Session List ===== */
  async refreshSessionList() {
    const sessions = await DB.getAllSessions();
    const container = document.getElementById('session-list');

    if (sessions.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128203;</div><p>暂无盘点会话<br>点击下方按钮创建新盘点</p></div>';
      return;
    }

    container.innerHTML = sessions.map((s) => {
      const name = Utils.esc(s.name);
      const date = Utils.formatDate(s.createdAt);
      return '<div class="session-card" data-id="' + s.id + '">' +
        '<div class="session-info">' +
          '<div class="session-name">' + name + '</div>' +
          '<div class="session-meta">' + date + '</div>' +
        '</div>' +
        '<div class="session-count">' + s.recordCount + ' 条</div>' +
        '<div class="session-actions">' +
          '<button class="btn btn-sm btn-secondary btn-delete-session" data-id="' + s.id + '" title="删除会话">&#128465;</button>' +
        '</div>' +
      '</div>';
    }).join('');

    container.querySelectorAll('.session-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete-session')) {
          e.stopPropagation();
          this._confirmDeleteSession(card.dataset.id);
          return;
        }
        this.openSession(card.dataset.id);
      });
    });
  },

  /* ===== Session Detail ===== */
  async openSession(sessionId) {
    this.currentSessionId = sessionId;
    const session = await DB.getSession(sessionId);
    if (!session) {
      this.showToast('会话不存在', true);
      this.showPage('page-home');
      this.refreshSessionList();
      return;
    }

    document.getElementById('session-title').textContent = session.name;
    await this.refreshRecordList();
    this.showPage('page-session');
  },

  async refreshRecordList() {
    const records = await DB.getRecordsBySession(this.currentSessionId);
    const container = document.getElementById('record-list');
    const countEl = document.getElementById('record-count');
    countEl.textContent = '共 ' + records.length + ' 条记录';

    if (records.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128227;</div><p>还没有扫码记录<br>点击下方按钮开始扫码</p></div>';
      return;
    }

    container.innerHTML = records.map((r, i) => {
      return '<div class="record-card" data-id="' + r.id + '">' +
        '<div class="record-index">' + (i + 1) + '</div>' +
        '<div class="record-body">' +
          '<div class="record-title">' + Utils.esc(r.palletNumber) + '</div>' +
          '<div class="record-subtitle">' +
            '零件: ' + Utils.esc(r.partNumber) + ' &nbsp;|&nbsp; 批次: ' + Utils.esc(r.batchNumber) +
          '</div>' +
          '<div class="record-subtitle">' +
            '标签:' + Utils.esc(r.qrQuantity) + ' &nbsp; ' +
            '实际:<strong>' + (r.actualQuantity != null ? r.actualQuantity : '—') + '</strong> &nbsp; ' +
            '货架:<strong>' + Utils.esc(r.shelfNumber || '—') + '</strong>' +
            (r.notes ? ' &nbsp;备注:' + Utils.esc(r.notes) : '') +
          '</div>' +
        '</div>' +
        '<div class="record-actions">' +
          '<button class="btn-icon btn-edit-record" data-id="' + r.id + '" title="编辑">&#9998;</button>' +
          '<button class="btn-icon danger btn-delete-record" data-id="' + r.id + '" title="删除">&#128465;</button>' +
        '</div>' +
      '</div>';
    }).join('');

    container.querySelectorAll('.btn-edit-record').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._editRecord(btn.dataset.id);
      });
    });

    container.querySelectorAll('.btn-delete-record').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._confirmDeleteRecord(btn.dataset.id);
      });
    });
  },

  /* ===== Scanner Page ===== */
  async openScanner() {
    this.showPage('page-scanner');
    this.pendingScanData = null;
    document.getElementById('scan-result-area').innerHTML = '';
    document.getElementById('recent-scans').innerHTML = '';
    await this._renderRecentScans();
    await Scanner.start('scanner-container', (parsed) => {
      this.pendingScanData = parsed;
      this._showScanForm(parsed);
    });
  },

  _buildScanInfoHtml(parsed) {
    return '<div class="scan-result"><div class="field-grid">' +
      '<div class="field"><div class="field-label">数量</div><div class="field-value">' + Utils.esc(parsed.qrQuantity) + '</div></div>' +
      '<div class="field"><div class="field-label">批次号</div><div class="field-value">' + Utils.esc(parsed.batchNumber) + '</div></div>' +
      '<div class="field full-width"><div class="field-label">托盘号</div><div class="field-value">' + Utils.esc(parsed.palletNumber) + '</div></div>' +
      '<div class="field full-width"><div class="field-label">零件号</div><div class="field-value">' + Utils.esc(parsed.partNumber) + '</div></div>' +
    '</div></div>';
  },

  /* ===== Duplicate Check ===== */
  _pendingDuplicate: null,
  _existingDuplicateRecord: null,

  async _checkDuplicate(palletNumber) {
    const records = await DB.getRecordsBySession(this.currentSessionId);
    return records.find((r) => r.palletNumber === palletNumber) || null;
  },

  async _showScanForm(parsed) {
    // 检查同一会话中是否已有相同托盘号
    const existing = await this._checkDuplicate(parsed.palletNumber);
    if (existing) {
      this._pendingDuplicate = parsed;
      this._existingDuplicateRecord = existing;
      document.getElementById('duplicate-message').textContent =
        '托盘号「' + parsed.palletNumber + '」已有盘点记录（零件: ' + existing.partNumber +
        '，实际数量: ' + (existing.actualQuantity != null ? existing.actualQuantity : '—') +
        '），请选择操作：';
      document.getElementById('modal-duplicate').classList.add('active');
      return;
    }

    this._renderScanForm(parsed);
  },

  _renderScanForm(parsed) {
    // 收起摄像头区域，腾出表单空间
    var scannerContainer = document.getElementById('scanner-container');
    if (scannerContainer) scannerContainer.classList.add('collapsed');

    const area = document.getElementById('scan-result-area');
    area.innerHTML = this._buildScanInfoHtml(parsed) +
      '<form id="scan-form">' +
        '<div class="form-row">' +
          '<div class="form-group"><label for="scan-shelf">货架号</label><input type="text" id="scan-shelf" placeholder="如 A-03" autocomplete="off" autofocus></div>' +
          '<div class="form-group"><label for="scan-quantity">实际数量</label><input type="number" id="scan-quantity" placeholder="输入数量" inputmode="numeric" value="' + Utils.esc(parsed.qrQuantity) + '"></div>' +
        '</div>' +
        '<div class="form-group"><label for="scan-notes">备注</label><textarea id="scan-notes" placeholder="选填备注信息"></textarea></div>' +
        '<button type="submit" class="btn btn-success btn-block">&#10004; 确认保存</button>' +
        '<button type="button" class="btn btn-secondary btn-block" id="btn-scan-cancel" style="margin-top:8px;">取消扫码</button>' +
      '</form>';

    document.getElementById('btn-scan-cancel').addEventListener('click', () => this._cancelScan());
    document.getElementById('scan-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._saveScanRecord(parsed);
    });
    var shelfInput = document.getElementById('scan-shelf');
    shelfInput.focus();
    // iOS 键盘弹出后确保输入框可见
    setTimeout(function() { shelfInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
  },

  async _saveScanRecord(parsed) {
    const shelf = document.getElementById('scan-shelf').value.trim();
    const actualQtyStr = document.getElementById('scan-quantity').value.trim();
    const notes = document.getElementById('scan-notes').value.trim();

    if (!shelf) {
      this.showToast('请输入货架号', true);
      return;
    }

    const actualQuantity = Utils.parsePositiveInt(actualQtyStr);

    const record = {
      id: Utils.generateId(),
      sessionId: this.currentSessionId,
      qrQuantity: parsed.qrQuantity,
      partNumber: parsed.partNumber,
      batchNumber: parsed.batchNumber,
      palletNumber: parsed.palletNumber,
      shelfNumber: shelf,
      actualQuantity,
      notes,
      scannedAt: Utils.nowISO()
    };

    try {
      // 如果是覆盖模式，先删除旧记录
      if (this._existingDuplicateRecord) {
        await DB.deleteRecord(this._existingDuplicateRecord.id);
        this._existingDuplicateRecord = null;
      }
      await DB.createRecord(record);
      this.pendingScanData = null;
      document.getElementById('scan-result-area').innerHTML = '';
      this.showToast('保存成功');
      await this._renderRecentScans();
      await Scanner.start('scanner-container', (p) => {
        this.pendingScanData = p;
        this._showScanForm(p);
      });
    } catch (err) {
      this.showToast('保存失败', true);
    }
  },

  _cancelScan() {
    this.pendingScanData = null;
    document.getElementById('scan-result-area').innerHTML = '';
    Scanner.start('scanner-container', (parsed) => {
      this.pendingScanData = parsed;
      this._showScanForm(parsed);
    });
  },

  async _renderRecentScans() {
    const records = await DB.getRecordsBySession(this.currentSessionId);
    const recent = records.slice(-5).reverse();
    const container = document.getElementById('recent-scans');

    if (recent.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = '<div class="records-header"><h2>最近扫码</h2></div>' +
      recent.map((r) =>
        '<div class="record-card">' +
          '<div class="record-body">' +
            '<div class="record-title">' + Utils.esc(r.palletNumber) + '</div>' +
            '<div class="record-subtitle">' + Utils.esc(r.partNumber) + ' &nbsp;|&nbsp; 货架: ' + Utils.esc(r.shelfNumber) + ' &nbsp;|&nbsp; 实际: ' + (r.actualQuantity != null ? r.actualQuantity : '—') + '</div>' +
          '</div>' +
        '</div>'
      ).join('');
  },

  /* ===== Edit Record ===== */
  async _editRecord(recordId) {
    const record = await DB.getRecord(recordId);
    if (!record) return;
    this.editingRecordId = recordId;

    document.getElementById('edit-scan-info').innerHTML = this._buildScanInfoHtml(record);

    document.getElementById('edit-shelf').value = record.shelfNumber || '';
    document.getElementById('edit-quantity').value = record.actualQuantity != null ? record.actualQuantity : '';
    document.getElementById('edit-notes').value = record.notes || '';
    this.showPage('page-edit');
    document.getElementById('edit-shelf').focus();
  },

  async _saveEditedRecord() {
    const record = await DB.getRecord(this.editingRecordId);
    if (!record) return;

    const shelf = document.getElementById('edit-shelf').value.trim();
    const actualQtyStr = document.getElementById('edit-quantity').value.trim();
    const notes = document.getElementById('edit-notes').value.trim();

    if (!shelf) {
      this.showToast('请输入货架号', true);
      return;
    }

    const actualQuantity = Utils.parsePositiveInt(actualQtyStr);

    const updated = Object.assign({}, record, {
      shelfNumber: shelf,
      actualQuantity,
      notes
    });

    await DB.updateRecord(updated);
    this.editingRecordId = null;
    this.showToast('保存成功');
    await this.refreshRecordList();
    this.showPage('page-session');
  },

  /* ===== Delete Confirmations ===== */
  async _confirmDeleteSession(sessionId) {
    const s = await DB.getSession(sessionId);
    if (!s) {
      this.showToast('会话不存在', true);
      return;
    }
    document.getElementById('delete-message').textContent =
      '确定要删除会话「' + s.name + '」及其所有记录吗？此操作不可恢复。';
    document.getElementById('modal-confirm-delete').dataset.type = 'session';
    document.getElementById('modal-confirm-delete').dataset.id = sessionId;
    document.getElementById('modal-confirm-delete').classList.add('active');
  },

  _confirmDeleteRecord(recordId) {
    document.getElementById('delete-message').textContent =
      '确定要删除这条扫码记录吗？此操作不可恢复。';
    document.getElementById('modal-confirm-delete').dataset.type = 'record';
    document.getElementById('modal-confirm-delete').dataset.id = recordId;
    document.getElementById('modal-confirm-delete').classList.add('active');
  },

  async _executeDelete() {
    const modal = document.getElementById('modal-confirm-delete');
    const type = modal.dataset.type;
    const id = modal.dataset.id;
    modal.classList.remove('active');

    if (type === 'session') {
      await DB.deleteSession(id);
      this.showToast('会话已删除');
      this.refreshSessionList();
    } else {
      await DB.deleteRecord(id);
      this.showToast('记录已删除');
      await this.refreshRecordList();
    }
  },

  /* ===== Export ===== */
  async _doExport(records, filename) {
    if (!records || records.length === 0) {
      this.showToast('没有可导出的记录', true);
      return;
    }
    try {
      ExportUtils.toExcel(records, filename);
      this.showToast('导出成功');
    } catch (err) {
      this.showToast('导出失败', true);
    }
  },

  async _exportCurrentSession() {
    const records = await DB.getRecordsBySession(this.currentSessionId);
    const session = await DB.getSession(this.currentSessionId);
    const name = session ? session.name.replace(/[^\w\u4e00-\u9fa5]/g, '_') : '盘点';
    const timestamp = Utils.formatDate(new Date().toISOString()).replace(/[ :]/g, '-');
    await this._doExport(records, name + '_' + timestamp + '.xlsx');
  },

  async _exportAll() {
    const sessions = await DB.getAllSessions();
    if (sessions.length === 0) {
      this.showToast('没有可导出的数据', true);
      return;
    }
    const allRecords = [];
    for (const s of sessions) {
      const recs = await DB.getRecordsBySession(s.id);
      for (const r of recs) {
        allRecords.push(Object.assign({}, r, { _sessionName: s.name }));
      }
    }
    const timestamp = Utils.formatDate(new Date().toISOString()).replace(/[ :]/g, '-');
    await this._doExport(allRecords, '全部盘点_' + timestamp + '.xlsx');
  },

  /* ===== SW Update ===== */
  _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    // 刷新后检查是否刚完成更新
    if (sessionStorage.getItem('sw-updated') === 'true') {
      sessionStorage.removeItem('sw-updated');
      setTimeout(() => this.showToast('应用已更新'), 500);
    }

    navigator.serviceWorker.register('sw.js').then((reg) => {
      // 主动检查更新（避免浏览器缓存 SW 不检查）
      reg.update();

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            this.showToast('发现新版本，正在更新...');
          }
        });
      });
    }).catch(() => {});

    // 新 SW 接管后标记并刷新
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      sessionStorage.setItem('sw-updated', 'true');
      window.location.reload();
    });
  },

  /* ===== Init ===== */
  async init() {
    await DB.open();
    this._registerServiceWorker();
    this.refreshSessionList();
    this._bindEvents();
  },

  _bindEvents() {
    // 新建会话
    document.getElementById('btn-new-session').addEventListener('click', () => {
      document.getElementById('input-session-name').value =
        new Date().toLocaleDateString('zh-CN') + ' 盘点';
      document.getElementById('modal-new-session').classList.add('active');
      setTimeout(() => document.getElementById('input-session-name').focus(), 50);
    });

    // 创建会话
    document.getElementById('btn-create-session').addEventListener('click', async () => {
      const name = document.getElementById('input-session-name').value.trim();
      if (!name) {
        this.showToast('请输入会话名称', true);
        return;
      }
      document.getElementById('modal-new-session').classList.remove('active');
      const session = await DB.createSession(name);
      this.refreshSessionList();
      this.openSession(session.id);
      this.openScanner();
    });

    // 取消新建
    document.getElementById('btn-cancel-session').addEventListener('click', () => {
      document.getElementById('modal-new-session').classList.remove('active');
    });

    // 返回首页
    document.getElementById('btn-back-home').addEventListener('click', () => {
      this.showPage('page-home');
      this.refreshSessionList();
    });

    // 返回会话详情
    document.getElementById('btn-back-session').addEventListener('click', () => {
      Scanner.stop();
      this.showPage('page-session');
      this.refreshRecordList();
    });

    // 返回编辑页 → 会话详情
    document.getElementById('btn-back-from-edit').addEventListener('click', () => {
      this.editingRecordId = null;
      this.showPage('page-session');
      this.refreshRecordList();
    });

    // 编辑表单提交
    document.getElementById('edit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._saveEditedRecord();
    });

    // 删除确认
    document.getElementById('btn-cancel-delete').addEventListener('click', () => {
      document.getElementById('modal-confirm-delete').classList.remove('active');
    });
    document.getElementById('btn-confirm-delete').addEventListener('click', () => {
      this._executeDelete();
    });

    // 导出当前会话
    document.getElementById('btn-export-session').addEventListener('click', () => {
      this._exportCurrentSession();
    });

    // 导出全部
    document.getElementById('btn-export-all').addEventListener('click', () => {
      this._exportAll();
    });

    // 会话详情页的扫码按钮
    document.getElementById('btn-start-scan').addEventListener('click', () => {
      this.openScanner();
    });

    // 点击模态框背景关闭
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });

    // 重复扫码 - 覆盖已有记录
    document.getElementById('btn-dup-overwrite').addEventListener('click', () => {
      document.getElementById('modal-duplicate').classList.remove('active');
      const parsed = this._pendingDuplicate;
      this._pendingDuplicate = null;
      this._renderScanForm(parsed);
    });

    // 重复扫码 - 新建记录
    document.getElementById('btn-dup-new').addEventListener('click', () => {
      document.getElementById('modal-duplicate').classList.remove('active');
      const parsed = this._pendingDuplicate;
      this._pendingDuplicate = null;
      this._existingDuplicateRecord = null;
      this._renderScanForm(parsed);
    });

    // 重复扫码 - 取消
    document.getElementById('btn-dup-cancel').addEventListener('click', () => {
      document.getElementById('modal-duplicate').classList.remove('active');
      this._pendingDuplicate = null;
      this._existingDuplicateRecord = null;
      document.getElementById('scan-result-area').innerHTML = '';
      Scanner.start('scanner-container', (parsed) => {
        this.pendingScanData = parsed;
        this._showScanForm(parsed);
      });
    });

    // 页面离开前停止扫描
    window.addEventListener('beforeunload', () => Scanner.stop());
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
