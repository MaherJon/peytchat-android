export const state = {
  self: null,
  workspaces: [],
  currentWsId: null,
  channels: [],
  currentChatId: null,
  messages: [],
  pins: [],
  rightDrawerTab: 'members',
  rightDrawerOpen: false,
  currentApp: 'chat',      // "chat" | "work" | "inbox"
  currentView: 'messages', // "messages" | "kanban" | "list"
  cards: [],               // 当前频道的 card 列表
  currentCardId: null,     // 选中的 card id
  detailPanelOpen: true,   // detail panel 折叠状态
  homeMode: false,
  messagesOldestId: null,
  noMoreMsgs: false,
  roles: [],
  wsMembers: {},
  collapsedCategories: {},
  searchOpen: false,
  // Task 13: 当前频道的成员列表(包含 avatar/color),由 renderChatView 在
  // 调用 get_chat_info 时填充,供 message.js 查找发送者头像。切换频道时会被覆盖。
  currentMembers: [],
};
