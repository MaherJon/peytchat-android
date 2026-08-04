// M-A3: Fullscreen Image Viewer
// 沉浸式全屏图片查看器,支持捏合缩放、双击切换、拖拽关闭、滑动切换。
// 移动端专用;桌面端保持现有的 img-fullscreen-overlay。

import { iconSvg } from '../components/icon.js';
import { applyTransition, EASING, DURATION, prefersReducedMotion } from './animation.js';
import { haptic } from './haptic.js';
import type { ImageViewerOpts } from './types.js';

// ── 全局状态 ──────────────────────────────────────────────────────────
let currentViewer: HTMLElement | null = null;
let currentIndex = 0;
let currentImages: string[] = [];
let currentOnClose: (() => void) | null = null;

// 缩放状态
let scale = 1;
let startDistance = 0;
let startScale = 1;
let lastTapTime = 0;

// 拖拽关闭状态
let dragStartY = 0;
let dragCurrentY = 0;
let isDragging = false;

// ── API ────────────────────────────────────────────────────────────────

/**
 * 显示全屏图片查看器。
 */
export function showImageViewer(opts: ImageViewerOpts): void {
  if (opts.images.length === 0) return;

  currentImages = opts.images;
  currentIndex = Math.max(0, Math.min(opts.startIndex, opts.images.length - 1));
  currentOnClose = opts.onClose ?? null;

  renderViewer();
}

/**
 * 关闭图片查看器。
 */
export function hideImageViewer(): void {
  if (!currentViewer) return;

  const viewer = currentViewer;
  currentViewer = null;

  if (prefersReducedMotion()) {
    viewer.remove();
    if (currentOnClose) currentOnClose();
    return;
  }

  applyTransition(viewer, 'opacity', 200, EASING.accelerate);
  viewer.style.opacity = '0';
  viewer.addEventListener('transitionend', () => {
    viewer.remove();
    if (currentOnClose) currentOnClose();
  }, { once: true });
  setTimeout(() => {
    if (viewer.parentNode) {
      viewer.remove();
      if (currentOnClose) currentOnClose();
    }
  }, 220);
}

// ── 渲染 ──────────────────────────────────────────────────────────────

function renderViewer(): void {
  // 移除旧的
  if (currentViewer) currentViewer.remove();

  const viewer = document.createElement('div');
  viewer.className = 'image-viewer';
  viewer.setAttribute('role', 'dialog');
  viewer.setAttribute('aria-label', '图片查看器');

  const hasMultiple = currentImages.length > 1;
  const counterHtml = hasMultiple
    ? `<div class="iv-counter">${currentIndex + 1} / ${currentImages.length}</div>`
    : '';

  viewer.innerHTML = `
    <div class="iv-backdrop"></div>
    <button class="iv-close" aria-label="关闭">${iconSvg('x', { width: 24, height: 24, strokeWidth: 2 })}</button>
    ${counterHtml}
    ${hasMultiple ? `<button class="iv-prev" aria-label="上一张">${iconSvg('chevron-left', { width: 28, height: 28, strokeWidth: 2 })}</button>` : ''}
    ${hasMultiple ? `<button class="iv-next" aria-label="下一张">${iconSvg('chevron-right', { width: 28, height: 28, strokeWidth: 2 })}</button>` : ''}
    <div class="iv-image-container">
      <img src="${escapeAttr(currentImages[currentIndex])}" alt="" draggable="false" />
    </div>
  `;

  document.body.appendChild(viewer);
  currentViewer = viewer;

  // 绑定事件
  bindViewerEvents(viewer);

  // 入场动画
  if (!prefersReducedMotion()) {
    viewer.style.opacity = '0';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyTransition(viewer, 'opacity', 200, EASING.decelerate);
        viewer.style.opacity = '1';
      });
    });
  }
}

function updateImage(): void {
  if (!currentViewer) return;
  const img = currentViewer.querySelector<HTMLImageElement>('.iv-image-container img');
  const counter = currentViewer.querySelector<HTMLElement>('.iv-counter');
  if (img) {
    scale = 1;
    img.style.transform = 'scale(1)';
    img.src = currentImages[currentIndex];
  }
  if (counter) {
    counter.textContent = `${currentIndex + 1} / ${currentImages.length}`;
  }
}

// ── 事件绑定 ──────────────────────────────────────────────────────────

function bindViewerEvents(viewer: HTMLElement): void {
  // 关闭按钮
  viewer.querySelector('.iv-close')?.addEventListener('click', hideImageViewer);
  // 点击背景关闭
  viewer.querySelector('.iv-backdrop')?.addEventListener('click', hideImageViewer);

  // 上一张 / 下一张
  viewer.querySelector('.iv-prev')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentIndex > 0) {
      currentIndex--;
      updateImage();
    }
  });
  viewer.querySelector('.iv-next')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentIndex < currentImages.length - 1) {
      currentIndex++;
      updateImage();
    }
  });

  // 键盘导航
  viewer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideImageViewer();
    if (e.key === 'ArrowLeft' && currentIndex > 0) { currentIndex--; updateImage(); }
    if (e.key === 'ArrowRight' && currentIndex < currentImages.length - 1) { currentIndex++; updateImage(); }
  });

  // 触摸手势
  const container = viewer.querySelector<HTMLElement>('.iv-image-container');
  if (!container) return;

  container.addEventListener('touchstart', onTouchStart, { passive: false });
  container.addEventListener('touchmove', onTouchMove, { passive: false });
  container.addEventListener('touchend', onTouchEnd);
}

// ── 缩放 (捏合 + 双击) ───────────────────────────────────────────────

function onTouchStart(e: TouchEvent): void {
  if (e.touches.length === 2) {
    // 捏合开始
    startDistance = getTouchDistance(e.touches);
    startScale = scale;
    isDragging = false;
  } else if (e.touches.length === 1) {
    dragStartY = e.touches[0].clientY;
    isDragging = true;

    // 双击检测
    const now = Date.now();
    if (now - lastTapTime < 300) {
      // 双击: 切换缩放
      toggleZoom();
      lastTapTime = 0;
    } else {
      lastTapTime = now;
    }
  }
}

function onTouchMove(e: TouchEvent): void {
  if (e.touches.length === 2 && startDistance > 0) {
    // 捏合缩放
    e.preventDefault();
    const newDist = getTouchDistance(e.touches);
    const newScale = Math.max(1, Math.min(4, startScale * (newDist / startDistance)));
    applyScale(newScale);
  } else if (e.touches.length === 1 && isDragging && scale === 1) {
    // 拖拽关闭 (仅在未缩放时)
    dragCurrentY = e.touches[0].clientY;
    const delta = dragCurrentY - dragStartY;
    if (delta > 20 && currentViewer) {
      const img = currentViewer.querySelector<HTMLElement>('.iv-image-container');
      if (img) {
        img.style.transform = `translateY(${delta}px)`;
        currentViewer.style.opacity = String(Math.max(0.3, 1 - delta / 400));
      }
    }
  }
}

function onTouchEnd(_e: TouchEvent): void {
  // 拖拽关闭
  if (isDragging && scale === 1) {
    const delta = dragCurrentY - dragStartY;
    if (delta > 120 && currentViewer) {
      hideImageViewer();
      return;
    }
    // 弹回
    const img = currentViewer?.querySelector<HTMLElement>('.iv-image-container');
    if (img) {
      applyTransition(img, 'transform', 200, EASING.decelerate);
      img.style.transform = 'translateY(0)';
    }
    if (currentViewer) {
      applyTransition(currentViewer, 'opacity', 200, EASING.decelerate);
      currentViewer.style.opacity = '1';
    }
    haptic('light');
  }

  startDistance = 0;
  isDragging = false;
  dragCurrentY = 0;
}

// ── 辅助函数 ──────────────────────────────────────────────────────────

function getTouchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function toggleZoom(): void {
  const newScale = scale > 1.5 ? 1 : 2.5;
  applyScale(newScale);
}

function applyScale(newScale: number): void {
  scale = newScale;
  const img = currentViewer?.querySelector<HTMLElement>('.iv-image-container img') as HTMLElement | null;
  if (img) {
    img.style.transform = `scale(${scale})`;
    if (!prefersReducedMotion()) {
      img.style.transition = scale === 1 ? 'transform 200ms cubic-bezier(0.4, 0.0, 0.2, 1)' : 'none';
    }
  }
}

function escapeAttr(s: string): string {
  return String(s ?? '').replace(/"/g, '&quot;');
}
