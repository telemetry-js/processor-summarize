'use strict'

const test = require('tape')
const single = require('@telemetry-js/metric').single
const plugin = require('.')
const time = (t) => new Date(`2019-01-01T${t}Z`).getTime()

function clock () {
  return clock.time
}

test('flushes on ping() after window has elapsed', async function (t) {
  t.plan(2)

  const processor = plugin({ window: '200ms' })

  await start(processor)

  processor.process(single('test.count', { unit: 'count', value: 1 }))
  processor.process(single('test.count', { unit: 'count', value: 2 }))

  t.same(await collect(processor), [], 'no metrics before window has elapsed')

  await sleep(200)
  t.same(await collect(processor), [{
    name: 'test.count',
    unit: 'count',
    resolution: 1,
    tags: {},
    stats: { sum: 3, min: 1, max: 2, count: 2 }
  }], 'got metric')
})

test('summarizes distinct metrics (by name and tags)', async function (t) {
  t.plan(1)

  const processor = plugin({ window: '1ms' })

  await start(processor)

  processor.process(single('test.count', { unit: 'count', value: 1 }))
  processor.process(single('beep.count', { unit: 'count', value: 2 }))
  processor.process(single('beep.count', { unit: 'count', value: 3, tags: { foo: 'bar' } }))

  await sleep(5)
  t.same(await collect(processor), [{
    name: 'test.count',
    unit: 'count',
    resolution: 1,
    tags: {},
    stats: { sum: 1, min: 1, max: 1, count: 1 }
  }, {
    name: 'beep.count',
    unit: 'count',
    resolution: 1,
    tags: {},
    stats: { sum: 2, min: 2, max: 2, count: 1 }
  }, {
    name: 'beep.count',
    unit: 'count',
    resolution: 1,
    tags: { foo: 'bar' },
    stats: { sum: 3, min: 3, max: 3, count: 1 }
  }], 'got 3 summary metrics')
})

test('flushes on stop()', async function (t) {
  t.plan(1)

  const processor = plugin({ window: '100ms' })

  await start(processor)

  processor.process(single('test.count', { unit: 'count', value: 1 }))
  processor.process(single('test.count', { unit: 'count', value: 2 }))

  t.same(await collect(processor, 'stop'), [{
    name: 'test.count',
    unit: 'count',
    resolution: 1,
    tags: {},
    stats: { sum: 3, min: 1, max: 2, count: 2 }
  }], 'got metric')
})

test('corrects start time to multiple of window', async function (t) {
  t.plan(3)

  const processor = plugin({ window: '5m', now: clock })

  clock.time = time('14:08:40.001')
  await start(processor)
  t.is(processor._lastFlush, time('14:05:00.000'), 'start time corrected')

  clock.time = time('14:08:41.000')
  t.same(await collectFlushes(processor), [], 'no flush before window has elapsed')

  clock.time = time('14:10:00.000')
  t.same(await collectFlushes(processor), [time('14:10:00.000')], 'not corrected')
})

test('corrects flush time to multiple of window', async function (t) {
  t.plan(4)

  const processor = plugin({ window: '5m', now: clock })

  clock.time = time('14:10:00.000')
  await start(processor)
  t.is(processor._lastFlush, time('14:10:00.000'), 'start time not corrected')

  // Simulate delayed ping
  clock.time = time('14:15:30.000')
  t.same(await collectFlushes(processor), [time('14:15:00.000')], 'corrected')

  clock.time = time('14:20:30.000')
  t.same(await collectFlushes(processor), [time('14:20:00.000')], 'corrected')

  clock.time = time('14:25:00.000')
  t.same(await collectFlushes(processor), [time('14:25:00.000')], 'not corrected')
})

test('does not correct flush time by more than window', async function (t) {
  t.plan(5)

  const processor = plugin({ window: '5m', now: clock })

  clock.time = time('14:10:00.000')
  await start(processor)
  t.is(processor._lastFlush, time('14:10:00.000'), 'start time not corrected')

  // Simulate skipped window
  clock.time = time('14:20:00.000')
  t.same(await collectFlushes(processor), [time('14:20:00.000')], 'not corrected')

  // Simulate skipped window plus delayed ping
  clock.time = time('14:30:30.000')
  t.same(await collectFlushes(processor), [time('14:30:00.000')], 'corrected')

  // Simulate skipped window with early ping
  clock.time = time('14:39:30.000')
  t.same(await collectFlushes(processor), [time('14:40:00.000')], 'corrected')

  clock.time = time('14:40:00.000')
  t.same(await collectFlushes(processor), [], 'skipped')
})

async function collectFlushes (processor) {
  const flushes = []
  const original = processor._flush
  processor._flush = flushes.push.bind(flushes)
  await collect(processor)
  processor._flush = original
  return flushes
}

function start (processor) {
  return new Promise((resolve, reject) => {
    processor.start((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function sleep (ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), ms)
  })
}

function collect (processor, method) {
  return new Promise((resolve, reject) => {
    const metrics = []
    const push = metrics.push.bind(metrics)

    processor.on('metric', push)

    processor[method || 'ping']((err) => {
      processor.removeListener('metric', push)
      if (err) reject(err)
      else resolve(metrics.map(simplify))
    })
  })
}

function simplify (metric) {
  delete metric.date
  delete metric.statistic

  return metric
}
