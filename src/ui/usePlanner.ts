import { computed, nextTick, reactive, ref } from 'vue';
import { createSampleSnapshot } from '../core/sample-data';
import { generatePlans } from '../core/plan-service';
import { detectRisks } from '../core/risk-engine';
import type { PackingItem, PackingSnapshot, PlanMode, PrintJob, Suitcase } from '../core/models';
import type { PlannerRepository } from '../ports/planner-repository.port';
import type { PrintPort } from '../ports/print.port';

export interface PlannerDependencies { repository: PlannerRepository; printPort: PrintPort }

export function usePlanner({ repository, printPort }: PlannerDependencies) {
  const loaded = repository.load();
  const state = reactive<PackingSnapshot>(loaded.value);
  const notice = ref(loaded.warning ?? '');
  const isStale = ref(false);
  const plans = ref(generatePlans(state.suitcase, state.items));
  const currentPlan = computed(() => plans.value[state.selectedPlan]);
  const risks = computed(() => detectRisks(currentPlan.value, state.suitcase, state.items));

  /** 非空表示一次打印正在进行：装箱单只读取这份冻结快照，忽略后续状态变化。 */
  const printJob = ref<PrintJob | null>(null);
  /** 方案待更新时发起打印会被拦截，等待用户重新计算或取消。 */
  const printBlocked = ref(false);

  const printSheetData = computed<PrintJob>(() => printJob.value ?? {
    suitcase: state.suitcase,
    items: state.items,
    plan: currentPlan.value,
    risks: risks.value,
  });

  const save = () => repository.save(JSON.parse(JSON.stringify(state)) as PackingSnapshot);
  const markStale = () => { isStale.value = true; save(); };

  function addItem(item: PackingItem) { state.items.push(item); markStale(); }
  function updateItem(id: string, patch: Partial<PackingItem>) {
    const index = state.items.findIndex((item) => item.id === id);
    if (index >= 0) state.items[index] = { ...state.items[index], ...patch } as PackingItem;
    markStale();
  }
  function removeItem(id: string) { state.items = state.items.filter((item) => item.id !== id); markStale(); }
  function updateSuitcase(patch: Partial<Suitcase>) { Object.assign(state.suitcase, patch); markStale(); }
  function regenerate() {
    plans.value = generatePlans(state.suitcase, state.items);
    isStale.value = false;
    printBlocked.value = false;
    notice.value = '三套方案已重新计算';
    save();
  }
  function selectPlan(mode: PlanMode) { state.selectedPlan = mode; save(); }
  function resetSample() {
    const sample = createSampleSnapshot();
    Object.assign(state, sample);
    plans.value = generatePlans(state.suitcase, state.items);
    isStale.value = false;
    printBlocked.value = false;
    notice.value = '已恢复登机箱示例';
    save();
  }

  async function runPrint() {
    printBlocked.value = false;
    // 先冻结本次方案与物品信息，再打开打印对话框；冻结内容深拷贝，与后续操作隔离。
    printJob.value = JSON.parse(JSON.stringify({
      suitcase: state.suitcase,
      items: state.items,
      plan: currentPlan.value,
      risks: risks.value,
    })) as PrintJob;
    await nextTick();
    try {
      printPort.print();
    } finally {
      printJob.value = null;
    }
  }

  async function print() {
    if (isStale.value) {
      printBlocked.value = true;
      notice.value = '方案待更新：请先重新计算，或取消打印。';
      return;
    }
    await runPrint();
  }

  async function recalculateAndPrint() {
    regenerate();
    await runPrint();
  }

  function cancelPrint() {
    printBlocked.value = false;
    notice.value = '已取消打印，当前方案与物品未改动。';
  }

  return {
    state, notice, isStale, plans, currentPlan, risks,
    printJob, printBlocked, printSheetData,
    addItem, updateItem, removeItem, updateSuitcase, regenerate, selectPlan, resetSample,
    print, recalculateAndPrint, cancelPrint,
  };
}
