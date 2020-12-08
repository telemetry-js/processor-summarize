'use strict'

const ms = require('ms')
const summaryMetric = require('@telemetry-js/metric').summary
const EventEmitter = require('events').EventEmitter

module.exports = function plugin (options) {
  return new SummaryProcessor(options)
}

class SummaryProcessor extends EventEmitter {
  constructor (options) {
    if (!options) options = {}
    super()

    const win = msOption(options.window, 'window')
    if (win <= 0) throw new RangeError('The "window" option must be > 0')

    this._summaries = new Map()
    this._window = win
    this._resolution = win <= 1e3 ? 1 : 60
    this._suffix = options.suffix === true
    this._lastFlush = null

    // Exposed for unit tests
    this._now = options.now || Date.now
  }

  // TODO (!): how to deal with { statistic: 'sum' }?
  process (metric) {
    const summary = this._getSummary(metric)

    if (metric.isSingle()) {
      summary.record(metric.value)
    } else if (metric.isSummary()) {
      summary.accumulate(metric.stats)
    }
  }

  start (callback) {
    // If we start at 10:01 and the window is 5m, set last flush time to 10:00.
    // Then we'll emit a summary at 10:05, 10:10 and so on. Note that the first
    // window will have a smaller sample size. That's preferred over misaligned
    // metrics between multiple reporters (e.g. servers) and/or discarding data.
    const now = this._now()
    this._lastFlush = now - (now % this._window)

    process.nextTick(callback)
  }

  ping (callback) {
    const now = this._now()
    const elapsed = now - this._lastFlush

    if (elapsed >= this._window) {
      // We can be late due to skipped or slow pings. Round lastFlush to nearest
      // multiple of window so that we emit the next summary sooner.
      this._lastFlush = Math.round(now / this._window) * this._window

      // Warn about corrected time
      const diff = this._lastFlush - now

      if (Math.abs(diff) >= 30e3) {
        let seconds = (diff / 1e3).toFixed(1)
        if (seconds[0] !== '-') seconds = '+' + seconds

        process.emitWarning(`Summary flush time is off by ${seconds} seconds`, 'TelemetryWarning')
      }

      this._flush(this._lastFlush)
    }

    // No need to dezalgo ping()
    callback()
  }

  stop (callback) {
    this._flush(this._now())
    this._lastFlush = null

    process.nextTick(callback)
  }

  _flush (time) {
    const summaries = this._summaries
    const date = new Date(time)

    this._summaries = new Map()

    for (const summary of summaries.values()) {
      // We're summarizing from past until now, so update the summary timestamp.
      // If we don't do this, the summary would have the timestamp of its latest
      // measurement and also, that may differ per summary (in `summaries`).
      summary.touch(date)

      this.emit('metric', summary)
      // summary.reset()
    }
  }

  _getSummary (metric) {
    const name = metric.name

    // TODO (!): cache JSON by metric name
    const key = name + ':' + JSON.stringify(metric.tags)

    let summary = this._summaries.get(key)

    if (summary !== undefined) {
      if (summary.unit !== metric.unit) {
        throw new Error('Unit mismatch with previous metric')
      }

      if (summary.statistic !== metric.statistic) {
        throw new Error('Statistic mismatch with previous metric')
      }
    } else {
      const fqn = this._suffix ? name + '.summary' : name

      // TODO (!): set period
      summary = summaryMetric(fqn, {
        unit: metric.unit,
        resolution: this._resolution,
        statistic: metric.statistic,
        tags: metric.tags
      })

      this._summaries.set(key, summary)
    }

    return summary
  }
}

// TODO (later): move to a package (outside of telemetry repo)
function msOption (value, name) {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value
    }
  } else if (typeof value === 'string') {
    return ms(value)
  }

  throw new TypeError(
    `The "${name}" option must be a finite number (e.g. 1000) or string ("1s")`
  )
}
