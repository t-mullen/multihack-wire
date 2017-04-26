// The streaming binary wire protocol for Multihack
// Why? Because JSON/msgpack/schemapack/protobuf/anything weren't fast enough with chunking.
// For large and/or rapid sequential file transfer over ws/webrtc

var Duplex = require('readable-stream').Duplex
var Buffer = require('safe-buffer').Buffer
var inherits = require('inherits')

inherits(Wire, Duplex)

var MESSAGE_PROTOCOL = Buffer.from('\u0013MultiHack protocol')
var MESSAGE_YJS = 0

function Wire (opts) {
  if (!(this instanceof Wire)) return new Wire(opts)

  Duplex.call(this)

  this._sentProtocol = false

  this._buffer = [] // stores incomplete message
  this._bufferSize = 0 // size of above buffer

  // number of bytes the next parsing function is waiting on
  this._parseSize = MESSAGE_PROTOCOL.length
  this._parseState = 0 // just use a state for linear parsing trees
  this._parseObj = {} // the output parsing object

   // the function that will handle parsing (changes)
  this._parse = this._parseProtocol

  this.destroyed = false
  this._finished = false
  this.on('finish', this._onFinish)
}

Wire.prototype.destroy = function () {
  if (this.destroyed) return

  this.destroyed = true
  this._onFinish()
  this.emit('close')
  this.end()

  this._buffer = null
  this._bufferSize = null
  this._parseSize = null
  this._parseState = null
  this._parseObj = null
  this._parse = null
}


/*
<MESSAGE_YJS>
<message length><message>
*/
Wire.prototype.yjs = function (message) {
  var i = 0
  var payload = JSON.stringify(message)
  var buf = Buffer.alloc(8 + 32 + payload.length)

  buf.writeInt8(MESSAGE_YJS)

  buf.writeInt32LE(payload.length, i += 8)
  buf.write(payload, i += 32)

  this._push(buf)
}


Wire.prototype._push = function (chunk) {
  if (this._finished) return
  if (!this._sentProtocol) {
    this.push(MESSAGE_PROTOCOL)
    this._sentProtocol = true
  }
  this.push(chunk)
}

Wire.prototype._read = function () {}

Wire.prototype._write = function (chunk, enc, next) {
  this._bufferSize += chunk.length
  this._buffer.push(chunk)

  // while we have enough bytes
  while (this._bufferSize >= this._parseSize) {
    // save a concat if there's only one sub-buffer
    var buffer
    if (this._buffer.length === 1) {
      buffer = this._buffer[0] // saves a concat
    } else {
      buffer = Buffer.concat(this._buffer)
    }

    this._bufferSize -= this._parseSize // parser ate some bytes

    // calculate remaining buffer
    if (this._bufferSize) { // if there is more buffer
      this._buffer = [buffer.slice(this._parseSize)]
    } else {
      this._buffer = []
    }

    this._parse(buffer.slice(0, this._parseSize)) // parse the data
  }

  next(null) // out of data, get more
}

// initial protocol handshake
Wire.prototype._parseProtocol = function (chunk) {
  if (Buffer.compare(chunk, MESSAGE_PROTOCOL) !== 0) throw new Error('Invalid PROTOCOL')
  this._nextMessage()
}

// parse a message header
Wire.prototype._parseMessage = function (chunk) {
  switch (chunk[0]) {
    case MESSAGE_YJS:
      this._parse = this._parseYjs
      this._parseSize = 32
      break
  }
}

/*
<MESSAGE_YJS>
<message length><message>
*/
Wire.prototype._parseYjs = function (chunk) {
  switch (this._parseState) {
    case 0: // message length
      this._parseSize = chunk.readInt32LE(0)
      this._parseState = 1
      break
    case 1: // message
      // HACK: Why is chunk.toString().length < chunk.length???
      try {
        this._parseObj = JSON.parse(chunk.toString())
      } catch (err) {
        this._parseObj = JSON.parse(chunk.toString()+'"}')
      }
      this.emit('yjs', this._parseObj)
      this._nextMessage()
      break
  }
}

// cleans up for next message
Wire.prototype._nextMessage = function () {
  this._parseObj = {}
  this._parseState = 0
  this._parseSize = 8
  this._parse = this._parseMessage
}

Wire.prototype._onFinish = function () {
  this._finished = true

  this.push(null) // prevent new writes
  while (this.read()) {} // consume remaining data
}

module.exports = Wire
