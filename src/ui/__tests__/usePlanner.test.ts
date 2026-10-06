import { describe, expect, it, vi } from 'vitest';
import { createSampleSnapshot } from '../../core/sample-data';
import { usePlanner } from '../usePlanner';
import type { PackingSnapshot, PlanMode } from '../../core/models';
import type { PlannerRepository } from '../../ports/planner-repository.port';
import type { PrintPort } from '../../ports/print.port';

class MemoryRepository implements PlannerRepository {
  saved?: PackingSnapshot;
  constructor(private snapshot = createSampleSnapshot()) {}
  load() { return { value: structuredClone(this.snapshot) }; }
  save(snapshot: PackingSnapshot) { this.saved = structuredClone(snapshot); }
}

function createHarness(snapshot?: PackingSnapshot) {
  const repository = new MemoryRepository(snapshot ? structuredClone(snapshot) : undefined);
  let afterPrint: (() => void) | undefined;
  const print = vi.fn((callback?: () => void) => { afterPrint = callback; });
  const printPort: PrintPort = { print };
  const planner = usePlanner({ repository, printPort });
  return {
    repository,
    planner,
    print,
    finishPrint: () => afterPrint?.(),
  };
}

const newItem = { id: 'new', name: '帽子', category: '衣物', length: 12, width: 12, height: 5, weight: 0.2, priority: 2 as const, mustHave: false };

describe('usePlanner', () => {
  it('adds, updates and removes items while marking results stale', () => {
    const { planner } = createHarness();
    const initial = planner.state.items.length;
    planner.addItem(newItem);
    expect(planner.state.items).toHaveLength(initial + 1);
    expect(planner.isStale.value).toBe(true);
    planner.updateItem('new', { name: '遮阳帽' });
    expect(planner.state.items.find((item) => item.id === 'new')?.name).toBe('遮阳帽');
    planner.removeItem('new');
    expect(planner.state.items).toHaveLength(initial);
  });

  it('regenerates plans and persists the selected mode', () => {
    const { planner, repository } = createHarness();
    planner.updateSuitcase({ maxWeight: 12 });
    expect(planner.isStale.value).toBe(true);
    planner.regenerate();
    planner.selectPlan('shopping');
    expect(planner.isStale.value).toBe(false);
    expect(planner.plans.value.shopping.name).toBe('购物版');
    expect(repository.saved?.selectedPlan).toBe('shopping');
  });

  it('freezes the plan and items when printing starts', async () => {
    const { planner, print } = createHarness();
    const expectedMode: PlanMode = planner.state.selectedPlan;
    planner.requestPrint();
    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));

    expect(planner.inPrintSession.value).toBe(true);
    expect(planner.printSheet.value).not.toBeNull();
    const sheet = planner.printSheet.value!;
    expect(sheet.plan.id).toBe(expectedMode);
    expect(sheet.packed.length + sheet.omitted.length).toBe(planner.state.items.length);

    // 打印准备期间切换策略，冻结单仍是原方案，不混入另一套数据。
    const originalPlanId = sheet.plan.id;
    planner.selectPlan('shopping');
    expect(planner.state.selectedPlan).toBe('shopping');
    expect(planner.printSheet.value?.plan.id).toBe(originalPlanId);

    // 打印准备期间增删物品，冻结单仍保留发起打印那一刻的清单。
    planner.addItem(newItem);
    const frozenCount = sheet.items.length;
    expect(planner.state.items.length).toBe(frozenCount + 1);
    expect(planner.printSheet.value?.items.length).toBe(frozenCount);
  });

  it('blocks printing stale results until regenerated or cancelled', async () => {
    const { planner, print } = createHarness();
    planner.addItem(newItem);
    expect(planner.isStale.value).toBe(true);

    planner.requestPrint();
    expect(print).not.toHaveBeenCalled();
    expect(planner.printGate.value).toBe(true);
    expect(planner.inPrintSession.value).toBe(false);

    // 取消打印：陈旧状态保留，但拦截门关闭，策略与物品不变。
    planner.cancelPrint();
    expect(planner.printGate.value).toBe(false);
    expect(planner.isStale.value).toBe(true);
    expect(planner.state.items.some((item) => item.id === 'new')).toBe(true);

    // 再次发起并选择「重新计算并打印」，冻结的是新位置与新清单。
    planner.requestPrint();
    expect(planner.printGate.value).toBe(true);
    planner.regenerateAndPrint();
    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(planner.isStale.value).toBe(false);
    expect(planner.printSheet.value?.items.some((item) => item.id === 'new')).toBe(true);
  });

  it('ending or cancelling the print session does not change strategy or items', async () => {
    const { planner, finishPrint } = createHarness();
    const modeBefore = planner.state.selectedPlan;
    const itemsBefore = planner.state.items.map((item) => item.id);

    planner.requestPrint();
    await vi.waitFor(() => expect(planner.inPrintSession.value).toBe(true));
    finishPrint();
    expect(planner.inPrintSession.value).toBe(false);
    expect(planner.state.selectedPlan).toBe(modeBefore);
    expect(planner.state.items.map((item) => item.id)).toEqual(itemsBefore);

    planner.requestPrint();
    await vi.waitFor(() => expect(planner.inPrintSession.value).toBe(true));
    planner.cancelPrint();
    expect(planner.inPrintSession.value).toBe(false);
    expect(planner.state.selectedPlan).toBe(modeBefore);
    expect(planner.state.items.map((item) => item.id)).toEqual(itemsBefore);
  });
});
