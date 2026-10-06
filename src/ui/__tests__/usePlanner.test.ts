import { describe, expect, it } from 'vitest';
import { createSampleSnapshot } from '../../core/sample-data';
import { usePlanner } from '../usePlanner';
import type { PackingSnapshot, PrintJob } from '../../core/models';
import type { PlannerRepository } from '../../ports/planner-repository.port';

class MemoryRepository implements PlannerRepository {
  saved?: PackingSnapshot;
  constructor(private snapshot = createSampleSnapshot()) {}
  load() { return { value: structuredClone(this.snapshot) }; }
  save(snapshot: PackingSnapshot) { this.saved = structuredClone(snapshot); }
}

const extraItem = { id: 'late', name: '雨伞', category: '随身', length: 30, width: 8, height: 8, weight: 0.4, priority: 2 as const, mustHave: false };

describe('usePlanner', () => {
  it('adds, updates and removes items while marking results stale', () => {
    const repository = new MemoryRepository();
    const planner = usePlanner({ repository, printPort: { print() {} } });
    const initial = planner.state.items.length;
    planner.addItem({ id: 'new', name: '帽子', category: '衣物', length: 12, width: 12, height: 5, weight: 0.2, priority: 2, mustHave: false });
    expect(planner.state.items).toHaveLength(initial + 1);
    expect(planner.isStale.value).toBe(true);
    planner.updateItem('new', { name: '遮阳帽' });
    expect(planner.state.items.find((item) => item.id === 'new')?.name).toBe('遮阳帽');
    planner.removeItem('new');
    expect(planner.state.items).toHaveLength(initial);
  });

  it('regenerates plans and persists the selected mode', () => {
    const repository = new MemoryRepository();
    const planner = usePlanner({ repository, printPort: { print() {} } });
    planner.updateSuitcase({ maxWeight: 12 });
    expect(planner.isStale.value).toBe(true);
    planner.regenerate();
    planner.selectPlan('shopping');
    expect(planner.isStale.value).toBe(false);
    expect(planner.plans.value.shopping.name).toBe('购物版');
    expect(repository.saved?.selectedPlan).toBe('shopping');
  });

  it('freezes plan and items at print time so later changes cannot leak in', async () => {
    const repository = new MemoryRepository();
    let captured: PrintJob | null = null;
    const planner = usePlanner({ repository, printPort: { print: () => { captured = planner.printJob.value; } } });
    await planner.print();
    expect(captured).not.toBeNull();
    expect(captured!.plan.id).toBe('comfort');
    planner.selectPlan('shopping');
    planner.addItem(extraItem);
    planner.updateItem('jacket', { name: '改名外套' });
    expect(captured!.plan.id).toBe('comfort');
    expect(captured!.items.some((item) => item.id === 'late')).toBe(false);
    expect(captured!.items.find((item) => item.id === 'jacket')?.name).toBe('轻薄外套');
    expect(planner.printJob.value).toBeNull();
  });

  it('blocks printing while stale and resumes only after recalculation', async () => {
    const repository = new MemoryRepository();
    let printCount = 0;
    const planner = usePlanner({ repository, printPort: { print: () => { printCount += 1; } } });
    planner.addItem(extraItem);
    expect(planner.isStale.value).toBe(true);
    await planner.print();
    expect(printCount).toBe(0);
    expect(planner.printBlocked.value).toBe(true);
    await planner.recalculateAndPrint();
    expect(printCount).toBe(1);
    expect(planner.isStale.value).toBe(false);
    expect(planner.printBlocked.value).toBe(false);
  });

  it('canceling a blocked print keeps the selected plan and items untouched', async () => {
    const repository = new MemoryRepository();
    let printCount = 0;
    const planner = usePlanner({ repository, printPort: { print: () => { printCount += 1; } } });
    planner.selectPlan('shopping');
    planner.addItem(extraItem);
    await planner.print();
    expect(planner.printBlocked.value).toBe(true);
    planner.cancelPrint();
    expect(planner.printBlocked.value).toBe(false);
    expect(printCount).toBe(0);
    expect(planner.state.selectedPlan).toBe('shopping');
    expect(planner.state.items.some((item) => item.id === 'late')).toBe(true);
  });
});
