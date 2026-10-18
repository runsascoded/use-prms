<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  useUrlState,
  useUrlStates,
  boolParam,
  stringParam,
  intParam,
} from 'use-prms/vue'

// Same keys / codecs as the React parity page (site/src/components/ParityReact.tsx).
const n = useUrlState('n', intParam(0))
const s = useUrlState('s', stringParam(''))
const b = useUrlState('b', boolParam)
const q = useUrlState('q', stringParam(''), { debounce: 300 })
const { values: batch, setValues: setBatch } = useUrlStates({
  bx: intParam(0),
  by: intParam(0),
})

// Live, reactive readout of the raw query string.
const search = ref(window.location.search)
const sync = () => { search.value = window.location.search }
onMounted(() => {
  window.addEventListener('popstate', sync)
  window.addEventListener('use-prms:locationchange', sync)
})
onUnmounted(() => {
  window.removeEventListener('popstate', sync)
  window.removeEventListener('use-prms:locationchange', sync)
})
</script>

<template>
  <main class="parity">
    <header>
      <h1>use-prms <span class="badge">Vue</span></h1>
      <p>
        The same URL-param codecs as the React demo, through
        <code>use-prms/vue</code>. Identical inputs produce identical URLs.
        <a href="/parity">React version →</a>
      </p>
    </header>

    <div class="search-readout" data-testid="search">{{ search || '(empty)' }}</div>

    <section class="controls">
      <label>
        <span>int <code>n</code></span>
        <input data-testid="n" type="number" v-model.number="n" />
      </label>
      <label>
        <span>string <code>s</code></span>
        <input data-testid="s" type="text" v-model="s" />
      </label>
      <label class="check">
        <input data-testid="b" type="checkbox" v-model="b" />
        <span>bool <code>b</code></span>
      </label>
      <label>
        <span>search <code>q</code> (debounced 300ms)</span>
        <input data-testid="q" type="text" v-model="q" />
      </label>
    </section>

    <section class="batch">
      <span>batched <code>bx</code>/<code>by</code> = {{ batch.bx }}/{{ batch.by }}</span>
      <button data-testid="set-both" @click="setBatch({ bx: 1, by: 2 })">Set both (one entry)</button>
      <button data-testid="clear-both" @click="setBatch({ bx: 0, by: 0 })">Clear</button>
    </section>
  </main>
</template>

<style scoped>
.parity { max-width: 48rem; margin: 0 auto; padding: 2rem 1rem; }
.badge { font-size: 0.6em; vertical-align: middle; padding: 0.15em 0.5em; border-radius: 0.5em; background: #42b883; color: #fff; }
.search-readout { font-family: ui-monospace, monospace; padding: 0.6rem 0.8rem; border: 1px solid var(--border, #ccc); border-radius: 0.4rem; margin-bottom: 1.5rem; word-break: break-all; }
.controls { display: grid; gap: 1rem; }
.controls label { display: flex; flex-direction: column; gap: 0.3rem; }
.controls label.check { flex-direction: row; align-items: center; gap: 0.5rem; }
.batch { margin-top: 1.5rem; display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
button { padding: 0.4rem 0.8rem; cursor: pointer; }
</style>
