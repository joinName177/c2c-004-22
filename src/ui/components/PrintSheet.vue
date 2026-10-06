<script setup lang="ts">
import PackingProjection from './PackingProjection.vue';
import { formatPrintedAt } from '../../core/packing-sheet';
import type { PackingSheet } from '../../core/packing-sheet';

defineProps<{ sheet: PackingSheet }>();
</script>

<template>
  <section class="print-sheet">
    <header class="print-head">
      <div>
        <h1>装箱单 · {{ sheet.plan.name }}</h1>
        <p class="print-meta">
          箱体 {{ sheet.suitcase.length }} × {{ sheet.suitcase.width }} × {{ sheet.suitcase.height }} cm
          · 限重 {{ sheet.suitcase.maxWeight }} kg
          · 已装 {{ sheet.packed.length }} 件 / {{ sheet.plan.totalWeight.toFixed(1) }} kg
          · 未装 {{ sheet.omitted.length }} 件
        </p>
      </div>
      <p class="print-time">编号与投影色块一致<br>打印于 {{ formatPrintedAt(sheet.generatedAt) }}</p>
    </header>

    <div class="print-callout" v-if="sheet.missingMustHave.length">
      <strong>必带遗漏（{{ sheet.missingMustHave.length }} 件）：</strong>
      <span v-for="(entry, index) in sheet.missingMustHave" :key="entry.item.id" class="print-callout-item">
        {{ index > 0 ? '、' : '' }}{{ entry.item.name }}
      </span>
      <p>以上物品标记为必须携带但未装入本方案，请装箱前优先处理。</p>
    </div>

    <table class="print-table print-packed">
      <thead>
        <tr class="print-section-row"><th colspan="6">一、已装物品（按摆放顺序编号）</th></tr>
        <tr>
          <th class="col-no">编号</th>
          <th class="col-name">物品名称</th>
          <th class="col-weight">重量(kg)</th>
          <th class="col-orient">实际方向</th>
          <th class="col-location">位置（原点：左下后角）</th>
          <th class="col-flag">标记</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in sheet.packed" :key="entry.item.id" :data-item-id="entry.item.id">
          <td class="col-no">{{ entry.number }}</td>
          <td class="col-name">{{ entry.item.name }}<span v-if="entry.item.category" class="print-cat">（{{ entry.item.category }}）</span></td>
          <td class="col-weight">{{ entry.item.weight }}</td>
          <td class="col-orient">{{ entry.orientation }}</td>
          <td class="col-location">{{ entry.location }}</td>
          <td class="col-flag">
            <b v-if="entry.item.mustHave" class="print-badge must">必带</b>
            <b v-if="entry.item.fragile" class="print-badge fragile">易碎</b>
          </td>
        </tr>
        <tr v-if="!sheet.packed.length"><td colspan="6" class="print-empty">本方案没有装入任何物品。</td></tr>
      </tbody>
    </table>

    <div class="print-maps">
      <h2 class="print-section-title">二、摆放投影（编号同上表）</h2>
      <div class="print-projections">
        <PackingProjection view="top" static-view :plan="sheet.plan" :suitcase="sheet.suitcase" :items="sheet.items" />
        <PackingProjection view="side" static-view :plan="sheet.plan" :suitcase="sheet.suitcase" :items="sheet.items" />
      </div>
    </div>

    <table class="print-table print-omitted">
      <thead>
        <tr class="print-section-row"><th colspan="4">三、未装入物品及原因</th></tr>
        <tr>
          <th class="col-no">序号</th>
          <th class="col-name">物品名称</th>
          <th class="col-weight">重量(kg)</th>
          <th class="col-reason">未装原因</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in sheet.omitted" :key="entry.item.id" :class="{ 'print-miss-row': entry.mustHave }">
          <td class="col-no">{{ entry.number }}</td>
          <td class="col-name">
            {{ entry.item.name }}<span v-if="entry.item.category" class="print-cat">（{{ entry.item.category }}）</span>
            <b v-if="entry.mustHave" class="print-badge must">必带遗漏</b>
          </td>
          <td class="col-weight">{{ entry.item.weight }}</td>
          <td class="col-reason">{{ entry.reason }}</td>
        </tr>
        <tr v-if="!sheet.omitted.length"><td colspan="4" class="print-empty">全部物品均已装入。</td></tr>
      </tbody>
    </table>

    <section class="print-risks">
      <h2 class="print-section-title">四、风险提示</h2>
      <p v-for="risk in sheet.risks" :key="risk.id" :class="['print-risk', risk.severity]">
        <b>{{ risk.title }}</b>：{{ risk.message }}
      </p>
    </section>
  </section>
</template>
