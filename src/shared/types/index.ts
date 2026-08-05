/**
 * shared/types — 共享类型层
 *
 * 集中重导出 src/types.ts 中的所有类型。
 * mobile/ 和 compat/ 都从这里导入类型,不直接依赖 src/types.ts。
 *
 * COMPAT_API_VERSION: 兼容层 API 版本号。
 * 当上游 Desktop API 发生 breaking change 时递增此版本号,
 * 同时更新 compat/ 层以适配新 API。
 * mobile/ 通过检查此版本号决定是否需要更新。
 */

// ── 重导出 src/types.ts 中的所有类型 ────────────────────────────────────
export type {
  Page,
  SettingsSection,
  PluginsTab,
  PluginPermission,
  SpaceType,
  CurrentView,
  WorkTab,
  InboxEventType,
  MsgState,
  CardType,
  CardStatus,
  WorkspaceDto,
  ChannelDto,
  MemberDto,
  MsgDto,
  CardDto,
  InboxEventDto,
  ActivityDto,
  SelfProfile,
  RoleDto,
  AppState,
  ChatListItem,
} from '../../types.js';

// ── 兼容层版本号 ─────────────────────────────────────────────────────────
/** 兼容层 API 版本。上游 Desktop API breaking change 时递增。 */
export const COMPAT_API_VERSION = 1;

export interface CompatVersionInfo {
  /** 当前兼容层版本 */
  version: number;
  /** 兼容层期望的上游 API 版本标识 */
  upstreamTarget: string;
}
