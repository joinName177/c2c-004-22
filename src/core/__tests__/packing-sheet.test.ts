import { describe, expect, it } from 'vitest';
import { packItems } from '../packing-engine';
import { buildPackingSheet, describeOrientation, describeZone } from '../packing-sheet';
import type { PackingItem, PackingPlan, Suitcase } from '../models';

const suitcase: Suitcase = { length: 50, width: 40, height: 30, maxWeight: 20 };

const item = (overrides: Partial<PackingItem> = {}): PackingItem => ({
  id: 'item',
  name: '物品',
  category: '杂物',
  length: 20,
  width: 15,
  height: 10,
  weight: 1,
  priority: 2,
  mustHave: false,
  ...overrides,
});

function sheetFor(plan: PackingPlan, items: PackingItem[]) {
  return buildPackingSheet(plan, suitcase, items, [], () => 1_700_000_000_000);
}

describe('describeOrientation', () => {
  it('reports the original orientation when axes are unchanged', () => {
    expect(describeOrientation(item(), { length: 20, width: 15, height: 10 })).toContain('原向');
  });

  it('describes each axial rotation by mapping box axes to the original axes', () => {
    const sideFlip = describeOrientation(item(), { length: 20, width: 10, height: 15 });
    expect(sideFlip).toContain('旋转摆放');
    expect(sideFlip).toContain('箱宽取原高');
    expect(sideFlip).toContain('箱高取原宽');
    const upright = describeOrientation(item(), { length: 10, width: 15, height: 20 });
    expect(upright).toContain('箱长取原高');
    expect(upright).toContain('箱高取原长');
  });

  it('always lists the placed dimensions for checking against the box', () => {
    const text = describeOrientation(item(), { length: 10, width: 20, height: 15 });
    expect(text).toContain('放置尺寸 10×20×15 cm');
    expect(text).toContain('原尺寸 20×15×10 cm');
  });
});

describe('describeZone', () => {
  const placement = (z: number, height = 10) => ({
    itemId: 'item', x: 0, y: 0, z, dimensions: { length: 1, width: 1, height },
  });

  it('splits the box into lower, middle and upper layers', () => {
    expect(describeZone(placement(0), suitcase)).toBe('下层');
    expect(describeZone(placement(12, 6), suitcase)).toBe('中层');
    expect(describeZone(placement(22, 8), suitcase)).toBe('上层');
  });
});

describe('buildPackingSheet', () => {
  it('numbers packed entries consecutively in placement order with coordinates and weight', () => {
    const items = [
      item({ id: 'a', name: '箱子A', weight: 2 }),
      item({ id: 'b', name: '箱子B', length: 10, width: 10, height: 10, weight: 3 }),
    ];
    const plan = packItems(suitcase, items, 'comfort');
    const sheet = sheetFor(plan, items);

    expect(sheet.packed).toHaveLength(2);
    expect(sheet.packed.map((entry) => entry.number)).toEqual([1, 2]);
    expect(sheet.packed[0]).toMatchObject({ number: 1 });
    expect(sheet.packed[0].item.id).toBe('a');
    expect(sheet.packed[0].placement.x).toBe(0);
    expect(sheet.packed[0].location).toContain('原点（左下后角）');
    expect(sheet.packed[0].location).toContain('下层');
    expect(sheet.packed[0].item.weight).toBe(2);
    expect(sheet.generatedAt).toBe(1_700_000_000_000);
  });

  it('numbers duplicate-named items independently', () => {
    const items = [
      item({ id: 'shirt-1', name: '同款T恤' }),
      item({ id: 'shirt-2', name: '同款T恤' }),
      item({ id: 'shirt-3', name: '同款T恤' }),
    ];
    const sheet = sheetFor(packItems(suitcase, items, 'comfort'), items);
    expect(sheet.packed.map((entry) => entry.number)).toEqual([1, 2, 3]);
    expect(sheet.packed.map((entry) => entry.item.id)).toEqual(['shirt-1', 'shirt-2', 'shirt-3']);
    expect(new Set(sheet.packed.map((entry) => entry.item.name))).toEqual(new Set(['同款T恤']));
  });

  it('lists unplaced items with the engine reason and flags must-have omissions separately', () => {
    const tiny: Suitcase = { length: 10, width: 10, height: 10, maxWeight: 1 };
    const items = [
      item({ id: 'big', name: '大物件', length: 40, mustHave: false }),
      item({ id: 'passport', name: '证件夹', length: 8, width: 8, height: 2, weight: 0.2, mustHave: true }),
      item({ id: 'heavy', name: '铁块', length: 8, width: 8, height: 8, weight: 5, mustHave: true }),
    ];
    const plan = packItems(tiny, items, 'comfort');
    const sheet = buildPackingSheet(plan, tiny, items, [], () => 0);

    expect(sheet.packed.map((entry) => entry.item.id)).toEqual(['passport']);
    expect(sheet.omitted.map((entry) => entry.item.id)).toEqual(['heavy', 'big']);
    expect(sheet.omitted[0].reason).not.toBe('');
    expect(sheet.omitted[0].number).toBe(1);
    expect(sheet.missingMustHave.map((entry) => entry.item.id)).toEqual(['heavy']);
    expect(sheet.missingMustHave[0].mustHave).toBe(true);
  });
});
