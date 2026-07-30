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
  detailPanelOpen: true,   // detail panel 折叠状态
  homeMode: false,
  messagesOldestId: null,
  noMoreMsgs: false,
  roles: [],
  wsMembers: {},
  collapsedCategories: {},
  searchOpen: false,
};
