// npm contract commands select one endpoint for the entire Forge run, keeping
// simulation, nonce handling, and broadcasting on the same node.
const { spawnSync } = require('node:child_process')
const { getRpcUrls } = require('./config')

const args = process.argv.slice(2)
const chainIndex = args.indexOf('--chain-id')
if (chainIndex < 0) throw new Error('Forge RPC wrapper requires --chain-id')
const urls = getRpcUrls(Number(args[chainIndex + 1]), process.env)
const url = urls[Math.floor(Math.random() * urls.length)]
const result = spawnSync('forge', [...args, '--rpc-url', url], { stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
