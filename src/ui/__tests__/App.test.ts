import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import App from '../App.vue';
import { LocalPlannerRepository } from '../../adapters/local-planner.repository';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

function render() {
  let printCount = 0;
  const wrapper = mount(App, { props: {
    repository: new LocalPlannerRepository(new MemoryStorage()),
    printPort: { print: () => { printCount += 1; } },
  } });
  return { wrapper, getPrintCount: () => printCount };
}

describe('Luggage planner App', () => {
  it('renders sample luggage and catches invalid dimensions', async () => {
    const { wrapper } = render();
    expect(wrapper.text()).toContain('行李箱空间规划师');
    expect(wrapper.text()).toContain('轻薄外套');
    await wrapper.get('[aria-label="行李箱长度"]').setValue('0');
    expect(wrapper.text()).toContain('行李箱长度必须大于 0');
  });

  it('adds and deletes an item', async () => {
    const { wrapper } = render();
    await wrapper.get('[aria-label="物品名称"]').setValue('新物品');
    await wrapper.get('[data-testid="item-editor"]').trigger('submit');
    expect(wrapper.text()).toContain('新物品');
    await wrapper.get('[aria-label="删除 新物品"]').trigger('click');
    expect(wrapper.text()).not.toContain('新物品');
  });

  it('selects a plan and highlights the same item in both projections', async () => {
    const { wrapper } = render();
    await wrapper.get('[data-plan="shopping"]').trigger('click');
    expect(wrapper.get('[data-plan="shopping"]').classes()).toContain('active');
    const jacket = wrapper.findAll('[data-item-id="jacket"]');
    expect(jacket.length).toBe(2);
    await jacket[0].trigger('click');
    expect(wrapper.findAll('[data-item-id="jacket"].selected')).toHaveLength(2);
  });

  it('delegates printing through the print port', async () => {
    const { wrapper, getPrintCount } = render();
    await wrapper.get('[data-testid="print-button"]').trigger('click');
    expect(getPrintCount()).toBe(1);
  });

  it('renders the frozen packing sheet with numbered entries and matching projections', async () => {
    const { wrapper } = render();
    await wrapper.get('[data-testid="print-button"]').trigger('click');
    await wrapper.vm.$nextTick();

    const sheet = wrapper.get('[data-testid="print-prep"]');
    expect(sheet.text()).toContain('装箱单已按本次方案冻结');

    const printed = wrapper.getComponent({ name: 'PrintSheet' });
    const rows = printed.findAll('.print-packed tbody tr[data-item-id]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].get('.col-no').text()).toBe('1');
    expect(printed.text()).toContain('已装物品');
    expect(printed.text()).toContain('未装入物品及原因');
    expect(printed.text()).toContain('实际方向');

    // 打印单上的两幅投影使用与清单相同的编号。
    const projections = printed.findAllComponents({ name: 'PackingProjection' });
    expect(projections).toHaveLength(2);
    const topNumbers = projections[0].findAll('.projection-block').map((block) => block.attributes('data-number'));
    expect(topNumbers).toEqual(rows.map((_, index) => String(index + 1)));
  });

  it('refuses to print stale plans and offers recalculation or cancel', async () => {
    const { wrapper, getPrintCount } = render();
    await wrapper.get('[aria-label="物品名称"]').setValue('雨靴');
    await wrapper.get('[data-testid="item-editor"]').trigger('submit');

    await wrapper.get('[data-testid="print-button"]').trigger('click');
    const gate = wrapper.get('[data-testid="print-gate"]');
    expect(gate.text()).toContain('不能打印当前单据');
    expect(getPrintCount()).toBe(0);

    // 取消打印回到工作台，策略与物品保持不变。
    const selectedBefore = wrapper.get('.plan-tabs button.active').attributes('data-plan');
    await wrapper.get('[data-testid="print-cancel-gate"]').trigger('click');
    expect(wrapper.find('[data-testid="print-gate"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('雨靴');
    expect(wrapper.get('.plan-tabs button.active').attributes('data-plan')).toBe(selectedBefore);

    // 重新计算并打印才冻结新清单。
    await wrapper.get('[data-testid="print-button"]').trigger('click');
    await wrapper.get('[data-testid="print-regenerate"]').trigger('click');
    expect(getPrintCount()).toBe(1);
    const printed = wrapper.getComponent({ name: 'PrintSheet' });
    expect(printed.text()).toContain('雨靴');
  });
});
