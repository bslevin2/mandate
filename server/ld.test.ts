import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { ldWriteConfigured, setDecisionerLiveFlag } from './ld.ts'

const WRITE_ENV = {
  LD_API_TOKEN: 'api-test-token',
  LD_PROJECT_KEY: 'default',
  LD_ENVIRONMENT_KEY: 'test',
}

describe('setDecisionerLiveFlag', () => {
  beforeEach(() => {
    Object.assign(process.env, WRITE_ENV)
  })

  afterEach(() => {
    mock.restoreAll()
    for (const key of Object.keys(WRITE_ENV)) delete process.env[key]
  })

  it('skips the write without credentials', async () => {
    delete process.env.LD_ENVIRONMENT_KEY
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      Response.json({}),
    )
    assert.equal(ldWriteConfigured(), false)
    assert.deepEqual(await setDecisionerLiveFlag(false), {
      ok: false,
      skipped: true,
    })
    assert.equal(fetchMock.mock.callCount(), 0)
  })

  it('turns targeting off with a semantic patch on stop', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      Response.json({}),
    )
    assert.deepEqual(await setDecisionerLiveFlag(false), { ok: true })

    const [url, init] = fetchMock.mock.calls[0].arguments
    assert.equal(
      url,
      'https://app.launchdarkly.com/api/v2/flags/default/decisioner.live',
    )
    assert.equal(init?.method, 'PATCH')
    const headers = init?.headers as Record<string, string>
    assert.equal(headers.Authorization, 'api-test-token')
    assert.equal(
      headers['Content-Type'],
      'application/json; domain-model=launchdarkly.semanticpatch',
    )
    const body = JSON.parse(String(init?.body))
    assert.equal(body.environmentKey, 'test')
    assert.deepEqual(body.instructions, [{ kind: 'turnFlagOff' }])
  })

  it('turns targeting on to resume', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      Response.json({}),
    )
    assert.deepEqual(await setDecisionerLiveFlag(true), { ok: true })
    const body = JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body))
    assert.deepEqual(body.instructions, [{ kind: 'turnFlagOn' }])
  })

  it('reports the API error message', async () => {
    mock.method(globalThis, 'fetch', async () =>
      Response.json(
        { code: 'unauthorized', message: 'Invalid access token' },
        { status: 401 },
      ),
    )
    assert.deepEqual(await setDecisionerLiveFlag(false), {
      ok: false,
      error: 'HTTP 401: Invalid access token',
    })
  })

  it('reports network failures', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch failed')
    })
    assert.deepEqual(await setDecisionerLiveFlag(true), {
      ok: false,
      error: 'fetch failed',
    })
  })
})
