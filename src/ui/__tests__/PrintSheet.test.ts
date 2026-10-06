import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PrintSheet from '../components/PrintSheet.vue';
import type { PackingItem, PrintJob } from '../../core/models';

const items: PackingItem[] = [
  { id: 'a', name: 'T恤', category: '衣物', length: 20, width: 10, height: 5, weight: 0.3, priority: 2, mustHave: false },
  { id: 'b', name: 'T恤', category: '衣物', length: 20, width: 10, height: 5, weight: 0.4, priority: 2, mustHave: false },
  { id: 'c', name: '常备药', category: '健康', length: 10, width: 8, height: 4, weight: 0.2, priority: 3, mustHave: true },
];

const job: PrintJob = {
  suitcase: { length: 50, width: 30, height: 20, maxWeight: 10 },
  items,
  plan: {
    id: 'comfort',
    name: '舒适版',
    placements: [
      { itemId: 'a', x: 0, y: 0, z: 0, dimensions: { length: 20, width: 10, height: 5 } },
      { itemId: 'b', x: 20, y: 0, z: 0, dimensions: { length: 5, width: 10, height: 20 } },
    ],
    unplaced: [{ item: items[2], reason: '超过当前方案承重预留' }],
    totalWeight: 0.7,
    usedVolume: 2000,
    capacityRatio: 0.067,
  },
  risks: [{ id: 'missing-c', severity: 'critical', title: '必需品未装入：常备药', message: '请调整清单或改用更大行李箱。', itemId: 'c' }],
};

function render() {
  return mount(PrintSheet, { props: { job } });
}

describe('PrintSheet packing list', () => {
  it('numbers packed rows by placement order and numbers same-name items separately', () => {
    const wrapper = render();
    const rows = wrapper.findAll('[data-testid="packed-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('1');
    expect(rows[0].text()).toContain('T恤');
    expect(rows[0].text()).toContain('0.3');
    expect(rows[1].text()).toContain('2');
    expect(rows[1].text()).toContain('T恤');
    expect(rows[1].text()).toContain('0.4');
    expect(rows[0].text()).not.toBe(rows[1].text());
  });

  it('lists actual orientation, position and weight for each placement', () => {
    const wrapper = render();
    const rows = wrapper.findAll('[data-testid="packed-row"]');
    expect(rows[0].text()).toContain('20 × 10 × 5');
    expect(rows[0].text()).toContain('(0, 0, 0)');
    expect(rows[0].text()).not.toContain('已旋转');
    expect(rows[1].text()).toContain('5 × 10 × 20');
    expect(rows[1].text()).toContain('已旋转');
    expect(rows[1].text()).toContain('(20, 0, 0)');
  });

  it('repeats table headers across pages via thead', () => {
    const wrapper = render();
    const head = wrapper.findAll('thead');
    expect(head.length).toBeGreaterThan(0);
    expect(head[0].text()).toContain('编号');
  });

  it('renders both projections with the same numbering as the packed list', () => {
    const wrapper = render();
    const labels = wrapper.findAll('.print-projections .projection button span').map((node) => node.text());
    expect(labels).toEqual(['1', '2', '1', '2']);
    const topButtons = wrapper.findAll('.print-projections .projection.top button');
    expect(topButtons.map((button) => button.attributes('data-item-id'))).toEqual(['a', 'b']);
  });

  it('lists unplaced items with reasons and flags must-have omissions separately', () => {
    const wrapper = render();
    const rows = wrapper.findAll('[data-testid="unplaced-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('常备药');
    expect(rows[0].text()).toContain('必带');
    expect(rows[0].text()).toContain('超过当前方案承重预留');
    expect(rows[0].classes()).toContain('must-have');
    expect(wrapper.get('[data-testid="must-have-alert"]').text()).toContain('必带遗漏');
    expect(wrapper.get('[data-testid="must-have-alert"]').text()).toContain('常备药');
  });

  it('keeps risks and plan identity on the sheet', () => {
    const wrapper = render();
    expect(wrapper.text()).toContain('方案：舒适版');
    expect(wrapper.text()).toContain('必需品未装入：常备药');
  });
});
