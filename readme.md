# Paylike low-level request helper

This is a low-level library used for making HTTP(s) requests to Paylike APIs. It
incorporates the conventions described in the
[Paylike API reference](https://github.com/paylike/api-reference).

It is built to work in any JavaScript environment (Node.js, browser) by
accepting a [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
implementation as input. Minor tweaks are implemented to support the
[`node-fetch`](https://github.com/node-fetch/node-fetch) implementation even
though it is not entirely compatible.

This function is usually put behind a retry mechanism. Paylike APIs _will_
expect any client to gracefully handle a rate limiting response and expects them
to retry.

A retry mechanism is not included in this package because it is highly specific
to the project and is difficult to implement for streaming requests without
further context.

## Example

```js
const fetch = require('node-fetch') // necessary only for Node.js support
const request = require('@paylike/request')({fetch})

const token = request('vault.paylike.io', {
  version: 1,
  data: {type: 'pcn', value: '1000 0000 0000 0000'.replaceAll(' ', '')},
}).first()
```

## Initializing

The package exports a single function for setting up the `request` function with
a range of default options (all optional):

```js
const create = require('@paylike/request')

create({
  log: () => {},
  fetch: window.fetch,
  timeout: 10000, // 0 = disabled

  // mostly relevant during testing
  protocol: 'https',
  clock: {
    setTimeout,
    clearTimeout,
  },
}) // → request()
```

## `request`

```js
request(
  endpoint, // String, required
  {
    version: String, // required
    query: Object,
    data: Object,

    // optional, inherits from defaults
    log: Function,
    fetch: Function,
    timeout: Number, // 0 = disabled

    // mostly relevant during testing
    clock: {setTimeout, clearTimeout},
    protocol: 'https',
  }
})
```

`request` returns a function that can be consumed as a
[pull-stream](https://pull-stream.github.io) source:

```js
pull(request(/* ... */), collect(console.log))
```

For most cases, the following shortcut functions can be used:

```js
request(/* ... */).first().then(console.log, console.error)
```

```js
request(/* ... */).toArray().then(console.log, console.error)
```

```js
request(/* ... */).forEach(console.log).catch(console.error)
```

## Error handling

`request` may throw any of the following error classes as well as any error
thrown by the `fetch` implementation by rejecting the promise returned by a
shortcut function or by the error mechanism of a pull-stream.

All error classes can be accessed as both `create.<error class>` and
`request.<error class>`, for instance `request.RateLimitError`.

### Example

```js
retry(
  () => request(/* ... */).first(),
  (err, attempts) => {
    if (attempts > 5 || !(err instanceof request.RateLimitError)) return false
    return err.retryAfter || 2 ** attempts * 5000
  }
).then(console.log, console.error)

function retry(fn, should, attempts = 0) {
  return fn().catch((err) => {
    const retryAfter = should(err, attempts)
    if (retryAfter === false) throw err

    return new Promise((resolve) =>
      setTimeout(() => resolve(retry(fn, attempts + 1)), retryAfter)
    )
  })
}
```

### Error classes

- `RateLimitError`

  May have a `retryAfter` (milliseconds) property if sent by the server
  specifying the minimum delay.

- `TimeoutError`

  Has a `timeout` (milliseconds) property specifying the time waited.

- `ServerError`

  Has `status` and `headers` properties copied from the fetch response.

- `ResponseError`

  These errors correspond to
  [status codes](https://github.com/paylike/api-reference/blob/master/status-codes.md)
  from the API reference. They have at least a `code` and `message` property,
  but may also have other useful properties relevant to the specific error code,
  such as a minimum and maximum for amounts.
