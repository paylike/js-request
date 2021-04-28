'use strict'

const parseJson = require('json-parse-safe')
const {pull} = require('pull-stream')
const drain = require('psp-drain')
const collect = require('psp-collect')
const stringify = require('http-querystring-stringify')

const clientId = `js-1`

class RateLimitError extends Error {
	constructor(retryAfter) {
		super(
			retryAfter
				? `Request got rate limited for ${retryAfter / 1000} seconds.`
				: `Request got rate limited.`
		)
		this.name = this.constructor.name
		this.retryAfter = retryAfter
	}
}

class TimeoutError extends Error {
	constructor(timeout) {
		super(`Request timed out after ${timeout / 1000} seconds.`)
		this.name = this.constructor.name
		this.timeout = timeout
	}
}

class ServerError extends Error {
	constructor(message, status, headers) {
		super(message)
		this.name = this.constructor.name
		this.status = status
		this.headers = headers
	}
}

class ResponseError extends Error {
	constructor({message, ...json}) {
		super(message)
		this.name = this.constructor.name
		Object.assign(this, json)
	}

	toString() {
		return `${this.message} (${this.code})`
	}
}

const errors = {
	RateLimitError,
	TimeoutError,
	ServerError,
	ResponseError,
}

module.exports = Object.assign(create, errors)

function create(defaults = {}) {
	const log = defaults.log || (() => undefined)
	const fetch = defaults.fetch || global.fetch
	const protocol = defaults.protocol || 'https'
	const timeout = Number.isInteger(defaults.timeout)
		? defaults.timeout
		: 10000
	const clock = {
		setTimeout: (...args) => setTimeout(...args),
		clearTimeout: (...args) => clearTimeout(...args),
		...defaults.clock,
	}
	return Object.assign(
		(endpoint, opts) =>
			request(endpoint, {
				log,
				clock,
				fetch,
				protocol,
				clientId,
				timeout,
				...opts,
			}),
		errors
	)
}

function request(
	endpoint,
	{log, clock, fetch, protocol, clientId, timeout, version, query, data}
) {
	if (typeof endpoint !== 'string') {
		throw new Error(
			`Unexpected first argument (endpoint), got "${typeof endpoint}" expected "string"`
		)
	}
	if (/^[a-zA-Z]+:\/\//.test(endpoint)) {
		throw new Error(
			`Do not add a protocol to the endpoint ("${protocol}://" is added automatically), got "${endpoint}"`
		)
	}
	if (typeof log !== 'function') {
		throw new Error(
			`Unexpected type of "log", got "${typeof log}" expected "function"`
		)
	}
	if (typeof fetch !== 'function') {
		throw new Error(
			`Unexpected type of "fetch", got "${typeof fetch}" expected "function"`
		)
	}
	if (!Number.isInteger(version) || version < 1) {
		throw new Error(
			`Unexpected "version", got "${version}" expected a positive integer`
		)
	}
	if (query === null) {
		throw new Error(
			`Unexpected value of "query", got "null" expected "object"`
		)
	}
	if (query !== undefined && typeof query !== 'object') {
		throw new Error(
			`Unexpected type of "query", got "${typeof query}" expected "object"`
		)
	}
	if (data === null) {
		throw new Error(
			`Unexpected value of "data", got "null" expected "object"`
		)
	}
	if (data !== undefined && typeof data !== 'object') {
		throw new Error(
			`Unexpected type of "data", got "${typeof data}" expected "object"`
		)
	}
	const method = data === undefined ? 'GET' : 'POST'
	const url = `${protocol}://${endpoint}${
		query !== undefined ? '?' + stringify(query) : ''
	}`

	log({t: 'request', method, url, timeout})
	const response = fetch(url, {
		method,
		headers: {
			'X-Client': clientId,
			'Accept-Version': version,
			...(data !== undefined
				? {'Content-Type': 'application/json'}
				: undefined),
		},
		body: data !== undefined ? JSON.stringify(data) : undefined,
	})
	let ended = null
	let queue = []
	let buffer = ''
	let timer
	let head
	let reader
	let decoder
	let cbp

	source.first = () => {
		let result
		return pull(
			source,
			drain((i) => {
				result = i
				return false
			})
		).then(() => result)
	}
	source.toArray = () => pull(source, collect())
	source.forEach = (fn) => pull(source, drain(fn))

	if (timeout > 0) {
		timer = clock.setTimeout(
			() => source(new TimeoutError(timeout), () => undefined),
			timeout
		)
	}

	return source

	function source(abort, cb) {
		if (ended) {
			cb(ended)
		} else if (abort) {
			if (abort === true) {
				log('closing stream')
			} else {
				log({t: 'aborted', abort})
			}
			ended = abort
			clock.clearTimeout(timer)
			if (reader !== undefined) {
				reader.cancel()
			}
			cbc()
			cb(ended)
		} else if (queue.length > 0) {
			const {error, value} = parseJson(queue.shift())
			if (error !== undefined) {
				source(error, cb)
			} else {
				cb(null, value)
			}
		} else if (reader !== undefined) {
			cbp = cb
			reader.read().then(
				({done, value}) => {
					if (done) {
						if (buffer !== '') {
							log({
								t: 'unexpected response end (no newline)',
								buffer,
							})
						}
						log('end of response')
						cbc(true)
					} else {
						const decoded =
							buffer + decoder.decode(value, {stream: true})
						const chunks = decoded.split('\n')
						buffer = chunks.pop()
						queue.push(...chunks)
						cbc()
					}
				},
				(err) => cbc(err)
			)
		} else if (head !== undefined) {
			const {status, statusText, headers} = head
			log({t: 'response', status, statusText})
			if (status === 204) {
				// "No Content"
				source(true, cb)
			} else if (status === 429) {
				// "Too Many Requests"
				const retryAfter = headers.get('retry-after')
				source(
					new RateLimitError(
						retryAfter ? retryAfter * 1000 : undefined
					),
					cb
				)
			} else if (status < 300) {
				reader = getReader(head.body)
				decoder = new TextDecoder()
				source(null, cb)
			} else if (headers.get('content-type')?.includes('json')) {
				cbp = cb
				head.json().then(
					(err) => cbc(new ResponseError(err)),
					(err) =>
						cbc(
							new ServerError(
								`Failed to parse JSON error: ${err}`
							)
						)
				)
			} else {
				source(
					new ServerError(`${status} ${statusText}`, status, headers),
					cb
				)
			}
		} else {
			cbp = cb
			response.then(
				(_head) => {
					head = _head
					cbc()
				},
				(err) => cbc(err)
			)
		}
	}

	function cbc(end = null) {
		if (cbp === undefined) return

		const _cb = cbp
		cbp = undefined
		source(end, _cb)
	}
}

function getReader(body) {
	if (body.getReader !== undefined) {
		return body.getReader()
	} else if (body[Symbol.asyncIterator]) {
		const it = body[Symbol.asyncIterator]()
		return {
			cancel: () => {
				if (body.destroy !== undefined) {
					// Node.js feature
					body.destroy()
				}
			},
			read: () => it.next(),
		}
	} else {
		throw new Error(
			'Unsupported type of fetch body (old Node.js or browser?)'
		)
	}
}
