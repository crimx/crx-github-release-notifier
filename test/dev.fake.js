/**
 * Fake extension environment
 */

// import chrome from 'sinon-chrome'
import fetchMock from 'fetch-mock'
import faker from 'faker'
import moment from 'moment'
import _ from 'lodash'
import { extData } from '@/popup/file-type-icons'

const exts = Array.from(extData.keys())

function randInt (a, b) {
  a = _.isNumber(a) ? a : 0
  b = _.isNumber(b) ? b : 0
  if (a > b) {
    let t = a
    a = b
    b = t
  }
  return Math.floor(Math.random() * (b - a) + a)
}

// window.chrome = chrome

window.chrome = {
  storage: {
    local: {},
    sync: {},
    onChanged: {},
  },
  runtime: {
    onMessage: {},
  }
}

/**
 * fake storage
 */

const initRepos = Array.from(Array(randInt(8))).map(() => `${faker.name.firstName()}/${faker.random.word()}`)

const storage = {
  local: _.zipObject(initRepos, _.map(initRepos, name => {
    const version = `v${randInt(10)}.${randInt(30)}.${randInt(30)}`
    const date = moment.utc()
      .subtract(randInt(100), 'days')
      .subtract(randInt(11), 'months')
      .subtract(randInt(5), 'years')
    return {
      'name': name,
      'etag': `W/"${faker.random.alphaNumeric(32)}"`,
      'last_modified': date.format('ddd, DD MMM Y HH:mm:ss ') + 'GMT',
      'html_url': `https://github.com/${name}/releases/${version}`,
      'avatar_url': `https://avatars2.githubusercontent.com/u/${randInt(100000)}?v=4`,
      'published_at': date.toISOString(),
      'tag_name': version,
      'zipball_url': `https://api.github.com/repos/${name}/zipball/${version}`,
      'tarball_url': `https://api.github.com/repos/${name}/tarball/${version}`,
      'assets': Array.from(Array(randInt(6))).map(() => {
        const filename = `${faker.system.commonFileName().replace(/\..*$/, '')}.${exts[randInt(exts.length)]}`
        return {
          'browser_download_url': `https://github.com/${name}/releases/download/${version}/${filename}`,
          'name': filename,
        }
      })
    }
  })),
  sync: {
    repos: initRepos
  },
  listeners: []
}

chrome.storage.local.get = (keys, callback) => {
  keys = _.isString(keys) ? [keys] : _.map(keys)
  callback(_.zipObject(keys, _.map(keys, _.partial(_.get, storage.local, _, undefined))))
}

chrome.storage.sync.get = (keys, callback) => {
  keys = _.isString(keys) ? [keys] : _.map(keys)
  callback(_.zipObject(keys, _.map(keys, _.partial(_.get, storage.sync, _, undefined))))
}

chrome.storage.local.set = (items, callback = _.noop) => {
  console.assert(_.isObject(items))
  const oldLocal = storage.local
  storage.local = _.assign({}, storage.local, _.cloneDeep(items))
  const changed = _.flow([
    _.cloneDeep,
    _.toPairs,
    _.partial(_.map, _, ([k, v]) => [k, {newValue: v, oldValue: oldLocal[k]}]),
    _.fromPairs,
  ])(items)
  _.each(storage.listeners, listener => listener(changed, 'local'))
  callback()
}

chrome.storage.sync.set = (items, callback = _.noop) => {
  console.assert(_.isObject(items))
  const oldSync = storage.sync
  storage.sync = _.assign({}, storage.sync, _.cloneDeep(items))
  const changed = _.flow([
    _.cloneDeep,
    _.toPairs,
    _.partial(_.map, _, ([k, v]) => [k, {newValue: v, oldValue: oldSync[k]}]),
    _.fromPairs,
  ])(items)
  _.each(storage.listeners, listener => listener(changed, 'sync'))
  callback()
}

chrome.storage.onChanged.addListener = callback => {
  console.assert(_.isFunction(callback))
  storage.listeners.push(callback)
}

/**
 * Fake runtime messaging
 */

const msgListeners = []

chrome.runtime.sendMessage = (message, responseCallback = _.noop) => {
  console.assert(_.isObject(message))
  let isResponsed = false
  let isClosed = false
  let isAsync = false
  const cbWrap = (...args) => {
    if (isResponsed || isClosed) {
      return console.error('use deprecated channel')
    }
    responseCallback(...args)
    isResponsed = true
  }

  _.each(msgListeners, listener => {
    if (listener(message, {}, cbWrap)) {
      isAsync = true
    }
  })

  setTimeout(() => {
    if (!isAsync) {
      isClosed = true
    }
  }, 0)
}

chrome.runtime.onMessage.addListener = callback => {
  console.assert(_.isFunction(callback))
  msgListeners.push(callback)
}

/**
 * Mock Fetch
 */

fetchMock.mock({
  name: 'fetch release',
  matcher: /github\.com\/repos\//,
  response (url, {headers}) {
    return new Promise((resolve, reject) => {
      if (headers.etag && Math.random() > 0.3) {
        return resolve({body: '', status: 304})
      }
      if (Math.random() > 0.9) {
        return reject(new Error('net work error'))
      }
      setTimeout(() => {
        const name = url.match(/github\.com\/repos\/([^/]+\/[^/]+)/)[1]
        const version = `v${randInt(10)}.${randInt(30)}.${randInt(30)}`
        const date = moment.utc()
          .subtract(randInt(100), 'days')
          .subtract(randInt(11), 'months')
          .subtract(randInt(5), 'years')

        return resolve({
          headers: {
            'etag': `W/"${faker.random.alphaNumeric(32)}"`,
            'last_modified': date.format('ddd, DD MMM Y HH:mm:ss ') + 'GMT',
          },
          body: {
            'html_url': `https://github.com/${name}/releases/${version}`,
            'author': {
              'avatar_url': `https://avatars2.githubusercontent.com/u/${randInt(100000)}?v=4`,
            },
            'published_at': date.toISOString(),
            'tag_name': version,
            'zipball_url': `https://api.github.com/repos/${name}/zipball/${version}`,
            'tarball_url': `https://api.github.com/repos/${name}/tarball/${version}`,
            'assets': Array.from(Array(randInt(6))).map(() => {
              const filename = `${faker.system.commonFileName().replace(/\..*$/, '')}.${exts[randInt(exts.length)]}`
              return {
                'browser_download_url': `https://github.com/${name}/releases/download/${version}/${filename}`,
                'name': filename,
              }
            })
          }
        })
      }, randInt(5000))
    })
  }
})