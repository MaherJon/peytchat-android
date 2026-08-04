// M-A3: Attachment Panel
// BottomSheet 风格的附件选择器: 相机 / 图库 / 文件 / 音频。
// 移动端专用;桌面端保持现有附件按钮行为。

import { showBottomSheet, hideBottomSheet } from './bottomSheet.js';
import { iconSvg } from '../components/icon.js';
import { haptic } from './haptic.js';
import type { AttachmentType, AttachmentCallback } from './types.js';

// ── 附件类型定义 ──────────────────────────────────────────────────────

interface AttachmentOption {
  type: AttachmentType;
  label: string;
  icon: string; // lucide icon name
  color: string; // CSS color for the icon background
}

const OPTIONS: AttachmentOption[] = [
  { type: 'gallery', label: 'Gallery', icon: 'image', color: '#4caf50' },
  { type: 'camera', label: 'Camera', icon: 'camera', color: '#2196f3' },
  { type: 'files', label: 'Files', icon: 'file-text', color: '#ff9800' },
  { type: 'audio', label: 'Audio', icon: 'mic', color: '#9c27b0' },
];

/**
 * 显示附件选择 BottomSheet。
 * 用户选择类型后自动关闭 Sheet 并回调。
 *
 * @param onSelect - 选择回调,参数为附件类型
 */
export function showAttachmentSheet(onSelect: AttachmentCallback): void {
  // 使用 iconSvg 生成每个选项的图标
  const itemsHtml = OPTIONS.map((opt) => {
    const iconHtml = iconSvg(opt.icon as 'image' | 'file-text', { width: 24, height: 24, strokeWidth: 1.5 });
    return `
      <div class="attach-option" data-type="${opt.type}" role="button" tabindex="0">
        <div class="attach-icon" style="background: ${opt.color}20; color: ${opt.color}">
          ${iconHtml}
        </div>
        <span class="attach-label">${opt.label}</span>
      </div>
    `;
  }).join('');

  const content = `
    <div class="attach-grid">
      ${itemsHtml}
    </div>
  `;

  showBottomSheet({
    title: 'Send Attachment',
    content,
    showHandle: true,
    onDismiss: () => {
      // 用户取消选择
    },
  });

  // 绑定点击事件 (延迟一下等 DOM 挂载)
  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>('.attach-option').forEach((el) => {
      el.addEventListener('click', () => {
        const type = el.dataset.type as AttachmentType;
        haptic('light');
        hideBottomSheet();
        onSelect(type);
      });
    });
  });
}

/**
 * 简单的附件回退: 创建隐藏的 file input 并触发选择。
 * 用于不支持原生相机/图库 API 的环境。
 */
export function pickFile(accept: string, onFile: (file: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) onFile(file);
    document.body.removeChild(input);
  });

  input.click();
}
