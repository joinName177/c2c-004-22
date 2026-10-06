import { computed, nextTick, reactive, ref } from 'vue';
import { createSampleSnapshot } from '../core/sample-data';
import { generatePlans } from '../core/plan-service';
import { detectRisks } from '../core/risk-engine';
import { buildPackingSheet, type PackingSheet } from '../core/packing-sheet';
import type { PackingItem, PackingSnapshot, PlanMode, Suitcase } from '../core/models';
import type { PlannerRepository } from '../ports/planner-repository.port';
import type { PrintPort } from '../ports/print.port';

export interface PlannerDependencies { repository: PlannerRepository; printPort: PrintPort }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function usePlanner({ repository, printPort }: PlannerDependencies) {
  const loaded = repository.load();
  const state = reactive<PackingSnapshot>(loaded.value);
  const notice = ref(loaded.warning ?? '');
  const isStale = ref(false);
  const plans = ref(generatePlans(state.suitcase, state.items));
  const currentPlan = computed(() => plans.value[state.selectedPlan]);
  const risks = computed(() => detectRisks(currentPlan.value, state.suitcase, state.items));

  // 打印准备状态：
  // - printGate：方案待更新，用户请求了打印，等待「重新计算后打印」或取消
  // - printSheet：已冻结本次方案与物品，系统打印对话框期间展示的装箱单
  const printGate = ref(false);
  const printSheet = ref<PackingSheet | null>(null);
  const inPrintSession = computed(() => printSheet.value !== null);

  const save = () => repository.save(clone(state));
  const markStale = () => { isStale.value = true; save(); };

  function addItem(item: PackingItem) { state.items.push(item); markStale(); }
  function updateItem(id: string, patch: Partial<PackingItem>) {
    const index = state.items.findIndex((item) => item.id === id);
    if (index >= 0) state.items[index] = { ...state.items[index], ...patch } as PackingItem;
    markStale();
  }
  function removeItem(id: string) { state.items = state.items.filter((item) => item.id !== id); markStale(); }
  function updateSuitcase(patch: Partial<Suitcase>) { Object.assign(state.suitcase, patch); markStale(); }
  function regenerate() { plans.value = generatePlans(state.suitcase, state.items); isStale.value = false; printGate.value = false; notice.value = '三套方案已重新计算'; save(); }
  function selectPlan(mode: PlanMode) { state.selectedPlan = mode; save(); }
  function resetSample() {
    const sample = createSampleSnapshot();
    Object.assign(state, sample);
    plans.value = generatePlans(state.suitcase, state.items);
    isStale.value = false;
    printGate.value = false;
    printSheet.value = null;
    notice.value = '已恢复登机箱示例';
    save();
  }

  /** 在当前方案上构建不可变装箱单快照，等待 DOM 更新后再调起打印。 */
  function startPrintSession(sheetPlan = currentPlan.value) {
    printSheet.value = buildPackingSheet(
      clone(sheetPlan),
      clone(state.suitcase),
      clone(state.items),
      detectRisks(sheetPlan, state.suitcase, state.items).map(clone),
    );
    printGate.value = false;
    void nextTick(() => {
      printPort.print(() => { printSheet.value = null; });
    });
  }

  /** 用户发起打印：方案待更新时先进入拦截门，不允许拿旧位置配新清单。 */
  function requestPrint() {
    if (inPrintSession.value) return;
    if (isStale.value) {
      printGate.value = true;
      notice.value = '方案待更新：请先重新计算或取消打印，旧摆放位置不能与新清单混用。';
      return;
    }
    startPrintSession();
  }

  /** 重新计算三套方案后冻结新结果并打印；不改变当前选中的策略。 */
  function regenerateAndPrint() {
    plans.value = generatePlans(state.suitcase, state.items);
    const freshPlan = plans.value[state.selectedPlan];
    isStale.value = false;
    notice.value = '';
    save();
    startPrintSession(freshPlan);
  }

  /** 取消打印：仅关闭拦截门或冻结单，不改变当前策略与物品。 */
  function cancelPrint() {
    printGate.value = false;
    printSheet.value = null;
  }

  return {
    state, notice, isStale, plans, currentPlan, risks,
    printGate, printSheet, inPrintSession,
    addItem, updateItem, removeItem, updateSuitcase, regenerate, selectPlan, resetSample,
    requestPrint, regenerateAndPrint, cancelPrint,
  };
}
