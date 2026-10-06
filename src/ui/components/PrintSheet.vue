<script setup lang="ts">
import { computed } from 'vue';
import type { PackingItem, Placement, PrintJob } from '../../core/models';
import PackingProjection from './PackingProjection.vue';

const props = defineProps<{ job: PrintJob }>();

interface PackedRow {
  number: number;
  placement: Placement;
  item?: PackingItem;
  rotated: boolean;
}

const itemById = computed(() => new Map(props.job.items.map((item) => [item.id, item])));

// 已装物品按摆放顺序编号；重名物品各占一行、各自编号，与投影中的编号一一对应。
const packedRows = computed<PackedRow[]>(() => props.job.plan.placements.map((placement, index) => {
  const item = itemById.value.get(placement.itemId);
  const rotated = !!item && (item.length !== placement.dimensions.length
    || item.width !== placement.dimensions.width
    || item.height !== placement.dimensions.height);
  return { number: index + 1, placement, item, rotated };
}));

const mustHaveMissing = computed(() => props.job.plan.unplaced.filter((entry) => entry.item.mustHave));
</script>

<template>
  <section class="print-sheet" data-testid="print-sheet">
    <h1>行李箱装箱单</h1>
    <p class="print-meta">
      {{ job.suitcase.length }} × {{ job.suitcase.width }} × {{ job.suitcase.height }} cm · 限重 {{ job.suitcase.maxWeight }} kg
      · 方案：{{ job.plan.name }} · 已装 {{ job.plan.placements.length }} 件 / {{ job.plan.totalWeight.toFixed(1) }} kg
      · 空间利用 {{ Math.round(job.plan.capacityRatio * 100) }}%
    </p>

    <section class="print-section">
      <h2>已装物品（按摆放顺序编号）</h2>
      <table>
        <thead>
          <tr><th>编号</th><th>物品</th><th>实际方向（长×宽×高 cm）</th><th>位置 (x, y, z)</th><th>重量 (kg)</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in packedRows" :key="row.placement.itemId" data-testid="packed-row">
            <td class="num">{{ row.number }}</td>
            <td>{{ row.item?.name ?? row.placement.itemId }}</td>
            <td>
              {{ row.placement.dimensions.length }} × {{ row.placement.dimensions.width }} × {{ row.placement.dimensions.height }}
              <em v-if="row.rotated">（已旋转）</em>
            </td>
            <td>({{ row.placement.x }}, {{ row.placement.y }}, {{ row.placement.z }})</td>
            <td>{{ row.item?.weight ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!packedRows.length" class="print-empty">当前方案未装入任何物品。</p>
    </section>

    <section class="print-section">
      <h2>摆放投影（编号与清单一致）</h2>
      <div class="print-projections">
        <PackingProjection view="top" :plan="job.plan" :suitcase="job.suitcase" :items="job.items" />
        <PackingProjection view="side" :plan="job.plan" :suitcase="job.suitcase" :items="job.items" />
      </div>
      <p class="print-note">坐标原点为箱体左下后角；投影中的编号与「已装物品」清单一一对应。</p>
    </section>

    <section v-if="job.plan.unplaced.length" class="print-section">
      <h2>未装物品（{{ job.plan.unplaced.length }} 件）</h2>
      <p v-if="mustHaveMissing.length" class="must-have-alert" data-testid="must-have-alert">
        ⚠ 必带遗漏：{{ mustHaveMissing.map((entry) => entry.item.name).join('、') }} —— 请调整清单或改用更大行李箱。
      </p>
      <table>
        <thead>
          <tr><th>物品</th><th>重量 (kg)</th><th>未装原因</th></tr>
        </thead>
        <tbody>
          <tr v-for="entry in job.plan.unplaced" :key="entry.item.id" data-testid="unplaced-row" :class="{ 'must-have': entry.item.mustHave }">
            <td>{{ entry.item.name }}<b v-if="entry.item.mustHave" class="must-tag">必带</b></td>
            <td>{{ entry.item.weight }}</td>
            <td>{{ entry.reason }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="print-section">
      <h2>风险提示</h2>
      <p v-for="risk in job.risks" :key="risk.id" class="print-risk">{{ risk.title }}：{{ risk.message }}</p>
    </section>
  </section>
</template>
