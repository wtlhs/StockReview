'use strict';

const ExportUtils = {
  /**
   * 盘点记录导出 Excel
   */
  toExcel(records, filename) {
    const statusLabels = { stocked: '已盘点', outbound: '已出库', returned: '已回库' };
    const header = ['序号', '托盘号', '零件号', '批次号', '标签数量', '实际数量', '货架号', '发票号', '备注', '状态', '扫码时间', '所属会话'];

    const rows = records.map((r, i) => [
      i + 1,
      r.palletNumber,
      r.partNumber,
      r.batchNumber,
      r.qrQuantity,
      r.actualQuantity ?? '',
      r.shelfNumber,
      r.invoiceNumber || '',
      r.notes,
      statusLabels[r.status || 'stocked'] || '已盘点',
      Utils.formatDate(r.scannedAt),
      r._sessionName || ''
    ]);

    const wsData = [header, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 5 },   // 序号
      { wch: 22 },  // 托盘号
      { wch: 18 },  // 零件号
      { wch: 10 },  // 批次号
      { wch: 10 },  // 标签数量
      { wch: 10 },  // 实际数量
      { wch: 10 },  // 货架号
      { wch: 16 },  // 发票号
      { wch: 20 },  // 备注
      { wch: 8 },   // 状态
      { wch: 18 },  // 扫码时间
      { wch: 20 }   // 所属会话
    ];

    XLSX.utils.book_append_sheet(wb, ws, '盘点记录');

    var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    var file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: filename
      }).then(function() {
        App.showToast('导出成功');
      }).catch(function(err) {
        if (err.name === 'AbortError') return;
        ExportUtils._fallbackDownload(blob, filename);
      });
      return;
    }

    ExportUtils._fallbackDownload(blob, filename);
  },

  /**
   * 出库记录导出 Excel
   */
  toExcelOutbound(outbounds, filename) {
    if (!filename) {
      const timestamp = Utils.formatDate(new Date().toISOString()).replace(/[ :]/g, '-');
      filename = '出库记录_' + timestamp + '.xlsx';
    }

    const header = ['序号', '托盘号', '零件号', '批次号', '出库数量', '出库时间'];

    const rows = outbounds.map((o, i) => [
      i + 1,
      o.palletNumber,
      o.partNumber,
      o.batchNumber,
      o.quantity != null ? o.quantity : '',
      Utils.formatDate(o.outboundAt)
    ]);

    const wsData = [header, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 5 },   // 序号
      { wch: 22 },  // 托盘号
      { wch: 18 },  // 零件号
      { wch: 10 },  // 批次号
      { wch: 10 },  // 出库数量
      { wch: 18 }   // 出库时间
    ];

    XLSX.utils.book_append_sheet(wb, ws, '出库记录');

    var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    var file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: filename
      }).then(function() {
        App.showToast('导出成功');
      }).catch(function(err) {
        if (err.name === 'AbortError') return;
        ExportUtils._fallbackDownload(blob, filename);
      });
      return;
    }

    ExportUtils._fallbackDownload(blob, filename);
  },

  _fallbackDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }
};
