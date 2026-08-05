/**
 * compat/ui/composer — 消息编辑适配器
 *
 * 提供移动端消息输入体验: Emoji 面板、@/# 建议、附件上传、斜杠命令、乐观更新。
 * 内部使用 api.ts 的 call() 直接调用后端命令,state.ts 管理状态。
 *
 * 适配桌面端 chat/composer.ts 的功能到移动端布局。
 */

import { call } from '../../api.js';
import { state, setState } from '../../state.js';
import { escapeHtml } from '../../shared/utils/index.js';
import { QUICK_EMOJIS } from '../../shared/constants/index.js';
import { iconSvg } from '../../components/icon.js';
import type { MsgDto, ChannelDto } from '../../shared/types/index.js';

// ── 类型 ──────────────────────────────────────────────────────────────────

/** 发送回调 */
export type MobileComposerOnSent = () => void;

/** 临时消息(乐观更新) */
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

// ── @/# 建议面板状态 ────────────────────────────────────────────────────

let mentionList: HTMLElement | null = null;
let mentionItems: Array<{ name: string; type: 'member' | 'channel' }> = [];
let mentionKind: '@' | '#' | null = null;
let mentionSelectedIndex = 0;
let mentionQueryStart = -1;

// ── 公开 API ────────────────────────────────────────────────────────────

/**
 * 渲染移动端消息编辑器到容器。
 *
 * @param chatId - 当前聊天 ID
 * @param container - 目标容器元素(带 data-reply-to 属性表示回复模式)
 * @param onSent - 发送成功后的回调
 */
export function renderComposer(
  chatId: number,
  container: HTMLElement,
  onSent: MobileComposerOnSent,
): void {
  closeMentionList();

  // Reply 预览条
  let replyPreview = '';
  if (container.dataset.replyTo) {
    const replyMsg = state.messages.find(
      (m) => String(m.msg_id) === String(container.dataset.replyTo),
    );
    if (replyMsg) {
      const senderName = replyMsg.from_id === state.self?.id
        ? '我'
        : (replyMsg.from_name || '未知');
      replyPreview = `
        <div class="mobile-reply-preview" id="reply-preview">
          <div class="reply-preview-icon">${iconSvg('reply', { width: 14, height: 14 })}</div>
          <div class="reply-preview-body">
            <div class="reply-preview-name">回复 ${escapeHtml(senderName)}</div>
            <div class="reply-preview-text">${escapeHtml((replyMsg.text || '').slice(0, 40))}</div>
          </div>
          <span class="rp-cancel" id="rp-cancel" title="取消回复">${iconSvg('x', { width: 14, height: 14 })}</span>
        </div>
      `;
    }
  }

  container.innerHTML = `
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
      <input type="file" id="mc-file-input" style="display:none" multiple />
    </div>
  `;

  const input = document.getElementById('composer-input') as HTMLTextAreaElement | null;
  const sendBtn = document.getElementById('composer-send') as HTMLButtonElement | null;
  if (!input || !sendBtn) return;

  const updateSendState = () => {
    sendBtn.disabled = !input.value.trim();
  };
  updateSendState();

  // 发送按钮
  sendBtn.addEventListener('click', async () => {
    if (!input.value.trim()) return;
    await sendMessage(chatId, input, container, onSent);
    updateSendState();
  });

  // 取消回复
  const rpCancel = document.getElementById('rp-cancel');
  if (rpCancel) {
    rpCancel.onclick = () => {
      delete container.dataset.replyTo;
      renderComposer(chatId, container, onSent);
    };
  }

  // 输入事件
  input.oninput = () => {
    autoResize(input);
    handleMentionInput(input);
    updateSendState();
  };

  // 键盘事件
  input.onkeydown = async (e) => {
    if (mentionList) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionSelectedIndex = (mentionSelectedIndex + 1) % mentionItems.length;
        updateMentionSelection();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionSelectedIndex =
          (mentionSelectedIndex - 1 + mentionItems.length) % mentionItems.length;
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
    const isReplying = !!container.dataset.replyTo;
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      if (isReplying) {
        insertNewline(input);
      } else {
        e.preventDefault();
        if (!input.value.trim()) return;
        await sendMessage(chatId, input, container, onSent);
      }
    } else if (e.key === 'Escape') {
      if (container.dataset.replyTo) {
        delete container.dataset.replyTo;
        renderComposer(chatId, container, onSent);
      }
    }
  };

  // Emoji 按钮
  const emojiBtn = document.getElementById('mc-emoji-btn');
  emojiBtn?.addEventListener('click', () => {
    toggleEmojiPicker(input, emojiBtn);
  });

  // 附件按钮
  const attachBtn = document.getElementById('mc-attach-btn');
  const fileInput = document.getElementById('mc-file-input') as HTMLInputElement | null;
  attachBtn?.addEventListener('click', () => {
    fileInput?.click();
  });
  fileInput?.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleAttachmentUpload(chatId, fileInput.files, container, onSent);
      fileInput.value = '';
    }
  });
}

// ── 发送逻辑 ────────────────────────────────────────────────────────────

async function sendMessage(
  chatId: number,
  input: HTMLTextAreaElement,
  container: HTMLElement,
  onSent: MobileComposerOnSent,
): Promise<void> {
  const text = input.value.trim();
  if (!text) return;

  // 斜杠命令分发
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
        const { showToast } = await import('../../toast.js');
        showToast(e instanceof Error ? e.message : String(e));
      }
      onSent();
      return;
    }
  }

  const replyTo = container.dataset.replyTo;
  const tmpId = `tmp_${Date.now()}`;
  const selfId = state.self?.id ?? 0;
  const selfName = state.self?.name ?? '我';
  const tmpMsg: TmpMsg = {
    msg_id: tmpId,
    from_id: selfId,
    from_name: selfName,
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

  // 乐观更新
  const { appendOptimisticMessage: desktopFn } = await import('../../chat/chatView.js');
  desktopFn(tmpMsg as unknown as MsgDto);
  input.value = '';
  autoResize(input);
  closeMentionList();

  try {
    if (replyTo) {
      await call('send_reply', { chatId, text, quoteMsgId: Number(replyTo) });
      delete container.dataset.replyTo;
      renderComposer(chatId, container, onSent);
    } else {
      await call('send_text', { chatId, text });
    }
    onSent();
  } catch (e) {
    // 标记失败,允许点击重试
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
        await sendMessage(chatId, input, container, onSent);
      };
    }
    const { showToast } = await import('../../toast.js');
    showToast(e instanceof Error ? e.message : String(e));
  }
}

// ── 附件上传 ────────────────────────────────────────────────────────────

async function handleAttachmentUpload(
  chatId: number,
  files: FileList,
  container: HTMLElement,
  onSent: MobileComposerOnSent,
): Promise<void> {
  const replyTo = container.dataset.replyTo;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
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
      } as Record<string, unknown>);
    } catch (e) {
      const { showToast } = await import('../../toast.js');
      showToast(`发送 ${file.name} 失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (replyTo) {
    delete container.dataset.replyTo;
    renderComposer(chatId, container, onSent);
  }
  onSent();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

// ── 输入框自适应 ────────────────────────────────────────────────────────

function autoResize(input: HTMLTextAreaElement): void {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';
}

function insertNewline(input: HTMLTextAreaElement): void {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  input.value = input.value.slice(0, start) + '\n' + input.value.slice(end);
  const pos = start + 1;
  input.selectionStart = pos;
  input.selectionEnd = pos;
  autoResize(input);
}

// ── Emoji 选择器 ────────────────────────────────────────────────────────

function toggleEmojiPicker(input: HTMLTextAreaElement, anchor: HTMLElement): void {
  const existing = document.getElementById('mc-emoji-picker');
  if (existing) {
    existing.remove();
    return;
  }

  const picker = document.createElement('div');
  picker.id = 'mc-emoji-picker';
  picker.className = 'mc-emoji-picker';
  picker.innerHTML = QUICK_EMOJIS.map(
    (emoji) =>
      `<span class="mc-emoji-item" data-emoji="${emoji}">${emoji}</span>`,
  ).join('');

  const rect = anchor.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  picker.style.left = `${Math.max(8, rect.left - 100)}px`;
  picker.style.zIndex = '300';

  document.body.appendChild(picker);

  picker.querySelectorAll<HTMLElement>('.mc-emoji-item').forEach((el) => {
    el.addEventListener('click', () => {
      const emoji = el.dataset.emoji || '';
      insertAtCursor(input, emoji);
      autoResize(input);
      picker.remove();
      input.focus();
    });
  });

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

// ── @提及 / #频道 建议 ─────────────────────────────────────────────────

function handleMentionInput(input: HTMLTextAreaElement): void {
  const text = input.value;
  const cursorPos = input.selectionStart;
  const beforeCursor = text.slice(0, cursorPos);

  // @提及 — 使用 state.currentMembers(来自桌面端 state)
  const atMatch = beforeCursor.match(/@(\w*)$/);
  if (atMatch) {
    const query = atMatch[1].toLowerCase();
    const members = state.currentMembers || [];
    const filtered = members.filter(
      (m) => m.name.toLowerCase().includes(query),
    );
    if (filtered.length > 0) {
      const atPos = cursorPos - atMatch[0].length;
      showMentionList(
        filtered.map((m) => ({ name: m.name, type: 'member' as const })),
        '@',
        atPos,
        input,
      );
    } else {
      closeMentionList();
    }
    return;
  }

  // #频道 — 使用 state.channels
  const hashMatch = beforeCursor.match(/#(\w*)$/);
  if (hashMatch) {
    const query = hashMatch[1].toLowerCase();
    const channels = state.channels.filter(
      (c) => c.name.toLowerCase().includes(query),
    );
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
  mentionList.innerHTML = items
    .map((item, i) => {
      const prefix = item.type === 'channel' ? '#' : '@';
      return `<div class="mention-item ${i === 0 ? 'selected' : ''}" data-index="${i}" data-name="${escapeHtml(item.name)}">
        <span class="mention-prefix">${prefix}</span>
        <span class="mention-name">${escapeHtml(item.name)}</span>
      </div>`;
    })
    .join('');

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
  if (
    !mentionList ||
    mentionItems.length === 0 ||
    mentionKind == null ||
    mentionQueryStart < 0
  ) {
    closeMentionList();
    return;
  }
  const item = mentionItems[mentionSelectedIndex];
  if (!item) {
    closeMentionList();
    return;
  }
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
  if (mentionList) {
    mentionList.remove();
    mentionList = null;
  }
  mentionItems = [];
  mentionKind = null;
  mentionSelectedIndex = 0;
  mentionQueryStart = -1;
}
