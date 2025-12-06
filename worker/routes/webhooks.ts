/**
 * Webhook Routes for KV Manager
 * 
 * CRUD operations for webhook configuration.
 */

import type { Env, APIResponse, Webhook, WebhookTestResult } from '../types'
import { logError } from '../utils/error-logger'

/**
 * Input type for creating/updating webhooks
 */
interface WebhookBody {
  name?: string
  url?: string
  secret?: string | null
  events?: string[]
  enabled?: boolean
}
import type { CorsHeaders } from '../utils/cors'
import { sendWebhook } from '../utils/webhooks'

/**
 * Generate a unique webhook ID
 */
function generateWebhookId(): string {
  return `whk_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Generate current ISO timestamp
 */
function nowISO(): string {
  return new Date().toISOString()
}

/**
 * Mock webhooks for local development
 */
const MOCK_WEBHOOKS: Webhook[] = [
  {
    id: 'whk_mock1',
    name: 'Slack Notifications',
    url: 'https://hooks.slack.com/services/xxx/yyy/zzz',
    secret: null,
    events: JSON.stringify(['job_failed', 'backup_complete']),
    enabled: 1,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
]

export async function handleWebhookRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  _userEmail: string
): Promise<Response | null> {
  const method = request.method
  const path = url.pathname

  // GET /api/webhooks - List all webhooks
  if (method === 'GET' && path === '/api/webhooks') {
    return listWebhooks(env, corsHeaders, isLocalDev)
  }

  // POST /api/webhooks - Create webhook
  if (method === 'POST' && path === '/api/webhooks') {
    return createWebhook(request, env, corsHeaders, isLocalDev)
  }

  // GET /api/webhooks/:id - Get single webhook
  const singleMatch = /^\/api\/webhooks\/([^/]+)$/.exec(path)
  if (method === 'GET' && singleMatch) {
    const webhookId = singleMatch[1]
    if (!webhookId) {
      return jsonResponse({ success: false, error: 'Webhook ID required' }, corsHeaders, 400)
    }
    return getWebhook(webhookId, env, corsHeaders, isLocalDev)
  }

  // PUT /api/webhooks/:id - Update webhook
  if (method === 'PUT' && singleMatch) {
    const webhookId = singleMatch[1]
    if (!webhookId) {
      return jsonResponse({ success: false, error: 'Webhook ID required' }, corsHeaders, 400)
    }
    return updateWebhook(webhookId, request, env, corsHeaders, isLocalDev)
  }

  // DELETE /api/webhooks/:id - Delete webhook
  if (method === 'DELETE' && singleMatch) {
    const webhookId = singleMatch[1]
    if (!webhookId) {
      return jsonResponse({ success: false, error: 'Webhook ID required' }, corsHeaders, 400)
    }
    return deleteWebhook(webhookId, env, corsHeaders, isLocalDev)
  }

  // POST /api/webhooks/:id/test - Test webhook
  const testMatch = /^\/api\/webhooks\/([^/]+)\/test$/.exec(path)
  if (method === 'POST' && testMatch) {
    const webhookId = testMatch[1]
    if (!webhookId) {
      return jsonResponse({ success: false, error: 'Webhook ID required' }, corsHeaders, 400)
    }
    return testWebhook(webhookId, env, corsHeaders, isLocalDev)
  }

  // Route not matched
  return null
}

/**
 * JSON response helper
 */
function jsonResponse(data: APIResponse | Record<string, unknown>, corsHeaders: CorsHeaders, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

/**
 * List all webhooks
 */
async function listWebhooks(
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  if (isLocalDev) {
    return jsonResponse({ success: true, result: { webhooks: MOCK_WEBHOOKS } }, corsHeaders)
  }

  try {
    const result = await env.METADATA.prepare(
      'SELECT * FROM webhooks ORDER BY created_at DESC'
    ).all<Webhook>()

    return jsonResponse({ success: true, result: { webhooks: result.results } }, corsHeaders)
  } catch (error) {
    void logError(env, error instanceof Error ? error : String(error), {
      module: 'webhooks',
      operation: 'list'
    }, isLocalDev)
    
    // Check for missing table error
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('no such table')) {
      return jsonResponse({
        success: false,
        error: 'Webhooks table not found. Run: wrangler d1 execute YOUR_DATABASE_NAME --remote --file=worker/migrations/apply_all_migrations.sql',
      }, corsHeaders, 500)
    }
    
    return jsonResponse({ success: false, error: 'Failed to list webhooks' }, corsHeaders, 500)
  }
}

/**
 * Get a single webhook
 */
async function getWebhook(
  webhookId: string,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  if (isLocalDev) {
    const webhook = MOCK_WEBHOOKS.find((w) => w.id === webhookId)
    if (!webhook) {
      return jsonResponse({ success: false, error: 'Webhook not found' }, corsHeaders, 404)
    }
    return jsonResponse({ success: true, result: { webhook } }, corsHeaders)
  }

  try {
    const webhook = await env.METADATA.prepare(
      'SELECT * FROM webhooks WHERE id = ?'
    ).bind(webhookId).first<Webhook>()

    if (!webhook) {
      return jsonResponse({ success: false, error: 'Webhook not found' }, corsHeaders, 404)
    }

    return jsonResponse({ success: true, result: { webhook } }, corsHeaders)
  } catch (error) {
    void logError(env, error instanceof Error ? error : String(error), {
      module: 'webhooks',
      operation: 'get'
    }, isLocalDev)
    return jsonResponse({ success: false, error: 'Failed to get webhook' }, corsHeaders, 500)
  }
}

/**
 * Create a new webhook
 */
async function createWebhook(
  request: Request,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  try {
    const body: WebhookBody = await request.json()

    // Validate required fields
    if (!body.name || !body.url || !body.events || body.events.length === 0) {
      return jsonResponse({ success: false, error: 'Name, URL, and at least one event are required' }, corsHeaders, 400)
    }

    // Validate URL format
    try {
      new URL(body.url)
    } catch {
      return jsonResponse({ success: false, error: 'Invalid URL format' }, corsHeaders, 400)
    }

    const webhookId = generateWebhookId()
    const now = nowISO()

    if (isLocalDev) {
      const newWebhook: Webhook = {
        id: webhookId,
        name: body.name,
        url: body.url,
        secret: body.secret ?? null,
        events: JSON.stringify(body.events),
        enabled: body.enabled ? 1 : 0,
        created_at: now,
        updated_at: now,
      }
      MOCK_WEBHOOKS.push(newWebhook)
      return jsonResponse({ success: true, result: { webhook: newWebhook } }, corsHeaders, 201)
    }

    await env.METADATA.prepare(
      `INSERT INTO webhooks (id, name, url, secret, events, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      webhookId,
      body.name,
      body.url,
      body.secret ?? null,
      JSON.stringify(body.events),
      body.enabled ? 1 : 0,
      now,
      now
    ).run()

    const webhook = await env.METADATA.prepare(
      'SELECT * FROM webhooks WHERE id = ?'
    ).bind(webhookId).first<Webhook>()

    return jsonResponse({ success: true, result: { webhook } }, corsHeaders, 201)
  } catch (error) {
    void logError(env, error instanceof Error ? error : String(error), {
      module: 'webhooks',
      operation: 'create'
    }, isLocalDev)
    return jsonResponse({ success: false, error: 'Failed to create webhook' }, corsHeaders, 500)
  }
}

/**
 * Update an existing webhook
 */
async function updateWebhook(
  webhookId: string,
  request: Request,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  try {
    const body: WebhookBody = await request.json()
    const now = nowISO()

    if (isLocalDev) {
      const index = MOCK_WEBHOOKS.findIndex((w) => w.id === webhookId)
      if (index === -1) {
        return jsonResponse({ success: false, error: 'Webhook not found' }, corsHeaders, 404)
      }
      const existing = MOCK_WEBHOOKS[index]
      if (existing) {
        MOCK_WEBHOOKS[index] = {
          ...existing,
          name: body.name ?? existing.name,
          url: body.url ?? existing.url,
          secret: body.secret !== undefined ? (body.secret ?? null) : existing.secret,
          events: body.events ? JSON.stringify(body.events) : existing.events,
          enabled: body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
          updated_at: now,
        }
        return jsonResponse({ success: true, result: { webhook: MOCK_WEBHOOKS[index] } }, corsHeaders)
      }
    }

    // Build dynamic update query
    const updates: string[] = []
    const values: (string | number | null)[] = []

    if (body.name !== undefined) {
      updates.push('name = ?')
      values.push(body.name)
    }
    if (body.url !== undefined) {
      updates.push('url = ?')
      values.push(body.url)
    }
    if (body.secret !== undefined) {
      updates.push('secret = ?')
      values.push(body.secret ?? null)
    }
    if (body.events !== undefined) {
      updates.push('events = ?')
      values.push(JSON.stringify(body.events))
    }
    if (body.enabled !== undefined) {
      updates.push('enabled = ?')
      values.push(body.enabled ? 1 : 0)
    }

    if (updates.length === 0) {
      return jsonResponse({ success: false, error: 'No fields to update' }, corsHeaders, 400)
    }

    updates.push('updated_at = ?')
    values.push(now)
    values.push(webhookId)

    await env.METADATA.prepare(
      `UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()

    const webhook = await env.METADATA.prepare(
      'SELECT * FROM webhooks WHERE id = ?'
    ).bind(webhookId).first<Webhook>()

    if (!webhook) {
      return jsonResponse({ success: false, error: 'Webhook not found' }, corsHeaders, 404)
    }

    return jsonResponse({ success: true, result: { webhook } }, corsHeaders)
  } catch (error) {
    void logError(env, error instanceof Error ? error : String(error), {
      module: 'webhooks',
      operation: 'update'
    }, isLocalDev)
    return jsonResponse({ success: false, error: 'Failed to update webhook' }, corsHeaders, 500)
  }
}

/**
 * Delete a webhook
 */
async function deleteWebhook(
  webhookId: string,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  if (isLocalDev) {
    const index = MOCK_WEBHOOKS.findIndex((w) => w.id === webhookId)
    if (index === -1) {
      return jsonResponse({ success: false, error: 'Webhook not found' }, corsHeaders, 404)
    }
    MOCK_WEBHOOKS.splice(index, 1)
    return jsonResponse({ success: true, result: { deleted: true } }, corsHeaders)
  }

  try {
    const existing = await env.METADATA.prepare(
      'SELECT id FROM webhooks WHERE id = ?'
    ).bind(webhookId).first()

    if (!existing) {
      return jsonResponse({ success: false, error: 'Webhook not found' }, corsHeaders, 404)
    }

    await env.METADATA.prepare(
      'DELETE FROM webhooks WHERE id = ?'
    ).bind(webhookId).run()

    return jsonResponse({ success: true, result: { deleted: true } }, corsHeaders)
  } catch (error) {
    void logError(env, error instanceof Error ? error : String(error), {
      module: 'webhooks',
      operation: 'delete'
    }, isLocalDev)
    return jsonResponse({ success: false, error: 'Failed to delete webhook' }, corsHeaders, 500)
  }
}

/**
 * Test a webhook by sending a test payload
 */
async function testWebhook(
  webhookId: string,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  if (isLocalDev) {
    const webhook = MOCK_WEBHOOKS.find((w) => w.id === webhookId)
    if (!webhook) {
      return jsonResponse({ success: false, error: 'Webhook not found' }, corsHeaders, 404)
    }
    // Simulate successful test in local dev
    const testResult: WebhookTestResult = {
      success: true,
      statusCode: 200,
      statusText: 'OK (mock)',
      responseBody: 'Test successful (mock)',
    }
    return jsonResponse({ success: true, result: testResult }, corsHeaders)
  }

  try {
    const webhook = await env.METADATA.prepare(
      'SELECT * FROM webhooks WHERE id = ?'
    ).bind(webhookId).first<Webhook>()

    if (!webhook) {
      return jsonResponse({ success: false, error: 'Webhook not found' }, corsHeaders, 404)
    }

    const testData = {
      test: true,
      message: 'This is a test webhook from KV Manager',
      timestamp: nowISO(),
    }

    const result = await sendWebhook(webhook, 'batch_complete', testData)

    const testResult: WebhookTestResult = result.success
      ? {
          success: true,
          statusCode: result.statusCode ?? 0,
          statusText: 'OK',
        }
      : {
          success: false,
          statusText: 'Failed',
          error: result.error ?? 'Unknown error',
        }

    return jsonResponse({ success: true, result: testResult }, corsHeaders)
  } catch (error) {
    void logError(env, error instanceof Error ? error : String(error), {
      module: 'webhooks',
      operation: 'test'
    }, isLocalDev)
    const testResult: WebhookTestResult = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
    return jsonResponse({ success: true, result: testResult }, corsHeaders)
  }
}
