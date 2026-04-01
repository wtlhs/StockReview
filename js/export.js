'use strict';

const ExportUtils = {
  /**
   * 将扫码记录导出为 Excel 文件
   * @param {Array} records - 扫码记录数组
   * @param {string} filename - 导出文件名
   */
  toExcel(records, filename) {
    const header = ['序号', '托盘号', '零件号', '批次号', '标签数量', '实际数量', '货架号', '发票号', '备注', '扫码时间', '所属会话'];

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
      Utils.formatDate(r.scannedAt),
      r._sessionName || ''
    ]);

    const wsData = [header, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 设置列宽
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
      { wch: 18 },  // 扫码时间
      { wch: 20 }   // 所属会话
    ];

    XLSX.utils.book_append_sheet(wb, ws, '盘点记录');

    // 生成二进制数据
    var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // PWA 独立模式：优先使用 Web Share API（唤起系统分享面板，可保存到文件）
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

    // 回退：传统下载
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
