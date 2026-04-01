'use strict';

const ExportUtils = {
  /**
   * 将扫码记录导出为 Excel 文件
   * @param {Array} records - 扫码记录数组
   * @param {string} filename - 导出文件名
   */
  toExcel(records, filename) {
    const header = ['序号', '托盘号', '零件号', '批次号', '标签数量', '实际数量', '货架号', '备注', '扫码时间', '所属会话'];

    const rows = records.map((r, i) => [
      i + 1,
      r.palletNumber,
      r.partNumber,
      r.batchNumber,
      r.qrQuantity,
      r.actualQuantity ?? '',
      r.shelfNumber,
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
      { wch: 20 },  // 备注
      { wch: 18 },  // 扫码时间
      { wch: 20 }   // 所属会话
    ];

    XLSX.utils.book_append_sheet(wb, ws, '盘点记录');
    XLSX.writeFile(wb, filename);
  }
};
