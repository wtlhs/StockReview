'use strict';

/* ===== Status Helpers ===== */
const STATUS_LABELS = { stocked: '已盘点', outbound: '已出库', returned: '已回库' };
const STATUS_CLASSES = { stocked: 'status-stocked', outbound: 'status-outbound', returned: 'status-returned' };

function statusBadge(record) {
  const s = record.status || 'stocked';
  return '<span class="status-badge ' + STATUS_CLASSES[s] + '">' + STATUS_LABELS[s] + '</span>';
}

/* ===== App State ===== */
const App = {
  VERSION: '20260403-09',
  currentSessionId: null,
  currentPage: 'home',
  pendingScanData: null,
  editingRecordId: null,
  _pendingOutboundRecord: null,

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
    const desc = document.getElementById('stock-module-desc');
    desc.textContent = sessions.length + ' 个盘点会话';

    if (sessions.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:13px;">暂无盘点会话</div>';
      return;
    }

    const listHtml = sessions.map((s) => {
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

    container.innerHTML = '<div class="session-list-scroll">' + listHtml + '</div>';

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
          '<div class="record-title">' + Utils.esc(r.palletNumber) + ' ' + statusBadge(r) + '</div>' +
          '<div class="record-subtitle">' +
            '零件: ' + Utils.esc(r.partNumber) + ' &nbsp;|&nbsp; 批次: ' + Utils.esc(r.batchNumber) +
          '</div>' +
          '<div class="record-subtitle">' +
            '标签:' + Utils.esc(r.qrQuantity) + ' &nbsp; ' +
            '实际:<strong>' + (r.actualQuantity != null ? r.actualQuantity : '—') + '</strong> &nbsp; ' +
            '货架:<strong>' + Utils.esc(r.shelfNumber || '—') + '</strong>' +
            (r.invoiceNumber ? ' &nbsp;发票:' + Utils.esc(r.invoiceNumber) : '') +
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
    document.querySelector('#page-scanner .header h1').textContent = '扫码盘点';
    document.getElementById('scanner-container').classList.remove('collapsed');
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
    return await DB.findRecordByPallet(palletNumber);
  },

  async _showScanForm(parsed) {
    const existing = await this._checkDuplicate(parsed.palletNumber);
    if (existing) {
      this._pendingDuplicate = parsed;
      this._existingDuplicateRecord = existing;
      const sameSession = existing.sessionId === this.currentSessionId;
      let sessionHint = '';
      if (!sameSession) {
        const session = await DB.getSession(existing.sessionId);
        sessionHint = '（会话: ' + (session ? session.name : existing.sessionId) + '）';
      }
      document.getElementById('duplicate-message').textContent =
        '托盘号「' + parsed.palletNumber + '」已有记录' + sessionHint +
        '（零件: ' + existing.partNumber +
        '，实际数量: ' + (existing.actualQuantity != null ? existing.actualQuantity : '—') +
        '，状态: ' + STATUS_LABELS[existing.status || 'stocked'] +
        '），请选择操作：';
      document.getElementById('modal-duplicate').classList.add('active');
      return;
    }

    this._renderScanForm(parsed);
  },

  _renderScanForm(parsed) {
    var scannerContainer = document.getElementById('scanner-container');
    if (scannerContainer) scannerContainer.classList.add('collapsed');

    const area = document.getElementById('scan-result-area');
    area.innerHTML = this._buildScanInfoHtml(parsed) +
      '<form id="scan-form">' +
        '<div class="form-row">' +
          '<div class="form-group"><label for="scan-shelf">货架号</label><input type="text" id="scan-shelf" placeholder="选填，如 A-03" autocomplete="off" autofocus></div>' +
          '<div class="form-group"><label for="scan-quantity">实际数量</label><input type="number" id="scan-quantity" placeholder="输入数量" inputmode="numeric" value="' + Utils.esc(parsed.qrQuantity) + '"></div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label for="scan-batch">批次号</label><input type="text" id="scan-batch" placeholder="批次号" autocomplete="off" value="' + Utils.esc(parsed.batchNumber) + '"></div>' +
          '<div class="form-group"><label for="scan-invoice">发票号</label><input type="text" id="scan-invoice" placeholder="选填发票号" autocomplete="off"></div>' +
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
    setTimeout(function() { shelfInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
  },

  async _saveScanRecord(parsed) {
    const shelf = document.getElementById('scan-shelf').value.trim();
    const actualQtyStr = document.getElementById('scan-quantity').value.trim();
    const batchNumber = document.getElementById('scan-batch').value.trim();
    const invoiceNumber = document.getElementById('scan-invoice').value.trim();
    const notes = document.getElementById('scan-notes').value.trim();

    const actualQuantity = Utils.parsePositiveInt(actualQtyStr);

    // 判断新状态：如果原记录为已出库，则更新为已回库
    let newStatus = 'stocked';
    if (this._existingDuplicateRecord && (this._existingDuplicateRecord.status || 'stocked') === 'outbound') {
      newStatus = 'returned';
    }

    const record = {
      id: Utils.generateId(),
      sessionId: this.currentSessionId,
      qrQuantity: parsed.qrQuantity,
      partNumber: parsed.partNumber,
      batchNumber: batchNumber,
      palletNumber: parsed.palletNumber,
      shelfNumber: shelf,
      actualQuantity,
      invoiceNumber,
      notes,
      status: newStatus,
      scannedAt: Utils.nowISO()
    };

    try {
      if (this._existingDuplicateRecord) {
        await DB.deleteRecord(this._existingDuplicateRecord.id);
        this._existingDuplicateRecord = null;
      }
      await DB.createRecord(record);
      this.pendingScanData = null;
      document.getElementById('scan-result-area').innerHTML = '';
      this.showToast(newStatus === 'returned' ? '已回库盘点保存成功' : '保存成功');
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
            '<div class="record-title">' + Utils.esc(r.palletNumber) + ' ' + statusBadge(r) + '</div>' +
            '<div class="record-subtitle">' + Utils.esc(r.partNumber) + ' &nbsp;|&nbsp; 货架: ' + Utils.esc(r.shelfNumber || '—') + ' &nbsp;|&nbsp; 实际: ' + (r.actualQuantity != null ? r.actualQuantity : '—') +
            '</div>' +
          '</div>' +
        '</div>'
      ).join('');
  },

  /* ===== Manual Entry ===== */
  _openManualEntry() {
    Scanner.stop();
    this.showPage('page-scanner');
    this.pendingScanData = null;
    const scannerContainer = document.getElementById('scanner-container');
    scannerContainer.classList.add('collapsed');
    document.getElementById('recent-scans').innerHTML = '';
    document.querySelector('#page-scanner .header h1').textContent = '手动录入';

    const area = document.getElementById('scan-result-area');
    area.innerHTML =
      '<form id="scan-form">' +
        '<div class="form-group"><label for="scan-pallet">托盘号 *</label><input type="text" id="scan-pallet" placeholder="输入托盘号" autocomplete="off" autofocus></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label for="scan-part">零件号</label><input type="text" id="scan-part" placeholder="零件号" autocomplete="off"></div>' +
          '<div class="form-group"><label for="scan-qr-qty">标签数量</label><input type="number" id="scan-qr-qty" placeholder="标签数量" inputmode="numeric"></div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label for="scan-shelf">货架号</label><input type="text" id="scan-shelf" placeholder="选填，如 A-03" autocomplete="off"></div>' +
          '<div class="form-group"><label for="scan-quantity">实际数量</label><input type="number" id="scan-quantity" placeholder="输入数量" inputmode="numeric"></div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label for="scan-batch">批次号</label><input type="text" id="scan-batch" placeholder="批次号" autocomplete="off"></div>' +
          '<div class="form-group"><label for="scan-invoice">发票号</label><input type="text" id="scan-invoice" placeholder="选填发票号" autocomplete="off"></div>' +
        '</div>' +
        '<div class="form-group"><label for="scan-notes">备注</label><textarea id="scan-notes" placeholder="选填备注信息"></textarea></div>' +
        '<button type="submit" class="btn btn-success btn-block">&#10004; 确认保存</button>' +
        '<button type="button" class="btn btn-secondary btn-block" id="btn-scan-cancel" style="margin-top:8px;">取消</button>' +
      '</form>';

    document.getElementById('btn-scan-cancel').addEventListener('click', () => {
      area.innerHTML = '';
      this.showPage('page-session');
      this.refreshRecordList();
    });

    document.getElementById('scan-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._saveManualRecord();
    });

    const palletInput = document.getElementById('scan-pallet');
    palletInput.focus();
    palletInput.addEventListener('blur', () => {
      const val = palletInput.value.trim();
      if (!val) return;
      DB.findRecordByPallet(val).then((existing) => {
        if (!existing) return;
        const hint = existing.sessionId === this.currentSessionId ? '' : '（其他会话中已有）';
        this.showToast('托盘号「' + val + '」已存在' + hint, true);
      });
    });
    setTimeout(() => { palletInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
  },

  async _saveManualRecord() {
    const palletNumber = document.getElementById('scan-pallet').value.trim();
    const partNumber = document.getElementById('scan-part').value.trim();
    const qrQtyStr = document.getElementById('scan-qr-qty').value.trim();
    const shelf = document.getElementById('scan-shelf').value.trim();
    const actualQtyStr = document.getElementById('scan-quantity').value.trim();
    const batchNumber = document.getElementById('scan-batch').value.trim();
    const invoiceNumber = document.getElementById('scan-invoice').value.trim();
    const notes = document.getElementById('scan-notes').value.trim();

    if (!palletNumber) {
      this.showToast('托盘号不能为空', true);
      return;
    }

    const existing = await this._checkDuplicate(palletNumber);
    if (existing) {
      const session = await DB.getSession(existing.sessionId);
      const sessionName = session ? session.name : existing.sessionId;
      this.showToast('托盘号「' + palletNumber + '」已存在（会话: ' + sessionName + '）', true);
      return;
    }

    const actualQuantity = Utils.parsePositiveInt(actualQtyStr);
    const qrQuantity = Utils.parsePositiveInt(qrQtyStr);

    const record = {
      id: Utils.generateId(),
      sessionId: this.currentSessionId,
      qrQuantity: qrQuantity != null ? String(qrQuantity) : '',
      partNumber: partNumber,
      batchNumber: batchNumber,
      palletNumber: palletNumber,
      shelfNumber: shelf,
      actualQuantity: actualQuantity,
      invoiceNumber: invoiceNumber,
      notes: notes,
      status: 'stocked',
      scannedAt: Utils.nowISO()
    };

    try {
      await DB.createRecord(record);
      document.getElementById('scan-result-area').innerHTML = '';
      this.showToast('保存成功');
      this.showPage('page-session');
      await this.refreshRecordList();
    } catch (err) {
      this.showToast('保存失败', true);
    }
  },

  /* ===== Edit Record ===== */
  async _editRecord(recordId) {
    const record = await DB.getRecord(recordId);
    if (!record) return;
    this.editingRecordId = recordId;

    document.getElementById('edit-scan-info').innerHTML = this._buildScanInfoHtml(record) +
      '<div style="margin-top:8px;">' + statusBadge(record) + '</div>';

    document.getElementById('edit-pallet').value = record.palletNumber || '';
    document.getElementById('edit-part').value = record.partNumber || '';
    document.getElementById('edit-shelf').value = record.shelfNumber || '';
    document.getElementById('edit-quantity').value = record.actualQuantity != null ? record.actualQuantity : '';
    document.getElementById('edit-batch').value = record.batchNumber || '';
    document.getElementById('edit-invoice').value = record.invoiceNumber || '';
    document.getElementById('edit-notes').value = record.notes || '';
    this.showPage('page-edit');
    document.getElementById('edit-shelf').focus();
  },

  async _saveEditedRecord() {
    const record = await DB.getRecord(this.editingRecordId);
    if (!record) return;

    const shelf = document.getElementById('edit-shelf').value.trim();
    const actualQtyStr = document.getElementById('edit-quantity').value.trim();
    const batchNumber = document.getElementById('edit-batch').value.trim();
    const invoiceNumber = document.getElementById('edit-invoice').value.trim();
    const notes = document.getElementById('edit-notes').value.trim();
    const palletNumber = document.getElementById('edit-pallet').value.trim();
    const partNumber = document.getElementById('edit-part').value.trim();

    if (!palletNumber) {
      this.showToast('托盘号不能为空', true);
      return;
    }

    if (palletNumber !== record.palletNumber) {
      const existing = await this._checkDuplicate(palletNumber);
      if (existing) {
        const session = await DB.getSession(existing.sessionId);
        const sessionName = session ? session.name : existing.sessionId;
        this.showToast('托盘号「' + palletNumber + '」已存在（会话: ' + sessionName + '）', true);
        return;
      }
    }

    const actualQuantity = Utils.parsePositiveInt(actualQtyStr);

    // 保持原状态，如果是已出库则更新为已回库
    const prevStatus = record.status || 'stocked';
    const newStatus = prevStatus === 'outbound' ? 'returned' : prevStatus;

    const updated = Object.assign({}, record, {
      palletNumber,
      partNumber,
      shelfNumber: shelf,
      actualQuantity,
      batchNumber,
      invoiceNumber,
      notes,
      status: newStatus
    });

    await DB.updateRecord(updated);
    this.editingRecordId = null;
    this.showToast(newStatus !== prevStatus ? '已更新为「已回库」' : '保存成功');
    await this.refreshRecordList();
    this.showPage('page-session');
  },

  /* ===== Outbound Scanner ===== */
  async openOutboundScanner() {
    this.showPage('page-outbound-scanner');
    this._pendingOutboundRecord = null;
    document.getElementById('outbound-result-area').innerHTML = '';
    await Scanner.start('outbound-scanner-container', (parsed) => {
      this._showOutboundConfirm(parsed);
    });
  },

  async _showOutboundConfirm(parsed) {
    const record = await DB.findRecordByPallet(parsed.palletNumber);
    const area = document.getElementById('outbound-result-area');

    if (!record) {
      area.innerHTML =
        '<div class="outbound-card">' +
          '<div class="outbound-title" style="color:var(--danger);">未找到记录</div>' +
          '<div class="outbound-field"><span class="outbound-label">托盘号</span><span class="outbound-value">' + Utils.esc(parsed.palletNumber) + '</span></div>' +
          '<p style="color:var(--text-secondary);font-size:13px;margin-top:8px;">该托盘号没有盘点记录，无法出库。</p>' +
          '<button class="btn btn-secondary btn-block" id="btn-outbound-continue" style="margin-top:12px;">继续扫码</button>' +
        '</div>';
      document.getElementById('btn-outbound-continue').addEventListener('click', () => {
        area.innerHTML = '';
        Scanner.start('outbound-scanner-container', (p) => this._showOutboundConfirm(p));
      });
      return;
    }

    const currentStatus = record.status || 'stocked';
    if (currentStatus === 'outbound') {
      area.innerHTML =
        '<div class="outbound-card">' +
          '<div class="outbound-title" style="color:var(--warning);">已出库</div>' +
          '<div class="outbound-field"><span class="outbound-label">托盘号</span><span class="outbound-value">' + Utils.esc(record.palletNumber) + '</span></div>' +
          '<p style="color:var(--text-secondary);font-size:13px;margin-top:8px;">该托盘号已于 ' + Utils.formatDate(record._outboundAt || record.scannedAt) + ' 出库。</p>' +
          '<button class="btn btn-secondary btn-block" id="btn-outbound-continue" style="margin-top:12px;">继续扫码</button>' +
        '</div>';
      document.getElementById('btn-outbound-continue').addEventListener('click', () => {
        area.innerHTML = '';
        Scanner.start('outbound-scanner-container', (p) => this._showOutboundConfirm(p));
      });
      return;
    }

    this._pendingOutboundRecord = record;

    area.innerHTML =
      '<div class="outbound-card">' +
        '<div class="outbound-title">&#128666; 确认出库</div>' +
        '<div class="outbound-field"><span class="outbound-label">托盘号</span><span class="outbound-value">' + Utils.esc(record.palletNumber) + '</span></div>' +
        '<div class="outbound-field"><span class="outbound-label">零件号</span><span class="outbound-value">' + Utils.esc(record.partNumber) + '</span></div>' +
        '<div class="outbound-field"><span class="outbound-label">批次号</span><span class="outbound-value">' + Utils.esc(record.batchNumber) + '</span></div>' +
        '<div class="outbound-field"><span class="outbound-label">实际数量</span><span class="outbound-value">' + (record.actualQuantity != null ? record.actualQuantity : '—') + '</span></div>' +
        '<div class="outbound-field"><span class="outbound-label">货架号</span><span class="outbound-value">' + Utils.esc(record.shelfNumber || '—') + '</span></div>' +
        '<div class="outbound-field"><span class="outbound-label">当前状态</span><span class="outbound-value">' + statusBadge(record) + '</span></div>' +
      '</div>' +
      '<button class="btn btn-outbound btn-block" id="btn-do-outbound">&#10004; 确认出库</button>' +
      '<button class="btn btn-secondary btn-block" id="btn-outbound-cancel" style="margin-top:8px;">取消</button>';

    document.getElementById('btn-do-outbound').addEventListener('click', () => {
      this._confirmOutbound();
    });
    document.getElementById('btn-outbound-cancel').addEventListener('click', () => {
      area.innerHTML = '';
      this._pendingOutboundRecord = null;
      Scanner.start('outbound-scanner-container', (p) => this._showOutboundConfirm(p));
    });
  },

  async _confirmOutbound() {
    const record = this._pendingOutboundRecord;
    if (!record) return;

    const now = Utils.nowISO();

    // 更新记录状态
    const updated = Object.assign({}, record, {
      status: 'outbound',
      _outboundAt: now
    });
    await DB.updateRecord(updated);

    // 创建出库记录
    const outbound = {
      id: Utils.generateId(),
      recordId: record.id,
      palletNumber: record.palletNumber,
      partNumber: record.partNumber,
      batchNumber: record.batchNumber,
      quantity: record.actualQuantity,
      outboundAt: now
    };
    await DB.createOutbound(outbound);

    this._pendingOutboundRecord = null;
    document.getElementById('outbound-result-area').innerHTML = '';
    this.showToast('出库成功');
    Scanner.start('outbound-scanner-container', (p) => this._showOutboundConfirm(p));
  },

  /* ===== Outbound List ===== */
  async openOutboundList() {
    this.showPage('page-outbound-list');
    await this.refreshOutboundList();
  },

  async refreshOutboundList() {
    const outbounds = await DB.getAllOutbounds();
    const container = document.getElementById('outbound-list');

    if (outbounds.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128666;</div><p>暂无出库记录</p></div>';
      return;
    }

    container.innerHTML = outbounds.map((o) =>
      '<div class="outbound-record-card">' +
        '<div class="outbound-record-title">' + Utils.esc(o.palletNumber) + '</div>' +
        '<div class="outbound-record-sub">' +
          '零件: ' + Utils.esc(o.partNumber) + ' &nbsp;|&nbsp; 批次: ' + Utils.esc(o.batchNumber) +
          ' &nbsp;|&nbsp; 数量: ' + (o.quantity != null ? o.quantity : '—') +
        '</div>' +
        '<div class="outbound-record-time">' + Utils.formatDate(o.outboundAt) + '</div>' +
      '</div>'
    ).join('');
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

  async _exportOutbounds() {
    const outbounds = await DB.getAllOutbounds();
    if (outbounds.length === 0) {
      this.showToast('没有可导出的出库记录', true);
      return;
    }
    try {
      ExportUtils.toExcelOutbound(outbounds);
      this.showToast('导出成功');
    } catch (err) {
      this.showToast('导出失败', true);
    }
  },

  /* ===== SW Update ===== */
  _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    if (sessionStorage.getItem('sw-updated') === 'true') {
      sessionStorage.removeItem('sw-updated');
      setTimeout(() => this.showToast('应用已更新'), 500);
    }

    navigator.serviceWorker.register('sw.js').then((reg) => {
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

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      sessionStorage.setItem('sw-updated', 'true');
      window.location.reload();
    });
  },

  /* ===== Refresh ===== */
  _doRefresh() {
    this.showToast('正在刷新...');
    var url = window.location.origin + window.location.pathname + '?_t=' + Date.now();
    setTimeout(function() {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(function(reg) {
          return reg ? reg.unregister() : Promise.resolve();
        }).then(function() {
          if ('caches' in window) {
            return caches.keys().then(function(names) {
              return Promise.all(names.map(function(n) { return caches.delete(n); }));
            });
          }
        }).then(function() {
          window.location.href = url;
        }).catch(function() {
          window.location.href = url;
        });
      } else {
        window.location.href = url;
      }
    }, 300);
  },

  /* ===== Init ===== */
  async init() {
    document.getElementById('footer-version').textContent = 'v' + this.VERSION;
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

    document.getElementById('btn-cancel-session').addEventListener('click', () => {
      document.getElementById('modal-new-session').classList.remove('active');
    });

    // 首页 → 盘点模块（展开/收起）
    document.getElementById('btn-open-stock').addEventListener('click', () => {
      const body = document.getElementById('stock-module-body');
      const arrow = document.querySelector('#stock-module .module-arrow');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        arrow.textContent = '▾';
      } else {
        body.style.display = 'none';
        arrow.textContent = '›';
      }
    });

    // 首页 → 出库模块（展开/收起）
    document.getElementById('btn-open-outbound-scanner').addEventListener('click', () => {
      const body = document.getElementById('outbound-module-body');
      const arrow = document.querySelector('#outbound-module .module-arrow');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        arrow.textContent = '▾';
      } else {
        body.style.display = 'none';
        arrow.textContent = '›';
      }
    });
    document.getElementById('btn-outbound-scan').addEventListener('click', () => {
      this.openOutboundScanner();
    });
    document.getElementById('btn-outbound-list').addEventListener('click', () => {
      this.openOutboundList();
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

    // 返回首页（从出库扫码）
    document.getElementById('btn-back-from-outbound').addEventListener('click', () => {
      Scanner.stop();
      this.showPage('page-home');
    });

    // 返回首页（从出库列表）
    document.getElementById('btn-back-from-outbound-list').addEventListener('click', () => {
      this.showPage('page-home');
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

    // 出库确认弹窗
    document.getElementById('btn-cancel-outbound').addEventListener('click', () => {
      document.getElementById('modal-confirm-outbound').classList.remove('active');
    });

    // 导出
    document.getElementById('btn-export-session').addEventListener('click', () => {
      this._exportCurrentSession();
    });
    document.getElementById('btn-export-all').addEventListener('click', () => {
      this._exportAll();
    });
    document.getElementById('btn-export-outbound').addEventListener('click', () => {
      this._exportOutbounds();
    });

    // 会话详情页的扫码按钮
    document.getElementById('btn-start-scan').addEventListener('click', () => {
      this.openScanner();
    });
    document.getElementById('btn-manual-entry').addEventListener('click', () => {
      this._openManualEntry();
    });

    // 模态框背景关闭
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });

    // 重复扫码
    document.getElementById('btn-dup-overwrite').addEventListener('click', () => {
      document.getElementById('modal-duplicate').classList.remove('active');
      const parsed = this._pendingDuplicate;
      this._pendingDuplicate = null;
      this._renderScanForm(parsed);
    });
    document.getElementById('btn-dup-new').addEventListener('click', () => {
      document.getElementById('modal-duplicate').classList.remove('active');
      const parsed = this._pendingDuplicate;
      this._pendingDuplicate = null;
      this._existingDuplicateRecord = null;
      this._renderScanForm(parsed);
    });
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

    window.addEventListener('beforeunload', () => Scanner.stop());
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
