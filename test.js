'use strict'

const {pull, collect} = require('pull-stream')
const test = require('tape')
const create = require('./')

test('constructor', (t) => {
	t.equal(typeof create, 'function')
	t.equal(typeof create.RateLimitError, 'function')
	t.equal(typeof create.TimeoutError, 'function')
	t.equal(typeof create.ServerError, 'function')
	t.equal(typeof create.ResponseError, 'function')

	const request = create({fetch: () => undefined})

	t.equal(typeof request, 'function')
	t.equal(typeof request.RateLimitError, 'function')
	t.equal(typeof request.TimeoutError, 'function')
	t.equal(typeof request.ServerError, 'function')
	t.equal(typeof request.ResponseError, 'function')

	t.end()
})

test('input validation', (t) => {
	const request = create({fetch: () => undefined})

	t.throws(() => request(null, {version: 1}), {
		message:
			'Unexpected first argument (endpoint), got "object" expected "string"',
	})
	t.throws(() => request('https://foo', {version: 1}), {
		message:
			'Do not add a protocol to the endpoint ("https://" is added automatically), got "https://foo"',
	})
	t.throws(() => request('http://foo', {version: 1}), {
		message:
			'Do not add a protocol to the endpoint ("https://" is added automatically), got "http://foo"',
	})
	t.throws(() => request('ftp://foo', {version: 1}), {
		message:
			'Do not add a protocol to the endpoint ("https://" is added automatically), got "ftp://foo"',
	})
	t.throws(() => request('foo', {version: 1, log: null}), {
		message: 'Unexpected type of "log", got "object" expected "function"',
	})
	t.throws(() => request('foo', {version: 1, fetch: null}), {
		message: 'Unexpected type of "fetch", got "object" expected "function"',
	})
	t.throws(() => request('foo'), {
		message:
			'Unexpected "version", got "undefined" expected a positive integer',
	})
	t.throws(() => request('foo', {version: null}), {
		message: 'Unexpected "version", got "null" expected a positive integer',
	})
	t.throws(() => request('foo', {version: 0}), {
		message: 'Unexpected "version", got "0" expected a positive integer',
	})
	t.throws(() => request('foo', {version: 1, query: null}), {
		message: 'Unexpected value of "query", got "null" expected "object"',
	})
	t.throws(() => request('foo', {version: 1, query: '?test'}), {
		message: 'Unexpected type of "query", got "string" expected "object"',
	})
	t.throws(() => request('foo', {version: 1, data: null}), {
		message: 'Unexpected value of "data", got "null" expected "object"',
	})
	t.throws(() => request('foo', {version: 1, data: '?test'}), {
		message: 'Unexpected type of "data", got "string" expected "object"',
	})
	t.end()
})

test('overwrite "log"', (t) => {
	t.plan(2)
	const request = create({fetch: createFetch()})
	const logs = []
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		}),
		collect((err, chunks) => {
			t.deepEqual(chunks, [{foo: 'bar'}])
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 10000,
				},
				{t: 'response', status: 200, statusText: 'OK'},
				'end of response',
				'closing stream',
			])
		})
	)
})

test('overwrite "fetch"', (t) => {
	t.plan(2)
	const request = create({fetch: createFetch()})
	const logs = []
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			fetch: createFetch({status: 201, chunks: [{bar: 'baz'}]}),
			version: 1,
		}),
		collect((err, chunks) => {
			t.deepEqual(chunks, [{bar: 'baz'}])
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 10000,
				},
				{t: 'response', status: 201, statusText: 'OK'},
				'end of response',
				'closing stream',
			])
		})
	)
})

test('streaming', (t) => {
	t.plan(2)
	const request = create({
		fetch: createFetch({
			chunks: [{bar: 'baz'}, {baz: 'bar'}],
		}),
	})
	const logs = []
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		}),
		collect((err, chunks) => {
			t.deepEqual(chunks, [{bar: 'baz'}, {baz: 'bar'}])
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 10000,
				},
				{t: 'response', status: 200, statusText: 'OK'},
				'end of response',
				'closing stream',
			])
		})
	)
})

test('.first', (t) => {
	t.plan(2)
	const request = create({
		fetch: createFetch({
			chunks: [{bar: 'baz'}, {baz: 'bar'}],
		}),
	})
	const logs = []
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		})
			.first()
			.then((chunk) => {
				t.deepEqual(chunk, {bar: 'baz'})
				t.deepEqual(logs, [
					{
						t: 'request',
						method: 'GET',
						url: 'https://foo',
						timeout: 10000,
					},
					{t: 'response', status: 200, statusText: 'OK'},
					'closing stream',
				])
			})
	)
})

test('.toArray', (t) => {
	t.plan(2)
	const request = create({
		fetch: createFetch({
			chunks: [{bar: 'baz'}, {baz: 'bar'}],
		}),
	})
	const logs = []
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		})
			.toArray()
			.then((chunks) => {
				t.deepEqual(chunks, [{bar: 'baz'}, {baz: 'bar'}])
				t.deepEqual(logs, [
					{
						t: 'request',
						method: 'GET',
						url: 'https://foo',
						timeout: 10000,
					},
					{t: 'response', status: 200, statusText: 'OK'},
					'end of response',
					'closing stream',
				])
			})
	)
})

test('.forEach', (t) => {
	t.plan(2)
	const request = create({
		fetch: createFetch({
			chunks: [{bar: 'baz'}, {baz: 'bar'}],
		}),
	})
	const logs = []
	const chunks = []
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		})
			.forEach((chunk) => chunks.push(chunk))
			.then(() => {
				t.deepEqual(chunks, [{bar: 'baz'}, {baz: 'bar'}])
				t.deepEqual(logs, [
					{
						t: 'request',
						method: 'GET',
						url: 'https://foo',
						timeout: 10000,
					},
					{t: 'response', status: 200, statusText: 'OK'},
					'end of response',
					'closing stream',
				])
			})
	)
})

test('ResponseError', (t) => {
	t.plan(5)
	const request = create({
		fetch: createFetch({
			status: 400,
			chunks: [{code: 'SOME_CODE', message: 'Text message'}],
		}),
	})
	const logs = []
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		}),
		collect((err) => {
			t.ok(err instanceof request.ResponseError)
			t.equal(
				String(err),
				'Text message (SOME_CODE)',
				'string representation'
			)
			t.equal(err.code, 'SOME_CODE', 'code')
			t.equal(err.message, 'Text message', 'message')
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 10000,
				},
				{t: 'response', status: 400, statusText: 'OK'},
				{t: 'aborted', abort: err},
			])
		})
	)
})

test('ServerError', (t) => {
	t.plan(5)
	const request = create({
		fetch: createFetch({
			status: 500,
			statusText: 'Server message',
			headers: new Map([['x-test', 'lorem']]),
		}),
	})
	const logs = []
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		}),
		collect((err) => {
			t.ok(err instanceof request.ServerError)
			t.equal(err.message, '500 Server message')
			t.equal(err.status, 500)
			t.deepEqual([...err.headers], [['x-test', 'lorem']])
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 10000,
				},
				{t: 'response', status: 500, statusText: 'Server message'},
				{t: 'aborted', abort: err},
			])
		})
	)
})

test('RateLimitError', (t) => {
	t.plan(4)
	const request = create({
		fetch: createFetch({
			status: 429,
			statusText: 'Server message',
			headers: new Map([['retry-after', '300']]),
		}),
	})
	const logs = []
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		}),
		collect((err) => {
			t.ok(err instanceof request.RateLimitError)
			t.equal(err.message, 'Request got rate limited for 300 seconds.')
			t.equal(err.retryAfter, 300000)
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 10000,
				},
				{t: 'response', status: 429, statusText: 'Server message'},
				{t: 'aborted', abort: err},
			])
		})
	)
})

test('using a query', (t) => {
	t.plan(1)
	const logs = []
	const request = create({
		fetch: createFetch({log: (l) => logs.push(l)}),
	})
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
			query: {name: 'John', age: {$gt: 30}, alive: true},
		}),
		collect(() => {
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo?name=John&age[%24gt]=30&alive=y',
					timeout: 10000,
				},
				{
					t: 'fetching',
					url: 'https://foo?name=John&age[%24gt]=30&alive=y',
					opts: {
						method: 'GET',
						headers: {
							'X-Client': 'js-1',
							'Accept-Version': 1,
						},
						body: undefined,
					},
				},
				{t: 'response', status: 200, statusText: 'OK'},
				'reader acquired',
				'reading',
				'reading',
				'end of response',
				'closing stream',
				'reader cancelled',
			])
		})
	)
})

test('sending data', (t) => {
	t.plan(1)
	const logs = []
	const request = create({
		fetch: createFetch({log: (l) => logs.push(l)}),
	})
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
			data: {name: 'John', age: {$gt: 30}, alive: true},
		}),
		collect(() => {
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'POST',
					url: 'https://foo',
					timeout: 10000,
				},
				{
					t: 'fetching',
					url: 'https://foo',
					opts: {
						method: 'POST',
						headers: {
							'X-Client': 'js-1',
							'Content-Type': 'application/json',
							'Accept-Version': 1,
						},
						body: '{"name":"John","age":{"$gt":30},"alive":true}',
					},
				},
				{t: 'response', status: 200, statusText: 'OK'},
				'reader acquired',
				'reading',
				'reading',
				'end of response',
				'closing stream',
				'reader cancelled',
			])
		})
	)
})

test('overwrite "clock"', (t) => {
	t.plan(1)
	const logs = []
	const clock = createClock((l) => logs.push(l))
	const request = create({
		fetch: createFetch({log: (l) => logs.push(l)}),
	})
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			clock,
			version: 1,
		}),
		collect(() => {
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 10000,
				},
				{
					t: 'fetching',
					url: 'https://foo',
					opts: {
						method: 'GET',
						headers: {
							'X-Client': 'js-1',
							'Accept-Version': 1,
						},
						body: undefined,
					},
				},
				{t: 'setTimeout', ms: 10000, n: 1},
				{t: 'response', status: 200, statusText: 'OK'},
				'reader acquired',
				'reading',
				'reading',
				'end of response',
				'closing stream',
				{t: 'clearTimeout', n: 1, cleared: true},
				'reader cancelled',
			])
		})
	)
})

test('default timeout is scheduled', (t) => {
	t.plan(1)
	const logs = []
	const clock = createClock((l) => logs.push(l))
	const request = create({
		fetch: createFetch({log: (l) => logs.push(l)}),
		clock,
	})
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		}),
		collect(() => {
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 10000,
				},
				{
					t: 'fetching',
					url: 'https://foo',
					opts: {
						method: 'GET',
						headers: {
							'X-Client': 'js-1',
							'Accept-Version': 1,
						},
						body: undefined,
					},
				},
				{t: 'setTimeout', ms: 10000, n: 1},
				{t: 'response', status: 200, statusText: 'OK'},
				'reader acquired',
				'reading',
				'reading',
				'end of response',
				'closing stream',
				{t: 'clearTimeout', n: 1, cleared: true},
				'reader cancelled',
			])
		})
	)
})

test('timeout can be overwritten on factory level', (t) => {
	t.plan(1)
	const logs = []
	const clock = createClock((l) => logs.push(l))
	const request = create({
		fetch: createFetch({log: (l) => logs.push(l)}),
		clock,
		timeout: 5000,
	})
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		}),
		collect(() => {
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 5000,
				},
				{
					t: 'fetching',
					url: 'https://foo',
					opts: {
						method: 'GET',
						headers: {
							'X-Client': 'js-1',
							'Accept-Version': 1,
						},
						body: undefined,
					},
				},
				{t: 'setTimeout', ms: 5000, n: 1},
				{t: 'response', status: 200, statusText: 'OK'},
				'reader acquired',
				'reading',
				'reading',
				'end of response',
				'closing stream',
				{t: 'clearTimeout', n: 1, cleared: true},
				'reader cancelled',
			])
		})
	)
})

test('timeout can be overwritten per request', (t) => {
	t.plan(1)
	const logs = []
	const clock = createClock((l) => logs.push(l))
	const request = create({
		fetch: createFetch({log: (l) => logs.push(l)}),
		clock,
		timeout: 7000,
	})
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			timeout: 5000,
			version: 1,
		}),
		collect(() => {
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 5000,
				},
				{
					t: 'fetching',
					url: 'https://foo',
					opts: {
						method: 'GET',
						headers: {
							'X-Client': 'js-1',
							'Accept-Version': 1,
						},
						body: undefined,
					},
				},
				{t: 'setTimeout', ms: 5000, n: 1},
				{t: 'response', status: 200, statusText: 'OK'},
				'reader acquired',
				'reading',
				'reading',
				'end of response',
				'closing stream',
				{t: 'clearTimeout', n: 1, cleared: true},
				'reader cancelled',
			])
		})
	)
})

test('timeout ends request', (t) => {
	t.plan(5)
	const logs = []
	const clock = createClock((l) => logs.push(l))
	const request = create({
		fetch: () => new Promise(() => undefined),
		clock,
	})
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		}),
		collect((err) => {
			t.equal(clock.now(), 10001)
			t.ok(err instanceof request.TimeoutError)
			t.equal(err.message, 'Request timed out after 10 seconds.')
			t.equal(err.timeout, 10000)
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 10000,
				},
				{t: 'setTimeout', ms: 10000, n: 1},
				{t: 'running timer', n: 1},
				{t: 'aborted', abort: err},
				{t: 'clearTimeout', n: 1, cleared: false},
			])
		})
	)
	clock.increase(10000)
})

test('timeout during reading ends request', (t) => {
	t.plan(1)
	const logs = []
	const clock = createClock((l) => logs.push(l))
	const request = create({
		fetch: createFetch({
			log: (l) => logs.push(l),
			onRead: () => new Promise(() => undefined),
		}),
		clock,
	})
	pull(
		request('foo', {
			log: (l) => logs.push(l),
			version: 1,
		}),
		collect((err) => {
			t.deepEqual(logs, [
				{
					t: 'request',
					method: 'GET',
					url: 'https://foo',
					timeout: 10000,
				},
				{
					t: 'fetching',
					url: 'https://foo',
					opts: {
						method: 'GET',
						headers: {'X-Client': 'js-1', 'Accept-Version': 1},
						body: undefined,
					},
				},
				{t: 'setTimeout', ms: 10000, n: 1},
				{t: 'response', status: 200, statusText: 'OK'},
				'reader acquired',
				'reading',
				{t: 'running timer', n: 1},
				{t: 'aborted', abort: err},
				{t: 'clearTimeout', n: 1, cleared: false},
				'reader cancelled',
			])
		})
	)
	clock.increase(10000)
})

test('timeout errors reject promises returned by .first', (t) => {
	t.plan(2)
	const logs = []
	const clock = createClock((l) => logs.push(l))
	const request = create({
		fetch: () => new Promise(() => undefined),
		clock,
	})
	request('foo', {
		log: (l) => logs.push(l),
		version: 1,
	})
		.first()
		.catch((err) => {
			t.equal(clock.now(), 10001)
			t.ok(err instanceof request.TimeoutError)
		})
	clock.increase(10000)
})

test('timeout errors reject promises returned by .toArray', (t) => {
	t.plan(2)
	const logs = []
	const clock = createClock((l) => logs.push(l))
	const request = create({
		fetch: () => new Promise(() => undefined),
		clock,
	})
	request('foo', {
		log: (l) => logs.push(l),
		version: 1,
	})
		.toArray()
		.catch((err) => {
			t.equal(clock.now(), 10001)
			t.ok(err instanceof request.TimeoutError)
		})
	clock.increase(10000)
})

test('timeout errors reject promises returned by .forEach', (t) => {
	t.plan(2)
	const logs = []
	const clock = createClock((l) => logs.push(l))
	const request = create({
		fetch: () => new Promise(() => undefined),
		clock,
	})
	request('foo', {
		log: (l) => logs.push(l),
		version: 1,
	})
		.forEach(() => {})
		.catch((err) => {
			t.equal(clock.now(), 10001)
			t.ok(err instanceof request.TimeoutError)
		})
	clock.increase(10000)
})

function createClock(log, start = 1) {
	let now = start
	let n = 1
	const timeouts = new Set()

	return {
		now: () => now,
		setTimeout,
		clearTimeout,
		increase,
	}

	function setTimeout(fn, ms) {
		const timer = {fn, timeout: now + ms, n: n++}
		log({t: 'setTimeout', ms, n: timer.n})
		timeouts.add(timer)
		return timer
	}

	function clearTimeout(timer) {
		log({t: 'clearTimeout', n: timer.n, cleared: timeouts.has(timer)})
		timeouts.delete(timer)
	}

	function increase(ms) {
		setImmediate(() => {
			const future = now + ms
			if (
				timeouts.size === 0 ||
				[...timeouts].every(({timeout}) => timeout > future)
			) {
				now = future
			} else {
				const smallest = [...timeouts].reduce((a, b) =>
					b.timeout < a.timeout ? b : a
				)
				log({t: 'running timer', n: smallest.n})
				now = smallest.timeout
				timeouts.delete(smallest)
				smallest.fn()
				increase(future - smallest.timeout)
			}
		})
	}
}

function createFetch(opts = {}) {
	const {
		log = () => {},
		status = 200,
		statusText = 'OK',
		chunks = [{foo: 'bar'}],
		onRead,
		onCancel = () => {},
	} = opts
	const headers =
		opts.headers || new Map([['content-type', 'application/json']])
	return (url, opts) => {
		log({t: 'fetching', url, opts})
		return Promise.resolve(
			createResponse({
				log,
				status,
				statusText,
				headers,
				chunks,
				onRead,
				onCancel,
			})
		)
	}
}

function createResponse({log, status, statusText, headers, chunks, onRead}) {
	return {
		status,
		statusText,
		headers,
		body: {
			getReader: () => createReader({log, chunks, onRead}),
		},
		json: () => Promise.resolve(chunks[0]),
	}
}

function createReader({log, chunks, onRead}) {
	log('reader acquired')
	const encoder = new TextEncoder()

	return {
		cancel: () => {
			log('reader cancelled')
		},
		read,
	}

	function read() {
		log('reading')
		if (onRead !== undefined) {
			return onRead()
		} else {
			return new Promise((resolve, reject) =>
				resolve(
					chunks.length > 0
						? {
								value: encoder.encode(
									JSON.stringify(chunks.shift()) + '\n'
								),
								done: false,
						  }
						: {done: true}
				)
			)
		}
	}
}
