// M-A3: 移动端共享类型定义
import type { IconName } from '../components/icon.js';

/** BottomSheet 配置 */
export interface BottomSheetOpts {
  /** Sheet 内容 (HTML 字符串或 DOM 元素) */
  content: string | HTMLElement;
  /** 拖拽手柄旁的标题 (可选) */
  title?: string;
  /** 吸附点: partial = 半展开高度(%), full = 全展开高度(%) */
  anchors?: { partial: number; full: number };
  /** 关闭回调 */
  onDismiss?: () => void;
  /** 是否允许嵌套滚动 (Sheet 内部可滚动区域) */
  nestedScroll?: boolean;
  /** 是否显示拖拽手柄 */
  showHandle?: boolean;
}

/** Snackbar 配置 */
export interface SnackbarOpts {
  /** 操作按钮 */
  action?: { label: string; onClick: () => void };
  /** 自动消失时间(ms), 默认 4000, 有 action 时默认 10000 */
  duration?: number;
  /** 消失回调 */
  onDismiss?: () => void;
}

/** 导航栈条目 */
export interface NavEntry {
  page: string;
  params?: Record<string, unknown>;
  title: string;
}

/** FAB 配置 */
export interface FabOpts {
  icon: IconName;
  label?: string;
  action: () => void;
  /** 附加到哪个滚动容器的选择器, 默认 '.mobile-page-content' */
  scrollContainer?: string;
}

/** 触觉反馈类型 */
export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'error';

/** 分享内容 */
export interface ShareData {
  title?: string;
  text?: string;
  url?: string;
}

/** 图片查看器配置 */
export interface ImageViewerOpts {
  images: string[];
  startIndex: number;
  onClose?: () => void;
}

/** 附件类型 */
export type AttachmentType = 'camera' | 'gallery' | 'files' | 'audio';

/** 附件选择回调 */
export type AttachmentCallback = (type: AttachmentType) => void;

/** 设备类型 */
export type DeviceType = 'phone' | 'tablet' | 'desktop';
