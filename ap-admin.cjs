/*
 * Administrator seeding and rotation for Activepieces on Railway.
 *
 * Upstream has no non-interactive way to create the first account, and no
 * password-reset route at all in the community edition, so the credential is
 * applied here: created through the app's own sign-up endpoint on first boot
 * (over an internal port the Railway edge does not route), and re-applied
 * directly against the identity row on every later boot.
 */
'use strict'

const { Client } = require('/usr/src/app/node_modules/pg')
const bcrypt = require('/usr/src/app/node_modules/bcrypt')

const SALT_ROUNDS = 10 // must match packages/server/api password-hasher

function dbConfig() {
  const url = process.env.AP_POSTGRES_URL
  const ssl =
    String(process.env.AP_POSTGRES_USE_SSL || '').toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : false
  if (url) {
    return { connectionString: url, ssl }
  }
  return {
    host: process.env.AP_POSTGRES_HOST,
    port: Number(process.env.AP_POSTGRES_PORT || 5432),
    user: process.env.AP_POSTGRES_USERNAME,
    password: process.env.AP_POSTGRES_PASSWORD,
    database: process.env.AP_POSTGRES_DATABASE,
    ssl,
  }
}

async function withClient(fn) {
  const client = new Client(dbConfig())
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForDatabase() {
  const deadline = Date.now() + 180000
  for (;;) {
    try {
      await withClient(async (client) => client.query('SELECT 1'))
      return
    } catch (error) {
      if (Date.now() > deadline) {
        throw new Error(`database never became reachable: ${error.message}`)
      }
      await sleep(2000)
    }
  }
}

// "seeded" once an account exists, otherwise "empty". A fresh database has no
// schema at all yet -- Activepieces runs its migrations at app start.
async function adminState() {
  return withClient(async (client) => {
    const table = await client.query(`SELECT to_regclass('public.user') AS t`)
    if (!table.rows[0].t) {
      return 'empty'
    }
    const count = await client.query('SELECT count(*)::int AS n FROM "user"')
    return count.rows[0].n > 0 ? 'seeded' : 'empty'
  })
}

async function httpJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: response.status, body }
}

async function waitForApi(base) {
  const deadline = Date.now() + 600000
  for (;;) {
    try {
      const { status } = await httpJson(`${base}/api/v1/flags`)
      if (status === 200) {
        return
      }
    } catch {
      // the server is not listening yet
    }
    if (Date.now() > deadline) {
      throw new Error('the API never came up on the internal seeding port')
    }
    await sleep(2000)
  }
}

async function seed(base) {
  const email = process.env.AP_ADMIN_EMAIL
  const password = process.env.AP_ADMIN_PASSWORD
  await waitForApi(base)
  const signUp = await httpJson(`${base}/api/v1/authentication/sign-up`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      firstName: process.env.AP_ADMIN_FIRST_NAME || 'Admin',
      lastName: process.env.AP_ADMIN_LAST_NAME || 'User',
      trackEvents: false,
      newsLetter: false,
    }),
  })
  if (signUp.status !== 200) {
    throw new Error(
      `sign-up for the administrator failed: ${signUp.status} ${JSON.stringify(
        signUp.body,
      )}`,
    )
  }
  console.log(`[ap-admin] administrator ${email} created`)
}

// Re-apply the credential to whoever owns the platform, so a redeploy is a
// working password reset and a changed AP_ADMIN_EMAIL moves the account.
async function rotate() {
  const email = process.env.AP_ADMIN_EMAIL
  const password = process.env.AP_ADMIN_PASSWORD
  const hash = await bcrypt.hash(password, SALT_ROUNDS)
  await withClient(async (client) => {
    const owner = await client.query(`
      SELECT identity.id AS identity_id, identity.email AS email
      FROM platform
      JOIN "user" AS platform_user ON platform_user.id = platform."ownerId"
      JOIN user_identity AS identity ON identity.id = platform_user."identityId"
      ORDER BY platform.created ASC
      LIMIT 1
    `)
    if (owner.rowCount === 0) {
      throw new Error('no platform owner found to rotate')
    }
    const { identity_id: identityId, email: currentEmail } = owner.rows[0]
    await client.query(
      `UPDATE user_identity
         SET password = $1, email = $2, verified = true, updated = now()
       WHERE id = $3`,
      [hash, email, identityId],
    )
    console.log(
      `[ap-admin] credential re-applied to the platform owner (${currentEmail} -> ${email})`,
    )
  })
}

async function assertSeeded() {
  const state = await adminState()
  if (state !== 'seeded') {
    throw new Error('the administrator was not created; refusing to open the public port')
  }
}

async function main() {
  const command = process.argv[2]
  switch (command) {
    case 'wait-db':
      await waitForDatabase()
      return
    case 'state':
      process.stdout.write(await adminState())
      return
    case 'seed':
      await seed(process.argv[3])
      return
    case 'rotate':
      await rotate()
      return
    case 'assert-seeded':
      await assertSeeded()
      return
    default:
      throw new Error(`unknown command: ${command}`)
  }
}

main().catch((error) => {
  console.error(`[ap-admin] ${error.message}`)
  process.exit(1)
})
