var test = require('tape')
var Wire = require('./../src/index')

test('test send/receive', function (t) {
  t.plan(2)

  var w1 = new Wire()
  var w2 = new Wire()


  w2.pipe(w1).pipe(w2)

  w1.on('yjs', function () {
    t.pass('got w1 message')
    w1.yjs('content')
  })
  w2.on('yjs', function () {
    t.pass('got w2 message')
  })

  w2.yjs({})
})

test('rapid changes', { timeout: 6000 }, function (t) {
  var w1 = new Wire()
  var w2 = new Wire()

  w2.pipe(w1).pipe(w2)

  w1.on('yjs', function (data) {
    t.equal(data, 'hello world')
  })
  w2.on('yjs', function (data) {
    t.equal(data.x.y, 1)

    count++
    if (count >= 100) {
      clearTimeout(loop)
      w1.destroy()
      w2.destroy()
      t.end()
    }
  })

  var count = 0
  function loop () {
    w1.yjs({
      x: {
        y: 1
      }
    })
    w2.yjs('hello world')
  }

  setInterval(loop, 1)
})

test('large data', function (t) {
  t.plan(1)

  var w1 = new Wire()
  var w2 = new Wire()

  w2.pipe(w1).pipe(w2)

  var payload = (new Array(100000)).join('wow')

  w2.on('yjs', function (data) {
    t.equal(data, payload)
  })

  w1.yjs(payload)
})

test('SUMMARY', function (t) {
  t.end()
  process.exit(0)
})
