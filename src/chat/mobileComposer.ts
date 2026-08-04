import { call } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../toast.js';
import { appendOptimisticMessage } from './chatView.js';
import { iconSvg } from '../components/icon.js';
import type { MsgDto, ChannelDto } from '../types.js';

// ── 移动端发送器 ──────────────────────────────────────────────────────
// Android 风格: Emoji 按钮 + 自适应文本区 + 附件按钮 + 发送按钮。
// 复用 desktop composer.ts 的业务逻辑 (send / reply / @mention / #频道引用),
// 仅 UI 和交互适配移动端。
//
// 桌面端 composer.ts 内部类型 TmpMsg — 此处重复声明以复用乐观更新结构。
interface TmpMsg {
  msg_id: string;
  from_id: number;
  from_name: string;
  text: string;
  ts: number;
  is_out: boolean;
  _state: 'sending' | 'failed';
  quote_from: string | null;
  quote_text: string | null;
  view_type: string;
  file: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_bytes: number | null;
  width: number | null;
  height: number | null;
  download_state: string;
  subject: string | null;
}

// ── @提及 / #频道建议面板状态 (模块级,同 desktop 模式) ──────────────
let mentionList: HTMLElement | null = null;
let mentionItems: Array<{ name: string; type: 'member' | 'channel' }> = [];
let mentionKind: '@' | '#' | null = null;
let mentionSelectedIndex = 0;
let mentionQueryStart = -1;

// ── 公开入口 ──────────────────────────────────────────────────────────
export function renderMobileComposer(chatId: number, onSent: () => void): void {
  const area = document.getElementById('composer-area');
  if (!area) return;
  closeMentionList();

  // Reply 预览条
  let replyPreview = '';
  if (area.dataset.replyTo) {
    const replyMsg = state.messages.find((m) => String(m.msg_id) === String(area.dataset.replyTo));
    if (replyMsg) {
      replyPreview = `
        <div class="mobile-reply-preview" id="reply-preview">
          <div class="reply-preview-icon">${iconSvg('reply', { width: 14, height: 14 })}</div>
          <div class="reply-preview-body">
            <div class="reply-preview-name">回复 ${escapeHtml(replyMsg.from_name)}</div>
            <div class="reply-preview-text">${escapeHtml((replyMsg.text || '').slice(0, 40))}</div>
          </div>
          <span class="rp-cancel" id="rp-cancel" title="取消回复">${iconSvg('x', { width: 14, height: 14 })}</span>
        </div>
      `;
    }
  }

  area.innerHTML = `
    <div class="mobile-composer">
      ${replyPreview}
      <div class="mobile-composer-row">
        <button type="button" class="mc-btn mc-emoji-btn" id="mc-emoji-btn" title="表情" aria-label="表情">
          ${iconSvg('smile', { width: 22, height: 22, strokeWidth: 1.5 })}
        </button>
        <textarea id="composer-input" class="mc-input" placeholder="消息..." rows="1" enterkeyhint="send"></textarea>
        <button type="button" class="mc-btn mc-attach-btn" id="mc-attach-btn" title="附件" aria-label="附件">
          ${iconSvg('paperclip', { width: 22, height: 22, strokeWidth: 1.5 })}
        </button>
        <button type="button" class="mc-send-btn" id="composer-send" title="发送" disabled aria-label="发送">
          ${iconSvg('arrow-up', { width: 20, height: 20, strokeWidth: 2.5 })}
        </button>
      </div>
      <!-- 隐藏的文件 input,由附件按钮触发 -->
      <input type="file" id="mc-file-input" style="display:none" multiple />
    </div>
  `;

  const input = document.getElementById('composer-input') as HTMLTextAreaElement | null;
  const sendBtn = document.getElementById('composer-send') as HTMLButtonElement | null;
  if (!input || !sendBtn) return;

  // ── 发送按钮状态 ──
  const updateSendState = () => {
    sendBtn.disabled = !input.value.trim();
  };
  updateSendState();

  // ── 发送按钮点击 ──
  sendBtn.addEventListener('click', async () => {
    if (!input.value.trim()) return;
    await sendMobile(chatId, input, area, onSent);
    updateSendState();
  });

  // ── Reply cancel ──
  const rpCancel = document.getElementById('rp-cancel');
  if (rpCancel) {
    rpCancel.onclick = () => {
      delete area.dataset.replyTo;
      renderMobileComposer(chatId, onSent);
    };
  }

  // ── 自适应高度 + @/#检测 + 发送按钮状态 ──
  input.oninput = () => {
    autoResize(input);
    handleMentionInput(input);
    updateSendState();
  };

  // ── 键盘事件 ──
  input.onkeydown = async (e) => {
    // 建议面板导航
    if (mentionList) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionSelectedIndex = (mentionSelectedIndex + 1) % mentionItems.length;
        updateMentionSelection();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionSelectedIndex = (mentionSelectedIndex - 1 + mentionItems.length) % mentionItems.length;
        updateMentionSelection();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        insertSelectedMention(input);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMentionList();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        insertSelectedMention(input);
        return;
      }
    }
    // 发送
    const isReplying = !!area.dataset.replyTo;
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      // 移动端: Enter 发送 (回复模式除外)
      if (isReplying) {
        // 回复模式: Enter 换行
        insertNewline(input);
      } else {
        e.preventDefault();
        if (!input.value.trim()) return;
        await sendMobile(chatId, input, area, onSent);
      }
    } else if (e.key === 'Escape') {
      if (area.dataset.replyTo) {
        delete area.dataset.replyTo;
        renderMobileComposer(chatId, onSent);
      }
    }
  };

  // ── Emoji 按钮 ──
  const emojiBtn = document.getElementById('mc-emoji-btn');
  emojiBtn?.addEventListener('click', () => {
    toggleEmojiPicker(input, emojiBtn);
  });

  // ── 附件按钮 (M-A3: 使用 BottomSheet 附件面板) ──
  const attachBtn = document.getElementById('mc-attach-btn');
  const fileInput = document.getElementById('mc-file-input') as HTMLInputElement | null;
  attachBtn?.addEventListener('click', async () => {
    // M-A3: 显示附件选择 BottomSheet
    try {
      const { showAttachmentSheet } = await import('../mobile/attachmentPanel.js');
      showAttachmentSheet((type) => {
        switch (type) {
          case 'gallery':
          case 'files':
            fileInput?.click();
            break;
          case 'camera':
            // 创建 camera input
            const camInput = document.createElement('input');
            camInput.type = 'file';
            camInput.accept = 'image/*';
            camInput.capture = 'environment';
            camInput.style.display = 'none';
            document.body.appendChild(camInput);
            camInput.addEventListener('change', () => {
              if (camInput.files && camInput.files.length > 0) {
                handleAttachmentUpload(chatId, camInput.files, area, onSent);
              }
              document.body.removeChild(camInput);
            });
            camInput.click();
            break;
          case 'audio':
            // 创建 audio input
            const audInput = document.createElement('input');
            audInput.type = 'file';
            audInput.accept = 'audio/*';
            audInput.style.display = 'none';
            document.body.appendChild(audInput);
            audInput.addEventListener('change', () => {
              if (audInput.files && audInput.files.length > 0) {
                handleAttachmentUpload(chatId, audInput.files, area, onSent);
              }
              document.body.removeChild(audInput);
            });
            audInput.click();
            break;
        }
      });
    } catch {
      // 回退: 直接触发 file input
      fileInput?.click();
    }
  });
  fileInput?.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      // 复用现有附件上传逻辑 (调用后端 send_file 等)
      handleAttachmentUpload(chatId, fileInput.files, area, onSent);
      fileInput.value = ''; // 重置以便重复选择同一文件
    }
  });

  // 聚焦输入框 (移动端不自动聚焦,避免键盘弹出)
  // input.focus();  // 移动端不自动弹键盘
}

// ── 发送核心逻辑 (复用 desktop send 模式) ─────────────────────────────
async function sendMobile(
  chatId: number,
  input: HTMLTextAreaElement,
  area: HTMLElement,
  onSent: () => void,
): Promise<void> {
  const text = input.value.trim();
  if (!text) return;

  // Slash 命令分发
  if (text.startsWith('/')) {
    const sp = text.indexOf(' ');
    const cmd = sp === -1 ? text.slice(1) : text.slice(1, sp);
    const args = sp === -1 ? '' : text.slice(sp + 1).trim();
    const handler = window.__peytchat_commands?.[cmd];
    if (handler) {
      input.value = '';
      autoResize(input);
      closeMentionList();
      try {
        await handler(args, chatId);
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e));
      }
      if (onSent) await onSent();
      return;
    }
  }

  const replyTo = area.dataset.replyTo;
  const tmpId = `tmp_${Date.now()}`;
  const tmpMsg: TmpMsg = {
    msg_id: tmpId,
    from_id: state.self?.id || 0,
    from_name: state.self?.name || '我',
    text,
    ts: Math.floor(Date.now() / 1000),
    is_out: true,
    _state: 'sending',
    quote_from: null,
    quote_text: null,
    view_type: 'Text',
    file: null,
    file_name: null,
    file_mime: null,
    file_bytes: null,
    width: null,
    height: null,
    download_state: 'Done',
    subject: null,
  };
  appendOptimisticMessage(tmpMsg as unknown as MsgDto);
  input.value = '';
  autoResize(input);
  closeMentionList();

  try {
    if (replyTo) {
      await call('send_reply', { chatId, text, quoteMsgId: Number(replyTo) });
      delete area.dataset.replyTo;
      renderMobileComposer(chatId, onSent);
    } else {
      await call('send_text', { chatId, text });
    }
    if (onSent) await onSent();
  } catch (e) {
    // 标记失败
    tmpMsg._state = 'failed';
    const messagesEl = document.getElementById('messages');
    const el = messagesEl?.querySelector<HTMLElement>(`[data-msg="${tmpId}"]`);
    if (el) {
      el.classList.remove('sending');
      el.classList.add('failed');
      el.onclick = async () => {
        input.value = text;
        tmpMsg._state = 'sending';
        el.classList.remove('failed');
        el.classList.add('sending');
        el.onclick = null;
        await sendMobile(chatId, input, area, onSent);
      };
    }
    showToast(e instanceof Error ? e.message : String(e));
  }
}

// ── 附件上传处理 ──────────────────────────────────────────────────────
async function handleAttachmentUpload(
  chatId: number,
  files: FileList,
  area: HTMLElement,
  onSent: () => void,
): Promise<void> {
  const replyTo = area.dataset.replyTo;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      // 将 File 转为 base64 data URL (Tauri invoke 传参)
      const dataUrl = await fileToDataUrl(file);
      const isImage = file.type.startsWith('image/');
      const viewType = isImage ? 'Image' : 'File';
      await call('send_file', {
        chatId,
        filePath: dataUrl,
        fileName: file.name,
        mimeType: file.type,
        viewType,
        replyTo: replyTo ? Number(replyTo) : null,
      });
    } catch (e) {
      showToast(`发送 ${file.name} 失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (replyTo) {
    delete area.dataset.replyTo;
    renderMobileComposer(chatId, onSent);
  }
  if (onSent) await onSent();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

// ── 自适应高度 ────────────────────────────────────────────────────────
function autoResize(input: HTMLTextAreaElement): void {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';
}

// ── 换行插入 ──────────────────────────────────────────────────────────
function insertNewline(input: HTMLTextAreaElement): void {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  input.value = input.value.slice(0, start) + '\n' + input.value.slice(end);
  const pos = start + 1;
  input.selectionStart = pos;
  input.selectionEnd = pos;
  autoResize(input);
}

// ── Emoji 简易选择器 ──────────────────────────────────────────────────
// 移动端使用快速 emoji 面板 (常用表情,轻量,不引入第三方库)
const QUICK_EMOJIS = ['😊', '😂', '❤️', '👍', '🎉', '🔥', '😢', '😡', '👋', '✅', '🙏', '💪'];

function toggleEmojiPicker(input: HTMLTextAreaElement, anchor: HTMLElement): void {
  const existing = document.getElementById('mc-emoji-picker');
  if (existing) {
    existing.remove();
    return;
  }

  const picker = document.createElement('div');
  picker.id = 'mc-emoji-picker';
  picker.className = 'mc-emoji-picker';
  picker.innerHTML = QUICK_EMOJIS.map((emoji) =>
    `<span class="mc-emoji-item" data-emoji="${emoji}">${emoji}</span>`
  ).join('');

  // 定位到按钮上方
  const rect = anchor.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  picker.style.left = `${Math.max(8, rect.left - 100)}px`;
  picker.style.zIndex = '300';

  document.body.appendChild(picker);

  // 点击 emoji 插入
  picker.querySelectorAll<HTMLElement>('.mc-emoji-item').forEach((el) => {
    el.addEventListener('click', () => {
      const emoji = el.dataset.emoji || '';
      insertAtCursor(input, emoji);
      autoResize(input);
      picker.remove();
      input.focus();
    });
  });

  // 点击外部关闭
  const closeOnOutside = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node) && e.target !== anchor) {
      picker.remove();
      document.removeEventListener('click', closeOnOutside);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
}

function insertAtCursor(input: HTMLTextAreaElement, text: string): void {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length;
  input.selectionStart = pos;
  input.selectionEnd = pos;
}

// ── @提及 / #频道 建议 (复用 desktop 逻辑) ───────────────────────────
function handleMentionInput(input: HTMLTextAreaElement): void {
  const text = input.value;
  const cursorPos = input.selectionStart;
  const beforeCursor = text.slice(0, cursorPos);

  const atMatch = beforeCursor.match(/@(\w*)$/);
  if (atMatch) {
    const query = atMatch[1].toLowerCase();
    const members = state.currentMembers.filter((m) => m.name.toLowerCase().includes(query));
    if (members.length > 0) {
      const atPos = cursorPos - atMatch[0].length;
      showMentionList(
        members.map((m) => ({ name: m.name, type: 'member' as const })),
        '@',
        atPos,
        input,
      );
    } else {
      closeMentionList();
    }
    return;
  }

  const hashMatch = beforeCursor.match(/#(\w*)$/);
  if (hashMatch) {
    const query = hashMatch[1].toLowerCase();
    const channels = state.channels.filter((c: ChannelDto) => c.name.toLowerCase().includes(query));
    if (channels.length > 0) {
      const hashPos = cursorPos - hashMatch[0].length;
      showMentionList(
        channels.map((c) => ({ name: c.name, type: 'channel' as const })),
        '#',
        hashPos,
        input,
      );
    } else {
      closeMentionList();
    }
    return;
  }
  closeMentionList();
}

function showMentionList(
  items: Array<{ name: string; type: 'member' | 'channel' }>,
  kind: '@' | '#',
  queryStart: number,
  input: HTMLTextAreaElement,
): void {
  closeMentionList();
  mentionItems = items;
  mentionKind = kind;
  mentionSelectedIndex = 0;
  mentionQueryStart = queryStart;
  mentionList = document.createElement('div');
  mentionList.className = 'mention-list';
  mentionList.style.transformOrigin = 'left bottom';
  mentionList.innerHTML = items
    .map((item, i) => {
      const prefix = item.type === 'channel' ? '#' : '@';
      return `<div class="mention-item ${i === 0 ? 'selected' : ''}" data-index="${i}" data-name="${escapeAttr(item.name)}">
        <span class="mention-prefix">${prefix}</span>
        <span class="mention-name">${escapeHtml(item.name)}</span>
      </div>`;
    })
    .join('');

  // 定位到输入框上方 (移动端适配)
  const rect = input.getBoundingClientRect();
  mentionList.style.position = 'fixed';
  mentionList.style.left = `${Math.max(8, rect.left)}px`;
  mentionList.style.top = `${Math.max(8, rect.top - Math.min(items.length, 5) * 28 - 8)}px`;
  mentionList.style.zIndex = '300';
  mentionList.style.maxWidth = `${Math.min(280, window.innerWidth - 16)}px`;
  document.body.appendChild(mentionList);

  mentionList.querySelectorAll<HTMLElement>('.mention-item').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.index);
      mentionSelectedIndex = idx;
      insertSelectedMention(input);
    });
    el.addEventListener('mouseenter', () => {
      const idx = Number(el.dataset.index);
      mentionSelectedIndex = idx;
      updateMentionSelection();
    });
  });
}

function updateMentionSelection(): void {
  if (!mentionList) return;
  mentionList.querySelectorAll<HTMLElement>('.mention-item').forEach((el, i) => {
    el.classList.toggle('selected', i === mentionSelectedIndex);
  });
}

function insertSelectedMention(input: HTMLTextAreaElement): void {
  if (!mentionList || mentionItems.length === 0 || mentionKind == null || mentionQueryStart < 0) {
    closeMentionList();
    return;
  }
  const item = mentionItems[mentionSelectedIndex];
  if (!item) { closeMentionList(); return; }
  const text = input.value;
  const cursorPos = input.selectionStart;
  const before = text.slice(0, mentionQueryStart);
  const after = text.slice(cursorPos);
  const insertText = `${mentionKind}${item.name} `;
  input.value = before + insertText + after;
  const newPos = (before + insertText).length;
  input.selectionStart = newPos;
  input.selectionEnd = newPos;
  autoResize(input);
  closeMentionList();
  input.focus();
}

function closeMentionList(): void {
  if (mentionList) { mentionList.remove(); mentionList = null; }
  mentionItems = [];
  mentionKind = null;
  mentionSelectedIndex = 0;
  mentionQueryStart = -1;
}

// ── 工具函数 ──────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
