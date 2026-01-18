import {
  useUrlParam,
  useUrlParams,
  useMultiUrlParam,
  boolParam,
  stringParam,
  intParam,
  floatParam,
  enumParam,
  stringsParam,
  paginationParam,
  codeParam,
  codesParam,
  multiStringParam,
  multiIntParam,
} from 'use-prms/hash'
import {
  ParamsDemo,
  Theme, themes,
  Metric, metrics,
  Region, regions, regionCodes,
} from './ParamsDemo'

export function HashDemo() {
  const [enabled, setEnabled] = useUrlParam('e', boolParam)
  const [name, setName] = useUrlParam('n', stringParam())
  const [count, setCount] = useUrlParam('c', intParam(0))
  const [ratio, setRatio] = useUrlParam('r', floatParam(1.0))
  const [theme, setTheme] = useUrlParam('t', enumParam<Theme>('light', themes))
  const [tags, setTags] = useUrlParam('tags', stringsParam([], ' '))
  const [page, setPage] = useUrlParam('p', paginationParam(20, [10, 20, 50, 100]))
  const [metric, setMetric] = useUrlParam('y', codeParam<Metric>('Rides', metrics))
  const [selectedRegions, setSelectedRegions] = useUrlParam('rg', codesParam<Region>([...regions], regionCodes))
  const [multiTags, setMultiTags] = useMultiUrlParam('tag', multiStringParam())
  const [multiIds, setMultiIds] = useMultiUrlParam('id', multiIntParam())
  const { values: batch, setValues: setBatch } = useUrlParams({
    x: intParam(0),
    y: intParam(0),
  })

  return (
    <ParamsDemo
      mode="hash"
      enabled={enabled} setEnabled={setEnabled}
      name={name} setName={setName}
      count={count} setCount={setCount}
      ratio={ratio} setRatio={setRatio}
      theme={theme} setTheme={setTheme}
      tags={tags} setTags={setTags}
      page={page} setPage={setPage}
      metric={metric} setMetric={setMetric}
      selectedRegions={selectedRegions} setSelectedRegions={setSelectedRegions}
      multiTags={multiTags} setMultiTags={setMultiTags}
      multiIds={multiIds} setMultiIds={setMultiIds}
      batch={batch} setBatch={setBatch}
    />
  )
}
