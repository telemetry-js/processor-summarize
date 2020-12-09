# processor-summarize

> **Locally summarize metrics within a time window, to account for spikes and valleys in that window without increasing traffic cost of published metrics.**  
> A [`telemetry`](https://github.com/telemetry-js/telemetry) plugin.

[![npm status](http://img.shields.io/npm/v/@telemetry-js/processor-summarize.svg)](https://www.npmjs.org/package/@telemetry-js/processor-summarize)
[![node](https://img.shields.io/node/v/@telemetry-js/processor-summarize.svg)](https://www.npmjs.org/package/@telemetry-js/processor-summarize)
[![Test](https://github.com/telemetry-js/processor-summarize/workflows/Test/badge.svg?branch=main)](https://github.com/telemetry-js/processor-summarize/actions)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Table of Contents

<details><summary>Click to expand</summary>

- [Usage](#usage)
- [API](#api)
  - [Options](#options)
- [Install](#install)
- [Acknowledgements](#acknowledgements)
- [License](#license)

</details>

## Usage

```js
const telemetry = require('@telemetry-js/telemetry')()
const summarize = require('@telemetry-js/processor-summarize')

telemetry.task()
  .process(summarize, { window: '5m' })
```

This will group metrics flowing through the task by metric name and distinct tag set, and emit a summary metric for each every 5 minutes, inheriting name, unit, statistic and tags.

To ensure that asynchronously collected or processed metrics fall within the window, `processor-summarize` operates on the task's schedule too, rather than having its own timer. The `window` option should be a multiple of the interval of a task's schedule, so that collected metrics fall within a predictable window. For example, if the interval is 60 seconds, the window can be 300 seconds, but not 90 seconds.

## API

### Options

- `window`: required, number (milliseconds) or string (e.g. `5m`, `60s`)
- `suffix`: optional, boolean. If true, appends `.summary` to metric names. For testing purposes only, e.g. to publish both a raw and summarized metric for comparison.

## Install

With [npm](https://npmjs.org) do:

```
npm install @telemetry-js/processor-summarize
```

## Acknowledgements

This project is kindly sponsored by [Reason Cybersecurity Ltd](https://reasonsecurity.com).

[![reason logo](https://cdn.reasonsecurity.com/github-assets/reason_signature_logo.png)](https://reasonsecurity.com)

## License

[MIT](LICENSE) © Vincent Weevers
