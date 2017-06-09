/**
 * Created by nathan on 6/5/17.
 */
require('loadenv')()

const config = {}

module.exports = config
if (process.env.MONGO_REPLSET_NAME) {
  config.replicaset = {
    name: process.env.MONGO_REPLSET_NAME
  }
  const hosts = process.env.MONGO_HOSTS.split(',')
  config.replicaset.members = hosts.map(host => {
    const hostAndPort = host.split(':')
    return {
      host: hostAndPort[0],
      port: hostAndPort[1]
    }
  })
  config.db = process.env.MONGO_DB
  if (process.env.MONGO_AUTH) {
    const usernameAndPassword = process.env.MONGO_AUTH.split(':')
    config.password = usernameAndPassword[0]
    config.user = usernameAndPassword[1]
  }
} else {
  config.url = process.env.MONGO
}
