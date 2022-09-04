# Paylike low-level request helper

For a higher-level client see https://www.npmjs.com/package/@paylike/client.

This is a low-level library used for making HTTP(s) requests to Paylike APIs. It
incorporates the conventions described in the
[Paylike API reference](https://github.com/paylike/api-reference).

This function is usually put behind a retry mechanism. Paylike APIs _will_
expect any client to gracefully handle a rate limiting response and expects them
to retry.

A retry mechanism is not included in this package because it is highly specific
to the project and is difficult to implement for streaming requests without
further context.

## Example

```js
// swap esm.sh for any "npm CJS to ESM CDN"
import request from 'https://esm.sh/@paylike/request@3.1.0'

const token = request('vault.paylike.io', {
  version: 1,
  data: {type: 'pcn', value: '1000 0000 0000 0000'.replaceAll(' ', '')},
}).first()
```

## `request`

This package's default export is a function:

```js
request(
  endpoint, // String, required
  {
    log: () => {},
    fetch: globalThis.fetch, // required in older Node.js
    timeout: 10000, // 0 = disabled

    version: String, // required
    query: Object,
    data: Object,

    // mostly relevant during testing
    clock: {
      setTimeout,
      clearTimeout,
    },
  }
})
```

`request` returns a [pull-stream](https://pull-stream.github.io) source (a
function):

```js
pull(request(/* ... */), collect(console.log))
```

For most cases, the below shortcut functions can be used:

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

All error classes can be accessed as `request.<error class>`, for instance
`request.RateLimitError`.

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

### Custom `fetch` (e.g. Node.js v16 and older)

It is built to work in any JavaScript environment (Node.js, browser) by
accepting a [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
implementation as input. Minor tweaks are implemented to support the
[`node-fetch`](https://github.com/node-fetch/node-fetch) implementation even
though it is not entirely compatible.
