var test = require('tape')
var Wire = require('./../src/index')

test('test send/receive', function (t) {
  t.plan(12)
  
  var w1 = new Wire()
  var w2 = new Wire()
  
  w2.pipe(w1).pipe(w2)
  
  w1.on('requestProject', function () {
    t.pass('got request project')
    w1.provideFile('test/test.js', 'content')
  })
  w2.on('requestProject', function () {
    t.pass('got request project')
    w2.provideFile('a/test.js', 'hello')
  })
  
  w1.on('provideFile', function (data) {
    t.equal(data.filePath, 'a/test.js')
    t.equal(data.content, 'hello')
    w1.deleteFile('test/test.js')
  })
  w2.on('provideFile', function (data) {
    t.equal(data.filePath, 'test/test.js')
    t.equal(data.content, 'content')
    w2.deleteFile('b/test.js') 
  })
  
  w1.on('deleteFile', function (data) {
    t.equal(data.filePath, 'b/test.js')
    w1.changeFile('test/test.js', {
      x: {
        z: 'wow'
      }
    })
  })
  w2.on('deleteFile', function (data) {
    t.equal(data.filePath, 'test/test.js')
    w2.changeFile('c/test.js', {
      y:1
    })
  })
  
  w1.on('changeFile', function (data) {
    t.equal(data.filePath, 'c/test.js')
    t.equal(data.change.y, 1)
  })
  w2.on('changeFile', function (data) {
    t.equal(data.filePath, 'test/test.js')
    t.equal(data.change.x.z, 'wow')
  })
  
  w1.requestProject()
  w2.requestProject()
})

test('rapid changes', { timeout: 6000 }, function (t){  
  var w1 = new Wire()
  var w2 = new Wire()
  
  w2.pipe(w1).pipe(w2)
  
  w1.on('changeFile', function (data) {
    t.equal(data.change.b, 'hello world')
  })
  w2.on('changeFile', function (data) {
    t.equal(data.change.x.y, 1)
    
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
    w1.changeFile('test/test.js', {
      x: {
        y: 1
      }
    })
    w2.changeFile('test/test.js', {
      b: 'hello world'
    })
  }
  
  setInterval(loop, 1)
})

test('large data', function (t) {
  t.plan(1)
  
  var w1 = new Wire()
  var w2 = new Wire()
  
  w2.pipe(w1).pipe(w2)
  
  var payload = (new Array(100000)).join('wow')
  
  w2.on('provideFile', function (data) {
    t.equal(data.content, payload)
  })
  
  w1.provideFile('path', payload)
})

test('SUMMARY', function (t) {
  t.end()
  process.exit(0)
})
