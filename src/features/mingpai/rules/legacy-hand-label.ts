/**
 * 从混淆版 xiaochao.js 的 PubGsCMoveCard 抄出的手牌来源标记。
 * 条件：牌进手牌、不是回收区、目标是自己、技能号存在、移动类型在 1 和 255 之间。
 * 标记取技能名前两字。读不到技能名就不标。
 */

type SpellDict = Record<string, { name?: string } | undefined>;

export function legacyIncomingHandLabel(input: {
  spellId: number;
  moveType: number;
  fromZone: number;
  toZone: number;
  toId: number;
  selfSeatId: number | null;
}): string | null {
  if (input.toZone !== 5 || input.fromZone === 12) return null;
  if (input.selfSeatId === null || input.toId !== input.selfSeatId) return null;
  if (!input.spellId || input.moveType <= 1 || input.moveType >= 255) return null;
  const dict = (globalThis as { jI?: { spellDict?: SpellDict } }).jI?.spellDict;
  const name = dict?.[input.spellId]?.name;
  if (!name) return null;
  return name.slice(0, 2);
}
