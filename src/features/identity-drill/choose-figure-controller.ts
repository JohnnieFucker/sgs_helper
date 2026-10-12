/**
 * 身份演武中的自选身份 / 自选反贼 / 自选主忠：按房间座位顺序显示身份。
 */

import { createLayaObjectLocator } from '../../adapters/laya-object-locator.ts';
import { locateGameEventDispatcher, locateGameScene, type GameRuntimeWindow } from '../seat-display/game-scene-locator.ts';
import type { GameEventBus } from '../../runtime/game-event-bus.ts';
import { figureByClientOrder } from './choose-figure.ts';

type UnknownRecord = Record<string, unknown>;
const DEBUG_KEY = '__XIAOCHAO_CHOOSE_FIGURE_DEBUG__';

interface ChooseFigureDebugState {
  enabled: true;
  history: Array<Record<string, unknown>>;
  last: Record<string, unknown> | null;
  clear(): void;
}

/** 挂上轮询：进局后反复尝试，直到房间座位和武将牌都就绪。 */
export function installChooseFigureController(
  globalObject: GameRuntimeWindow = window,
  gameEvents?: GameEventBus
): () => void {
  let stableClientIds: string[] = [];
  let stableRoomKey = '';
  let lastDebugSignature = '';
  let lastDebugAt = 0;
  const debug = createDebugState(globalObject);
  const timer = globalObject.setInterval(applyChooseFigures, 500);
  const unsubscribe = gameEvents?.subscribe((event) => {
    if (event.type === 'game-reconnected') {
      recordDebug(debug, { event: 'game-reconnected', stableRoomKey, stableClientTokens: stableClientIds.map(clientToken) });
    }
    if (event.type === 'game-ended') {
      recordDebug(debug, { event: 'game-ended', stableRoomKey, stableClientTokens: stableClientIds.map(clientToken) });
      stableClientIds = [];
      stableRoomKey = '';
    }
  });
  applyChooseFigures();
  return () => {
    globalObject.clearInterval(timer);
    unsubscribe?.();
  };

  function applyChooseFigures(): void {
    try {
      const locator = createLayaObjectLocator(globalObject);
      const room = roomController(globalObject);
      const setting = asRecord(room?.TableSetting) ?? asRecord(room?.tableSetting);
      const mode = readMode(globalObject, room, setting);
      const settingSnapshot = readIdentitySettingSnapshot(setting);
      if (!shouldRevealIdentityFigures(mode)) {
        const debugSnapshot = {
          event: 'poll', roomKey: readRoomKey(room), setting: settingSnapshot,
          modeText: mode.modeText, modeType: mode.modeType, chooseMode: mode.chooseFigure, modeEnabled: false
        };
        const signature = JSON.stringify(debugSnapshot);
        const now = Date.now();
        if (signature !== lastDebugSignature || now - lastDebugAt >= 2000) {
          recordDebug(debug, debugSnapshot);
          lastDebugSignature = signature;
          lastDebugAt = now;
        }
        return;
      }
      const currentClientIds = readClientIds(
        asRecord(room?.TabbleSeatInfos)
        ?? asRecord(room?.tabbleSeatInfos)
        ?? asRecord(room?.TableSeatInfos)
        ?? asRecord(room?.tableSeatInfos)
      );
      if (currentClientIds.length !== 8) {
        recordDebug(debug, {
          event: 'poll', diagnostic: 'room-seat-list-not-ready',
          roomKey: readRoomKey(room), modeText: mode.modeText, modeType: mode.modeType,
          chooseMode: mode.chooseFigure, modeEnabled: true,
          seatListLength: readSeatListLength(room)
        });
        return;
      }
      const roomKey = readRoomKey(room);
      if (roomKey && stableRoomKey && roomKey !== stableRoomKey) {
        stableClientIds = [];
      }
      if (!stableClientIds.length) {
        stableClientIds = currentClientIds;
        stableRoomKey = roomKey;
      }
      const scene = seatScene(globalObject, locator);
      const seatUis = readSeatUis(scene);
      const seatMappings: Array<Record<string, unknown>> = [];
      for (const seatUi of seatUis) {
        const seat = asRecord(seatUi.seat);
        const clientId = readSeatClientId(seat);
        const figure = figureByClientOrder(stableClientIds, clientId);
        const manager = asRecord(seatUi.figureManager) ?? asRecord(seatUi.FigureManager);
        const currentFigure = Number(manager?.Figure);
        if (figure > 0) revealFigure(manager, figure);
        seatMappings.push({
          seatId: readSeatId(seat),
          clientToken: clientToken(clientId),
          isSelf: seatUi === scene?.SelfSeatUi,
          currentFigure,
          expectedFigure: figure
        });
      }
      const debugSnapshot = {
        event: 'poll',
        roomKey,
        setting: settingSnapshot,
        modeText: mode.modeText,
        modeType: mode.modeType,
        chooseMode: mode.chooseFigure,
        modeEnabled: true,
        currentClientTokens: currentClientIds.map(clientToken),
        stableRoomKey,
        stableClientTokens: stableClientIds.map(clientToken),
        seats: seatMappings
      };
      const signature = JSON.stringify(debugSnapshot);
      const now = Date.now();
      if (signature !== lastDebugSignature || now - lastDebugAt >= 2000) {
        recordDebug(debug, debugSnapshot);
        lastDebugSignature = signature;
        lastDebugAt = now;
      }
    } catch (error) {
      recordDebug(debug, {
        event: 'error',
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      });
    }
  }
}

/** 只在身份演武（74/84）且开启三种自选身份模式之一时显示。 */
export function shouldRevealIdentityFigures(input: {
  modeText: string;
  modeType?: number;
  chooseFigure: boolean;
}): boolean {
  const drill = input.modeText.includes('演武')
    || input.modeType === 74
    || input.modeType === 84;
  const custom = input.chooseFigure
    || /自选身份|身份自选|自选反贼|反贼自选|自选主忠|主忠自选/.test(input.modeText);
  return drill && custom;
}

function readSeatListLength(room: UnknownRecord | null): number {
  const seats = asRecord(room?.TabbleSeatInfos)
    ?? asRecord(room?.tabbleSeatInfos)
    ?? asRecord(room?.TableSeatInfos)
    ?? asRecord(room?.tableSeatInfos);
  if (!seats) return 0;
  const raw = seats.datum ?? seats.Datum ?? seats.list ?? seats.objs ?? seats;
  return Array.isArray(raw) || (raw && typeof raw === 'object' && typeof (raw as { length?: unknown }).length === 'number')
    ? Number((raw as { length: number }).length)
    : 0;
}

/** 模式名可能只存在于游戏上下文或房间设置文字中。 */
function readMode(
  globalObject: GameRuntimeWindow,
  room: UnknownRecord | null,
  setting: UnknownRecord | null
): { modeText: string; modeType: number; chooseFigure: boolean } {
  const scene = asRecord(locateGameScene(globalObject));
  const topMenu = asRecord(scene?.topMenu);
  const area = asRecord(topMenu?.areaServerLabel);
  const parts: unknown[] = [area?.text, scene?.modeName, scene?.ModeName];
  const context = createLayaObjectLocator(globalObject).gameContext()
    ?? asRecord((globalObject as unknown as UnknownRecord).GameContext);
  let modeType = 0;
  try {
    const getModeVo = context?.GetModeVO;
    const vo = typeof getModeVo === 'function' ? asRecord(getModeVo.call(context)) : null;
    const getModeType = context?.GetModeType;
    const rawModeType = vo?.ModeType ?? vo?.modeType
      ?? (typeof getModeType === 'function' ? getModeType.call(context) : 0);
    modeType = Number(rawModeType) || 0;
    parts.push(
      vo?.ModeName, vo?.modeName, vo?.Name, vo?.name,
      vo?.SectionName, vo?.sectionName, vo?.ModelName, vo?.modelName,
      vo?.SectionDesc, vo?.Desc, vo?.desc
    );
  } catch {
    // 模式名读失败时继续看房间设置里的文字。
  }
  collectChinese(setting, parts);
  collectChinese(room, parts);
  return {
    modeText: parts.filter((part): part is string => typeof part === 'string').join(' '),
    modeType,
    chooseFigure: isChooseFigure(setting)
  };
}

function collectChinese(record: UnknownRecord | null, parts: unknown[]): void {
  if (!record) return;
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && /[\u4e00-\u9fff]/.test(value)) parts.push(value);
  }
}

function createDebugState(globalObject: GameRuntimeWindow): ChooseFigureDebugState {
  const host = globalObject as unknown as UnknownRecord;
  const existing = asRecord(host[DEBUG_KEY]);
  if (existing && Array.isArray(existing.history)) return existing as unknown as ChooseFigureDebugState;
  const state: ChooseFigureDebugState = {
    enabled: true,
    history: [],
    last: null,
    clear() { state.history.length = 0; state.last = null; }
  };
  host[DEBUG_KEY] = state;
  return state;
}

function recordDebug(state: ChooseFigureDebugState, entry: Record<string, unknown>): void {
  const record = { at: new Date().toISOString(), ...entry };
  state.last = record;
  state.history.push(record);
  if (state.history.length > 100) state.history.splice(0, state.history.length - 100);
}

/** 读取房间标识，防止同一页面切到另一房间时沿用旧账号顺序。 */
function readRoomKey(room: UnknownRecord | null): string {
  if (!room) return '';
  for (const key of ['RoomID', 'RoomId', 'roomID', 'roomId', 'TableID', 'TableId', 'tableId', 'RoomNo']) {
    const value = room[key];
    if (value === null || value === undefined || value === '') continue;
    return String(value);
  }
  return '';
}

/** 自选身份开关。桌子上可能是布尔，也可能是 1。 */
export function isChooseFigure(setting: UnknownRecord | null): boolean {
  if (!setting) return false;
  const identityModeKey = /(?:choose|select).*(figure|identity|rebel|lord|loyal|zhong|fan|zhu|role)|(?:figure|identity|rebel|lord|loyal|zhong|fan|zhu|role).*(?:choose|select)/i;
  return Object.entries(setting).some(([key, value]) => identityModeKey.test(key)
    && (value === true || value === 1 || value === '1'));
}

function readIdentitySettingSnapshot(setting: UnknownRecord | null): Record<string, unknown> {
  if (!setting) return {};
  return Object.fromEntries(Object.entries(setting)
    .filter(([key, value]) => /choose|select|figure|identity|rebel|lord|loyal|zhong|fan|zhu|role/i.test(key)
      && ['string', 'number', 'boolean'].includes(typeof value)));
}

/** 房间单例没有固定入口，按管理器列表、类名和事件监听者依次找。 */
function roomController(globalObject: GameRuntimeWindow): UnknownRecord | null {
  const globals = globalObject as UnknownRecord;
  const locator = createLayaObjectLocator(globalObject);
  const windowManager = locator.manager('WindowManager');
  const managerList = asRecord(windowManager?.constructor)?.managerList;
  const named = [
    roomFromReady(locator),
    firstRoom(Array.isArray(managerList) ? managerList : []),
    lookupNamed(globals, 'RoomControler'),
    asRecord(asRecord(globals.GameContext)?.RoomControler),
    asRecord(asRecord(globals.GameContext)?.roomControler),
    nestedRoom(locator.gameContext())
  ];
  for (const room of named) {
    if (room) return room;
  }
  const dispatcher = locateGameEventDispatcher(globalObject);
  const events = asRecord(dispatcher?._events);
  if (!events) return null;
  for (const listeners of Object.values(events)) {
    const list = Array.isArray(listeners) ? listeners : [listeners];
    for (const listener of list) {
      const caller = asRecord(asRecord(listener)?.caller);
      if (hasTableSetting(caller)) return caller;
    }
  }
  return null;
}

/** 进房应答的监听者就是房间对象。 */
function roomFromReady(locator: ReturnType<typeof createLayaObjectLocator>): UnknownRecord | null {
  const events = asRecord(locator.manager('ServerProxy')?._events);
  const listeners = events?.GsCReadyResp;
  const list = Array.isArray(listeners) ? listeners : [listeners];
  for (const listener of list) {
    const caller = asRecord(asRecord(listener)?.caller);
    if (hasTableSetting(caller)) return caller;
  }
  return null;
}

/** 牌局优先；人还在等待房间时用当前场景上的座位。 */
function seatScene(
  globalObject: GameRuntimeWindow,
  locator: ReturnType<typeof createLayaObjectLocator>
): UnknownRecord | null {
  const game = asRecord(locateGameScene(globalObject));
  if (readSeatUis(game).length > 0) return game;
  const current = asRecord(locator.scene());
  if (readSeatUis(current).length > 0) return current;
  return null;
}

function firstRoom(list: unknown[]): UnknownRecord | null {
  for (const item of list) {
    const record = asRecord(item);
    if (hasTableSetting(record)) return record;
  }
  return null;
}

function nestedRoom(context: UnknownRecord | null): UnknownRecord | null {
  if (!context) return null;
  for (const value of Object.values(context)) {
    const record = asRecord(value);
    if (hasTableSetting(record)) return record;
  }
  return null;
}

function lookupNamed(globals: UnknownRecord, name: string): UnknownRecord | null {
  for (const runtime of [asRecord(globals.zy), asRecord(globals.laya), asRecord(globals.Laya)]) {
    const lookup = runtime?.class;
    if (typeof lookup !== 'function') continue;
    try {
      const found = lookup.call(runtime, name);
      const record = asRecord(found);
      if (hasTableSetting(record)) return record;
      if (typeof found === 'function') {
        const ctor = found as { instance?: unknown; I?: unknown; prototype?: object };
        const instance = asRecord(ctor.instance) ?? asRecord(ctor.I);
        if (hasTableSetting(instance)) return instance;
      }
    } catch {
      // 换下一个入口。
    }
  }
  try {
    const classUtils = asRecord(asRecord(globals.Laya)?.ClassUtils);
    const getClass = classUtils?.getClass;
    if (typeof getClass !== 'function') return null;
    const ctor = getClass.call(classUtils, name) as { instance?: unknown; I?: unknown } | undefined;
    return asRecord(ctor?.instance) ?? asRecord(ctor?.I);
  } catch {
    return null;
  }
}

function hasTableSetting(value: UnknownRecord | null): boolean {
  return !!(value && (value.TableSetting || value.tableSetting || value.TabbleSeatInfos || value.tabbleSeatInfos || value.TableSeatInfos));
}

/** 只接受正好 8 个座位的账号表，空位保留位置，不能滤掉后错位。 */
function readClientIds(seats: UnknownRecord | null): string[] {
  if (!seats) return [];
  const raw = seats.datum ?? seats.Datum ?? seats.list ?? seats.objs ?? seats;
  const list = asList(raw);
  const ids = list.map(readDatumClientId);
  return ids.length === 8 ? ids : [];
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && typeof (value as { length?: unknown }).length === 'number') {
    return Array.from(value as ArrayLike<unknown>);
  }
  return [];
}

/** 身份还没写成目标值时才调用 SetFigure，避免每轮轮询重绘。 */
function revealFigure(manager: UnknownRecord | null, figure: number): void {
  if (!manager || figure <= 0 || Number(manager.Figure) === figure) return;
  if (typeof manager.SetFigure === 'function') {
    try { manager.SetFigure(figure); } catch { /* 单座位失败不影响其他人。 */ }
    return;
  }
  manager.Figure = figure;
}

function readDatumClientId(value: unknown): string {
  const record = asRecord(value);
  const seatPlayer = asRecord(record?.SeatPlayerInfo)
    ?? asRecord(record?.seatPlayerInfo)
    ?? asRecord(record?.playerInfo)
    ?? asRecord(record?.data)
    ?? asRecord(record?.Data)
    ?? asRecord(record?.value)
    ?? record;
  return normalizeId(seatPlayer?.ClientId ?? seatPlayer?.clientId ?? seatPlayer?.ClientID);
}

function readSeatClientId(seat: UnknownRecord | null): string {
  const info = asRecord(seat?.playerInfo) ?? asRecord(seat?.PlayerInfo) ?? seat;
  return normalizeId(info?.ClientId ?? info?.clientId ?? info?.ClientID);
}

function readSeatId(seat: UnknownRecord | null): number | null {
  if (!seat) return null;
  for (const key of ['seatID', 'seatId', 'SeatID', 'SeatId', 'index', 'Index']) {
    const value = Number(seat[key]);
    if (Number.isInteger(value) && value >= 0 && value < 0xff) return value;
  }
  return null;
}

/** 调试记录只保留账号编号的稳定短指纹，不写出原始 ClientId。 */
function clientToken(value: string): string {
  if (!value) return '';
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeId(value: unknown): string {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? String(id) : '';
}

function readSeatUis(scene: UnknownRecord | null): UnknownRecord[] {
  const container = asRecord(scene?.seatContainer);
  const list = container?.seatUIs ?? container?.seatUis;
  if (!Array.isArray(list)) return [];
  return list.map(asRecord).filter((seat): seat is UnknownRecord => seat !== null);
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' ? value as UnknownRecord : null;
}
