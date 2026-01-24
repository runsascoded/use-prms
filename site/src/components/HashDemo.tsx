import {
  useUrlState,
  useUrlStates,
  useMultiUrlState,
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
  const [enabled, setEnabled] = useUrlState('e', boolParam)
  const [name, setName] = useUrlState('n', stringParam())
  const [count, setCount] = useUrlState('c', intParam(0))
  const [ratio, setRatio] = useUrlState('r', floatParam(1.0))
  const [theme, setTheme] = useUrlState('t', enumParam<Theme>('light', themes))
  const [tags, setTags] = useUrlState('tags', stringsParam([], ' '))
  const [page, setPage] = useUrlState('p', paginationParam(20, [10, 20, 50, 100]))
  const [metric, setMetric] = useUrlState('y', codeParam<Metric>('Rides', metrics))
  const [selectedRegions, setSelectedRegions] = useUrlState('rg', codesParam<Region>([...regions], regionCodes))
  const [multiTags, setMultiTags] = useMultiUrlState('tag', multiStringParam())
  const [multiIds, setMultiIds] = useMultiUrlState('id', multiIntParam())
  const { values: batch, setValues: setBatch } = useUrlStates({
    bx: intParam(0),
    by: intParam(0),
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
      useUrlState={useUrlState}
    />
  )
}
